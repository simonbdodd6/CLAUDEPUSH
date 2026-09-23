/**
 * Render feedback loops from loader completions.
 *
 * render() re-runs EVERY section renderer, and several of those renderers kick
 * off background loaders. A loader that repaints unconditionally when its reply
 * lands therefore restarts the whole cycle: loader → render → renderers →
 * loaders → render. A cold Availability load measured eight render() passes,
 * most of them attributed to loader completions that had changed nothing a
 * human could see.
 *
 * The rule pinned here: a loader repaints only when the state IT OWNS actually
 * changed — and every real change (first load, a different answer, a failure,
 * an empty result, a group switch, a fixture's stored draft) still repaints.
 *
 * The behavioural tests drive the REAL extracted functions with a fetch the
 * test releases by hand, so the ordering is genuine.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
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
// Enough microtask turns for the awaits inside a loader to run.
const TICK = `const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };`;

// ── 1. Match Day's autopilot fill is section work, not render work ──────────
// This is the measured two-pass loop: renderMatchday ran off-screen during a
// cold Availability load, autopilotFillMatchFromFixture picked the next
// fixture, and setMatchCentreFixture + mcHydrateSelectedFixture each rendered.

test('matchday: the autopilot fixture fill waits for Match Day to be on screen', () => {
  const rm = fn('renderMatchday');
  assert.match(rm, /if \(autopilotOn\(\) && isCoach\(\) && coachSectionActive\('matchday'\)\) autopilotFillMatchFromFixture\(\);/,
    'gated on the section being on screen');
  assert.doesNotMatch(rm, /\n\s*if \(autopilotOn\(\) && isCoach\(\)\) autopilotFillMatchFromFixture\(\);/,
    'and the ungated call is gone');
  // The Overview keeps its own (already gated) copy, so nothing stops filling.
  assert.match(fn('renderCoachOverview'), /coachSectionActive\('overview'\)\) \{[\s\S]*autopilotFillMatchFromFixture\(\);/);
  // The fill itself is untouched — it still writes through the ONE selection
  // path, which is what makes the selection render legitimate when it happens.
  assert.match(fn('autopilotFillMatchFromFixture'), /if \(!setMatchCentreFixture\(next\.id\)\) return;/);
});

test('matchday: entering the section still fills, and a user selection still repaints', () => {
  const run = (section) => new Function(`"use strict";
    const calls = [];
    function autopilotOn() { return true; }
    function isCoach() { return true; }
    function autopilotFillMatchFromFixture() { calls.push('fill'); }
    function loadCoachDraftsList() {} function loadCoachPublication() {}
    const state = { activeView: 'coach', activeCoachSection: ${JSON.stringify(section)} };
    ${fn('coachSectionActive')}
    if (autopilotOn() && isCoach() && coachSectionActive('matchday')) autopilotFillMatchFromFixture();
    return calls;
  `)();
  assert.deepEqual(run('matchday'), ['fill'], 'Match Day on screen still fills');
  assert.deepEqual(run('message'), [], 'a cold Availability load does not');
  // setMatchCentreFixture — the user's own fixture tap — still repaints.
  assert.match(fn('setMatchCentreFixture'), /saveState\('Match fixture linked'\);\s*\n\s*render\(\);/,
    'choosing a fixture is a user-visible change and paints unconditionally');
});

// ── 2. loadRosterFromServer ─────────────────────────────────────────────────
function rosterScope({ players = [], coach = true, syncPending = false, ownRecord = false } = {}) {
  return new Function(`"use strict";
    ${TICK}
    const window = {};
    const calls = [];
    function fetch(url) { return new Promise((resolve, reject) => { calls.push({ url, resolve, reject }); }); }
    const reply = (i, body) => calls[i].resolve({ ok: true, json: async () => body });
    const httpFail = (i) => calls[i].resolve({ ok: false, status: 500, json: async () => ({}) });
    let renders = 0; function render() { renders++; }
    let saves = 0; function saveState() { saves++; }
    let queued = 0; function queueRosterSync() { queued++; }
    function isCoach() { return ${coach}; }
    function clubStateOwned() { return true; }
    let _rosterSyncPending = ${syncPending};
    let _rosterLastSyncedFp = 'stale';
    const state = { players: ${JSON.stringify(players)}, users: [] };
    function ensurePlayerUsersForRoster(ps) { return ps.map(p => ({ id: 'u' + p.id, name: p.name })); }
    let addOwn = ${ownRecord};
    function ensureOwnPlayerRecord() {
      if (!addOwn) return false;
      addOwn = false;
      state.players = [...state.players, { id: 'me', name: 'Me', position: 'FH' }];
      return true;
    }
    ${fn('rosterFingerprint')}
    ${fn('loadRosterFromServer')}
    return { calls, reply, httpFail, tick, loadRosterFromServer, state,
      renders: () => renders, saves: () => saves, queued: () => queued,
      fp: () => _rosterLastSyncedFp };
  `)();
}
const P1 = { id: 'p1', name: 'Ana', position: 'FL' };
const P2 = { id: 'p2', name: 'Bo', position: 'SH' };

test('roster: a cold-load reply identical to the persisted roster does not repaint', async () => {
  // The returning-device case: localStorage already holds exactly what the
  // server is about to answer. Nothing on screen changes, so nothing repaints.
  const s = rosterScope({ players: [P1, P2] });
  s.state.users = [{ id: 'up1', name: 'Ana' }, { id: 'up2', name: 'Bo' }];
  const p = s.loadRosterFromServer(); await s.tick();
  s.reply(0, { players: [P1, P2] }); await p; await s.tick();
  assert.equal(s.renders(), 0, 'identical roster — no repaint');
  assert.equal(s.saves(), 1, 'but the roster IS still adopted and persisted');
  assert.equal(s.fp(), JSON.stringify([P1, P2]), 'and the synced baseline is refreshed');
});

test('roster: a genuinely different roster still repaints', async () => {
  for (const [label, server] of [
    ['a player added elsewhere', [P1, P2, { id: 'p3', name: 'Cy', position: 'LK' }]],
    ['a player removed', [P1]],
    ['a position changed', [P1, { ...P2, position: 'FH' }]],
  ]) {
    const s = rosterScope({ players: [P1, P2] });
    s.state.users = [{ id: 'up1', name: 'Ana' }, { id: 'up2', name: 'Bo' }];
    const p = s.loadRosterFromServer(); await s.tick();
    s.reply(0, { players: server }); await p; await s.tick();
    assert.equal(s.renders(), 1, label + ' repaints');
  }
});

test('roster: the first load onto an empty device repaints (loading → loaded)', async () => {
  const s = rosterScope({ players: [] });
  const p = s.loadRosterFromServer(); await s.tick();
  s.reply(0, { players: [P1] }); await p; await s.tick();
  assert.equal(s.renders(), 1);
});

test('roster: the dual-role own record restored after adoption still repaints', async () => {
  // ensureOwnPlayerRecord runs AFTER the server list is adopted, so the
  // comparison has to be taken before adoption and read after this call.
  const s = rosterScope({ players: [P1], ownRecord: true });
  s.state.users = [{ id: 'up1', name: 'Ana' }];
  const p = s.loadRosterFromServer(); await s.tick();
  s.reply(0, { players: [P1] }); await p; await s.tick();
  assert.equal(s.renders(), 1, 'the server list matched, but this device gained its own record');
  assert.ok(s.state.players.some(x => x.id === 'me'));
});

test('roster: the unchanged paths are unchanged (HTTP failure, pending sync, empty server roster)', async () => {
  const fail = rosterScope({ players: [P1] });
  let p = fail.loadRosterFromServer(); await fail.tick();
  fail.httpFail(0); await p; await fail.tick();
  assert.equal(fail.renders(), 0, 'a refused read never repainted and still does not');
  assert.deepEqual(fail.state.players, [P1], 'and never blanks the roster');

  const racing = rosterScope({ players: [P1], syncPending: true });
  p = racing.loadRosterFromServer(); await racing.tick();
  racing.reply(0, { players: [P2] }); await p; await racing.tick();
  assert.equal(racing.renders(), 0);
  assert.equal(racing.queued(), 1, 'the local roster is newer — the pending sync is re-queued');
  assert.deepEqual(racing.state.players, [P1], 'and local wins');

  const empty = rosterScope({ players: [P1] });
  p = empty.loadRosterFromServer(); await empty.tick();
  empty.reply(0, { players: [] }); await p; await empty.tick();
  assert.equal(empty.renders(), 0, 'an empty server roster is never copied over local');
  assert.equal(empty.queued(), 1, 'this club\'s proven local roster is pushed instead');
});

// ── 3. loadAttendance ───────────────────────────────────────────────────────
function attendanceScope({ scope = 'group', group = 'g1' } = {}) {
  return new Function(`"use strict";
    ${TICK}
    const calls = [];
    function fetch(url) { return new Promise((resolve, reject) => { calls.push({ url, resolve, reject }); }); }
    const reply = (i, body) => calls[i].resolve({ ok: true, json: async () => body });
    const httpFail = (i, err) => calls[i].resolve({ ok: false, status: 403, json: async () => ({ error: err }) });
    const fail = (i) => calls[i].reject(new Error('offline'));
    let renders = 0; function render() { renders++; }
    let _attendance = null, _attendanceGroup = null, _attendanceLoading = false;
    let _attendanceFailed = null, _attendanceReason = '', _attendanceSelfKey = '';
    let _scope = ${JSON.stringify(scope)};
    function attendanceReadScope() { return _scope; }
    const state = { operationalGroupId: ${JSON.stringify(group)} };
    ${fn('loadAttendance')}
    return { calls, reply, httpFail, fail, tick, loadAttendance, state,
      renders: () => renders, att: () => _attendance, reason: () => _attendanceReason,
      setScope: s => { _scope = s; } };
  `)();
}
const SESS = { sessions: { 's1|2026-09-08': { ana: 'present' } } };

test('attendance: the first load repaints; an identical forced reload does not', async () => {
  const s = attendanceScope();
  let p = s.loadAttendance(); await s.tick(); s.reply(0, SESS); await p; await s.tick();
  assert.equal(s.renders(), 1, 'unknown → loaded is a real transition');
  p = s.loadAttendance(true); await s.tick(); s.reply(1, SESS); await p; await s.tick();
  assert.equal(s.calls.length, 2, 'the read itself still happens every time');
  assert.equal(s.renders(), 1, 'but an identical register does not repaint');
});

test('attendance: a new mark, an empty register and a group switch all repaint', async () => {
  const s = attendanceScope();
  let p = s.loadAttendance(); await s.tick(); s.reply(0, SESS); await p; await s.tick();
  assert.equal(s.renders(), 1);

  p = s.loadAttendance(true); await s.tick();
  s.reply(1, { sessions: { 's1|2026-09-08': { ana: 'present', bo: 'absent' } } });
  await p; await s.tick();
  assert.equal(s.renders(), 2, 'a mark someone else recorded repaints');

  p = s.loadAttendance(true); await s.tick(); s.reply(2, { sessions: {} }); await p; await s.tick();
  assert.equal(s.renders(), 3, 'clearing back to an EMPTY register is a change, not a no-op');

  s.state.operationalGroupId = 'g2';
  p = s.loadAttendance(); await s.tick();
  assert.match(s.calls[3].url, /group=g2/);
  s.reply(3, { sessions: {} }); await p; await s.tick();
  assert.equal(s.renders(), 4, 'the same answer for ANOTHER group still repaints');
});

test('attendance: failure transitions repaint; a repeated identical failure does not', async () => {
  const s = attendanceScope();
  let p = s.loadAttendance(); await s.tick(); s.reply(0, SESS); await p; await s.tick();
  assert.equal(s.renders(), 1);

  p = s.loadAttendance(true); await s.tick(); s.httpFail(1, 'Not permitted'); await p; await s.tick();
  assert.equal(s.renders(), 2, 'loaded → failed must be seen');
  assert.equal(s.att(), null);
  assert.equal(s.reason(), 'Not permitted');

  p = s.loadAttendance(true); await s.tick(); s.httpFail(2, 'Not permitted'); await p; await s.tick();
  assert.equal(s.renders(), 2, 'the same failure is already on screen');

  p = s.loadAttendance(true); await s.tick(); s.reply(3, SESS); await p; await s.tick();
  assert.equal(s.renders(), 3, 'and recovery repaints');
});

test('attendance: an unidentifiable self read repaints once, and the denied scope is unchanged', async () => {
  const s = attendanceScope({ scope: 'self', group: '' });
  let p = s.loadAttendance(); await s.tick(); s.reply(0, { sessions: {} }); await p; await s.tick();
  assert.equal(s.renders(), 1, 'no selfKey — unresolved identity must be shown');
  assert.equal(s.att(), null);
  p = s.loadAttendance(true); await s.tick(); s.reply(1, { sessions: {} }); await p; await s.tick();
  assert.equal(s.renders(), 1, 'the same unresolved answer does not repaint again');

  const denied = attendanceScope();
  denied.setScope('none');
  await denied.loadAttendance();
  assert.equal(denied.calls.length, 0, 'no read at all when the caller may not see the register');
  assert.equal(denied.renders(), 0);
});

// ── 4. mcHydrateSelectedFixture ─────────────────────────────────────────────
function hydrateScope({ fixture = 'fx1', side = 's1', matchCentre = null, formationNames = {}, bench = [] } = {}) {
  return new Function(`"use strict";
    ${TICK}
    const calls = [];
    function fetch(url) { return new Promise((resolve, reject) => { calls.push({ url, resolve, reject }); }); }
    const reply = (i, body) => calls[i].resolve({ ok: true, json: async () => body });
    let renders = 0; function render() { renders++; }
    function saveState() {}
    function isCoach() { return true; }
    const MATCH_MINUTES_DEFAULT = 80;
    const state = {
      // Exactly the shape setMatchCentreFixture leaves behind: the selection,
      // published: false, no events, default full time.
      matchCentre: ${JSON.stringify(matchCentre || { fixtureId: fixture, sideId: side, published: false, substitutions: [], matchMinutes: 80 })},
      formationNames: ${JSON.stringify(formationNames)},
      benchPlayers: ${JSON.stringify(bench)},
    };
    let _mcSheetFixtureId = null, _mcSheetSideId = null, _mcMatchRecordLoadedFor = null;
    function matchCentreFixtureId() { return String(state.matchCentre.fixtureId || ''); }
    function matchCentreSideId() { return String(state.matchCentre.sideId || ''); }
    function matchCentreSelectedFixture() { return { id: matchCentreFixtureId(), opposition: 'Rivals', date: '2026-10-04' }; }
    let applied = 0; function mcApplyFixtureDisplay() { applied++; }
    let others = 0; function mcLoadOtherSideSelections() { others++; }
    ${fn('mcHydrateSelectedFixture')}
    return { calls, reply, tick, mcHydrateSelectedFixture, state,
      renders: () => renders, others: () => others, bound: () => _mcSheetFixtureId,
      recordFor: () => _mcMatchRecordLoadedFor,
      detach: () => { state.matchCentre = { ...state.matchCentre, fixtureId: 'other' }; } };
  `)();
}
const NO_DRAFT = { draft: null };
const NO_SQUAD = { squad: null };

test('matchday: hydrating a fixture with nothing stored does not repaint', async () => {
  // setMatchCentreFixture has ALREADY rendered the selection. An empty sheet
  // hydrating to an empty sheet leaves the screen byte-identical.
  const s = hydrateScope();
  const p = s.mcHydrateSelectedFixture('fx1'); await s.tick();
  s.reply(0, NO_DRAFT); s.reply(1, NO_SQUAD); await p; await s.tick();
  assert.equal(s.renders(), 0, 'nothing changed — no second paint');
  assert.equal(s.bound(), 'fx1', 'but the sheet IS bound, so saves are unlocked');
  assert.equal(s.recordFor(), 'fx1', 'and the match record counts as read');
  assert.equal(s.others(), 1, 'the sibling side still loads independently');
});

test('matchday: a stored draft, a published flag and stored substitutions each repaint', async () => {
  const draft = hydrateScope();
  let p = draft.mcHydrateSelectedFixture('fx1'); await draft.tick();
  draft.reply(0, { draft: { fixtureId: 'fx1', sideId: 's1', formationNames: { 10: 'Ana' }, benchPlayers: ['Bo'] } });
  draft.reply(1, NO_SQUAD); await p; await draft.tick();
  assert.equal(draft.renders(), 1, 'the stored sheet arrived');
  assert.deepEqual(draft.state.formationNames, { 10: 'Ana' });

  const pub = hydrateScope();
  p = pub.mcHydrateSelectedFixture('fx1'); await pub.tick();
  pub.reply(0, NO_DRAFT);
  pub.reply(1, { squad: { published: true, substitutions: [], matchMinutes: 80 } });
  await p; await pub.tick();
  assert.equal(pub.renders(), 1, 'published is a per-fixture fact the screen shows');

  const subs = hydrateScope();
  p = subs.mcHydrateSelectedFixture('fx1'); await subs.tick();
  subs.reply(0, NO_DRAFT);
  subs.reply(1, { squad: { published: false, substitutions: [{ id: 'e1', min: 55 }], matchMinutes: 80 } });
  await p; await subs.tick();
  assert.equal(subs.renders(), 1, 'this fixture\'s own events arrived');
});

test('matchday: the previous fixture\'s events being dropped repaints', async () => {
  // Carrying another match's substitutions is exactly what must never persist
  // on screen, so clearing them is a user-visible change.
  const s = hydrateScope({ matchCentre: { fixtureId: 'fx1', sideId: 's1', published: false, substitutions: [{ id: 'old' }], matchMinutes: 80 } });
  const p = s.mcHydrateSelectedFixture('fx1'); await s.tick();
  s.reply(0, NO_DRAFT); s.reply(1, NO_SQUAD); await p; await s.tick();
  assert.equal(s.renders(), 1);
  assert.deepEqual(s.state.matchCentre.substitutions, []);
});

test('matchday: a stale reply is still discarded entirely', async () => {
  const s = hydrateScope();
  const p = s.mcHydrateSelectedFixture('fx1'); await s.tick();
  s.detach();                                   // the coach moved to another fixture
  s.reply(0, { draft: { fixtureId: 'fx1', sideId: 's1', formationNames: { 10: 'Ana' } } });
  s.reply(1, NO_SQUAD); await p; await s.tick();
  assert.equal(s.renders(), 0);
  assert.deepEqual(s.state.formationNames, {}, 'the old fixture\'s sheet is never applied');
  assert.equal(s.bound(), null, 'and nothing is bound');
});

// ── 5. loadTrainingSchedule ─────────────────────────────────────────────────
function scheduleScope({ group = 'g1' } = {}) {
  return new Function(`"use strict";
    ${TICK}
    const calls = [];
    function fetch(url) { return new Promise((resolve, reject) => { calls.push({ url, resolve, reject }); }); }
    const reply = (i, body) => calls[i].resolve({ ok: true, json: async () => body });
    const httpFail = (i) => calls[i].resolve({ ok: false, status: 500, json: async () => ({}) });
    let renders = 0; function render() { renders++; }
    let _trainingSchedule = null, _trainingScheduleAttempted = false;
    let _trainingScheduleGroupId = '', _trainingScheduleInFlight = null, _trainingPubLoadedAt = 99;
    let _gid = ${JSON.stringify(group)};
    function trainingGroupParam() { return _gid; }
    ${fn('loadTrainingSchedule')}
    return { calls, reply, httpFail, tick, loadTrainingSchedule,
      renders: () => renders, sched: () => _trainingSchedule, pub: () => _trainingPubLoadedAt,
      attempted: () => _trainingScheduleAttempted, setGroup: g => { _gid = g; } };
  `)();
}
const SLOTS = { slots: [{ id: 'slot_tue', day: 'tue', time: '19:00' }], canEdit: true };

test('training: the schedule\'s first load repaints; an identical reload does not', async () => {
  const s = scheduleScope();
  let p = s.loadTrainingSchedule(); await s.tick(); s.reply(0, SLOTS); await p; await s.tick();
  assert.equal(s.renders(), 1, 'the slot table arrived — dated occurrence keys became resolvable');
  assert.equal(s.pub(), 0, 'and the publication throttle is released');

  p = s.loadTrainingSchedule(true); await s.tick(); s.reply(1, SLOTS); await p; await s.tick();
  assert.equal(s.calls.length, 2, 'the forced read still happens');
  assert.equal(s.renders(), 1, 'but an unchanged schedule does not repaint');
});

test('training: a changed slot and a group switch both repaint', async () => {
  const s = scheduleScope();
  let p = s.loadTrainingSchedule(); await s.tick(); s.reply(0, SLOTS); await p; await s.tick();

  p = s.loadTrainingSchedule(true); await s.tick();
  s.reply(1, { slots: [{ id: 'slot_tue', day: 'tue', time: '19:30' }], canEdit: true });
  await p; await s.tick();
  assert.equal(s.renders(), 2, 'a retimed session repaints');

  s.setGroup('g2');
  p = s.loadTrainingSchedule(true); await s.tick();
  assert.match(s.calls[2].url, /group=g2/);
  s.reply(2, { slots: [{ id: 'slot_tue', day: 'tue', time: '19:30' }], canEdit: true });
  await p; await s.tick();
  assert.equal(s.renders(), 3, 'the same slots for ANOTHER group are another group\'s schedule');
});

test('training: a failed read still releases the retry latch and never repaints', async () => {
  const s = scheduleScope();
  const p = s.loadTrainingSchedule(); await s.tick(); s.httpFail(0); await p; await s.tick();
  assert.equal(s.renders(), 0);
  assert.equal(s.attempted(), false, 'the next render may try again (unchanged)');
});

// ── 6. Several completions at once lose nothing ─────────────────────────────
test('cold load: loaders completing together each keep their own update', async () => {
  // The feedback loop this task removes is loaders repainting for NOTHING.
  // Two real changes landing in the same tick must still produce two paints,
  // and two no-op landings must produce none — no coalescing, no swallowing.
  const roster = rosterScope({ players: [P1] });
  roster.state.users = [{ id: 'up1', name: 'Ana' }];
  const att = attendanceScope();
  const sched = scheduleScope();

  const ps = [roster.loadRosterFromServer(), att.loadAttendance(), sched.loadTrainingSchedule()];
  await roster.tick(); await att.tick(); await sched.tick();

  roster.reply(0, { players: [P1, P2] });         // changed
  att.reply(0, SESS);                             // first load
  sched.reply(0, SLOTS);                          // first load
  await Promise.all(ps);
  await roster.tick(); await att.tick(); await sched.tick();
  assert.equal(roster.renders(), 1, 'the roster change was not lost');
  assert.equal(att.renders(), 1, 'the register was not lost');
  assert.equal(sched.renders(), 1, 'the schedule was not lost');

  // Now the quiet round: the same three answers again, in the same tick.
  const ps2 = [roster.loadRosterFromServer(), att.loadAttendance(true), sched.loadTrainingSchedule(true)];
  await roster.tick(); await att.tick(); await sched.tick();
  roster.reply(1, { players: [P1, P2] });
  att.reply(1, SESS);
  sched.reply(1, SLOTS);
  await Promise.all(ps2);
  await roster.tick(); await att.tick(); await sched.tick();
  assert.equal(roster.renders(), 1, 'nothing changed — nothing repainted');
  assert.equal(att.renders(), 1);
  assert.equal(sched.renders(), 1);
});

// ── 7. Loaders deliberately left alone ──────────────────────────────────────
test('unchanged: the loaders that already compare, and the ones that must always paint', () => {
  // Medical already compares, and its cold-load paint is the loading → loaded
  // transition, which must survive.
  const med = fn('loadMedicalFromServer');
  assert.match(med, /if \(before !== JSON\.stringify\(\[_sharedMedical\.cases, _sharedMedical\.players\]\)\) render\(\);/);
  assert.match(med, /const before = _sharedMedical\.loaded\s*\n\s*\? JSON\.stringify/,
    'an unloaded store compares as null, so the first answer always paints');

  // Identity/context: the group in force changing — and context resolving —
  // are exactly the changes that must never be optimised away.
  const ident = fn('adoptIdentityPayload');
  assert.match(ident, /if \(state\.operationalGroupId !== _beforeGid \|\| _wasPending\) render\(\);/);
  assert.match(ident, /if \(adoptClubContext\(d\?\.teamMember\?\.teamId\)\) hydrateClubFromServer\(\)/,
    'a club change still re-hydrates');

  // The published flag already had this exact shape; it is the idiom copied.
  assert.match(fn('mcRefreshPublishedForFixture'),
    /if \(Boolean\(\(state\.matchCentre \|\| \{\}\)\.published\) !== published\) \{/);
});
