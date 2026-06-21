import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHighlights, HIGHLIGHT_REASON_CODES } from '../highlights.js';
import { buildInsights } from '../insights.js';
import { buildStatistics } from '../statistics.js';
import { buildProfile } from '../profile.js';
import { buildCollections } from '../collections.js';
import { buildStoryComposer } from '../story-composer.js';
import { buildCinematic } from '../cinematic.js';

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

const byReason = (highlights, code) => highlights.cards.find(card => card.reasonCode === code);

test('assembles fixed traveller highlight cards from existing engines', () => {
  const { events, trips } = lifetime();
  const highlights = buildHighlights(events, trips, { referenceDate: '2027-07-12' });

  assert.equal(highlights.hasHighlights, true);
  assert.ok(highlights.cards.length >= 12);
  assert.deepEqual(highlights.reasonCodes, HIGHLIGHT_REASON_CODES);
  assert.equal(highlights.emptyState, null);
  assert.deepEqual(highlights.meta.generatedFrom, ['insights', 'statistics', 'passport', 'profile', 'traveller-timeline', 'collections', 'achievements', 'story-composer', 'cinematic']);
});

test('cards use fixed titles, fixed reason codes, and presentation refs only', () => {
  const { events, trips } = lifetime();
  const highlights = buildHighlights(events, trips, { referenceDate: '2027-07-12' });
  const allowed = new Set(HIGHLIGHT_REASON_CODES);
  const titleByCode = Object.fromEntries(highlights.cards.map(card => [card.reasonCode, card.title]));

  assert.equal(titleByCode.FIRST_TRIP, 'First trip');
  assert.equal(titleByCode.LATEST_TRIP, 'Latest trip');
  assert.equal(titleByCode.TOP_ACHIEVEMENT, 'Top achievement');
  assert.equal(titleByCode.MOST_MEANINGFUL_COLLECTION, 'Most meaningful collection');
  assert.equal(titleByCode.CINEMATIC_HERO_SCENE, 'Cinematic hero scene');
  assert.ok(highlights.cards.every(card => allowed.has(card.reasonCode)));
  for (const card of highlights.cards) {
    assert.ok(card.id && card.title && card.category && card.icon && card.accent && card.source);
    assert.equal(typeof card.rank, 'number');
    assert.ok(card.refs && Array.isArray(card.refs.tripIds) && Array.isArray(card.refs.mediaRefs));
  }
});

test('highlight values mirror composed source engines', () => {
  const { events, trips } = lifetime();
  const highlights = buildHighlights(events, trips, { referenceDate: '2027-07-12' });
  const insights = buildInsights(events, trips, { referenceDate: '2027-07-12' });
  const statistics = buildStatistics(events, trips, { referenceDate: '2027-07-12' });
  const profile = buildProfile(events, trips, { referenceDate: '2027-07-12' });
  const collections = buildCollections(events, trips);
  const story = buildStoryComposer(events, trips);
  const cinematic = buildCinematic(events, trips);
  const insight = code => insights.cards.find(card => card.reasonCode === code);
  const heroScene = cinematic.scenes.find(scene => scene.id === cinematic.heroScene);

  assert.equal(byReason(highlights, 'FIRST_TRIP').value, statistics.milestones.firstTrip.title);
  assert.equal(byReason(highlights, 'LATEST_TRIP').value, statistics.milestones.latestTrip.title);
  assert.equal(byReason(highlights, 'BIGGEST_TRIP').value, 'Bali 2024');
  assert.equal(byReason(highlights, 'LONGEST_TRIP').value, 'Bali 2024');
  assert.equal(byReason(highlights, 'TOP_ACHIEVEMENT').value, profile.achievementSummary.top[0].title);
  assert.equal(byReason(highlights, 'MOST_MEANINGFUL_COLLECTION').value, collections.collections[0].title);
  assert.equal(byReason(highlights, 'MOST_ACTIVE_YEAR').value, insight('MOST_ACTIVE_TRAVEL_YEAR').value);
  assert.equal(byReason(highlights, 'FAVOURITE_DESTINATION').value, profile.identity.favouritePlace);
  assert.equal(byReason(highlights, 'MOST_REPEATED_PLACE').value, insight('MOST_REPEATED_DESTINATION').value);
  assert.equal(byReason(highlights, 'STRONGEST_ACTIVITY_THEME').value, insight('FAVOURITE_ACTIVITY').value);
  assert.equal(byReason(highlights, 'COMPANION_HIGHLIGHT').value, insight('COMPANION_BASED_INSIGHT').value);
  assert.equal(byReason(highlights, 'ISLAND_OCEAN_BEACH_HIGHLIGHT').value, insight('OCEAN_ISLAND_BEACH_TENDENCY').value);
  assert.equal(byReason(highlights, 'STORY_HERO_MOMENT').value, story.hero.title);
  assert.equal(byReason(highlights, 'CINEMATIC_HERO_SCENE').value, heroScene.title);
});

test('cards are ordered deterministically by rank', () => {
  const { events, trips } = lifetime();
  const highlights = buildHighlights(events, trips, { referenceDate: '2027-07-12' });

  for (let i = 1; i < highlights.cards.length; i += 1) assert.ok(highlights.cards[i].rank > highlights.cards[i - 1].rank);
  assert.equal(highlights.cards[0].reasonCode, 'FIRST_TRIP');
});

test('source summaries cover every reused engine', () => {
  const { events, trips } = lifetime();
  const highlights = buildHighlights(events, trips, { referenceDate: '2027-07-12' });

  assert.equal(highlights.sourceSummaries.insights.hasInsights, true);
  assert.equal(highlights.sourceSummaries.statistics.hasStatistics, true);
  assert.equal(highlights.sourceSummaries.passport.hasPassport, true);
  assert.equal(highlights.sourceSummaries.profile.hasProfile, true);
  assert.ok(highlights.sourceSummaries.travellerTimeline.total >= highlights.cards.length);
  assert.ok(highlights.sourceSummaries.collections.total >= 1);
  assert.ok(highlights.sourceSummaries.achievements.totalEarned >= 1);
  assert.ok(highlights.sourceSummaries.story.momentCount >= 1);
  assert.equal(highlights.sourceSummaries.cinematic.hasHero, true);
});

test('empty history returns a highlights empty state', () => {
  const highlights = buildHighlights([], [], { referenceDate: '2027-07-12' });

  assert.equal(highlights.hasHighlights, false);
  assert.deepEqual(highlights.cards, []);
  assert.deepEqual(highlights.categories, []);
  assert.ok(highlights.emptyState && highlights.emptyState.cta.id === 'capture');
  assert.equal(highlights.sourceSummaries.travellerTimeline.total, 0);
});

test('deterministic and leaks no backend terms', () => {
  const { events, trips } = lifetime();
  const a = buildHighlights(events, trips, { referenceDate: '2027-07-12' });
  const b = buildHighlights(events, trips, { referenceDate: '2027-07-12' });

  assert.deepEqual(a, b);
  assertNoLeak(a);
});
