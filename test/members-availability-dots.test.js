/**
 * MEMBERS AVAILABILITY DOTS — canonical source (MEMBERS-AVAILABILITY-DOTS-FIX-1).
 *
 * The Members list's three availability dots (Match / Tuesday / Thursday) read
 * the bare legacy roster fields p.game / p.trainingTuesday / p.trainingThursday.
 * Since the legacy-id cutover, answers land under DATED occurrence ids —
 * refreshLiveAvailability patches p[sessionKey(datedId)], never the bare trio —
 * so those fields froze weeks ago and Members contradicted the Availability
 * board (production: Alexandre green/green/red vs Available; Victor red/red/red
 * while Available; Sasha and Theo red while Available).
 *
 * Now membersAvailabilityCells() resolves the SAME canonical week
 * (availabilityWeekSessions — the operating group's own fixtures + slots) and
 * the SAME server-first resolver (sessionRows → resolvedAnswerFor) the board
 * renders from. All tests drive the REAL extracted functions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = html.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = html.indexOf(m[0]);
  let i = html.indexOf('{', html.indexOf(')', start)), d = 0;
  for (let b = i; b < html.length; b++) { if (html[b] === '{') d++; else if (html[b] === '}') { d--; if (!d) { i = b; break; } } }
  return html.slice(start, i + 1);
}

/**
 * Sandbox with the REAL canonical chain: membersAvailabilityCells →
 * availabilityWeekSessions → availabilityEventsForWeek + sessionRows →
 * resolvedAnswerFor. Today pinned Mon 2026-09-14 (week 14–20 Sep:
 * Tue=2026-09-15, Thu=2026-09-17).
 */
function makeEnv({ slots, fixtures = [], players, resolved = {}, group = 'grp_x', today = '2026-09-14' } = {}) {
  const body =
    '"use strict";\n' +
    'const CFG = arguments[0];\n' +
    'const state = { operationalGroupId: CFG.group, players: CFG.players };\n' +
    'let _trainingSchedule = { slots: CFG.slots };\n' +
    'let _trainingScheduleAttempted = true, _trainingScheduleGroupId = CFG.group;\n' +
    'let _resolvedAvailability = CFG.resolved;\n' +
    'let _resolvedAvailabilityGroup = CFG.group;\n' +
    'let _availLastSync = CFG.synced === false ? null : "2026-09-14T08:00:00Z";\n' +
    'function availToday(){ return CFG.today; }\n' +
    'function ensureTrainingSchedule(){}\n' +
    'function contextFixtures(){ return CFG.fixtures; }\n' +
    'function normalizeFixture(f){ return f; }\n' +
    'function operationalPlayers(){ return CFG.players; }\n' +
    'function playerIsArchived(){ return false; }\n' +
    html.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0] + '\n' +
    fn('availWeekStart') + '\n' + fn('availAddDays') + '\n' +
    fn('availSlotDateInWeek') + '\n' + fn('availTrainingEventId') + '\n' +
    fn('availabilityEventsForWeek') + '\n' +
    fn('normalizeSessionId') + '\n' + fn('sessionKey') + '\n' + fn('sessionReasonKey') + '\n' +
    fn('liveAvailabilityPlayerKeys') + '\n' +
    fn('currentResolvedAvailability') + '\n' + fn('resolvedAnswerFor') + '\n' +
    // AVAILABILITY-PENDING-1: sessionRows now reports whether an answer is
    // SERVER-CONFIRMED. These cases are about server/local resolution, so this
    // device is holding nothing unsent.
    'function availabilityPendingFor() { return null; }\n' +
    fn('sessionRows') + '\n' + fn('availabilityWeekSessions') + '\n' +
    fn('membersAvailabilityCells') + '\n' +
    'return { cells: membersAvailabilityCells, rows: sessionRows, sessions: availabilityWeekSessions };';
  return new Function(body)({ slots, fixtures, players, resolved, group, today });
}

