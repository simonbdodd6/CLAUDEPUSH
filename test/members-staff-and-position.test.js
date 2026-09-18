/**
 * MEMBERS — "Jump to Staff", and a player cannot join without a position.
 *
 * 1. Jump to Staff. The Coaches & staff card sits at the very bottom of the
 *    Members squad view, below what can be a long player table. A header
 *    action now scrolls straight to that EXISTING card and focuses its
 *    heading. Navigation only: the card, its rows and who may open a staff
 *    editor are exactly as before.
 *
 * 2. Position at join. Core has no separate "profile setup" step: a player
 *    completes their account when they claim an invite, and Position there
 *    was an optional free-text box (group links only). Now every PLAYER claim
 *    must name a recognised rugby position:
 *      - the claim form shows a required select of the fifteen canonical
 *        positions and refuses to send without one ("Please select your
 *        position."), so nothing is created;
 *      - the server (claimInvite) applies the same rule before any account,
 *        membership or profile is written, so a direct/forged request cannot
 *        skip it;
 *      - "recognised" is the app's ONE forwards/backs rule
 *        (availabilityGroupForPlayer) — a parity test holds client and server
 *        together;
 *      - staff invites, a staff member opening a player link, existing players
 *        (login) and coach/admin player editing are untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.pos.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const parsed = JSON.parse(options.body || '[]');
  if (!Array.isArray(parsed)) return { ok: true, json: async () => ({ id: 'email_x' }) };
  const [command, ...a] = parsed;
  let result = null;
  if (command === 'GET') result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (command === 'SET') {
    if (a.includes('NX') && kv.has(a[0])) result = null;
    else { kv.set(a[0], a[1]); result = 'OK'; }
  }
  if (command === 'DEL') { kv.delete(a[0]); result = 1; }
  if (command === 'EXPIRE' || command === 'INCR' || command === 'PEXPIRE') result = 1;
  if (command === 'SCAN') {
    const at = a.indexOf('MATCH');
    const pat = at >= 0 ? String(a[at + 1]) : '*';
    const re = new RegExp('^' + pat.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    result = ['0', [...kv.keys()].filter(k => re.test(k))];
  }
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { default: identityHandler } = await import('../api/identity.js');
const { claimInvite, isRecognisedRugbyPosition, loginUser } = store;

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let i = html.indexOf('(', start), paren = 0;
  for (; i < html.length; i++) {
    if (html[i] === '(') paren++;
    else if (html[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let body = html.indexOf('{', i), depth = 0, end = body;
  for (let b = body; b < html.length; b++) {
    if (html[b] === '{') depth++;
    else if (html[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return html.slice(start, end + 1);
}
const OPTIONS = JSON.parse(/const PLAYER_POSITION_OPTIONS = (\[[^\]]+\]);/.exec(html)[1]);
const clientRecognised = new Function(`${fn('availabilityGroupForPlayer')} ${fn('isRecognisedPlayerPosition')} return isRecognisedPlayerPosition;`)();

// ═══ 1. Jump to Staff ═══════════════════════════════════════════════════════

const players = fn('renderPlayers');

test('Members offers "Jump to Staff" in its header', () => {
  const h = players.indexOf('<!-- Header: title + primary invite actions -->');
  const header = players.slice(h, players.indexOf('membersViewTabs(', h));
  assert.match(header, /<button class="btn" type="button" onclick="membersJumpToStaff\(\)" aria-controls="members-staff">Jump to Staff<\/button>/);
});

test('it targets the EXISTING Coaches & staff card — one card, not a copy', () => {
  assert.equal((players.match(/id="members-staff"/g) || []).length, 1);
  assert.equal((players.match(/Coaches &amp; staff<\/strong>/g) || []).length, 1);
  assert.match(players, /<div class="card" id="members-staff" [^>]*>\s*<div[^>]*>\s*<strong id="members-staff-title" tabindex="-1"[^>]*>Coaches &amp; staff<\/strong>/);
});

test('the action and its target render together: never a link to nothing', () => {
  // The season-stats view returns before either is drawn; the squad view draws both.
  const season = players.indexOf("if (_membersView === 'season'");
  const action = players.indexOf('membersJumpToStaff()');
  const target = players.indexOf('id="members-staff"');
  assert.ok(season > 0 && action > season && target > action);
});

test('activating it scrolls to the card and focuses its heading', () => {
  const calls = [];
  const card  = { scrollIntoView: o => calls.push(['scroll', o]) };
  const title = { focus: o => calls.push(['focus', o]) };
  const document = { getElementById: id => ({ 'members-staff': card, 'members-staff-title': title })[id] || null };
  new Function('document', `${fn('membersJumpToStaff')} membersJumpToStaff();`)(document);
  assert.deepEqual(calls, [['scroll', { behavior: 'smooth', block: 'start' }], ['focus', { preventScroll: true }]]);
  // With no card on screen it does nothing rather than throw.
  new Function('document', `${fn('membersJumpToStaff')} membersJumpToStaff();`)({ getElementById: () => null });
});

test('staff content, visibility and permissions are unchanged', () => {
  const body = fn('membersJumpToStaff');
  assert.doesNotMatch(body, /state\.|canI|render|fetch|_adminData/, 'navigation only');
  // The existing gates, verbatim.
  assert.match(players, /const _staffRowsEditable = canI\('assign_access'\)/);
  assert.match(players, /onclick="openStaffDetail\('\$\{esc\(String\(s\.id\)\)\}'\)"/);
  assert.match(players, /\.filter\(_staffInScope\)/);
});

// ═══ 2. Position at join ════════════════════════════════════════════════════

test('one canonical position list, shared by the Members forms and sign-up', () => {
  assert.deepEqual(OPTIONS, ['1 — Loosehead prop', '2 — Hooker', '3 — Tighthead prop', '4 — Lock', '5 — Lock',
    '6 — Blindside flanker', '7 — Openside flanker', '8 — Number 8', '9 — Scrum half', '10 — Fly half',
    '11 — Left wing', '12 — Inside centre', '13 — Outside centre', '14 — Right wing', '15 — Fullback',
    'SUB — Squad player']);
  assert.equal(html.split('"1 — Loosehead prop","2 — Hooker"').length - 1, 1, 'the list literal exists once');
  assert.match(html, /const posOptions = PLAYER_POSITION_OPTIONS;/);
  assert.match(html, /\$\{PLAYER_POSITION_OPTIONS\.map\(p=>`<option>\$\{p\}<\/option>`\)\.join\(""\)\}/);
});

const CORPUS = [...OPTIONS, 'Prop', 'Loosehead Prop', 'Hooker', 'Lock', 'Flanker', 'No. 8', 'Number 8',
  'Scrum-half', 'Fly-half', 'Centre', 'Wing', 'Fullback', '7', 'TBC', 'SUB', '', '   ', 'Utility', 'Goalkeeper',
  'Coach', 'x'.repeat(41)];

test('recognised = the app\'s forwards/backs rule, identical on client and server', () => {
  for (const v of CORPUS) assert.equal(isRecognisedRugbyPosition(v), clientRecognised(v), JSON.stringify(v));
  for (const v of OPTIONS.slice(0, 15)) assert.equal(isRecognisedRugbyPosition(v), true, v);
  for (const v of ['SUB — Squad player', 'TBC', '', 'Utility', undefined, null]) assert.equal(isRecognisedRugbyPosition(v), false, String(v));
});

// ── the claim form ───────────────────────────────────────────────────────────

const modal = fn('showInviteModal');

test('a player invite shows a REQUIRED select of the fifteen positions', () => {
  assert.match(modal, /const positionField = isStaffRole\(invite\.role \|\| 'player'\) \? '' : `/);
  assert.match(modal, /<select id="invite-position-input" required aria-required="true" aria-describedby="invite-position-error"/);
  assert.match(modal, /<option value="">Select your position<\/option>/);
  assert.match(modal, /PLAYER_POSITION_OPTIONS\.filter\(isRecognisedPlayerPosition\)/);
  assert.equal(OPTIONS.filter(clientRecognised).length, 15, 'SUB is not offered');
  assert.match(modal, /<p id="invite-position-error" role="alert" hidden[^>]*>Please select your position\.<\/p>/);
  assert.doesNotMatch(modal, /Position <span[^>]*>\(optional\)/, 'no longer optional');
  assert.match(modal, /\$\{optionalFields\}\s*\$\{positionField\}/);
});

/** Run the REAL acceptInvite up to its network call. */
function runAccept({ role = 'player', group = true, position = '' } = {}) {
  const posts = [];
  const els = {
    'invite-first-input': { value: 'Pat' }, 'invite-last-input': { value: 'Player' }, 'invite-name-input': { value: 'Pat Player' },
    'invite-email-input': { value: 'pat@club.test' }, 'invite-password-input': { value: 'longEnough123' },
    'invite-position-input': { value: position, focused: false, focus() { this.focused = true; } },
    'invite-position-error': { hidden: true },
  };
  const document = { getElementById: id => els[id] || null, querySelector: () => null };
  const fetch = async (url, opts) => { posts.push(JSON.parse(opts.body)); throw new Error('stop'); };
  const run = new Function('document', 'fetch', 'showToast', 'data', `
    const STAFF = ['coach', 'admin', 'medical', 'analyst', 'snc'];
    function isStaffRole(r) { return STAFF.includes(String(r)); }
    let _inviteData = data, _inviteToken = 'TOKEN';
    function friendlyAuthError() { return ''; }
    ${fn('availabilityGroupForPlayer')} ${fn('isRecognisedPlayerPosition')}
    async ${fn('acceptInvite')}
    return acceptInvite();`);
  return run(document, fetch, () => {}, { role, group }).then(() => ({ posts, els }));
}

