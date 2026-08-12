/**
 * D1b Pass 3a — DATED availability events.
 *
 * Availability was three recurring slots (tue / thu / game), so the real
 * fixture on 22 August 2026 had nowhere to attach a response and could never be
 * answered in advance. Events are now derived from the actual sources with
 * stable ids, while the three legacy answers stay exactly where they are.
 *
 * Every date here is injected. Nothing depends on the machine's clock.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** Slice a function out of the source. Skips past the parameter list first,
 *  so a default like `sources = {}` is not mistaken for the body. */
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
  return src.slice(start, end + 1);
}

const api = new Function(`
  ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
  ${fn('availWeekStart')}
  ${fn('availAddDays')}
  ${fn('availSlotDateInWeek')}
  ${fn('availTrainingEventId')}
  ${fn('availabilityEventsForWeek')}
  return { availWeekStart, availAddDays, availSlotDateInWeek,
           availTrainingEventId, availabilityEventsForWeek };
`)();
const { availWeekStart, availAddDays, availSlotDateInWeek,
        availTrainingEventId, availabilityEventsForWeek } = api;

// ── THE REAL SCENARIO ──────────────────────────────────────────────────────
const TODAY = '2026-08-12';                       // Wednesday
const THIS_WEEK = availWeekStart(TODAY);          // Mon 2026-08-10
const FIXTURE_WEEK = availWeekStart('2026-08-22');// Mon 2026-08-17

/** The club's real recurring training, and the real 22 August fixture. */
const SLOTS = [
  { id: 'slot_tue1', day: 'Tue', startTime: '19:00', venue: 'Main pitch', active: true, sessionId: 'tue' },
  { id: 'slot_thu1', day: 'Thu', startTime: '19:30', venue: 'Main pitch', active: true, sessionId: 'thu' },
];
const FIXTURES = [
  { id: 'fx_aug22', date: '2026-08-22', time: '15:00', opposition: 'Kituro', venue: 'Home', status: 'scheduled' },
  { id: 'fx_sep05', date: '2026-09-05', time: '14:30', opposition: 'Boitsfort B', venue: 'Away', status: 'scheduled' },
];
const week = (start, extra = {}) =>
  availabilityEventsForWeek(start, { fixtures: FIXTURES, slots: SLOTS, currentWeekStart: THIS_WEEK, ...extra });

// ── WEEK ARITHMETIC ────────────────────────────────────────────────────────
test('weeks are Monday-start and date-only, with no timezone drift', () => {
  assert.equal(availWeekStart('2026-08-12'), '2026-08-10', 'Wednesday → that Monday');
  assert.equal(availWeekStart('2026-08-10'), '2026-08-10', 'Monday → itself');
  assert.equal(availWeekStart('2026-08-16'), '2026-08-10', 'Sunday belongs to the week that began Monday');
  assert.equal(availWeekStart('2026-08-17'), '2026-08-17');
  assert.equal(availAddDays('2026-08-31', 1), '2026-09-01', 'crosses a month');
  assert.equal(availAddDays('2026-12-31', 1), '2027-01-01', 'crosses a year');
});

// ── STABLE EVENT IDENTITY ──────────────────────────────────────────────────
test('a match event is identified by the fixture\'s own id', () => {
  const [match] = week(FIXTURE_WEEK).filter(e => e.type === 'match');
  assert.equal(match.id, 'fx_aug22');
  assert.equal(match.sourceId, 'fx_aug22');
});

test('renaming a fixture does not move the response', () => {
  const renamed = FIXTURES.map(f => f.id === 'fx_aug22'
    ? { ...f, opposition: 'Completely Different Club', venue: 'Elsewhere' } : f);
  const [match] = availabilityEventsForWeek(FIXTURE_WEEK,
    { fixtures: renamed, slots: SLOTS, currentWeekStart: THIS_WEEK }).filter(e => e.type === 'match');
  assert.equal(match.id, 'fx_aug22', 'identity comes from the source id, never display copy');
  assert.equal(match.opponent, 'Completely Different Club', 'but the display does update');
});

test('two fixtures never collide, in the same week or across weeks', () => {
  const ids = [...week(FIXTURE_WEEK), ...week(availWeekStart('2026-09-05'))]
    .filter(e => e.type === 'match').map(e => e.id);
  assert.deepEqual(ids, ['fx_aug22', 'fx_sep05']);
  assert.equal(new Set(ids).size, ids.length);
});

test('a training occurrence is identified by slot + date', () => {
  const t = week(FIXTURE_WEEK).find(e => e.type === 'training');
  assert.equal(t.id, availTrainingEventId(SLOTS[0], '2026-08-18'));
  assert.equal(t.id, 'slot_tue1-20260818');
  // The SAME slot in a different week is a different session, so a different id.
  const later = week(availWeekStart('2026-09-05')).find(e => e.type === 'training');
  assert.notEqual(later.id, t.id);
  assert.equal(later.id, 'slot_tue1-20260901');
});