const SEN_SLOTS = [
  { id: 'slot_tue', day: 'Tue', sessionId: 'tue', active: true },
  { id: 'slot_thu', day: 'Thu', sessionId: 'thu', active: true },
];
const U18_SLOTS = [
  { id: 'slot_msvgzozt_0', day: 'Tue', sessionId: '', active: true },
  { id: 'slot_msvh0skf_1', day: 'Thu', sessionId: '', active: true },
];
const FX = { id: 'fx_sen_1', date: '2026-09-19', opposition: 'Mons', status: 'scheduled' };
// Week of Mon 2026-09-14 → dated training ids:
const TUE_ID = 'slot_tue-20260915', THU_ID = 'slot_thu-20260917';
const U18_TUE = 'slot_msvgzozt_0-20260915', U18_THU = 'slot_msvh0skf_1-20260917';

// A player whose LEGACY fields hold the stale wrong story.
const staleLegacy = (id, name) => ({ id, userId: 'u-' + id, name,
  game: 'unavailable', trainingTuesday: 'unavailable', trainingThursday: 'unavailable' });

const ans = (response, at = '2026-09-14T07:00:00Z') => ({ response, respondedAt: at });

test('1+2. canonical answers OVERRIDE stale legacy fields — the Alexandre/Victor mismatch', () => {
  // Victor: legacy trio says red/red/red; the canonical server answers say
  // Available for the fixture AND both trainings. Members must show the board's story.
  const victor = staleLegacy('p1', 'Victor');
  const env = makeEnv({ slots: SEN_SLOTS, fixtures: [FX], players: [victor],
    resolved: { 'u-p1': { [FX.id]: ans('available'), [TUE_ID]: ans('available'), [THU_ID]: ans('available') } } });
  const [m, t1, t2] = env.cells();
  assert.equal(m.statusFor('p1'), 'available', 'match dot: canonical Available, not legacy red');
  assert.equal(t1.statusFor('p1'), 'available');
  assert.equal(t2.statusFor('p1'), 'available');
});

test('2b. canonical Unavailable also overrides a stale legacy green', () => {
  const p = { id: 'p2', userId: 'u-p2', name: 'G', game: 'available', trainingTuesday: 'available', trainingThursday: 'available' };
  const env = makeEnv({ slots: SEN_SLOTS, fixtures: [FX], players: [p],
    resolved: { 'u-p2': { [FX.id]: ans('unavailable') } } });
  assert.equal(env.cells()[0].statusFor('p2'), 'unavailable', 'the board\'s red wins over legacy green');
});

test('3+4. Maybe and no-reply render as themselves', () => {
  const p = staleLegacy('p3', 'M');
  const env = makeEnv({ slots: SEN_SLOTS, fixtures: [FX], players: [p],
    resolved: { 'u-p3': { [TUE_ID]: ans('maybe') } } });
  const [m, t1, t2] = env.cells();
  assert.equal(t1.statusFor('p3'), 'maybe');
  // No canonical answer for match/Thursday: the local DATED per-player field is
  // empty too (the legacy bare fields are NOT consulted) → no-reply.
  assert.equal(m.statusFor('p3'), 'no-reply', 'stale legacy red does NOT leak into the match dot');
  assert.equal(t2.statusFor('p3'), 'no-reply');
});

test('5+6. the three cells are the current week\'s sessions, ordered Match, Tuesday, Thursday', () => {
  const env = makeEnv({ slots: SEN_SLOTS, fixtures: [FX], players: [] });
  const cells = env.cells();
  assert.deepEqual(cells.map(c => c.lbl), ['M', 'T1', 'T2']);
  assert.deepEqual(cells.map(c => c.name), ['Match', 'Tuesday', 'Thursday']);
  assert.equal(cells.every(c => c.present), true);
  // And they resolve the DATED current-week ids, proven by where answers land:
  const p = { id: 'p4', userId: 'u-p4', name: 'D' };
  const env2 = makeEnv({ slots: SEN_SLOTS, fixtures: [FX], players: [p],
    resolved: { 'u-p4': { [TUE_ID]: ans('available') } } });
  assert.equal(env2.cells()[1].statusFor('p4'), 'available', 'Tuesday cell IS slot_tue-20260915');
});

