// COACHEASIER-P1-CLUB-STATE-ISOLATION-1
//
// An existing user moving from Club A to Club B in the same browser did not
// reset club-scoped client state: resetTeamScopedState() had exactly ONE call
// site (switchTeamTo). Login, invite claim, club creation and session restore
// all kept Club A's roster / config / training in `state`, and two seeding
// heuristics then wrote it INTO Club B:
//   loadRosterFromServer:     empty server roster + local players → roster POST
//   loadClubConfigFromServer: no server club + local clubName    → club POST
// plus saveState() → queueRosterSync() on every save.
//
// Fix: ONE transition boundary — adoptClubContext(teamId) — run by every path
// that moves a device into a club, comparing the server's teamId against the
// persisted marker state.stateTeamId; and ONE ownership gate — clubStateOwned()
// — that every seeding/push path must pass. Real functions are extracted from
// index.html and executed against captured fetch calls (request-level).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

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

// ── Fixtures ─────────────────────────────────────────────────────────────────
const CLUB_A = 'club_a_boitsfort';
const CLUB_B = 'club_b_navarra';
const COACH  = { id: 'user_coach', role: 'coach', name: 'Same Coach', email: 'coach@x.test' };
const OTHER  = { id: 'user_other', role: 'coach', name: 'Other Coach', email: 'other@x.test' };
const A_PLAYERS = [
  { id: 'pa1', userId: 'user_pa1', name: 'Alpha One', position: 'Prop' },
  { id: 'pa2', userId: 'user_pa2', name: 'Alpha Two', position: 'Lock' },
];
const B_PLAYERS = [{ id: 'pb1', userId: 'user_pb1', name: 'Bravo One', position: 'Hooker' }];
const A_TRAINING = { 'grp_initial': { trainingBlocks: { 'slot_tue|2026-09-15': [{ title: 'Club A lineout drill' }] }, schedule: [] } };

function clubAState(extra = {}) {
  return {
    stateTeamId: CLUB_A,
    currentUserId: COACH.id,
    users: [{ ...COACH }],
    players: structuredClone(A_PLAYERS),
    fixtures: [{ id: 'fx_a', opposition: 'Club A rivals' }],
    clubName: 'Club A RFC', teamName: 'Seniors', seasonName: '2026-27',
    clubLogo: 'data:image/png;base64,AAAA', clubColours: { primary: '#111111', secondary: '#222222' },
    seasonStart: '2026-09-01', seasonEnd: '2027-05-31', matchDayDefault: 'Sat',
    matchCentre: { opposition: 'Club A rivals' },
    formationNames: { '1': 'Alpha One' }, fphotoIds: {},
    benchPlayers: ['Alpha Two', '', '', '', '', '', '', ''],
    schedule: [{ id: 'slot_tue', type: 'Training', title: 'Tue training', date: '2026-09-15 19:00' }],
    trainingBlocks: { 'slot_tue|2026-09-15': [{ title: 'Club A lineout drill' }] },
    trainingByGroup: structuredClone(A_TRAINING),
    trainingAdopted: { 'slot_tue|2026-09-15': { rev: 3, fp: 'x' } },
    trainingStateGroupId: 'grp_initial',
    trainingAttendance: { 'slot_tue|2026-09-15': { pa1: 'present' } }, sessionNotes: {},
    availabilityRequests: [{ id: 'req1' }], autopilotReceipts: [], lastWeekTrainingBlocks: null,
    messages: [], performanceWorkout: null,
    operationalGroupId: 'grp_initial',
    activeView: 'coach', activeCoachSection: 'overview',
    meta: { revision: 7 },
    ...extra,
  };
}

/**
 * The client sandbox: real functions, captured network, controllable server.
 *   cfg.state       — the persisted device state
 *   cfg.server      — { club: current club the cookie names, sessionOk, sessionThrows,
 *                       rosters: {club: players[]}, clubs: {club: record|null},
 *                       user: the session user }
 */
