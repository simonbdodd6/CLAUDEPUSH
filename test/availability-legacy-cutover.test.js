/**
 * THE LEGACY-ID CUTOVER — Seniors bare tue/thu retired from current-week
 * Availability identity, and the generic `game` card confined to groups with
 * no fixture records.
 *
 * Production context (7 Sep 2026): the Seniors slots (slot_tue / slot_thu)
 * carry legacy sessionIds "tue"/"thu", and the current week's occurrence used
 * to be named by them — so ONE store was re-read as "this week" every week and
 * answers accumulated: 60 of 71 displayed Tuesday answers were history (back
 * to Aug 5) presented as current. The contract under test:
 *
 *   · EVERY week — current included — names a training occurrence by its
 *     dated id <slot-id>-YYYYMMDD.
 *   · The bare stores stay exactly where they are, readable under their own
 *     ids (historical truth), and can never satisfy a current-week occurrence.
 *   · U18 (slots with no legacy sessionId) behaves byte-for-byte as before.
 *   · A real fixture is answered under its own fixture id; a generic `game`
 *     answer can never satisfy it.
 *   · The generic `game` card renders ONLY for a group with no fixture
 *     records at all.
 *   · Attendance identity is untouched: both spellings of the same Tuesday
 *     canonicalize to the same slot-rooted dated register key.
 *
 * All dates injected. The server resolver is the REAL one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveAvailabilityForIdentity } from '../api/_availabilityStore.js';

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

// The REAL production shapes.
const SENIORS_SLOTS = [
  { id: 'slot_tue', day: 'Tue', active: true, sessionId: 'tue' },
  { id: 'slot_thu', day: 'Thu', active: true, sessionId: 'thu' },
];
const U18_SLOTS = [
  { id: 'slot_msvgzozt_0', day: 'Tue', active: true, sessionId: '' },
  { id: 'slot_msvh0skf_1', day: 'Thu', active: true, sessionId: '' },
];
const SENIORS_FIXTURES = [
  { id: 'fx_0z8v1ad', date: '2026-09-13', opposition: 'Frameries', status: 'scheduled' },
  { id: 'fx_k9ululd', date: '2026-09-20', opposition: 'Kituro', status: 'scheduled' },
];
const CUR = '2026-09-07'; // Monday

const core = new Function(`
  ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
  ${fn('availWeekStart')}
  ${fn('availAddDays')}
  ${fn('availSlotDateInWeek')}
  ${fn('availTrainingEventId')}
  ${fn('availabilityEventsForWeek')}
  ${fn('sessionKey')}
  ${fn('keyToSessionId')}
  ${fn('normalizeSessionId')}
  return { availWeekStart, availAddDays, availabilityEventsForWeek, sessionKey, keyToSessionId, normalizeSessionId };
`)();
const { availabilityEventsForWeek, sessionKey, keyToSessionId, normalizeSessionId } = core;

const week = (start, fixtures, slots, currentWeekStart = CUR) =>
  availabilityEventsForWeek(start, { fixtures, slots, currentWeekStart });

// ── 1+2. Seniors current week is DATED, legacy ids are gone ────────────────
test('Seniors current week (7–13 Sep) names Tuesday slot_tue-20260908 and Thursday slot_thu-20260910', () => {
  const ids = week(CUR, SENIORS_FIXTURES, SENIORS_SLOTS).map(e => e.id);
  assert.deepEqual(ids, ['slot_tue-20260908', 'slot_thu-20260910', 'fx_0z8v1ad']);
  assert.ok(!ids.includes('tue') && !ids.includes('thu') && !ids.includes('game'),
    'no bare legacy id and no generic game card anywhere in the week');
});

test('a player tap POSTs exactly the dated occurrence id (sessionKey round-trip)', () => {
  for (const e of week(CUR, SENIORS_FIXTURES, SENIORS_SLOTS)) {
    assert.equal(keyToSessionId(sessionKey(e.id)), e.id, `${e.id} round-trips`);
  }
});

// ── 3+4. Legacy bare answers cannot satisfy the current occurrences ────────
const ID = { userId: 'u1', playerId: 'u1', legacyPlayerId: '' };
const REC = (response, at = '2026-08-14T10:00:00.000Z') =>
  ({ response, reason: '', respondedAt: at, userId: 'u1', playerId: 'u1', legacyPlayerId: '' });

test('an answer in the bare tue/thu store never resolves for the dated current-week occurrence', () => {
  const answers = resolveAvailabilityForIdentity({
    tue: { u1: REC('available') },
    thu: { u1: REC('unavailable') },
  }, ID);
  assert.equal(answers.tue.response, 'available', 'the historical record still resolves under ITS OWN id');
  assert.equal(answers.thu.response, 'unavailable');
  for (const current of ['slot_tue-20260908', 'slot_thu-20260910']) {
    assert.ok(!(current in answers), `${current} has no answer`);
    assert.notEqual(normalizeSessionId('tue'), normalizeSessionId(current), 'no alias bridges bare→dated');
    assert.notEqual(normalizeSessionId('thu'), normalizeSessionId(current));
  }
});

test('the chase list does not credit a bare-store answer as a current-week reply', () => {
  const harness = new Function('operationalPlayers', 'playerIsArchived', 'sessionRows', `
    ${fn('availabilityNonResponders')}
    return availabilityNonResponders;
  `);
  const p1 = { id: 'p1', name: 'Bare Answerer' }, p2 = { id: 'p2', name: 'Dated Answerer' };
  const rowsById = {
    // p1's only answer lives in the bare store; p2 answered the dated occurrence.
    'tue': [{ player: p1, status: 'available' }, { player: p2, status: 'no-reply' }],
    'slot_tue-20260908': [{ player: p1, status: 'no-reply' }, { player: p2, status: 'available' }],
    'slot_thu-20260910': [{ player: p1, status: 'no-reply' }, { player: p2, status: 'no-reply' }],
    'fx_0z8v1ad': [{ player: p1, status: 'no-reply' }, { player: p2, status: 'no-reply' }],
  };
  const nonResponders = harness(() => [p1, p2], () => false, id => rowsById[id] || []);
  const sessions = week(CUR, SENIORS_FIXTURES, SENIORS_SLOTS);
  const chased = nonResponders(sessions).map(p => p.id);
  assert.deepEqual(chased, ['p1'], 'the bare-store answerer is chased; the dated answerer is not');
});

// ── 5. Historical answers stay historical/inert — no code path renames them ─
test('the resolver returns bare-store records untouched, keyed by their own historical ids', () => {
  const store = { tue: { u1: REC('maybe', '2026-08-05T09:00:00.000Z') } };
  const before = JSON.stringify(store);
  const answers = resolveAvailabilityForIdentity(store, ID);
  assert.equal(JSON.stringify(store), before, 'resolution never mutates the store');
  assert.deepEqual(Object.keys(answers), ['tue'], 'the record answers only to its historical id');
});

// ── 6–9. The four states resolve truthfully under the dated identity ───────
test('available / unavailable / maybe resolve; silence stays no-reply', () => {
  const bySession = {
    'slot_tue-20260908': {
      u1: REC('available', '2026-09-07T18:00:00.000Z'),
      u2: { response: 'unavailable', reason: 'work', respondedAt: '2026-09-07T18:01:00.000Z', userId: 'u2', playerId: 'u2' },
      u3: { response: 'maybe', reason: '', respondedAt: '2026-09-07T18:02:00.000Z', userId: 'u3', playerId: 'u3' },
    },
  };
  assert.equal(resolveAvailabilityForIdentity(bySession, ID)['slot_tue-20260908'].response, 'available');
  assert.equal(resolveAvailabilityForIdentity(bySession, { userId: 'u2', playerId: 'u2' })['slot_tue-20260908'].response, 'unavailable');
  assert.equal(resolveAvailabilityForIdentity(bySession, { userId: 'u3', playerId: 'u3' })['slot_tue-20260908'].response, 'maybe');
  assert.deepEqual(resolveAvailabilityForIdentity(bySession, { userId: 'u4', playerId: 'u4' }), {},
    'a genuine non-responder resolves to nothing — no false state');
});

// ── 10. U18 behaviour is unchanged ─────────────────────────────────────────
test('U18 (no legacy sessionIds) produces the identical dated ids it always did', () => {
  const U18_FIXTURES = [{ id: 'fx_uhzyj8h', date: '2026-09-12', opposition: 'DEND', status: 'scheduled' }];
  const ids = week(CUR, U18_FIXTURES, U18_SLOTS).map(e => e.id);
  assert.deepEqual(ids, ['slot_msvgzozt_0-20260908', 'slot_msvh0skf_1-20260910', 'fx_uhzyj8h']);
});

// ── 11+12. Fixture identity; game can never satisfy it ─────────────────────
test('a real fixture is its own occurrence and a generic game answer never satisfies it', () => {
  const ids = week(CUR, SENIORS_FIXTURES, SENIORS_SLOTS).map(e => e.id);
  assert.ok(ids.includes('fx_0z8v1ad'), 'the Frameries fixture is answerable under its own id');
  const answers = resolveAvailabilityForIdentity({ game: { u1: REC('available', '2026-09-02T10:48:00.000Z') } }, ID);
  assert.ok(!('fx_0z8v1ad' in answers), 'game answer does not appear under the fixture');
  assert.equal(normalizeSessionId('game'), 'game');
  assert.notEqual(normalizeSessionId('game'), normalizeSessionId('fx_0z8v1ad'), 'no alias bridges game→fixture');
});

// ── 13+14. Generic game card: suppressed with fixture records, kept without ─
test('a group WITH fixture records gets no generic game card — even in a fixture-less week', () => {
  // Week of 21–27 Sep: Seniors have fixtures on the 13th and 20th, none this week.
  const ids = week('2026-09-21', SENIORS_FIXTURES, SENIORS_SLOTS, '2026-09-21').map(e => e.id);
  assert.ok(!ids.includes('game'), 'fixture-capable group never shows the generic card');
  assert.deepEqual(ids, ['slot_tue-20260922', 'slot_thu-20260924']);
});

test('a group with NO fixture records keeps the legacy generic card in its current week only', () => {
  const now = week(CUR, [], SENIORS_SLOTS).map(e => e.id);
  assert.ok(now.includes('game'), 'legacy fixture-less group keeps the generic card');
  const next = week('2026-09-14', [], SENIORS_SLOTS).map(e => e.id);
  assert.ok(!next.includes('game'), 'the generic card never appears for another week');
});

test('cancelled fixtures still prove fixture capability (no heuristic resurrection of game)', () => {
  const cancelled = [{ id: 'fx_dead', date: '2026-08-01', opposition: 'X', status: 'cancelled' }];
  const ids = week(CUR, cancelled, SENIORS_SLOTS).map(e => e.id);
  assert.ok(!ids.includes('game'), 'any fixture record suppresses the generic card');
});

// ── 15. Player and coach derive the same identities ────────────────────────
test('player and coach views agree on every id for the same week and sources', () => {
  const a = week(CUR, SENIORS_FIXTURES, SENIORS_SLOTS).map(e => e.id);
  const b = week(CUR, SENIORS_FIXTURES, SENIORS_SLOTS).map(e => e.id);
  assert.deepEqual(a, b);
  assert.match(fn('availEventsForViewedWeek'), /availabilityEventsForWeek\(/, 'player side uses THE generator');
  assert.match(fn('coachAvailEvents'), /availabilityEventsForWeek\(/, 'coach side uses THE generator');
  assert.match(fn('availabilityWeekSessions'), /availabilityEventsForWeek\(/, 'the canonical week accessor uses THE generator');
});

// ── 16+17. Navigation and rollover stay dated ──────────────────────────────
test('previous and next weeks use the same dated identity scheme', () => {
  assert.deepEqual(week('2026-08-31', SENIORS_FIXTURES, SENIORS_SLOTS).map(e => e.id),
    ['slot_tue-20260901', 'slot_thu-20260903']);
  assert.deepEqual(week('2026-09-14', SENIORS_FIXTURES, SENIORS_SLOTS).map(e => e.id),
    ['slot_tue-20260915', 'slot_thu-20260917', 'fx_k9ululd']);
});

test('after the Sunday→Monday rollover the NEW current week is dated too — bare ids never come back', () => {
  const ids = week('2026-09-14', SENIORS_FIXTURES, SENIORS_SLOTS, '2026-09-14').map(e => e.id);
  assert.deepEqual(ids, ['slot_tue-20260915', 'slot_thu-20260917', 'fx_k9ululd']);
});

// ── 18. Attendance identity is untouched ───────────────────────────────────
test('attendanceOccurrenceId canonicalizes bare and dated spellings to the SAME register key', () => {
  const att = new Function('_trainingSchedule', `
    ${fn('attendanceOccurrenceId')}
    return attendanceOccurrenceId;
  `)({ slots: SENIORS_SLOTS });
  assert.equal(att('tue', '2026-09-08'), 'slot_tue-20260908', 'legacy spelling: register key unchanged');
  assert.equal(att('slot_tue-20260908'), 'slot_tue-20260908', 'dated spelling: same key');
  assert.equal(att('thu', '2026-09-10'), att('slot_thu-20260910'), 'both spellings, one register');
});

// ── tonight's identity is dated ────────────────────────────────────────────
test('tonightAvailabilityEventId answers with the dated occurrence, never the legacy sessionId', () => {
  const tonight = new Function('_trainingSchedule', 'ensureTrainingSchedule', '_availTodayOverride', `
    ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
    ${fn('availWeekStart')}
    ${fn('availAddDays')}
    ${fn('availSlotDateInWeek')}
    ${fn('availTrainingEventId')}
    function availToday() { return _availTodayOverride; }
    ${fn('tonightAvailabilityEventId')}
    return tonightAvailabilityEventId;
  `)({ slots: SENIORS_SLOTS }, () => {}, '2026-09-08'); // a Tuesday
  assert.equal(tonight('tue'), 'slot_tue-20260908', 'tonight is the dated occurrence');
});