test('7. U18 uses U18 sessions (sessionId-less slots, real production ids)', () => {
  const p = staleLegacy('p5', 'U18 player');
  const env = makeEnv({ slots: U18_SLOTS, fixtures: [], players: [p], group: 'grp_2b0aa7f9',
    resolved: { 'u-p5': { [U18_TUE]: ans('available'), [U18_THU]: ans('maybe') } } });
  const [m, t1, t2] = env.cells();
  assert.equal(t1.statusFor('p5'), 'available', 'U18 Tuesday = slot_msvgzozt_0-20260915');
  assert.equal(t2.statusFor('p5'), 'maybe',     'U18 Thursday = slot_msvh0skf_1-20260917');
  // No fixtures AND no fixture records → the legacy weekly match card survives (present).
  assert.equal(m.present, true);
});

test('8. Seniors use Seniors sessions — and 9. another group\'s answers cannot leak in', () => {
  const p = staleLegacy('p6', 'Senior');
  // The resolved map holds answers ONLY under U18's dated ids; the Seniors
  // cells resolve Seniors' dated ids, so nothing matches.
  const env = makeEnv({ slots: SEN_SLOTS, fixtures: [FX], players: [p],
    resolved: { 'u-p6': { [U18_TUE]: ans('available'), [U18_THU]: ans('available') } } });
  const [m, t1, t2] = env.cells();
  assert.equal(t1.statusFor('p6'), 'no-reply', "U18's Tuesday answer is not Seniors' Tuesday");
  assert.equal(t2.statusFor('p6'), 'no-reply');
});

test('10. Members dots AGREE with sessionRows — the canonical board result — for every status', () => {
  const players = [
    { id: 'a', userId: 'u-a', name: 'A' }, { id: 'b', userId: 'u-b', name: 'B' },
    { id: 'c', userId: 'u-c', name: 'C' }, { id: 'd', userId: 'u-d', name: 'D' },
  ];
  const env = makeEnv({ slots: SEN_SLOTS, fixtures: [FX], players,
    resolved: {
      'u-a': { [THU_ID]: ans('available') },
      'u-b': { [THU_ID]: ans('maybe') },
      'u-c': { [THU_ID]: ans('unavailable') },
    } });
  const t2 = env.cells()[2];
  const boardRows = env.rows(THU_ID);
  for (const p of players) {
    const boardStatus = boardRows.find(r => r.player.id === p.id).status;
    assert.equal(t2.statusFor(p.id), boardStatus, `${p.name}: Members dot === board row`);
  }
});