test('every generated id is a valid server sessionId and never a legacy word', () => {
  const valid = /^[a-z0-9_-]{1,80}$/i;
  const ids = [...week(THIS_WEEK), ...week(FIXTURE_WEEK), ...week(availWeekStart('2026-09-05'))]
    .map(e => e.id);
  for (const id of ids) assert.match(id, valid, `${id} must satisfy validSessionId`);
  const dated = [...week(FIXTURE_WEEK)].map(e => e.id);
  for (const legacy of ['tue', 'thu', 'game']) {
    assert.equal(dated.includes(legacy), false, `a future week must not reuse "${legacy}"`);
  }
});

// ── THE 22 AUGUST ACCEPTANCE CASE ──────────────────────────────────────────
test('ACCEPTANCE — on 12 August the fixture is NOT in this week', () => {
  const now = week(THIS_WEEK);
  assert.equal(now.some(e => e.id === 'fx_aug22'), false, 'not wrongly pulled forward');
  assert.deepEqual(now.filter(e => e.type === 'training').map(e => e.id), ['tue', 'thu'],
    'this week still answers under the legacy ids, so existing answers keep working');
  assert.equal(now.some(e => e.id === 'game'), true, 'and the generic match slot still shows');
});

test('ACCEPTANCE — navigating one week forward reveals the real 22 August fixture', () => {
  const next = week(FIXTURE_WEEK);
  const match = next.find(e => e.type === 'match');
  assert.ok(match, 'the fixture is answerable before match week');
  assert.equal(match.id, 'fx_aug22');
  assert.equal(match.date, '2026-08-22');
  assert.equal(match.opponent, 'Kituro');
  assert.equal(match.time, '15:00');
  assert.equal(match.legacy, false);
});

test('ACCEPTANCE — the legacy game answer never masquerades as the fixture', () => {
  const next = week(FIXTURE_WEEK);
  assert.equal(next.some(e => e.id === 'game'), false,
    'the generic slot is not offered in a week that has a real fixture');
  const match = next.find(e => e.type === 'match');
  assert.notEqual(match.id, 'game', 'and the fixture keeps its own identity');
});

test('the generic match slot yields to a real fixture in the CURRENT week too', () => {
  const thisWeekFixture = [{ id: 'fx_now', date: availAddDays(THIS_WEEK, 5), opposition: 'Local', status: 'scheduled' }];
  const events = availabilityEventsForWeek(THIS_WEEK,
    { fixtures: thisWeekFixture, slots: SLOTS, currentWeekStart: THIS_WEEK });
  assert.equal(events.some(e => e.id === 'game'), false, 'no duplicate match card');
  assert.equal(events.some(e => e.id === 'fx_now'), true, 'the dated fixture is authoritative');
});

// ── LEGACY COMPATIBILITY ───────────────────────────────────────────────────
test('LEGACY — this week keeps tue/thu/game so stored answers still render', () => {
  const now = week(THIS_WEEK).filter(e => e.legacy).map(e => e.id).sort();
  assert.deepEqual(now, ['game', 'thu', 'tue']);
});

test('LEGACY — future weeks never reuse the legacy ids', () => {
  for (const start of [FIXTURE_WEEK, availWeekStart('2026-09-05'), availAddDays(THIS_WEEK, 70)]) {
    const ids = week(start).map(e => e.id);
    assert.equal(ids.some(id => ['tue', 'thu', 'game'].includes(id)), false,
      `week ${start} must not answer under a legacy id`);
  }
});

test('LEGACY — a slot with no legacy sessionId is always dated, even this week', () => {
  const newSlot = [{ id: 'slot_sat', day: 'Sat', startTime: '10:00', active: true }];
  const events = availabilityEventsForWeek(THIS_WEEK,
    { fixtures: [], slots: newSlot, currentWeekStart: THIS_WEEK });
  const t = events.find(e => e.type === 'training');
  assert.equal(t.id, 'slot_sat-20260815', 'nothing to inherit, so it gets a dated id');
  assert.equal(t.legacy, false);
});

// ── SLOT LIFECYCLE ─────────────────────────────────────────────────────────
test('inactive slots and effective ranges are respected', () => {
  const s = { id: 'slot_x', day: 'Tue', startTime: '19:00' };
  assert.equal(availSlotDateInWeek({ ...s, active: false }, FIXTURE_WEEK), '', 'inactive');
  assert.equal(availSlotDateInWeek({ ...s, effectiveFrom: '2026-09-01' }, FIXTURE_WEEK), '',
    'not yet in effect');
  assert.equal(availSlotDateInWeek({ ...s, effectiveTo: '2026-08-01' }, FIXTURE_WEEK), '',
    'already ended');
  assert.equal(availSlotDateInWeek(s, FIXTURE_WEEK), '2026-08-18', 'in effect');
});

test('a cancelled fixture is not offered for availability', () => {
  const cancelled = [{ id: 'fx_off', date: '2026-08-22', opposition: 'X', status: 'cancelled' }];
  const events = availabilityEventsForWeek(FIXTURE_WEEK,
    { fixtures: cancelled, slots: [], currentWeekStart: THIS_WEEK });
  assert.deepEqual(events, []);
});

