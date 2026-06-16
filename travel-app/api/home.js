// Travel App — Home Experience Engine (M40).
//
// The single deterministic model for the Travel Intelligence home screen. It
// ASSEMBLES the daily dashboard from existing engines (recommendations,
// navigation, world, on-this-day, collections, achievements, lifetime timeline)
// — it creates no new intelligence and duplicates no presentation logic.
//
// NO AI, NO generated prose, NO randomness, NO Date.now, NO networking. The
// reference date is an explicit argument (the caller passes "today") so the
// function is fully reproducible. Pure; deterministic; offline-first;
// presentation DTOs only; references only; no platform change; no backend leak.

import { buildRecommendations } from './recommendations.js';
import { buildNavigation } from './navigation.js';
import { buildWorld } from './world.js';
import { buildOnThisDay } from './on-this-day.js';
import { buildCollections } from './collections.js';
import { buildAchievements } from './achievements.js';
import { buildLifetimeTimeline } from './lifetime-timeline.js';

export const HOME_VERSION = '1.0.0';

const HOME_QUICK_ACTIONS = Object.freeze([
  { id: 'capture', label: 'Add memory', icon: 'plus', deepLink: 'travelapp://capture' },
  { id: 'timeline', label: 'Story', icon: 'book', deepLink: 'travelapp://experience/story' },
  { id: 'wrapped', label: 'Wrapped', icon: 'sparkles', deepLink: 'travelapp://experience/wrapped' },
  { id: 'collections', label: 'Collections', icon: 'grid', deepLink: 'travelapp://experience/collections' },
]);

const mediaOf = (entries) => (entries ?? []).map(e => e.photoRef).filter(Boolean);

/**
 * Build the deterministic Home dashboard model.
 * @param {Array} events
 * @param {Array} trips
 * @param {{ referenceDate?: string, current?: string }} [options]
 */
