import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOnThisDay } from '../on-this-day.js';

const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'metadata', 'eventType', 'travellerIdentityId'];
function assertNoLeak(obj) {
  const seen = JSON.stringify(obj);
  for (const k of FORBIDDEN_KEYS) assert.ok(!seen.includes(`"${k}"`), `must not expose "${k}"`);
}

// Memories deliberately share the calendar day 12 July across 2024 and 2026.
function lifetime() {
  const trips = [
    { tripId: 't1', tripName: 'Bali 2024', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2024-07-08', endDate: '2024-07-20' },
    { tripId: 't2', tripName: 'Bali 2026', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-08', endDate: '2026-07-20' },
    { tripId: 't3', tripName: 'Thailand 2025', country: 'Thailand', destination: 'Phuket', area: 'Phuket', startDate: '2025-12-01', endDate: '2025-12-10' },
  ];
  const ev = (id, tripId, note, place, ts, photoRef, withL, move) => ({
    timelineEventId: id, tripId, eventType: photoRef ? 'photo_imported' : 'journal_entry',
    metadata: { eventName: photoRef ? 'photo_imported' : 'journal_entry', note, photoRef: photoRef ?? null, place, companions: withL ?? [], move: move ?? null }, timestamp: ts,
  });
  const events = [
    // 12 July 2024 — a dive (on a fast boat) with Manon
    ev('a1', 't1', 'Fast boat across, first scuba dive on the reef', 'Gili Air', '2024-07-12T09:00:00.000Z', 'p1', ['Manon'], { type: 'fast boat', from: 'Bali', to: 'Gili Air' }),
    ev('a2', 't1', 'Echo Beach sunset', 'Bali', '2024-07-12T18:00:00.000Z', 'p2', ['Manon']),
    // 15 July 2024 — different day (should NOT appear for 12 July)
    ev('a3', 't1', 'Rice terraces hike', 'Bali', '2024-07-15T10:00:00.000Z', 'p3', ['Manon']),
    // 12 July 2026 — another dive, two years later
    ev('b1', 't2', 'Reef dive, manta rays', 'Bali', '2026-07-12T08:00:00.000Z', 'p4', ['Manon']),
    // 02 Dec 2025 — unrelated day
    ev('c1', 't3', 'Flew to Phuket', 'Phuket', '2025-12-02T12:00:00.000Z', null, ['Manon']),
  ];
  return { events, trips };
}

test('surfaces only matching calendar-day memories from previous years', () => {
  const { events, trips } = lifetime();
  const otd = buildOnThisDay(events, trips, '2027-07-12'); // looking back from 2027

  assert.equal(otd.hasMemories, true);
  assert.equal(otd.monthDay, '07-12');
  assert.equal(otd.referenceYear, 2027);
  // every surfaced item is on 07-12 and from a previous year
  assert.ok(otd.items.length >= 3);
  assert.ok(otd.items.every(i => i.date.slice(5, 10) === '07-12'));
  assert.ok(otd.items.every(i => i.yearsAgo >= 1));
  // the 15 July hike must NOT be present
  assert.ok(!otd.items.some(i => /Rice terraces/.test(i.title)));
  // the December flight must NOT be present
  assert.ok(!otd.items.some(i => /Phuket/.test(i.title)));
});

test('items are chronological and carry the full presentation shape', () => {
  const { events, trips } = lifetime();
  const otd = buildOnThisDay(events, trips, '2027-07-12');
  for (let i = 1; i < otd.items.length; i += 1) assert.ok(otd.items[i].date >= otd.items[i - 1].date);
  for (const it of otd.items) {
    assert.ok(it.id && it.type && it.category && it.title);
    assert.ok(typeof it.year === 'number' && typeof it.yearsAgo === 'number' && it.yearsAgo >= 1);
    assert.ok('isMilestone' in it && 'isAnniversary' in it && 'borderCrossing' in it);
    assert.ok(Array.isArray(it.supportingMemories) && Array.isArray(it.mediaRefs) && Array.isArray(it.companions));
    assert.ok(it.emotionalTone && it.iconId && it.confidence && it.evidence);
  }
});

test('media is exposed as references only (never loaded)', () => {
  const { events, trips } = lifetime();
  const otd = buildOnThisDay(events, trips, '2027-07-12');
  const withMedia = otd.items.filter(i => i.mediaRefs.length);
  assert.ok(withMedia.length >= 1);
  assert.ok(withMedia.every(i => i.mediaRefs.every(r => typeof r === 'string'))); // just ids/refs
  assert.ok(otd.items.some(i => i.mediaRefs.includes('p1')));
});

test('transport tagging is reused from the journey engine (fast boat -> ferry)', () => {
  const { events, trips } = lifetime();
  const otd = buildOnThisDay(events, trips, '2027-07-12');
  // the 12 July 2024 dive memory backed a fast-boat segment → categorised as ferry transport
  assert.ok(otd.items.some(i => i.category === 'ferry'));
});

test('grouped by year + anniversary badges + comparisons', () => {
  const { events, trips } = lifetime();
  const otd = buildOnThisDay(events, trips, '2027-07-12');
  assert.deepEqual(otd.byYear.map(y => y.year), [2026, 2024]); // newest year first
  assert.ok(otd.byYear.every(y => y.yearsAgo >= 1 && typeof y.count === 'number'));
  assert.ok(otd.anniversaryBadges.some(b => b.yearsAgo === 1)); // 2026 = 1 year ago
  assert.ok(otd.anniversaryBadges.some(b => b.yearsAgo === 3)); // 2024 = 3 years ago
  assert.ok(otd.comparisons.some(c => /years ago/.test(c.headline)));
});

test('a hero moment is chosen (most significant)', () => {
  const { events, trips } = lifetime();
  const otd = buildOnThisDay(events, trips, '2027-07-12');
  assert.ok(otd.hero);
  assert.ok(otd.items.some(i => i.id === otd.hero.id));
});

test('milestone indicators and category breakdown are present', () => {
  const { events, trips } = lifetime();
  const otd = buildOnThisDay(events, trips, '2027-07-12');
  assert.ok(Array.isArray(otd.milestones));
  assert.ok(otd.categories.length >= 1 && otd.categories.every(c => c.category && typeof c.count === 'number'));
});

test('empty-state DTO when nothing happened on that day', () => {
  const { events, trips } = lifetime();
  const otd = buildOnThisDay(events, trips, '2027-03-03'); // no March memories
  assert.equal(otd.hasMemories, false);
  assert.equal(otd.hero, null);
  assert.deepEqual(otd.items, []);
  assert.deepEqual(otd.byYear, []);
  assert.deepEqual(otd.comparisons, []);
  assert.equal(otd.monthDay, '03-03');
});

test('current-year memories are excluded (previous years only)', () => {
  const { events, trips } = lifetime();
  const otd = buildOnThisDay(events, trips, '2026-07-12'); // reference year 2026
  // 2026 items excluded; only 2024 remains
  assert.ok(otd.items.every(i => i.year < 2026));
  assert.ok(otd.items.some(i => i.year === 2024));
});

test('deterministic and leaks no backend terms', () => {
  const { events, trips } = lifetime();
  const a = buildOnThisDay(events, trips, '2027-07-12');
  const b = buildOnThisDay(events, trips, '2027-07-12');
  assert.deepEqual(a, b);
  assertNoLeak(a);
});