function client(cfg) {
  const body = `
    "use strict";
    const CFG = arguments[0];
    const state = CFG.state;
    const server = CFG.server;
    const calls = [];            // every fetch: { method, url, body }
    const events = [];           // ordered trace: reset / stamp / roster-get / club-get ...
    const defaultState = { matchCentre: {}, schedule: [], trainingBlocks: {}, players: [] };
    // ── globals the extracted functions read ──
    let _clubContextId = '';
    let _rosterLastSyncedFp = null, _rosterSyncTimer = null, _rosterSyncPending = false, _rosterSyncDeferred = false;
    let _appearanceAdjustments = ['adj'], _seasonSheets = { a: 1 }, _seasonSheetsGroup = 'grp_initial';
    let _trainingPubState = { s: 1 }, _trainingPubLoadedAt = 9, _trainingSchedule = { slots: [] }, _trainingScheduleAttempted = true;
    let _groupRecipients = { grp_initial: ['a'] }, _clubConfigChecked = CFG.clubConfigChecked || false, _publishedStateLoadedAt = 9;
    let _adminData = { loaded: true }, _autopilotEnsured = true, _autopilotLogAt = 9, _autopilotLog = [1];
    let _serverAuthState = 'unknown', _myPermissions = null, _myPlatformRole = '', _myOperational = null;
    let _myMembership = null, _myMemberships = [], _verifyNotice = null, _playerAvailFetched = false;
    let _lastDeviceSaveOk = true, _inviteToken = 'tok', _inviteData = { role: 'coach', name: 'Same Coach', email: 'coach@x.test' };
    const STORAGE_KEY = 'k', BACKUP_KEY = 'kb';
    const stored = {};
    const window = { localStorage: { setItem(k, v) { stored[k] = v; }, getItem(k) { return stored[k] ?? null; } },
                     history: { replaceState() {} }, sessionStorage: { getItem() { return null; } } };
    const inputs = { 'invite-name-input': 'Same Coach', 'invite-email-input': 'coach@x.test', 'invite-password-input': 'password123' };
    const document = { getElementById: id => (id in inputs ? { value: inputs[id] } : null), querySelector: () => null, querySelectorAll: () => [] };
    const console = { log() {}, warn(...a) { events.push('warn:' + String(a[0])); }, error() {} };
    const Notification = { permission: 'denied' };   // acceptInvite's push prompt (inert here)
    // ── timers: recorded so the 2s roster debounce can be flushed deterministically ──
    const timers = [];
    function setTimeout(f) { timers.push(f); return timers.length; }
    function clearTimeout(id) { if (id) timers[id - 1] = null; }
    // Un-awaited loaders (fire-and-forget in the real code) must land before
    // the debounce fires and before any assertion: settle, run, settle.
    async function settle() { for (let i = 0; i < 6; i++) await new Promise(r => globalThis.setImmediate(r)); }
    async function flushTimers() {
      await settle();
      let f; while ((f = timers.shift()) !== undefined) { if (f) await f(); }
      await settle();
    }
    // ── stubs with counters ──
    const counts = { identityResets: 0, renders: 0, firstRun: 0, toasts: [], hydrations: 0, published: 0, drafts: 0, medical: 0 };
    function isCoach() { return (state.users.find(u => u.id === state.currentUserId) || {}).role !== 'player'; }
    function sessionSignedOut() { return _serverAuthState === 'anon' || !String(state.currentUserId || '').trim(); }
    function resetIdentityScopedState() { counts.identityResets++; }
    function render() { counts.renders++; }
    function renderAuthBanner() {} function renderNav() {} function renderOperationalGroupSwitcher() {}
    function renderVerifyEmailBanner() {} function contextResolved() { return _myOperational !== null; }
    function resolveOperationalGroup() {} function ensureOwnPlayerRecord() { return false; }
    function hydrateSessionPlayerRecord() { return false; }
    function membershipPlays() { return false; }
    function ensurePlayerUsersForRoster(players, users) { return users; }
    function markSynced() {} function applyClubBranding() {} function showToast(t) { counts.toasts.push(t); }
    function ensureAutopilotSchedule() { return Promise.resolve(); }
    function normalizeWeeklyAvailability(v) { return v || {}; }
    function showFirstRunSetup() { counts.firstRun++; }
    function loadPublishedStateForPlayer() { counts.published++; return Promise.resolve(); }
    function loadCoachDraft() { counts.drafts++; return Promise.resolve(); }
    function loadMedicalFromServer() { counts.medical++; return Promise.resolve(); }
    function refreshPushSubscriptionMetadata() { return Promise.resolve(); }
    function applyApprovedIdentityLocally() {}
    function friendlyAuthError(e) { return e.message; }
    function isStaffRole(r) { return r !== 'player'; }
    // ── the stubbed server ──
    function sessionPayload() {
      return { ok: true, user: { ...server.user }, teamMember: { id: 'tm', userId: server.user.id, role: 'coach', teamId: server.club },
               permissions: ['manage_players'], memberships: [], operational: { staff: { groups: [], defaultGroupId: null }, player: { groups: [] } } };
    }
    async function fetch(url, opts = {}) {
      const method = opts.method || 'GET';
      const reqBody = opts.body ? JSON.parse(opts.body) : null;
      calls.push({ method, url, body: reqBody });
      const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
      if (url.startsWith('/api/identity?action=session')) {
        if (server.sessionThrows) throw new TypeError('Failed to fetch');
        if (!server.sessionOk) return json(401, { ok: false, error: 'No active session' });
        return json(200, sessionPayload());
      }
      if (url === '/api/identity' && method === 'POST') {
        if (reqBody.action === 'switch_team') { server.club = reqBody.teamId; return json(200, { ok: true, teamId: reqBody.teamId }); }
        if (reqBody.action === 'claim_invite') { server.club = server.claimTo; return json(201, sessionPayload()); }
        return json(200, { ok: true });
      }
      if (url === '/api/roster') {
        events.push('roster-' + method.toLowerCase() + ':' + server.club);
        if (method === 'GET') return json(200, { ok: true, players: structuredClone(server.rosters[server.club] || []) });
        return json(200, { ok: true, players: reqBody.players });
      }
      if (url === '/api/publish?resource=club') {
        events.push('club-' + method.toLowerCase() + ':' + server.club);
        if (method === 'GET') return json(200, { ok: true, club: structuredClone(server.clubs[server.club] || null) });
        return json(200, { ok: true, club: reqBody.club });
      }
      return json(200, { ok: true });
    }
    // ── the real functions under test ──
    ${fn('rosterFingerprint')}
    ${fn('queueRosterSync')}
    ${fn('flushRosterSync')}
    ${fn('saveState')}
    ${fn('clubStateOwned')}
    ${fn('adoptClubContext')}
    ${fn('resetTeamScopedState')}
    ${fn('resetClubScopedState')}
    ${fn('hydrateClubFromServer')}
    ${fn('adoptIdentityPayload')}
    ${fn('checkServerSession')}
    ${fn('loadRosterFromServer')}
    ${fn('applyClubConfigLocally')}
    ${fn('loadClubConfigFromServer')}
    ${fn('saveClubConfigToServer')}
    ${fn('switchTeamTo')}
    ${fn('acceptInvite')}
    // Trace the two boundary moments so ORDER can be asserted.
    const _reset = resetClubScopedState;
    resetClubScopedState = function tracedReset() { events.push('reset'); return _reset(); };
    const _adopt = adoptClubContext;
    adoptClubContext = function (id) { const r = _adopt(id); events.push('stamp:' + String(id || '') + ':' + (r ? 'changed' : 'same')); return r; };
    return {
      state, calls, events, counts, flushTimers, server,
      checkServerSession, switchTeamTo, acceptInvite, loadRosterFromServer, loadClubConfigFromServer,
      adoptIdentityPayload, adoptClubContext, clubStateOwned, saveState, queueRosterSync, flushRosterSync,
      owned: () => clubStateOwned(), contextId: () => _clubContextId, stored: () => JSON.parse(stored[STORAGE_KEY] || 'null'),
      reset: () => resetClubScopedState(),
      caches: () => ({ _appearanceAdjustments, _seasonSheets, _seasonSheetsGroup, _trainingPubState, _trainingPubLoadedAt, _trainingSchedule,
                       _trainingScheduleAttempted, _groupRecipients, _clubConfigChecked, _publishedStateLoadedAt, _adminData, _autopilotEnsured,
                       _autopilotLogAt, _autopilotLog, _rosterLastSyncedFp, _rosterSyncPending, _rosterSyncDeferred, _serverAuthState }),
      proveClub: id => { _clubContextId = id; },
    };
  `;
  return new Function(body)(cfg);
}

