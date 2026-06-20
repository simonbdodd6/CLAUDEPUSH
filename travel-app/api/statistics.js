// Travel App — Traveller Statistics Engine (M45).
//
// A deterministic statistics presentation layer over existing engines only:
// traveller profile, traveller passport, traveller timeline, collections and
// achievements. It adds no new intelligence and no detectors; it reshapes source
// outputs into metric cards, grouped sections and milestones. NO AI, NO
// generated prose, NO randomness, NO Date.now, NO networking. Pure;
// offline-first; presentation DTOs only; references only; no platform change.

import { buildProfile } from './profile.js';
import { buildPassport } from './passport.js';
import { buildTravellerTimeline } from './traveller-timeline.js';
import { buildCollections } from './collections.js';
import { buildAchievements } from './achievements.js';

export const STATISTICS_VERSION = '1.0.0';

const GROUP_ORDER = ['geography', 'activity', 'journeys', 'memory', 'progress'];

const GROUP_META = {
  geography: { title: 'Geography', icon: 'globe' },
  activity: { title: 'Activity', icon: 'sparkles' },
  journeys: { title: 'Journeys', icon: 'route' },
  memory: { title: 'Memory', icon: 'camera' },
  progress: { title: 'Progress', icon: 'trophy' },
};

const METRIC_META = {
  countriesVisited: { label: 'Countries visited', icon: 'globe', group: 'geography', source: 'profile.statistics.countries' },
  citiesVisited: { label: 'Cities visited', icon: 'city', group: 'geography', source: 'profile.statistics.cities' },
  islandsVisited: { label: 'Islands visited', icon: 'island', group: 'geography', source: 'profile.statistics.islands' },
  dives: { label: 'Dives', icon: 'dive', group: 'activity', source: 'achievements.series.diving' },
  flights: { label: 'Flights', icon: 'airplane', group: 'journeys', source: 'achievements.series.flights' },
  ferries: { label: 'Ferries', icon: 'ferry', group: 'journeys', source: 'achievements.series.ferries' },
  nightsTravelled: { label: 'Nights travelled', icon: 'moon', group: 'journeys', source: 'profile.statistics.days-journeys' },
  tripsCompleted: { label: 'Trips completed', icon: 'suitcase', group: 'journeys', source: 'profile.statistics.journeys' },
  memoriesCaptured: { label: 'Memories captured', icon: 'sparkles', group: 'memory', source: 'profile.statistics.memories' },
  achievementsUnlocked: { label: 'Achievements unlocked', icon: 'trophy', group: 'progress', source: 'achievements.summary.totalEarned' },
  collectionsCompleted: { label: 'Collections completed', icon: 'collection', group: 'progress', source: 'collections.summary.total' },
  timelineEntries: { label: 'Timeline entries', icon: 'timeline', group: 'memory', source: 'traveller-timeline.statistics.total' },
};

function metric(id, value) {
  const meta = METRIC_META[id];
  return {
    id,
    label: meta.label,
    value,
    unit: 'count',
    icon: meta.icon,
    group: meta.group,
    source: meta.source,
  };
}

function profileStat(profile, id) {
  return profile.statistics.items.find(item => item.id === id)?.value ?? 0;
}

function achievementCurrent(achievements, seriesId) {
  return achievements.achievements.find(a => a.seriesId === seriesId)?.progress.current ?? 0;
}

function tripSummary(trip) {
  if (!trip) return null;
  return {
    id: trip.tripId,
    title: trip.tripName ?? trip.destination ?? trip.tripId,
    destination: trip.destination ?? null,
    country: trip.country ?? null,
    startDate: trip.startDate ?? null,
    endDate: trip.endDate ?? null,
  };
}

function orderedTrips(trips) {
  return [...trips]
    .filter(trip => trip.startDate)
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)) || String(a.tripId).localeCompare(String(b.tripId)));
}

