// Travel App — Traveller Insights Engine (M46).
//
// Fixed-category insight cards composed from existing engines only: statistics,
// passport, profile, traveller timeline, collections, achievements and
// relationships. This is NOT AI, NOT generated prose, and NOT recommendation
// logic. Titles and reason codes are fixed constants; values and references come
// from source DTOs. NO randomness, NO Date.now, NO networking. Pure;
// deterministic; offline-first; presentation DTOs only.

import { buildStatistics } from './statistics.js';
import { buildPassport } from './passport.js';
import { buildProfile } from './profile.js';
import { buildTravellerTimeline } from './traveller-timeline.js';
import { buildCollections } from './collections.js';
import { buildAchievements } from './achievements.js';
import { buildRelationships } from './relationships.js';

export const INSIGHTS_VERSION = '1.0.0';

export const INSIGHT_REASON_CODES = Object.freeze([
  'MOST_VISITED_COUNTRY',
  'MOST_ACTIVE_TRAVEL_YEAR',
  'FAVOURITE_ACTIVITY',
  'STRONGEST_TRAVEL_STYLE',
  'BIGGEST_COLLECTION',
  'LONGEST_TRAVEL_STREAK',
  'MOST_REPEATED_DESTINATION',
  'FIRST_MAJOR_MILESTONE',
  'LATEST_ACHIEVEMENT',
  'OCEAN_ISLAND_BEACH_TENDENCY',
  'COMPANION_BASED_INSIGHT',
]);

const FIXED_META = {
  MOST_VISITED_COUNTRY: { id: 'most-visited-country', category: 'geography', title: 'Most visited country', icon: 'globe', accent: 'sky' },
  MOST_ACTIVE_TRAVEL_YEAR: { id: 'most-active-travel-year', category: 'timeline', title: 'Most active travel year', icon: 'calendar', accent: 'sunset' },
  FAVOURITE_ACTIVITY: { id: 'favourite-activity', category: 'activity', title: 'Favourite activity', icon: 'sparkles', accent: 'ocean' },
  STRONGEST_TRAVEL_STYLE: { id: 'strongest-travel-style', category: 'identity', title: 'Strongest travel style', icon: 'dna', accent: 'forest' },
  BIGGEST_COLLECTION: { id: 'biggest-collection', category: 'memory', title: 'Biggest collection', icon: 'collection', accent: 'sand' },
  LONGEST_TRAVEL_STREAK: { id: 'longest-travel-streak', category: 'journey', title: 'Longest travel streak', icon: 'flame', accent: 'dusk' },
  MOST_REPEATED_DESTINATION: { id: 'most-repeated-destination', category: 'geography', title: 'Most repeated destination', icon: 'repeat', accent: 'forest' },
  FIRST_MAJOR_MILESTONE: { id: 'first-major-milestone', category: 'milestone', title: 'First major milestone', icon: 'flag', accent: 'sky' },
  LATEST_ACHIEVEMENT: { id: 'latest-achievement', category: 'achievement', title: 'Latest achievement', icon: 'trophy', accent: 'gold' },
  OCEAN_ISLAND_BEACH_TENDENCY: { id: 'ocean-island-beach-tendency', category: 'activity', title: 'Ocean, island and beach tendency', icon: 'island', accent: 'ocean' },
  COMPANION_BASED_INSIGHT: { id: 'companion-based-insight', category: 'relationship', title: 'Companion-based insight', icon: 'people', accent: 'dusk' },
};

function card(reasonCode, value, source, refs = {}, rank = 0) {
  if (value === null || value === undefined || value === '') return null;
  const meta = FIXED_META[reasonCode];
  return {
    id: meta.id,
    rank,
    category: meta.category,
    title: meta.title,
    reasonCode,
    value,
    icon: meta.icon,
    accent: meta.accent,
    source,
    refs: {
      metricIds: refs.metricIds ?? [],
      stampIds: refs.stampIds ?? [],
      entryIds: refs.entryIds ?? [],
      collectionIds: refs.collectionIds ?? [],
      achievementIds: refs.achievementIds ?? [],
      companionRefs: refs.companionRefs ?? [],
      mapRefs: refs.mapRefs ?? [],
      mediaRefs: refs.mediaRefs ?? [],
    },
  };
}

function metricValue(statistics, id) {
  return statistics.metrics.find(item => item.id === id)?.value ?? 0;
}

function strongestActivity(statistics) {
  const candidates = [
    { value: metricValue(statistics, 'dives'), label: 'Diving', metricId: 'dives' },
    { value: metricValue(statistics, 'ferries'), label: 'Ferry travel', metricId: 'ferries' },
    { value: metricValue(statistics, 'flights'), label: 'Flying', metricId: 'flights' },
  ];
  return candidates.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))[0];
}

function activeYear(travellerTimeline) {
  return [...travellerTimeline.byYear].sort((a, b) => b.count - a.count || a.year - b.year)[0] ?? null;
}

function latestAchievement(achievements) {
  return [...achievements.timeline].sort((a, b) => b.earnedDate.localeCompare(a.earnedDate) || a.achievementId.localeCompare(b.achievementId))[0] ?? null;
}

function firstMilestone(travellerTimeline) {
  return travellerTimeline.entries.find(entry => ['trip', 'country', 'island', 'city', 'achievement', 'milestone'].includes(entry.type)) ?? null;
}

