import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile } from '../profile.js';

const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'metadata', 'eventType', 'travellerIdentityId'];
function assertNoLeak(obj) {
  const seen = JSON.stringify(obj);
  for (const k of FORBIDDEN_KEYS) assert.ok(!seen.includes(`"${k}"`), `must not expose "${k}"`);
}

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
    ev('a1', 't1', 'Landed in Bali, fast boat, first scuba dive', 'Gili Air', '2024-07-12T09:00:00.000Z', 'p1', ['Manon'], { type: 'fast boat', from: 'Bali', to: 'Gili Air' }),
    ev('a2', 't1', 'Echo Beach sunset', 'Bali', '2024-07-12T18:00:00.000Z', 'p2', ['Manon']),
    ev('a3', 't1', 'Reef dive, turtles', 'Gili Air', '2024-07-13T08:00:00.000Z', 'p3', ['Manon']),
    ev('c1', 't3', 'Flew to Phuket, local food', 'Phuket', '2025-12-01T12:00:00.000Z', 'p4', ['Manon']),
    ev('b1', 't2', 'Back in Bali, sunset dive', 'Bali', '2026-07-12T18:00:00.000Z', 'p5', ['Manon']),
  ];
  return { events, trips };
}

test('assembles a complete canonical profile from existing engines', () => {
  const { events, trips } = lifetime();
  const p = buildProfile(events, trips, { referenceDate: '2027-07-12' });

  assert.equal(p.hasProfile, true);
  assert.ok(p.identity && p.identity.mostVisitedCountry === 'Indonesia');
  assert.ok(p.hero && p.hero.title);
  assert.ok(p.travelDna && p.travelDna.topTraits.length >= 1);
  assert.ok(p.lifetimeStatistics && p.lifetimeStatistics.totalCountries === 2);
  assert.ok(p.favouriteCountries.length >= 1);
  assert.ok(p.favouriteIslands.length >= 1);
  assert.ok(p.favouriteCompanions.some(c => c.name === 'Manon'));
  assert.ok(p.achievementSummary && p.achievementSummary.totalEarned > 0);
  assert.ok(p.storyHighlights && p.cinematicHighlights && p.wrappedHighlights);
  assert.ok(Array.isArray(p.currentRecommendations));
  assert.ok(p.recentMemories.length >= 1);
  assert.ok(p.timelineSummary && p.timelineSummary.years.length >= 1);
  assert.equal(p.statistics.items.length, 8);
  assert.ok(p.deepLinks.length >= 1);
});

test('favourites reuse engine outputs (countries, companions, collections)', () => {
  const { events, trips } = lifetime();
  const p = buildProfile(events, trips, { referenceDate: '2027-07-12' });
  assert.equal(p.favouriteCountries[0].name, 'Indonesia');
  assert.ok(p.favouriteCountries[0].deepLink.startsWith('travelapp://collection/country-'));
  assert.ok(p.favouriteCompanions[0].name === 'Manon' && p.favouriteCompanions[0].sharedMemories >= 1);
  assert.ok(p.favouriteCollections.length >= 1 && p.favouriteCollections.every(c => c.deepLink.startsWith('travelapp://collection/')));
});

test('reference sets are references only (media / map / achievement)', () => {
  const { events, trips } = lifetime();
  const p = buildProfile(events, trips, { referenceDate: '2027-07-12' });
  assert.ok(p.mediaReferences.every(r => typeof r === 'string'));
  assert.ok(p.mapReferences.every(r => typeof r.place === 'string' && typeof r.isIsland === 'boolean'));
  assert.ok(p.achievementReferences.every(r => typeof r.id === 'string'));
  assert.ok(p.mapReferences.some(r => r.place === 'Bali' && r.isIsland === true));
});

test('highlights point at the right experiences via deep links', () => {
  const { events, trips } = lifetime();
  const p = buildProfile(events, trips, { referenceDate: '2027-07-12' });
  assert.equal(p.storyHighlights.deepLink, 'travelapp://experience/story');
  assert.equal(p.cinematicHighlights.deepLink, 'travelapp://experience/cinematic');
  assert.equal(p.wrappedHighlights.deepLink, 'travelapp://experience/wrapped');
  assert.equal(p.achievementSummary.deepLink, 'travelapp://achievements');
});

test('deterministic and leaks no backend terms', () => {
  const { events, trips } = lifetime();
  const a = buildProfile(events, trips, { referenceDate: '2027-07-12' });
  const b = buildProfile(events, trips, { referenceDate: '2027-07-12' });
  assert.deepEqual(a, b);
  assertNoLeak(a);
});

test('empty history returns a profile empty-state with a capture CTA', () => {
  const p = buildProfile([], [], { referenceDate: '2027-07-12' });
  assert.equal(p.hasProfile, false);
  assert.equal(p.identity, null);
  assert.equal(p.hero, null);
  assert.deepEqual(p.favouriteCountries, []);
  assert.ok(p.emptyState && p.emptyState.cta.id === 'capture');
  assert.ok(p.deepLinks.length === 0 || p.deepLinks.every(d => d.deepLink));
});

test('travel DNA + statistics are composed, not recomputed (match sources)', () => {
  const { events, trips } = lifetime();
  const p = buildProfile(events, trips, { referenceDate: '2027-07-12' });
  // statistics mirror the world engine
  const byId = Object.fromEntries(p.statistics.items.map(i => [i.id, i.value]));
  assert.equal(byId.countries, p.lifetimeStatistics.totalCountries);
  assert.equal(byId.memories, p.lifetimeStatistics.totalMemories);
  // DNA headline present
  assert.ok(typeof p.travelDna.headline === 'string' || p.travelDna.headline === null);
});
