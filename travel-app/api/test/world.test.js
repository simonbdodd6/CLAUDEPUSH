import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld } from '../world.js';

const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'metadata', 'eventType', 'travellerIdentityId', '_highlightRaw', '_intensity', '_mem'];
function assertNoLeak(obj) {
  const seen = JSON.stringify(obj);
  for (const k of FORBIDDEN_KEYS) assert.ok(!seen.includes(`"${k}"`), `must not expose "${k}"`);
}

// A lifetime across countries, islands, years and companions.
function lifetime() {
  const trips = [
    { tripId: 't1', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2024-07-01', endDate: '2024-07-12' },
    { tripId: 't2', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-01', endDate: '2026-07-12' },
    { tripId: 't3', country: 'Thailand', destination: 'Phuket', area: 'Phuket', startDate: '2025-12-01', endDate: '2025-12-10' },
  ];
  const ev = (id, tripId, note, place, ts, photoRef, withL, move) => ({
    timelineEventId: id, tripId, eventType: photoRef ? 'photo_imported' : 'journal_entry',
    metadata: { eventName: photoRef ? 'photo_imported' : 'journal_entry', note, photoRef: photoRef ?? null, place, companions: withL ?? [], move: move ?? null }, timestamp: ts,
  });
  const events = [
    // 2024 Bali (+ fast boat to Gili Air)
    ev('a1', 't1', 'Landed in Bali after the flight', 'Bali', '2024-07-01T10:00:00.000Z', null, ['Manon']),
    ev('a2', 't1', 'Echo Beach sunset', 'Bali', '2024-07-02T18:00:00.000Z', 'p1', ['Manon']),
    ev('a3', 't1', 'Fast boat to the island, scuba dive', 'Gili Air', '2024-07-05T09:00:00.000Z', 'p2', ['Manon'], { type: 'fast boat', from: 'Bali', to: 'Gili Air' }),
    ev('a4', 't1', 'Reef dive, turtles', 'Gili Air', '2024-07-06T08:00:00.000Z', 'p3', ['Manon']),
    // 2025 Thailand
    ev('c1', 't3', 'Flew to Phuket', 'Phuket', '2025-12-01T12:00:00.000Z', null, ['Manon']),
    ev('c2', 't3', 'Beach sunset, local food', 'Phuket', '2025-12-02T18:00:00.000Z', 'p4', ['Manon']),
    // 2026 Bali again (revisit), then inland to Ubud (a city)
    ev('b1', 't2', 'Back in Bali, beach day', 'Bali', '2026-07-01T11:00:00.000Z', 'p5', ['Manon']),
    ev('b2', 't2', 'Sunset and a dive', 'Bali', '2026-07-03T18:00:00.000Z', 'p6', ['Manon']),
    ev('b3', 't2', 'Rice terraces in Ubud', 'Ubud', '2026-07-05T10:00:00.000Z', 'p7', ['Manon']),
  ];
  return { events, trips };
}

test('world profile + lifetime statistics aggregate every place', () => {
  const { events, trips } = lifetime();
  const w = buildWorld(events, trips);

  assert.equal(w.statistics.totalCountries, 2); // Indonesia, Thailand
  assert.equal(w.statistics.totalIslands >= 2, true); // Bali, Gili Air, Phuket
  assert.equal(w.statistics.yearsTravelled, 3); // 2024, 2025, 2026
  assert.equal(w.statistics.totalJourneys, 3);
  assert.equal(w.statistics.continents, 1); // both Asia
  assert.ok(w.statistics.totalTransportLegs >= 1);

  assert.equal(w.profile.totalCountries, 2);
  assert.equal(w.profile.mostVisitedCountry, 'Indonesia');
  assert.ok(w.profile.span.from < w.profile.span.to);
});

test('visited countries expose visits, days, companions, season, confidence, heat', () => {
  const { events, trips } = lifetime();
  const w = buildWorld(events, trips);
  const indo = w.countries.find(c => c.name === 'Indonesia');
  assert.ok(indo);
  assert.ok(indo.firstVisit < indo.latestVisit);
  assert.ok(indo.visitCount >= 2);
  assert.ok(indo.totalDays > 0);
  assert.ok(indo.companions.some(c => c.name === 'Manon'));
  assert.ok(['Winter', 'Spring', 'Summer', 'Autumn'].includes(indo.favouriteSeason));
  assert.ok(['emerging', 'strong', 'defining'].includes(indo.confidence));
  assert.ok(typeof indo.highlightScore === 'number');
  assert.ok(indo.heat && typeof indo.heat.intensity === 'number' && typeof indo.heat.memoryDensity === 'number');
  assert.ok(Array.isArray(indo.favouriteMemories));
});

test('islands and cities are aggregated separately', () => {
  const { events, trips } = lifetime();
  const w = buildWorld(events, trips);
  assert.ok(w.islands.some(i => i.name === 'Bali'));
  assert.ok(w.islands.some(i => i.name === 'Gili Air'));
  assert.ok(w.cities.some(c => c.name === 'Ubud'));
});

test('travel eras summarise each year', () => {
  const { events, trips } = lifetime();
  const w = buildWorld(events, trips);
  assert.deepEqual(w.eras.map(e => e.year), [2024, 2025, 2026]);
  const y2024 = w.eras.find(e => e.year === 2024);
  assert.ok(y2024.countries.includes('Indonesia'));
  assert.ok(y2024.memoryCount >= 1);
  assert.equal(y2024.trips, 1);
});

test('world connections capture flights and ferries', () => {
  const { events, trips } = lifetime();
  const w = buildWorld(events, trips);
  assert.ok(w.connections.length >= 1);
  assert.ok(w.connections.some(c => c.kind === 'ferry')); // fast boat Bali↔Gili Air
  assert.ok(w.connections.every(c => c.from && c.to && typeof c.count === 'number'));
});

test('repeat visits, favourite returns and longest gaps reflect revisited Bali', () => {
  const { events, trips } = lifetime();
  const w = buildWorld(events, trips);
  const bali = w.repeatVisits.find(r => r.place === 'Bali');
  assert.ok(bali && bali.visitCount === 2);
  assert.ok(w.favouriteReturns.some(r => r.place === 'Bali'));
  const gap = w.longestGaps.find(g => g.place === 'Bali');
  assert.ok(gap && gap.gapDays > 300); // 2024 → 2026
});

test('heat values are normalised 0-100 for rendering', () => {
  const { events, trips } = lifetime();
  const w = buildWorld(events, trips);
  for (const key of ['countryIntensity', 'cityIntensity', 'islandIntensity', 'revisitIntensity', 'memoryDensity', 'emotionalSignificance', 'photographyDensity', 'activityDensity']) {
    assert.ok(Array.isArray(w.heat[key]), `${key} is an array`);
    assert.ok(w.heat[key].every(h => h.value >= 0 && h.value <= 100), `${key} normalised`);
  }
  // the strongest of a heat array hits 100
  assert.ok(w.heat.countryIntensity[0].value === 100);
});

test('filters support year, continent, country, companion, activity, season, favourites, first/latest', () => {
  const { events, trips } = lifetime();
  const w = buildWorld(events, trips);
  assert.ok(w.filters.byYear.some(y => y.year === 2024));
  assert.ok(w.filters.byContinent.some(c => c.continent === 'Asia'));
  assert.ok(w.filters.byCountry.some(c => c.country === 'Indonesia'));
  assert.ok(w.filters.byCompanion.some(c => c.companion === 'Manon'));
  assert.ok(w.filters.byActivity.some(a => a.activity === 'Dives'));
  assert.ok(w.filters.bySeason.some(s => s.season === 'Summer'));
  assert.ok(Array.isArray(w.filters.favourites));
  assert.ok(w.filters.firstVisits.length >= 1 && w.filters.latestVisits.length >= 1);
});

test('world is deterministic and leaks no backend terms or internals', () => {
  const { events, trips } = lifetime();
  const a = buildWorld(events, trips);
  const b = buildWorld(events, trips);
  assert.deepEqual(a, b);
  assertNoLeak(a);
});

test('an empty history yields a calm, valid world', () => {
  const w = buildWorld([], []);
  assert.deepEqual(w.countries, []);
  assert.equal(w.statistics.totalCountries, 0);
  assert.deepEqual(w.heat.countryIntensity, []);
});
