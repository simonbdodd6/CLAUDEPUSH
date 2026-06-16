// Travel App — Travel Wrapped Engine (M31).
//
// A Spotify-Wrapped-style presentation model for a future SwiftUI "Travel
// Wrapped" experience. It deliberately calculates NO new travel intelligence —
// it COMPOSES the existing engines (lifetime timeline, lifetime world, journey
// replay, achievements, travel DNA, life story, relationships) into one ordered,
// serialisable deck of cards + headline stats + yearly sections.
//
// NO AI, NO generated prose, NO randomness, NO networking. Pure function of
// (events, trips); deterministic and offline-first. Reuses engines (zero
// duplicated enrichment); presentation-only; no platform change; no backend leak.

import { buildLifetimeTimeline } from './lifetime-timeline.js';
import { buildWorld } from './world.js';
import { buildJourneyReplay } from './journey-replay.js';
import { buildAchievements } from './achievements.js';
import { buildTravelDna } from './travel-dna.js';
import { buildLifeStory } from './life-story.js';
import { buildRelationships } from './relationships.js';

const SEASONS = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'];
const SEASON_ORDER = ['Spring', 'Summer', 'Autumn', 'Winter'];
const TIER_RANK = { Bronze: 1, Silver: 2, Gold: 3, Platinum: 4, Legend: 5 };

/**
 * Build the deterministic Travel Wrapped presentation model. Pure function of
 * (events, trips). Composes existing engines only.
 */
