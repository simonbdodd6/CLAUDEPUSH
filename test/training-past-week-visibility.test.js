/**
 * TRAINING — a past week shows the sessions it actually held.
 *
 * The planner regenerates any week but the current one from the CURRENT
 * recurring slots (trainingWeekOccurrences). So a week was only ever as
 * visible as today's schedule said it should have been: move Tuesday to
 * Wednesday, deactivate or delete the Tuesday slot, or give it an
 * effectiveFrom, and LAST week's Tuesday session stopped being generated —
 * while this week, which today's slots do describe, looked perfectly normal.
 * The session's plan, notes and attendance were all still stored under
 * slot_<id>-<YYYYMMDD>; there was simply no row to reach them from.
 *
 * A session that left evidence happened, whatever the schedule says now.
 * trainingWeekEvidenceOccurrences() re-admits exactly those occurrences, from
 * the sources the History tab already trusts: the server attendance register,
 * a saved plan, or session notes.
 *
 * Nothing here is date-specific: the fixtures below use the reported week
 * (Tue 15 Sep 2026, viewed on Mon 21 Sep 2026) as ONE case among several.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const s = html.indexOf(`function ${name}(`);
  assert.ok(s > 0, `${name} exists`);
  let i = html.indexOf('(', s), p = 0;
  for (; i < html.length; i++) { if (html[i] === '(') p++; else if (html[i] === ')') { p--; if (!p) { i++; break; } } }
  let b = html.indexOf('{', i), d = 0, e = b;
  for (let k = b; k < html.length; k++) { if (html[k] === '{') d++; else if (html[k] === '}') { d--; if (!d) { e = k; break; } } }
  return html.slice(s, e + 1);
}

const TODAY = '2026-09-21';          // Monday
const LAST_WEEK = '2026-09-14';      // contains Tuesday 15 September 2026
const THIS_WEEK = '2026-09-21';
const TUE_OCC = 'slot_tue-20260915';

const SLOTS = {
  unchanged:   [{ id: 'slot_tue', day: 'Tue', startTime: '19:00', venue: 'Main pitch', active: true },
                { id: 'slot_thu', day: 'Thu', startTime: '19:00', active: true }],
  deactivated: [{ id: 'slot_tue', day: 'Tue', startTime: '19:00', active: false },
                { id: 'slot_thu', day: 'Thu', startTime: '19:00', active: true }],
  movedToWed:  [{ id: 'slot_tue', day: 'Wed', startTime: '19:00', active: true },
                { id: 'slot_thu', day: 'Thu', startTime: '19:00', active: true }],
  deleted:     [{ id: 'slot_thu', day: 'Thu', startTime: '19:00', active: true }],
  fromLater:   [{ id: 'slot_tue', day: 'Tue', startTime: '19:00', active: true, effectiveFrom: '2026-09-16' },
                { id: 'slot_thu', day: 'Thu', startTime: '19:00', active: true }],
};
/** A register for the Tuesday that happened — the server's own record. */
const REGISTER = { sessions: { [TUE_OCC]: { date: '2026-09-15', title: 'Tuesday Training', marks: { p1: 'present' } } } };

/**
 * The planner's OWN selection, read out of renderTraining — not a copy. A
 * change to how the week's rows are chosen is felt here.
 */
const PLANNER_SELECTION = (() => {
  const from = html.indexOf('      const schedSessions = twCurrent ? (state.schedule || []) : trainingWeekPlannerSessions(twWeek)');
  assert.ok(from > 0, 'the planner week selection is where this test expects it');
  const to = html.indexOf('      const rawId  =', from);
  assert.ok(to > from);
  return html.slice(from, to);
})();

