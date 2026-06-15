// Travel App — Premium Travel Feed & Travel Statistics (M24.1).
//
// "Instagram Explore meets Apple Journal." A derived, READ-ONLY presentation
// layer that turns the traveller's timeline + trip into something they feel the
// moment they open the app: a hero memory, featured photos, journey highlights,
// today's story, and beautiful travel statistics (streaks, countries, places,
// dives, flights, and warm memory categories — sunsets, beaches, mountains…).
//
// Everything here is DETERMINISTIC and additive. It derives from the same clean
// entries the timeline already exposes (single source of truth via
// presentEntries / presentTimeline) plus the trip — so the app renders premium
// content with almost zero UI logic. No platform module is touched, no business
// rule is duplicated, no backend term leaks, and no exact location is used.

import { presentEntries, presentTimeline, humanDay } from './presenters.js';

// --- Memory categories ------------------------------------------------------
// Warm, human categories derived from a memory's own words. Keyword matching is
// deterministic and runs only over the consumer-clean entry text (title/detail).
const CATEGORY_RULES = [
  { key: 'sunset', label: 'Sunsets', accent: 'sunset', icon: 'sunset', re: /\b(sunset|sunrise|golden hour|dusk|dawn)\b/i },
  { key: 'beach', label: 'Beaches', accent: 'sand', icon: 'beach', re: /\b(beach|shore|sand|surf|coast|coastline|lagoon|bay|wave|waves)\b/i },
  { key: 'mountain', label: 'Mountains', accent: 'forest', icon: 'mountain', re: /\b(mountain|mountains|volcano|summit|peak|ridge|hike|hiking|trek|trekking|climb)\b/i },
  { key: 'city', label: 'Cities', accent: 'slate', icon: 'city', re: /\b(city|town|street|streets|market|temple|museum|gallery|urban|downtown)\b/i },
  { key: 'wildlife', label: 'Wildlife', accent: 'ocean', icon: 'wildlife', re: /\b(wildlife|monkey|monkeys|turtle|turtles|bird|birds|dolphin|whale|shark|manta|ray|gecko|lizard|elephant|orangutan|animal|animals)\b/i },
  { key: 'food', label: 'Local food', accent: 'dusk', icon: 'food', re: /\b(food|eat|ate|dinner|lunch|breakfast|meal|restaurant|warung|cafe|coffee|cuisine|nasi|satay|rendang|street food|local food)\b/i },
  { key: 'dive', label: 'Dives', accent: 'ocean', icon: 'dive', re: /\b(dive|dived|diving|scuba|snorkel|snorkelling|snorkeling|reef|underwater|wreck)\b/i },
  { key: 'flight', label: 'Flights', accent: 'sky', icon: 'flight', re: /\b(flight|flew|fly|flying|plane|airport|landed|landing|takeoff|boarding|red.?eye)\b/i },
];

function textOf(entry) {
  return `${entry.title ?? ''} ${entry.detail ?? ''}`;
}

export function categoriesFor(entry) {
  const text = textOf(entry);
  return CATEGORY_RULES.filter(r => r.re.test(text)).map(r => r.key);
}

// Category display metadata (key -> { label, accent, icon }) — shared by the
// feed and the intelligence layer so labels never drift.
export const CATEGORY_META = Object.fromEntries(
  CATEGORY_RULES.map(r => [r.key, { label: r.label, accent: r.accent, icon: r.icon }]),
);

// Personal memories = the traveller's own captured moments.
const MEMORY_KINDS = new Set(['photo', 'journal', 'memory']);
function isMemory(entry) { return MEMORY_KINDS.has(entry.kind); }

// The traveller's memories as premium entries, newest-first (single source of
// truth, reused by stats + intelligence).
export function selectMemories(events) {
  return presentEntries(events, 'desc').filter(isMemory);
}

// Count category hits across a list of memory entries.
export function countCategories(memories) {
  const counts = Object.fromEntries(CATEGORY_RULES.map(r => [r.key, 0]));
  for (const m of memories) for (const key of categoriesFor(m)) counts[key] += 1;
  return counts;
}

export function dayOf(iso) { return String(iso).slice(0, 10); }