test('no position: nothing is sent, and the message is shown', async () => {
  const { posts, els } = await runAccept({ position: '' });
  assert.equal(posts.length, 0, 'no claim request — no account, membership or profile');
  assert.equal(els['invite-position-error'].hidden, false, '"Please select your position." is visible');
  assert.equal(els['invite-position-input'].focused, true);
});

test('an unrecognised position is refused the same way', async () => {
  for (const position of ['SUB — Squad player', 'TBC', 'Utility']) {
    const { posts, els } = await runAccept({ position });
    assert.equal(posts.length, 0, position);
    assert.equal(els['invite-position-error'].hidden, false, position);
  }
});

test('a valid position sends the claim with it, unchanged', async () => {
  const { posts, els } = await runAccept({ position: '9 — Scrum half' });
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0], { action: 'claim_invite', token: 'TOKEN', name: 'Pat Player', email: 'pat@club.test',
    password: 'longEnough123', mobile: '', position: '9 — Scrum half' });
  assert.equal(els['invite-position-error'].hidden, true);
});

test('a staff invite never asks for a position', async () => {
  const { posts } = await runAccept({ role: 'coach', group: false, position: '' });
  assert.equal(posts.length, 1, 'coach claims proceed exactly as before');
});

test('choosing a position clears the message', () => {
  const err = { hidden: false };
  new Function('document', `${fn('inviteClearPositionError')} inviteClearPositionError();`)({ getElementById: () => err });
  assert.equal(err.hidden, true);
});

