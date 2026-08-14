/**
 * IDENTITY CONSISTENCY — one authenticated person, one rendered identity.
 *
 * Production showed a coach account (Florian) whose Player Portal greeted a
 * DIFFERENT member ("Hi, Julien") while the account card said Florian, plus a
 * Messages badge stuck at 3 on every login. Three code paths conspired:
 *
 *   1. getPlayer() ended in `|| players[0]` and setView('player') picked
 *      `players[0].id` — the FIRST ROSTER PLAYER — whenever the stored
 *      selection didn't resolve. A coach with no player membership was
 *      silently handed somebody else's profile.
 *   2. state.selectedPlayerId and the legacy local inbox survived login,
 *      logout and even a server-cookie user change untouched, so one
 *      person's residue followed the next person on the same browser.
 *   3. The legacy inbox's unread flags could only be cleared by a button in a
 *      section the Beta UI hides — so its count ("3") re-badged forever.
 *
 * The rules pinned here: the authenticated session is the identity; a staff
 * preview counts only when the CURRENT user explicitly chose it; there is no
 * first-player fallback anywhere; identity-scoped caches die with the session
 * that owned them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let body = src.indexOf('{', i), depth = 0, end = body;
  for (let b = body; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  const isAsync = src.slice(Math.max(0, start - 6), start) === 'async ';
  return (isAsync ? 'async ' : '') + src.slice(start, end + 1);
}

const FLORIAN = { id: 'user_florian', role: 'coach',  name: 'Florian Wintjens', email: 'florian@club.test' };
const JULIEN  = { id: 'user_julien',  role: 'player', name: 'Julien Dupont',    email: 'julien@club.test' };
const ROSTER = [
  // Julien sorts FIRST — exactly the record the old fallback handed to Florian.
  { id: 'p-julien', userId: 'user_julien', name: 'Julien Dupont', email: 'julien@club.test', position: 'Prop' },
  { id: 'p-marc',   userId: 'user_marc',   name: 'Marc Petit',    email: 'marc@club.test',   position: 'Lock' },
];

/** Build a live identity context with controlled users/roster/state. */
function ctx({ currentUserId = 'user_florian', users = [FLORIAN, JULIEN], players = ROSTER, extra = {} } = {}) {
  const state = {
    currentUserId, users, players,
    selectedPlayerId: '', selectedPlayerOwnerId: '', selectedMessagePlayerId: '',
    selectedChatId: null, messages: [], activeView: 'coach', ...structuredClone(extra),
  };
  const calls = { toasts: [], saves: 0, renders: 0, unreadTotals: [] };
  const api = new Function(`
    const state = arguments[0];
    const calls = arguments[1];
    function showToast(m) { calls.toasts.push(m); }
    function saveState() { calls.saves++; }
    function render() { calls.renders++; }
    function canonicalVisiblePlayers() { return state.players; }
    function canonicalAccountForUserId(id) { return state.users.find(u => u.id === id) || null; }
    function resolveRosterMessagingId(p) { return p.userId || p.id; }
    function identityEmailKey(v = '') { return String(v || '').trim().toLowerCase(); }
    function canonicalIdentityNameKey(v = '') { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
    function isPermanentPlayerUserId(v = '') { return String(v || '').startsWith('user_'); }
    function resolveOperationalGroup() {}
    function allowedCoachSections(s) { return s; }
    function playerSectionsFor() { return [['home'],['availability'],['messages'],['week']]; }
    const EMPTY_PLAYER = { id: '', name: '—' };
    let _chatConversations = [{ id: 'dm:x', unread: 3 }];
    let _chatLastPoll = { 'dm:x': 1 };
    let _chatNavUnread = 3;
    function updateNavBadge() {}
    function chatSetUnreadTotal(total) { _chatNavUnread = Math.max(0, Number(total || 0)); calls.unreadTotals.push(_chatNavUnread); }
    ${fn('currentUser')}
    ${fn('isCoach')}
    ${fn('canonicalPlayerIdForUser')}
    ${fn('ownPlayerRecordForUser')}
    ${fn('staffPreviewPlayerId')}
    ${fn('getPlayer')}
    ${fn('setView')}
    ${fn('resetIdentityScopedState')}
    ${fn('setSection')}
    return { state, calls, getPlayer, setView, setSection, resetIdentityScopedState,
             ownPlayerRecordForUser, staffPreviewPlayerId,
             chatState: () => ({ conversations: _chatConversations, nav: _chatNavUnread, lastPoll: _chatLastPoll }) };
  `)(state, calls);
  return api;
}

// ── RULE 4/5 — NO FALLBACK TO SOMEBODY ELSE ───────────────────────────────
test('a coach with no player membership NEVER resolves another player', () => {
  const c = ctx();
  const p = c.getPlayer();
  assert.equal(p.id, '', 'the honest empty player');
  assert.notEqual(p.name, 'Julien Dupont', 'and definitely not Julien');
});

test('switching to Player view does not hand the coach the first roster player', () => {
  const c = ctx();
  c.setView('player');
  assert.equal(c.state.selectedPlayerId, '', 'no player auto-selected');
  assert.equal(c.getPlayer().id, '', 'portal renders the honest empty identity');
});