/** The planner's week list, built by the REAL selection code. */
function plannerWeek({ slots, week, attendance = REGISTER, blocks = {}, notes = {}, schedule = null, denied = false }) {
  const run = new Function('slots', 'week', 'attendance', 'blocks', 'notes', 'schedule', 'TODAY', 'denied', `
    const AVAIL_DAY_INDEX = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 };
    let _availTodayOverride = TODAY;
    let _trainingSchedule = { slots };
    const state = { trainingBlocks: blocks, sessionNotes: notes,
                    schedule: schedule || [{ id: 'tue', type: 'Training', title: 'Tuesday', date: 'Tue 19:00' }] };
    function currentAttendance() { return denied ? { denied: true, sessions: {} } : { denied: false, sessions: attendance.sessions }; }
    function attendanceOccurrenceId(id) { return String(id); }
    ${fn('availWeekStart')} ${fn('availAddDays')} ${fn('availToday')} ${fn('availSlotDateInWeek')}
    ${fn('availTrainingEventId')} ${fn('availabilityEventsForWeek')}
    ${fn('trainingDateLabel')} ${fn('trainingDateFromSessionId')} ${fn('trainingOccurrenceTitle')}
    ${fn('trainingSessionHasData')}
    ${fn('trainingWeekEvidenceOccurrences')} ${fn('trainingWeekOccurrences')} ${fn('trainingWeekPlannerSessions')}
    const twWeek = week, twCurrent = week === availWeekStart(availToday());
    ${PLANNER_SELECTION}
    return schedSessions;`);
  return run(slots, week, attendance, blocks, notes, schedule, TODAY, denied);
}
const ids   = rows => rows.map(r => String(r.id));
const dates = rows => rows.map(r => String(r.date));

// ── 1. the reported case, and every schedule change that causes it ──────────

test('1. Tuesday 15 September 2026 is visible after ANY schedule change', () => {
  for (const [label, slots] of Object.entries(SLOTS)) {
    const rows = plannerWeek({ slots, week: LAST_WEEK });
    assert.ok(ids(rows).includes(TUE_OCC), `${label}: the Tuesday that happened is listed`);
    const tue = rows.find(r => String(r.id) === TUE_OCC);
    assert.equal(tue.date, '2026-09-15');
    assert.equal(tue.title, 'Tuesday Training', 'named from its own date');
  }
});

test('the same session was MISSING before the fix, for every one of those changes', () => {
  // The old list was the slot-derived one alone.
  const slotOnly = slots => plannerWeek({ slots, week: LAST_WEEK, attendance: { sessions: {} } });
  assert.ok(ids(slotOnly(SLOTS.unchanged)).includes(TUE_OCC), 'an unchanged schedule never had the defect');
  for (const key of ['deactivated', 'movedToWed', 'deleted', 'fromLater']) {
    assert.ok(!ids(slotOnly(SLOTS[key])).includes(TUE_OCC), `${key}: reproduces the report`);
  }
});

test('2+3. this week and the rest of the past week are unaffected', () => {
  const now = plannerWeek({ slots: SLOTS.deactivated, week: THIS_WEEK });
  assert.deepEqual(ids(now), ['tue'], 'the current week still comes from the live schedule');
  const past = plannerWeek({ slots: SLOTS.deactivated, week: LAST_WEEK });
  assert.deepEqual(dates(past), ['2026-09-15', '2026-09-17'], 'Tuesday restored, Thursday untouched, in date order');
});

test('a session is admitted on a PLAN or NOTES alone, not only a register', () => {
  const noRegister = { sessions: {} };
  const byPlan  = plannerWeek({ slots: SLOTS.deleted, week: LAST_WEEK, attendance: noRegister,
                                blocks: { [TUE_OCC]: [{ id: 'b1', title: 'Scrum' }] } });
  assert.ok(ids(byPlan).includes(TUE_OCC), 'a saved plan proves the session');
  const byNotes = plannerWeek({ slots: SLOTS.deleted, week: LAST_WEEK, attendance: noRegister,
                               notes: { [TUE_OCC]: { objectives: 'Lineout' } } });
  assert.ok(ids(byNotes).includes(TUE_OCC), 'notes prove it too');
  // …and a week with no evidence and no slot stays empty rather than inventing one.
  const nothing = plannerWeek({ slots: SLOTS.deleted, week: LAST_WEEK, attendance: noRegister });
  assert.deepEqual(ids(nothing), ['slot_thu-20260917'], 'nothing is invented');
});

