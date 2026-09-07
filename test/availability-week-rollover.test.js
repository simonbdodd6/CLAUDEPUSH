/**
 * THE STALE-WEEK TRAP — production incident, week of 7 September 2026.
 *
 * state.availWeekStart (player) and state.coachAvailWeekStart (coach) are
 * PERSISTED, and the accessors used to honour whatever week was stored. A
 * device that last opened Availability during week N therefore still rendered
 * week N in week N+1: every tap — "Yes to all" included — wrote to week N's
 * dated occurrence ids. Samuel Nysenholc and Eleazar Massuama pressed
 * Available on Monday 7 September and their answers landed on
 * slot_tue-20260901 / slot_thu-20260903 — the week that had already ended —
 * while the coach board, truthfully reading the current week, showed No reply.
 * 70 such stale-week writes existed in production across ~25 players.
 *
 * The contract under test: a stored viewed week is honoured ONLY while the
 * real-world week in which the user explicitly navigated is still current.
 * Fresh loads, restored state, and a PWA left open across the Sunday→Monday
 * rollover all snap to the current week. Prev/Next navigation still browses
 * other weeks exactly as before within the session.
 *
 * Dates are injected via _availTodayOverride. Nothing reads the clock.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveAvailabilityForIdentity } from '../api/_availabilityStore.js';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** Paren-aware function extractor (skips the parameter list before brace-matching). */
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

// The Seniors shape from production: legacy-id training slots + a real dated fixture.
const SLOTS = [
  { id: 'slot_tue', day: 'Tue', active: true, sessionId: 'tue' },
  { id: 'slot_thu', day: 'Thu', active: true, sessionId: 'thu' },
];
const FIXTURES = [
  { id: 'fx_frameries', date: '2026-09-13', opposition: 'Frameries', status: 'scheduled' },
];

/** Build the app's week machinery around an injectable clock and state. */
function makeApp(state) {
  const saveStateCalls = [];
  const api = new Function('state', 'saveStateCalls', 'SLOTS', 'FIXTURES', `
    let _availTodayOverride = '';
    ${fn('availToday')}
    ${fn('availWeekStart')}
    ${fn('availAddDays')}
    ${src.match(/let _availWeekNavIn = '';/)[0]}
    ${src.match(/let _coachAvailWeekNavIn = '';/)[0]}
    ${fn('availViewedWeek')}
    ${fn('availGoToThisWeek')}
    ${fn('availShiftWeek')}
    ${fn('coachAvailWeek')}
    ${fn('availWeekShift')}
    ${fn('coachAvailShiftWeek')}
    ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
    ${fn('availSlotDateInWeek')}
    ${fn('availTrainingEventId')}
    ${fn('availabilityEventsForWeek')}
    ${fn('sessionKey')}
    ${fn('keyToSessionId')}
    ${fn('normalizeSessionId')}
    function saveState(m) { saveStateCalls.push(m); }
    function renderPlayerAvailabilityV2() {}
    function render() {}
    function weekEvents(weekStartIso) {
      return availabilityEventsForWeek(weekStartIso, {
        fixtures: FIXTURES, slots: SLOTS,
        currentWeekStart: availWeekStart(availToday()),
      });
    }
    function coachAvailEvents() { return weekEvents(coachAvailWeek()); }
    function playerEvents() { return weekEvents(availViewedWeek()); }
    return {
      setToday: iso => { _availTodayOverride = iso; },
      availViewedWeek, availGoToThisWeek, availShiftWeek,
      coachAvailWeek, availWeekShift, coachAvailShiftWeek,
      playerEvents, coachAvailEvents,
      sessionKey, keyToSessionId, normalizeSessionId,
    };
  `)(state, saveStateCalls, SLOTS, FIXTURES);
  return { ...api, state, saveStateCalls };
}

// ── 1. THE SAMUEL / ELEAZAR REPRODUCTION — player side ─────────────────────
test('a stored week from a PREVIOUS real week snaps to the current week (player)', () => {
  const app = makeApp({ availWeekStart: '2026-08-31' }); // persisted last Monday
  app.setToday('2026-09-07');                            // it is now next Monday
  assert.equal(app.availViewedWeek(), '2026-09-07', 'the screen opens on the current week');
});

test('after the snap, every id a tap would POST is a current-week id — never last week\'s', () => {
  const app = makeApp({ availWeekStart: '2026-08-31' });
  app.setToday('2026-09-07');
  const events = app.playerEvents();
  // "Yes to all" posts keyToSessionId(sessionKey(e.id)) for each card.
  // Post legacy-id cutover: the current week is DATED like every other week.
  const postedIds = events.map(e => app.keyToSessionId(app.sessionKey(e.id)));
  assert.deepEqual(postedIds.sort(), ['fx_frameries', 'slot_thu-20260910', 'slot_tue-20260908'],
    'current-week dated training occurrences plus the real fixture');
  for (const id of postedIds) {
    assert.ok(!/-(20260901|20260903)$/.test(id), `${id} is not a dated id of the ended week`);
  }
  assert.ok(events.some(e => e.id === 'fx_frameries'),
    'the fixture card is reachable — Samuel could not see it at all before the fix');
});

test('a genuinely fresh device also lands on the current week', () => {
  const app = makeApp({});
  app.setToday('2026-09-07');
  assert.equal(app.availViewedWeek(), '2026-09-07');
});