test('the first-player fallback is gone from the source', () => {
  assert.doesNotMatch(fn('getPlayer'), /players\[0\]/, 'getPlayer never indexes the roster');
  assert.doesNotMatch(fn('setView'), /players\[0\]/, 'setView never indexes the roster');
});

// ── RULE 6 — DUAL-ROLE RESOLVES TO THE SAME PERSON ────────────────────────
test('a dual-role coach resolves their OWN player record in Player view', () => {
  const c = ctx({ players: [...ROSTER,
    { id: 'p-florian', userId: 'user_florian', name: 'Florian Wintjens', email: 'florian@club.test', position: 'Fly-half' }] });
  c.setView('player');
  assert.equal(c.state.selectedPlayerId, 'p-florian', 'his own record, by exact identity key');
  assert.equal(c.getPlayer().name, 'Florian Wintjens');
});

test('own-record matching uses exact keys only — never name similarity or index', () => {
  const body = fn('ownPlayerRecordForUser');
  assert.doesNotMatch(body, /name/i, 'no display-name matching');
  assert.doesNotMatch(body, /\[0\]/, 'no positional pick');
  // An email match works when ids differ (roster row created before signup).
  const c = ctx({ players: [{ id: 'p-f2', userId: '', name: 'F W', email: 'florian@club.test' }] });
  assert.equal(c.ownPlayerRecordForUser(FLORIAN).id, 'p-f2');
  // A different person's record never matches.
  assert.equal(c.ownPlayerRecordForUser(JULIEN), null);
});

// ── PLAYER ACCOUNTS — unchanged, their own identity ───────────────────────
test('a player account still resolves its own canonical record', () => {
  const c = ctx({ currentUserId: 'user_julien' });
  assert.equal(c.getPlayer().id, 'p-julien');
  assert.equal(c.getPlayer().name, 'Julien Dupont');
});

// ── EXPLICIT PREVIEW — owned by the chooser, ignored otherwise ────────────
test('an explicit preview by the CURRENT user resolves that player', () => {
  const c = ctx();
  c.state.selectedPlayerId = 'p-marc';
  c.state.selectedPlayerOwnerId = 'user_florian';    // Florian chose it himself
  assert.equal(c.getPlayer().name, 'Marc Petit', 'explicit staff preview is allowed');
});

test('a STALE selection left by another account is residue, not a choice', () => {
  const c = ctx();
  c.state.selectedPlayerId = 'p-julien';
  c.state.selectedPlayerOwnerId = 'user_julien';     // Julien's login stamped it
  assert.equal(c.staffPreviewPlayerId(), '', 'not owned by Florian → ignored');
  assert.equal(c.getPlayer().id, '', 'no Julien');
});

test('a pre-stamp legacy selection (no owner recorded) is also ignored', () => {
  const c = ctx();
  c.state.selectedPlayerId = 'p-julien';
  c.state.selectedPlayerOwnerId = '';                // old build wrote no stamp
  assert.equal(c.getPlayer().id, '', 'deployed devices with old residue are safe');
});

// ── IDENTITY-SCOPED CACHE RESET ───────────────────────────────────────────
test('resetIdentityScopedState clears every per-person cache', () => {
  const c = ctx();
  c.state.selectedPlayerId = 'p-julien';
  c.state.selectedPlayerOwnerId = 'user_julien';
  c.state.messages = [{ id: 'm1', to: 'Coach', unread: true }];
  c.state.selectedChatId = 'dm:julien';
  c.resetIdentityScopedState();
  assert.equal(c.state.selectedPlayerId, '');
  assert.equal(c.state.selectedPlayerOwnerId, '');
  assert.deepEqual(c.state.messages, [], 'legacy inbox is per-person');
  assert.equal(c.state.selectedChatId, null);
  const chat = c.chatState();
  assert.deepEqual(chat.conversations, [], 'server-conversation cache dropped');
  assert.equal(chat.nav, 0, 'nav unread badge zeroed');
});

test('every login path and sign-out invalidates a different user\'s residue', () => {
  // Source pin: each adoption site guards with a user-change reset.
  const adoptions = src.match(/resetIdentityScopedState\(\)/g) || [];
  assert.ok(adoptions.length >= 6,
    `expected the reset wired into >=6 sites (logins, cookie adoption, sign-out); found ${adoptions.length}`);
  assert.match(src, /if \(cur && cur !== 'coach-demo'\) resetIdentityScopedState\(\);\s*\n\s*state\.currentUserId = sid;/,
    'the server cookie adoption is unconditional and purges the previous person');
});

test('the server cookie now wins even when a DIFFERENT local user is stored', () => {
  // The old guard `if (!cur || cur === 'coach-demo' || cur === sid)` silently
  // kept the previous person when the ids differed. Pin its absence.
  assert.doesNotMatch(src, /!cur \|\| cur === 'coach-demo' \|\| cur === sid/,
    'the refuse-to-adopt guard is gone');
});

