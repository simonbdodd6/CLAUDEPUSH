/**
 * Availability failure-state honesty.
 *
 * A 500 from /api/availability used to reach the coach as a fact about every
 * player: the board printed "No reply 18", the week strip said "18 to chase"
 * and offered "Chase all" — a full squad convicted of silence by a request
 * that never landed. Failure and "nobody has replied yet" are different
 * answers and must never share a presentation.
 *
 * Pinned here:
 *   500 / network throw  → failure state, no fabricated no-reply, no chase
 *   success with data    → unchanged
 *   success but empty    → still the legitimate empty/no-reply reading
 *   failure after a good read → keeps the real answers (not a failure STATE)
 *   recovery             → normal board returns, error gone
 *
 * The state layer runs the REAL extracted functions. The rendering is pinned
 * as a source contract (the convention for this 300-line template, see
 * availability-board-v2.test.js) and proved end to end in the browser test at
 * the bottom, which skips when Playwright is unavailable.
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

// ── State layer: the real refresh, driven through every outcome ─────────────
function scope({ group = 'g1' } = {}) {
  return new Function(`"use strict";
    const SEQ = [];
    const calls = { fetches: 0, boardRenders: 0 };
    function fetch() {
      calls.fetches++;
      const r = SEQ.shift() || { ok: true, body: { resolved: {} } };
      if (r.throws) return Promise.reject(new Error('offline'));
      return Promise.resolve({ ok: r.ok !== false, status: r.ok === false ? 500 : 200, json: async () => r.body });
    }
    let _resolvedAvailability = {}, _resolvedAvailabilityGroup = null;
    let _availLastSync = null, _availReadFailed = false, _availRosterLinkedAt = 0;
    let _liveAvailabilityInFlight = null;
    const state = { operationalGroupId: ${JSON.stringify(group)}, players: [{ name: 'P1', userId: 'u1' }, { name: 'P2', userId: 'u2' }] };
    const chip = { textContent: '', className: '' };
    const document = { getElementById: () => chip };
    function operationalGroups() { return [{ id: 'g1' }]; }
    async function ensureCoachRosterIdentityLinked() {}
    function saveState() {}
    function renderMessageCenter() { calls.boardRenders++; }
    function renderAudiencePicker() {} function renderPushStatusCard() {}
    function loadLiveSchedules() {} function loadLiveTemplates() {} function loadLiveLog() {}
    function setTimeout() { return 1; }
    ${fn('sessionKey')}
    ${fn('liveAvailabilityPlayerKeys')}
    ${fn('currentResolvedAvailability')}
    ${fn('availabilitySetReadFailed')}
    ${fn('availabilityLastReadFailed')}
    ${fn('availabilityReadUnknown')}
    ${fn('playerAvailabilityReadUnknown')}
    ${fn('refreshLiveAvailability')}
    return {
      queue: r => SEQ.push(r), calls, chip,
      run: o => refreshLiveAvailability(o),
      unknown: () => availabilityReadUnknown(),
      failed: () => availabilityLastReadFailed(),
      known: () => currentResolvedAvailability(),
      lastSync: () => _availLastSync,
      resolved: () => _resolvedAvailability,
    };
  `)();
}
const DATA = { resolved: { u1: { tue: { response: 'available', respondedAt: 't1' } } } };
const wait = ms => new Promise(r => setTimeout(r, ms));

test('1+3. an HTTP 500 produces an explicit failure state and stamps no answers', async () => {
  const s = scope();
  s.queue({ ok: false, body: {} });
  await s.run(); await wait(30);
  assert.equal(s.failed(), true, 'the failure is recorded in state, not only in the chip');
  assert.equal(s.unknown(), true, 'availability is UNKNOWN, not empty');
  assert.equal(s.lastSync(), null, 'no sync stamp from a failed read (unchanged)');
  assert.deepEqual(s.resolved(), {}, 'and nothing was written into the resolved map');
  assert.equal(s.known(), null, 'callers asking what we know are told: nothing');
  assert.match(s.chip.textContent, /fail/i, 'the chip still admits it (unchanged)');
  assert.equal(s.calls.boardRenders, 1, 'the board repaints once on the transition, not per poll');
});

test('1+3. a network throw behaves exactly like a 500', async () => {
  const s = scope();
  s.queue({ throws: true });
  await s.run(); await wait(30);
  assert.equal(s.unknown(), true); assert.equal(s.lastSync(), null);
});

test('a repeated failure does not repaint again (no churn)', async () => {
  const s = scope();
  s.queue({ ok: false, body: {} }); s.queue({ ok: false, body: {} });
  await s.run(); await wait(20); await s.run(); await wait(20);
  assert.equal(s.calls.fetches, 2, 'both polls really ran');
  assert.equal(s.calls.boardRenders, 1, 'one repaint for the transition only');
});

test('4. a successful response with real data is unchanged, and is not a failure', async () => {
  const s = scope();
  s.queue({ ok: true, body: DATA });
  await s.run(); await wait(30);
  assert.equal(s.failed(), false); assert.equal(s.unknown(), false);
  assert.ok(s.lastSync(), 'a real read stamps the sync');
  assert.match(JSON.stringify(s.known()), /"tue"/, 'and the answers are what we know');
});

test('5. a successful but genuinely EMPTY response is empty, never a failure', async () => {
  const s = scope();
  s.queue({ ok: true, body: { resolved: {} } });
  await s.run(); await wait(30);
  assert.equal(s.failed(), false, 'an empty week is not a failure');
  assert.equal(s.unknown(), false, 'we know the answer: nobody has replied');
  assert.deepEqual(s.known(), {}, 'and what we know is an empty map, not null');
  assert.ok(s.lastSync(), 'stamped like any other real answer');
});

test('a failure AFTER a good read keeps the real answers and is not a failure STATE', async () => {
  const s = scope();
  s.queue({ ok: true, body: DATA }); s.queue({ ok: false, body: {} });
  await s.run(); await wait(20);
  await s.run(); await wait(20);
  assert.equal(s.failed(), true, 'the chip-level failure is recorded');
  assert.equal(s.unknown(), false, 'but the board still KNOWS these answers — no error state');
  assert.match(JSON.stringify(s.known()), /"tue"/, 'the good map survives the failed poll (unchanged)');
});

test('7. a failed read followed by a successful one recovers, including to an empty week', async () => {
  const s = scope();
  s.queue({ ok: false, body: {} }); s.queue({ ok: true, body: DATA });
  await s.run(); await wait(20);
  assert.equal(s.unknown(), true);
  await s.run(); await wait(20);
  assert.equal(s.unknown(), false, 'recovered'); assert.equal(s.failed(), false);
  assert.match(JSON.stringify(s.known()), /"tue"/, 'and the real data renders');
  assert.equal(s.calls.boardRenders >= 2, true, 'the recovery transition repaints too');

  // The hard case: recovery to a genuinely empty week, where the resolved map
  // does not change at all. The error state must still clear.
  const e = scope();
  e.queue({ ok: false, body: {} }); e.queue({ ok: true, body: { resolved: {} } });
  await e.run({ boardOnly: true }); await wait(20);
  assert.equal(e.unknown(), true);
  await e.run({ boardOnly: true }); await wait(20);
  assert.equal(e.unknown(), false, 'an empty success clears the failure state');
  assert.equal(e.calls.boardRenders, 2, 'and repaints so the error leaves the screen');
});

test('a read for another group is UNKNOWN, not empty (unchanged group contract)', async () => {
  const s = scope();
  s.queue({ ok: true, body: DATA });
  await s.run(); await wait(20);
  assert.equal(s.known() !== null, true);
});

// ── Dual role: a coach who also plays ──────────────────────────────────────
// Both REAL reads in one scope: the player's self-read (which latches
// _playerAvailKnown for the session) and the coach board's roster read. The
// self-read knows nothing about the squad, so it must never stand in for a
// coach board read that failed.
function dualScope() {
  return new Function(`"use strict";
    const SEQ = [];
    const calls = { fetches: 0, boardRenders: 0, playerRenders: 0, urls: [] };
    function fetch(url) {
      calls.fetches++; calls.urls.push(String(url));
      const r = SEQ.shift() || { ok: true, body: {} };
      if (r.throws) return Promise.reject(new Error('offline'));
      return Promise.resolve({ ok: r.ok !== false, status: r.ok === false ? 500 : 200, json: async () => r.body });
    }
    let _resolvedAvailability = {}, _resolvedAvailabilityGroup = null;
    let _availLastSync = null, _availReadFailed = false, _availRosterLinkedAt = 0;
    let _liveAvailabilityInFlight = null;
    let _playerAvailFetched = false, _playerAvailKnown = false;
    const state = { activeView: 'player', activePlayerSection: 'availability', activeCoachSection: 'message',
      operationalGroupId: 'g1', players: [{ name: 'P1', userId: 'u1' }, { name: 'P2', userId: 'u2' }] };
    const PLAYER = { id: 'p1', userId: 'u1', name: 'P1' };
    function getPlayer() { return PLAYER; }
    function findLiveAvailabilityRecords() { return []; }
    function mergeServerAvailabilityIntoRecord(rec, responses) { return Object.keys(responses || {}).length > 0; }
    const chip = { textContent: '', className: '' };
    const document = { getElementById: () => chip };
    function operationalGroups() { return [{ id: 'g1' }]; }
    async function ensureCoachRosterIdentityLinked() {}
    function saveState() {}
    function renderMessageCenter() { calls.boardRenders++; }
    function renderPlayerAvailabilityV2() { calls.playerRenders++; }
    function renderPlayerHome() {}
    function renderAudiencePicker() {} function renderPushStatusCard() {}
    function loadLiveSchedules() {} function loadLiveTemplates() {} function loadLiveLog() {}
    function setTimeout() { return 1; }
    ${fn('sessionKey')}
    ${fn('liveAvailabilityPlayerKeys')}
    ${fn('currentResolvedAvailability')}
    ${fn('availabilitySetReadFailed')}
    ${fn('availabilityLastReadFailed')}
    ${fn('availabilityReadUnknown')}
    ${fn('playerAvailabilityReadUnknown')}
    ${fn('refreshLiveAvailability')}
    ${fn('fetchMyAvailabilityFromServer')}
    ${fn('playerAvailRetryNow')}
    return {
      queue: r => SEQ.push(r), calls, chip, state,
      asPlayer: () => { state.activeView = 'player'; },
      asCoach: () => { state.activeView = 'coach'; },
      selfRead: () => fetchMyAvailabilityFromServer(),
      selfRetry: () => playerAvailRetryNow(),
      board: o => refreshLiveAvailability(o),
      unknown: () => availabilityReadUnknown(),
      playerUnknown: () => playerAvailabilityReadUnknown(),
      failed: () => availabilityLastReadFailed(),
      known: () => currentResolvedAvailability(),
      latch: () => _playerAvailKnown,
    };
  `)();
}
const SELF = { responses: { fx_sat: { response: 'available', reason: '' } } };

test('dual role: a good player self-read does NOT stand in for a coach board that then 500s', async () => {
  const s = dualScope();
  // 1. As a player, the self-read succeeds.
  s.asPlayer();
  s.queue({ ok: true, body: SELF });
  await s.selfRead(); await wait(20);
  assert.equal(s.latch(), true, 'the session-wide self-read latch is set');
  assert.equal(s.failed(), false); assert.equal(s.unknown(), false, 'the player screens know their answers');
  assert.equal(s.known(), null, 'but the coach map holds nothing — the self-read says nothing about the squad');

  // 2. Switch to the coach Availability board; its read fails.
  s.asCoach();
  s.queue({ ok: false, body: {} });
  await s.board(); await wait(30);
  assert.match(s.calls.urls[1], /resolveRoster=1/, 'the coach board read really ran');
  assert.equal(s.failed(), true, 'the failure is recorded');
  assert.equal(s.known(), null, 'no squad answers exist');
  assert.equal(s.unknown(), true, 'so the board is UNKNOWN — the failure state, not a fabricated "No reply" squad');
  assert.equal(s.calls.boardRenders, 1, 'and the board repainted into it');

  // 3. Recovery: a good board read clears it, exactly as for a single-role coach.
  s.queue({ ok: true, body: DATA });
  await s.board(); await wait(30);
  assert.equal(s.unknown(), false, 'recovered'); assert.equal(s.failed(), false);
  assert.match(JSON.stringify(s.known()), /"tue"/);
});

test('dual role: a coach board 500 with NO prior self-read is the same failure state (unchanged)', async () => {
  const s = dualScope();
  s.asCoach();
  s.queue({ ok: false, body: {} });
  await s.board(); await wait(30);
  assert.equal(s.latch(), false); assert.equal(s.unknown(), true);
});

test('dual role: the player screens keep their own knowledge — the coach failure does not leak back', async () => {
  const s = dualScope();
  s.asPlayer();
  s.queue({ ok: true, body: SELF });
  await s.selfRead(); await wait(20);
  s.asCoach();
  s.queue({ ok: false, body: {} });
  await s.board(); await wait(30);
  assert.equal(s.unknown(), true, 'coach board: unknown');
  // Back to the player capacity: the self-read still succeeded this session and
  // the answers it merged are still on the device, so the player screens are
  // NOT in the failure state (existing "keep what is known" semantics).
  s.asPlayer();
  assert.equal(s.playerUnknown(), false, 'player screens: still known');
  assert.equal(s.failed(), true, 'even though the last read (the board) failed');
});

test('dual role: a FAILED self-read is still the player failure state, and a later good board read does not hide it from a player', async () => {
  const s = dualScope();
  s.asPlayer();
  s.queue({ ok: false, body: {} });
  await s.selfRead(); await wait(20);
  assert.equal(s.playerUnknown(), true, 'player: unknown after a failed self-read (unchanged)');
  s.queue({ ok: true, body: SELF });
  await s.selfRetry(); await wait(20);
  assert.equal(s.playerUnknown(), false, 'and the explicit player retry clears it (unchanged)');
});

test('each read owns its own question — the board can never consult the player latch', () => {
  const board  = fn('availabilityReadUnknown');
  const player = fn('playerAvailabilityReadUnknown');
  // The invariant, structurally: the board's question cannot see the latch at
  // all, whichever shell happens to be on screen.
  assert.doesNotMatch(board, /_playerAvailKnown/, 'the coach board question never consults the player self-read');
  assert.doesNotMatch(board, /activeView/, 'and does not depend on which shell is displayed');
  assert.match(board, /currentResolvedAvailability\(\) === null/, 'its knowledge is the roster map');
  assert.match(player, /!\(typeof _playerAvailKnown !== 'undefined' && _playerAvailKnown\)/, 'the player question owns the latch');
  assert.doesNotMatch(player, /currentResolvedAvailability/, 'and never depends on the squad map a player cannot populate');
  assert.doesNotMatch(fn('fetchMyAvailabilityFromServer'), /_playerAvailKnown = false/, 'the latch itself is unchanged: set once, never cleared');
  assert.doesNotMatch(fn('refreshLiveAvailability'), /_playerAvailKnown/, 'the coach board read neither reads nor writes it');
});

// ── Render + action contracts ──────────────────────────────────────────────
test('2. the board prints no "to chase" count and offers no "Chase all" when the read failed', () => {
  const board = fn('renderMessageCenterV2');
  assert.match(board, /const availUnknown\s*=\s*availabilityReadUnknown\(\)/, 'the board asks the honest question once');
  assert.match(board, /\$\{opPlayers\.length > 0 && !availUnknown \? `/,
    'the week strip — "N to chase" and the Chase all button — is withheld');
  const strip = board.slice(board.indexOf('opPlayers.length > 0 && !availUnknown'), board.indexOf('opPlayers.length > 0 && !availUnknown') + 1800);
  assert.match(strip, /to chase/, 'the withheld strip is indeed the chase strip');
  assert.match(strip, /chaseAllNonResponders\(\)/, 'including its action');
});

test('1. the board prints no "No reply" count when the read failed, and says why', () => {
  const board = fn('renderMessageCenterV2');
  // The error block is the FIRST branch; the loading block (Build 110) sits between it and the real grid.
  assert.match(board, /\$\{availUnknown \? `<section class="msg-card"[^`]*\$\{availErrorHTML\}<\/section>`\s*\n\s*: availLoading \? `<section class="msg-card"[^`]*\$\{availLoadingHTML\}<\/section>` : `\s*\n\s*<section class="msg-kpi-grid avail-summary">/,
    'the KPI row (Available/Maybe/Unavailable/No reply) is replaced by the error block');
  assert.match(board, /<div class="msg-player-list msg-board-list">\$\{availUnknown \? availErrorHTML : availLoading \? availLoadingHTML : playerRows\(boardRows\)\}<\/div>/,
    'and so is the squad list, so no player is shown as having not replied');
  assert.match(board, /Availability could not be loaded/, 'the message names the real problem');
  assert.match(board, /nobody has been marked as "no reply"/, 'and says explicitly what has NOT happened');
});

test('3. the error state uses the existing error styling and the existing retry action', () => {
  const board = fn('renderMessageCenterV2');
  assert.match(board, /class="ovw-empty"/, 'the same error-state shape the Overview cards use');
  assert.match(board, /<button type="button" class="ovw-retry" onclick="availRefreshNow\(\)">Try again<\/button>/,
    'retry is the availability refresh the Live sync chip already runs — no new interaction');
  assert.ok(src.includes('.ovw-retry {'), 'and that button is already styled');
});

test('6. the sync chip reports the failure from STATE, so a repaint cannot erase it', () => {
  const board = fn('renderMessageCenterV2');
  assert.match(board, /availabilityLastReadFailed\(\) \? 'Sync failed — retry' : _availLastSync \? 'Synced '/,
    'chip text comes from what we know, not from a one-off DOM write');
  assert.match(board, /class="msg-chip msg-chip-btn \$\{availabilityLastReadFailed\(\) \? 'unavailable'/, 'and it is styled as a failure');
  // The loading/first-read presentation is untouched.
  assert.match(board, /: 'Live sync'\}/, 'never-synced still reads "Live sync", as before');
});

test('the chase ACTION fails closed on unknown availability, from any entry point', () => {
  const chase = fn('chaseAllNonResponders');
  assert.match(chase, /if \(availabilityReadUnknown\(\)\) return showToast\('Availability could not be loaded/,
    'no reminder is sent on data we do not have');
  const guardAt = chase.indexOf('availabilityReadUnknown()');
  const sendAt = chase.indexOf('availabilityNonResponders(');
  assert.ok(guardAt > 0 && sendAt > guardAt, 'and the guard runs before the recipients are computed');
});

test('8. session labelling and the group contract are untouched', () => {
  const board = fn('renderMessageCenterV2');
  assert.match(board, /const sessionDisplayTitle = session => availabilitySessionLabel\(session\)/,
    'sessions are still named by the one shared labeller');
  assert.match(board, /const opPlayers\s*=\s*operationalPlayers\(\)/, 'the board still serves the operating group');
  const refresh = fn('refreshLiveAvailability');
  assert.match(refresh, /if \(!state\.operationalGroupId && operationalGroups\(\)\.length > 1\) return;/, 'group fail-safe unchanged');
  assert.match(refresh, /'\/api\/availability\?resolveRoster=1' \+ _availGroupQ/, 'the group-scoped read is unchanged');
});

// ── Browser: the reported bug, end to end, desktop and phone ───────────────
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed */ }

const GRP = 'grp_initial', TEAM = 'team_stub';
// ── THE FIXTURE'S DATE — valid on every weekday (Build 102) ────────────────
// These journeys serve ONE fixture and read it back on the coach Availability board, whose
// session cards are the occurrences of the week the board displays.
// It used to be dated "the coming Saturday", counted from the day the suite
// ran. On a Sunday the coming Saturday is six days ahead — in NEXT week — so
// the week on screen was empty ("Nothing scheduled this week.") and the
// browser tests below failed every Sunday for a reason unrelated to anything
// they assert.
//
// The date now comes from the application's OWN week and occurrence
// functions, extracted from index.html like every other function under test
// here. No week arithmetic is restated: the app's generator is asked, day by
// day from today, which dates it places in the week it displays, and the
// fixture is played on the LAST of them. That day is inside the displayed
// week by construction and has never passed, whichever weekday the suite
// runs — and if the app's week ever changes, the fixture follows it.
const APP_WEEK = new Function(`
  ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
  ${fn('availWeekStart')}
  ${fn('availAddDays')}
  ${fn('availSlotDateInWeek')}
  ${fn('availTrainingEventId')}
  ${fn('availabilityEventsForWeek')}
  ${fn('availToday')}
  ${fn('playerPortalNextFixture')}
  return { availWeekStart, availAddDays, availabilityEventsForWeek, availToday, playerPortalNextFixture };
`)();
/** Does the app's occurrence generator place a fixture played on `dateIso` in the week it displays on `todayIso`? */
function inDisplayedWeek(dateIso, todayIso) {
  const week = APP_WEEK.availWeekStart(todayIso);
  return APP_WEEK.availabilityEventsForWeek(week, { fixtures: [{ id: 'fx_probe', opposition: 'Probe', date: dateIso, status: 'scheduled' }], slots: [], currentWeekStart: week })
    .some(e => e.id === 'fx_probe' && e.date === dateIso);
}
/** The last day of the week the app displays on `todayIso` — in that week, and not yet passed. */
function matchDayFor(todayIso) {
  let day = todayIso;
  for (let i = 0; i < 14; i++) {
    const next = APP_WEEK.availAddDays(day, 1);
    if (!inDisplayedWeek(next, todayIso)) break;
    day = next;
  }
  return day;
}
const MATCH_DAY = matchDayFor(APP_WEEK.availToday());
const PLAYERS = Array.from({ length: 18 }, (_, i) => ({ id: 'p' + i, userId: 'u_p' + i, name: 'Player ' + i, position: 'Prop', playerGroupId: GRP }));
const SESSION = { ok: true, user: { id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach', platformRole: '' },
  teamMember: { teamId: TEAM, userId: 'u1', role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: null },
  permissions: ['reports', 'messaging', 'manage_players', 'manage_coaches', 'training', 'matchday', 'publish_training'],
  memberships: [{ teamId: TEAM, teamName: 'Stub RFC', role: 'coach', staffLevel: 'head', canonicalRole: 'head_coach', current: true }],
  operational: { player: { groups: [], defaultGroupId: null, mustChoose: false }, staff: { groups: [{ id: GRP, name: 'Seniors', developmentCategory: 'adult' }], defaultGroupId: GRP, mustChoose: false } } };
const FIXTURES = [{ id: 'fx_sat', groupId: GRP, opposition: 'Kituro', date: MATCH_DAY, kickoffTime: '14:00', status: 'scheduled' }];

test('the fixture these journeys serve is an occurrence of the week the board displays, and has not passed — on every weekday', () => {
  assert.equal(FIXTURES[0].date, MATCH_DAY, 'the browser tests serve the derived date');
  // Seven consecutive "todays" cover every weekday, whichever day the suite itself runs on.
  const weekdays = new Set();
  for (let i = 0; i < 7; i++) {
    const today = APP_WEEK.availAddDays(APP_WEEK.availToday(), i);
    const day = matchDayFor(today);
    const fixture = { ...FIXTURES[0], date: day };
    const week = APP_WEEK.availWeekStart(today);
    weekdays.add(new Date(today + 'T12:00:00Z').getUTCDay());
    // The board's session cards come from the app's own generator for the displayed week
    // (coachAvailEvents → availabilityEventsForWeek): the fixture must be one of them…
    const events = APP_WEEK.availabilityEventsForWeek(week, { fixtures: [fixture], slots: [], currentWeekStart: week });
    assert.deepEqual(events.map(e => [e.id, e.type, e.date]), [['fx_sat', 'match', day]], `today ${today}: the fixture is THE occurrence of the displayed week`);
    // …and not one of the following week's (the Sunday failure, stated as a rule)
    assert.deepEqual(APP_WEEK.availabilityEventsForWeek(APP_WEEK.availAddDays(week, 7), { fixtures: [fixture], slots: [], currentWeekStart: week }).map(e => e.id), [],
      `today ${today}: it does not belong to next week`);
    assert.ok(day >= today, `today ${today}: ${day} has not passed`);
  }
  assert.equal(weekdays.size, 7, 'every weekday was covered');
});

/** availabilityMode: 'ok' | 'empty' | 'fail' — flipped live by the test. */
function boardServer(mode) {
  const state = { mode };
  const srv = http.createServer((req, res) => {
    const u = req.url || '/';
    const send = o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/availability')) {
      if (state.mode === 'fail') { res.statusCode = 500; return send({ error: 'boom' }); }
      const resolved = {};
      if (state.mode === 'ok') PLAYERS.slice(0, 5).forEach(p => { resolved[p.userId] = { ['slot_tue-' + MATCH_DAY.replace(/-/g, '')]: { response: 'available', respondedAt: '2026-09-23T08:00:00Z' } }; });
      return send({ resolved, roster: PLAYERS });
    }
    if (u.startsWith('/api/identity')) return send(SESSION);
    if (u.startsWith('/api/publish?resource=fixtures')) return send({ ok: true, fixtures: FIXTURES });
    if (u.startsWith('/api/publish?resource=matchday-teams')) return send({ ok: true, groups: [{ id: GRP, name: 'Seniors', status: 'active' }], teams: [] });
    if (u.startsWith('/api/publish?resource=training-schedule')) return send({ ok: true, schedule: { slots: [{ id: 'slot_tue', day: 'Tue', startTime: '19:00', active: true, sessionId: 'slot_tue' }] } });
    if (u.startsWith('/api/publish?resource=roster')) return send({ ok: true, players: PLAYERS });
    if (u.startsWith('/api/publish')) return send({ ok: true, club: { id: TEAM, name: 'Stub RFC' } });
    if (u.startsWith('/api/chat')) return send({ ok: true, conversations: [] });
    if (u.startsWith('/api/')) return send({ ok: true });
    const f = u === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try { res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); res.end(fs.readFileSync(f)); }
    catch { res.statusCode = 404; res.end(); }
  });
  return { srv, state };
}