test('4+5. future weeks keep planned-ahead work; history rules are unchanged', () => {
  const NEXT = '2026-09-28';
  const planned = 'slot_tue-20260929';
  const rows = plannerWeek({ slots: SLOTS.deleted, week: NEXT, attendance: { sessions: {} },
                            blocks: { [planned]: [{ id: 'b1' }] } });
  assert.ok(ids(rows).includes(planned), 'a plan written ahead survives a later schedule change');
});

test('an EMPTY plan or note is not evidence that a session happened', () => {
  const rows = plannerWeek({ slots: SLOTS.deleted, week: LAST_WEEK, attendance: { sessions: {} },
                             blocks: { [TUE_OCC]: [] }, notes: { 'slot_x-20260916': { objectives: '' } } });
  assert.deepEqual(ids(rows), ['slot_thu-20260917'], 'empty content proves nothing');
});

test('a restored session is listed ONCE, never beside its slot-generated twin', () => {
  // The Tuesday slot still exists AND the week left a register for it.
  const rows = plannerWeek({ slots: SLOTS.unchanged, week: LAST_WEEK,
                             blocks: { [TUE_OCC]: [{ id: 'b1' }] } });
  assert.equal(ids(rows).filter(id => id === TUE_OCC).length, 1, 'no duplicate row');
  assert.equal(new Set(ids(rows)).size, ids(rows).length, 'every row is unique');
});

test('9. only occurrences INSIDE the viewed week are admitted (boundaries)', () => {
  const att = { sessions: {
    'slot_x-20260913': { date: '2026-09-13' },   // Sunday BEFORE the week
    'slot_x-20260914': { date: '2026-09-14' },   // Monday, first day
    'slot_x-20260920': { date: '2026-09-20' },   // Sunday, last day
    'slot_x-20260921': { date: '2026-09-21' },   // the following Monday
  } };
  const rows = plannerWeek({ slots: SLOTS.deleted, week: LAST_WEEK, attendance: att });
  const admitted = ids(rows).filter(id => id.startsWith('slot_x-'));
  assert.deepEqual(admitted, ['slot_x-20260914', 'slot_x-20260920'], 'Monday–Sunday inclusive, nothing either side');
});

// ── 2. isolation and permissions are untouched ──────────────────────────────

test('6+7. another group’s or club’s sessions are never admitted', () => {
  // currentAttendance() is the group-scoped read and FAILS CLOSED for another
  // group; a denied read contributes nothing, so no foreign session appears.
  const rows = plannerWeek({ slots: SLOTS.deleted, week: LAST_WEEK, denied: true });
  assert.deepEqual(ids(rows), ['slot_thu-20260917'], 'a denied register admits nothing');
  const src = fn('trainingWeekEvidenceOccurrences');
  assert.match(src, /currentAttendance\(\)/, 'reads the group-scoped register');
  assert.match(src, /att\.denied/, 'and honours its denial');
  assert.doesNotMatch(src, /fetch\(|teamId|clubId/, 'it asks for nothing new and names no club');
});

test('8. it is a read: no permission check, no state written, no request', () => {
  const src = fn('trainingWeekEvidenceOccurrences');
  assert.doesNotMatch(src, /saveState|state\.\w+\s*=|canI\(/, 'pure read');
  // The week model itself is unchanged.
  assert.match(fn('trainingWeekOccurrences'), /availabilityEventsForWeek\(weekStartIso/);
});

test('10. the restored row carries the identity the rest of the app uses', () => {
  const rows = plannerWeek({ slots: SLOTS.deleted, week: LAST_WEEK });
  const tue = rows.find(r => String(r.id) === TUE_OCC);
  // slot_<id>-<YYYYMMDD>: the same key the plan, the notes and the attendance
  // register use, so opening the row reaches the real session.
  assert.match(tue.id, /^slot_[a-z0-9_]+-\d{8}$/);
  assert.equal(tue.type, 'Training');
  assert.equal(tue.occurrence, true);
  assert.equal(tue.published, false);
});

test('no date is hard-coded in the fix', () => {
  for (const name of ['trainingWeekEvidenceOccurrences', 'trainingWeekOccurrences']) {
    assert.doesNotMatch(fn(name), /2026|09-15|20260915/, `${name} names no specific date`);
  }
});