// ── MESSAGES — the phantom badge ──────────────────────────────────────────
test('opening coach Messages clears the legacy unread flags (the stuck 3)', () => {
  const c = ctx({ extra: { messages: [
    { id: 'm1', to: 'Coach',  unread: true,  text: 'a' },
    { id: 'm2', to: 'Coach',  unread: true,  text: 'b' },
    { id: 'm3', to: 'Coach',  unread: true,  text: 'c' },
    { id: 'm4', to: 'Julien', unread: true,  text: 'd' },
  ] } });
  c.setSection('coach', 'messages');
  const coachUnread = c.state.messages.filter(m => m.unread && m.to === 'Coach').length;
  assert.equal(coachUnread, 0, 'before: 3 → after opening Messages: 0');
  assert.equal(c.state.messages.find(m => m.id === 'm4').unread, true,
    'messages addressed to players are not touched');
});

test('the cleared badge stays cleared across rerender and reload', () => {
  const c = ctx({ extra: { messages: [{ id: 'm1', to: 'Coach', unread: true }] } });
  c.setSection('coach', 'messages');
  assert.ok(c.calls.saves > 0, 'the cleared flags are persisted, so reload keeps 0');
  c.setSection('coach', 'overview'); c.setSection('coach', 'messages');
  assert.equal(c.state.messages.filter(m => m.unread && m.to === 'Coach').length, 0);
});

test('unread identity: the chat badge is keyed to the authenticated userId', () => {
  const body = fn('chatMe');
  assert.match(body, /const id = String\(u\?\.id \|\| 'anon'\)/,
    'chatMe: one authenticated userId = one messaging identity');
  assert.match(fn('chatVisibleUnreadTotal'), /chatMe\(\)/,
    'the badge total derives from chatMe, not any player id');
});

test('a user switch cannot inherit the previous account\'s unread badge', () => {
  const c = ctx({ extra: { messages: [{ id: 'm1', to: 'Coach', unread: true }] } });
  assert.equal(c.chatState().nav, 3, 'previous account left a badge of 3');
  c.resetIdentityScopedState();                       // what every adoption site calls
  assert.equal(c.chatState().nav, 0);
  assert.deepEqual(c.state.messages, []);
});

// ── CROSS-USER LEAK MATRIX ────────────────────────────────────────────────
test('Julien → logout → Florian: no Julien residue anywhere', () => {
  // Julien's session state on the shared browser:
  const c = ctx({ currentUserId: 'user_julien', extra: {
    selectedPlayerId: 'p-julien', selectedPlayerOwnerId: '',
    messages: [{ id: 'm1', to: 'Coach', unread: true }],
  } });
  assert.equal(c.getPlayer().name, 'Julien Dupont', 'Julien sees Julien');
  // Florian logs in on the same browser (adoption site behaviour):
  c.resetIdentityScopedState();
  c.state.currentUserId = 'user_florian';
  assert.equal(c.getPlayer().id, '', 'Florian does not see Julien');
  assert.deepEqual(c.state.messages, [], 'no inherited unread');
  assert.equal(c.chatState().nav, 0, 'no inherited badge');
});

test('Julien\'s own view never renders Florian either', () => {
  const c = ctx({ currentUserId: 'user_julien', players: [...ROSTER,
    { id: 'p-florian', userId: 'user_florian', name: 'Florian Wintjens', email: 'florian@club.test' }] });
  assert.equal(c.getPlayer().name, 'Julien Dupont');
});

// ── HONEST STAFF STATE + PREVIEW LABELLING ────────────────────────────────
test('staff with no player profile get the honest message, not "no players added"', () => {
  const body = fn('noSquadMsg');
  assert.match(body, /signed in as staff/, 'the staff variant exists');
  assert.match(body, /canonicalVisiblePlayers\(\)\.length > 0/,
    'and only when the club genuinely has players');
});

test('the portal greeting is personal ONLY for the person\'s own portal', () => {
  const body = fn('renderPlayerHome');
  assert.match(body, /_isOwnPortal/, 'own-portal check exists');
  assert.match(body, /Previewing: /, 'an explicit staff preview is labelled as a preview');
  assert.match(body, /Staff preview/, 'with an unmissable marker');
});

test('the preview selector never silently defaults to the first player', () => {
  const body = fn('playerSelector');
  assert.match(body, /Select a player to preview/, 'an explicit empty option instead');
  assert.doesNotMatch(body, /players\[0\]\?\.id/, 'the players[0] display default is gone');
  assert.match(body, /selectedPlayerOwnerId=state\.currentUserId/, 'choices are ownership-stamped');
});

// ── SECURITY — display identity cannot become write identity ──────────────
test('server-bound writes use the session identity, never the displayed player', () => {
  const apiSrc = fs.readFileSync(new URL('../api/availability.js', import.meta.url), 'utf8');
  assert.match(apiSrc, /availabilityIdentityFromSession\(sessionContext\)/,
    'availability writes derive the player from the SESSION');
  assert.match(fn('chatMe'), /u\?\.id/, 'chat identity is the authenticated user');
});
