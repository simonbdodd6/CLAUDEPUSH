import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHome } from '../home.js';

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

test('assembles the full home dashboard from existing engines', () => {
  const { events, trips } = lifetime();
  const home = buildHome(events, trips, { referenceDate: '2027-07-12' });

  assert.equal(home.hasMemories, true);
  assert.ok(home.hero && home.hero.experience);
  assert.ok(home.todaysRecommendation);
  assert.ok(home.onThisDay.available); // 12 July matches
  assert.ok(home.recentMemories.length >= 1);
  assert.ok(home.favouriteCollections.length >= 1);
  assert.ok(home.currentAchievements.totalEarned > 0);
  assert.ok(home.travelStatistics.items.length === 8);
  assert.equal(home.quickActions.length, 4);
  assert.ok(home.timelineSnapshot.years.length >= 1);
  assert.ok(home.destinationsOverview.topPlaces.length >= 1);
  assert.ok(home.navigationShortcuts.length >= 1);
  assert.equal(home.emptyState, null);
});

test('hero is driven by the top recommendation', () => {
  const { events, trips } = lifetime();
  const home = buildHome(events, trips, { referenceDate: '2027-07-12' });
  // 12 July has matches → On This Day leads
  assert.equal(home.hero.experience, 'on-this-day');
  assert.equal(home.hero.reasonCode, 'ON_THIS_DAY_MATCH');
  assert.equal(home.todaysRecommendation.targetExperience, 'on-this-day');
});

test('section order is deterministic and lists only present sections', () => {
  const { events, trips } = lifetime();
  const home = buildHome(events, trips, { referenceDate: '2027-07-12' });
  // a known prefix when On This Day matches
  assert.equal(home.sectionOrder[0], 'hero');
  assert.equal(home.sectionOrder[1], 'todaysRecommendation');
  assert.equal(home.sectionOrder[2], 'onThisDay');
  assert.ok(home.sectionOrder.includes('quickActions'));
  // every listed section actually has content
  const present = {
    hero: !!home.hero, todaysRecommendation: !!home.todaysRecommendation, onThisDay: home.onThisDay.available,
    continueJourney: !!home.continueJourney, recentMemories: home.recentMemories.length > 0,
    favouriteCollections: home.favouriteCollections.length > 0, currentAchievements: home.currentAchievements.totalEarned > 0,
    travelStatistics: home.travelStatistics.items.length > 0, destinationsOverview: !!home.destinationsOverview,
    timelineSnapshot: !!home.timelineSnapshot, navigationShortcuts: home.navigationShortcuts.length > 0, quickActions: true,
  };
  assert.ok(home.sectionOrder.every(id => present[id]));
});

test('On This Day section drops out when the date has no matches', () => {
  const { events, trips } = lifetime();
  const home = buildHome(events, trips, { referenceDate: '2027-03-03' });
  assert.equal(home.onThisDay.available, false);
  assert.ok(!home.sectionOrder.includes('onThisDay'));
  assert.notEqual(home.hero.experience, 'on-this-day'); // hero is something else now
});

test('continue journey reflects the current experience when supplied', () => {
  const { events, trips } = lifetime();
  const home = buildHome(events, trips, { referenceDate: '2027-03-03', current: 'wrapped' });
  assert.equal(home.continueJourney.current, 'wrapped');
  assert.equal(home.continueJourney.next, 'story');
  assert.equal(home.continueJourney.resume, true);
  assert.equal(home.continueJourney.nextDeepLink, 'travelapp://experience/story');
});

test('recent memories are newest-first, references only', () => {
  const { events, trips } = lifetime();
  const home = buildHome(events, trips, { referenceDate: '2027-07-12' });
  for (let i = 1; i < home.recentMemories.length; i += 1) assert.ok(home.recentMemories[i - 1].date >= home.recentMemories[i].date);
  assert.ok(home.recentMemories.every(m => m.mediaRefs.every(r => typeof r === 'string')));
});

test('destinations overview surfaces top places', () => {
  const { events, trips } = lifetime();
  const home = buildHome(events, trips, { referenceDate: '2027-07-12' });
  assert.equal(home.destinationsOverview.mostVisitedCountry, 'Indonesia');
  assert.ok(home.destinationsOverview.topPlaces.every(p => p.name && p.type));
});

test('empty history returns a welcome empty-state with only a capture action', () => {
  const home = buildHome([], [], { referenceDate: '2027-07-12' });
  assert.equal(home.hasMemories, false);
  assert.equal(home.hero, null);
  assert.ok(home.emptyState && home.emptyState.cta.id === 'capture');
  assert.equal(home.quickActions.length, 1);
  assert.equal(home.quickActions[0].id, 'capture');
  assert.deepEqual(home.sectionOrder, ['quickActions']);
});

test('deterministic and leaks no backend terms', () => {
  const { events, trips } = lifetime();
  const a = buildHome(events, trips, { referenceDate: '2027-07-12', current: 'wrapped' });
  const b = buildHome(events, trips, { referenceDate: '2027-07-12', current: 'wrapped' });
  assert.deepEqual(a, b);
  assertNoLeak(a);
});
