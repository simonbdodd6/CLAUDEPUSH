/**
 * TRAINING PLANNER WEEK ROLLOVER (TRAINING-WEEK-ROLLOVER-1).
 *
 * Production symptom (Mon 14 Sep 2026): the coach Training planner still
 * opened on 7–13 September. state.trainingWeekStart is PERSISTED state and
 * trainingViewedWeek() honoured any well-formed value forever, so a planner
 * last used during week N still displayed week N in week N+1 — the exact
 * stale-week trap availViewedWeek fixed for players (Build AQ).
 *
 * The rule now: a stored PAST week is honoured only while the coach
 * explicitly navigated during the current real week (_trainingWeekNavIn,
 * session-lexical, never persisted); a fresh load / restored state / PWA
 * left open across the Sunday→Monday rollover snaps to the current week.
 * A stored FUTURE week is always preserved — planning ahead is a feature.
 * Malformed or missing values reset to the current week.
 *
 * All tests drive the REAL functions extracted from index.html.
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
// The stamp declaration must travel with the functions (it is the mechanism).
const NAV_DECL = html.match(/let _trainingWeekNavIn = '';[^\n]*/);
if (!NAV_DECL) throw new Error('_trainingWeekNavIn declaration not found');

/** Real trainingViewedWeek/Shift/GoTo + setTrainingSession under a controlled
 *  clock. `today` is mutable via env.setToday — the same session living
 *  across a rollover. */
function makeEnv({ stored = null, today = '2026-09-14' } = {}) {
  const body =
    '"use strict";\n' +
    'const CFG = arguments[0];\n' +
    'let TODAY = CFG.today;\n' +
    'const state = { trainingWeekStart: CFG.stored, trainingActiveSession: "tue",\n' +
    '  trainingBlocks: CFG.blocks || {}, trainingAdopted: CFG.adopted || {} };\n' +
    'let saves = 0, renders = 0;\n' +
    'function availToday(){ return TODAY; }\n' +
    'function saveState(){ saves++; }\n' +
    'function render(){ renders++; }\n' +
    fn('availWeekStart') + '\n' + fn('availAddDays') + '\n' +
    fn('trainingDateLabel') + '\n' + fn('trainingDateFromSessionId') + '\n' +
    NAV_DECL[0] + '\n' +
    fn('trainingViewedWeek') + '\n' + fn('trainingIsCurrentWeek') + '\n' +
    fn('trainingShiftWeek') + '\n' + fn('trainingGoToThisWeek') + '\n' +
    fn('setTrainingSession') + '\n' +
    'return { state,\n' +
    '  viewed: trainingViewedWeek, isCurrent: trainingIsCurrentWeek,\n' +
    '  shift: trainingShiftWeek, goToThisWeek: trainingGoToThisWeek,\n' +
    '  open: setTrainingSession,\n' +
    '  setToday: t => { TODAY = t; },\n' +
    '  navIn: () => _trainingWeekNavIn, counts: () => ({ saves, renders }) };';
  return new Function(body)({ stored, today });
}

// ---- A–E: initialization / restoration ------------------------------------

test('A. STALE PAST WEEK — stored 2026-09-07, today Mon 2026-09-14 → rolls to 2026-09-14', () => {
  const env = makeEnv({ stored: '2026-09-07', today: '2026-09-14' });
  assert.equal(env.viewed(), '2026-09-14', 'the planner opens on 14–20 September');
  assert.equal(env.isCurrent(), true);
});

test('B. CURRENT WEEK — stored value inside the current week is preserved', () => {
  // Mid-week: today Thu 17 Sep, stored Monday 14 Sep (the current week's Monday).
  const env = makeEnv({ stored: '2026-09-14', today: '2026-09-17' });
  assert.equal(env.viewed(), '2026-09-14', 'current week untouched');
});

test('C. NO STORED WEEK — defaults to the current week', () => {
  for (const stored of [null, '', undefined]) {
    const env = makeEnv({ stored, today: '2026-09-14' });
    assert.equal(env.viewed(), '2026-09-14');
  }
});

test('D. MALFORMED STORED VALUE — resets to the current week', () => {
  for (const stored of ['garbage', '2026-9-7', '20260907', '2026-09-07T00:00:00Z', 42, {}]) {
    const env = makeEnv({ stored, today: '2026-09-14' });
    assert.equal(env.viewed(), '2026-09-14', `malformed ${JSON.stringify(stored)} resets`);
  }
});

test('E. FUTURE WEEK — a deliberately planned-ahead week is preserved on restore', () => {
  const env = makeEnv({ stored: '2026-09-21', today: '2026-09-14' });
  assert.equal(env.viewed(), '2026-09-21', 'planning ahead survives a reload');
  assert.equal(env.isCurrent(), false);
});

