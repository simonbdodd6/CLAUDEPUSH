/**
 * AVAILABILITY SESSION LABELS — "Tuesday Training", not "2026-09-15".
 *
 * The Availability session cards and the Live Response Board named a session
 * by its raw ISO date. The week's date range is already on screen, so the date
 * told a coach nothing and made the cards slow to scan. They now read
 * "[Weekday] [Training|Match]".
 *
 * The contract pinned here:
 *   - the weekday comes from the occurrence's OWN date — nothing is assumed
 *     about which days a club trains or plays
 *   - Training vs Match comes from the canonical event type
 *   - an impossible date prints NO weekday: JS silently rolls 30 Feb into
 *     2 March, and a confident wrong weekday is worse than none
 *   - an undated or unrecognised session keeps exactly what the screen already
 *     showed, so nothing is invented
 *   - it is presentation only: the event, its id and its date are untouched
 *
 * Every expected weekday below was computed independently (Python's
 * datetime), not derived from the function under test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

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

const label = new Function(`${fn('availabilitySessionLabel')}; return availabilitySessionLabel;`)();
const training = date => ({ id: `slot_x-${String(date).replace(/-/g, '')}`, type: 'training', title: 'Training', date });
const match    = date => ({ id: 'fx_abc123', type: 'match', title: 'Match', date });

// ── the named examples ──────────────────────────────────────────────────────

test('1. Tuesday training', () => assert.equal(label(training('2026-09-15')), 'Tuesday Training'));
test('2. Thursday training', () => assert.equal(label(training('2026-09-17')), 'Thursday Training'));
test('3. Saturday match', () => assert.equal(label(match('2026-09-19')), 'Saturday Match'));
test('4. Sunday match', () => assert.equal(label(match('2026-09-20')), 'Sunday Match'));

// ── nothing is hard-coded to one club's days ────────────────────────────────

test('5. training on every weekday names the right day', () => {
  const week = { '2026-09-14': 'Monday', '2026-09-15': 'Tuesday', '2026-09-16': 'Wednesday',
                 '2026-09-17': 'Thursday', '2026-09-18': 'Friday', '2026-09-19': 'Saturday', '2026-09-20': 'Sunday' };
  for (const [date, day] of Object.entries(week)) assert.equal(label(training(date)), `${day} Training`, date);
});

test('6. a match on a weekday is still a match, on its own day', () => {
  assert.equal(label(match('2026-09-16')), 'Wednesday Match', 'midweek fixture');
  assert.equal(label(match('2026-09-18')), 'Friday Match', 'Friday-night fixture');
});

// ── boundaries ──────────────────────────────────────────────────────────────

test('7. week boundary: Sunday then Monday', () => {
  assert.equal(label(match('2026-09-20')), 'Sunday Match');
  assert.equal(label(training('2026-09-21')), 'Monday Training');
});

test('month boundary: 30 September then 1 October', () => {
  assert.equal(label(training('2026-09-30')), 'Wednesday Training');
  assert.equal(label(training('2026-10-01')), 'Thursday Training');
});

test('8. year boundary: 31 December then 1 January', () => {
  assert.equal(label(training('2026-12-31')), 'Thursday Training');
  assert.equal(label(match('2027-01-01')), 'Friday Match');
});

test('a real leap day is a real day', () => {
  assert.equal(label(training('2028-02-29')), 'Tuesday Training');
});

// ── never a misleading weekday ──────────────────────────────────────────────

test('an impossible date prints NO weekday rather than a rolled-over one', () => {
  // 2026-02-30 → JS makes it 2 March, a Monday. "Monday Training" would be a lie.
  for (const bad of ['2026-02-29', '2026-02-30', '2026-09-31', '2026-13-01', '2026-00-10']) {
    assert.equal(label(training(bad)), 'Training', `${bad} must not produce a weekday`);
    assert.equal(label(match(bad)), 'Match', `${bad} must not produce a weekday`);
  }
});

test('a malformed date prints no weekday', () => {
  for (const bad of ['15/09/2026', '2026-9-15', 'Tuesday', '2026-09-15x', 'not a date']) {
    assert.equal(label(training(bad)), 'Training', JSON.stringify(bad));
  }
});

test('a full ISO datetime still names the occurrence day', () => {
  assert.equal(label(training('2026-09-15T19:00:00')), 'Tuesday Training');
});

// ── legacy and missing data: never invented ─────────────────────────────────

test('9. the undated legacy match keeps its plain name — no invented weekday', () => {
  // availabilityEventsForWeek emits exactly this for a group with no fixtures.
  const legacy = { id: 'game', type: 'match', legacy: true, date: '', title: 'Match', sourceId: 'game' };
  assert.equal(label(legacy), 'Match');
});

test('an unrecognised type keeps the existing label and is never renamed', () => {
  assert.equal(label({ id: 's1', type: 'social', title: 'Club BBQ', date: '2026-09-19' }), 'Club BBQ',
    'no weekday is bolted onto a type this helper does not own');
  assert.equal(label({ id: 's2', title: 'Recovery', date: '2026-09-15' }), 'Recovery', 'missing type → existing title');
  assert.equal(label({ id: 'only-an-id' }), 'only-an-id', 'nothing but an id → the id, as before');
  assert.equal(label({}), '');
  assert.equal(label(undefined), '');
});

test('the canonical type decides, even if a title disagrees', () => {
  assert.equal(label({ type: 'match', title: 'Training', date: '2026-09-19' }), 'Saturday Match');
});

// ── presentation only ───────────────────────────────────────────────────────

test('the occurrence itself is never modified — only the label is derived', () => {
  const ev = training('2026-09-15');
  const before = structuredClone(ev);
  const out = label(ev);
  assert.equal(out, 'Tuesday Training');
  assert.deepEqual(ev, before, 'id, type, title and date are all untouched');
  assert.equal(ev.date, '2026-09-15', 'the date every answer is keyed on is unchanged');
  assert.equal(ev.id, 'slot_x-20260915', 'the occurrence id is unchanged');
});

// ── both surfaces, one helper, no raw date ──────────────────────────────────

test('the session cards and the Live Response Board share the one label helper', () => {
  const board = fn('renderMessageCenterV2');
  assert.match(board, /const sessionDisplayTitle = session => availabilitySessionLabel\(session\);/,
    'the shared local helper delegates to the one label function');
  const uses = board.match(/sessionDisplayTitle\(/g) || [];
  assert.ok(uses.length >= 2, `cards and board both name sessions through it (${uses.length} uses)`);
});

test('the raw ISO date is no longer printed as a session label', () => {
  const board = fn('renderMessageCenterV2');
  assert.doesNotMatch(board, /\$\{esc\(session\.date \|\| "Availability open"\)\}/,
    'the session card no longer prints session.date as its subtitle');
  assert.doesNotMatch(board, /selected\?\.date \? ' · ' \+ esc\(selected\.date\)/,
    'the Live Response Board no longer appends the raw date');
});

test('the week range the coach navigates by is unchanged', () => {
  const board = fn('renderMessageCenterV2');
  assert.match(board, /availDatedWeekLabel\(coachAvailWeek\(\)\)/, 'the week header still renders');
});
