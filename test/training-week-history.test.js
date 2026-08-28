/**
 * TRAINING — DATED WEEK MODEL + HONEST HISTORY.
 *
 * The Planner and History used to see only the recurring session DEFINITIONS
 * (tue / thu / game): every week's work landed on the same undated ids,
 * startNewWeek wiped the blocks, and History filtered those same few records —
 * so it showed "Sessions: 0 · No session history yet" for a club that trains
 * every week, and no future week could be planned at all.
 *
 * The repair reuses Availability's week math and dated-event generator
 * VERBATIM: a training occurrence has exactly one identity everywhere —
 * current week → the slot's legacy sessionId (tue / thu), any other week →
 * slot_<id>-<YYYYMMDD>. History reconstructs dated sessions from the DATA
 * that exists; nothing synthetic is ever generated.
 *
 * Every date here is injected. Nothing depends on the machine's clock.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** Slice a function out of the source, preserving an `async` prefix. */
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

const TODAY = '2026-08-14';                 // Friday
const THIS_WEEK = '2026-08-10';             // its Monday
const NEXT_WEEK = '2026-08-17';
const WEEK_AFTER = '2026-08-24';

const SLOTS = [
  { id: 'slot_tue1', day: 'Tue', startTime: '19:00', venue: 'Main pitch', active: true, sessionId: 'tue' },
  { id: 'slot_thu1', day: 'Thu', startTime: '19:30', venue: 'Main pitch', active: true, sessionId: 'thu' },
];

/** Build a live training context around controlled state + injected today. */
function ctx(initial = {}) {
  const state = {
    schedule: [
      { id: 'tue',  type: 'Training', title: 'Training session 1', date: '' },
      { id: 'thu',  type: 'Training', title: 'Training session 2', date: '' },
      { id: 'game', type: 'Match',    title: 'Match',              date: '' },
    ],
    trainingBlocks: {}, trainingAttendance: {}, sessionNotes: {}, players: [],
    ...structuredClone(initial),
  };
  const calls = { saves: 0, renders: 0 };
  return new Function(`
    const state = arguments[0];
    const calls = arguments[1];
    const _trainingSchedule = { slots: ${JSON.stringify(SLOTS)} };
    const _availTodayOverride = '${TODAY}';
    function availToday() { return _availTodayOverride; }
    function saveState() { calls.saves++; }
    function render() { calls.renders++; }
    function notify() {}
    function showToast() {}
    let _tbSeq = 0;
    const requestAnimationFrame = f => f();
    const CSS = { escape: v => String(v) };
    function trainingBlockRowHTML(sid, b) { return '<tr data-block-id="' + b.id + '"></tr>'; }
    function renderTraining() {}
    function tbAutosize() {}
    function syncPublishedSessionEdit() {}
    // addTimeBlock gained two dependencies after this harness was written.
    //
    // 1. trainingPlannedStartTime (7247036f) — a new block on an EMPTY session
    //    opens at the planned group start time instead of a hard-coded 19:45.
    //    Extracted REAL below, with the schedule this suite already declares,
    //    so a dated block gets its slot's true opening time (slot_tue1 -> 19:00).
    // 2. a focus callback that reaches into the DOM to put the coach into the
    //    block they just added. Presentation only; querySelector returns null so
    //    the guarded focus is skipped.
    let _trainingScheduleGroupId = '';
    const document = { querySelector: () => null };
    ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
    ${fn('availWeekStart')}
    ${fn('availAddDays')}
    ${fn('availSlotDateInWeek')}
    ${fn('availTrainingEventId')}
    ${fn('availabilityEventsForWeek')}
    ${fn('availDatedWeekLabel')}
    ${fn('trainingGroupParam')}
    ${fn('trainingPlannedStartTime')}
    ${fn('trainingViewedWeek')}
    ${fn('trainingIsCurrentWeek')}
    ${fn('trainingShiftWeek')}
    ${fn('trainingGoToThisWeek')}
    ${fn('trainingWeekOccurrences')}
    ${fn('trainingDateLabel')}
    ${fn('trainingMonthLabel')}
    ${fn('trainingDateFromSessionId')}
    ${fn('trainingOccurrenceTitle')}
    ${fn('trainingSessionHasData')}
    ${fn('trainingHistorySessions')}
    ${fn('setTrainingSession')}
    ${fn('addTimeBlock')}
    ${fn('updateTimeBlock')}
    ${fn('removeTimeBlock')}
    function activeRosterPlayers(players) { return (players || []).filter(p => (p.lifecycleStatus || 'active') !== 'archived'); }
    ${fn('trainingAttendanceForSession')}
    return { state, calls, availWeekStart, availabilityEventsForWeek,
             trainingViewedWeek, trainingIsCurrentWeek, trainingShiftWeek, trainingGoToThisWeek,
             trainingWeekOccurrences, trainingDateLabel, trainingMonthLabel,
             trainingDateFromSessionId, trainingOccurrenceTitle, trainingSessionHasData,
             trainingHistorySessions, setTrainingSession, addTimeBlock, updateTimeBlock,
             trainingAttendanceForSession };
  `)(state, calls);
}

