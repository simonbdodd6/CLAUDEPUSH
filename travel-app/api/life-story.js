// Travel App — Life Story Engine (M24.5).
//
// The highest narrative layer: it reads across the traveller's whole history and
// curates their memories into meaningful LIFE STORIES — "The Bali Chapter", "The
// Summer You Learned To Dive", "Travelling With Manon", "Where You Always
// Return". The feeling: the app genuinely remembers your life.
//
// Strictly deterministic. NO AI, NO generated prose, NO randomness. Every title,
// subtitle and emotional framing is a fixed template filled with the traveller's
// own evidence (places, dates, counts, people). Reuses the feed/presenter
// primitives (zero duplication), reads only stored events + trips, leaks no
// backend term, and keeps platform logic and presentation completely separate.

import { selectMemories, categoriesFor, CATEGORY_META, dayOf } from './feed.js';
import { normalizeCompanions } from './relationships.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SEASONS = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'];

function yearOf(iso) { return new Date(iso).getUTCFullYear(); }
function monthOf(iso) { return new Date(iso).getUTCMonth(); }
function byTimeAsc(a, b) { return new Date(a.timestamp) - new Date(b.timestamp) || String(a.id).localeCompare(String(b.id)); }

function coverOf(entriesAsc) {
  return entriesAsc.find(e => e.kind === 'photo') ?? entriesAsc[0] ?? null;
}

function confidenceFor(count) {
  if (count >= 12) return 'defining';
  if (count >= 4) return 'strong';
  return 'emerging';
}

function spanOf(entriesAsc) {
  const from = entriesAsc[0].timestamp;
  const to = entriesAsc[entriesAsc.length - 1].timestamp;
  const days = new Set(entriesAsc.map(e => dayOf(e.timestamp))).size;
  const y1 = yearOf(from); const y2 = yearOf(to);
  const label = y1 !== y2
    ? `${y1}–${y2}`
    : monthOf(from) === monthOf(to)
      ? `${MONTHS[monthOf(from)].slice(0, 3)} ${y1}`
      : `${y1}`;
  return { from, to, days, label };
}

// Assemble one life story from a set of supporting memory entries.
function makeStory({ id, title, subtitle, framing, category, accent, icon, entries, stats = {}, bonus = 0 }, min) {
  if (!entries || entries.length < min) return null;
  const asc = [...entries].sort(byTimeAsc);
  const cover = coverOf(asc);
  const count = asc.length;
  return {
    id, title, subtitle, framing, category, accent, icon,
    cover,
    hero: cover?.photoRef ?? null,
    memories: asc.slice(0, 30),
    statistics: { memories: count, photos: asc.filter(e => e.kind === 'photo').length, days: new Set(asc.map(e => dayOf(e.timestamp))).size, ...stats },
    span: spanOf(asc),
    evidence: { count, confidence: confidenceFor(count) },
    _sig: count + bonus,
  };
}

/**
 * Build the deterministic Life Story DTO. Pure function of (events, trips).
 */
