/**
 * A FAILED ADMIN LOAD RECOVERS ON ITS OWN (Build 126)
 *
 * The admin data (members, users, structure) is what makes the operating
 * group's roster KNOWN. When its read failed — a 500, a dropped connection, a
 * phone's first fetch after wake — loadAdminData left
 * { loaded:false, failed:true, attempted:true } and the only retry lived
 * inside ensureAdminData(), which runs from a render. Build 125 measured what
 * that meant on the deployed code, with the server healthy again 10s later
 * and nobody touching the screen:
 *
 *   · the Overview had nothing else to repaint it, so no retry ever fired:
 *     "Loading the squad…" was still on show at 70s;
 *   · the Availability board recovered only because its poll happens to pass
 *     through operationalPlayers() — and said "Loading availability…" for a
 *     state that was in fact failed;
 *   · Club Admin called loadAdminData() itself with no backoff, and
 *     loadAdminData repaints on a failure: 3,346 admin reads in 6s.
 *
 * The fix:
 *   A. A REAL failure books ONE retry timer (adminRetryAfterOutcome), which
 *      asks through ensureAdminData() — same entitlement check, same
 *      one-read-at-a-time latch. First retry after the existing 15s, doubling
 *      to a 60s ceiling while the server keeps failing. A success clears it;
 *      a club switch and sign-out cancel it; a coach no longer entitled is
 *      refused when it fires; a discarded stale reply books nothing.
 *   B. operationalRosterFailed(): the board and the Overview say the squad
 *      could not be loaded and is being retried, with a Retry action — never
 *      "loading" for ever, never "No players yet", never a count.
 *   C. Club Admin asks through ensureAdminData() like every other screen.
 *
 * SANDBOX tests run the REAL functions on a controlled clock, timer queue and
 * network. BROWSER tests run the real client, real timers, on desktop and
 * Pixel 5: the first admin read fails, the server is then healthy, and nobody
 * touches the screen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
function fn(name) {
  const m = src.match(new RegExp(`\\n(\\s*)(?:async )?function ${name}\\s*\\(`));
  assert.ok(m, `function ${name} not found`);
  const start = m.index + 1;
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}
const one = re => { const m = src.match(re); assert.ok(m, `source not found: ${re}`); return m[0]; };
const stripComments = s => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const APP = new Function(`
  ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
  ${fn('availWeekStart')} ${fn('availAddDays')} ${fn('availToday')} ${fn('availSlotDateInWeek')} ${fn('availTrainingEventId')} ${fn('availabilityEventsForWeek')}
  return { availWeekStart, availAddDays, availToday, availabilityEventsForWeek };
`)();
const TODAY = APP.availToday(), WEEK = APP.availWeekStart(TODAY);
const inWeek = (d, today) => { const w = APP.availWeekStart(today); return APP.availabilityEventsForWeek(w, { fixtures: [{ id: 'p', opposition: 'P', date: d, status: 'scheduled' }], slots: [], currentWeekStart: w }).some(e => e.id === 'p'); };
const MATCH_DAY = (() => { let day = TODAY; for (let i = 0; i < 14; i++) { const n = APP.availAddDays(day, 1); if (!inWeek(n, TODAY)) break; day = n; } return day; })();
const SAT = 'fx_sat', GRP = 'grp_sen';
const S = 1000;

// ═══════════════════════════════════════════════════════════════════════════
// SANDBOX 1 — the retry machinery: the real ensureAdminData / loadAdminData /
// adminRetryAfterOutcome / adminRetryCancel / adminDataRetryNow, the real
// resetClubScopedState, settingsSignOut, canI and sessionSignedOut, over a
// controlled clock, timer queue and network
// ═══════════════════════════════════════════════════════════════════════════
const BODY = club => ({
  '/api/identity': { users: [], team_members: [{ userId: 'm_' + club, teamId: club, role: 'player' }], player_profiles: [] },
  '/api/invite': { invites: [] }, '/api/publish?resource=club': { club: { id: club, name: 'Club ' + club } },
  '/api/publish?resource=structure': { structure: {}, counts: { groups: {} }, clubWideStaffIds: [], clubWideStaff: [] },
});
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
/**
 * net.mode — how the server answers the admin read:
 *   'ok' | 500 (identity answers 500, the other three 200) | 'throw' (the
 *   network drops: every fetch rejects) | 'hold' (answers nothing until
 *   net.answer(mode)).
 */