// ── FUTURE — dated occurrences from the real recurring slots ──────────────
test('next week generates Tuesday and Thursday dated occurrences', () => {
  const c = ctx();
  const events = c.trainingWeekOccurrences(NEXT_WEEK);
  assert.deepEqual(events.map(e => e.id), ['slot_tue1-20260818', 'slot_thu1-20260820'],
    'the fixture-availability identities, verbatim');
  assert.deepEqual(events.map(e => e.date), ['2026-08-18', '2026-08-20']);
});

test('the current week keeps the legacy ids — existing answers keep working', () => {
  const c = ctx();
  assert.deepEqual(c.trainingWeekOccurrences(THIS_WEEK).map(e => e.id), ['tue', 'thu']);
});

test('week navigation changes the dated ids — 18 Aug is not 25 Aug', () => {
  const c = ctx();
  const w1 = c.trainingWeekOccurrences(NEXT_WEEK).map(e => e.id);
  const w2 = c.trainingWeekOccurrences(WEEK_AFTER).map(e => e.id);
  assert.deepEqual(w2, ['slot_tue1-20260825', 'slot_thu1-20260827']);
  assert.equal(new Set([...w1, ...w2]).size, 4, 'no id shared between weeks');
});

test('planner occurrences ARE the availability events — one event, one identity', () => {
  const c = ctx();
  const availIds = c.availabilityEventsForWeek(NEXT_WEEK, {
    fixtures: [{ id: 'fx_aug22', opposition: 'Mons', date: '2026-08-22', status: 'scheduled' }],
    slots: SLOTS, currentWeekStart: THIS_WEEK,
  }).filter(e => e.type === 'training').map(e => e.id);
  assert.deepEqual(c.trainingWeekOccurrences(NEXT_WEEK).map(e => e.id), availIds,
    'training planner and availability agree because they share the generator');
});

test('training occurrences never include fixtures', () => {
  const c = ctx();
  assert.equal(c.trainingWeekOccurrences(NEXT_WEEK).some(e => e.type !== 'training'), false);
});

// ── WEEK STATE — navigation, defaults, resilience ─────────────────────────
test('the viewed week defaults to the current week and navigates chronologically', () => {
  const c = ctx();
  assert.equal(c.trainingViewedWeek(), THIS_WEEK);
  assert.equal(c.trainingIsCurrentWeek(), true);
  c.trainingShiftWeek(1);
  assert.equal(c.trainingViewedWeek(), NEXT_WEEK);
  assert.equal(c.trainingIsCurrentWeek(), false);
  c.trainingShiftWeek(1);
  assert.equal(c.trainingViewedWeek(), WEEK_AFTER);
  c.trainingShiftWeek(-1); c.trainingShiftWeek(-1);
  assert.equal(c.trainingViewedWeek(), THIS_WEEK, 'no date drift after a round trip');
  c.trainingShiftWeek(-1);
  assert.equal(c.trainingViewedWeek(), '2026-08-03', 'past weeks reachable too');
  c.trainingGoToThisWeek();
  assert.equal(c.trainingViewedWeek(), THIS_WEEK);
});

test('a corrupt stored week resets to the current week instead of breaking', () => {
  for (const bad of ['Invalid Date', 'Tuesday', '2026-8-1', '', null, 42]) {
    const c = ctx({ trainingWeekStart: bad });
    assert.equal(c.trainingViewedWeek(), THIS_WEEK, `recovers from ${JSON.stringify(bad)}`);
  }
});

test('the viewed week lives in persisted state, so it survives rerender', () => {
  const c = ctx();
  c.trainingShiftWeek(1);
  assert.equal(c.state.trainingWeekStart, NEXT_WEEK, 'stored in state');
  assert.ok(c.calls.saves > 0, 'and saved');
});

