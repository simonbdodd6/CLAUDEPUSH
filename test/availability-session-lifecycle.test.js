/**
 * THE LIVE BOARD OBEYS THE SESSION, AND A CLUB SWITCH SAYS "LOADING" (Build 129)
 *
 * Build 128's post-release check of core-deploy-98 found four things on the
 * deployed code, every one reproduced identically on core-deploy-97:
 *
 *   1. SESSION TEARDOWN. The Availability board's 5 s tick asked the section
 *      but not the session. After Sign out it went on hitting /api/availability
 *      every 5 s (401) and repainted the hub under the front door; once the
 *      SERVER had ended the session and the app's own session check learnt it,
 *      the tick repainted the whole board — eighteen names and counts — from
 *      the roster the device still held, under the front door. A roster push
 *      queued before the sign-out fired after it; the autopilot schedule POST
 *      asked isCoach() (device state) and nothing else.
 *   2. CLUB SWITCH. resetTeamScopedState empties state.players and the next
 *      club's roster arrives with its own read. "Roster known" was answered
 *      from the admin data alone (Build 122), so once the new club's admin data
 *      landed the emptied list read as a KNOWN empty squad: "No players yet",
 *      an Invite button and NO REPLY 0 for as long as the roster read took.
 *   3. HIDDEN PAINT. A cold load on the Overview painted the hidden Availability
 *      hub (13.8 KB, via the board read's settle) and then fetched its schedules
 *      panel for a section nobody was looking at.
 *   4. The inline "Try again" of the failure blocks was a 59×20 px target.
 *
 * The fix: availabilityStopLive() at the existing session boundary (the same
 * three places that stop the chat poller) — tick cancelled, reads still out
 * made stale through the board's own ordering rule, answers forgotten;
 * availabilityBoardOnShow() for the three paints/polls that bypass render()'s
 * section gate; the read refuses to start and refuses its reply for a
 * signed-out device; the two POSTs re-ask the session boundary;
 * _rosterAwaitingServer from the wipe until the roster read answers, read by
 * operationalRosterKnown(); and a 44 px tap box on .ovw-retry whose negative
 * margins keep the line it sits in where it was.
 *
 * SANDBOX tests run the REAL functions over controlled state, timers and
 * network. BROWSER tests run the real client against a two-club stub API on
 * desktop and Pixel 5. Every wait is on a state signal; the one timed wait is
 * the poll's own period, and it is there to prove the tick is gone.
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
const stripComments = s => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };

// ═══════════════════════════════════════════════════════════════════════════
// SANDBOX 1 — the live board over the session boundary: the real
// availabilityStopLive / availabilityBoardOnShow / availabilitySetReadFailed /
// refreshLiveAvailability / loadLiveMessaging, with the real sessionSignedOut
// ═══════════════════════════════════════════════════════════════════════════
function live({ section = 'message', view = 'coach' } = {}) {
  const net = { urls: [], held: [], hold: false };
  const work = { hub: 0, overview: 0, picker: 0, push: 0, schedules: 0, templates: 0, log: 0, saves: 0, intervals: [], cleared: [] };
  const body = `
    "use strict";
    const net = arguments[0], work = arguments[1], CFG = arguments[2];
    const state = { activeView: CFG.view, activeCoachSection: CFG.section, activePlayerSection: 'availability', operationalGroupId: 'grp_a', currentUserId: 'coach_me',
                    players: [{ id: 'p1', userId: 'u1', name: 'P One' }, { id: 'p2', userId: 'u2', name: 'P Two' }], users: [], availabilityPending: {} };
    let _serverAuthState = 'authed';
    let _clubContextId = 'club-a';
    let _resolvedAvailability = {}, _resolvedAvailabilityGroup = null, _availLastSync = null, _availReadFailed = false;
    let _availPollTimer = null, _liveMessagingLoadedAt = 0, _liveMessagingInFlight = false;
    const LIVE_MESSAGING_MIN_INTERVAL_MS = 15000;
    let _liveAvailabilityInFlight = null, _availRefreshInFlight = null, _availRosterLinkedAt = 0;
    let _availabilityReadSeq = 0, _availabilityAppliedSeq = 0;
    let _availFlushInFlight = false;
    const setTimeout = (f, ms) => { f(); return 1; };
    let _seq = 0;
    const setInterval = (f, ms) => { const id = ++_seq; work.intervals.push({ id, f, ms }); return id; };
    const clearInterval = id => { work.cleared.push(id); };
    function fetch(url, opts) {
      net.urls.push((opts && opts.method ? opts.method + ' ' : '') + url);
      return new Promise((resolve, reject) => { const e = { url, resolve, reject }; if (net.hold) net.held.push(e); else resolve({ ok: true, json: async () => ({ resolved: { u1: { fx: { response: 'available' } } } }) }); });
    }
    const chip = { textContent: '', className: '' };
    const document = { getElementById: id => id === 'avail-refresh-ts' ? chip : null };
    const console = { warn() {} };
    function ensureCoachRosterIdentityLinked() { return Promise.resolve(); }
    function operationalGroups() { return [{ id: 'grp_a' }]; }
    function operationalPlayers() { return state.players; }
    function saveState() { work.saves++; }
    function renderMessageCenter() { work.hub++; }
    function renderCoachOverview() { work.overview++; }
    function coachSectionActive(s) { return state.activeView === 'coach' && state.activeCoachSection === s; }
    function renderAudiencePicker() { work.picker++; } function renderPushStatusCard() { work.push++; }
    function loadLiveSchedules() { work.schedules++; } function loadLiveTemplates() { work.templates++; } function loadLiveLog() { work.log++; }
    function loadLiveResponses() {}
    function availabilityFlushPending() { return Promise.resolve(0); }
    function playerAvailRetryNow() {}
    function renderPlayerAvailabilityV2() { work.player = (work.player || 0) + 1; } function renderPlayerHome() { work.player = (work.player || 0) + 1; }
    ${fn('sessionSignedOut')}
    ${fn('sessionKey')} ${fn('sessionReasonKey')} ${fn('normalizeSessionId')} ${fn('liveAvailabilityPlayerKeys')}
    ${fn('availabilityPendingFor')} ${fn('availabilitySessionIdForKey')} ${fn('availabilityDropStaleLocalAnswers')}
    ${fn('currentResolvedAvailability')} ${fn('availabilitySetReadFailed')} ${fn('availabilityLastReadFailed')} ${fn('availabilityReadUnknown')}
    ${fn('resolvedAnswerFor')} ${fn('sessionRows')}
    ${fn('availabilityBoardOnShow')} ${fn('availabilityStopLive')}
    ${fn('liveMessagingCycleDue')} ${fn('liveMessagingArmReload')} ${fn('loadLiveMessaging')}
    ${fn('refreshLiveAvailability')} ${fn('availRefreshNow')} ${fn('refreshAvailabilityOnReturn')}
    return {
      refresh: opts => refreshLiveAvailability(opts), liveSync: () => availRefreshNow(), onReturn: () => refreshAvailabilityOnReturn(),
      cycle: () => loadLiveMessaging({ force: true }),
      signOut: () => { state.currentUserId = ''; _serverAuthState = 'anon'; },
      serverEnded: () => { _serverAuthState = 'anon'; },
      stop: () => availabilityStopLive(), onShow: () => availabilityBoardOnShow(), setFailed: f => availabilitySetReadFailed(f),
      deliver: n => net.held[n].resolve({ ok: true, json: async () => ({ resolved: { u2: { fx: { response: 'maybe' } } } }) }),
      refuse: n => net.held[n].resolve({ ok: false, status: 401, json: async () => ({}) }),
      know: () => { _resolvedAvailability = { u1: { fx: { response: 'available' } } }; _resolvedAvailabilityGroup = 'grp_a'; _availLastSync = 'now'; },
      peek: () => ({ map: Object.keys(_resolvedAvailability).join(','), group: _resolvedAvailabilityGroup, sync: _availLastSync, failed: _availReadFailed,
                     timer: _availPollTimer, inFlight: _liveAvailabilityInFlight, armed: _liveMessagingLoadedAt === 0, seq: [_availabilityReadSeq, _availabilityAppliedSeq],
                     chip: chip.textContent, signedOut: sessionSignedOut(), unknown: availabilityReadUnknown(), current: currentResolvedAvailability() }),
      section: s => { state.activeCoachSection = s; },
    };`;
  const api = new Function(body)(net, work, { section, view });
  return { ...api, net, work };
}

test('1. Sign out stops the poll: the tick is cancelled, and a tick that was already queued does nothing', async () => {
  const b = live();
  await b.cycle(); await flush();
  assert.equal(b.work.intervals.length, 1, 'the live cycle armed the 5 s tick');
  assert.equal(b.net.urls.filter(u => u.startsWith('/api/availability')).length, 1, 'the cycle read the board once');
  const tick = b.work.intervals[0];
  b.signOut();
  assert.equal(b.peek().signedOut, true);
  b.stop();
  assert.ok(b.work.cleared.includes(tick.id), 'availabilityStopLive cancelled the tick');
  assert.equal(b.peek().timer, null);
  // The very same callback, had the interval outlived the sign-out: it clears itself and reads nothing.
  const reads = b.net.urls.length, cleared = b.work.cleared.length;
  tick.f(); await flush();
  assert.equal(b.net.urls.length, reads, 'a tick firing on a signed-out device makes no request');
  assert.equal(b.work.cleared.length, cleared + 1, 'and clears itself rather than read');
});

test('1b. the tick asks the session, not only the section: on show but signed out is OFF; a player view is OFF; the board on show with a session is ON', () => {
  const b = live();
  assert.equal(b.onShow(), true);
  b.section('overview'); assert.equal(b.onShow(), false, 'the Overview is not the board');
  b.section('message'); b.signOut(); assert.equal(b.onShow(), false, 'signed out is not on show, whatever the section says');
  const p = live({ view: 'player' }); assert.equal(p.onShow(), false);
});

test('2. a reply that lands AFTER the sign-out is ignored in full: no map, no stamp, no chip, no paint — and no new read leaves', async () => {
  const b = live();
  b.net.hold = true;
  const out = b.refresh({ boardOnly: true });
  await flush();
  assert.equal(b.net.held.length, 1, 'the read is out');
  b.signOut(); b.stop();
  assert.deepEqual(b.peek().seq, [1, 1], 'the stop moved the applied mark past the read still out');
  b.deliver(0); await out; await flush();
  const s = b.peek();
  assert.equal(s.map, '', 'the late reply put nothing in the map');
  assert.equal(s.sync, null, 'nor a sync time'); assert.equal(s.chip, '', 'nor a chip');
  assert.equal(b.work.hub, 0, 'and painted nothing');
  // Every way a read can be asked for on a signed-out device: nothing leaves. (The network answers at once from
  // here, so a build that DID let a read leave fails on the count below instead of hanging on a held reply.)
  b.net.hold = false;
  const reads = b.net.urls.length;
  await b.refresh({ boardOnly: true }); await b.refresh({}); await b.liveSync(); b.onReturn(); await b.cycle(); await flush();
  assert.equal(b.net.urls.length, reads, 'no request of any kind after the sign-out: ' + JSON.stringify(b.net.urls.slice(reads)));
  assert.equal(b.work.hub, 0);
});

test('3. the stop forgets what the identity knew: the resolved map, its group, the sync time, the failure flag; the cycle is re-armed', async () => {
  const b = live();
  await b.refresh({}); await flush();
  b.setFailed(true);
  let s = b.peek();
  assert.equal(s.map, 'u1'); assert.equal(s.group, 'grp_a'); assert.ok(s.sync); assert.equal(s.failed, true);
  const hubPaints = b.work.hub, ovw = b.work.overview;
  b.signOut(); b.stop();
  s = b.peek();
  assert.deepEqual([s.map, s.group, s.sync, s.failed, s.timer, s.inFlight, s.armed, s.current], ['', null, null, false, null, null, true, null]);
  assert.equal(b.work.hub, hubPaints, 'clearing the flag on a signed-out device painted no hub');
  assert.equal(b.work.overview, ovw, 'nor the Overview');
});

test('3b. the failure transition paints only the board ON SHOW, and never for a signed-out device', () => {
  const b = live({ section: 'overview' });
  b.setFailed(true);
  assert.equal(b.work.hub, 0, 'the hidden hub is not painted on the transition');
  assert.equal(b.work.overview, 1, 'the Overview on show is');
  b.section('message'); b.setFailed(false);
  assert.equal(b.work.hub, 1, 'the board on show is painted on the next transition');
  // Signed out with the Overview on show: the Overview is not painted on the transition either.
  b.section('overview'); b.signOut();
  b.setFailed(true);
  assert.equal(b.work.hub, 1, 'signed out: no hub paint'); assert.equal(b.work.overview, 1, 'signed out: no Overview paint, although it is the section on show');
  assert.equal(b.peek().failed, true, 'the flag itself is still recorded');
  b.section('message'); b.setFailed(false);
  assert.equal(b.work.hub, 1, 'nor the board, on the way back');
  // The player's screens repaint on the same transitions — not for a signed-out device.
  const p = live({ view: 'player' });
  p.setFailed(true);
  assert.equal(p.work.player, 1, 'signed in, the player availability screen repaints on the transition');
  p.signOut(); p.setFailed(false);
  assert.equal(p.work.player, 1, 'signed out: no player-screen paint');
});

test('4–6. the SERVER ends the session: the stop runs from the session check, and a refused reply that lands afterwards paints nothing and books nothing', async () => {
  const b = live();
  await b.cycle(); await flush();
  b.know();
  b.net.hold = true;
  const out = b.refresh({ boardOnly: true }); await flush();
  assert.equal(b.net.held.length, 1);
  b.serverEnded(); b.stop();                       // what checkServerSession's refused branch does
  const chip = b.peek().chip;
  assert.match(chip, /^Synced /, 'the cycle\'s own read had stamped the chip');
  b.refuse(0); await out; await flush();
  const s = b.peek();
  assert.equal(s.failed, false, 'a 401 landing after the session ended is not a failure of this board');
  assert.equal(s.chip, chip, 'the chip was not touched by the refused reply (no "Sync failed — will retry")');
  assert.equal(b.work.hub, 1, 'no paint beyond the cycle\'s own');
  b.net.hold = false;
  const reads = b.net.urls.length;
  for (const t of b.work.intervals) t.f();
  await b.refresh({ boardOnly: true }); await flush();
  assert.equal(b.net.urls.length, reads, 'no further availability read');
});

test('SOURCE: the stop is called from the three session-ending places the chat poller already uses, and the two POSTs re-ask the session', () => {
  assert.match(stripComments(fn('resetIdentityScopedState')), /if \(typeof availabilityStopLive === 'function'\) availabilityStopLive\(\);/, 'Sign out and every identity change');
  const check = stripComments(fn('checkServerSession'));
  assert.match(check, /_serverAuthState = 'anon';\s*\n\s*if \(typeof availabilityStopLive === 'function'\) availabilityStopLive\(\);/, 'the session check that learns the server refused this device');
  const at = src.search(/window\.addEventListener\(["']storage["']/); assert.ok(at > 0, 'the other-tab listener exists');
  const tab = src.slice(at, at + 2500);
  assert.match(tab, /chatStopPolling\(\); \} catch \{\} \}\s*\n\s*if \(typeof availabilityStopLive === 'function'\) \{ try \{ availabilityStopLive\(\); \} catch \{\} \}/, 'a sign-out in another tab');
  assert.match(stripComments(fn('queueRosterSync')), /if \(!clubStateOwned\(\)\) \{ _rosterSyncDeferred = true; return; \}\s*\n\s*if \(typeof sessionSignedOut === 'function' && sessionSignedOut\(\)\) return;/, 'the queued roster push re-asks at fire time');
  const auto = stripComments(fn('ensureAutopilotSchedule'));
  assert.match(auto, /if \(!autopilotOn\(\) \|\| !isCoach\(\) \|\| _autopilotEnsured\) return;/, 'the guard at the read is unchanged (isCoach() is already null-session aware)');
  assert.match(auto, /if \(typeof sessionSignedOut === 'function' && sessionSignedOut\(\)\) \{ _autopilotEnsured = false; return; \}\s*\n\s*const created = await fetch\('\/api\/schedules', \{\s*\n\s*method: 'POST'/, 'the session is asked again before the write');
  const refresh = stripComments(fn('refreshLiveAvailability'));
  assert.match(refresh, /if \(_signedOut\(\)\) return;\s*\n\s*await ensureCoachRosterIdentityLinked\(\);/, 'no read leaves a signed-out device');
  assert.match(refresh, /if \(_ctxLeft\(\)\) return;\s*\n\s*if \(_signedOut\(\)\) return;\s*\n\s*if \(!reply\)/, 'a reply after the session ended is a context left');
  assert.match(refresh, /if \(_onShow && \(w >= 1 \|\| out\.changed\) && !out\.rendered\) \{ out\.rendered = true; renderMessageCenter\(\); \}/, 'the landing paints the board on show only');
  assert.match(stripComments(fn('loadLiveMessaging')), /if \(availabilityBoardOnShow\(\)\) \{\s*\n\s*refreshLiveAvailability\(\{ boardOnly: true \}\);/, 'the tick asks availabilityBoardOnShow');
});

// ═══════════════════════════════════════════════════════════════════════════
// SANDBOX 2 — the club switch: the real resetTeamScopedState,
// loadRosterFromServer and operationalRosterKnown
// ═══════════════════════════════════════════════════════════════════════════
function club() {
  const net = { held: [], hold: false, mode: 'ok', urls: [] };
  const work = { renders: 0, saves: 0 };
  const body = `
    "use strict";
    const net = arguments[0], work = arguments[1];
    const defaultState = { matchCentre: {}, schedule: {}, trainingBlocks: {} };
    const state = { stateTeamId: 'team_a', currentUserId: 'coach_me', operationalGroupId: 'grp_b', users: [{ id: 'coach_me', role: 'coach' }],
                    players: [{ id: 'a0', userId: 'u_a0', name: 'Alpha Player 0' }], fixtures: [], trainingByGroup: {} };
    let _adminData = { loaded: true, failed: false, loading: false, members: [] };
    let _myPermissions = ['manage_players'];
    let _rosterLastSyncedFp = null, _rosterSyncTimer = null, _rosterSyncPending = false, _rosterSyncDeferred = false;
    let _clubContextId = 'team_b';
    const window = {}; const console = { warn() {} };
    function isCoach() { return true; }
    function canI(p) { return _myPermissions.includes(p); }
    function saveState() { work.saves++; } function render() { work.renders++; }
    function clubStateOwned() { return String(state.stateTeamId || '') === _clubContextId; }
    function queueRosterSync() {} function ensurePlayerUsersForRoster(players, users) { return users; } function ensureOwnPlayerRecord() { return false; }
    function rosterFingerprint() { return JSON.stringify(state.players.map(p => p.id)); }
    const clearTimeout = () => {};
    function fetch(url) { net.urls.push(url); return new Promise((resolve, reject) => { const e = { resolve, reject }; if (net.hold) net.held.push(e); else settle(e); }); }
    function settle(e) { if (net.mode === 'throw') return e.reject(new TypeError('Failed to fetch')); if (net.mode === 500) return e.resolve({ ok: false, status: 500 });
      e.resolve({ ok: true, json: async () => ({ players: net.mode === 'empty' ? [] : [{ id: 'b0', userId: 'u_b0', name: 'Bravo Player 0' }, { id: 'b1', userId: 'u_b1', name: 'Bravo Player 1' }] }) }); }
    ${src.match(/\n\s*let _rosterAwaitingServer = false;/)[0]}
    ${fn('resetTeamScopedState')} ${fn('loadRosterFromServer')} ${fn('operationalRosterKnown')}
    return {
      known: () => operationalRosterKnown(), awaiting: () => _rosterAwaitingServer, players: () => state.players.map(p => p.name).join(','),
      reset: () => resetTeamScopedState(), load: () => loadRosterFromServer(), stamp: () => { state.stateTeamId = 'team_b'; },
      adminLanded: () => { _adminData.loaded = true; }, adminReset: () => { _adminData = { loaded: false, failed: false, loading: false, members: [] }; },
      entitle: on => { _myPermissions = on ? ['manage_players'] : ['reports']; },
      release: () => { const h = net.held.splice(0); h.forEach(settle); },
    };`;
  const api = new Function(body)(net, work);
  return { ...api, net, work };
}

test('8. after the wipe the roster is UNKNOWN until the new club\'s roster read answers — even once the new club\'s admin data has landed', async () => {
  const c = club();
  assert.equal(c.known(), true, 'before: a returning device holding its roster, admin data loaded');
  c.reset(); c.adminReset();
  assert.equal(c.players(), '', 'the wipe emptied the players');
  assert.equal(c.awaiting(), true);
  assert.equal(c.known(), false, 'unknown: admin data not loaded');
  c.stamp(); c.adminLanded();
  assert.equal(c.known(), false, 'STILL unknown: the admin data is in, the roster read is not (this is the false "No players yet")');
  c.net.hold = true;
  const p = c.load(); await flush();
  assert.equal(c.net.urls.length, 1, 'the roster read is out');
  assert.equal(c.known(), false, 'still loading while it is out');
  c.release(); await p; await flush();
  assert.equal(c.awaiting(), false);
  assert.equal(c.known(), true, 'known once the server answered');
  assert.equal(c.players(), 'Bravo Player 0,Bravo Player 1', 'with the new club\'s players');
  assert.equal(c.work.renders, 1, 'painted once for the landing');
});

test('8b. an EMPTY answer is a known empty squad; a failed or dropped read ends the wait too (the device holds nothing, as before); nobody waits for a player', async () => {
  for (const mode of ['empty', 500, 'throw']) {
    const c = club(); c.reset(); c.stamp(); c.adminLanded(); c.net.mode = mode;
    assert.equal(c.known(), false, mode + ': unknown before the answer');
    await c.load(); await flush();
    assert.equal(c.awaiting(), false, mode + ': answered');
    assert.equal(c.known(), true, mode + ': known with what is held');
    assert.equal(c.players(), '', mode + ': nothing');
  }
  const c = club(); c.reset(); c.stamp(); c.adminLanded(); c.entitle(false);
  assert.equal(c.known(), true, 'not entitled to the admin data: answered from what is held, as before');
});

test('SOURCE: the three lines Build 122 pinned are intact around the new check; the wipe raises the flag; the loader lowers it on every answer', () => {
  const known = stripComments(fn('operationalRosterKnown'));
  assert.match(known, /if \(!state\.operationalGroupId\) return true;/);
  assert.match(known, /if \(typeof _rosterAwaitingServer !== 'undefined' && _rosterAwaitingServer\s*\n\s*&& \(canI\('manage_players'\) \|\| canI\('manage_teams'\)\)\) return false;/);
  assert.match(known, /if \(_adminData\.loaded\) return true;/);
  assert.match(known, /return !\(canI\('manage_players'\) \|\| canI\('manage_teams'\)\);/);
  assert.match(stripComments(fn('resetTeamScopedState')), /state\.players = \[\];\s*\n\s*if \(typeof _rosterAwaitingServer !== 'undefined'\) _rosterAwaitingServer = true;/);
  const load = stripComments(fn('loadRosterFromServer'));
  assert.match(load, /const res = await fetch\('\/api\/roster'\);\s*\n\s*if \(!res\.ok\) \{ _answered\(\); return; \}\s*\n\s*const data = await res\.json\(\);\s*\n\s*_answered\(\);/, 'answered once the BODY is in — fetch resolves on the headers');
  assert.match(load, /catch\(e\) \{ _answered\(\); console\.warn/);
  assert.match(load, /if \(!isCoach\(\)\) return;/, 'the line test/medical-access-player pins is untouched');
});

// ═══════════════════════════════════════════════════════════════════════════
// BROWSER — the real client, real timers, a two-club stub API, desktop and Pixel 5
// ═══════════════════════════════════════════════════════════════════════════
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed: the browser tests skip */ }
const APP = new Function(`
  ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
  ${fn('availWeekStart')} ${fn('availAddDays')} ${fn('availToday')} ${fn('availSlotDateInWeek')} ${fn('availTrainingEventId')} ${fn('availabilityEventsForWeek')}
  return { availWeekStart, availAddDays, availToday, availabilityEventsForWeek };
`)();
const TODAY = APP.availToday(), WEEK = APP.availWeekStart(TODAY);
const inWeek = (d, today) => { const w = APP.availWeekStart(today); return APP.availabilityEventsForWeek(w, { fixtures: [{ id: 'p', opposition: 'P', date: d, status: 'scheduled' }], slots: [], currentWeekStart: w }).some(e => e.id === 'p'); };
const MATCH_DAY = (() => { let day = TODAY; for (let i = 0; i < 14; i++) { const n = APP.availAddDays(day, 1); if (!inWeek(n, TODAY)) break; day = n; } return day; })();
const mkClub = (id, name, grp, tag, n, fx, opp) => ({ id, name, grp, fx,
  players: Array.from({ length: n }, (_, i) => ({ id: tag + i, userId: 'u_' + tag + i, name: `${name.split(' ')[0]} Player ${i}`, position: 'Prop', playerGroupId: grp })),
  fixtures: [{ id: fx, groupId: grp, opposition: opp, date: MATCH_DAY, kickoffTime: '14:00', status: 'scheduled' }] });