const serverFor = (club, over = {}) => ({
  club, sessionOk: true, sessionThrows: false, claimTo: CLUB_B, user: { ...COACH, displayName: COACH.name },
  rosters: { [CLUB_A]: structuredClone(A_PLAYERS), [CLUB_B]: [] },
  clubs: { [CLUB_A]: { clubName: 'Club A RFC', teamName: 'Seniors', seasonName: '2026-27', colours: { primary: '#111111', secondary: '#222222' } }, [CLUB_B]: null },
  ...over,
});

const rosterPosts = c => c.calls.filter(x => x.method === 'POST' && x.url === '/api/roster');
const clubPosts   = c => c.calls.filter(x => x.method === 'POST' && x.url === '/api/publish?resource=club');
const anyPostMentions = (c, needle) => c.calls.some(x => x.method === 'POST' && JSON.stringify(x.body || {}).includes(needle));
const CLUB_A_SIGNATURES = ['Alpha One', 'Alpha Two', 'pa1', 'Club A RFC', 'Club A lineout drill', '#111111', 'Club A rivals'];

function assertNoClubAInState(state) {
  const json = JSON.stringify(state);
  for (const sig of CLUB_A_SIGNATURES) assert.ok(!json.includes(sig), `Club A signature "${sig}" must not survive in the new club's state`);
}
function assertNoClubAOnTheWire(c) {
  for (const sig of CLUB_A_SIGNATURES) assert.equal(anyPostMentions(c, sig), false, `no POST may carry Club A data ("${sig}")`);
}

// ═════════════════════════════════════════════════════════════════════════════
// (A)(B)(C)(D)(E)(I) — the production path: a Club A device claims a Club B invite
// ═════════════════════════════════════════════════════════════════════════════

test('A: a Club A device claiming a Club B invite is wiped BEFORE Club B hydration', async () => {
  const c = client({ state: clubAState(), server: serverFor(CLUB_A) });
  await c.acceptInvite();
  await c.flushTimers();
  // The reset ran, and it ran before the first read of Club B's server state.
  const reset = c.events.indexOf('reset');
  const firstB = c.events.findIndex(e => e.endsWith(':' + CLUB_B));
  assert.ok(reset >= 0, 'the club transition ran on the invite-claim path');
  assert.ok(firstB > reset, `Club B was only read AFTER the reset (events: ${c.events.join(' → ')})`);
  assert.equal(c.state.stateTeamId, CLUB_B, 'the device is now marked as Club B');
  assert.equal(c.owned(), true, 'and that ownership is proven (marker === server club)');
  assert.deepEqual(c.state.players, [], 'Club A roster gone — Club B is empty on the server');
  assertNoClubAInState(c.state);
});

