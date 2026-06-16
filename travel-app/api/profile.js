// Travel App — Traveller Profile Engine (M42).
//
// One canonical traveller profile assembled ENTIRELY from existing engines — it
// calculates no new intelligence, it composes existing outputs into a single
// unified, serialisable profile. NO AI, NO generated prose, NO randomness, NO
// Date.now, NO networking. Reference date is explicit (defaults to today by the
// caller). Pure; deterministic; offline-first; presentation DTOs only; references
// only; no platform change; no backend leak.

import { buildWorld } from './world.js';
import { buildTravelDna } from './travel-dna.js';
import { buildAchievements } from './achievements.js';
import { buildCollections } from './collections.js';
import { buildStoryComposer } from './story-composer.js';
import { buildCinematic } from './cinematic.js';
import { buildTravelWrapped } from './travel-wrapped.js';
import { buildRecommendations } from './recommendations.js';
import { buildNavigation } from './navigation.js';
import { buildLifetimeTimeline } from './lifetime-timeline.js';

export const PROFILE_VERSION = '1.0.0';

const slug = (s) => String(s).toLowerCase().replace(/\s+/g, '-');
const mediaOf = (entries) => (entries ?? []).map(e => e.photoRef).filter(Boolean);

export function buildProfile(events, trips = [], options = {}) {
  const referenceDate = options.referenceDate ?? '1970-01-01';
  const world = buildWorld(events, trips);
  const hasMemories = (world.basedOn?.memories ?? 0) > 0;
  const nav = buildNavigation(events, trips, {});
  const navNodeById = new Map(nav.graph.nodes.map(n => [n.id, n]));
  const deepLinks = nav.availableSequence.map(id => ({ experience: id, title: navNodeById.get(id)?.title, deepLink: navNodeById.get(id)?.deepLink }));

  if (!hasMemories) {
    return {
      version: PROFILE_VERSION, referenceDate, hasProfile: false,
      identity: null, hero: null, travelDna: null, lifetimeStatistics: world.statistics,
      favouriteCountries: [], favouriteCities: [], favouriteIslands: [], favouriteCompanions: [],
      favouriteActivities: [], favouriteTransport: [], favouriteCollections: [],
      achievementSummary: null, storyHighlights: null, cinematicHighlights: null, wrappedHighlights: null,
      currentRecommendations: [], recentMemories: [], timelineSummary: null,
      mediaReferences: [], mapReferences: [], achievementReferences: [],
      statistics: { items: [] }, deepLinks,
      emptyState: { title: 'Your traveller profile', subtitle: 'Capture memories to build your profile', icon: 'compass', cta: { id: 'capture', label: 'Add a memory', deepLink: 'travelapp://capture' } },
      meta: { generatedFrom: ['world', 'navigation'] }, basedOn: world.basedOn,
    };
  }

  const dna = buildTravelDna(events, trips);
  const ach = buildAchievements(events, trips);
  const collections = buildCollections(events, trips);
  const story = buildStoryComposer(events, trips);
  const cinematic = buildCinematic(events, trips);
  const wrapped = buildTravelWrapped(events, trips);
  const recs = buildRecommendations(events, trips, { referenceDate });
  const lifetime = buildLifetimeTimeline(events, trips);

  // --- identity + hero ------------------------------------------------------
  const identity = {
    since: world.profile.span?.from ?? null, latest: world.profile.span?.to ?? null, span: world.profile.span,
    mostVisitedCountry: world.profile.mostVisitedCountry, favouritePlace: world.profile.favouritePlace,
    signature: dna.headline?.statement ?? null,
  };
  const recentPhotoMoment = [...lifetime.moments].reverse().find(m => mediaOf(m.supportingMemories).length);
  const topTrait = dna.traits[0] ?? null;
  const hero = {
    title: world.profile.favouritePlace ?? world.profile.mostVisitedCountry ?? 'Your travels',
    subtitle: dna.headline?.statement ?? null,
    accent: topTrait?.accent ?? 'sky', icon: topTrait?.icon ?? 'sparkles',
    mediaRef: recentPhotoMoment ? mediaOf(recentPhotoMoment.supportingMemories)[0] : null,
    mapRef: world.profile.favouritePlace ? { place: world.profile.favouritePlace } : null,
  };

  // --- favourites (reused engine outputs) -----------------------------------
  const favouriteCountries = world.countries.slice(0, 5).map(c => ({ name: c.name, visitCount: c.visitCount, deepLink: `travelapp://collection/country-${slug(c.name)}` }));
  const favouriteCities = world.cities.slice(0, 5).map(c => ({ name: c.name, country: c.country, visitCount: c.visitCount }));
  const favouriteIslands = world.islands.slice(0, 5).map(i => ({ name: i.name, country: i.country, visitCount: i.visitCount }));

  const companionTotals = new Map();
  for (const loc of [...world.countries, ...world.islands, ...world.cities]) for (const co of loc.companions) companionTotals.set(co.name, (companionTotals.get(co.name) ?? 0) + co.count);
  const favouriteCompanions = [...companionTotals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5)
    .map(([name, count]) => ({ name, sharedMemories: count, deepLink: `travelapp://collection/with-${slug(name)}` }));

  const favouriteActivities = collections.collections.filter(c => c.type === 'activity').slice(0, 5).map(c => ({ id: c.id, title: c.title, count: c.statistics.memories }));
  const favouriteTransport = collections.collections.filter(c => c.type === 'transport').slice(0, 5).map(c => ({ id: c.id, title: c.title, count: c.statistics.memories }));
  const favouriteCollections = collections.collections.slice(0, 5).map(c => ({ id: c.id, title: c.title, subtitle: c.subtitle, count: c.statistics.memories, cover: c.coverCandidate?.photoRef ?? null, deepLink: `travelapp://collection/${c.id}` }));

  // --- highlights -----------------------------------------------------------
  const topBadges = [...ach.achievements].filter(a => a.earned).sort((a, b) => b.rarityScore - a.rarityScore || a.id.localeCompare(b.id)).slice(0, 5).map(a => ({ id: a.id, title: a.title, tier: a.tier }));
  const achievementSummary = { totalEarned: ach.summary.totalEarned, completion: ach.summary.completion, rarityScore: ach.summary.rarityScore, top: topBadges, deepLink: 'travelapp://achievements' };

  const storyHero = story.hero ? { id: story.hero.id, title: story.hero.title, date: story.hero.date } : null;
  const storyHighlights = { hero: storyHero, chapterCount: story.story.chapterCount, chapters: story.chapters.slice(0, 3).map(c => ({ id: c.id, title: c.title })), deepLink: 'travelapp://experience/story' };

  const cinematicHero = cinematic.scenes.find(s => s.id === cinematic.heroScene) ?? null;
  const cinematicHighlights = { hero: cinematicHero ? { id: cinematicHero.id, title: cinematicHero.title, type: cinematicHero.type } : null, sceneCount: cinematic.statistics.scenes, deepLink: 'travelapp://experience/cinematic' };

  const wrappedHighlights = { statement: wrapped.headline.statement, favouriteDestination: wrapped.highlights.favouriteDestination, mostActiveYear: wrapped.highlights.mostActiveYear, topBadges: wrapped.achievements.topBadges.slice(0, 3), deepLink: 'travelapp://experience/wrapped' };

  // --- current recommendations + recent memories ----------------------------
  const currentRecommendations = recs.recommendations.slice(0, 3);
  const recentMemories = [...lifetime.moments].slice(-6).reverse().map(m => ({ id: m.id, title: m.title, date: m.date, kind: m.type, place: m.relatedPlaces?.[0] ?? null, mediaRefs: mediaOf(m.supportingMemories) }));

  // --- timeline summary -----------------------------------------------------
  const timelineSummary = { span: lifetime.summary.span, momentCount: lifetime.summary.totalMoments, years: lifetime.years.map(y => ({ year: y.year, memories: y.summary.memories })) };

  // --- statistics (display) -------------------------------------------------
  const s = world.statistics;
  const statistics = { items: [
    { id: 'countries', label: 'Countries', value: s.totalCountries, icon: 'globe' },
    { id: 'islands', label: 'Islands', value: s.totalIslands, icon: 'island' },
    { id: 'cities', label: 'Cities', value: s.totalCities, icon: 'city' },
    { id: 'days', label: 'Days', value: s.totalDays, icon: 'calendar' },
    { id: 'journeys', label: 'Journeys', value: s.totalJourneys, icon: 'suitcase' },
    { id: 'flights', label: 'Flights', value: s.totalFlights, icon: 'airplane' },
    { id: 'photos', label: 'Photos', value: s.totalPhotos, icon: 'camera' },
    { id: 'memories', label: 'Memories', value: s.totalMemories, icon: 'sparkles' },
  ] };

  // --- reference sets -------------------------------------------------------
  const mediaReferences = [...new Set([...(hero.mediaRef ? [hero.mediaRef] : []), ...recentMemories.flatMap(m => m.mediaRefs), ...favouriteCollections.map(c => c.cover).filter(Boolean)])];
  const mapReferences = [...new Set([...favouriteCountries.map(c => c.name), ...favouriteIslands.map(i => i.name), ...favouriteCities.map(c => c.name)])].map(place => ({ place, isIsland: world.islands.some(i => i.name === place) }));
  const achievementReferences = topBadges.map(b => ({ id: b.id, tier: b.tier }));

  return {
    version: PROFILE_VERSION, referenceDate, hasProfile: true,
    identity, hero, travelDna: { headline: dna.headline?.statement ?? null, topTraits: dna.traits.slice(0, 5).map(t => ({ id: t.id, label: t.label, statement: t.statement, score: t.score })) },
    lifetimeStatistics: world.statistics,
    favouriteCountries, favouriteCities, favouriteIslands, favouriteCompanions, favouriteActivities, favouriteTransport, favouriteCollections,
    achievementSummary, storyHighlights, cinematicHighlights, wrappedHighlights,
    currentRecommendations, recentMemories, timelineSummary,
    mediaReferences, mapReferences, achievementReferences,
    statistics, deepLinks, emptyState: null,
    meta: { generatedFrom: ['world', 'travel-dna', 'achievements', 'collections', 'story-composer', 'cinematic', 'travel-wrapped', 'recommendations', 'navigation', 'lifetime-timeline'] },
    basedOn: world.basedOn,
  };
}