// ---- F–G: manual navigation and the rollover boundary ----------------------

test('F. MANUAL PREVIOUS-WEEK NAVIGATION — stays selected across renders, no snap-back', () => {
  const env = makeEnv({ stored: '2026-09-14', today: '2026-09-17' });
  env.shift(-1);
  assert.equal(env.state.trainingWeekStart, '2026-09-07', 'the arrow moved one week back');
  // O. Repeated renders (every render calls trainingViewedWeek) must not reset it.
  for (let i = 0; i < 5; i++) assert.equal(env.viewed(), '2026-09-07', 'render ' + i + ' preserves the choice');
  env.shift(-1);
  assert.equal(env.viewed(), '2026-08-31', 'two weeks back, still honoured');
});

test('F2. arrows resolve the STALE base first — one tap back from a stale week means current−7', () => {
  // availShiftWeek's rule: the coach is LOOKING at the snapped current week,
  // so "previous" is relative to it, not to the stale stored value.
  const env = makeEnv({ stored: '2026-08-24', today: '2026-09-14' });
  env.shift(-1);
  assert.equal(env.state.trainingWeekStart, '2026-09-07', 'previous of the CURRENT week, not of the stale one');
});

test('G. SUNDAY → MONDAY ROLLOVER — a session left open across midnight snaps on the new week', () => {
  const env = makeEnv({ stored: '2026-09-07', today: '2026-09-13' }); // Sunday
  assert.equal(env.viewed(), '2026-09-07', 'Sunday: still the current week');
  env.setToday('2026-09-14');                                        // Monday
  assert.equal(env.viewed(), '2026-09-14', 'Monday: rolled over');
});

test('G2. navigation stamped LAST week does not survive the rollover', () => {
  const env = makeEnv({ stored: '2026-09-07', today: '2026-09-10' }); // Thu, week of 7 Sep
  env.shift(-1);                                                     // deliberately viewing 2026-08-31
  assert.equal(env.viewed(), '2026-08-31', 'honoured within the real week');
  env.setToday('2026-09-14');                                        // Monday rollover
  assert.equal(env.viewed(), '2026-09-14', 'the old stamp expires with its week');
});

// ---- H–J: calendar boundaries ----------------------------------------------

test('H. MONTH BOUNDARY — Mon 31 Aug week rolls to Mon 7 Sep, and Sep→Oct', () => {
  const a = makeEnv({ stored: '2026-08-31', today: '2026-09-07' });
  assert.equal(a.viewed(), '2026-09-07');
  const b = makeEnv({ stored: '2026-09-28', today: '2026-10-01' }); // Thu 1 Oct is in week of Mon 28 Sep
  assert.equal(b.viewed(), '2026-09-28', 'a week STRADDLING the month boundary is the current week — preserved');
});

test('I. YEAR BOUNDARY — December → January', () => {
  // Mon 28 Dec 2026 starts the week containing Fri 1 Jan 2027.
  const a = makeEnv({ stored: '2026-12-28', today: '2027-01-01' });
  assert.equal(a.viewed(), '2026-12-28', 'the straddling week is current on 1 Jan');
  const b = makeEnv({ stored: '2026-12-21', today: '2027-01-04' });
  assert.equal(b.viewed(), '2027-01-04', 'an old December week rolls to the January week');
});

test('J. DST BOUNDARY — the late-October transition does not skew the week', () => {
  // Europe: clocks fall back Sun 25 Oct 2026. Week math is pure UTC date
  // arithmetic on ISO dates, so Mon 26 Oct is a clean new week.
  const env = makeEnv({ stored: '2026-10-19', today: '2026-10-26' });
  assert.equal(env.viewed(), '2026-10-26');
  const same = makeEnv({ stored: '2026-10-19', today: '2026-10-25' }); // the DST Sunday itself
  assert.equal(same.viewed(), '2026-10-19', 'Sunday of the transition week is still that week');
});

// ---- K–L: Training Sync independence ---------------------------------------

test('K. SYNC INDEPENDENCE — the rollover touches ONLY trainingWeekStart', () => {
  const blocks = { 'slot_thu-20260910': [{ id: 'b1', time: '19:30', activity: 'Last week plan' }] };
  const adopted = { 'slot_thu-20260910': { rev: 'rev1', fp: 'fp1' } };
  const env = makeEnv({ stored: '2026-09-07', today: '2026-09-14' });
  env.state.trainingBlocks = blocks;
  env.state.trainingAdopted = adopted;
  const before = JSON.stringify({ b: env.state.trainingBlocks, a: env.state.trainingAdopted });
  env.viewed();                                          // triggers the rollover
  assert.equal(env.state.trainingWeekStart, '2026-09-14');
  assert.equal(JSON.stringify({ b: env.state.trainingBlocks, a: env.state.trainingAdopted }), before,
    'blocks, adoption records, revisions and fingerprints are untouched');
});