const CLUBS = { team_a: mkClub('team_a', 'Alpha RFC', 'grp_a', 'a', 18, 'fx_a', 'Kituro'), team_b: mkClub('team_b', 'Bravo RFC', 'grp_b', 'b', 6, 'fx_b', 'Dendermonde') };
const KPI_A = ['AVAILABLE 5', 'MAYBE 1', 'UNAVAILABLE 1', 'NO REPLY 11'], KPI_B = ['AVAILABLE 2', 'MAYBE 0', 'UNAVAILABLE 1', 'NO REPLY 3'];
const COACH = { id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach' };
function boardOf(club) {
  const resolved = {}, P = club.players, k = club.fx;
  if (club.id === 'team_a') { P.slice(0, 5).forEach(p => { resolved[p.userId] = { [k]: { response: 'available', respondedAt: '2026-09-23T08:00:00Z' } }; }); resolved[P[5].userId] = { [k]: { response: 'maybe' } }; resolved[P[6].userId] = { [k]: { response: 'unavailable', reason: 'work' } }; }
  else { P.slice(0, 2).forEach(p => { resolved[p.userId] = { [k]: { response: 'available', respondedAt: '2026-09-23T08:00:00Z' } }; }); resolved[P[2].userId] = { [k]: { response: 'unavailable', reason: 'work' } }; }
  return { resolved, roster: P };
}
/**
 * ctl.current   — the club the "cookie" names (switch_team moves it); ctl.signedIn — logout / ctl.endSession() make every answer 401;
 * ctl.failIdentity — the admin read's GET /api/identity answers 500 (the Build 126 failed block).
 * ctl.holdRoster(club) / ctl.holdBoard(club) — that club's roster / board read is answered with its headers and the BODY held
 * until ctl.release() (a response held before its headers makes Chrome queue identical GETs behind it — Build 125).
 */
function stubServer({ multi = false } = {}) {
  const ctl = { current: 'team_a', signedIn: true, holdRosterFor: null, holdBoardFor: null, holdSchedules: false, held: 0, log: [], failIdentity: false };
  let gate = null, release = () => {};
  const session = () => { const c = CLUBS[ctl.current]; return { ok: true, user: { ...COACH, platformRole: '' },
    teamMember: { teamId: c.id, userId: 'u1', role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: null },
    permissions: ['reports', 'messaging', 'manage_players', 'manage_teams', 'manage_coaches', 'training', 'matchday', 'publish_training'],
    memberships: Object.values(CLUBS).filter(x => multi || x.id === 'team_a').map(x => ({ teamId: x.id, teamName: x.name, role: 'coach', staffLevel: 'head', canonicalRole: 'head_coach', current: x.id === c.id })),
    operational: { player: { groups: [], defaultGroupId: null, mustChoose: false }, staff: { groups: [{ id: c.grp, name: 'Seniors', developmentCategory: 'adult' }], defaultGroupId: c.grp, mustChoose: false } } }; };
  const adminIdentity = c => ({ ok: true, users: [{ id: 'u1', displayName: 'Coach Stub', email: 'c@s.test', role: 'coach' }, ...c.players.map(p => ({ id: p.userId, displayName: p.name, email: p.userId + '@s.test', role: 'player' }))],
    team_members: [{ teamId: c.id, userId: 'u1', role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: null }, ...c.players.map(p => ({ teamId: c.id, userId: p.userId, role: 'player', status: 'active', playerGroupId: c.grp }))], player_profiles: [] });
  const srv = http.createServer(async (req, res) => {
    const u = req.url || '/', club = CLUBS[ctl.current];
    let body = ''; if (req.method !== 'GET' && req.method !== 'HEAD') { for await (const c of req) body += c; }
    const entry = u.startsWith('/api/') ? { m: req.method, u: u.replace(/[?&](_t|ts|_)=\d+/g, ''), club: club.id, status: 0 } : null;
    if (entry) ctl.log.push(entry);
    const send = (o, status = 200) => { if (entry) entry.status = status; res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    const hold = async o => { ctl.held++; entry.status = 200; const g = gate; res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=0, must-revalidate' }); res.flushHeaders(); if (g) await g; res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/')) {
      if (u === '/api/identity' && req.method === 'POST') {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch {}
        if (b.action === 'switch_team') { if (!ctl.signedIn) return send({ ok: false }, 401); if (!multi || !CLUBS[b.teamId]) return send({ ok: false }, 403); ctl.current = b.teamId; return send({ ok: true }); }
        if (b.action === 'logout') { ctl.signedIn = false; return send({ ok: true }); }
        return send({ ok: true });
      }
      if (!ctl.signedIn) return send({ ok: false, error: 'Not signed in' }, 401);
      if (u === '/api/identity' && req.method === 'GET') return ctl.failIdentity ? send({ ok: false, error: 'boom' }, 500) : send(adminIdentity(club));
      if (u.startsWith('/api/identity')) return send(session());
      if (u.startsWith('/api/availability')) { if (ctl.holdBoardFor === club.id && gate) return hold(boardOf(club)); return send(boardOf(club)); }
      if (u.startsWith('/api/roster') && req.method === 'GET') { if (ctl.holdRosterFor === club.id && gate) return hold({ ok: true, players: club.players }); return send({ ok: true, players: club.players }); }
      if (u.startsWith('/api/invite')) return send({ ok: true, invites: [] });
      if (u.startsWith('/api/publish?resource=fixtures')) return send({ ok: true, fixtures: club.fixtures });
      if (u.startsWith('/api/publish?resource=matchday-teams')) return send({ ok: true, groups: [{ id: club.grp, name: 'Seniors', status: 'active' }], teams: [] });
      if (u.startsWith('/api/publish?resource=training-schedule')) return send({ ok: true, slots: [], groupId: club.grp, canEdit: true });
      if (u.startsWith('/api/publish')) return send({ ok: true, club: { id: club.id, name: club.name, fixtures: club.fixtures } });
      if (u.startsWith('/api/chat')) return send({ ok: true, conversations: [], messages: [] });
      if (u.startsWith('/api/schedules')) { if (ctl.holdSchedules && req.method === 'GET' && gate) return hold({ ok: true, schedules: [] }); return send({ ok: true, schedules: [] }); }
      if (u.startsWith('/api/templates')) return send({ ok: true, templates: [] });
      return send({ ok: true });
    }
    const f = u.split('?')[0] === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try { res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); res.end(fs.readFileSync(f)); }
    catch { res.statusCode = 404; res.end(); }
  });
  ctl.holdRoster = c => { ctl.holdRosterFor = c; gate = new Promise(r => { release = r; }); };
  ctl.holdBoard = c => { ctl.holdBoardFor = c; gate = new Promise(r => { release = r; }); };
  ctl.holdSchedulesRead = () => { ctl.holdSchedules = true; gate = new Promise(r => { release = r; }); };
  ctl.release = () => { release(); gate = null; ctl.holdRosterFor = null; ctl.holdBoardFor = null; ctl.holdSchedules = false; };
  ctl.endSession = () => { ctl.signedIn = false; };
  ctl.since = n => ctl.log.slice(n);
  ctl.boardReads = () => ctl.log.filter(x => x.m === 'GET' && x.u.startsWith('/api/availability?resolveRoster=1')).length;
  return { srv, ctl };
}
const seed = (section, clubId = 'team_a') => { const c = CLUBS[clubId]; return { activeView: 'coach', activeCoachSection: section, stateTeamId: c.id, clubName: c.name, currentUserId: 'u1',
  users: [{ ...COACH }], operationalGroupId: c.grp, players: c.players, fixtures: c.fixtures, messages: [], onboardingDismissed: true,
  availabilityRequests: [{ sessionId: c.fx, status: 'sent', sentAt: '2026-09-22T09:00:00Z', groupId: c.grp, clubId: c.id, sentWeek: WEEK }] }; };
