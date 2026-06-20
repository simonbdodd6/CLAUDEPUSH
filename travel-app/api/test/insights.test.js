import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInsights, INSIGHT_REASON_CODES } from '../insights.js';
import { buildStatistics } from '../statistics.js';
import { buildPassport } from '../passport.js';
import { buildProfile } from '../profile.js';
import { buildTravellerTimeline } from '../traveller-timeline.js';
import { buildCollections } from '../collections.js';
import { buildAchievements } from '../achievements.js';

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

const byReason = (insights, code) => insights.cards.find(card => card.reasonCode === code);

test('assembles fixed-category insight cards from existing engines', () => {
  const { events, trips } = lifetime();
  const insights = buildInsights(events, trips, { referenceDate: '2027-07-12' });

  assert.equal(insights.hasInsights, true);
  assert.ok(insights.cards.length >= 8);
  assert.deepEqual(insights.reasonCodes, INSIGHT_REASON_CODES);
  assert.equal(insights.emptyState, null);
  assert.deepEqual(insights.meta.generatedFrom, ['statistics', 'passport', 'profile', 'traveller-timeline', 'collections', 'achievements', 'relationships']);
});

test('cards use fixed titles, fixed reason codes, and presentation refs only', () => {
  const { events, trips } = lifetime();
  const insights = buildInsights(events, trips, { referenceDate: '2027-07-12' });
  const allowed = new Set(INSIGHT_REASON_CODES);
  const titleByCode = Object.fromEntries(insights.cards.map(card => [card.reasonCode, card.title]));

  assert.equal(titleByCode.MOST_VISITED_COUNTRY, 'Most visited country');
  assert.equal(titleByCode.MOST_ACTIVE_TRAVEL_YEAR, 'Most active travel year');
  assert.equal(titleByCode.FAVOURITE_ACTIVITY, 'Favourite activity');
  assert.equal(titleByCode.STRONGEST_TRAVEL_STYLE, 'Strongest travel style');
  assert.equal(titleByCode.BIGGEST_COLLECTION, 'Biggest collection');
  assert.ok(insights.cards.every(card => allowed.has(card.reasonCode)));
  for (const card of insights.cards) {
    assert.ok(card.id && card.title && card.category && card.icon && card.accent && card.source);
    assert.equal(typeof card.rank, 'number');
    assert.ok(card.refs && Array.isArray(card.refs.metricIds) && Array.isArray(card.refs.mediaRefs));
  }
});

test('insight values mirror composed source engines', () => {
  const { events, trips } = lifetime();
  const insights = buildInsights(events, trips, { referenceDate: '2027-07-12' });
  const statistics = buildStatistics(events, trips, { referenceDate: '2027-07-12' });
  const passport = buildPassport(events, trips, { referenceDate: '2027-07-12' });
  const profile = buildProfile(events, trips, { referenceDate: '2027-07-12' });
  const timeline = buildTravellerTimeline(events, trips);
  const collections = buildCollections(events, trips);
  const achievements = buildAchievements(events, trips);
  const metric = id => statistics.metrics.find(item => item.id === id).value;

  assert.equal(byReason(insights, 'MOST_VISITED_COUNTRY').value, profile.identity.mostVisitedCountry);
  const topYear = [...timeline.byYear].sort((a, b) => b.count - a.count || a.year - b.year)[0];
  assert.equal(byReason(insights, 'MOST_ACTIVE_TRAVEL_YEAR').value, String(topYear.year));
  assert.equal(byReason(insights, 'BIGGEST_COLLECTION').value, collections.collections[0].title);
  assert.equal(byReason(insights, 'LONGEST_TRAVEL_STREAK').value, metric('nightsTravelled'));
  const latestAchievement = [...achievements.timeline].sort((a, b) => b.earnedDate.localeCompare(a.earnedDate) || a.achievementId.localeCompare(b.achievementId))[0];
  assert.equal(byReason(insights, 'LATEST_ACHIEVEMENT').value, latestAchievement.title);
  assert.equal(byReason(insights, 'COMPANION_BASED_INSIGHT').value, 'Manon');
  assert.equal(byReason(insights, 'OCEAN_ISLAND_BEACH_TENDENCY').value, metric('islandsVisited') + metric('ferries') + metric('dives'));
  assert.ok(passport.stamps.length > 0);
});

test('cards are ordered deterministically by rank', () => {
  const { events, trips } = lifetime();
  const insights = buildInsights(events, trips, { referenceDate: '2027-07-12' });

  for (let i = 1; i < insights.cards.length; i += 1) assert.ok(insights.cards[i].rank > insights.cards[i - 1].rank);
  assert.equal(insights.cards[0].reasonCode, 'MOST_VISITED_COUNTRY');
});

test('categories and source summaries are stable snapshots', () => {
  const { events, trips } = lifetime();
  const insights = buildInsights(events, trips, { referenceDate: '2027-07-12' });
  const cardCategories = new Set(insights.cards.map(card => card.category));

  assert.ok(insights.categories.every(c => cardCategories.has(c.id) && c.count >= 1));
  assert.equal(insights.sourceSummaries.statistics.hasStatistics, true);
  assert.equal(insights.sourceSummaries.passport.hasPassport, true);
  assert.equal(insights.sourceSummaries.profile.hasProfile, true);
  assert.ok(insights.sourceSummaries.travellerTimeline.total >= insights.cards.length);
  assert.ok(insights.sourceSummaries.collections.total >= 1);
  assert.ok(insights.sourceSummaries.achievements.totalEarned >= 1);
  assert.ok(insights.sourceSummaries.relationships.sharedMemories >= 1);
});

test('empty history returns an insights empty state', () => {
  const insights = buildInsights([], [], { referenceDate: '2027-07-12' });

  assert.equal(insights.hasInsights, false);
  assert.deepEqual(insights.cards, []);
  assert.deepEqual(insights.categories, []);
  assert.ok(insights.emptyState && insights.emptyState.cta.id === 'capture');
  assert.equal(insights.sourceSummaries.travellerTimeline.total, 0);
});

test('deterministic and leaks no backend terms', () => {
  const { events, trips } = lifetime();
  const a = buildInsights(events, trips, { referenceDate: '2027-07-12' });
  const b = buildInsights(events, trips, { referenceDate: '2027-07-12' });

  assert.deepEqual(a, b);
  assertNoLeak(a);
});