export function inclusiveDays(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = Date.parse(`${String(startDate).slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${String(endDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 86_400_000) + 1;
}

// Longest + current run of consecutive calendar days from a set of day keys.
export function streaks(dayKeys) {
  const sorted = [...new Set(dayKeys)].sort();
  if (!sorted.length) return { current: 0, longest: 0, unit: 'days' };
  let longest = 1; let run = 1; let current = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = Date.parse(`${sorted[i - 1]}T00:00:00Z`);
    const cur = Date.parse(`${sorted[i]}T00:00:00Z`);
    const consecutive = Math.round((cur - prev) / 86_400_000) === 1;
    run = consecutive ? run + 1 : 1;
    if (run > longest) longest = run;
    current = run; // run ending at the most recent active day
  }
  return { current, longest, unit: 'days' };
}

/**
 * Beautiful, display-ready travel statistics. Pure function of (events, trip).
 */
export function buildStats(events, trip = null) {
  const entries = presentEntries(events, 'desc');
  const memories = entries.filter(isMemory);

  const counts = countCategories(memories);

  const memoryDays = memories.map(m => dayOf(m.timestamp));
  const photoCount = memories.filter(m => m.kind === 'photo').length;
  const journalCount = memories.filter(m => m.kind === 'journal').length;
  const memoryNoteCount = memories.filter(m => m.kind === 'memory').length;

  const places = new Set();
  if (trip?.destination) places.add(trip.destination);
  if (trip?.area) places.add(trip.area);
  for (const e of entries) if (e.kind === 'destination' && e.title) places.add(e.title);

  const countries = new Set();
  if (trip?.country) countries.add(trip.country);

  const categories = CATEGORY_RULES
    .map(r => ({ key: r.key, label: r.label, accent: r.accent, icon: r.icon, count: counts[r.key] }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  return {
    // Hero numbers for the top of a stats screen.
    headline: {
      daysTravelling: new Set(memoryDays).size,
      placesVisited: places.size,
      countries: countries.size,
      memories: memories.length,
    },
    journey: {
      tripDuration: inclusiveDays(trip?.startDate, trip?.endDate), // inclusive days, null if unknown
      daysTravelling: new Set(memoryDays).size,
      countries: countries.size,
      countriesList: [...countries],
      placesVisited: places.size,
      placesList: [...places],
    },
    activity: {
      flightsTaken: counts.flight,
      diveCount: counts.dive,
      memories: memories.length,
      photoCount,
      journalCount,
      memoryCount: memoryNoteCount,
    },
    streaks: streaks(memoryDays),
    // Warm memory categories (sunsets, beaches, mountains, cities, wildlife,
    // food, dives, flights) — display-ready, richest first.
    categories,
  };
}

// Choose the standout memory: a photo with words, else any photo, else any
// memory. Deterministic (entries are newest-first; first match wins).
function pickHero(memories, trip) {
  const photoWithWords = memories.find(m => m.kind === 'photo' && m.detail);
  const anyPhoto = memories.find(m => m.kind === 'photo');
  const anyMemory = memories[0];
  const hero = photoWithWords ?? anyPhoto ?? anyMemory ?? null;
  return hero ? { ...hero, place: trip?.destination ?? null, featured: true } : null;
}

// A few deterministic journey highlights — the emotional beats of the trip.
function buildHighlights(entries, memories, trip) {
  const highlights = [];
  const destination = trip?.destination ?? null;

  if (trip?.startDate) {
    highlights.push({
      id: 'arrival', kind: 'milestone', accent: 'sky', icon: 'flight',
      title: destination ? `Arrival in ${destination}` : 'The journey begins',
      subtitle: humanDay(`${String(trip.startDate).slice(0, 10)}T00:00:00Z`),
    });
  }

  if (memories.length) {
    // First memory captured.
    const first = memories[memories.length - 1]; // memories are newest-first
    highlights.push({
      id: 'first', kind: 'milestone', accent: 'dusk', icon: 'sparkles',
      title: 'Your first memory', subtitle: humanDay(first.timestamp),
    });

    // Busiest day — the day with the most moments.
    const byDay = new Map();
    for (const m of memories) {
      const k = dayOf(m.timestamp);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(m);
    }
    let best = null;
    for (const [day, list] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (!best || list.length > best.count) best = { day, count: list.length, iso: list[0].timestamp };
    }
    if (best && best.count > 1) {
      highlights.push({
        id: 'peak', kind: 'milestone', accent: 'sunset', icon: 'star',
        title: 'A day to remember',
        subtitle: `${best.count} moments · ${humanDay(best.iso)}`,
      });
    }
  }

  return highlights.slice(0, 4);
}

/**
 * The premium feed the traveller sees on open. Pure function of (events, trip).
 * Returns hero + featured photos + highlights + today's story + statistics —
 * all display-ready.
 */
export function buildFeed(events, trip = null) {
  const entries = presentEntries(events, 'desc');
  const memories = entries.filter(isMemory);
  const featuredPhotos = memories.filter(m => m.kind === 'photo').slice(0, 6);
  const days = presentTimeline(events, { tripStartDate: trip?.startDate ?? null, destination: trip?.destination ?? null });

  return {
    hero: pickHero(memories, trip),
    featuredPhotos,
    highlights: buildHighlights(entries, memories, trip),
    today: days[0] ?? null,
    stats: buildStats(events, trip),
  };
}
