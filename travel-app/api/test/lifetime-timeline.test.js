import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLifetimeTimeline } from '../lifetime-timeline.js';

const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'metadata', 'eventType', 'travellerIdentityId'];
function assertNoLeak(obj) {
  const seen = JSON.stringify(obj);
  for (const k of FORBIDDEN_KEYS) assert.ok(!seen.includes(`"${k}"`), `must not expose "${k}"`);
}

function lifetime() {
  const trips = [
    { tripId: 't1', tripName: 'Bali 2024', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2024-07-01', endDate: '2024-07-12' },
    { tripId: 't2', tripName: 'Bali 2026', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-01', endDate: '2026-07-14' },
    { tripId: 't3', tripName: 'Thailand 2025', country: 'Thailand', destination: 'Phuket', area: 'Phuket', startDate: '2025-12-01', endDate: '2025-12-10' },
  ];
  const ev = (id, tripId, note, place, ts, photoRef, withL, move) => ({
    timelineEventId: id, tripId, eventType: photoRef ? 'photo_imported' : 'journal_entry',
    metadata: { eventName: photoRef ? 'photo_imported' : 'journal_entry', note, photoRef: photoRef ?? null, place, companions: withL ?? [], move: move ?? null }, timestamp: ts,
  });
  const events = [
    ev('a1', 't1', 'Landed in Bali after the flight', 'Bali', '2024-07-01T10:00:00.000Z', null, ['Manon']),
    ev('a2', 't1', 'Echo Beach sunset', 'Bali', '2024-07-02T18:00:00.000Z', 'p1', ['Manon']),
    ev('a3', 't1', 'Fast boat, first scuba dive', 'Gili Air', '2024-07-05T09:00:00.000Z', 'p2', ['Manon'], { type: 'fast boat', from: 'Bali', to: 'Gili Air' }),
    ev('a4', 't1', 'Reef dive, turtles, more photos', 'Gili Air', '2024-07-05T11:00:00.000Z', 'p3', ['Manon']),
    ev('a5', 't1', 'Sunset again, golden hour', 'Gili Air', '2024-07-05T18:00:00.000Z', 'p4', ['Manon']),
    ev('c1', 't3', 'Flew to Phuket', 'Phuket', '2025-12-01T12:00:00.000Z', null, ['Manon']),
    ev('c2', 't3', 'Beach day, local food', 'Phuket', '2025-12-02T18:00:00.000Z', 'p5', ['Manon']),
    ev('b1', 't2', 'Back in Bali, beach day', 'Bali', '2026-07-01T11:00:00.000Z', 'p6', ['Manon']),
    ev('b2', 't2', 'Sunset and a dive', 'Bali', '2026-07-03T18:00:00.000Z', 'p7', ['Manon']),
  ];
  return { events, trips };
}

const find = (tl, id) => tl.moments.find(m => m.id === id);

test('lifetime timeline assembles a chronological story of moments', () => {
  const { events, trips } = lifetime();
  const tl = buildLifetimeTimeline(events, trips);

  assert.ok(tl.moments.length > 0);
  // chronological
  for (let i = 1; i < tl.moments.length; i += 1) assert.ok(tl.moments[i].date >= tl.moments[i - 1].date);
  assert.ok(tl.summary.totalMoments === tl.moments.length);
  assert.ok(tl.summary.span.from <= tl.summary.span.to);
});

test('every moment carries the required shape', () => {
  const { events, trips } = lifetime();
  const tl = buildLifetimeTimeline(events, trips);
  for (const m of tl.moments) {
    assert.ok(m.id && m.type && m.title);
    assert.ok(['first-visit', 'milestone', 'achievement', 'return', 'relationship', 'memory', 'journey'].includes(m.type));
    assert.ok(typeof m.date === 'string' && typeof m.year === 'number' && m.month >= 1 && m.month <= 12);
    assert.ok(Array.isArray(m.supportingMemories) && Array.isArray(m.supportingTrips));
    assert.ok(Array.isArray(m.relatedAchievements) && Array.isArray(m.relatedPlaces) && Array.isArray(m.relatedCompanions));
    assert.ok(m.emotionalTone && m.iconId && m.confidence && m.evidence);
  }
});

test('includes first trip, first memory, first flight, first dive and return moments', () => {
  const { events, trips } = lifetime();
  const tl = buildLifetimeTimeline(events, trips);
  assert.ok(find(tl, 'first-trip'));
  assert.ok(find(tl, 'first-memory'));
  assert.ok(find(tl, 'ach-flights-bronze')); // First Flight
  assert.ok(find(tl, 'ach-diving-bronze'));  // First Dive
  assert.ok(find(tl, 'longest-trip'));
  const ret = find(tl, 'return-bali');
  assert.ok(ret && ret.type === 'return');
  assert.match(ret.title, /returned to Bali/i);
});

test('includes relationship moments for a travel companion', () => {
  const { events, trips } = lifetime();
  const tl = buildLifetimeTimeline(events, trips);
  const firstWith = find(tl, 'first-with-manon');
  assert.ok(firstWith && firstWith.type === 'relationship');
  assert.ok(firstWith.relatedCompanions.includes('Manon'));
  assert.ok(find(tl, 'trips-with-manon')); // 3 trips together
});

test('includes a most-photographed-day journey moment', () => {
  const { events, trips } = lifetime();
  const tl = buildLifetimeTimeline(events, trips);
  const day = find(tl, 'most-photographed-day');
  assert.ok(day && day.type === 'journey');
  assert.ok(day.supportingMemories.length >= 2);
});

test('years and months group the moments; eras become chapters', () => {
  const { events, trips } = lifetime();
  const tl = buildLifetimeTimeline(events, trips);
  assert.deepEqual(tl.years.map(y => y.year), [2024, 2025, 2026]);
  const y2024 = tl.years.find(y => y.year === 2024);
  assert.ok(y2024.months.length >= 1);
  assert.ok(y2024.summary.trips === 1);
  assert.ok(y2024.momentIds.length >= 1);
  // 2024..2026 are consecutive → a single chapter
  assert.equal(tl.chapters.length, 1);
  assert.deepEqual(tl.chapters[0].years, [2024, 2025, 2026]);
});

test('filters support year, month, country, companion, favourites, firsts, returns', () => {
  const { events, trips } = lifetime();
  const tl = buildLifetimeTimeline(events, trips);
  assert.ok(tl.filters.byYear.some(y => y.year === 2024 && y.momentIds.length));
  assert.ok(tl.filters.byMonth.some(mm => mm.year === 2024));
  assert.ok(tl.filters.byCountry.some(c => c.country === 'Indonesia'));
  assert.ok(tl.filters.byCompanion.some(c => c.companion === 'Manon'));
  assert.ok(tl.filters.firsts.length >= 1);
  assert.ok(tl.filters.returns.length >= 1);
  assert.ok(Array.isArray(tl.filters.favourites));
});

test('lifetime timeline is deterministic and leaks no backend terms', () => {
  const { events, trips } = lifetime();
  const a = buildLifetimeTimeline(events, trips);
  const b = buildLifetimeTimeline(events, trips);
  assert.deepEqual(a, b);
  assertNoLeak(a);
});

test('a brand-new traveller has an empty but valid timeline', () => {
  const tl = buildLifetimeTimeline([], []);
  assert.deepEqual(tl.moments, []);
  assert.deepEqual(tl.years, []);
  assert.equal(tl.summary.totalMoments, 0);
  assert.equal(tl.summary.span, null);
});