export function buildTravelWrapped(events, trips = []) {
  const lifetime = buildLifetimeTimeline(events, trips);
  const world = buildWorld(events, trips);
  const replay = buildJourneyReplay(events, trips);
  const achievements = buildAchievements(events, trips);
  const dna = buildTravelDna(events, trips);
  const lifeStory = buildLifeStory(events, trips);
  const relationships = buildRelationships(events, trips);

  const momentById = new Map(lifetime.moments.map(m => [m.id, m]));
  const momentTitle = (id) => momentById.get(id)?.title ?? null;
  // current value of an achievement series (already computed by the engine)
  const seriesCurrent = (seriesId) => achievements.achievements.find(a => a.seriesId === seriesId)?.progress.current ?? 0;

  // --- headline stats (composed; no new computation) ------------------------
  const stats = {
    countries: world.statistics.totalCountries,
    cities: world.statistics.totalCities,
    islands: world.statistics.totalIslands,
    continents: world.statistics.continents,
    travelDays: world.statistics.totalDays,
    trips: world.statistics.totalJourneys,
    flights: seriesCurrent('flights'),
    ferries: seriesCurrent('ferries'),
    dives: seriesCurrent('diving'),
    photos: seriesCurrent('photography'),
    beachDays: seriesCurrent('beaches'),
    returnVisits: world.repeatVisits.length,
    memories: world.statistics.totalMemories,
  };

  // --- highlights (pulled straight from the engines) ------------------------
  const mostActiveEra = [...world.eras].sort((a, b) => b.memoryCount - a.memoryCount || a.year - b.year)[0] ?? null;
  const highlights = {
    favouriteDestination: world.profile.favouritePlace ?? null,
    favouriteCountry: world.profile.mostVisitedCountry ?? null,
    favouriteCompanion: relationships.mostTravelledWith?.name ?? null,
    longestTrip: lifetime.moments.find(m => m.id === 'longest-trip')?.subtitle ?? null,
    mostActiveYear: mostActiveEra?.year ?? null,
    mostPhotographedDay: lifetime.moments.find(m => m.id === 'most-photographed-day')?.subtitle ?? null,
    firstTrip: momentTitle('first-trip') ? (momentById.get('first-trip')?.date ?? null) : null,
  };

  // --- travel by season (reshape of existing timeline moments) --------------
  const seasonCounts = Object.fromEntries(SEASON_ORDER.map(s => [s, 0]));
  for (const m of lifetime.moments) seasonCounts[SEASONS[m.month - 1]] += 1;
  const bySeason = SEASON_ORDER.map(season => ({ season, moments: seasonCounts[season] }));

  // --- achievement highlights (top earned by tier, then recency) ------------
  const earnedAch = achievements.achievements.filter(a => a.earned && a.earnedDate)
    .sort((a, b) => (TIER_RANK[b.tier] - TIER_RANK[a.tier]) || b.earnedDate.localeCompare(a.earnedDate) || a.id.localeCompare(b.id));
  const achievementHighlights = {
    totalEarned: achievements.summary.totalEarned,
    completion: achievements.summary.completion,
    rarityScore: achievements.summary.rarityScore,
    topBadges: earnedAch.slice(0, 5).map(a => ({ id: a.id, title: a.title, tier: a.tier, category: a.category, earnedDate: a.earnedDate })),
  };

  // --- DNA signature + life story (engine outputs, trimmed) -----------------
  const travelDna = {
    headline: dna.headline?.statement ?? null,
    topTraits: dna.traits.slice(0, 3).map(t => ({ id: t.id, label: t.label, statement: t.statement, score: t.score })),
  };
  const lifeStoryHighlights = lifeStory.stories.slice(0, 3).map(s => ({ id: s.id, title: s.title, framing: s.framing }));

  // --- ordered wrapped deck (SwiftUI-ready cards) ---------------------------
  const card = (id, kind, title, value, subtitle, accent, icon) => ({ id, kind, title, value: value ?? null, subtitle: subtitle ?? null, accent, icon });
  const sections = [];
  sections.push(card('intro', 'intro', 'Your Travel Wrapped', null, travelDna.headline, 'sky', 'sparkles'));
  sections.push(card('countries', 'stat', 'Countries visited', stats.countries, world.countries.map(c => c.name).join(' · ') || null, 'sky', 'globe'));
  if (stats.cities) sections.push(card('cities', 'stat', 'Cities explored', stats.cities, null, 'slate', 'city'));
  if (stats.islands) sections.push(card('islands', 'stat', 'Islands visited', stats.islands, world.islands.map(i => i.name).join(' · ') || null, 'ocean', 'island'));
  sections.push(card('travel-days', 'stat', 'Days travelling', stats.travelDays, `${stats.trips} ${stats.trips === 1 ? 'journey' : 'journeys'}`, 'sand', 'calendar'));
  if (highlights.favouriteDestination) sections.push(card('favourite-destination', 'highlight', 'Your favourite place', highlights.favouriteDestination, highlights.favouriteCountry, 'sunset', 'heart'));
  if (highlights.favouriteCompanion) sections.push(card('favourite-companion', 'highlight', 'Your favourite companion', highlights.favouriteCompanion, relationships.mostTravelledWith ? `${relationships.mostTravelledWith.sharedMemories} shared memories` : null, 'dusk', 'people'));
  if (highlights.longestTrip) sections.push(card('longest-trip', 'highlight', 'Your longest trip', highlights.longestTrip, null, 'forest', 'suitcase'));
  if (highlights.mostActiveYear) sections.push(card('most-active-year', 'highlight', 'Your biggest year', highlights.mostActiveYear, mostActiveEra ? `${mostActiveEra.memoryCount} memories` : null, 'sunset', 'flame'));
  if (stats.dives) sections.push(card('dives', 'stat', 'Dives completed', stats.dives, null, 'ocean', 'dive'));
  sections.push(card('flights', 'stat', 'Flights taken', stats.flights, null, 'sky', 'airplane'));
  if (stats.returnVisits) sections.push(card('return-visits', 'stat', 'Places you returned to', stats.returnVisits, world.favouriteReturns.map(r => r.place).join(' · ') || null, 'ocean', 'repeat'));
  if (achievementHighlights.topBadges.length) sections.push(card('top-achievement', 'achievement', 'Your top achievement', achievementHighlights.topBadges[0].title, achievementHighlights.topBadges[0].tier, 'gold', 'trophy'));
  if (travelDna.headline) sections.push(card('travel-dna', 'dna', 'Your travel DNA', travelDna.topTraits[0]?.label ?? null, travelDna.headline, travelDna.topTraits[0] ? 'forest' : 'slate', 'dna'));
  sections.push(card('season', 'breakdown', 'Travel by season', [...bySeason].sort((a, b) => b.moments - a.moments)[0]?.season ?? null, bySeason.map(s => `${s.season} ${s.moments}`).join(' · '), 'sand', 'leaf'));
  if (lifeStoryHighlights.length) sections.push(card('life-story', 'story', lifeStoryHighlights[0].title, null, lifeStoryHighlights[0].framing, 'dusk', 'book'));
  sections.push(card('outro', 'outro', 'A life of travel', stats.memories, lifetime.summary.span ? `${lifetime.summary.span.from.slice(0, 4)}–${lifetime.summary.span.to.slice(0, 4)}` : null, 'sky', 'sparkles'));

  // --- yearly wrapped sections ----------------------------------------------
  const years = lifetime.years.map(y => {
    const era = world.eras.find(e => e.year === y.year);
    const yearEarned = earnedAch.filter(a => a.earnedDate && a.earnedDate.slice(0, 4) === String(y.year));
    const seasonsThisYear = Object.fromEntries(SEASON_ORDER.map(s => [s, 0]));
    for (const id of y.momentIds) { const m = momentById.get(id); if (m) seasonsThisYear[SEASONS[m.month - 1]] += 1; }
    return {
      year: y.year,
      summary: { ...y.summary },
      countries: era?.countries ?? [],
      topMoment: y.topMoment ? { id: y.topMoment, title: momentTitle(y.topMoment) } : null,
      topAchievement: yearEarned[0] ? { id: yearEarned[0].id, title: yearEarned[0].title, tier: yearEarned[0].tier } : null,
      bySeason: SEASON_ORDER.map(season => ({ season, moments: seasonsThisYear[season] })),
      momentIds: y.momentIds,
    };
  });

  return {
    headline: {
      statement: travelDna.headline,
      favouriteDestination: highlights.favouriteDestination,
      mostActiveYear: highlights.mostActiveYear,
      span: lifetime.summary.span,
    },
    stats,
    highlights,
    bySeason,
    achievements: achievementHighlights,
    travelDna,
    lifeStory: lifeStoryHighlights,
    sections,
    years,
    basedOn: world.basedOn,
  };
}