test('B: Club B empty server roster → the stale Club A roster is NOT seeded (no roster POST at all)', async () => {
  const c = client({ state: clubAState(), server: serverFor(CLUB_A) });
  await c.acceptInvite();
  await c.flushTimers();
  assert.equal(rosterPosts(c).length, 0, `no roster POST after the transition (calls: ${JSON.stringify(c.calls.filter(x => x.method === 'POST'))})`);
  assertNoClubAOnTheWire(c);
});

test('C: Club B has no club config → Club A name/colours/season are NOT written into it', async () => {
  const c = client({ state: clubAState(), server: serverFor(CLUB_A) });
  await c.acceptInvite();
  await c.flushTimers();
  assert.equal(clubPosts(c).length, 0, 'no club-config POST');
  assert.equal(c.state.clubName, '', 'Club A name gone');
  assert.equal(c.state.clubColours, null, 'Club A colours gone');
  assert.equal(c.state.seasonName, '', 'Club A season gone');
  assert.equal(c.state.clubLogo, '', 'Club A logo gone');
  assert.equal(c.counts.firstRun, 1, 'the new club owner gets the first-run setup, not Club A\'s settings');
});

test('D+E: Club B training/group state cannot inherit Club A — grp_initial collision included', async () => {
  const c = client({ state: clubAState(), server: serverFor(CLUB_A) });
  assert.ok(c.state.trainingByGroup['grp_initial'], 'precondition: Club A stashed training under grp_initial');
  await c.acceptInvite();
  await c.flushTimers();
  assert.deepEqual(c.state.trainingByGroup, {}, 'grp_initial stash does not carry into Club B');
  assert.deepEqual(c.state.trainingBlocks, {}, 'live blocks reset');
  assert.deepEqual(c.state.trainingAdopted, {}, 'adoption revisions reset');
  assert.equal(c.state.trainingStateGroupId, null, 'training owner stamp reset');
  assert.deepEqual(c.state.trainingAttendance, {}, 'attendance register reset');
  assert.deepEqual(c.state.schedule, [], 'schedule reset to defaults');
  const caches = c.caches();
  assert.equal(caches._trainingSchedule, null); assert.equal(caches._trainingScheduleAttempted, false);
  assert.deepEqual(caches._trainingPubState, {}); assert.equal(caches._trainingPubLoadedAt, 0);
  assert.deepEqual(caches._groupRecipients, {}); assert.equal(caches._seasonSheets, null);
  assert.equal(caches._appearanceAdjustments, null); assert.equal(caches._adminData.loaded, false);
});

test('I: a roster push already queued under Club A never fires after the transition (request-level)', async () => {
  const c = client({ state: clubAState(), server: serverFor(CLUB_A) });
  c.proveClub(CLUB_A);                       // the device is proven Club A in this page lifetime
  c.state.players.push({ id: 'pa3', name: 'Alpha Three', position: 'Wing' });
  c.saveState('Player added');               // → queueRosterSync → 2s debounce pending
  assert.equal(c.caches()._rosterSyncPending, true, 'precondition: a Club A push is pending');
  await c.acceptInvite();                    // cookie is now Club B
  await c.flushTimers();                     // the debounce would fire here
  assert.equal(rosterPosts(c).length, 0, 'the pending Club A push was cancelled, not delivered to Club B');
  assertNoClubAOnTheWire(c);
  assert.equal(c.caches()._rosterSyncPending, false);
});

// ═════════════════════════════════════════════════════════════════════════════
// Session restore (the adoptIdentityPayload chokepoint) + boot race
// ═════════════════════════════════════════════════════════════════════════════

test('session restore: a cookie that now names Club B wipes Club A and re-hydrates', async () => {
  const c = client({ state: clubAState(), server: serverFor(CLUB_B, { rosters: { [CLUB_A]: A_PLAYERS, [CLUB_B]: B_PLAYERS } }) });
  await c.checkServerSession();
  await new Promise(r => setImmediate(r));   // hydrateClubFromServer is fire-and-forget
  await c.flushTimers();
  assert.ok(c.events.includes('reset'), 'transition ran from the session payload');
  assert.equal(c.state.stateTeamId, CLUB_B);
  assert.deepEqual(c.state.players.map(p => p.id), ['pb1'], 'Club B roster adopted from the server');
  assertNoClubAInState(c.state);
  assertNoClubAOnTheWire(c);
  assert.equal(rosterPosts(c).length, 0);
});

