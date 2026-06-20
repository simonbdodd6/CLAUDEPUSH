import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatistics } from '../statistics.js';
import { buildProfile } from '../profile.js';
import { buildPassport } from '../passport.js';
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

const metric = (stats, id) => stats.metrics.find(item => item.id === id);

test('assembles a complete traveller statistics DTO from existing engines', () => {
  const { events, trips } = lifetime();
  const stats = buildStatistics(events, trips, { referenceDate: '2027-07-12' });

  assert.equal(stats.hasStatistics, true);
  assert.equal(stats.headline.length, 4);
  assert.ok(stats.metrics.length >= 12);
  assert.ok(stats.groups.length >= 5);
  assert.ok(stats.milestones.firstTrip && stats.milestones.latestTrip);
  assert.equal(stats.emptyState, null);
  assert.deepEqual(stats.meta.generatedFrom, ['profile', 'passport', 'traveller-timeline', 'collections', 'achievements']);
});

test('core geography, journey, memory and progress metrics are present', () => {
  const { events, trips } = lifetime();
  const stats = buildStatistics(events, trips, { referenceDate: '2027-07-12' });

  for (const id of [
    'countriesVisited', 'citiesVisited', 'islandsVisited', 'dives', 'flights',
    'ferries', 'nightsTravelled', 'tripsCompleted', 'memoriesCaptured',
    'achievementsUnlocked', 'collectionsCompleted', 'timelineEntries',
  ]) {
    const m = metric(stats, id);
    assert.ok(m, `${id} missing`);
    assert.equal(m.unit, 'count');
    assert.ok(m.label && m.icon && m.group && m.source);
    assert.equal(typeof m.value, 'number');
  }
});

test('statistics mirror composed source engines', () => {
  const { events, trips } = lifetime();
  const stats = buildStatistics(events, trips, { referenceDate: '2027-07-12' });
  const profile = buildProfile(events, trips, { referenceDate: '2027-07-12' });
  const passport = buildPassport(events, trips, { referenceDate: '2027-07-12' });
  const timeline = buildTravellerTimeline(events, trips);
  const collections = buildCollections(events, trips);
  const achievements = buildAchievements(events, trips);
  const profileStat = id => profile.statistics.items.find(item => item.id === id).value;
  const seriesCurrent = id => achievements.achievements.find(a => a.seriesId === id).progress.current;

  assert.equal(metric(stats, 'countriesVisited').value, passport.credentials.countries);
  assert.equal(metric(stats, 'citiesVisited').value, passport.credentials.cities);
  assert.equal(metric(stats, 'islandsVisited').value, passport.credentials.islands);
  assert.equal(metric(stats, 'dives').value, seriesCurrent('diving'));
  assert.equal(metric(stats, 'flights').value, seriesCurrent('flights'));
  assert.equal(metric(stats, 'ferries').value, seriesCurrent('ferries'));
  assert.equal(metric(stats, 'tripsCompleted').value, profileStat('journeys'));
  assert.equal(metric(stats, 'memoriesCaptured').value, passport.credentials.memories);
  assert.equal(metric(stats, 'achievementsUnlocked').value, achievements.summary.totalEarned);
  assert.equal(metric(stats, 'collectionsCompleted').value, collections.summary.total);
  assert.equal(metric(stats, 'timelineEntries').value, timeline.statistics.total);
  assert.equal(metric(stats, 'nightsTravelled').value, Math.max(0, passport.credentials.travelDays - profileStat('journeys')));
});

test('groups contain only existing metric ids in deterministic order', () => {
  const { events, trips } = lifetime();
  const stats = buildStatistics(events, trips, { referenceDate: '2027-07-12' });
  const metricIds = new Set(stats.metrics.map(item => item.id));

  assert.deepEqual(stats.groups.map(group => group.id), ['geography', 'activity', 'journeys', 'memory', 'progress']);
  for (const group of stats.groups) {
    assert.ok(group.title && group.icon);
    assert.ok(group.metricIds.length >= 1);
    assert.ok(group.metricIds.every(id => metricIds.has(id)));
  }
});

test('first and latest trip milestones are deterministic from trip dates', () => {
  const { events, trips } = lifetime();
  const stats = buildStatistics(events, trips, { referenceDate: '2027-07-12' });

  assert.equal(stats.milestones.firstTrip.id, 't1');
  assert.equal(stats.milestones.firstTrip.title, 'Bali 2024');
  assert.equal(stats.milestones.latestTrip.id, 't2');
  assert.equal(stats.milestones.latestTrip.title, 'Bali 2026');
  assert.ok(stats.milestones.firstTimelineEntry.date <= stats.milestones.latestTimelineEntry.date);
});

test('source summaries and highlights are presentation-only snapshots', () => {
  const { events, trips } = lifetime();
  const stats = buildStatistics(events, trips, { referenceDate: '2027-07-12' });

  assert.equal(stats.sourceSummaries.profile.hasProfile, true);
  assert.equal(stats.sourceSummaries.passport.hasPassport, true);
  assert.equal(stats.sourceSummaries.travellerTimeline.total, metric(stats, 'timelineEntries').value);
  assert.equal(stats.sourceSummaries.achievements.totalEarned, metric(stats, 'achievementsUnlocked').value);
  assert.equal(stats.sourceSummaries.collections.total, metric(stats, 'collectionsCompleted').value);
  assert.ok(stats.highlights.topCollections.every(c => c.id && c.title && typeof c.count === 'number'));
  assert.ok(stats.highlights.topAchievements.every(a => a.id && a.title && a.tier));
  assert.ok(stats.highlights.timelineYears.every(y => y.year && y.count));
});

test('references and actions are ids and deep links only', () => {
  const { events, trips } = lifetime();
  const stats = buildStatistics(events, trips, { referenceDate: '2027-07-12' });

  assert.ok(stats.references.media.every(ref => typeof ref === 'string'));
  assert.ok(stats.references.map.every(ref => typeof ref.place === 'string' && typeof ref.isIsland === 'boolean'));
  assert.ok(stats.references.achievements.every(ref => typeof ref.id === 'string'));
  assert.deepEqual(stats.actions.map(action => action.id), ['open-passport', 'open-profile', 'open-timeline']);
  assert.ok(stats.actions.every(action => action.deepLink.startsWith('travelapp://')));
});

test('empty history returns zeroed statistics with a capture CTA', () => {
  const stats = buildStatistics([], [], { referenceDate: '2027-07-12' });

  assert.equal(stats.hasStatistics, false);
  assert.ok(stats.metrics.every(m => m.value === 0));
  assert.equal(stats.milestones.firstTrip, null);
  assert.equal(stats.milestones.latestTrip, null);
  assert.ok(stats.emptyState && stats.emptyState.cta.id === 'capture');
  assert.equal(stats.sourceSummaries.travellerTimeline.total, 0);
});

test('deterministic and leaks no backend terms', () => {
  const { events, trips } = lifetime();
  const a = buildStatistics(events, trips, { referenceDate: '2027-07-12' });
  const b = buildStatistics(events, trips, { referenceDate: '2027-07-12' });

  assert.deepEqual(a, b);
  assertNoLeak(a);
});