/** Before the app: every innerHTML write into a coach section that is NOT on show, with its caller; every write into the hub. */
const watch = () => {
  window.__hidden = []; window.__hubWrites = 0; window.__hubMarkup = [];
  const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', { configurable: true, get: d.get, set(v) {
    const sec = this.closest && this.closest('.section');
    if (sec && sec.id === 'coach-message' && this === sec) { window.__hubWrites++; window.__hubMarkup.push(String(v)); }
    if (sec && sec.id.startsWith('coach-') && !sec.classList.contains('active') && window.__hidden.length < 20)
      window.__hidden.push(sec.id + (this.id && this.id !== sec.id ? ' #' + this.id : '') + ' ← ' + new Error().stack.split('\n').slice(2, 4).map(l => l.trim().replace(/\(.*\)/, '').replace(/^at /, '').replace(/^async /, '').trim()).join(' < '));
    return d.set.call(this, v); } });
};
const look = () => {
  const hub = document.getElementById('coach-message'), ov = document.getElementById('coach-overview');
  const t = (hub?.innerText || '').replace(/\s+/g, ' ');
  const tryv = (f, d) => { try { return f(); } catch { return d; } };
  return { club: tryv(() => _clubContextId, '?'), signedOut: tryv(() => sessionSignedOut(), null), pollTimer: tryv(() => _availPollTimer !== null, null),
    awaiting: tryv(() => _rosterAwaitingServer, null), adminLoaded: _adminData.loaded, known: tryv(() => operationalRosterKnown(), null),
    map: tryv(() => Object.keys(_resolvedAvailability).length, -1), sync: tryv(() => _availLastSync, '?'), group: tryv(() => _resolvedAvailabilityGroup, '?'),
    rows: hub?.querySelectorAll('.msg-player-row').length || 0, rowClubs: [...new Set([...(hub?.querySelectorAll('.msg-player-row') || [])].map(e => (e.innerText.match(/(Alpha|Bravo) Player/) || ['?', '?'])[1]))].join(','),
    kpi: [...(hub?.querySelectorAll('.msg-kpi') || [])].map(e => e.innerText.replace(/\s+/g, ' ').trim()),
    loading: !!hub?.querySelector('.avail-loading'), noPlayers: /No players yet/.test(t), invite: !!hub?.querySelector('[onclick*="openInvitePlayersModal"]'),
    hubChars: hub?.innerHTML.length || 0, sectionChars: [...document.querySelectorAll('.section')].reduce((n, e) => n + e.innerHTML.length, 0),
    namesInDom: (document.body.innerHTML.match(/Alpha Player \d+/g) || []).length, bravoNames: (document.body.innerHTML.match(/Bravo Player \d+/g) || []).length,
    hidden: window.__hidden, hubWrites: window.__hubWrites, prompt: ((ov?.innerText || '').match(/\d+ players? haven't replied/) || [null])[0] };
};
const waitFor = async (fnc, ms, every = 40) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await fnc(); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await new Promise(r => setTimeout(r, every)); } };
async function harness(t, view, opts = {}) {
  if (!chromium) { t.skip('playwright not installed'); return null; }
  let browser;
  try { browser = await chromium.launch(); } catch { t.skip('no browser available'); return null; }
  const { srv, ctl } = stubServer(opts);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const open = async section => {
    const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
    await ctx.addInitScript(s => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(s)), seed(section));
    await ctx.addInitScript(watch);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'domcontentloaded' });
    return { ctx, page, errors };
  };
  return { ctl, open, close: async () => { ctl.release(); await browser.close(); srv.close(); } };
}
const boardSettled = page => waitFor(() => page.evaluate(() => _adminData.loaded === true && _liveAvailabilityInFlight === null && currentResolvedAvailability() !== null
  && document.querySelectorAll('#coach-message .msg-player-row').length === 18 && _availPollTimer !== null), 20000);