// ── 2. EXPLICIT NAVIGATION IS PRESERVED ────────────────────────────────────
test('Prev still browses last week within the session, and moves relative to the SNAPPED week', () => {
  const app = makeApp({ availWeekStart: '2026-08-24' }); // stale by two weeks
  app.setToday('2026-09-07');
  app.availShiftWeek(-1);
  assert.equal(app.state.availWeekStart, '2026-08-31',
    'Prev = current week minus 7, not the stale stored week minus 7');
  assert.equal(app.availViewedWeek(), '2026-08-31', 'the explicit choice is honoured');
  const dated = app.playerEvents().map(e => e.id);
  assert.deepEqual(dated.sort(), ['slot_thu-20260903', 'slot_tue-20260901'],
    'a deliberately browsed past week shows its dated occurrence ids (no fixture there)');
});

test('"Back to this week" returns and is honoured', () => {
  const app = makeApp({ availWeekStart: '2026-08-31' });
  app.setToday('2026-09-07');
  app.availShiftWeek(-1);
  app.availGoToThisWeek();
  assert.equal(app.availViewedWeek(), '2026-09-07');
});

test('a PWA left open across the week rollover snaps forward even after explicit navigation', () => {
  const app = makeApp({});
  app.setToday('2026-09-07');
  app.availShiftWeek(1);                                  // deliberately viewing next week
  assert.equal(app.availViewedWeek(), '2026-09-14');
  app.setToday('2026-09-14');                             // Monday arrives, app never reloaded
  assert.equal(app.availViewedWeek(), '2026-09-14', 'the viewed week IS the new current week');
  app.setToday('2026-09-21');                             // another rollover, still open
  assert.equal(app.availViewedWeek(), '2026-09-21', 'the old navigation stamp no longer pins the view');
});

// ── 3. THE COACH BOARD HAS THE SAME CONTRACT ───────────────────────────────
test('a stored coach week from a previous real week snaps to the current week', () => {
  const app = makeApp({ coachAvailWeekStart: '2026-08-31' });
  app.setToday('2026-09-07');
  assert.equal(app.coachAvailWeek(), '2026-09-07',
    'the coach chases and clears against the CURRENT week, not a week that ended');
});

test('coach Prev/This week/Next navigation still works', () => {
  const app = makeApp({ coachAvailWeekStart: '2026-08-24', messageDetail: null });
  app.setToday('2026-09-07');
  app.availWeekShift(-1);
  assert.equal(app.state.coachAvailWeekStart, '2026-08-31', 'relative to the snapped current week');
  assert.equal(app.coachAvailWeek(), '2026-08-31', 'explicit choice honoured');
  app.availWeekShift(0);
  assert.equal(app.coachAvailWeek(), '2026-09-07', 'delta 0 = jump to this week');
  app.coachAvailShiftWeek(1);
  assert.equal(app.coachAvailWeek(), '2026-09-14');
});

test('player and coach derive IDENTICAL event ids for the same week', () => {
  const app = makeApp({});
  app.setToday('2026-09-07');
  assert.deepEqual(
    app.playerEvents().map(e => e.id),
    app.coachAvailEvents().map(e => e.id),
    'one week, one identity on both sides');
});

// ── 4. TRUTHFUL RESOLUTION THROUGH THE REAL SERVER RESOLVER ────────────────
const IDENTITY = { userId: 'u_samuel', playerId: 'u_samuel', legacyPlayerId: '' };
const REC = (response, at) => ({ response, reason: '', respondedAt: at, userId: 'u_samuel', playerId: 'u_samuel', legacyPlayerId: '' });

test('an answer under the current-week fixture id resolves as that answer for the coach', () => {
  const answers = resolveAvailabilityForIdentity(
    { fx_frameries: { u_samuel: REC('available', '2026-09-07T08:07:00.000Z') } }, IDENTITY);
  assert.equal(answers.fx_frameries.response, 'available');
});

test('a stale-week dated answer does NOT surface under the current week\'s ids', () => {
  const app = makeApp({});
  app.setToday('2026-09-07');
  const answers = resolveAvailabilityForIdentity(
    { 'slot_tue-20260901': { u_samuel: REC('available', '2026-09-07T08:07:42.848Z') } }, IDENTITY);
  // The record exists and resolves under its own id — the store is truthful…
  assert.equal(answers['slot_tue-20260901'].response, 'available');
  // …but no current-week id aliases to it, so the board neither invents an
  // answer for Tuesday the 8th nor loses the record.
  for (const currentId of app.playerEvents().map(e => e.id)) {
    assert.ok(!(currentId in answers), `${currentId} has no answer`);
    assert.notEqual(app.normalizeSessionId('slot_tue-20260901'), app.normalizeSessionId(currentId),
      `slot_tue-20260901 never normalizes into ${currentId}`);
  }
});

test('a genuine non-responder resolves to NOTHING — no false available, no false unavailable', () => {
  const answers = resolveAvailabilityForIdentity(
    { fx_frameries: { u_other: { response: 'available', userId: 'u_other', playerId: 'u_other' } } },
    IDENTITY);
  assert.deepEqual(answers, {}, 'someone else\'s answer is never Samuel\'s');
});

// ── 5. SHAPE GUARDS — the fix cannot be silently dropped ───────────────────
test('all three shift paths stamp the navigation week, and both accessors check it', () => {
  assert.match(fn('availShiftWeek'), /_availWeekNavIn = availWeekStart\(availToday\(\)\)/);
  assert.match(fn('availGoToThisWeek'), /_availWeekNavIn = /);
  assert.match(fn('availWeekShift'), /_coachAvailWeekNavIn = availWeekStart\(availToday\(\)\)/);
  assert.match(fn('coachAvailShiftWeek'), /_coachAvailWeekNavIn = availWeekStart\(availToday\(\)\)/);
  assert.match(fn('availViewedWeek'), /_availWeekNavIn !== cur/);
  assert.match(fn('coachAvailWeek'), /_coachAvailWeekNavIn !== cur/);
});
