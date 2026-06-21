// Travel App — Traveller Highlights Engine (M47).
//
// Selects fixed-category travel highlights from existing presentation engines:
// insights, statistics, passport, profile, traveller timeline, collections,
// achievements, story composer and cinematic. This is NOT AI, NOT generated
// prose, and NOT recommendations. Titles and reason codes are fixed constants;
// values and references come from source DTOs. NO randomness, NO Date.now, NO
// networking. Pure; deterministic; offline-first; presentation DTOs only.

import { buildInsights } from './insights.js';
import { buildStatistics } from './statistics.js';
import { buildPassport } from './passport.js';
import { buildProfile } from './profile.js';
import { buildTravellerTimeline } from './traveller-timeline.js';
import { buildCollections } from './collections.js';
import { buildAchievements } from './achievements.js';
import { buildStoryComposer } from './story-composer.js';
import { buildCinematic } from './cinematic.js';
import { inclusiveDays } from './feed.js';

export const HIGHLIGHTS_VERSION = '1.0.0';

export const HIGHLIGHT_REASON_CODES = Object.freeze([
  'FIRST_TRIP',
  'LATEST_TRIP',
  'BIGGEST_TRIP',
  'LONGEST_TRIP',
  'TOP_ACHIEVEMENT',
  'MOST_MEANINGFUL_COLLECTION',
  'MOST_ACTIVE_YEAR',
  'FAVOURITE_DESTINATION',
  'MOST_REPEATED_PLACE',
  'STRONGEST_ACTIVITY_THEME',
  'COMPANION_HIGHLIGHT',
  'ISLAND_OCEAN_BEACH_HIGHLIGHT',
  'STORY_HERO_MOMENT',
  'CINEMATIC_HERO_SCENE',
]);

const META = {
  FIRST_TRIP: { id: 'first-trip', category: 'trip', title: 'First trip', icon: 'flag', accent: 'sky' },
  LATEST_TRIP: { id: 'latest-trip', category: 'trip', title: 'Latest trip', icon: 'suitcase', accent: 'sand' },
  BIGGEST_TRIP: { id: 'biggest-trip', category: 'trip', title: 'Biggest trip', icon: 'sparkles', accent: 'sunset' },
  LONGEST_TRIP: { id: 'longest-trip', category: 'trip', title: 'Longest trip', icon: 'calendar', accent: 'forest' },
  TOP_ACHIEVEMENT: { id: 'top-achievement', category: 'achievement', title: 'Top achievement', icon: 'trophy', accent: 'gold' },
  MOST_MEANINGFUL_COLLECTION: { id: 'most-meaningful-collection', category: 'memory', title: 'Most meaningful collection', icon: 'collection', accent: 'dusk' },
  MOST_ACTIVE_YEAR: { id: 'most-active-year', category: 'timeline', title: 'Most active year', icon: 'calendar', accent: 'sunset' },
  FAVOURITE_DESTINATION: { id: 'favourite-destination', category: 'place', title: 'Favourite destination', icon: 'heart', accent: 'forest' },
  MOST_REPEATED_PLACE: { id: 'most-repeated-place', category: 'place', title: 'Most repeated place', icon: 'repeat', accent: 'ocean' },
  STRONGEST_ACTIVITY_THEME: { id: 'strongest-activity-theme', category: 'activity', title: 'Strongest activity theme', icon: 'sparkles', accent: 'ocean' },
  COMPANION_HIGHLIGHT: { id: 'companion-highlight', category: 'relationship', title: 'Companion highlight', icon: 'people', accent: 'dusk' },
  ISLAND_OCEAN_BEACH_HIGHLIGHT: { id: 'island-ocean-beach-highlight', category: 'activity', title: 'Island, ocean and beach highlight', icon: 'island', accent: 'ocean' },
  STORY_HERO_MOMENT: { id: 'story-hero-moment', category: 'story', title: 'Story hero moment', icon: 'book', accent: 'sand' },
  CINEMATIC_HERO_SCENE: { id: 'cinematic-hero-scene', category: 'cinematic', title: 'Cinematic hero scene', icon: 'film', accent: 'slate' },
};