test('11. the legacy bare fields can never silently become the source again', () => {
  const src = fn('membersAvailabilityCells');
  for (const forbidden of ['trainingTuesday', 'trainingThursday', 'p.game', "'game'"]) {
    assert.ok(!src.includes(forbidden), `membersAvailabilityCells must not reference ${forbidden}`);
  }
  // The Members dots cell in renderPlayers consumes availCells, and the legacy
  // trio is gone from it.
  const cellIdx = html.indexOf("['game', 'M'], ['trainingTuesday', 'T1']");
  assert.equal(cellIdx, -1, 'the legacy cells triple is deleted from the Members table');
  const cellAt = html.indexOf('<td data-label="Availability">');
  assert.ok(cellAt > 0, 'the Members availability cell exists');
  const dotsRegion = html.slice(cellAt, cellAt + 1600);
  assert.ok(dotsRegion.includes('availCells'), 'the dots render from the canonical cells');
  // CODE lines only — the comment explaining WHY the legacy trio is banned may name it.
  const codeOnly = dotsRegion.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  assert.ok(!codeOnly.includes('trainingTuesday'), 'no legacy field read in the dots cell code');
  assert.ok(!/p\[(?:'|")game(?:'|")\]|p\.game\b/.test(codeOnly), 'no p.game read in the dots cell code');
});

test('12. missing sessions fail SAFELY — status null, never an invented green/red', () => {
  // A group whose schedule has no Thursday slot and no fixture this week
  // (but DOES have fixture records, so no legacy match card).
  const p = staleLegacy('p7', 'NoThu');
  const env = makeEnv({
    slots: [{ id: 'slot_tue', day: 'Tue', sessionId: 'tue', active: true }],
    fixtures: [{ id: 'fx_old', date: '2026-09-05', opposition: 'Past', status: 'played' }],
    players: [p],
    resolved: { 'u-p7': {} } });
  const [m, t1, t2] = env.cells();
  assert.equal(m.present, false, 'no fixture THIS week → no match session');
  assert.equal(m.statusFor('p7'), null, 'absent session claims NOTHING (neutral dot)');
  assert.equal(t2.present, false);
  assert.equal(t2.statusFor('p7'), null, 'stale legacy red cannot fill the gap');
  assert.equal(t1.statusFor('p7'), 'no-reply', 'the session that DOES exist reads canonically');
});

test('12b. a player with no roster row in the group reads as no-reply, never invented', () => {
  const env = makeEnv({ slots: SEN_SLOTS, fixtures: [FX], players: [{ id: 'other', userId: 'u-o', name: 'O' }] });
  assert.equal(env.cells()[0].statusFor('ghost-id'), 'no-reply');
});

test('GROUP STAMP — a resolved map fetched for ANOTHER group does not count as loaded here', () => {
  // The loader's "already loaded" test is currentResolvedAvailability(), whose
  // group stamp is the isolation guard: after Seniors → U18, the map still
  // holds Seniors' answers and must read as UNKNOWN (null), so the loader
  // refetches for U18 instead of trusting another group's data.
  const body =
    '"use strict";\n' +
    'const CFG = arguments[0];\n' +
    'const state = { operationalGroupId: CFG.opGid };\n' +
    'let _resolvedAvailability = { "u-x": {} };\n' +
    'let _resolvedAvailabilityGroup = CFG.mapGid;\n' +
    'let _availLastSync = "2026-09-14T08:00:00Z";\n' +
    fn('currentResolvedAvailability') + '\n' +
    'return currentResolvedAvailability();';
  assert.equal(new Function(body)({ opGid: 'grp_2b0aa7f9', mapGid: 'grp_initial' }), null,
    "another group's map is UNKNOWN, never reused");
  assert.notEqual(new Function(body)({ opGid: 'grp_initial', mapGid: 'grp_initial' }), null,
    'the matching group IS loaded');
});

test('LOADER — ensureMembersAvailability fetches once per group and reuses an already-loaded map', () => {
  const src = fn('ensureMembersAvailability');
  assert.match(src, /currentResolvedAvailability\(\) !== null/, 'an already-loaded canonical map is reused, not refetched');
  assert.match(src, /_membersAvailFetchedFor === gid/, 'once per group');
  assert.match(src, /refreshLiveAvailability\(\{ boardOnly: true \}\)/, 'the lightweight canonical fetch');
  assert.match(src, /renderPlayers\(\)/, 'the Members list repaints when the data lands');
  // renderPlayers actually calls it.
  assert.match(fn('renderPlayers'), /ensureMembersAvailability\(\)/);
});

test('ORDER PIN — the rendered dots consume availCells computed once per render', () => {
  const rp = fn('renderPlayers');
  assert.match(rp, /const availCells = membersAvailabilityCells\(\)/);
  const compute = rp.indexOf('const availCells');
  const use = rp.indexOf('availCells.map');
  assert.ok(compute > 0 && use > compute, 'computed before the row loop uses it');
});