// ── the server: the rule cannot be skipped ───────────────────────────────────

const CLUB = 'club-pos';
function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Position RFC' }]));
  kv.set('app:identity:team_members', JSON.stringify([]));
  kv.set('app:identity:users', JSON.stringify([]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set(`app:invites:${CLUB}`, JSON.stringify([
    { token: 'GroupPlayerTok01', kind: 'group', role: 'player', teamId: CLUB, status: 'pending', createdAt: '2026-09-01T00:00:00Z' },
    { token: 'PersonalPlayer01', role: 'player', teamId: CLUB, status: 'pending', email: 'solo@club.test', name: 'Solo Player', createdAt: '2026-09-01T00:00:00Z' },
    { token: 'CoachInviteTok01', role: 'coach', teamId: CLUB, status: 'pending', email: 'coach@club.test', name: 'Cara Coach', createdAt: '2026-09-01T00:00:00Z' },
  ]));
}
const identityKeys = () => JSON.stringify(['app:identity:users', 'app:identity:team_members', 'app:identity:player_profiles'].map(k => kv.get(k)));
const claim = body => claimInvite({ token: 'GroupPlayerTok01', name: 'Pat Player', email: 'pat@club.test', password: 'longEnough123', ...body });

test('a player claim with no position is refused before anything is written', async () => {
  seed();
  const before = identityKeys();
  await assert.rejects(claim({}), e => e.status === 400 && e.message === 'Please select your position.' && e.code === 'position_required');
  assert.equal(identityKeys(), before, 'no user, membership or profile');
});

test('an unrecognised position is refused too', async () => {
  for (const position of ['SUB — Squad player', 'TBC', '   ', 'Utility', 'x'.repeat(41)]) {
    seed();
    const before = identityKeys();
    await assert.rejects(claim({ position }), e => e.status === 400, position);
    assert.equal(identityKeys(), before, position);
  }
});

test('a personal player invite is held to the same rule', async () => {
  seed();
  await assert.rejects(claimInvite({ token: 'PersonalPlayer01', email: 'solo@club.test', password: 'longEnough123' }), e => e.status === 400);
  const ok = await claimInvite({ token: 'PersonalPlayer01', email: 'solo@club.test', password: 'longEnough123', position: '15 — Fullback' });
  assert.equal(ok.playerProfile.position, '15 — Fullback');
});

test('a valid position completes the join, and is stored on the profile', async () => {
  seed();
  const ok = await claim({ position: '9 — Scrum half' });
  assert.equal(ok.teamMember.role, 'player');
  assert.equal(ok.teamMember.status, 'active');
  assert.ok(ok.session?.token, 'signed in');
  assert.equal(ok.playerProfile.position, '9 — Scrum half');
  // A named position the app already recognises keeps working (existing API callers).
  seed();
  assert.equal((await claim({ position: 'Prop' })).playerProfile.position, 'Prop');
});

test('a forged request straight to /api/identity cannot skip it', async () => {
  seed();
  const out = {};
  const res = { setHeader() {}, status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; }, end() { return this; } };
  const before = identityKeys();
  await identityHandler({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.9' }, query: {},
    body: { action: 'claim_invite', token: 'GroupPlayerTok01', name: 'Forged', email: 'forged@club.test', password: 'longEnough123', position: '' } }, res);
  assert.equal(out.code, 400);
  assert.equal(out.body?.error, 'Please select your position.');
  assert.equal(identityKeys(), before);
});

