// Travel App — Memory Collections Engine (M33).
//
// Automatically generates deterministic, themed travel collections by COMPOSING
// existing engines — it invents no new intelligence. Membership comes from the
// shared memory enrichment (categories, companions, place, trip), the journey
// engine (transport tagging) and the achievement detectors (surf / road / parks
// / UNESCO); geography comes from the lifetime world; highlights from the
// lifetime timeline; achievement references from the achievement engine.
//
// NO AI, NO generated prose, NO randomness, NO networking. Pure function of
// (events, trips); deterministic, offline-first; presentation DTOs only; no
// platform change; no backend leak.

import { enrichMemories } from './travel-dna.js';
import { buildJourney } from './journey.js';
import { buildWorld } from './world.js';
import { buildAchievements, MEMORY_PATTERNS } from './achievements.js';
import { buildLifetimeTimeline } from './lifetime-timeline.js';
import { dayOf, inclusiveDays } from './feed.js';

const hasCat = (i, c) => i.cats.includes(c);

export function buildCollections(events, trips = []) {
  const items = enrichMemories(events, trips);
  const journey = buildJourney(events, trips);
  const world = buildWorld(events, trips);
  const achievements = buildAchievements(events, trips);
  const lifetime = buildLifetimeTimeline(events, trips);

  // memory id -> transport family (reused from the journey engine)
  const transportOf = new Map();
  for (const seg of journey.segments) for (const e of (seg.supportingMemories ?? [])) {
    const fam = /flight|fly|plane|air/i.test(seg.transport) ? 'flight'
      : /boat|ferry|sail/i.test(seg.transport) ? 'ferry'
        : /train|rail/i.test(seg.transport) ? 'train' : null;
    if (fam) transportOf.set(e.id, fam);
  }
  const hasTransport = (i, fam) => transportOf.get(i.entry.id) === fam;

  // geography maps (reused from the lifetime world)
  const placeCountry = new Map();
  const islandPlaces = new Set();
  const favouritePlaces = new Set();
  for (const c of world.countries) for (const p of c.places) placeCountry.set(p, c.name);
  for (const isl of world.islands) for (const p of isl.places) islandPlaces.add(p);
  for (const loc of [...world.countries, ...world.islands, ...world.cities]) if (loc.isFavourite) for (const p of loc.places) favouritePlaces.add(p);
  if (world.profile.favouritePlace) favouritePlaces.add(world.profile.favouritePlace);
  const placeOf = (i) => i.place ?? i.area ?? i.destination ?? i.country ?? null;

  // memory id -> [moment ids] (reused from the lifetime timeline)
  const momentsByMemory = new Map();
  for (const m of lifetime.moments) for (const e of m.supportingMemories) {
    if (!momentsByMemory.has(e.id)) momentsByMemory.set(e.id, []);
    momentsByMemory.get(e.id).push(m.id);
  }

  // earned achievement ids by category (reused from the achievement engine)
  const achievementsByCategory = new Map();
  for (const a of achievements.achievements) if (a.earned) {
    if (!achievementsByCategory.has(a.category)) achievementsByCategory.set(a.category, []);
    achievementsByCategory.get(a.category).push(a.id);
  }

  // --- trip-shape sets ------------------------------------------------------
  const weekendTripIds = new Set(trips.filter(t => { const d = inclusiveDays(t.startDate, t.endDate); return d && d <= 3; }).map(t => t.tripId));
  const longTripIds = new Set(trips.filter(t => { const d = inclusiveDays(t.startDate, t.endDate); return d && d >= 14; }).map(t => t.tripId));

  // --- collection catalogue (predicate over enriched memory items) ----------
  const CATALOGUE = [
    { id: 'diving-adventures', type: 'activity', title: 'Diving Adventures', subtitle: 'Below the surface', icon: 'dive', achCategory: 'Diving', pred: i => hasCat(i, 'dive'), min: 2 },
    { id: 'surf-trips', type: 'activity', title: 'Surf Trips', subtitle: 'Chasing waves', icon: 'surf', achCategory: 'Surfing', pred: i => MEMORY_PATTERNS.surf.test(i.text), min: 2 },
    { id: 'mountain-adventures', type: 'activity', title: 'Mountain Adventures', subtitle: 'Peaks and trails', icon: 'mountain', achCategory: 'Hiking', pred: i => hasCat(i, 'mountain'), min: 2 },
    { id: 'beach-days', type: 'activity', title: 'Beach Days', subtitle: 'Sand and saltwater', icon: 'beach', achCategory: 'Beaches', pred: i => hasCat(i, 'beach'), min: 2 },
    { id: 'city-breaks', type: 'activity', title: 'City Breaks', subtitle: 'Streets and culture', icon: 'city', achCategory: 'Culture', pred: i => hasCat(i, 'city') || MEMORY_PATTERNS.culture.test(i.text), min: 2 },
    { id: 'food-experiences', type: 'activity', title: 'Food Experiences', subtitle: 'Tastes of the road', icon: 'food', achCategory: 'Food', pred: i => hasCat(i, 'food'), min: 2 },
    { id: 'wildlife-encounters', type: 'activity', title: 'Wildlife Encounters', subtitle: 'Creatures you met', icon: 'wildlife', achCategory: 'Wildlife', pred: i => hasCat(i, 'wildlife'), min: 2 },
    { id: 'road-trips', type: 'transport', title: 'Road Trips', subtitle: 'Miles on the move', icon: 'road', pred: i => MEMORY_PATTERNS.road.test(i.text), min: 2 },
    { id: 'ferry-adventures', type: 'transport', title: 'Ferry Adventures', subtitle: 'Over the water', icon: 'boat', achCategory: 'Ferries', pred: i => hasTransport(i, 'ferry'), min: 1 },
    { id: 'train-journeys', type: 'transport', title: 'Train Journeys', subtitle: 'On the rails', icon: 'train', pred: i => hasTransport(i, 'train'), min: 1 },
    { id: 'flights', type: 'transport', title: 'Flights', subtitle: 'Across the sky', icon: 'airplane', achCategory: 'Flights', pred: i => hasTransport(i, 'flight') || MEMORY_PATTERNS.flight.test(i.text), min: 1 },
    { id: 'photography-highlights', type: 'media', title: 'Photography Highlights', subtitle: 'Through the lens', icon: 'camera', achCategory: 'Photography', pred: i => i.entry.kind === 'photo', min: 3 },
    { id: 'national-parks', type: 'place', title: 'National Parks', subtitle: 'Wild and protected', icon: 'park', achCategory: 'National Parks', pred: i => MEMORY_PATTERNS.nationalPark.test(i.text), min: 1, hidden: true },
    { id: 'unesco-sites', type: 'place', title: 'UNESCO Sites', subtitle: 'World heritage', icon: 'unesco', achCategory: 'UNESCO', pred: i => MEMORY_PATTERNS.unesco.test(i.text), min: 1, hidden: true },
    { id: 'island-escapes', type: 'place', title: 'Island Escapes', subtitle: 'Life on the islands', icon: 'island', achCategory: 'Islands', pred: i => islandPlaces.has(placeOf(i)), min: 2 },
    { id: 'favourite-places', type: 'place', title: 'Favourite Places', subtitle: 'Where you return', icon: 'heart', pred: i => favouritePlaces.has(placeOf(i)), min: 2 },
  ];

  const collections = [];
  let order = 0;
  const add = (spec, members) => {
    const filtered = members.filter(Boolean);
    if (filtered.length < (spec.min ?? 2)) return;
    collections.push(buildCollection(spec, filtered, order)); order += 1;
  };

  function buildCollection(spec, members, sortOrder) {
    const asc = [...members].sort((a, b) => a.entry.timestamp.localeCompare(b.entry.timestamp) || String(a.entry.id).localeCompare(String(b.entry.id)));
    const entries = asc.map(i => i.entry);
    const photos = entries.filter(e => e.kind === 'photo');
    const cover = (photos[0] ?? entries[0]) ?? null;
    const locations = [...new Set(asc.map(placeOf).filter(Boolean))];
    const companions = [...new Set(asc.flatMap(i => i.companions))].sort();
    const tripIds = [...new Set(asc.map(i => i.tripId).filter(Boolean))];
    const days = new Set(asc.map(i => dayOf(i.entry.timestamp))).size;
    const highlightRefs = [...new Set(asc.flatMap(i => momentsByMemory.get(i.entry.id) ?? []))].slice(0, 12);
    const achievementRefs = spec.achCategory ? (achievementsByCategory.get(spec.achCategory) ?? []) : [];
    return {
      id: spec.id, type: spec.type, hidden: !!spec.hidden,
      title: spec.title, subtitle: spec.subtitle, icon: spec.icon,
      coverCandidate: cover ? { memoryId: cover.id, photoRef: cover.photoRef ?? null } : null,
      timeSpan: { from: entries[0].timestamp, to: entries[entries.length - 1].timestamp },
      locations, companions,
      journeyCount: tripIds.length,
      mediaRefs: photos.map(p => p.photoRef).filter(Boolean),
      achievementRefs, highlightRefs,
      memoryRefs: entries.map(e => e.id).slice(0, 50),
      statistics: { memories: entries.length, photos: photos.length, days, locations: locations.length, companions: companions.length, journeys: tripIds.length },
      sortOrder,
    };
  }

  // category / transport / place collections
  for (const spec of CATALOGUE) add(spec, items.filter(spec.pred));

  // per-country: "Exploring {Country}"
  const byCountry = new Map();
  for (const i of items) { const c = placeCountry.get(placeOf(i)) ?? i.country; if (!c) continue; if (!byCountry.has(c)) byCountry.set(c, []); byCountry.get(c).push(i); }
  for (const [country, members] of [...byCountry.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    add({ id: `country-${country.toLowerCase().replace(/\s+/g, '-')}`, type: 'country', title: `Exploring ${country}`, subtitle: 'Across the country', icon: 'globe', achCategory: 'Countries', min: 2 }, members);
  }

  // per-companion: "Travelling with {name}"
  const byCompanion = new Map();
  for (const i of items) for (const n of i.companions) { if (!byCompanion.has(n)) byCompanion.set(n, []); byCompanion.get(n).push(i); }
  for (const [name, members] of [...byCompanion.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
    add({ id: `with-${name.toLowerCase().replace(/\s+/g, '-')}`, type: 'companion', title: `Travelling with ${name}`, subtitle: 'Shared journeys', icon: 'people', min: 3 }, members);
  }

  // trip-shape collections
  if (weekendTripIds.size) add({ id: 'weekend-trips', type: 'trip', title: 'Weekend Trips', subtitle: 'Short escapes', icon: 'suitcase', min: 1 }, items.filter(i => weekendTripIds.has(i.tripId)));
  if (longTripIds.size) add({ id: 'long-expeditions', type: 'trip', title: 'Long Expeditions', subtitle: 'The big journeys', icon: 'compass', min: 1 }, items.filter(i => longTripIds.has(i.tripId)));

  // deterministic order: by member count (richest first), then sortOrder, then id
  collections.sort((a, b) => b.statistics.memories - a.statistics.memories || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  collections.forEach((c, idx) => { c.sortOrder = idx; });

  return {
    collections,
    summary: { total: collections.length, byType: collections.reduce((acc, c) => { acc[c.type] = (acc[c.type] ?? 0) + 1; return acc; }, {}) },
    basedOn: world.basedOn,
  };
}