function repeatedDestination(passport) {
  const counts = new Map();
  for (const stamp of passport.stamps) {
    for (const place of stamp.locationRefs) counts.set(place, (counts.get(place) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null;
}

export function buildInsights(events, trips = [], options = {}) {
  const referenceDate = options.referenceDate ?? '1970-01-01';
  const statistics = buildStatistics(events, trips, { referenceDate });
  const passport = buildPassport(events, trips, { referenceDate });
  const profile = buildProfile(events, trips, { referenceDate });
  const travellerTimeline = buildTravellerTimeline(events, trips);
  const collections = buildCollections(events, trips);
  const achievements = buildAchievements(events, trips);
  const relationships = buildRelationships(events, trips);

  const cards = [];
  const push = c => { if (c) cards.push(c); };
  const mapRefsFor = name => (name ? passport.references.map.filter(ref => ref.place === name) : []);

  push(card(
    'MOST_VISITED_COUNTRY',
    profile.identity?.mostVisitedCountry ?? null,
    'profile.identity.mostVisitedCountry',
    { metricIds: ['countriesVisited'], mapRefs: mapRefsFor(profile.identity?.mostVisitedCountry) },
    0,
  ));

  const year = activeYear(travellerTimeline);
  push(card(
    'MOST_ACTIVE_TRAVEL_YEAR',
    year ? String(year.year) : null,
    'traveller-timeline.byYear',
    { entryIds: year?.entryIds ?? [] },
    1,
  ));

  const activity = strongestActivity(statistics);
  push(card(
    'FAVOURITE_ACTIVITY',
    activity.value > 0 ? activity.label : null,
    'statistics.metrics.activity',
    { metricIds: [activity.metricId] },
    2,
  ));

  push(card(
    'STRONGEST_TRAVEL_STYLE',
    profile.travelDna?.topTraits?.[0]?.label ?? null,
    'profile.travelDna.topTraits',
    {},
    3,
  ));

  const biggestCollection = collections.collections[0] ?? null;
  push(card(
    'BIGGEST_COLLECTION',
    biggestCollection?.title ?? null,
    'collections.collections[0]',
    { collectionIds: biggestCollection ? [biggestCollection.id] : [], mediaRefs: biggestCollection?.mediaRefs?.slice(0, 3) ?? [] },
    4,
  ));

  push(card(
    'LONGEST_TRAVEL_STREAK',
    metricValue(statistics, 'nightsTravelled') > 0 ? metricValue(statistics, 'nightsTravelled') : null,
    'statistics.metrics.nightsTravelled',
    { metricIds: ['nightsTravelled'] },
    5,
  ));

  const repeated = repeatedDestination(passport);
  push(card(
    'MOST_REPEATED_DESTINATION',
    repeated ? repeated[0] : null,
    'passport.stamps.locationRefs',
    { mapRefs: mapRefsFor(repeated?.[0]), stampIds: passport.stamps.filter(stamp => stamp.locationRefs.includes(repeated?.[0])).map(stamp => stamp.id) },
    6,
  ));

  const first = firstMilestone(travellerTimeline);
  push(card(
    'FIRST_MAJOR_MILESTONE',
    first?.title ?? null,
    'traveller-timeline.entries',
    { entryIds: first ? [first.id] : [], achievementIds: first?.achievementRefs ?? [] },
    7,
  ));

  const latest = latestAchievement(achievements);
  push(card(
    'LATEST_ACHIEVEMENT',
    latest?.title ?? null,
    'achievements.timeline',
    { achievementIds: latest ? [latest.achievementId] : [] },
    8,
  ));

  const oceanScore = metricValue(statistics, 'islandsVisited') + metricValue(statistics, 'ferries') + metricValue(statistics, 'dives');
  push(card(
    'OCEAN_ISLAND_BEACH_TENDENCY',
    oceanScore > 0 ? oceanScore : null,
    'statistics.metrics.islandsVisited+ferries+dives',
    { metricIds: ['islandsVisited', 'ferries', 'dives'] },
    9,
  ));

  push(card(
    'COMPANION_BASED_INSIGHT',
    relationships.mostTravelledWith?.name ?? null,
    'relationships.mostTravelledWith',
    { companionRefs: relationships.mostTravelledWith ? [relationships.mostTravelledWith.name] : [] },
    10,
  ));

  cards.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  const empty = cards.length === 0;
  return {
    version: INSIGHTS_VERSION,
    referenceDate,
    hasInsights: !empty,
    cards,
    categories: [...new Set(cards.map(c => c.category))].map(id => ({ id, count: cards.filter(c => c.category === id).length })),
    reasonCodes: INSIGHT_REASON_CODES,
    sourceSummaries: {
      statistics: { hasStatistics: statistics.hasStatistics, metrics: statistics.metrics.map(m => ({ id: m.id, value: m.value })) },
      passport: { hasPassport: passport.hasPassport, stamps: passport.stamps.length },
      profile: { hasProfile: profile.hasProfile },
      travellerTimeline: { total: travellerTimeline.statistics.total, years: travellerTimeline.byYear.length },
      collections: { total: collections.summary.total },
      achievements: { totalEarned: achievements.summary.totalEarned },
      relationships: relationships.basedOn,
    },
    actions: [
      { id: 'open-statistics', label: 'Open statistics', deepLink: 'travelapp://statistics', icon: 'bar-chart' },
      { id: 'open-passport', label: 'Open passport', deepLink: 'travelapp://passport', icon: 'passport' },
      { id: 'open-timeline', label: 'Open timeline', deepLink: 'travelapp://traveller-timeline', icon: 'timeline' },
    ],
    emptyState: empty
      ? { title: 'Your travel insights', subtitle: 'Capture memories to unlock deterministic insight cards', icon: 'sparkles', cta: { id: 'capture', label: 'Add a memory', deepLink: 'travelapp://capture' } }
      : null,
    meta: { generatedFrom: ['statistics', 'passport', 'profile', 'traveller-timeline', 'collections', 'achievements', 'relationships'] },
    basedOn: travellerTimeline.basedOn,
  };
}