test('staff are never asked: a coach invite, and a coach opening a player link', async () => {
  seed();
  const coach = await claimInvite({ token: 'CoachInviteTok01', email: 'coach@club.test', password: 'longEnough123' });
  assert.equal(coach.teamMember.role, 'coach');
  // The same coach opens the squad's player link without a position: they keep
  // the coach role (never downgraded), so there is no player to position.
  const again = await claim({ email: 'coach@club.test', password: 'longEnough123', name: 'Cara Coach' });
  assert.equal(again.teamMember.role, 'coach');
});

test('existing players are not sent back through setup: login never checks position', async () => {
  seed();
  await claim({ position: '2 — Hooker', email: 'old@club.test' });
  // A legacy profile with no real position (the old default).
  const profiles = JSON.parse(kv.get('app:identity:player_profiles'));
  profiles[0].position = 'TBC';
  kv.set('app:identity:player_profiles', JSON.stringify(profiles));
  const again = await loginUser({ email: 'old@club.test', password: 'longEnough123' });
  assert.ok(again.session?.token, 'a player with no position still signs in');
  assert.doesNotMatch(fn('checkServerSession'), /isRecognisedPlayerPosition/);
});

test('coach/admin editing and player self-edits are not newly blocked', () => {
  // Coach edit and add keep their behaviour (SUB default, no new gate).
  assert.doesNotMatch(fn('playerSaveProfile'), /isRecognised/);
  assert.match(fn('addPlayer'), /position: pos \|\| "SUB"/);
  // The server's other writers of position are untouched by the new rule.
  const src = fs.readFileSync(new URL('../api/_identityStore.js', import.meta.url), 'utf8');
  assert.equal(src.split('isRecognisedRugbyPosition(').length - 1, 2, 'defined once, used once — in claimInvite only');
  const claimBody = src.slice(src.indexOf('export async function claimInvite('), src.indexOf('export async function claimInvite(') + 6000);
  assert.ok(claimBody.includes('isRecognisedRugbyPosition(input.position)'));
});