test('boot race: loaders that run before the session answer seed NOTHING (unproven fails closed)', async () => {
  // Marker says Club A, but no server answer has landed in this page lifetime.
  const c = client({ state: clubAState(), server: serverFor(CLUB_B) });   // cookie is secretly Club B
  assert.equal(c.owned(), false, 'unproven at boot');
  await c.loadRosterFromServer();     // Club B: empty
  await c.loadClubConfigFromServer(); // Club B: no club record
  await c.flushTimers();
  assert.equal(rosterPosts(c).length, 0, 'empty server roster + local players did NOT seed');
  assert.equal(clubPosts(c).length, 0, 'no club record + local clubName did NOT seed');
  assert.equal(c.counts.firstRun, 0, 'and the unproven device is not shown the wizard either');
  // Then the session answer names Club B → transition.
  await c.checkServerSession();
  await new Promise(r => setImmediate(r));
  await c.flushTimers();
  assert.equal(c.state.stateTeamId, CLUB_B);
  assertNoClubAInState(c.state);
  assertNoClubAOnTheWire(c);
});

test('a save during the unproven window is deferred, then pushed to the PROVEN club — not dropped', async () => {
  const c = client({ state: clubAState(), server: serverFor(CLUB_A) });
  c.state.players.push({ id: 'pa3', name: 'Alpha Three', position: 'Wing' });
  c.saveState('edit before session answer');
  assert.equal(rosterPosts(c).length, 0);
  assert.equal(c.caches()._rosterSyncDeferred, true, 'held, not sent');
  await c.checkServerSession();          // same club → proof, no reset
  await c.flushTimers();
  assert.equal(c.events.includes('reset'), false);
  assert.equal(rosterPosts(c).length, 1, 'the held push went out once ownership was proven');
  assert.deepEqual(rosterPosts(c)[0].body.players.map(p => p.id), ['pa1', 'pa2', 'pa3']);
});

// ═════════════════════════════════════════════════════════════════════════════
// (F)(G)(L) — what must NOT change
// ═════════════════════════════════════════════════════════════════════════════

test('F: same user + same club (reload) preserves local state exactly', async () => {
  const before = clubAState();
  const c = client({ state: clubAState(), server: serverFor(CLUB_A) });
  await c.checkServerSession();
  await c.flushTimers();
  assert.equal(c.events.includes('reset'), false, 'no transition');
  assert.equal(c.counts.identityResets, 0, 'no identity reset either');
  for (const k of ['players', 'fixtures', 'clubName', 'teamName', 'seasonName', 'clubLogo', 'clubColours', 'trainingBlocks',
                   'trainingByGroup', 'trainingAdopted', 'trainingStateGroupId', 'trainingAttendance', 'schedule', 'matchCentre',
                   'formationNames', 'benchPlayers', 'availabilityRequests', 'stateTeamId']) {
    assert.deepEqual(c.state[k], before[k], `${k} preserved`);
  }
  assert.equal(c.owned(), true);
});

// ═════════════════════════════════════════════════════════════════════════════
// THE MIGRATION WINDOW — every device in the field carries NO marker on the
// first load after this ships, so these two tests are the ones that decide
// whether the fix is worth anything in production.
// ═════════════════════════════════════════════════════════════════════════════

test('MIGRATION: a legacy device meeting a DIFFERENT club leaks nothing (the production case)', async () => {
  // Exactly the reported journey: an existing Club A coach joins Club B in the
  // same browser. The device predates the marker, so it cannot prove which club
  // its roster belongs to. Unprovable club data is treated as foreign.
  const c = client({ state: clubAState({ stateTeamId: null }), server: serverFor(CLUB_B) });
  await c.checkServerSession();
  await c.flushTimers();

  assert.equal(c.events.includes('reset'), true, 'unprovable club data is dropped, not adopted');
  assert.equal(c.state.stateTeamId, CLUB_B, 'the wiped state is stamped as Club B, and it IS Club B\'s');
  assertNoClubAInState(c.state);
  assertNoClubAOnTheWire(c);
  assert.equal(rosterPosts(c).length, 0, 'Club A\'s roster is never POSTed to Club B');
  assert.equal(clubPosts(c).length, 0, 'Club A\'s name/colours/season are never written into Club B');
  assert.deepEqual(c.state.players, [], 'Club B starts from its own (empty) server roster');
  assert.equal(c.state.clubName, '', 'and its own (absent) club config');
});

test('MIGRATION: the stamp cannot launder unprovable data into a seedable state on the NEXT load', () => {
  // The subtle half: stamping without wiping would make another club's roster
  // "proven" on the following load, and the seeding gate would then wave it
  // through. Ownership must never be asserted over data that was not verified.
  const first = client({ state: clubAState({ stateTeamId: null }), server: serverFor(CLUB_B) });
  first.adoptClubContext(CLUB_B);
  const persisted = first.state;
  assert.equal(persisted.stateTeamId, CLUB_B);
  assertNoClubAInState(persisted, 'nothing of Club A may carry the Club B stamp');

  // Reload that same persisted state: now proven, and therefore seedable — but
  // there is nothing of Club A left to seed.
  const second = client({ state: { ...persisted }, server: serverFor(CLUB_B) });
  assert.equal(second.owned(), false, 'not owned until the server names the club again');
  second.adoptClubContext(CLUB_B);
  assert.equal(second.owned(), true, 'same club, marker matches → proven');
  assertNoClubAInState(second.state);
});