// ── FUTURE PLAN SAVE/LOAD — weeks are isolated ────────────────────────────
test('18 Aug and 25 Aug hold independent plans — no cross-week contamination', () => {
  const c = ctx();
  const tue18 = 'slot_tue1-20260818', tue25 = 'slot_tue1-20260825';

  c.addTimeBlock(tue18);
  c.updateTimeBlock(tue18, c.state.trainingBlocks[tue18][0].id, 'activity', 'Ruck drill week 1');
  assert.equal(c.state.trainingBlocks[tue18][0].activity, 'Ruck drill week 1', 'saved on 18 Aug');
  assert.equal((c.state.trainingBlocks[tue25] || []).length, 0, '25 Aug still empty');

  c.addTimeBlock(tue25);
  c.updateTimeBlock(tue25, c.state.trainingBlocks[tue25][0].id, 'activity', 'Lineout week 2');
  assert.equal(c.state.trainingBlocks[tue18][0].activity, 'Ruck drill week 1', '18 Aug unchanged');
  assert.equal(c.state.trainingBlocks[tue25][0].activity, 'Lineout week 2');
});

test('opening a dated session follows it to its own week', () => {
  const c = ctx();
  c.setTrainingSession('slot_tue1-20260825');
  assert.equal(c.state.trainingWeekStart, WEEK_AFTER, 'the planner jumps to that week');
  c.setTrainingSession('tue');
  assert.equal(c.state.trainingWeekStart, WEEK_AFTER, 'a legacy id changes no week');
});

// ── HISTORY — reconstructed from real data, never synthesized ─────────────
test('a dated session with attendance appears in History with its real date', () => {
  const c = ctx({ trainingAttendance: { 'slot_tue1-20260804': { p1: 'present', p2: 'absent' } } });
  const hist = c.trainingHistorySessions();
  assert.equal(hist.length, 1);
  assert.equal(hist[0].id, 'slot_tue1-20260804');
  assert.equal(hist[0].date, '2026-08-04');
  assert.equal(hist[0].title, 'Tuesday Training');
  assert.equal(hist[0].startTime, '19:00', 'time and venue come from the slot');
});

test('a dated session with only a plan appears too — as does notes-only', () => {
  const c = ctx({
    trainingBlocks: { 'slot_thu1-20260806': [{ id: 'b1', time: '19:30', activity: 'Scrums' }] },
    sessionNotes:   { 'slot_tue1-20260728': { summary: 'Wet pitch, good intensity' } },
  });
  assert.deepEqual(c.trainingHistorySessions().map(s => s.id),
    ['slot_thu1-20260806', 'slot_tue1-20260728'], 'newest first');
});

test('a FUTURE week\'s saved plan is planning, not history', () => {
  const c = ctx({
    trainingBlocks: {
      'slot_tue1-20260825': [{ id: 'b1', time: '19:00', activity: 'Next week plan' }],  // after TODAY
      'slot_tue1-20260804': [{ id: 'b2', time: '19:00', activity: 'Past session' }],
    },
  });
  assert.deepEqual(c.trainingHistorySessions().map(s => s.id), ['slot_tue1-20260804'],
    'only the passed date appears — the future plan stays in the planner');
});

test('empty structures do not create history — the rule is REAL activity', () => {
  const c = ctx({
    trainingBlocks: { 'slot_tue1-20260804': [] },          // emptied plan
    trainingAttendance: { 'slot_thu1-20260806': {} },      // never actually marked
    sessionNotes: { 'slot_tue1-20260811': { summary: '' } },
  });
  assert.deepEqual(c.trainingHistorySessions(), [], 'no synthetic sessions');
});

test('the same slot on different dates is different history sessions', () => {
  const c = ctx({ trainingAttendance: {
    'slot_tue1-20260804': { p1: 'present' },
    'slot_tue1-20260811': { p1: 'absent' },
  } });
  const hist = c.trainingHistorySessions();
  assert.equal(hist.length, 2, 'one per date — never merged');
  assert.deepEqual(hist.map(s => s.date), ['2026-08-11', '2026-08-04']);
});

test('one session with blocks AND attendance AND notes appears exactly once', () => {
  const id = 'slot_tue1-20260804';
  const c = ctx({
    trainingBlocks: { [id]: [{ id: 'b1', time: '19:00', activity: 'Drill' }] },
    trainingAttendance: { [id]: { p1: 'present' } },
    sessionNotes: { [id]: { summary: 'Solid' } },
  });
  assert.equal(c.trainingHistorySessions().length, 1, 'no duplicates across data sources');
});

test('legacy recurring sessions with data still appear — honestly undated', () => {
  const c = ctx({ trainingAttendance: { tue: { p1: 'present' } } });
  const hist = c.trainingHistorySessions();
  assert.equal(hist.length, 1);
  assert.equal(hist[0].id, 'tue');
  assert.equal(hist[0].dated, false, 'the legacy aggregate is not given an invented date');
});

