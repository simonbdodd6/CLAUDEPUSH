import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTravelWrapped } from '../travel-wrapped.js';
import { buildWorld } from '../world.js';
import { buildAchievements } from '../achievements.js';

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
    ev('a4', 't1', 'Reef dive, turtles', 'Gili Air', '2024-07-05T11:00:00.000Z', 'p3', ['Manon']),
    ev('c1', 't3', 'Flew to Phuket', 'Phuket', '2025-12-01T12:00:00.000Z', null, ['Manon']),
    ev('c2', 't3', 'Beach day, local food', 'Phuket', '2025-12-02T18:00:00.000Z', 'p4', ['Manon']),
    ev('b1', 't2', 'Back in Bali, beach day', 'Bali', '2026-07-01T11:00:00.000Z', 'p5', ['Manon']),
    ev('b2', 't2', 'Sunset and a dive', 'Bali', '2026-07-03T18:00:00.000Z', 'p6', ['Manon']),
  ];
  return { events, trips };
}

test('headline stats are composed from the existing engines (not recomputed)', () => {
  const { events, trips } = lifetime();
  const w = buildTravelWrapped(events, trips);
  const world = buildWorld(events, trips);

  // numbers match the source engines exactly (composition, not new maths)
  assert.equal(w.stats.countries, world.statistics.totalCountries);
  assert.equal(w.stats.cities, world.statistics.totalCities);
  assert.equal(w.stats.islands, world.statistics.totalIslands);
  assert.equal(w.stats.travelDays, world.statistics.totalDays);
  assert.equal(w.stats.trips, world.statistics.totalJourneys);
  assert.equal(w.stats.returnVisits, world.repeatVisits.length);
  assert.equal(w.stats.memories, world.statistics.totalMemories);

  const ach = buildAchievements(events, trips);
  const diveCurrent = ach.achievements.find(a => a.seriesId === 'diving').progress.current;
  assert.equal(w.stats.dives, diveCurrent);
  const flightCurrent = ach.achievements.find(a => a.seriesId === 'flights').progress.current;
  assert.equal(w.stats.flights, flightCurrent);
});

test('highlights pull favourite destination, companion, longest trip and biggest year', () => {
  const { events, trips } = lifetime();
  const w = buildTravelWrapped(events, trips);
  assert.equal(w.highlights.favouriteCountry, 'Indonesia');
  assert.equal(w.highlights.favouriteCompanion, 'Manon');
  assert.ok(w.highlights.longestTrip && /days/.test(w.highlights.longestTrip));
  assert.ok([2024, 2025, 2026].includes(w.highlights.mostActiveYear));
});

test('travel by season buckets existing timeline moments deterministically', () => {
  const { events, trips } = lifetime();
  const w = buildTravelWrapped(events, trips);
  assert.deepEqual(w.bySeason.map(s => s.season), ['Spring', 'Summer', 'Autumn', 'Winter']);
  const total = w.bySeason.reduce((n, s) => n + s.moments, 0);
  assert.ok(total > 0);
  assert.ok(w.bySeason.find(s => s.season === 'Summer').moments >= 1); // July travels
});

test('achievement highlights surface top earned badges by tier', () => {
  const { events, trips } = lifetime();
  const w = buildTravelWrapped(events, trips);
  assert.ok(w.achievements.totalEarned > 0);
  assert.ok(w.achievements.topBadges.length >= 1 && w.achievements.topBadges.length <= 5);
  // sorted strongest tier first
  const ranks = { Bronze: 1, Silver: 2, Gold: 3, Platinum: 4, Legend: 5 };
  for (let i = 1; i < w.achievements.topBadges.length; i += 1) {
    assert.ok(ranks[w.achievements.topBadges[i - 1].tier] >= ranks[w.achievements.topBadges[i].tier]);
  }
});

test('travel DNA + life story highlights are included (trimmed engine output)', () => {
  const { events, trips } = lifetime();
  const w = buildTravelWrapped(events, trips);
  assert.ok(w.travelDna.topTraits.length >= 1 && w.travelDna.topTraits.length <= 3);
  assert.ok(w.travelDna.topTraits.every(t => t.label && t.statement && typeof t.score === 'number'));
  assert.ok(Array.isArray(w.lifeStory) && w.lifeStory.length <= 3);
});

test('the wrapped deck is an ordered set of presentation cards', () => {
  const { events, trips } = lifetime();
  const w = buildTravelWrapped(events, trips);
  assert.equal(w.sections[0].id, 'intro');
  assert.equal(w.sections[w.sections.length - 1].id, 'outro');
  for (const s of w.sections) {
    assert.ok(s.id && s.kind && s.title && s.accent && s.icon);
    assert.ok('value' in s && 'subtitle' in s);
  }
  assert.ok(w.sections.some(s => s.id === 'countries'));
  assert.ok(w.sections.some(s => s.id === 'flights'));
});

test('yearly wrapped sections summarise each travel year', () => {
  const { events, trips } = lifetime();
  const w = buildTravelWrapped(events, trips);
  assert.deepEqual(w.years.map(y => y.year), [2024, 2025, 2026]);
  const y2024 = w.years.find(y => y.year === 2024);
  assert.ok(y2024.summary.memories >= 1);
  assert.ok(y2024.topMoment && y2024.topMoment.title);
  assert.ok(Array.isArray(y2024.bySeason) && y2024.bySeason.length === 4);
  assert.ok(y2024.countries.includes('Indonesia'));
});

test('travel wrapped is deterministic and leaks no backend terms', () => {
  const { events, trips } = lifetime();
  const a = buildTravelWrapped(events, trips);
  const b = buildTravelWrapped(events, trips);
  assert.deepEqual(a, b);
  assertNoLeak(a);
});

test('a brand-new traveller gets a valid, empty-but-safe wrapped', () => {
  const w = buildTravelWrapped([], []);
  assert.equal(w.stats.countries, 0);
  assert.equal(w.stats.travelDays, 0);
  assert.deepEqual(w.years, []);
  assert.equal(w.headline.favouriteDestination, null);
  // deck still has intro + a few zero-value stat cards + outro (no crash)
  assert.equal(w.sections[0].id, 'intro');
  assert.equal(w.sections[w.sections.length - 1].id, 'outro');
});

test('composition only — wrapped numbers never exceed their source engines', () => {
  const { events, trips } = lifetime();
  const w = buildTravelWrapped(events, trips);
  const world = buildWorld(events, trips);
  // sanity: wrapped is a view over world/achievements, so its core counts equal source
  assert.equal(w.stats.countries, world.countries.length);
  assert.equal(w.stats.islands, world.islands.length);
  // wrapped span comes from the lifetime timeline (includes the first-trip moment),
  // so it contains the world's first-memory span rather than exactly equalling it.
  assert.ok(w.headline.span.from <= world.profile.span.from);
  assert.ok(w.headline.span.to >= world.profile.span.to);
});