test('F (legacy device, same club): unprovable state is re-read from the server, never trusted', async () => {
  // The cost of failing closed, measured: a legacy device on its OWN club is
  // wiped once and re-hydrated. Everything server-backed comes straight back;
  // nothing is written anywhere. Purely-local, never-published work is the
  // only casualty, and that is the deliberate trade for closing the leak.
  const c = client({ state: clubAState({ stateTeamId: null }), server: serverFor(CLUB_A) });
  await c.checkServerSession();
  await c.flushTimers();
  assert.equal(c.events.includes('reset'), true, 'unprovable state is not trusted, even on its own club');
  assert.equal(c.state.stateTeamId, CLUB_A, 'stamped with the club the server named');
  assert.equal(c.stored()?.stateTeamId, CLUB_A, 'the stamp is persisted');
  assert.deepEqual(c.state.players.map(p => p.id), ['pa1', 'pa2'], 'roster restored FROM THE SERVER');
  assert.equal(c.state.clubName, 'Club A RFC', 'club config restored FROM THE SERVER');
  assert.equal(rosterPosts(c).length, 0, 'and nothing was pushed in the process');
  assert.equal(clubPosts(c).length, 0);
  assert.equal(c.owned(), true, 'proven from here on');
});

test('G: a DIFFERENT user in the SAME club → identity reset only; club data stays', async () => {
  const c = client({ state: clubAState(), server: serverFor(CLUB_A, { user: { ...OTHER, displayName: OTHER.name } }) });
  await c.checkServerSession();
  await c.flushTimers();
  assert.equal(c.counts.identityResets, 1, 'resetIdentityScopedState ran for the new person');
  assert.equal(c.events.includes('reset'), false, 'but no club transition');
  assert.equal(c.state.currentUserId, OTHER.id);
  assert.deepEqual(c.state.players.map(p => p.id), ['pa1', 'pa2'], 'club roster kept (club-scoped, not person-scoped)');
  assert.equal(c.state.clubName, 'Club A RFC');
});

test('L: OFFLINE (session fetch throws) is never a club change', async () => {
  const c = client({ state: clubAState(), server: serverFor(CLUB_A, { sessionThrows: true }) });
  await c.checkServerSession();
  await c.flushTimers();
  assert.equal(c.caches()._serverAuthState, 'unknown');
  assert.equal(c.events.includes('reset'), false);
  assert.equal(c.state.stateTeamId, CLUB_A);
  assert.deepEqual(c.state.players.map(p => p.id), ['pa1', 'pa2'], 'a coach\'s device survives losing the network');
  assert.equal(c.owned(), false, 'but nothing is proven offline, so nothing seeds');
});

test('L: a 401 (signed out elsewhere) and a payload without a membership are not club changes either', async () => {
  const c = client({ state: clubAState(), server: serverFor(CLUB_A, { sessionOk: false }) });
  await c.checkServerSession();
  assert.equal(c.events.includes('reset'), false);
  assert.equal(c.state.stateTeamId, CLUB_A);
  assert.equal(c.adoptClubContext(''), false);
  assert.equal(c.adoptClubContext(undefined), false);
  assert.equal(c.adoptClubContext(null), false);
  c.adoptIdentityPayload({ permissions: [] });
  c.adoptIdentityPayload({ teamMember: null });
  c.adoptIdentityPayload({ teamMember: { id: 'tm', role: 'coach' } });
  assert.equal(c.events.includes('reset'), false, 'no teamId → no-op every time');
  assert.equal(c.state.stateTeamId, CLUB_A);
});

// ═════════════════════════════════════════════════════════════════════════════
// (H)(K) — the explicit switch, and Club A untouched
// ═════════════════════════════════════════════════════════════════════════════

test('H+K: switchTeamTo still works, and switching back finds Club A intact on the server', async () => {
  const server = serverFor(CLUB_A, { rosters: { [CLUB_A]: A_PLAYERS, [CLUB_B]: B_PLAYERS } });
  const c = client({ state: clubAState(), server });
  c.proveClub(CLUB_A);
  await c.switchTeamTo(CLUB_B);
  await c.flushTimers();
  assert.equal(c.events.filter(e => e === 'reset').length, 1, 'exactly ONE reset (switch resets; the session stamp does not double-reset)');
  assert.equal(c.state.stateTeamId, CLUB_B);
  assert.deepEqual(c.state.players.map(p => p.id), ['pb1'], 'Club B roster');
  assertNoClubAInState(c.state);
  assertNoClubAOnTheWire(c);
  assert.equal(rosterPosts(c).length, 0, 'no roster POST in either direction');
  // checkServerSession restores the coach draft itself and the hydration re-reads it: 2 (as before this fix).
  assert.equal(c.counts.published, 1); assert.equal(c.counts.drafts, 2); assert.equal(c.counts.medical, 1);
  assert.match(c.counts.toasts.at(-1), /Switched to/);
  // Back to Club A: its server state was never written to.
  await c.switchTeamTo(CLUB_A);
  await c.flushTimers();
  assert.equal(c.state.stateTeamId, CLUB_A);
  assert.deepEqual(c.state.players.map(p => p.id), ['pa1', 'pa2'], 'Club A roster back from the server, untouched');
  assert.deepEqual(server.rosters[CLUB_A].map(p => p.id), ['pa1', 'pa2']);
  assert.equal(rosterPosts(c).length, 0);
  assert.equal(clubPosts(c).length, 0);
  assert.equal(c.state.clubName, 'Club A RFC', 'Club A config re-read');
});