test('dated and legacy sessions coexist, dated (newer) first', () => {
  const c = ctx({
    trainingAttendance: { tue: { p1: 'present' }, 'slot_tue1-20260804': { p1: 'present' } },
  });
  assert.deepEqual(c.trainingHistorySessions().map(s => s.id), ['slot_tue1-20260804', 'tue'],
    'undated legacy entries sort last');
});

// ── ATTENDANCE — per-session isolation, History can reconstruct ───────────
test('attendance loads for the right dated session and never leaks', () => {
  const c = ctx({
    players: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }],
    trainingAttendance: {
      'slot_tue1-20260804': { p1: 'present', p2: 'absent' },
      'slot_tue1-20260811': { p1: 'absent' },
    },
  });
  const a = c.trainingAttendanceForSession('slot_tue1-20260804', c.state.players);
  assert.equal(a.present, 1); assert.equal(a.absent, 1); assert.equal(a.pct, 50);
  const b = c.trainingAttendanceForSession('slot_tue1-20260811', c.state.players);
  assert.equal(b.present, 0); assert.equal(b.absent, 1, 'session B has its own numbers');
});

// ── DATES — nothing can render "Invalid Date" ─────────────────────────────
test('valid dates label correctly, with and without year', () => {
  const c = ctx();
  assert.equal(c.trainingDateLabel('2026-08-18'), '18 Aug');
  assert.equal(c.trainingDateLabel('2026-08-18', true), '18 Aug 2026');
  assert.equal(c.trainingMonthLabel('2026-08'), 'Aug 2026');
  assert.equal(c.trainingOccurrenceTitle('2026-08-18'), 'Tuesday Training');
});

test('legacy / malformed dates degrade to empty, never to Invalid Date', () => {
  const c = ctx();
  for (const bad of ['Tuesday', 'Invalid Date', '2026-13-40', '2026-8-5', '', null, undefined, 'game']) {
    assert.equal(c.trainingDateLabel(bad), '', `date ${JSON.stringify(bad)}`);
  }
  for (const bad of ['Tuesday', '2026-13', 'Invalid', '']) {
    assert.equal(c.trainingMonthLabel(bad), '', `month ${JSON.stringify(bad)}`);
  }
  assert.equal(c.trainingOccurrenceTitle('nonsense'), 'Training');
});

test('session-id dates parse strictly', () => {
  const c = ctx();
  assert.equal(c.trainingDateFromSessionId('slot_tue1-20260818'), '2026-08-18');
  assert.equal(c.trainingDateFromSessionId('slot_thu1-20261231'), '2026-12-31');
  for (const bad of ['tue', 'game', 'slot_tue1', 'slot_tue1-2026', 'slot_tue1-20261340', '', null]) {
    assert.equal(c.trainingDateFromSessionId(bad), '', `id ${JSON.stringify(bad)}`);
  }
});

test('the History renderer no longer feeds freetext into new Date()', () => {
  const body = fn('_renderTrainingHistory');
  assert.doesNotMatch(body, /new Date\(m\+/, 'the Invalid-Date month pill is gone');
  assert.match(body, /trainingMonthLabel/, 'months go through the strict labeller');
  assert.match(body, /trainingHistorySessions\(\)/, 'and sessions come from the dated model');
});

test('week boundaries: Monday anchoring is exact at the Sunday edge', () => {
  const c = ctx();
  assert.equal(c.availWeekStart('2026-08-16'), '2026-08-10', 'Sunday belongs to its Monday week');
  assert.equal(c.availWeekStart('2026-08-17'), '2026-08-17', 'Monday starts its own week');
});

// ── PLANNER WIRING — source pins the browser run relies on ────────────────
test('the planner renders the viewed week and gates publishing to the current week', () => {
  const body = fn('renderTraining');
  assert.match(body, /trainingViewedWeek\(\)/);
  assert.match(body, /trainingWeekOccurrences\(twWeek\)/, 'other weeks use the dated occurrences');
  assert.match(body, /twCurrent && canI\('publish_training'\)/, 'publish stays a current-week action');
  assert.match(body, /trainingShiftWeek\(-1\)/); assert.match(body, /trainingShiftWeek\(1\)/);
  assert.match(body, /ensureTrainingSchedule\(\)/, 'slots load on entry, not only from Settings');
});

test('History counters: Sessions = matching filter; Players = active roster', () => {
  const body = fn('_renderTrainingHistory');
  assert.match(body, /shown\.length\+'<\/strong>/, 'Sessions counts the filtered list');
  assert.match(body, /activePlayers\.length\+'<\/strong>/, 'Players counts the active roster');
});