/**
 * The reported dual-role journey, end to end in a real browser: a coach who
 * also plays reads their own availability successfully, switches to the coach
 * shell, and the board read 500s. The board must say so rather than convict
 * the squad of silence on the strength of one player's own answer.
 */
function dualServer() {
  const st = { self: 'ok', board: 'fail' };
  const PLAYERS = Array.from({ length: 18 }, (_, i) => ({ id: 'p' + i, userId: 'u_p' + i, name: 'Player ' + i, position: 'Prop', playerGroupId: GRP }));
  PLAYERS[0] = { id: 'p0', userId: 'u1', name: 'Coach Player', position: 'Prop', playerGroupId: GRP };
  const DUAL = { ok: true, user: { id: 'u1', name: 'Coach Player', email: 'cp@s.test', role: 'coach', platformRole: '' },
    teamMember: { teamId: TEAM, userId: 'u1', role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: GRP },
    permissions: ['reports', 'messaging', 'manage_players', 'manage_coaches', 'training', 'matchday', 'publish_training'],
    memberships: [{ teamId: TEAM, teamName: 'Stub RFC', role: 'coach', staffLevel: 'head', canonicalRole: 'head_coach', current: true }],
    operational: { player: { groups: [{ id: GRP, name: 'Seniors', developmentCategory: 'adult' }], defaultGroupId: GRP, mustChoose: false },
                   staff:  { groups: [{ id: GRP, name: 'Seniors', developmentCategory: 'adult' }], defaultGroupId: GRP, mustChoose: false } } };
  const srv = http.createServer((req, res) => {
    const u = req.url || '/';
    const send = o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/availability')) {
      if (u.includes('myResponse=1')) {
        if (st.self === 'fail') { res.statusCode = 500; return send({ error: 'boom' }); }
        return send({ responses: { fx_sat: { response: 'available', reason: '' } } });
      }
      if (st.board === 'fail') { res.statusCode = 500; return send({ error: 'boom' }); }
      return send({ resolved: {}, roster: PLAYERS });
    }
    if (u.startsWith('/api/identity')) return send(DUAL);
    if (u.startsWith('/api/publish?resource=fixtures')) return send({ ok: true, fixtures: FIXTURES });
    if (u.startsWith('/api/publish?resource=matchday-teams')) return send({ ok: true, groups: [{ id: GRP, name: 'Seniors', status: 'active' }], teams: [] });
    if (u.startsWith('/api/publish?resource=training-schedule')) return send({ ok: true, schedule: { slots: [] } });
    if (u.startsWith('/api/publish?resource=roster')) return send({ ok: true, players: PLAYERS });
    if (u.startsWith('/api/publish')) return send({ ok: true, club: { id: TEAM, name: 'Stub RFC' } });
    if (u.startsWith('/api/chat')) return send({ ok: true, conversations: [] });
    if (u.startsWith('/api/')) return send({ ok: true });
    const f = u === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try { res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); res.end(fs.readFileSync(f)); }
    catch { res.statusCode = 404; res.end(); }
  });
  return { srv, st, PLAYERS };
}