// ═════════════════════════════════════════════════════════════════════════════
// (J) — a genuinely new user / fresh device
// ═════════════════════════════════════════════════════════════════════════════

test('J: a fresh device claiming a club gets correct empty/default state and writes nothing', async () => {
  const fresh = { stateTeamId: null, currentUserId: '', users: [{ ...COACH }], players: [], fixtures: [], clubName: '', teamName: '',
                  seasonName: '', clubLogo: '', clubColours: null, matchCentre: {}, formationNames: {}, fphotoIds: {}, benchPlayers: [],
                  schedule: [], trainingBlocks: {}, trainingByGroup: {}, trainingAdopted: {}, trainingStateGroupId: null, trainingAttendance: {},
                  sessionNotes: {}, availabilityRequests: [], autopilotReceipts: [], messages: [], meta: { revision: 1 }, activeView: 'coach' };
  const c = client({ state: fresh, server: serverFor(CLUB_B) });
  await c.acceptInvite();
  await c.flushTimers();
  assert.equal(c.events.includes('reset'), false, 'nothing to wipe');
  assert.equal(c.state.stateTeamId, CLUB_B);
  assert.equal(c.owned(), true);
  assert.deepEqual(c.state.players, []);
  assert.equal(c.state.clubName, '');
  assert.equal(rosterPosts(c).length, 0, 'the forensic "[]" roster POST never happens on a fresh device');
  assert.equal(clubPosts(c).length, 0);
  assert.equal(c.counts.firstRun, 1, 'the new owner is offered the first-run setup');
});

// ═════════════════════════════════════════════════════════════════════════════
// Seeding still works for a PROVEN same-club device (the gate is not a blanket ban)
// ═════════════════════════════════════════════════════════════════════════════

test('a proven same-club coach with an empty server roster still seeds it (legacy path preserved)', async () => {
  const c = client({ state: clubAState(), server: serverFor(CLUB_A, { rosters: { [CLUB_A]: [], [CLUB_B]: [] } }) });
  await c.checkServerSession();     // proves Club A
  await c.loadRosterFromServer();   // server empty
  await c.flushTimers();
  assert.equal(rosterPosts(c).length, 1, 'seeded once');
  assert.deepEqual(rosterPosts(c)[0].body.players.map(p => p.id), ['pa1', 'pa2']);
});

test('a proven same-club coach with no server club record still seeds it (legacy path preserved)', async () => {
  const c = client({ state: clubAState(), server: serverFor(CLUB_A, { clubs: { [CLUB_A]: null, [CLUB_B]: null } }) });
  await c.checkServerSession();
  await c.loadClubConfigFromServer();
  assert.equal(clubPosts(c).length, 1, 'seeded once');
  assert.equal(clubPosts(c)[0].body.club.clubName, 'Club A RFC');
  assert.equal(c.counts.firstRun, 0);
});

// ═════════════════════════════════════════════════════════════════════════════
// The marker itself
// ═════════════════════════════════════════════════════════════════════════════

test('the marker is written AFTER the reset, so the wiped state is provably the new club\'s', () => {
  const c = client({ state: clubAState(), server: serverFor(CLUB_A) });
  const changed = c.adoptClubContext(CLUB_B);
  assert.equal(changed, true);
  assert.equal(c.state.stateTeamId, CLUB_B, 'the reset nulls the marker; the stamp lands after it');
  assert.equal(c.contextId(), CLUB_B);
  assert.equal(c.owned(), true);
  assert.equal(c.stored()?.stateTeamId, CLUB_B, 'persisted');
  assert.equal(c.adoptClubContext(CLUB_B), false, 'idempotent: the same club again is not a transition');
});

test('resetTeamScopedState leaves the state UNOWNED until a club is adopted', () => {
  const c = client({ state: clubAState(), server: serverFor(CLUB_A) });
  c.proveClub(CLUB_A);
  assert.equal(c.owned(), true);
  c.adoptClubContext(CLUB_B); // runs the reset internally, then stamps
  // Simulate the raw reset alone (what switchTeamTo runs before the session answers):
  const raw = client({ state: clubAState(), server: serverFor(CLUB_A) });
  raw.proveClub(CLUB_A);
  raw.saveState('x'); // proven → this queues normally
  assert.equal(raw.caches()._rosterSyncPending, true);
  // A reset with NO stamp yet: nothing may be owned, nothing may push, and the
  // EMPTY roster is already the synced baseline (so the stamp's save cannot
  // POST `[]` over the next club's real roster).
  raw.reset();
  assert.equal(raw.owned(), false, 'wiped state is unowned');
  assert.equal(raw.state.stateTeamId, null);
  assert.equal(raw.caches()._rosterSyncPending, false, 'the queued push was cancelled');
  assert.equal(raw.caches()._rosterLastSyncedFp, JSON.stringify([]), 'empty roster is the synced baseline right after the wipe');
  const body = fn('resetClubScopedState');
  assert.match(body, /clearTimeout\(_rosterSyncTimer\)/, 'cancels the queued push');
  assert.match(body, /_rosterLastSyncedFp = rosterFingerprint\(\)/, 'empty roster becomes the synced baseline');
  assert.match(fn('resetTeamScopedState'), /state\.stateTeamId = null;/, 'the wipe un-marks the state');
});