export function buildLifeStory(events, trips = []) {
  const tripById = new Map(trips.filter(t => t?.tripId).map(t => [t.tripId, t]));

  // Enrich each memory with its place/companions, keeping the clean entry intact.
  const clean = selectMemories(events); // desc, clean entries
  const metaById = new Map();
  for (const ev of events) {
    const note = ev.metadata?.note ?? '';
    const photoRef = ev.metadata?.photoRef ?? null;
    if (!note && !photoRef) continue;
    const trip = ev.tripId ? tripById.get(ev.tripId) : null;
    metaById.set(ev.timelineEventId, {
      tripId: ev.tripId ?? null,
      destination: trip?.destination ?? null,
      country: trip?.country ?? null,
      companions: normalizeCompanions(ev.metadata?.companions),
    });
  }
  const items = clean.map(entry => ({ entry, cats: categoriesFor(entry), ...(metaById.get(entry.id) ?? { tripId: null, destination: null, country: null, companions: [] }) }));
  const toEntries = list => list.map(i => i.entry);
  const withCat = key => items.filter(i => i.cats.includes(key));

  const stories = [];
  const add = (s) => { if (s) stories.push(s); };

  // --- Place chapters: "The Bali Chapter" -----------------------------------
  const byDestination = new Map();
  for (const i of items) if (i.destination) {
    if (!byDestination.has(i.destination)) byDestination.set(i.destination, []);
    byDestination.get(i.destination).push(i);
  }
  for (const [destination, group] of byDestination) {
    add(makeStory({
      id: `chapter-${destination.toLowerCase().replace(/\s+/g, '-')}`,
      title: `The ${destination} Chapter`,
      subtitle: spanOf([...toEntries(group)].sort(byTimeAsc)).label,
      framing: `A chapter of your life set in ${destination}.`,
      category: 'place', accent: 'sky', icon: 'map',
      entries: toEntries(group), bonus: 2,
    }, 3));
  }

  // --- "The Summer You Learned To Dive" -------------------------------------
  const dives = withCat('dive');
  if (dives.length) {
    const firstDive = [...toEntries(dives)].sort(byTimeAsc)[0];
    const season = SEASONS[monthOf(firstDive.timestamp)];
    add(makeStory({
      id: 'learned-to-dive',
      title: `The ${season} You Learned To Dive`,
      subtitle: `${MONTHS[monthOf(firstDive.timestamp)]} ${yearOf(firstDive.timestamp)}`,
      framing: 'Your first breaths beneath the surface.',
      category: 'milestone', accent: CATEGORY_META.dive.accent, icon: 'dive',
      entries: toEntries(dives), stats: { dives: dives.length }, bonus: 3,
    }, 1));
  }

  // --- Theme journeys -------------------------------------------------------
  add(makeStory({ id: 'diving-journey', title: 'Your Diving Journey', subtitle: 'Below the surface', framing: 'Every descent, gathered into one story.', category: 'theme', accent: CATEGORY_META.dive.accent, icon: 'dive', entries: toEntries(dives), stats: { dives: dives.length }, bonus: 2 }, 2));

  const sunsets = withCat('sunset');
  add(makeStory({ id: 'sunset-collection', title: 'Sunset Collection', subtitle: 'Every golden hour', framing: 'The skies that stopped you in your tracks.', category: 'theme', accent: CATEGORY_META.sunset.accent, icon: 'sunset', entries: toEntries(sunsets), stats: { sunsets: sunsets.length }, bonus: 1 }, 2));

  const ocean = items.filter(i => i.cats.includes('beach') || i.cats.includes('dive'));
  add(makeStory({ id: 'ocean-memories', title: 'Ocean Memories', subtitle: 'Saltwater and reef', framing: 'The pull of the sea, across all your travels.', category: 'theme', accent: CATEGORY_META.dive.accent, icon: 'beach', entries: toEntries(ocean), bonus: 1 }, 3));

  const food = withCat('food');
  add(makeStory({ id: 'food-trail', title: 'The Food Trail', subtitle: 'Tastes of the road', framing: 'The meals that became memories.', category: 'theme', accent: CATEGORY_META.food.accent, icon: 'food', entries: toEntries(food), stats: { meals: food.length }, bonus: 1 }, 2));

  const wildlife = withCat('wildlife');
  add(makeStory({ id: 'into-the-wild', title: 'Into The Wild', subtitle: 'Creatures you met', framing: 'The wild lives your path crossed.', category: 'theme', accent: CATEGORY_META.wildlife.accent, icon: 'wildlife', entries: toEntries(wildlife), bonus: 1 }, 2));

  // --- "Travelling With Manon" ----------------------------------------------
  const byCompanion = new Map();
  for (const i of items) for (const name of i.companions) {
    if (!byCompanion.has(name)) byCompanion.set(name, []);
    byCompanion.get(name).push(i);
  }
  for (const [name, group] of byCompanion) {
    add(makeStory({
      id: `with-${name.toLowerCase().replace(/\s+/g, '-')}`,
      title: `Travelling With ${name}`,
      subtitle: `${group.length} shared ${group.length === 1 ? 'memory' : 'memories'}`,
      framing: `The journeys you've shared with ${name}.`,
      category: 'person', accent: 'dusk', icon: 'heart',
      entries: toEntries(group), bonus: 4,
    }, 3));
  }

  // --- "Where You Always Return" --------------------------------------------
  const tripsByDest = new Map();
  for (const t of trips) if (t?.destination) {
    if (!tripsByDest.has(t.destination)) tripsByDest.set(t.destination, new Set());
    tripsByDest.get(t.destination).add(t.tripId);
  }
  const returnDest = [...tripsByDest.entries()].filter(([, set]) => set.size >= 2).sort((a, b) => b[1].size - a[1].size)[0];
  if (returnDest) {
    const [destination, set] = returnDest;
    add(makeStory({
      id: 'where-you-return', title: 'Where You Always Return', subtitle: destination,
      framing: `${destination} keeps calling you back — ${set.size} trips and counting.`,
      category: 'pattern', accent: 'ocean', icon: 'repeat',
      entries: toEntries(byDestination.get(destination) ?? []), stats: { trips: set.size }, bonus: 6,
    }, 1));
  }

  // --- "Your Island Years" (history spanning multiple years) ----------------
  const tripYears = [...new Set(trips.filter(t => t?.startDate).map(t => yearOf(`${String(t.startDate).slice(0, 10)}T00:00:00Z`)))].sort();
  if (tripYears.length >= 2) {
    add(makeStory({
      id: 'island-years', title: 'Your Island Years', subtitle: `${tripYears[0]}–${tripYears[tripYears.length - 1]}`,
      framing: 'Years of journeys, drawn together into one story.',
      category: 'era', accent: 'sand', icon: 'globe',
      entries: toEntries(items), stats: { years: tripYears.length, trips: trips.length }, bonus: 5,
    }, 1));
  }

  // --- "The Year Of Adventure" ----------------------------------------------
  const adventureByYear = new Map();
  for (const i of items) {
    const isAdv = i.cats.some(c => c === 'dive' || c === 'mountain' || c === 'wildlife');
    if (!isAdv) continue;
    const y = yearOf(i.entry.timestamp);
    if (!adventureByYear.has(y)) adventureByYear.set(y, []);
    adventureByYear.get(y).push(i);
  }
  const topAdventureYear = [...adventureByYear.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0])[0];
  if (topAdventureYear && topAdventureYear[1].length >= 3) {
    add(makeStory({
      id: 'year-of-adventure', title: 'The Year Of Adventure', subtitle: `${topAdventureYear[0]}`,
      framing: `${topAdventureYear[0]} pushed you further than any other.`,
      category: 'era', accent: 'forest', icon: 'mountain',
      entries: toEntries(topAdventureYear[1]), bonus: 4,
    }, 3));
  }

  // --- "Your Quiet Places" (reflective, low-photo destinations) -------------
  const quiet = [];
  for (const [, group] of byDestination) {
    const journals = group.filter(i => i.entry.kind === 'journal').length;
    const photos = group.filter(i => i.entry.kind === 'photo').length;
    if (group.length >= 2 && journals > photos) quiet.push(...group);
  }
  add(makeStory({ id: 'quiet-places', title: 'Your Quiet Places', subtitle: 'Where you slowed down', framing: 'The calm corners of your travels.', category: 'mood', accent: 'slate', icon: 'moon', entries: toEntries(quiet), bonus: 1 }, 2));

  // --- "Places That Changed You" (only with multiple meaningful places) -----
  const meaningfulPlaces = [...byDestination.entries()].filter(([, g]) => g.length >= 3);
  if (meaningfulPlaces.length >= 2) {
    const placeNames = meaningfulPlaces.map(([d]) => d);
    const entries = meaningfulPlaces.flatMap(([, g]) => toEntries(g));
    add(makeStory({
      id: 'places-that-changed-you', title: 'Places That Changed You', subtitle: placeNames.join(' · '),
      framing: 'The places that left a mark on you.',
      category: 'pattern', accent: 'sunset', icon: 'star',
      entries, stats: { places: placeNames.length }, bonus: 5,
    }, 3));
  }

  // Most significant first; deterministic tie-break by title.
  stories.sort((a, b) => b._sig - a._sig || a.title.localeCompare(b.title));
  const span = clean.length ? spanOf([...clean].sort(byTimeAsc)) : null;

  return {
    stories: stories.map(({ _sig, ...rest }) => rest),
    basedOn: { memories: clean.length, trips: trips.length, span },
  };
}