const POLL_MS = 5000;   // the board's own tick period — the one timed wait, there to prove the tick is gone

test('browser (desktop): Sign out stops the poll, forgets the answers, keeps a late reply out, and nothing leaves the device afterwards — not the tick, not a return to the tab, not a roster push', { timeout: 60000 }, async (t) => {
  const b = await harness(t, 'desktop'); if (!b) return;
  try {
    const h = await b.open('message');
    assert.ok(await boardSettled(h.page), 'the board is live: 18 rows, the tick armed');
    // A board read is OUT (body held) and a roster push is QUEUED (2 s debounce) when the coach signs out.
    b.ctl.holdBoard('team_a');
    await h.page.evaluate(() => { window.__late = refreshLiveAvailability({ manual: true }); });
    assert.ok(await waitFor(async () => b.ctl.held >= 1, 5000), 'the read is out');
    await h.page.evaluate(() => { state.players[0].position = 'Hooker'; saveState('edit'); queueRosterSync(); });
    assert.ok(await h.page.evaluate(() => _rosterSyncPending === true), 'the push is queued');
    const n0 = b.ctl.log.length;
    await h.page.evaluate(() => { settingsSignOut(); });
    await h.page.click('#ce-modal-ok');
    assert.ok(await waitFor(() => h.page.evaluate(() => sessionSignedOut() === true), 8000), 'signed out');
    let s = await h.page.evaluate(look);
    assert.equal(s.pollTimer, false, 'the tick is cancelled');
    assert.deepEqual([s.map, s.sync, s.group], [0, null, null], 'the answers are forgotten');
    assert.equal(s.sectionChars, 0, 'every section is empty'); assert.equal(s.namesInDom, 0);
    b.ctl.release();
    await h.page.evaluate(() => window.__late);                         // the late reply has landed and been handled
    assert.ok(await waitFor(() => h.page.evaluate(() => _rosterSyncPending === false), 6000), 'the queued push came due');
    await h.page.evaluate(() => { refreshAvailabilityOnReturn(); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
    await new Promise(r => setTimeout(r, POLL_MS + 800));
    s = await h.page.evaluate(look);
    assert.deepEqual([s.map, s.sync, s.hubChars, s.sectionChars, s.namesInDom], [0, null, 0, 0, 0], 'the late reply painted and stamped nothing; the shell is still empty');
    const after = b.ctl.since(n0).map(x => `${x.m} ${x.u} ${x.status}`);
    assert.deepEqual(after.filter(x => !/^POST \/api\/identity 200$/.test(x)), [], 'after the logout itself, NOTHING left the device: ' + JSON.stringify(after));
    assert.deepEqual(h.errors, []);
    await h.ctx.close();
  } finally { await b.close(); }
});

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): the SERVER ends the session — the app's own session check stops the poll; no stale roster paints; no further availability read; no POST`, { timeout: 60000 }, async (t) => {
    const b = await harness(t, view); if (!b) return;
    try {
      const h = await b.open('message');
      assert.ok(await boardSettled(h.page), 'the board is live');
      await h.page.evaluate(() => { state.players[0].position = 'Hooker'; saveState('edit'); queueRosterSync(); });
      // The autopilot schedule check is OUT (a device whose first attempt had failed asks again; its read's body is held)…
      b.ctl.holdSchedulesRead();
      await h.page.evaluate(() => { _autopilotEnsured = false; window.__auto = ensureAutopilotSchedule(); });
      assert.ok(await waitFor(async () => b.ctl.held >= 1, 5000), 'the schedules read is out');
      // …when the server ends the session.
      b.ctl.endSession(); const n0 = b.ctl.log.length;
      await h.page.evaluate(() => checkServerSession());             // the existing mechanism, as the boot / focus / poll paths call it
      let s = await h.page.evaluate(look);
      assert.equal(s.signedOut, true, 'the device knows');
      assert.equal(s.pollTimer, false, 'the tick is cancelled');
      assert.deepEqual([s.map, s.sync, s.sectionChars, s.namesInDom], [0, null, 0, 0], 'answers forgotten, shell empty, no name in the DOM');
      assert.ok(await waitFor(() => h.page.evaluate(() => _rosterSyncPending === false), 6000), 'the queued push came due');
      b.ctl.release();
      await h.page.evaluate(() => window.__auto);                      // the schedules read landed (an empty list): the write it would lead to must not follow
      await h.page.evaluate(() => { _autopilotEnsured = false; return ensureAutopilotSchedule(); });   // and a fresh ask makes no read at all
      await new Promise(r => setTimeout(r, POLL_MS + 800));
      s = await h.page.evaluate(look);
      assert.deepEqual([s.hubChars, s.sectionChars, s.namesInDom], [0, 0, 0], 'a tick period later: still nothing painted under the front door');
      const after = b.ctl.since(n0).map(x => `${x.m} ${x.u} ${x.status}`);
      assert.deepEqual(after, ['GET /api/identity?action=session 401'], 'the session check is the ONLY request after the server ended the session: ' + JSON.stringify(after));
      assert.deepEqual(h.errors, []);
      await h.ctx.close();
    } finally { await b.close(); }
  });

  test(`browser (${view}): club switch with a slow roster read — "Loading availability…" until Bravo's roster lands, never "No players yet", never Alpha; then Bravo, painted once`, { timeout: 60000 }, async (t) => {
    const b = await harness(t, view, { multi: true }); if (!b) return;
    try {
      const h = await b.open('message');
      assert.ok(await boardSettled(h.page), 'Alpha\'s board is live');
      b.ctl.holdRoster('team_b');
      const viaSelect = await h.page.evaluate(() => !!document.getElementById('clubSwitchSelect')?.offsetParent);
      if (viaSelect) await h.page.selectOption('#clubSwitchSelect', 'team_b'); else await h.page.evaluate(() => { switchTeamTo('team_b'); });
      // THE GAP: Bravo is in force, its admin data has landed, its roster read is still out.
      assert.ok(await waitFor(() => h.page.evaluate(() => _clubContextId === 'team_b' && _adminData.loaded === true && _rosterAwaitingServer === true && (_adminData.members || []).every(m => m.teamId === 'team_b')), 15000),
        'in the gap: ' + JSON.stringify(await h.page.evaluate(look)) + ' held=' + b.ctl.held + ' log=' + JSON.stringify(b.ctl.log.slice(-12).map(x => x.m + ' ' + x.u + ' ' + x.status)));
      let s = await h.page.evaluate(look);
      assert.equal(s.known, false, 'the roster is not known');
      assert.equal(s.loading, true, 'the board says it is loading');
      assert.equal(s.noPlayers, false, 'not "No players yet"'); assert.equal(s.invite, false, 'no Invite'); assert.deepEqual(s.kpi, [], 'no counts');
      assert.equal(s.rows, 0); assert.equal(s.namesInDom, 0, 'nothing of Alpha');
      const writes = s.hubWrites;
      b.ctl.release();
      assert.ok(await waitFor(() => h.page.evaluate(() => _rosterAwaitingServer === false && document.querySelectorAll('#coach-message .msg-player-row').length === 6), 15000), 'Bravo\'s roster landed');
      assert.ok(await waitFor(() => h.page.evaluate(() => _liveAvailabilityInFlight === null && document.querySelectorAll('#coach-message .msg-kpi').length === 4), 15000), 'and its board');
      s = await h.page.evaluate(look);
      assert.equal(s.known, true); assert.equal(s.loading, false);
      assert.equal(s.rows, 6); assert.equal(s.rowClubs, 'Bravo'); assert.deepEqual(s.kpi, KPI_B);
      assert.equal(s.namesInDom, 0, 'no Alpha anywhere in the DOM'); assert.equal(s.bravoNames >= 6, true);
      // The roster landing paints the hub once; the attendance loader and the board answers for the new squad
      // each paint once more as they land. What must never happen is the same markup painted twice (Build 112).
      const paints = await h.page.evaluate(n => window.__hubMarkup.slice(n), writes);
      assert.ok(paints.length >= 1 && paints.length <= 3, `the landing and what follows it: ${paints.length} paint(s)`);
      assert.ok(paints.every((m, i) => i === 0 || m !== paints[i - 1]), 'no paint repeated the markup before it');
      assert.ok(paints.every(m => /Bravo Player/.test(m) && !/Alpha Player/.test(m)), 'every paint was Bravo\'s');
      assert.deepEqual(h.errors, []);
      await h.ctx.close();
    } finally { await b.close(); }
  });

  test(`browser (${view}): the failed-admin "Try again" is a 44 px tap target — same copy, same line`, { timeout: 60000 }, async (t) => {
    const b = await harness(t, view); if (!b) return;
    try {
      // The admin read's identity call answers 500: the Build 126 failed block, with its button.
      b.ctl.failIdentity = true;
      const h = await b.open('overview');
      assert.ok(await waitFor(() => h.page.evaluate(() => _adminData.failed === true && _adminData.loading === false && _adminRetryTimer !== null), 15000), 'the first admin read failed and a retry is booked');
      assert.ok(await waitFor(() => h.page.evaluate(() => document.querySelectorAll('#coach-overview .ovw-roster-failed .ovw-retry').length === 2), 8000), 'both cards offer Try again');
      const m = await h.page.evaluate(() => [...document.querySelectorAll('#coach-overview .ovw-roster-failed')].map(p => { const btn = p.querySelector('.ovw-retry'), r = btn.getBoundingClientRect(), pr = p.getBoundingClientRect();
        const cs = getComputedStyle(btn); return { w: Math.round(r.width), h: Math.round(r.height), text: btn.innerText.trim(), fontPx: parseFloat(cs.fontSize), blockH: Math.round(pr.height),
          copy: p.innerText.replace(/\s+/g, ' ').trim(), inside: r.left >= pr.left - 8 && r.right <= pr.right + 8 }; }));
      for (const x of m) {
        assert.ok(x.w >= 44 && x.h >= 44, `${view}: tap target ${x.w}×${x.h}, at least 44×44`);
        assert.equal(x.text, 'Try again', 'the copy is unchanged'); assert.equal(x.fontPx, 13, 'and so is the text size');
        assert.match(x.copy, /^Squad could not be loaded This is not an empty squad — the squad list did not load\. Trying again automatically\. Try again$/);
        // 62–63 px measured: the title line plus two lines of copy. A box that kept its padding in the flow would add a 24 px band.
        assert.ok(x.blockH <= 70, `the block still sits on its lines (${x.blockH}px): the padding was handed back to the line`);
        assert.ok(x.inside, 'the box stays within the block');
      }
      assert.equal(await h.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, 'no overflow');
      await h.ctx.close();
    } finally { await b.close(); }
  });
}