function app({ club = 'A' } = {}) {
  const net = { mode: 'ok', club, reads: 0, live: 0, maxLive: 0, held: [], readAt: [] };
  const calls = { renders: 0, legacy: 0 };
  const settle = (entry, mode) => {
    if (entry.url === '/api/identity') net.live--;
    if (mode === 'throw') return entry.reject(new TypeError('Failed to fetch'));
    const status = entry.url === '/api/identity' && mode === 500 ? 500 : 200;
    entry.resolve({ ok: status < 300, status, json: async () => BODY(entry.club)[entry.url] });
  };
  const fetchStub = (url, opts) => new Promise((resolve, reject) => {
    if (opts && opts.method === 'POST') return resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
    const entry = { url, resolve, reject, club: net.club };
    if (url === '/api/identity') { net.reads++; net.live++; net.maxLive = Math.max(net.maxLive, net.live); net.readAt.push(clock.now); }
    if (net.mode === 'hold') net.held.push(entry); else settle(entry, net.mode);
  });
  net.answer = async mode => { const held = net.held.splice(0); held.forEach(e => settle(e, mode)); await flush(); };
  const clock = { now: 1000000, timers: new Map(), seq: 0, maxTimers: 0 };
  const body = `
    "use strict";
    const fetch = arguments[0], calls = arguments[1], clock = arguments[2], CFG = arguments[3];
    const Date = { now: () => clock.now }; const console = { warn() {} };
    const setTimeout = (f, ms) => { const id = ++clock.seq; clock.timers.set(id, { at: clock.now + ms, f, ms }); clock.maxTimers = Math.max(clock.maxTimers, clock.timers.size); return id; };
    const clearTimeout = id => { clock.timers.delete(id); };
    let _clubContextId = CFG.club;
    let state = { activeView: 'coach', activeCoachSection: 'overview', fixtures: [], currentUserId: 'u1', users: [], features: {} };
    let _myPermissions = ['manage_players', 'manage_teams'], _myMemberships = [], _myMembership = null;
    let _serverAuthState = 'authed', _serverSessionReadyFor = 'u1';
    function isCoach() { return true; }
    function render() { calls.renders++; }
    function renderClubAdmin() { calls.legacy++; } function renderSettings() { calls.legacy++; } function renderPlayers() { calls.legacy++; } function renderMatchday() { calls.legacy++; }
    function applyClubConfigLocally() {} function noteFixturesSynced() {}
    // what resetClubScopedState() clears besides the admin data
    let _rosterSyncTimer = null, _rosterSyncPending = false, _rosterSyncDeferred = false, _rosterLastSyncedFp = null;
    function resetTeamScopedState() {} function rosterFingerprint() { return ''; }
    let _appearanceAdjustments = null, _seasonSheets = null, _seasonSheetsGroup = null, _trainingPubState = {}, _trainingPubLoadedAt = 0;
    let _trainingSchedule = null, _trainingScheduleAttempted = false, _groupRecipients = {}, _clubConfigChecked = false, _publishedStateLoadedAt = 0;
    let _autopilotEnsured = false, _autopilotLogAt = 0, _autopilotLog = [];
    // what settingsSignOut() touches besides the admin data
    async function ceConfirm() { return true; }
    function resetIdentityScopedState() {} function saveState() {} function renderAuthBanner() {} function showToast() {} function chatStopPolling() {}
    let _chatMessages = {}, _sharedMedical = null, _welcomeDismissed = true, authTab = 'closed';
    const testAccounts = [];
    ${one(/let _adminData = \{[^\n]*\};/)}
    let _adminDataAttemptAt = 0;
    ${one(/const ADMIN_RETRY_FIRST_MS = [^\n]*;/)}
    ${one(/let _adminRetryTimer = null;/)}
    ${one(/let _adminRetryFails = 0;/)}
    ${fn('sessionSignedOut')} ${fn('canI')}
    ${fn('ensureAdminData')} ${fn('adminRetryCancel')} ${fn('adminRetryAfterOutcome')} ${fn('adminDataRetryNow')}
    ${fn('loadAdminData')}
    ${fn('resetClubScopedState')}
    ${fn('settingsSignOut')}
    return {
      load: force => loadAdminData(force), ensure: () => ensureAdminData(), retryNow: () => adminDataRetryNow(),
      admin: () => _adminData, fails: () => _adminRetryFails, timerSet: () => _adminRetryTimer !== null,
      leaveClub: () => resetClubScopedState(), adopt: c => { _clubContextId = c; },
      signOut: () => settingsSignOut(),
      revoke: () => { _myPermissions = ['reports', 'messaging']; },
      expireSession: () => { _serverAuthState = 'anon'; },
    };
  `;
  const api = new Function(body)(fetchStub, calls, clock, { club });
  /** Run the clock forward, firing each due timer at its own moment and letting its work settle. */
  const advance = async ms => {
    const end = clock.now + ms;
    for (let fired = 0; ; fired++) {
      const due = [...clock.timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      // A retry with no backoff re-books itself for "now" for ever: fail loudly instead of hanging the suite.
      assert.ok(fired < 500, `retry storm: ${fired} timers fired inside one ${ms / S}s window`);
      clock.timers.delete(due[0]); clock.now = Math.max(clock.now, due[1].at); due[1].f(); await flush();
    }
    clock.now = end; await flush();
  };
  /** Fire the pending timers WITHOUT the wall clock moving (a clock set back, a coarse Date.now()). */
  const fireFrozen = async () => { const due = [...clock.timers.entries()]; due.forEach(([id, t]) => { clock.timers.delete(id); t.f(); }); await flush(); };
  return { ...api, net, calls, clock, advance, fireFrozen, timers: () => clock.timers.size, waits: () => [...clock.timers.values()].map(t => t.ms) };
}
/** A device whose first admin read has just FAILED (500 unless told otherwise). */
async function failedDevice({ mode = 500 } = {}) {
  const a = app();
  a.net.mode = mode;
  await a.load(); await flush();
  assert.equal(a.admin().failed, true, 'the first read failed'); assert.equal(a.admin().loaded, false);
  assert.equal(a.net.reads, 1);
  return a;
}

test('1. a failed admin load recovers WITHOUT interaction: one retry is booked for 15s, it asks by itself, and the landing renders once', async () => {
  for (const mode of [500, 'throw']) {
    const a = await failedDevice({ mode });
    assert.equal(a.timers(), 1, `${mode}: exactly one retry is booked`);
    assert.deepEqual(a.waits(), [15 * S], 'for the existing 15s backoff');
    a.net.mode = 'ok';                                // the server is healthy again — and nothing renders, nobody taps
    const renders = a.calls.renders;
    await a.advance(15 * S - 1);
    assert.equal(a.net.reads, 1, 'nothing before the backoff has run out');
    await a.advance(1);
    assert.equal(a.net.reads, 2, 'the retry went out on its own');
    assert.equal(a.admin().loaded, true, 'and the admin data landed');
    assert.equal(a.admin().failed, false);
    assert.equal(a.calls.renders - renders, 1, 'one render() for the landing (Build 122)');
    assert.equal(a.calls.legacy, 0, 'through render(), no hand-picked screen');
    assert.equal(a.timers(), 0, 'and no retry is left booked');
    assert.equal(a.fails(), 0);
  }
});

test('1b. the booked retry does not ask the wall clock again: it goes out even if Date.now() has not moved', async () => {
  const a = await failedDevice();
  a.net.mode = 'ok';
  await a.fireFrozen();                               // the timer fires; the 15s gate, asked now, would still say "too soon"
  assert.equal(a.net.reads, 2, 'the timer IS the backoff');
  assert.equal(a.admin().loaded, true);
  // ...while a render-driven ask inside the backoff is still refused, exactly as before.
  const b = await failedDevice();
  for (let i = 0; i < 50; i++) b.ensure();
  await flush();
  assert.equal(b.net.reads, 1, 'ensureAdminData() from a render keeps the 15s backoff');
});

test('4. the Retry action asks NOW — no 15s wait — recovers, repaints, and leaves nothing booked', async () => {
  const a = await failedDevice();
  a.net.mode = 'ok';
  const renders = a.calls.renders;
  a.retryNow(); await flush();
  assert.equal(a.net.reads, 2, 'a read at once');
  assert.equal(a.admin().loaded, true); assert.equal(a.admin().failed, false);
  assert.ok(a.calls.renders - renders >= 2, 'the screen is repainted for the retry starting and for its landing');
  assert.equal(a.timers(), 0, 'the automatic retry it replaced is gone');
  await a.advance(10 * 60 * S);
  assert.equal(a.net.reads, 2, 'and never fires afterwards');
});

test('4b. a Retry that fails again starts the backoff over: the next automatic retry is 15s away, not later', async () => {
  const a = await failedDevice();
  await a.advance(15 * S); await a.advance(30 * S);   // two more automatic failures: the wait has grown
  assert.deepEqual(a.waits(), [60 * S]);
  a.retryNow(); await flush();                        // still failing
  assert.equal(a.admin().failed, true);
  assert.deepEqual(a.waits(), [15 * S], 'the coach asked: the backoff starts over');
  assert.equal(a.timers(), 1);
});

test('5. the Retry action cannot create a second in-flight read: taps, a render and the timer all join the one that is out', async () => {
  const a = await failedDevice();
  a.net.mode = 'hold';
  a.retryNow();
  const renders = a.calls.renders;
  a.retryNow(); a.retryNow();
  assert.equal(a.calls.renders, renders, 'a tap while the retry is out joins it: nothing is asked and nothing is repainted');
  a.ensure(); a.load(); a.load(true);
  await flush();
  assert.equal(a.net.reads, 2, 'one read for all of it');
  assert.equal(a.net.live, 1); assert.equal(a.net.maxLive, 1, 'never two admin reads out at once');
  await a.advance(5 * 60 * S);                        // any timer still around fires while that read is out
  a.retryNow();
  assert.equal(a.net.reads, 2); assert.equal(a.net.maxLive, 1);
  await a.net.answer('ok');
  assert.equal(a.admin().loaded, true);
  assert.equal(a.timers(), 0);
});

test('6. the automatic retry is never more than one request, and never more than one timer', async () => {
  const a = await failedDevice();
  a.net.mode = 'hold';
  await a.advance(15 * S);                            // the retry leaves, and the server sits on it
  assert.equal(a.net.reads, 2); assert.equal(a.net.live, 1);
  for (let i = 0; i < 40; i++) { a.ensure(); await a.advance(15 * S); }   // ten minutes of renders and ticks
  assert.equal(a.net.reads, 2, 'nothing else leaves while it is out');
  assert.equal(a.net.maxLive, 1);
  assert.equal(a.timers(), 0, 'and nothing is booked until it has an outcome');
  await a.net.answer(500);
  assert.equal(a.timers(), 1, 'its failure books the next — one');
  assert.equal(a.clock.maxTimers, 1, 'there was never a second timer');
});

test('7. a successful load cancels the booked retry; a refresh that fails over data already held books none', async () => {
  // a render-driven ask (after the 15s gate) lands first
  const a = await failedDevice();
  a.net.mode = 'ok';
  a.clock.now += 15 * S;                              // the gate has run out; the timer has not been fired yet
  a.ensure(); await flush();
  assert.equal(a.admin().loaded, true); assert.equal(a.net.reads, 2);
  assert.equal(a.timers(), 0, 'the booked retry is cancelled by the success');
  await a.advance(10 * 60 * S);
  assert.equal(a.net.reads, 2, 'no read after the data has landed');
  // a forced reload that fails over data already held is not a roster to recover
  a.net.mode = 500;
  await a.load(true); await flush();
  assert.equal(a.admin().loaded, true, 'the data held is kept');
  assert.equal(a.timers(), 0, 'and no retry is booked for a roster that is known');
});

test('8. a club switch cancels the retry, and a reply that lands after the switch is not a failure', async () => {
  const a = await failedDevice();
  assert.equal(a.timers(), 1);
  a.leaveClub(); a.adopt('B');                        // the real resetClubScopedState()
  assert.equal(a.timers(), 0, 'the retry booked for club A is gone');
  assert.equal(a.timerSet(), false); assert.equal(a.fails(), 0);
  assert.equal(a.admin().failed, false, 'the next club starts clean: loading, not failed');
  await a.advance(10 * 60 * S);
  assert.equal(a.net.reads, 1, 'and never asks under club B');
  // STALE ≠ FAILED: club A's read is out when the switch happens, and comes back as an error.
  for (const mode of [500, 'throw']) {
    const b = app({ club: 'A' });
    b.net.mode = 'hold';
    const p = b.load(); await flush();
    b.leaveClub(); b.adopt('B');
    await b.net.answer(mode); await p;
    assert.equal(b.admin().failed, false, `${mode}: a discarded reply is not this club's failure`);
    assert.equal(b.admin().attempted, false, 'no attempt recorded (Build 117)');
    assert.equal(b.timers(), 0, 'and no retry is booked for it');
    assert.equal(b.calls.renders, 0, 'nor a render');
    b.net.mode = 'ok'; b.net.club = 'B';
    b.ensure(); await flush();
    assert.equal(b.net.reads, 2, 'so the next ask goes out at once');
    assert.deepEqual(b.admin().members.map(m => m.teamId), ['B'], 'and it is club B\'s data');
  }
});

test('9. sign-out cancels the retry — the Sign out action, and a session the server has ended', async () => {
  const a = await failedDevice();
  await a.signOut();                                  // the real settingsSignOut()
  assert.equal(a.timers(), 0, 'the retry is cancelled');
  a.net.mode = 'ok';
  await a.advance(10 * 60 * S);
  assert.equal(a.net.reads, 1, 'no admin read after sign-out');
  assert.equal(a.admin().loaded, false);
  // The server ended the session (expired cookie, signed out in another tab): no sign-out code ran here.
  const b = await failedDevice();
  b.expireSession(); b.net.mode = 'ok';
  await b.advance(10 * 60 * S);
  assert.equal(b.net.reads, 1, 'the retry is refused when it fires');
  assert.equal(b.timers(), 0, 'and nothing is booked after it');
});

test('10. a coach no longer entitled to the admin data: the retry is refused and nothing more is booked', async () => {
  const a = await failedDevice();
  a.revoke(); a.net.mode = 'ok';
  await a.advance(15 * S);
  assert.equal(a.net.reads, 1, 'no read');
  assert.equal(a.timers(), 0, 'no further retry');
  await a.advance(10 * 60 * S);
  assert.equal(a.net.reads, 1);
  a.retryNow(); await flush();
  assert.equal(a.net.reads, 1, 'and the Retry action is refused too');
});

test('11. a server that stays down is asked on a backoff — 15s, 30s, then once a minute — never a storm, and recovers when it heals', async () => {
  const a = await failedDevice();
  const t0 = a.net.readAt[0];
  await a.advance(10 * 60 * S);                       // ten minutes down, nothing rendering
  const at = a.net.readAt.map(t => (t - t0) / S);
  assert.deepEqual(at.slice(0, 5), [0, 15, 45, 105, 165], 'first retry after 15s, then 30s, then every 60s');
  const gaps = at.slice(1).map((t, i) => t - at[i]);
  assert.ok(gaps.every(g => g >= 15), 'never closer together than the 15s backoff: ' + JSON.stringify(gaps));
  assert.ok(gaps.slice(2).every(g => g === 60), 'the wait stops growing at 60s');
  assert.equal(a.net.reads, 12, 'twelve reads in ten minutes');
  assert.equal(a.net.maxLive, 1, 'one at a time');
  assert.equal(a.clock.maxTimers, 1, 'one timer at a time');
  assert.equal(a.calls.renders, 12, 'one render per real outcome, as before');
  a.net.mode = 'ok';
  await a.advance(60 * S);
  assert.equal(a.admin().loaded, true, 'healthy again: the next retry lands');
  assert.equal(a.timers(), 0);
  const reads = a.net.reads;
  await a.advance(60 * 60 * S);
  assert.equal(a.net.reads, reads, 'and it is quiet from then on');
});

test('11b. renders during an outage (the Availability poll path) do not beat the 15s backoff or overlap the retry', async () => {
  const a = await failedDevice();
  for (let i = 0; i < 120; i++) { a.ensure(); await a.advance(5 * S); }   // a render-driven ask every 5s for ten minutes
  const gaps = a.net.readAt.slice(1).map((t, i) => (t - a.net.readAt[i]) / S);
  assert.ok(gaps.every(g => g >= 15), 'never closer than 15s: ' + JSON.stringify(gaps.slice(0, 8)));
  assert.equal(a.net.maxLive, 1); assert.equal(a.clock.maxTimers, 1);
});

test('12. a healthy load books nothing: one read, one render, no timer — exactly as before', async () => {
  const a = app();
  await a.load(); await flush();
  assert.equal(a.admin().loaded, true); assert.equal(a.admin().failed, false);
  assert.equal(a.net.reads, 1); assert.equal(a.calls.renders, 1);
  assert.equal(a.timers(), 0); assert.equal(a.clock.maxTimers, 0, 'no timer was ever set');
  await a.advance(60 * 60 * S);
  assert.equal(a.net.reads, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// SANDBOX 2 — what the Availability board says: the real operationalPlayers /
// operationalRosterKnown / operationalRosterFailed / availabilityChaseContext /
// renderMessageCenterV2
// ═══════════════════════════════════════════════════════════════════════════
const P = i => ({ id: 'p' + i, userId: 'u_p' + i, name: 'Player ' + i, position: 'Prop', playerGroupId: GRP });
const RESOLVED = () => { const r = {}; for (let i = 0; i < 5; i++) r['u_p' + i] = { [SAT]: { response: 'available', respondedAt: '2026-09-23T08:00:00Z' } }; r.u_p5 = { [SAT]: { response: 'maybe' } }; r.u_p6 = { [SAT]: { response: 'unavailable', reason: 'work' } }; return r; };
/** admin — the admin data's flags; entitled — the coach may read it; group — a group in force; players — the device's roster rows. */
function device({ admin = { loaded: false, loading: false, failed: true }, entitled = true, group = GRP, players = Array.from({ length: 18 }, (_, i) => P(i)), members = null } = {}) {
  const mem = members || players.map(p => ({ userId: p.userId, playerGroupId: GRP, role: 'player' }));
  const body = `
    "use strict";
    const CFG = arguments[0];
    const painted = {};
    const document = { getElementById: id => ({ set innerHTML(v) { painted[id] = v; }, get innerHTML() { return painted[id] || ''; } }), querySelector: () => null, querySelectorAll: () => [] };
    let _clubContextId = 'team_home';
    let state = { operationalGroupId: CFG.group, players: CFG.players, fixtures: [{ id: '${SAT}', groupId: '${GRP}', opposition: 'Kituro', date: '${MATCH_DAY}', kickoffTime: '14:00', status: 'scheduled' }],
                  schedule: [], messages: [], availabilityRequests: [], matchCentre: {}, trainingBlocks: {}, activeView: 'coach', activeCoachSection: 'message',
                  selectedMessagePlayerId: null, autoSendSchedule: null, messageDetail: '${SAT}' };
    let _adminData = { members: CFG.members, ...CFG.admin };
    let _resolvedAvailability = ${JSON.stringify(RESOLVED())}, _resolvedAvailabilityGroup = CFG.group || '';
    let _availLastSync = new Date().toISOString(), _availReadFailed = false;
    let _trainingSchedule = { slots: [] }, _trainingScheduleGroupId = CFG.group || '', _trainingScheduleAttempted = false;
    let _availTodayOverride = '';
    let availabilityBoardFilter = 'all', availabilityBoardSort = 'status';
    const BETA_SIMPLE_UI = true;
    const EMPTY_PLAYER = { id: '', name: '', position: '' };
    const REASON_LABELS = { injury: 'Injury', work: 'Work', holiday: 'Holiday', family: 'Family', other: 'Other' };
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function canI(p) { return CFG.entitled ? true : !['manage_players', 'manage_teams'].includes(p); }
    function ensureAdminData() {}
    function canonicalVisiblePlayers() { return state.players; }
    function playerGroupIdOf(p) { return p.playerGroupId || ''; }
    function operationalGroups() { return [{ id: '${GRP}', name: 'Seniors' }]; }
    function trainingGroupParam() { return state.operationalGroupId || ''; }
    function ensureTrainingSchedule() {}
    function playerIsArchived() { return false; }
    function contextFixtures() { return state.fixtures; } function normalizeFixture(f) { return f; }
    function fixturesKnown() { return true; }
    function availabilityPendingFor() { return null; }
    function coachAvailWeek() { return availWeekStart(availToday()); }
    function sortAvailabilityRows(rows) { return rows; }
    function percent(a, b) { return b ? Math.round(a / b * 100) : 0; }
    function fmtRespondedAt() { return ''; } function playerAttendancePct() { return null; } function attendanceLabel() { return '—'; } function attendanceUnknownReason() { return ''; }
    function sessionTypeIcon() { return ''; }
    function operationalGroupSwitcherHTML() { return ''; } function ceProductMarkHtml() { return ''; } function availWeekLabel() { return 'This week'; }
    function buildPlayerDetailHtml() { return ''; }
    function renderManageSessions() { return ''; }
    ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
    ${fn('availWeekStart')} ${fn('availAddDays')} ${fn('availToday')} ${fn('availSlotDateInWeek')} ${fn('availTrainingEventId')} ${fn('availabilityEventsForWeek')}
    ${fn('availDatedWeekLabel')} ${fn('availabilitySessionLabel')} ${fn('statusLabel')}
    ${fn('sessionKey')} ${fn('sessionReasonKey')} ${fn('normalizeSessionId')} ${fn('liveAvailabilityPlayerKeys')}
    ${fn('clubUsesPlayerGroups')} ${fn('operationalPlayers')} ${fn('operationalRosterKnown')} ${fn('operationalRosterFailed')}
    ${fn('currentResolvedAvailability')} ${fn('availabilityLastReadFailed')} ${fn('availabilityReadUnknown')} ${fn('resolvedAnswerFor')} ${fn('sessionRows')}
    ${fn('availabilityNonResponders')} ${fn('availabilityWeekSessions')} ${fn('availabilityRequestMatches')} ${fn('availabilityRequestedSessions')} ${fn('availabilityChaseContext')}
    ${fn('coachAvailEvents')} ${fn('coachSelectedEvent')} ${fn('availabilityRowMatchesFilter')}
    ${fn('renderMessageCenterV2')}
    return {
      known: () => operationalRosterKnown(), failed: () => operationalRosterFailed(), status: () => availabilityChaseContext(coachAvailWeek()).status,
      paint: () => { renderMessageCenterV2(); return painted['coach-message'] || ''; },
    };
  `;
  return new Function(body)({ admin, entitled, group, players, members: mem });
}
const read = html => ({
  failedCopy: /The squad could not be loaded/.test(html),
  notEmpty: /This is not an empty squad/.test(html),
  auto: /Trying again automatically\./.test(html),
  retrying: /Trying again now…/.test(html),
  retryBtn: /class="ovw-retry" onclick="adminDataRetryNow\(\)">Try again<\/button>/.test(html),
  loading: /Loading availability…/.test(html),
  noPlayers: /No players yet/.test(html),
  invite: /openInvitePlayersModal\(\)/.test(html),
  kpi: [...html.matchAll(/<article class="msg-kpi ([a-z-]+)"><span>([^<]*)<\/span><strong>(\d+)<\/strong>/g)].map(m => `${m[2]} ${m[3]}`),
  rows: (html.match(/class="msg-player-row/g) || []).length,
  noReplyChips: (html.match(/class="msg-chip no-reply">No reply</g) || []).length,
  toChase: /to chase/.test(html), chaseAll: /chaseAllNonResponders\(\)/.test(html),
});

test('2. the FAILED state says so: the squad could not be loaded, it is not empty, it is being retried — with a Try again action', () => {
  const d = device({ admin: { loaded: false, loading: false, failed: true } });
  assert.equal(d.known(), false); assert.equal(d.failed(), true);
  assert.equal(d.status(), 'loading', 'the chase context still claims nothing');
  const r = read(d.paint());
  assert.equal(r.failedCopy, true, '"The squad could not be loaded"');
  assert.equal(r.notEmpty, true, '"This is not an empty squad"');
  assert.equal(r.auto, true, '"Trying again automatically."');
  assert.equal(r.retryBtn, true, 'the Retry action');
  assert.equal(r.loading, false, 'not "Loading availability…" — it is not loading');
});

test('2b. while the retry is out, the block says "Trying again now…" and offers no second button', () => {
  const r = read(device({ admin: { loaded: false, loading: true, failed: true } }).paint());
  assert.equal(r.failedCopy, true); assert.equal(r.retrying, true);
  assert.equal(r.retryBtn, false); assert.equal(r.auto, false); assert.equal(r.loading, false);
});

test('3. the FAILED state claims nothing: no "No players yet", no Invite, no zeroed KPIs, no player rows, no No-reply chips, no chase', () => {
  for (const loading of [false, true]) {
    const r = read(device({ admin: { loaded: false, loading, failed: true } }).paint());
    assert.equal(r.noPlayers, false, 'no "No players yet"');
    assert.equal(r.invite, false, 'no Invite players');
    assert.deepEqual(r.kpi, [], 'no AVAILABLE 0 / MAYBE 0 / UNAVAILABLE 0 / NO REPLY 0');
    assert.equal(r.rows, 0); assert.equal(r.noReplyChips, 0, 'nobody is marked No reply');
    assert.equal(r.toChase, false); assert.equal(r.chaseAll, false, 'and nobody is chased');
  }
});

test('LOADING, KNOWN-EMPTY and FAILED are three different states (Builds 110 / 122 intact)', () => {
  // genuinely loading: first read out, nothing failed
  let d = device({ admin: { loaded: false, loading: true, failed: false } });
  assert.equal(d.failed(), false);
  let r = read(d.paint());
  assert.equal(r.loading, true, '"Loading availability…"'); assert.equal(r.failedCopy, false);
  assert.equal(r.noPlayers, false); assert.deepEqual(r.kpi, []); assert.equal(r.rows, 0);
  // not asked yet at all
  r = read(device({ admin: { loaded: false, loading: false, failed: false } }).paint());
  assert.equal(r.loading, true); assert.equal(r.failedCopy, false);
  // known empty
  d = device({ admin: { loaded: true, loading: false, failed: false }, players: [], members: [{ userId: 'u_coach', playerGroupId: GRP, role: 'coach' }] });
  assert.equal(d.known(), true); assert.equal(d.status(), 'ready');
  r = read(d.paint());
  assert.equal(r.noPlayers, true, 'a roster KNOWN empty still says "No players yet"'); assert.equal(r.invite, true);
  assert.equal(r.failedCopy, false); assert.equal(r.loading, false);
  // known, with data held, though the last refresh failed: the board shows the data
  d = device({ admin: { loaded: true, loading: false, failed: true } });
  assert.equal(d.failed(), false, 'a roster that is known is not a failed one');
  r = read(d.paint());
  assert.deepEqual(r.kpi, ['Available 5', 'Maybe 1', 'Unavailable 1', 'No reply 11']); assert.equal(r.rows, 18); assert.equal(r.failedCopy, false);
});

test('operationalRosterFailed() is exactly "unknown AND the read failed", in every combination', () => {
  for (const group of [GRP, '']) for (const loaded of [true, false]) for (const failed of [true, false]) for (const entitled of [true, false]) {
    const d = device({ group, entitled, admin: { loaded, loading: false, failed } });
    const expected = !!group && !loaded && entitled && failed;
    assert.equal(d.failed(), expected, `group=${group || 'none'} loaded=${loaded} failed=${failed} entitled=${entitled}`);
    if (d.failed()) assert.equal(d.known(), false, 'failed implies unknown');
  }
});

test('SOURCE: one retry path, settled only by a real outcome; the cancels; Club Admin through the gate; the failed branches on both screens', () => {
  const ensure = stripComments(fn('ensureAdminData'));
  assert.match(ensure, /^\s*function ensureAdminData\(retryDue = false\)/);
  assert.match(ensure, /if \(!canI\('manage_players'\) && !canI\('manage_teams'\)\) return;\s*if \(_adminData\.loaded \|\| _adminData\.loading\) return;\s*if \(!retryDue && _adminData\.attempted && Date\.now\(\) - _adminDataAttemptAt < 15000\) return;\s*loadAdminData\(\);/,
    'entitlement, the one-in-flight latch, then the backoff — which only the booked retry may skip');
  const after = stripComments(fn('adminRetryAfterOutcome'));
  assert.match(after, /_adminRetryTimer = setTimeout\(\(\) => \{ _adminRetryTimer = null; ensureAdminData\(true\); \}, wait\);/, 'the timer asks through ensureAdminData — no second loader');
  assert.equal((after.match(/setTimeout\(/g) || []).length, 1, 'one timer');
  assert.match(after, /if \(_adminRetryTimer\) clearTimeout\(_adminRetryTimer\);/, 'the previous one is always cleared first');
  const load = stripComments(fn('loadAdminData'));
  assert.match(load, /if \(!_discarded\) \{\s*_adminData\.loading = false;\s*_adminData\.attempted = true;\s*_adminDataAttemptAt = Date\.now\(\);\s*if \(typeof adminRetryAfterOutcome === 'function'\) adminRetryAfterOutcome\(\);\s*\} else if/,
    'settled inside the real-outcome branch only — a discarded reply books nothing');
  assert.equal((load.match(/adminRetryAfterOutcome\(\)/g) || []).length, 1);
  assert.doesNotMatch(load, /setTimeout\(/, 'loadAdminData itself sets no timer');
  assert.match(stripComments(fn('resetClubScopedState')), /if \(typeof adminRetryCancel === 'function'\) adminRetryCancel\(\);/, 'a club switch cancels');
  assert.match(stripComments(fn('settingsSignOut')), /if \(typeof adminRetryCancel === 'function'\) adminRetryCancel\(\);/, 'sign-out cancels');
  const admin = stripComments(fn('renderClubAdmin'));
  assert.match(admin, /if \(active && typeof ensureAdminData === 'function'\) ensureAdminData\(\);/, 'Club Admin asks through the gate');
  assert.doesNotMatch(admin.split('\n').filter(l => !/onclick=/.test(l)).join('\n'), /loadAdminData\(\)/, 'and never calls the loader bare from a render');
  const failed = stripComments(fn('operationalRosterFailed'));
  assert.match(failed, /return !operationalRosterKnown\(\) && !!_adminData\.failed;/);
  const board = stripComments(fn('renderMessageCenterV2'));
  assert.match(board, /const rosterFailed\s*=\s*typeof operationalRosterFailed === 'function' && operationalRosterFailed\(\);/);
  assert.match(board, /const availLoadingHTML = rosterFailed\s*\?/, 'the loading branch\'s block is the failed one when the roster failed');
  assert.doesNotMatch(board, /loadAdminData\(|fetch\(/, 'the renderer still fetches nothing');
  const ovw = stripComments(fn('renderClubCommandDashboard'));
  assert.match(ovw, /const rosterFailed = typeof operationalRosterFailed === 'function' && operationalRosterFailed\(\);/);
  assert.match(ovw, /const rosterLoadingBody = rosterFailed\s*\?/);
  assert.match(ovw, /<strong>Squad could not be loaded<\/strong>This is not an empty squad — the squad list did not load\./);
  assert.match(ovw, /onclick="event\.stopPropagation\(\);adminDataRetryNow\(\)">Try again<\/button>/, 'the card is a link: the retry must not navigate');
  assert.match(ovw, /<strong>Loading the squad…<\/strong>Availability appears once the squad has loaded\./, 'the loading copy is unchanged');
});

// ═══════════════════════════════════════════════════════════════════════════
// BROWSER — the real client and real timers: the first admin read FAILS, the
// server is then healthy, and nobody touches the screen
// ═══════════════════════════════════════════════════════════════════════════
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed: the browser tests skip */ }
const BGRP = 'grp_initial', TEAM = 'team_stub';
const PLAYERS = Array.from({ length: 18 }, (_, i) => ({ id: 'p' + i, userId: 'u_p' + i, name: 'Player ' + i, position: 'Prop', playerGroupId: BGRP }));
const FIXTURES = [{ id: SAT, groupId: BGRP, opposition: 'Kituro', date: MATCH_DAY, kickoffTime: '14:00', status: 'scheduled' }];
const SESSION = { ok: true, user: { id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach', platformRole: '' },
  teamMember: { teamId: TEAM, userId: 'u1', role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: null },
  permissions: ['reports', 'messaging', 'manage_players', 'manage_teams', 'manage_coaches', 'training', 'matchday', 'publish_training'],
  memberships: [{ teamId: TEAM, teamName: 'Stub RFC', role: 'coach', staffLevel: 'head', canonicalRole: 'head_coach', current: true }],
  operational: { player: { groups: [], defaultGroupId: null, mustChoose: false }, staff: { groups: [{ id: BGRP, name: 'Seniors', developmentCategory: 'adult' }], defaultGroupId: BGRP, mustChoose: false } } };
/** ctl.identity — how the admin read's own call (GET /api/identity) answers: 'ok' | 'fail' (500). ctl.hold()/release() hold the admin read's /api/invite. */
function stubServer() {
  const ctl = { identity: 'ok', gate: null, api: [] };
  let release = () => {};
  const srv = http.createServer(async (req, res) => {
    const u = req.url || '/';
    if (u.startsWith('/api/')) ctl.api.push(req.method + ' ' + u.replace(/[?&](_t|ts|_)=\d+/g, ''));
    const send = (o, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u === '/api/identity' && req.method === 'GET' && ctl.identity === 'fail') return send({ ok: false, error: 'boom' }, 500);
    if (u.startsWith('/api/invite') && ctl.gate) await ctl.gate;
    if (u.startsWith('/api/availability')) {
      const resolved = {}; PLAYERS.slice(0, 5).forEach(p => { resolved[p.userId] = { [SAT]: { response: 'available', respondedAt: '2026-09-23T08:00:00Z' } }; });
      resolved.u_p5 = { [SAT]: { response: 'maybe' } }; resolved.u_p6 = { [SAT]: { response: 'unavailable', reason: 'work' } };
      return send({ resolved, roster: PLAYERS });
    }
    if (u.startsWith('/api/identity')) return send(SESSION);
    if (u.startsWith('/api/publish?resource=fixtures')) return send({ ok: true, fixtures: FIXTURES });
    if (u.startsWith('/api/publish?resource=matchday-teams')) return send({ ok: true, groups: [{ id: BGRP, name: 'Seniors', status: 'active' }], teams: [] });
    if (u.startsWith('/api/publish?resource=training-schedule')) return send({ ok: true, slots: [], groupId: BGRP, canEdit: true });
    if (u.startsWith('/api/publish?resource=roster')) return send({ ok: true, players: PLAYERS });
    if (u.startsWith('/api/publish')) return send({ ok: true, club: { id: TEAM, name: 'Stub RFC', fixtures: FIXTURES } });
    if (u.startsWith('/api/chat')) return send({ ok: true, conversations: [], messages: [] });
    if (u.startsWith('/api/schedules')) return send({ ok: true, schedules: [] });
    if (u.startsWith('/api/templates')) return send({ ok: true, templates: [] });
    if (u.startsWith('/api/')) return send({ ok: true });
    const f = u === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try { res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); res.end(fs.readFileSync(f)); }
    catch { res.statusCode = 404; res.end(); }
  });
  ctl.hold = () => { ctl.gate = new Promise(r => { release = r; }); };
  ctl.release = () => { release(); ctl.gate = null; };
  /** One admin read = one structure request (the identity call is shared with other loaders). */
  ctl.adminReads = () => ctl.api.filter(x => /^GET \/api\/publish\?resource=structure/.test(x)).length;
  ctl.boardReads = () => ctl.api.filter(x => /^GET \/api\/availability\?resolveRoster=1/.test(x)).length;
  return { srv, ctl };
}
const seed = section => ({ activeView: 'coach', activeCoachSection: section, stateTeamId: TEAM, clubName: 'Stub RFC', currentUserId: 'u1',
  users: [{ id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach' }], operationalGroupId: BGRP, players: PLAYERS, fixtures: FIXTURES, messages: [], onboardingDismissed: true,
  availabilityRequests: [{ sessionId: SAT, status: 'sent', sentAt: '2026-09-22T09:00:00Z', groupId: BGRP, clubId: TEAM, sentWeek: WEEK }] });
/**
 * Installed before the app: every render() with what started it, and whether a
 * FALSE state was EVER on screen (not only when sampled) — an empty club, a
 * zero count, or the failed copy where nothing failed.
 */
const watch = () => {
  window.__r = [];
  const w = () => { if (typeof window.render !== 'function') { setTimeout(w, 0); return; }
    const o = window.render; window.render = function () { window.__r.push(new Error().stack.split('\n')[2].trim().replace(/\(.*\)/, '').replace(/^at /, '').replace(/^async /, '').trim()); return o.apply(this, arguments); }; };
  w();
  window.__ever = { noPlayers: 0, zeroKpi: 0, invite: 0, failedCopy: 0 };
  const scan = () => {
    const hub = document.getElementById('coach-message'), ov = document.getElementById('coach-overview');
    const t = ((hub && hub.innerText) || '').replace(/\s+/g, ' '), o = ((ov && ov.innerText) || '').replace(/\s+/g, ' ');
    if (/No players yet/.test(t) || /No players yet/.test(o)) window.__ever.noPlayers++;
    if (/NO REPLY 0\b/i.test(t)) window.__ever.zeroKpi++;
    if (hub && hub.querySelector('[onclick*="openInvitePlayersModal"]')) window.__ever.invite++;
    if (/could not be loaded/i.test(t) || /Squad could not be loaded/.test(o)) window.__ever.failedCopy++;
  };
  new MutationObserver(scan).observe(document, { subtree: true, childList: true, characterData: true });
};
const look = () => {
  const hub = document.getElementById('coach-message'), ov = document.getElementById('coach-overview');
  const t = (hub?.innerText || '').replace(/\s+/g, ' '), o = (ov?.innerText || '').replace(/\s+/g, ' ');
  return { admin: { loaded: _adminData.loaded, failed: _adminData.failed, loading: _adminData.loading }, timer: _adminRetryTimer !== null,
    status: availabilityChaseContext().status,
    board: { failed: !!hub?.querySelector('.avail-roster-failed'), text: (hub?.querySelector('.avail-roster-failed')?.innerText || '').replace(/\s+/g, ' ').trim(),
      retryBtn: !!hub?.querySelector('.avail-roster-failed .ovw-retry'), loading: !!hub?.querySelector('.avail-loading'),
      kpi: [...(hub?.querySelectorAll('.msg-kpi') || [])].map(e => e.innerText.replace(/\s+/g, ' ').trim()), rows: hub?.querySelectorAll('.msg-player-row').length || 0,
      noPlayers: /No players yet/.test(t), invite: !!hub?.querySelector('[onclick*="openInvitePlayersModal"]'),
      noReply: [...(hub?.querySelectorAll('.msg-chip.no-reply') || [])].filter(e => /No reply|to chase/i.test(e.innerText)).length },
    overview: { failed: ov ? ov.querySelectorAll('.ovw-roster-failed').length : 0, text: (ov?.querySelector('.ovw-roster-failed')?.innerText || '').replace(/\s+/g, ' ').trim(),
      retryBtns: ov ? ov.querySelectorAll('.ovw-roster-failed .ovw-retry').length : 0, loadingSquad: /Loading the squad…/.test(o), noPlayers: /No players yet/.test(o),
      prompt: (o.match(/\d+ players? haven't replied/) || [null])[0] },
    ever: window.__ever, active: [...document.querySelectorAll('.section.active')].map(e => e.id).join(','),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
};
const waitFor = async (fnc, ms, every = 40) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await fnc(); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await new Promise(r => setTimeout(r, every)); } };
async function browserHarness(t, view) {
  if (!chromium) { t.skip('playwright not installed'); return null; }
  let browser;
  try { browser = await chromium.launch(); } catch { t.skip('no browser available'); return null; }
  const { srv, ctl } = stubServer();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const open = async section => {
    const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
    await ctx.addInitScript(s => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(s)), seed(section));
    await ctx.addInitScript(watch);
    const page = await ctx.newPage();
    const errors = [], consoleErrors = [];
    page.on('pageerror', e => errors.push(e.message));
    // The 500 this test serves is reported by the browser as a failed resource, and loadAdminData logs nothing for an HTTP error.
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 160)); });
    await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'domcontentloaded' });
    return { ctx, page, errors, consoleErrors };
  };
  const close = async () => { ctl.release(); await browser.close(); srv.close(); };
  return { ctl, open, close };
}
/** The first admin read has failed and its outcome has been painted. */
const failedAndSettled = page => waitFor(() => page.evaluate(() => _adminData.failed === true && _adminData.loading === false && _adminData.loaded === false && _adminRetryTimer !== null), 15000);

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): the first admin read FAILS, the server heals, nobody touches the screen — the Overview says so honestly and recovers on its own`, { timeout: 120000 }, async (t) => {
    const b = await browserHarness(t, view); if (!b) return;
    try {
      b.ctl.identity = 'fail';
      const h = await b.open('overview');
      assert.ok(await failedAndSettled(h.page), 'the first admin read failed and a retry is booked');
      assert.ok(await waitFor(() => h.page.evaluate(() => document.querySelectorAll('#coach-overview .ovw-roster-failed').length === 2), 5000), 'both availability cards say so');
      let s = await h.page.evaluate(look);
      assert.equal(s.active, 'coach-overview');
      assert.match(s.overview.text, /^Squad could not be loaded This is not an empty squad — the squad list did not load\. Trying again automatically\. Try again$/);
      assert.equal(s.overview.retryBtns, 2, 'each with its Retry action');
      assert.equal(s.overview.loadingSquad, false, 'not "Loading the squad…" — nothing is loading');
      assert.equal(s.overview.noPlayers, false, 'not "No players yet"');
      assert.equal(s.overview.prompt, null, 'no "N players haven\'t replied" claim');
      assert.equal(s.status, 'loading', 'the chase context claims nothing');
      assert.equal(b.ctl.adminReads(), 1, 'one admin read so far');
      // The server is healthy again. No click, no navigation, no render() from here: only the booked retry.
      b.ctl.identity = 'ok';
      const renders = await h.page.evaluate(() => window.__r.length);
      const t0 = Date.now();
      assert.ok(await waitFor(() => h.page.evaluate(() => /\d+ players? haven't replied/.test(document.getElementById('coach-overview')?.innerText || '')), 30000, 100),
        'the Overview recovered with no interaction (it used to stay on "Loading the squad…" for good)');
      const ms = Date.now() - t0;
      assert.ok(ms < 20000, `within the 15 s backoff (${ms} ms)`);
      s = await h.page.evaluate(look);
      assert.equal(s.overview.prompt, "11 players haven't replied");
      assert.equal(s.overview.failed, 0, 'the failed copy is gone'); assert.equal(s.overview.loadingSquad, false);
      assert.deepEqual(s.admin, { loaded: true, failed: false, loading: false });
      assert.equal(s.timer, false, 'no retry left booked');
      assert.equal(b.ctl.adminReads(), 2, 'exactly one retry');
      const after = (await h.page.evaluate(() => window.__r)).slice(renders);
      assert.equal(after.filter(f => f === 'loadAdminData').length, 1, 'one render() from the landing: ' + JSON.stringify(after));
      assert.equal(s.ever.noPlayers, 0, '"No players yet" was never on screen'); assert.equal(s.ever.zeroKpi, 0);
      assert.equal(s.overflow, false);
      assert.deepEqual(h.errors, []); assert.deepEqual(h.consoleErrors, []);
      await h.ctx.close();
    } finally { await b.close(); }
  });

  test(`browser (${view}): Availability with a failed admin read — honest block, nothing claimed; Try again recovers at once with ONE read however often it is asked`, { timeout: 120000 }, async (t) => {
    const b = await browserHarness(t, view); if (!b) return;
    try {
      b.ctl.identity = 'fail';
      const h = await b.open('message');
      assert.ok(await failedAndSettled(h.page), 'the first admin read failed and a retry is booked');
      assert.ok(await waitFor(() => h.page.evaluate(() => !!document.querySelector('#coach-message .avail-roster-failed .ovw-retry')), 5000), 'the board says so');
      let s = await h.page.evaluate(look);
      assert.match(s.board.text, /The squad could not be loaded This is not an empty squad — the squad list did not load, so nobody has been marked as "no reply"\. Trying again automatically\. Try again/);
      assert.equal(s.board.loading, false, 'not "Loading availability…"');
      assert.deepEqual(s.board.kpi, [], 'no AVAILABLE 0 / MAYBE 0 / UNAVAILABLE 0 / NO REPLY 0');
      assert.equal(s.board.rows, 0); assert.equal(s.board.noPlayers, false); assert.equal(s.board.invite, false);
      assert.equal(s.board.noReply, 0, 'nobody marked No reply, nobody to chase');
      // The server heals; its answer is held so the retry in flight can be seen.
      b.ctl.identity = 'ok'; b.ctl.hold();
      const reads = b.ctl.adminReads();
      await h.page.click('#coach-message .avail-roster-failed .ovw-retry');
      assert.ok(await waitFor(() => h.page.evaluate(() => /Trying again now…/.test(document.querySelector('#coach-message .avail-roster-failed')?.innerText || '')), 5000), '"Trying again now…"');
      s = await h.page.evaluate(look);
      assert.equal(s.board.retryBtn, false, 'no second button while the retry is out');
      assert.equal(s.admin.loading, true);
      await h.page.evaluate(() => { adminDataRetryNow(); adminDataRetryNow(); ensureAdminData(); loadAdminData(); render(); });
      assert.ok(await waitFor(async () => b.ctl.adminReads() - reads >= 1, 5000), 'the retry reached the server');
      assert.equal(b.ctl.adminReads() - reads, 1, 'ONE read, however often it was asked');
      b.ctl.release();
      assert.ok(await waitFor(() => h.page.evaluate(() => document.querySelectorAll('#coach-message .msg-player-row').length === 18 && document.querySelectorAll('#coach-message .msg-kpi').length === 4), 8000), 'the real board');
      s = await h.page.evaluate(look);
      assert.deepEqual(s.board.kpi, ['AVAILABLE 5', 'MAYBE 1', 'UNAVAILABLE 1', 'NO REPLY 11']);
      assert.equal(s.board.failed, false); assert.equal(s.board.loading, false);
      assert.deepEqual(s.admin, { loaded: true, failed: false, loading: false });
      assert.equal(s.timer, false, 'the automatic retry is cancelled by the success');
      assert.equal(b.ctl.adminReads() - reads, 1, 'still one');
      assert.equal(s.ever.noPlayers, 0); assert.equal(s.ever.zeroKpi, 0); assert.equal(s.ever.invite, 0);
      assert.equal(s.overflow, false);
      assert.deepEqual(h.errors, []); assert.deepEqual(h.consoleErrors, []);
      await h.ctx.close();
    } finally { await b.close(); }
  });
}

test('browser (desktop): a HEALTHY cold load is unchanged — one admin read, one board read, no retry booked, the failed copy never shown', { timeout: 60000 }, async (t) => {
  const b = await browserHarness(t, 'desktop'); if (!b) return;
  try {
    for (const section of ['message', 'overview']) {
      b.ctl.api.length = 0;
      const h = await b.open(section);
      assert.ok(await waitFor(() => h.page.evaluate(sec => _adminData.loaded === true && typeof _liveAvailabilityInFlight !== 'undefined' && _liveAvailabilityInFlight === null && currentResolvedAvailability() !== null
        && (sec === 'message' ? document.querySelectorAll('#coach-message .msg-kpi').length === 4 : /\d+ players? haven't replied/.test(document.getElementById('coach-overview')?.innerText || '')), section), 15000), `${section}: settled`);
      const s = await h.page.evaluate(look);
      if (section === 'message') { assert.deepEqual(s.board.kpi, ['AVAILABLE 5', 'MAYBE 1', 'UNAVAILABLE 1', 'NO REPLY 11']); assert.equal(s.board.rows, 18); }
      else assert.equal(s.overview.prompt, "11 players haven't replied");
      assert.equal(s.timer, false, `${section}: no retry booked`);
      assert.equal(s.ever.failedCopy, 0, `${section}: the failed copy was never on screen`);
      assert.equal(s.ever.noPlayers, 0); assert.equal(s.ever.zeroKpi, 0);
      assert.equal(b.ctl.adminReads(), 1, `${section}: one admin read`);
      assert.equal(b.ctl.boardReads(), 1, `${section}: one board read`);
      assert.equal((await h.page.evaluate(() => window.__r)).filter(f => f === 'loadAdminData').length, 1, `${section}: one render() from the admin landing`);
      assert.deepEqual(h.errors, []); assert.deepEqual(h.consoleErrors, []);
      await h.ctx.close();
    }
  } finally { await b.close(); }
});

test('browser (desktop): Club Admin with a failing admin read asks ONCE — repaints do not ask again (it used to ask on every one)', { timeout: 60000 }, async (t) => {
  const b = await browserHarness(t, 'desktop'); if (!b) return;
  try {
    b.ctl.identity = 'fail';
    const h = await b.open('admin');
    assert.ok(await failedAndSettled(h.page), 'the admin read failed');
    assert.equal(await h.page.evaluate(() => [...document.querySelectorAll('.section.active')].map(e => e.id).join(',')), 'coach-admin');
    await h.page.evaluate(() => { for (let i = 0; i < 25; i++) render(); });
    assert.ok(await waitFor(() => h.page.evaluate(() => _adminData.loading === false), 5000));
    await h.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.equal(b.ctl.adminReads(), 1, 'one admin read, inside the backoff, however often the screen repaints');
    assert.match(await h.page.evaluate(() => document.getElementById('coach-admin')?.innerText || ''), /Couldn't load members — this is not an empty club/, 'and the screen keeps its own failure message');
    assert.deepEqual(h.errors, []);
    await h.ctx.close();
  } finally { await b.close(); }
});
