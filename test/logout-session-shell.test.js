/**
 * LOGOUT SESSION SHELL — no session, no authenticated rendering.
 *
 * A signed-out coach kept looking at their own app: Overview, Messages, squad
 * and member details all still on screen, with only a small amber banner to
 * say otherwise. Three causes compounded, and fixing any one alone was not
 * enough:
 *
 *   1. render() had no session gate at all. Every section renderer ran
 *      unconditionally from persisted localStorage, so the last account's
 *      screen simply repainted itself after sign-out.
 *   2. currentUser() ended in `|| state.users[0]`. Blanking currentUserId did
 *      not remove the coach's own record from state.users, so the device kept
 *      answering as them — and canI() collapses to isCoach() when
 *      _myPermissions is null, which sign-out sets. Every permission check
 *      said yes to a signed-out device.
 *   3. The Welcome screen — the real front door, with Log in / Join / Start a
 *      club — required the device to be EMPTY. Sign-out deliberately keeps
 *      club data, so the very data it promised to keep was what suppressed
 *      the front door.
 *
 * The boundary pinned here: local data is not a session. Club data may stay on
 * disk, but nothing authenticated paints without a proven session; offline is
 * not signed out; and logging back in restores the shell.
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

const COACH = { id: 'u-coach', role: 'coach', name: 'Nick Coach', email: 'nick@club.test' };

// Every section container render() touches, plus the ones showSection toggles.
const SECTION_IDS = ['coach-overview', 'coach-messages', 'player-messages', 'coach-training',
  'coach-matchday', 'coach-medical', 'player-medical', 'coach-players', 'coach-admin',
  'coach-settings', 'player-home', 'coach-club'];

// Renderers render() drives. Each records that it ran, so a gated render is
// provable by absence rather than by inspecting markup.
const RENDERERS = ['renderNav', 'showSection', 'renderCoachOverview', 'renderMessageCenter',
  'renderCoachMessages', 'renderPlayerMessages', 'renderTraining', 'renderPerformance',
  'renderMatchday', 'renderTactics', 'clearInactiveMedicalShell', 'renderMedical',
  'renderPlayers', 'renderClubAdmin', 'renderClubSection', 'renderSettings',
  'renderCoachFixtures', 'renderCoachSelection', 'renderReports', 'renderCalendar',
  'renderBetaQA', 'renderBetaLaunch', 'renderSearch', 'renderPlayerHome', 'renderPlayerWeek',
  'renderPlayerAvailabilityV2', 'renderPlayerFixtures', 'renderDebugOverlay',
  'renderAudiencePicker', 'loadLiveMessaging', 'liveMessagingArmReload', 'chatStopPolling',
  'renderOperationalGroupSwitcher', 'saveState', 'showToast', 'resetIdentityScopedState',
  'canonicalAccountForUserId', 'membershipPlays', 'hydrateSessionPlayerRecord', 'renderAuthBanner'];

function sandbox({ currentUserId = 'u-coach', serverAuthState = 'authed',
                   users = [COACH], extra = {} } = {}) {
  const calls = [];
  const sections = new Map(SECTION_IDS.map(id => [id, `<div>AUTHENTICATED ${id} CONTENT</div>`]));
  const doc = {
    _welcome: null,
    querySelectorAll(sel) {
      assert.equal(sel, '.section', 'sections are cleared by live query, not a hardcoded id list');
      return [...sections.keys()].map(id => ({
        get innerHTML() { return sections.get(id); },
        set innerHTML(v) { sections.set(id, v); },
      }));
    },
    getElementById(id) {
      if (id === 'ce-welcome') return doc._welcome;
      if (sections.has(id)) return {
        get innerHTML() { return sections.get(id); },
        set innerHTML(v) { sections.set(id, v); },
        classList: { toggle() {}, add() {}, remove() {} },
      };
      return null;
    },
    createElement() { const el = { id: '', className: '', innerHTML: '', remove() { doc._welcome = null; } }; return el; },
    body: { appendChild(el) { doc._welcome = el; } },
  };
  const stubs = RENDERERS.map(n => `function ${n}(){ calls.push('${n}'); }`).join('\n');
  const state = {
    currentUserId, users, players: [{ id: 'p1', name: 'A Player', email: 'p@club.test' }],
    clubName: 'Boitsfort', messages: [{ id: 'm1', text: 'old squad message' }],
    activeView: 'coach', activeCoachSection: 'overview', activePlayerSection: 'home',
    features: {}, meta: { revision: 1 }, ...structuredClone(extra),
  };
  const body = `
    'use strict';
    let _serverAuthState = ${JSON.stringify(serverAuthState)};
    let _myPermissions = null, _myMemberships = [], _myMembership = null, _serverSessionReadyFor = 'x';
    let _chatMessages = { squad: [{ id: 'old', text: 'PREVIOUS ACCOUNT THREAD' }] };
    let _sharedMedical = { loaded: true, failed: false, cases: [{ id: 'c1' }], players: [{ id: 'p1' }] };
    let _adminData = { invites: [], members: [{ id: 'm1', email: 'member@club.test' }], users: [], profiles: [],
                       structure: null, counts: null, clubWideStaff: [], loaded: true, loading: false,
                       attempted: true, failed: false };
    let _welcomeDismissed = false, _chatShellRendered = 'coach', authTab = 'closed';
    const testAccounts = [];
    ${stubs}
    async function ceConfirm() { return true; }
    ${fn('sessionSignedOut')}
    ${fn('clearAuthenticatedSections')}
    ${fn('currentUser')}
    ${fn('isCoach')}
    ${fn('canI')}
    ${fn('renderWelcome')}
    ${fn('render')}
    ${fn('settingsSignOut')}
    return {
      render, settingsSignOut, sessionSignedOut, currentUser, isCoach, canI, renderWelcome,
      state: () => state,
      snapshot: () => ({ _myPermissions, _myMemberships, _myMembership, _serverSessionReadyFor,
                         _chatMessages, _sharedMedical, _adminData, _welcomeDismissed,
                         _serverAuthState, authTab }),
      setPermissions: (p) => { _myPermissions = p; },
      setAuthed: () => { _serverAuthState = 'authed'; },
      setAnon:   () => { _serverAuthState = 'anon'; },
      setUnknown:() => { _serverAuthState = 'unknown'; },
    };
  `;
  const api = new Function('state', 'document', 'calls', 'fetch', 'setTimeout', body)(
    state, doc, calls, async () => ({ ok: true, json: async () => ({}) }), () => {});
  return { ...api, calls, sections, doc };
}

const authenticatedMarkupRemains = s =>
  [...s.sections.values()].some(html => String(html).includes('AUTHENTICATED'));

// ── A + D — the shell stops rendering ───────────────────────────────────────

test('A/D — after logout no authenticated section renders, and none keeps its content', async () => {
  const s = sandbox();
  s.render();
  assert.ok(s.calls.includes('renderCoachOverview'), 'baseline: signed in, Overview renders');
  assert.ok(authenticatedMarkupRemains(s), 'baseline: sections hold content');

  s.calls.length = 0;
  await s.settingsSignOut();

  assert.ok(!s.calls.includes('renderCoachOverview'), 'Overview must not render after logout');
  assert.ok(!s.calls.includes('showSection'), 'no section is activated after logout');
  for (const r of ['renderTraining', 'renderMatchday', 'renderPlayers', 'renderMedical',
                   'renderClubAdmin', 'renderSettings', 'renderPlayerHome']) {
    assert.ok(!s.calls.includes(r), `${r} must not run after logout`);
  }
  assert.ok(!authenticatedMarkupRemains(s), 'every section is emptied, not merely hidden');
  assert.ok(s.calls.includes('renderNav'), 'the nav still renders so the Log in panel stays reachable');
});

// ── B — identity and session state are actually gone ───────────────────────

test('B — logout clears identity, permissions and the server-derived caches', async () => {
  const s = sandbox();
  await s.settingsSignOut();
  const snap = s.snapshot();

  assert.equal(s.state().currentUserId, '', 'identity cleared');
  assert.equal(snap._serverAuthState, 'anon', 'session marked refused');
  assert.equal(snap._myPermissions, null);
  assert.deepEqual(snap._myMemberships, []);
  assert.equal(snap._myMembership, null, 'membership cleared — isCoach() reads it');
  assert.equal(snap._serverSessionReadyFor, '');
  assert.ok(s.calls.includes('resetIdentityScopedState'), 'the canonical identity reset still runs');
  assert.ok(s.calls.includes('chatStopPolling'), 'polling stops');
  assert.equal(snap.authTab, 'login', 'the login panel is opened, not just made available');
  assert.equal(snap._welcomeDismissed, false, 'the front door is re-armed');
});

test('B — a signed-out device has no identity and no permissions', async () => {
  const s = sandbox();
  assert.ok(s.isCoach(), 'baseline: signed in, isCoach true');
  assert.ok(s.canI('manage_players'), 'baseline: signed in, permission granted');

  await s.settingsSignOut();

  assert.equal(s.currentUser(), null, 'no session, no identity — not state.users[0]');
  assert.equal(s.isCoach(), false, 'isCoach false even though the coach record survives in state.users');
  assert.ok(s.state().users.some(u => u.role === 'coach'), 'the record IS still there — the gate is what changed');
  for (const p of ['manage_players', 'messaging', 'reports', 'medical_access', 'danger_zone']) {
    assert.equal(s.canI(p), false, `canI('${p}') must be false with no session`);
  }
});

test('B — a STALE permission list cannot outlive the session (the cross-tab shape)', () => {
  // The tab that did NOT sign out still holds the permissions its session was
  // granted; only the blanked currentUserId reaches it, via the storage event.
  // Here canI() is the load-bearing gate: its usual isCoach() fallback is not
  // reached at all, because _myPermissions is non-null.
  const s = sandbox({ currentUserId: '', serverAuthState: 'anon' });
  s.setPermissions(['manage_players', 'messaging', 'reports', 'medical_access', 'danger_zone']);
  for (const p of ['manage_players', 'messaging', 'reports', 'medical_access', 'danger_zone']) {
    assert.equal(s.canI(p), false, `canI('${p}') must be false despite a populated _myPermissions`);
  }
});

// ── C — old messages ───────────────────────────────────────────────────────

test('C — the previous account\'s message threads do not survive logout', async () => {
  const s = sandbox();
  assert.ok(JSON.stringify(s.snapshot()._chatMessages).includes('PREVIOUS ACCOUNT THREAD'), 'baseline');

  await s.settingsSignOut();

  assert.deepEqual(s.snapshot()._chatMessages, {}, 'thread cache emptied');
  assert.ok(!s.calls.includes('renderCoachMessages'), 'no message shell renders');
  assert.ok(!String(s.sections.get('coach-messages')).includes('AUTHENTICATED'), 'messages section emptied');
});

test('C/D — medical caseload and member PII caches are dropped too', async () => {
  const s = sandbox();
  await s.settingsSignOut();
  const snap = s.snapshot();
  assert.deepEqual(snap._sharedMedical.cases, [], 'medical cases cleared');
  assert.deepEqual(snap._sharedMedical.players, [], 'medical players cleared');
  assert.equal(snap._sharedMedical.loaded, false, 'and marked unloaded so nothing paints from it');
  assert.deepEqual(snap._adminData.members, [], 'member PII cleared');
  assert.equal(snap._adminData.loaded, false);
});

// ── E — refresh after logout ───────────────────────────────────────────────

test('E — a reload after logout is unauthenticated BEFORE the server answers', () => {
  // Exactly the boot state: persisted currentUserId blank, session check not back yet.
  const s = sandbox({ currentUserId: '', serverAuthState: 'unknown' });
  assert.equal(s.sessionSignedOut(), true, 'decided synchronously from the persisted marker');
  s.render();
  assert.ok(!s.calls.includes('renderCoachOverview'), 'no authenticated flash on reload');
  assert.ok(!authenticatedMarkupRemains(s), 'and no authenticated content is left in the DOM');
});

test('E — club data still on disk does NOT count as a session', () => {
  const s = sandbox({ currentUserId: '', serverAuthState: 'unknown' });
  assert.equal(s.state().clubName, 'Boitsfort', 'club data is deliberately retained');
  assert.ok(s.state().players.length, 'roster retained');
  assert.equal(s.sessionSignedOut(), true, 'but the device is still signed out');
});

// ── F — direct navigation to an authenticated route ────────────────────────

test('F — landing directly on an authenticated section exposes nothing', () => {
  for (const section of ['medical', 'players', 'admin', 'matchday', 'training', 'settings']) {
    const s = sandbox({ currentUserId: '', serverAuthState: 'anon',
                        extra: { activeCoachSection: section } });
    s.render();
    assert.ok(!s.calls.includes('showSection'), `${section}: the section is never activated`);
    assert.ok(!authenticatedMarkupRemains(s), `${section}: no authenticated content painted`);
  }
});

// ── G — Back / bfcache ─────────────────────────────────────────────────────

test('G — a bfcache restore re-evaluates the boundary instead of handing back the shell', () => {
  assert.match(src, /addEventListener\('pageshow',\s*event\s*=>\s*\{/,
    'a pageshow handler exists');
  const handler = src.slice(src.indexOf("addEventListener('pageshow'"));
  assert.match(handler.slice(0, 400), /if \(!event\.persisted\) return;/,
    'it acts only on a genuine bfcache restore');
  assert.match(handler.slice(0, 400), /render\(\)/, 'it repaints through the gate');
  assert.match(handler.slice(0, 400), /checkServerSession\(\)/, 'and re-asks the server');

  // The repaint it triggers is itself gated.
  const s = sandbox({ currentUserId: '', serverAuthState: 'anon' });
  s.render();
  assert.ok(!authenticatedMarkupRemains(s), 'the restored page paints the signed-out shell');
});

test('G — a sign-out in another tab signs this one out', () => {
  const start = src.indexOf('window.addEventListener("storage"');
  const listener = src.slice(start, src.indexOf('});', start) + 3);
  assert.match(listener, /if \(!String\(state\.currentUserId \|\| ''\)\.trim\(\)\) \{/,
    'the storage handler notices a blanked identity');
  assert.match(listener, /_serverAuthState = 'anon'/, 'and marks this tab refused');
  assert.match(listener, /render\(\)/, 'then repaints through the gate');
});

// ── H — logging back in ────────────────────────────────────────────────────

test('H — logging back in restores the authenticated shell', async () => {
  const s = sandbox();
  await s.settingsSignOut();
  assert.ok(!authenticatedMarkupRemains(s), 'signed out');

  // What loginIdentityAccount / checkServerSession do on success.
  s.state().currentUserId = 'u-coach';
  s.setAuthed();
  s.calls.length = 0;
  s.render();

  assert.equal(s.sessionSignedOut(), false, 'session restored');
  assert.ok(s.calls.includes('renderCoachOverview'), 'Overview renders again');
  assert.ok(s.calls.includes('showSection'), 'sections activate again');
  assert.ok(s.currentUser(), 'identity resolves again');
  assert.equal(s.isCoach(), true, 'coach tools return');
});

test('H — checkServerSession repaints when the boundary flips', () => {
  const body = src.slice(src.indexOf('async function checkServerSession()'));
  assert.match(body.slice(0, 600), /const wasSignedOut = sessionSignedOut\(\);/,
    'the boundary is sampled before the request');
  assert.match(body.slice(0, 4000), /if \(wasSignedOut !== sessionSignedOut\(\)\) \{ render\(\); \}/,
    'and a flip in EITHER direction repaints the sections');
});

test('H — the session check is never answered from the browser cache', () => {
  // Found by driving a real browser: Back/Forward replayed a CACHED 200 for the
  // session check, so checkServerSession set 'authed' and the shell repainted
  // AFTER the session had ended. The response carries no Cache-Control, so the
  // request must opt out explicitly. Every call site reads session state, so
  // every one of them opts out.
  const sites = src.match(/fetch\('\/api\/identity\?action=session'[^)]*\)/g) || [];
  assert.ok(sites.length >= 4, `expected the known session call sites, found ${sites.length}`);
  for (const site of sites) {
    assert.match(site, /cache:\s*'no-store'/,
      `a session check may not be served from cache: ${site}`);
  }
});

// ── I — authenticated behaviour is untouched ───────────────────────────────

test('I — signing out keeps club data on disk exactly as promised', async () => {
  const s = sandbox();
  const playersBefore = structuredClone(s.state().players);
  await s.settingsSignOut();
  assert.equal(s.state().clubName, 'Boitsfort', 'club name kept');
  assert.deepEqual(s.state().players, playersBefore, 'roster kept');
  assert.ok(s.calls.includes('saveState'), 'and persisted');
});

test('I — a signed-in device is completely unaffected', () => {
  const s = sandbox({ serverAuthState: 'authed' });
  assert.equal(s.sessionSignedOut(), false);
  s.render();
  for (const r of ['renderNav', 'showSection', 'renderCoachOverview', 'renderTraining',
                   'renderMatchday', 'renderPlayers', 'renderSettings']) {
    assert.ok(s.calls.includes(r), `${r} still runs when signed in`);
  }
  assert.ok(authenticatedMarkupRemains(s), 'content still painted');
});

test('I — OFFLINE is not signed out: a failed session check must not lock anyone out', () => {
  // checkServerSession sets 'unknown' on a network failure, never 'anon'.
  const s = sandbox({ currentUserId: 'u-coach', serverAuthState: 'unknown' });
  assert.equal(s.sessionSignedOut(), false, 'a known identity + no server answer stays signed in');
  s.render();
  assert.ok(s.calls.includes('renderCoachOverview'), 'the coach keeps working offline');
  assert.match(src, /\} catch \{ _serverAuthState = 'unknown'; \}/,
    'and the offline path still resolves to unknown, not anon');
});

// ── the front door ─────────────────────────────────────────────────────────

test('the entry screen appears for a signed-out device that HAS club data', () => {
  const s = sandbox({ currentUserId: '', serverAuthState: 'anon' });
  s.renderWelcome();
  assert.ok(s.doc._welcome, 'Welcome mounted despite a populated device');
  assert.match(s.doc._welcome.innerHTML, /Log in/);
  assert.match(s.doc._welcome.innerHTML, /Start a new club/);
  assert.match(s.doc._welcome.innerHTML, /Join a team/);
});

test('the entry screen never appears for a signed-in device', () => {
  const s = sandbox({ currentUserId: 'u-coach', serverAuthState: 'authed' });
  s.renderWelcome();
  assert.equal(s.doc._welcome, null, 'no front door over a live session');
});