test('browser (desktop): a cold load on the Overview paints NO hidden Availability section, yet the board\'s data is loaded; entering Availability paints the hub from it', { timeout: 60000 }, async (t) => {
  const b = await harness(t, 'desktop'); if (!b) return;
  try {
    const h = await b.open('overview');
    assert.ok(await waitFor(() => h.page.evaluate(() => _adminData.loaded === true && _liveAvailabilityInFlight === null && currentResolvedAvailability() !== null && /\d+ players? haven't replied/.test(document.getElementById('coach-overview')?.innerText || '')), 20000), 'the Overview settled with the board read applied');
    let s = await h.page.evaluate(look);
    assert.deepEqual(s.hidden, [], 'no innerHTML write into a coach section that was not on show');
    assert.equal(s.hubChars, 0, 'the hub is untouched'); assert.ok(s.map > 0, 'the board data was loaded all the same');
    assert.equal(s.prompt, "11 players haven't replied");
    assert.equal(b.ctl.log.filter(x => x.u.startsWith('/api/templates')).length, 0, 'the hidden panel\'s templates were not fetched for a section nobody was looking at');
    await h.page.evaluate(() => setSection('coach', 'message'));
    assert.ok(await waitFor(() => h.page.evaluate(() => document.querySelectorAll('#coach-message .msg-player-row').length === 18 && document.querySelectorAll('#coach-message .msg-kpi').length === 4), 10000), 'entering Availability paints the hub from the data already held');
    s = await h.page.evaluate(look);
    assert.deepEqual(s.kpi, KPI_A); assert.deepEqual(s.hidden, [], 'still no hidden write');
    assert.ok(await waitFor(async () => b.ctl.log.filter(x => x.u.startsWith('/api/templates')).length >= 1, 8000), 'the panel loads on entry, not before');
    assert.deepEqual(h.errors, []);
    await h.ctx.close();
  } finally { await b.close(); }
});

test('SOURCE: the tap target is a padded box whose negative margins give the padding back to the line', () => {
  const css = src.slice(src.indexOf('.ovw-retry {'), src.indexOf('.ovw-retry {') + 400);
  assert.match(css, /padding: 12px 8px; margin: -12px -4px;/);
  assert.match(css, /min-height: 44px; min-width: 44px;/);
  assert.match(css, /text-decoration: underline;/, 'it still reads as the link it was');
});