test('state plumbing: stateTeamId is a persisted, explicitly normalised field with NO reader outside the transition', () => {
  assert.match(src, /stateTeamId: null,/, 'defaultState declares it');
  assert.match(src, /next\.stateTeamId = \(typeof input\.stateTeamId === 'string' && input\.stateTeamId\.trim\(\)\)\s*\? input\.stateTeamId\.trim\(\) : null;/,
    'normalizeState keeps a string, nulls junk');
  // Execute exactly the normalisation rule.
  const rule = new Function('input', `const next = {}; ${src.match(/next\.stateTeamId = [^;]+;/)[0]} return next.stateTeamId;`);
  assert.equal(rule({ stateTeamId: CLUB_A }), CLUB_A);
  assert.equal(rule({ stateTeamId: '  ' }), null);
  assert.equal(rule({ stateTeamId: 42 }), null);
  assert.equal(rule({}), null);
  // Performance's teamRef is untouched and still reads state.teamId, never the marker.
  assert.match(src, /ps\.profile\.teamRef = state\.teamId \|\| null/, 'Performance unchanged');
  const readers = (src.match(/state\??\.stateTeamId/g) || []).length;
  assert.ok(readers >= 4 && readers <= 8, `stateTeamId readers are confined to the transition boundary (found ${readers})`);
  assert.doesNotMatch(src, /state\.teamId\s*=/, 'state.teamId is still never assigned');
});

test('every path that moves a device into a club runs adoptClubContext BEFORE using the response', () => {
  const order = (name, first, second) => {
    const body = fn(name);
    const a = body.indexOf(first), b = body.indexOf(second);
    assert.ok(a > 0 && b > 0 && a < b, `${name}: ${first} precedes ${second}`);
  };
  order('loginIdentityAccount', 'adoptClubContext(data.teamMember?.teamId)', 'applyApprovedIdentityLocally(data)');
  order('loginIdentityAccount', 'adoptClubContext(data.teamMember?.teamId)', "saveState('Logged in')");
  order('devLogin', 'adoptClubContext(data.teamMember?.teamId)', 'applyApprovedIdentityLocally(data)');
  order('acceptInvite', 'adoptClubContext(data.teamMember?.teamId)', 'applyApprovedIdentityLocally(data)');
  order('acceptInvite', 'adoptClubContext(data.teamMember?.teamId)', "saveState('Invite claimed')");
  order('clubWizFinish', 'adoptClubContext(data.team?.id || data.teamMember?.teamId)', 'state.clubName = data.team?.name');
  order('clubWizFinish', 'adoptClubContext(data.team?.id || data.teamMember?.teamId)', "saveState('Club created')");
  order('adoptIdentityPayload', 'adoptClubContext(d?.teamMember?.teamId)', '_myPermissions = d.permissions');
  order('switchTeamTo', 'resetClubScopedState()', 'checkServerSession()');
  order('switchTeamTo', 'checkServerSession()', 'hydrateClubFromServer()');
  // ONE reset implementation: switchTeamTo no longer carries its own copy.
  assert.doesNotMatch(fn('switchTeamTo'), /_appearanceAdjustments = null/, 'the invalidation list lives in resetClubScopedState only');
  assert.equal((src.match(/function resetClubScopedState\(/g) || []).length, 1);
  assert.equal((src.match(/function adoptClubContext\(/g) || []).length, 1);
});

test('the seeding heuristics and the roster push are all gated on clubStateOwned()', () => {
  assert.match(fn('loadRosterFromServer'), /if \(clubStateOwned\(\) && \(state\.players \|\| \[\]\)\.length\) queueRosterSync\(\);/);
  assert.match(fn('loadClubConfigFromServer'), /if \(!clubStateOwned\(\)\) return;\s*await saveClubConfigToServer\(\);/);
  const q = fn('queueRosterSync');
  assert.match(q, /if \(!clubStateOwned\(\)\) \{ _rosterSyncDeferred = true; return; \}/);
  assert.equal((q.match(/clubStateOwned\(\)/g) || []).length, 2, 'checked at queue time AND at send time');
  assert.match(fn('flushRosterSync'), /if \(!clubStateOwned\(\)\) \{ _rosterSyncDeferred = true; return; \}/);
  // saveState is unchanged: the gate lives in the push, so no caller can bypass it.
  assert.match(fn('saveState'), /try \{ queueRosterSync\(\); \} catch \{\}/);
});