export function buildHome(events, trips = [], options = {}) {
  const referenceDate = options.referenceDate ?? '1970-01-01';
  const current = options.current ?? null;

  const world = buildWorld(events, trips);
  const hasMemories = (world.basedOn?.memories ?? 0) > 0;
  const nav = buildNavigation(events, trips, { current });

  // --- empty state ----------------------------------------------------------
  if (!hasMemories) {
    return {
      version: HOME_VERSION, referenceDate, hasMemories: false,
      hero: null, todaysRecommendation: null, continueJourney: null, onThisDay: null,
      recentMemories: [], favouriteCollections: [], currentAchievements: null,
      travelStatistics: { items: [] }, quickActions: HOME_QUICK_ACTIONS.filter(a => a.id === 'capture'),
      timelineSnapshot: null, destinationsOverview: null,
      navigationShortcuts: [],
      emptyState: { title: 'Welcome to Travel Intelligence', subtitle: 'Capture your first memory to begin your story', icon: 'compass', cta: { id: 'capture', label: 'Add a memory', deepLink: 'travelapp://capture' } },
      sectionOrder: ['quickActions'],
      meta: { generatedFrom: ['world', 'navigation'] }, basedOn: world.basedOn,
    };
  }

  const recs = buildRecommendations(events, trips, { referenceDate, current });
  const otd = buildOnThisDay(events, trips, referenceDate);
  const collections = buildCollections(events, trips);
  const ach = buildAchievements(events, trips);
  const lifetime = buildLifetimeTimeline(events, trips);

  const navNodeById = new Map(nav.graph.nodes.map(n => [n.id, n]));

  // --- hero (driven by the top recommendation) ------------------------------
  const topRec = recs.recommendations[0] ?? null;
  const heroNode = topRec ? navNodeById.get(topRec.targetExperience) : navNodeById.get(nav.defaultEntry);
  const hero = heroNode ? {
    experience: heroNode.id, title: heroNode.title, subtitle: heroNode.subtitle,
    accent: heroNode.accent, icon: heroNode.icon, deepLink: heroNode.deepLink,
    reasonCode: topRec?.reasonCode ?? null, priority: topRec?.priority ?? 'medium',
  } : null;

  // --- today's recommendation + more ----------------------------------------
  const todaysRecommendation = topRec;
  const moreRecommendations = recs.recommendations.slice(1);

  // --- continue journey -----------------------------------------------------
  const continueJourney = recs.continuation
    ? { ...recs.continuation, resume: true, nextDeepLink: recs.continuation.next ? `travelapp://experience/${recs.continuation.next}` : null }
    : { current: null, next: nav.defaultEntry, previous: null, resume: false, nextDeepLink: nav.defaultEntry ? `travelapp://experience/${nav.defaultEntry}` : null };

  // --- on this day (compact summary) ----------------------------------------
  const onThisDay = {
    available: otd.hasMemories, label: otd.label ?? null, count: otd.items.length,
    hero: otd.hero ? { id: otd.hero.id, title: otd.hero.title, yearsAgo: otd.hero.yearsAgo } : null,
    deepLink: 'travelapp://experience/on-this-day',
  };

  // --- recent memories (newest first, references only) ----------------------
  const recentMemories = [...lifetime.moments].slice(-6).reverse().map(m => ({
    id: m.id, title: m.title, date: m.date, kind: m.type, icon: m.iconId,
    place: m.relatedPlaces?.[0] ?? null, mediaRefs: mediaOf(m.supportingMemories),
  }));

  // --- favourite collections ------------------------------------------------
  const favouriteCollections = collections.collections.slice(0, 4).map(c => ({
    id: c.id, title: c.title, subtitle: c.subtitle, count: c.statistics.memories,
    cover: c.coverCandidate?.photoRef ?? null, icon: c.icon, deepLink: 'travelapp://experience/collections',
  }));

  // --- current achievements -------------------------------------------------
  const currentAchievements = {
    totalEarned: ach.summary.totalEarned, completion: ach.summary.completion, rarityScore: ach.summary.rarityScore,
    recent: [...ach.timeline].slice(-3).reverse().map(t => ({ id: t.achievementId, title: t.title, tier: t.tier, earnedDate: t.earnedDate })),
    deepLink: 'travelapp://achievements',
  };

  // --- travel statistics ----------------------------------------------------
  const s = world.statistics;
  const travelStatistics = {
    items: [
      { id: 'countries', label: 'Countries', value: s.totalCountries, icon: 'globe' },
      { id: 'islands', label: 'Islands', value: s.totalIslands, icon: 'island' },
      { id: 'cities', label: 'Cities', value: s.totalCities, icon: 'city' },
      { id: 'days', label: 'Days', value: s.totalDays, icon: 'calendar' },
      { id: 'journeys', label: 'Journeys', value: s.totalJourneys, icon: 'suitcase' },
      { id: 'flights', label: 'Flights', value: s.totalFlights, icon: 'airplane' },
      { id: 'photos', label: 'Photos', value: s.totalPhotos, icon: 'camera' },
      { id: 'memories', label: 'Memories', value: s.totalMemories, icon: 'sparkles' },
    ],
  };

  // --- timeline snapshot ----------------------------------------------------
  const timelineSnapshot = {
    span: lifetime.summary.span,
    years: lifetime.years.map(y => ({ year: y.year, memories: y.summary.memories, countries: y.summary.countries })),
  };

  // --- destinations overview ------------------------------------------------
  const topPlaces = [...world.islands, ...world.cities]
    .sort((a, b) => b.visitCount - a.visitCount || b.highlightScore - a.highlightScore || a.name.localeCompare(b.name))
    .slice(0, 6).map(l => ({ name: l.name, type: l.type, country: l.country, visitCount: l.visitCount }));
  const destinationsOverview = {
    totalCountries: s.totalCountries, totalIslands: s.totalIslands, totalCities: s.totalCities,
    mostVisitedCountry: world.profile.mostVisitedCountry, topPlaces,
  };

  // --- navigation shortcuts (available, recommended order) ------------------
  const navigationShortcuts = nav.availableSequence.map(id => {
    const n = navNodeById.get(id);
    return { id: n.id, title: n.title, icon: n.icon, accent: n.accent, deepLink: n.deepLink };
  });

  // --- deterministic section order (present sections only) -------------------
  const sectionPresence = {
    hero: !!hero,
    todaysRecommendation: !!todaysRecommendation,
    onThisDay: onThisDay.available,
    continueJourney: !!continueJourney,
    recentMemories: recentMemories.length > 0,
    favouriteCollections: favouriteCollections.length > 0,
    currentAchievements: currentAchievements.totalEarned > 0,
    travelStatistics: travelStatistics.items.length > 0,
    destinationsOverview: !!destinationsOverview,
    timelineSnapshot: !!timelineSnapshot,
    navigationShortcuts: navigationShortcuts.length > 0,
    quickActions: true,
  };
  const SECTION_SEQUENCE = ['hero', 'todaysRecommendation', 'onThisDay', 'continueJourney', 'recentMemories', 'favouriteCollections', 'currentAchievements', 'travelStatistics', 'destinationsOverview', 'timelineSnapshot', 'navigationShortcuts', 'quickActions'];
  const sectionOrder = SECTION_SEQUENCE.filter(id => sectionPresence[id]);

  return {
    version: HOME_VERSION, referenceDate, hasMemories: true,
    hero, todaysRecommendation, moreRecommendations, continueJourney, onThisDay,
    recentMemories, favouriteCollections, currentAchievements, travelStatistics,
    quickActions: HOME_QUICK_ACTIONS, timelineSnapshot, destinationsOverview, navigationShortcuts,
    emptyState: null, sectionOrder,
    meta: { generatedFrom: ['recommendations', 'navigation', 'world', 'on-this-day', 'collections', 'achievements', 'lifetime-timeline'] },
    basedOn: world.basedOn,
  };
}