test('K2. SOURCE PIN — trainingViewedWeek touches no publication/adoption state', () => {
  const src = fn('trainingViewedWeek');
  for (const forbidden of ['trainingBlocks', 'trainingAdopted', 'publishedRevision', '_trainingPubState', 'fetch', 'saveState']) {
    assert.ok(!src.includes(forbidden), `trainingViewedWeek must not reference ${forbidden}`);
  }
});

test('L. PREVIOUS-WEEK CONTENT PRESERVED — rollover changes the VIEW, the old week stays reachable with its plan', () => {
  const env = makeEnv({ stored: '2026-09-07', today: '2026-09-14' });
  env.state.trainingBlocks = { 'slot_thu-20260910': [{ id: 'b1', activity: 'Week-37 Thursday plan' }] };
  env.viewed();                                          // rolled to 2026-09-14
  env.shift(-1);                                         // coach deliberately goes back
  assert.equal(env.state.trainingWeekStart, '2026-09-07', 'previous week reachable');
  assert.equal(env.state.trainingBlocks['slot_thu-20260910'][0].activity, 'Week-37 Thursday plan',
    'its dated content is exactly as it was — nothing deleted or migrated');
});

// ---- M–N: occurrence-identity regressions ----------------------------------

test('M/N. U18 + Seniors regression — the rollover does not change occurrence identity resolution', () => {
  // trainingContentKey resolves through availToday() at call time; with the
  // planner now viewing the current week the keys are the current week's.
  const KEYFNS = fn('trainingContentKey');
  const body =
    '"use strict";\n' +
    'const state = { schedule: [{ id: "tue" }, { id: "thu" }] };\n' +
    'const _trainingSchedule = { slots: arguments[0] };\n' +
    'function availToday(){ return "2026-09-14"; }\n' +
    html.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0] + '\n' +
    fn('availWeekStart') + '\n' + fn('availAddDays') + '\n' + fn('availSlotDateInWeek') + '\n' +
    KEYFNS + '\nreturn trainingContentKey;';
  const senKey = new Function(body)([{ id: 'slot_thu', day: 'Thu', sessionId: 'thu', active: true }]);
  const u18Key = new Function(body)([{ id: 'slot_msvh0skf_1', day: 'Thu', sessionId: '', active: true }]);
  assert.equal(senKey('thu'), 'slot_thu-20260917', 'Seniors: this week\'s dated Thursday');
  assert.equal(u18Key('thu'), 'slot_msvh0skf_1-20260917', 'U18: weekday-resolved dated Thursday');
});

// ---- History navigation + restoration boundary ------------------------------

test('HISTORY — opening a dated past session follows its week and is treated as explicit navigation', () => {
  const env = makeEnv({ stored: '2026-09-14', today: '2026-09-14' });
  env.open('slot_thu-20260910');                         // last week's Thursday from History
  assert.equal(env.state.trainingWeekStart, '2026-09-07', 'planner follows the session\'s week');
  assert.equal(env.viewed(), '2026-09-07', 'and the very next render does NOT snap it back');
});

test('RESTORATION BOUNDARY — adoptTrainingState clears the navigation stamp', () => {
  const src = fn('adoptTrainingState');
  assert.match(src, /_trainingWeekNavIn = ''/,
    'a group switch is a restoration boundary: the incoming group\'s stale week must roll');
});

test('PIN — the stamp is session-lexical, never persisted', () => {
  assert.ok(!/trainingWeekNavIn/.test(fn('captureTrainingState')), 'not captured per group');
  assert.ok(html.includes("let _trainingWeekNavIn = ''"), 'a lexical let, not state.*');
  assert.ok(!html.includes('state._trainingWeekNavIn') && !html.includes('state.trainingWeekNavIn'),
    'never written into persisted state');
});

test('PIN — navigation writers stamp; the getter never does', () => {
  assert.match(fn('trainingShiftWeek'), /_trainingWeekNavIn = availWeekStart\(availToday\(\)\)/);
  assert.match(fn('trainingGoToThisWeek'), /_trainingWeekNavIn = state\.trainingWeekStart/);
  assert.match(fn('setTrainingSession'), /_trainingWeekNavIn = availWeekStart\(availToday\(\)\)/);
  assert.ok(!fn('trainingViewedWeek').includes('_trainingWeekNavIn ='),
    'trainingViewedWeek only READS the stamp — rendering is never navigation');
});