function highlight(reasonCode, value, source, refs = {}, rank = 0) {
  if (value === null || value === undefined || value === '') return null;
  const meta = META[reasonCode];
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
      tripIds: refs.tripIds ?? [],
      metricIds: refs.metricIds ?? [],
      insightIds: refs.insightIds ?? [],
      stampIds: refs.stampIds ?? [],
      entryIds: refs.entryIds ?? [],
      collectionIds: refs.collectionIds ?? [],
      achievementIds: refs.achievementIds ?? [],
      storyMomentIds: refs.storyMomentIds ?? [],
      sceneIds: refs.sceneIds ?? [],
      companionRefs: refs.companionRefs ?? [],
      mapRefs: refs.mapRefs ?? [],
      mediaRefs: refs.mediaRefs ?? [],
    },
  };
}

function insightByReason(insights, reasonCode) {
  return insights.cards.find(card => card.reasonCode === reasonCode) ?? null;
}

function tripTitle(trip) {
  return trip?.tripName ?? trip?.destination ?? trip?.tripId ?? null;
}

function biggestTrip(events, trips) {
  const counts = new Map();
  for (const ev of events) {
    if (!ev.tripId) continue;
    const hasMemory = !!(ev.metadata?.note || ev.metadata?.photoRef);
    if (!hasMemory) continue;
    counts.set(ev.tripId, (counts.get(ev.tripId) ?? 0) + 1);
  }
  return [...trips]
    .map(trip => ({ trip, count: counts.get(trip.tripId) ?? 0 }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count || String(a.trip.startDate).localeCompare(String(b.trip.startDate)) || String(a.trip.tripId).localeCompare(String(b.trip.tripId)))[0] ?? null;
}

function longestTrip(trips) {
  return [...trips]
    .map(trip => ({ trip, days: inclusiveDays(trip.startDate, trip.endDate) ?? 0 }))
    .filter(item => item.days > 0)
    .sort((a, b) => b.days - a.days || String(a.trip.startDate).localeCompare(String(b.trip.startDate)) || String(a.trip.tripId).localeCompare(String(b.trip.tripId)))[0] ?? null;
}

export function buildHighlights(events, trips = [], options = {}) {
  const referenceDate = options.referenceDate ?? '1970-01-01';
  const insights = buildInsights(events, trips, { referenceDate });
  const statistics = buildStatistics(events, trips, { referenceDate });
  const passport = buildPassport(events, trips, { referenceDate });
  const profile = buildProfile(events, trips, { referenceDate });
  const travellerTimeline = buildTravellerTimeline(events, trips);
  const collections = buildCollections(events, trips);
  const achievements = buildAchievements(events, trips);
  const story = buildStoryComposer(events, trips);
  const cinematic = buildCinematic(events, trips);

  const cards = [];
  const push = card => { if (card) cards.push(card); };

  const firstTrip = statistics.milestones.firstTrip;
  push(highlight('FIRST_TRIP', firstTrip?.title ?? null, 'statistics.milestones.firstTrip', { tripIds: firstTrip ? [firstTrip.id] : [] }, 0));

  const latestTrip = statistics.milestones.latestTrip;
  push(highlight('LATEST_TRIP', latestTrip?.title ?? null, 'statistics.milestones.latestTrip', { tripIds: latestTrip ? [latestTrip.id] : [] }, 1));

  const biggest = biggestTrip(events, trips);
  push(highlight('BIGGEST_TRIP', tripTitle(biggest?.trip), 'events.tripId.memoryCount', { tripIds: biggest?.trip ? [biggest.trip.tripId] : [], metricIds: ['memoriesCaptured'] }, 2));

  const longest = longestTrip(trips);
  push(highlight('LONGEST_TRIP', tripTitle(longest?.trip), 'trips.duration', { tripIds: longest?.trip ? [longest.trip.tripId] : [], metricIds: ['nightsTravelled'] }, 3));

  const topAchievement = profile.achievementSummary?.top?.[0] ?? null;
  push(highlight('TOP_ACHIEVEMENT', topAchievement?.title ?? null, 'profile.achievementSummary.top[0]', { achievementIds: topAchievement ? [topAchievement.id] : [] }, 4));

  const collection = collections.collections[0] ?? null;
  push(highlight('MOST_MEANINGFUL_COLLECTION', collection?.title ?? null, 'collections.collections[0]', { collectionIds: collection ? [collection.id] : [], mediaRefs: collection?.mediaRefs?.slice(0, 3) ?? [] }, 5));

  const activeYear = insightByReason(insights, 'MOST_ACTIVE_TRAVEL_YEAR');
  push(highlight('MOST_ACTIVE_YEAR', activeYear?.value ?? null, 'insights.MOST_ACTIVE_TRAVEL_YEAR', { insightIds: activeYear ? [activeYear.id] : [], entryIds: activeYear?.refs.entryIds ?? [] }, 6));

  push(highlight('FAVOURITE_DESTINATION', profile.identity?.favouritePlace ?? null, 'profile.identity.favouritePlace', { mapRefs: profile.hero?.mapRef ? [profile.hero.mapRef] : [] }, 7));

  const repeated = insightByReason(insights, 'MOST_REPEATED_DESTINATION');
  push(highlight('MOST_REPEATED_PLACE', repeated?.value ?? null, 'insights.MOST_REPEATED_DESTINATION', { insightIds: repeated ? [repeated.id] : [], stampIds: repeated?.refs.stampIds ?? [], mapRefs: repeated?.refs.mapRefs ?? [] }, 8));

  const activity = insightByReason(insights, 'FAVOURITE_ACTIVITY');
  push(highlight('STRONGEST_ACTIVITY_THEME', activity?.value ?? null, 'insights.FAVOURITE_ACTIVITY', { insightIds: activity ? [activity.id] : [], metricIds: activity?.refs.metricIds ?? [] }, 9));

  const companion = insightByReason(insights, 'COMPANION_BASED_INSIGHT');
  push(highlight('COMPANION_HIGHLIGHT', companion?.value ?? null, 'insights.COMPANION_BASED_INSIGHT', { insightIds: companion ? [companion.id] : [], companionRefs: companion?.refs.companionRefs ?? [] }, 10));

  const ocean = insightByReason(insights, 'OCEAN_ISLAND_BEACH_TENDENCY');
  push(highlight('ISLAND_OCEAN_BEACH_HIGHLIGHT', ocean?.value ?? null, 'insights.OCEAN_ISLAND_BEACH_TENDENCY', { insightIds: ocean ? [ocean.id] : [], metricIds: ocean?.refs.metricIds ?? [] }, 11));

  push(highlight('STORY_HERO_MOMENT', story.hero?.title ?? null, 'story.hero', { storyMomentIds: story.hero ? [story.hero.id] : [], mediaRefs: passport.references.media.slice(0, 3) }, 12));

  const heroScene = cinematic.scenes.find(scene => scene.id === cinematic.heroScene) ?? null;
  push(highlight('CINEMATIC_HERO_SCENE', heroScene?.title ?? null, 'cinematic.heroScene', { sceneIds: heroScene ? [heroScene.id] : [], mediaRefs: heroScene?.mediaRefs ?? [] }, 13));

  cards.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  const empty = cards.length === 0;

  return {
    version: HIGHLIGHTS_VERSION,
    referenceDate,
    hasHighlights: !empty,
    cards,
    categories: [...new Set(cards.map(card => card.category))].map(id => ({ id, count: cards.filter(card => card.category === id).length })),
    reasonCodes: HIGHLIGHT_REASON_CODES,
    sourceSummaries: {
      insights: { hasInsights: insights.hasInsights, cards: insights.cards.length },
      statistics: { hasStatistics: statistics.hasStatistics, metrics: statistics.metrics.length },
      passport: { hasPassport: passport.hasPassport, stamps: passport.stamps.length },
      profile: { hasProfile: profile.hasProfile },
      travellerTimeline: { total: travellerTimeline.statistics.total, years: travellerTimeline.byYear.length },
      collections: { total: collections.summary.total },
      achievements: { totalEarned: achievements.summary.totalEarned },
      story: { chapterCount: story.story.chapterCount, momentCount: story.story.momentCount },
      cinematic: { scenes: cinematic.statistics.scenes, hasHero: cinematic.statistics.hasHero },
    },
    actions: [
      { id: 'open-insights', label: 'Open insights', deepLink: 'travelapp://insights', icon: 'sparkles' },
      { id: 'open-statistics', label: 'Open statistics', deepLink: 'travelapp://statistics', icon: 'bar-chart' },
      { id: 'open-story', label: 'Open story', deepLink: 'travelapp://experience/story', icon: 'book' },
    ],
    emptyState: empty
      ? { title: 'Your travel highlights', subtitle: 'Capture memories to unlock deterministic highlights', icon: 'star', cta: { id: 'capture', label: 'Add a memory', deepLink: 'travelapp://capture' } }
      : null,
    meta: { generatedFrom: ['insights', 'statistics', 'passport', 'profile', 'traveller-timeline', 'collections', 'achievements', 'story-composer', 'cinematic'] },
    basedOn: travellerTimeline.basedOn,
  };
}