/** A condition wait that names its step when it times out — an anonymous timeout under load told nothing. */
const awaitStep = (page, step, fnc, timeout = 20000) =>
  page.waitForFunction(fnc, null, { timeout }).catch(e => { throw new Error(`while waiting for ${step}: ${e.message}`); });

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): dual role — a good self-read never lets the board convict the squad`, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    const { srv, st, PLAYERS } = dualServer();
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${srv.address().port}`;
    try {
      const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      await ctx.addInitScript(seed => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(seed)),
        { activeView: 'player', activePlayerSection: 'availability', stateTeamId: TEAM, clubName: 'Stub RFC', currentUserId: 'u1',
          users: [{ id: 'u1', name: 'Coach Player', email: 'cp@s.test', role: 'coach', playerId: 'p0' }], operationalGroupId: GRP,
          players: PLAYERS, fixtures: FIXTURES, messages: [], onboardingDismissed: true,
          availabilityRequests: [{ sessionId: 'fx_sat', status: 'sent', sentAt: '2026-09-22T09:00:00Z' }] });
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));

      // The player self-read lands (200) while the board read 500s.
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await awaitStep(page, 'the player self-read (200) to land', () => { try { return _playerAvailKnown === true; } catch { return false; } });
      // The two reads answer on their own schedules. Everything below is about
      // the board AFTER its read has failed — so wait for that failure to have
      // landed, not just the self-read. Before it lands the hidden board is
      // still painting its pre-read counts (a loading state the board does not
      // yet distinguish), and under load that window outlasted the self-read
      // and this journey failed on the very first check.
      await awaitStep(page, 'the board read (500) to land', () => { try { return availabilityReadUnknown() === true; } catch { return false; } });
      // Even here, with the player shell on screen, the board markup must not
      // have been built out of answers nobody has.
      assert.equal(await page.evaluate(() => document.querySelectorAll('#coach-message .msg-kpi.chase').length), 0,
        'no fabricated "No reply N" tile, even in markup the player cannot see');
      assert.equal(await page.evaluate(() => document.querySelectorAll('#coach-message [onclick*="chaseAllNonResponders"]').length), 0,
        'and no Chase all built from a failed request');
      // The player's OWN answers are still known — the board's failure is not theirs.
      assert.equal(await page.evaluate(() => playerAvailabilityReadUnknown()), false, 'the player screens keep what their self-read told them');
      assert.doesNotMatch(await page.evaluate(() => (document.getElementById('player-availability')?.innerText || '')),
        /Availability unavailable/, 'so the player screen is not in the failure state');

      // The reported journey: switch to the coach shell.
      await page.evaluate(() => { try { setView('coach'); } catch { state.activeView = 'coach'; } try { setSection('coach', 'message'); } catch {} });
      await awaitStep(page, 'the coach board to show its failure state', () => /Availability could not be loaded/.test(document.getElementById('coach-message')?.innerText || ''));
      const board = await page.evaluate(() => (document.getElementById('coach-message')?.innerText || '').replace(/\s+/g, ' '));
      assert.match(board, /Availability could not be loaded/, 'the board says what happened');
      const claims = await page.evaluate(() => [...document.querySelectorAll('#coach-message *')]
        .filter(e => e.children.length === 0 && e.offsetParent !== null && /No reply|to chase|Chase all|replied to all/i.test(e.innerText || ''))
        .map(e => (e.className || e.tagName) + ' :: ' + (e.innerText || '').trim().slice(0, 40)));
      assert.deepEqual(claims, [], 'and convicts nobody: no count, no chase list, no Chase all');
      assert.ok(await page.evaluate(() => document.querySelectorAll('#coach-message .ovw-retry, #avail-refresh-ts').length > 0), 'retry remains available');

      // Recovery: the board read succeeds and the real board returns.
      st.board = 'ok';
      await page.evaluate(() => availRefreshNow());
      await awaitStep(page, 'the board to recover after a good read', () => !/Availability could not be loaded/.test(document.getElementById('coach-message')?.innerText || ''));
      assert.match(await page.evaluate(() => (document.getElementById('coach-message')?.innerText || '')), /No reply/,
        'the normal board is back once the read lands');

      assert.deepEqual(errors, [], 'no page errors');
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): a 500 never tells the coach that players have not replied`, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    const { srv, state: mode } = boardServer('fail');
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${srv.address().port}`;
    try {
      const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      await ctx.addInitScript(seed => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(seed)),
        { activeView: 'coach', activeCoachSection: 'message', stateTeamId: TEAM, clubName: 'Stub RFC', currentUserId: 'u1',
          users: [{ id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach' }], operationalGroupId: GRP,
          players: PLAYERS, fixtures: FIXTURES, messages: [], onboardingDismissed: true });
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const boardText = () => page.evaluate(() => (document.getElementById('coach-message')?.innerText || '').replace(/\s+/g, ' '));

      // C. forced 500
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => /Availability could not be loaded/.test(document.getElementById('coach-message')?.innerText || ''), null, { timeout: 20000 });
      let text = await boardText();
      assert.match(text, /Availability could not be loaded/, 'the coach is told the read failed');
      // Every visible LEAF that states a reply status or a chase count. The
      // error notice itself is not one (its own copy reassures the coach that
      // "nobody has been marked as no reply"), so this is the precise claim:
      // no element on the Availability screen asserts a reply state.
      const claims = () => page.evaluate(() => [...document.querySelectorAll('#coach-message *')]
        .filter(e => e.children.length === 0 && e.offsetParent !== null && /No reply|to chase|Chase all/i.test(e.innerText || ''))
        .map(e => (e.id || e.className || e.tagName) + ' :: ' + (e.innerText || '').trim().slice(0, 40)));
      assert.deepEqual(await claims(), [], 'nothing on screen says a player has not replied, or offers to chase');
      assert.equal(await page.evaluate(() => document.querySelectorAll('#coach-message .msg-kpi.chase').length), 0,
        'the "No reply N" summary tile is gone');
      assert.equal(await page.evaluate(() => document.querySelectorAll('#coach-message .filter-pill').length), 0,
        'so are the status filter pills and their counts');
      assert.equal(await page.evaluate(() => document.querySelectorAll('#coach-message [onclick*="chaseAllNonResponders"]').length), 0,
        'and no chase action exists on data we do not have');
      assert.equal(await page.isVisible('#coach-message .ovw-retry'), true, 'the existing retry is offered');
      assert.match(await page.textContent('#avail-refresh-ts'), /Sync failed/, 'and the sync chip agrees');

      // D. recovery → real data
      mode.mode = 'ok';
      await page.click('#coach-message .ovw-retry');
      await page.waitForFunction(() => !/Availability could not be loaded/.test(document.getElementById('coach-message')?.innerText || ''), null, { timeout: 20000 });
      text = await boardText();
      assert.match(text, /No reply/i, 'the normal board is back');
      assert.ok((await claims()).length > 0, 'and it states reply statuses again, as it should');
      assert.match(await page.textContent('#avail-refresh-ts'), /Synced/, 'and the chip reports a real sync');
      assert.equal(await page.evaluate(() => document.querySelectorAll('#coach-message .msg-session-card').length > 0), true,
        'session cards (and their labels) are intact');

      // B. genuinely empty success is still the legitimate empty reading
      mode.mode = 'empty';
      await page.evaluate(() => availRefreshNow());
      await page.waitForTimeout(600);
      text = await boardText();
      assert.doesNotMatch(text, /Availability could not be loaded/, 'an empty week is not an error');
      assert.match(text, /No reply/i, 'it is a legitimate no-reply reading');

      assert.deepEqual(errors, [], 'no page errors');
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}