export function buildStatistics(events, trips = [], options = {}) {
  const referenceDate = options.referenceDate ?? '1970-01-01';
  const profile = buildProfile(events, trips, { referenceDate });
  const passport = buildPassport(events, trips, { referenceDate });
  const travellerTimeline = buildTravellerTimeline(events, trips);
  const collections = buildCollections(events, trips);
  const achievements = buildAchievements(events, trips);

  const travelDays = passport.credentials.travelDays ?? profileStat(profile, 'days');
  const tripsCompleted = profileStat(profile, 'journeys');
  const metrics = [
    metric('countriesVisited', passport.credentials.countries ?? profileStat(profile, 'countries')),
    metric('citiesVisited', passport.credentials.cities ?? profileStat(profile, 'cities')),
    metric('islandsVisited', passport.credentials.islands ?? profileStat(profile, 'islands')),
    metric('dives', achievementCurrent(achievements, 'diving')),
    metric('flights', achievementCurrent(achievements, 'flights')),
    metric('ferries', achievementCurrent(achievements, 'ferries')),
    metric('nightsTravelled', Math.max(0, travelDays - tripsCompleted)),
    metric('tripsCompleted', tripsCompleted),
    metric('memoriesCaptured', passport.credentials.memories ?? profileStat(profile, 'memories')),
    metric('achievementsUnlocked', achievements.summary.totalEarned),
    metric('collectionsCompleted', collections.summary.total),
    metric('timelineEntries', travellerTimeline.statistics.total),
  ];

  const metricById = Object.fromEntries(metrics.map(item => [item.id, item]));
  const groups = GROUP_ORDER.map(id => ({
    id,
    title: GROUP_META[id].title,
    icon: GROUP_META[id].icon,
    metricIds: metrics.filter(item => item.group === id).map(item => item.id),
  })).filter(group => group.metricIds.length);

  const tripsByDate = orderedTrips(trips);
  const firstTrip = tripSummary(tripsByDate[0] ?? null);
  const latestTrip = tripSummary(tripsByDate[tripsByDate.length - 1] ?? null);

  const headline = [
    metricById.countriesVisited,
    metricById.memoriesCaptured,
    metricById.tripsCompleted,
    metricById.achievementsUnlocked,
  ];

  const topCollections = collections.collections.slice(0, 5).map(collection => ({
    id: collection.id,
    title: collection.title,
    type: collection.type,
    count: collection.statistics.memories,
  }));
  const topAchievements = achievements.earned.slice(0, 5).map(achievement => ({
    id: achievement,
    title: achievements.achievements.find(item => item.id === achievement)?.title ?? achievement,
    tier: achievements.achievements.find(item => item.id === achievement)?.tier ?? null,
    earnedDate: achievements.achievements.find(item => item.id === achievement)?.earnedDate ?? null,
  }));

  const empty = !profile.hasProfile && metrics.every(item => item.value === 0);
  return {
    version: STATISTICS_VERSION,
    referenceDate,
    hasStatistics: !empty,
    headline,
    metrics,
    groups,
    milestones: {
      firstTrip,
      latestTrip,
      firstTimelineEntry: travellerTimeline.entries[0]
        ? { id: travellerTimeline.entries[0].id, title: travellerTimeline.entries[0].title, date: travellerTimeline.entries[0].date }
        : null,
      latestTimelineEntry: travellerTimeline.entries[travellerTimeline.entries.length - 1]
        ? { id: travellerTimeline.entries[travellerTimeline.entries.length - 1].id, title: travellerTimeline.entries[travellerTimeline.entries.length - 1].title, date: travellerTimeline.entries[travellerTimeline.entries.length - 1].date }
        : null,
    },
    sourceSummaries: {
      profile: { hasProfile: profile.hasProfile, statistics: profile.statistics },
      passport: { hasPassport: passport.hasPassport, credentials: passport.credentials },
      travellerTimeline: { total: travellerTimeline.statistics.total, byType: travellerTimeline.statistics.byType, byYear: travellerTimeline.byYear },
      achievements: { totalEarned: achievements.summary.totalEarned, completion: achievements.summary.completion },
      collections: { total: collections.summary.total, byType: collections.summary.byType },
    },
    highlights: {
      topCollections,
      topAchievements,
      timelineYears: travellerTimeline.byYear.map(year => ({ year: year.year, count: year.count })),
    },
    references: {
      media: passport.references.media,
      map: passport.references.map,
      achievements: passport.references.achievements,
    },
    actions: [
      { id: 'open-passport', label: 'Open passport', deepLink: 'travelapp://passport', icon: 'passport' },
      { id: 'open-profile', label: 'Open profile', deepLink: 'travelapp://profile', icon: 'person' },
      { id: 'open-timeline', label: 'Open timeline', deepLink: 'travelapp://traveller-timeline', icon: 'timeline' },
    ],
    emptyState: empty
      ? { title: 'Your travel statistics', subtitle: 'Capture memories to start building your statistics', icon: 'bar-chart', cta: { id: 'capture', label: 'Add a memory', deepLink: 'travelapp://capture' } }
      : null,
    meta: { generatedFrom: ['profile', 'passport', 'traveller-timeline', 'collections', 'achievements'] },
    basedOn: travellerTimeline.basedOn,
  };
}