// ── ORDERING AND MULTI-WEEK NAVIGATION ─────────────────────────────────────
test('events are ordered by date, and several weeks forward all resolve', () => {
  const next = week(FIXTURE_WEEK).map(e => e.date);
  assert.deepEqual(next, [...next].sort(), 'chronological');

  // Four weeks forward from today, each independently derived.
  const weeks = [0, 1, 2, 3].map(i => availAddDays(THIS_WEEK, i * 7));
  assert.deepEqual(weeks, ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']);
  assert.equal(week(weeks[1]).some(e => e.id === 'fx_aug22'), true, 'week 2 holds the fixture');
  assert.equal(week(weeks[2]).some(e => e.id === 'fx_aug22'), false, 'week 3 does not');
  // Navigating back returns the identical id, so a saved answer still matches.
  assert.equal(week(weeks[1]).find(e => e.type === 'match').id, 'fx_aug22');
});

test('a past week still resolves, so players can look back', () => {
  const lastWeek = availAddDays(THIS_WEEK, -7);
  const events = week(lastWeek);
  assert.equal(events.every(e => !e.legacy), true, 'past weeks are dated, not legacy');
  assert.deepEqual(events.map(e => e.id), ['slot_tue1-20260804', 'slot_thu1-20260806']);
});

// ── FUTURE TRAINING: the source must actually be loaded ───────────────────
// The dated model was always correct; the training SOURCE was never fetched
// for a player, so future weeks showed fixtures and no training at all.
test('both availability screens ensure the training schedule is loaded', () => {
  const ensure = fn('ensureTrainingSchedule');
  assert.match(ensure, /if \(_trainingSchedule \|\| _trainingScheduleAttempted\) return;/,
    'idempotent, and a failed fetch cannot retry on every render');
  assert.match(ensure, /loadTrainingSchedule\(\)/);

  assert.match(fn('renderPlayerAvailabilityV2'), /ensureTrainingSchedule\(\);/,
    'the player screen loads its own source');
  assert.match(fn('coachAvailEvents'), /ensureTrainingSchedule\(\);/,
    'and so does the coach board');
  // A club switch clears the schedule, so the attempt flag must clear too.
  assert.match(src, /_trainingSchedule = null;[^\n]*\n\s*_trainingScheduleAttempted = false;/,
    'switching club refetches rather than staying empty');
});

test('FUTURE TRAINING — both weeks carry Tuesday, Thursday and their fixture', () => {
  const w1 = week(FIXTURE_WEEK);                       // 17–23 Aug
  const w2 = week(availWeekStart('2026-08-29'));       // 24–30 Aug
  const AMSTEL = { id: 'fx_aug29', date: '2026-08-29', time: '15:00', opposition: 'Amstelveense', status: 'scheduled' };
  const w2b = availabilityEventsForWeek(availWeekStart('2026-08-29'),
    { fixtures: [...FIXTURES, AMSTEL], slots: SLOTS, currentWeekStart: THIS_WEEK });

  assert.deepEqual(w1.map(e => e.id),
    ['slot_tue1-20260818', 'slot_thu1-20260820', 'fx_aug22'],
    '17–23 Aug: Tuesday, Thursday, Mons');
  assert.deepEqual(w2b.map(e => e.id),
    ['slot_tue1-20260825', 'slot_thu1-20260827', 'fx_aug29'],
    '24–30 Aug: Tuesday, Thursday, Amstelveense');
  assert.equal(w2.some(e => e.type === 'training'), true, 'training appears regardless of fixtures');
});

test('FUTURE TRAINING — the same weekday in different weeks is a different event', () => {
  const tue18 = week(FIXTURE_WEEK).find(e => e.id.startsWith('slot_tue1'));
  const tue25 = availabilityEventsForWeek(availWeekStart('2026-08-25'),
    { fixtures: [], slots: SLOTS, currentWeekStart: THIS_WEEK }).find(e => e.id.startsWith('slot_tue1'));
  assert.equal(tue18.id, 'slot_tue1-20260818');
  assert.equal(tue25.id, 'slot_tue1-20260825');
  assert.notEqual(tue18.id, tue25.id, 'answers cannot bleed between weeks');
  assert.equal(tue18.date, '2026-08-18');
  assert.equal(tue25.date, '2026-08-25');
});

test('FUTURE TRAINING — no event is represented twice in a week', () => {
  for (const start of [THIS_WEEK, FIXTURE_WEEK, availWeekStart('2026-08-25')]) {
    const ids = week(start).map(e => e.id);
    assert.equal(new Set(ids).size, ids.length, `week ${start} has no duplicate event`);
    // A slot must never appear as BOTH its legacy id and a dated id.
    const legacyCount = ids.filter(id => ['tue', 'thu'].includes(id)).length;
    const datedTue = ids.filter(id => id.startsWith('slot_tue1')).length;
    assert.equal(legacyCount === 0 || datedTue === 0, true,
      'a training slot is either legacy or dated in a given week, never both');
  }
});
