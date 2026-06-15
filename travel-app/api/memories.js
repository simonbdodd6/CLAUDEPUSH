// Travel App — Memory Engine (M24.4).
//
// Turns a traveller's memories into BEAUTIFUL STORIES — deterministically, with
// NO AI and NO generated prose. Think Apple Photos Memories + Apple Journal +
// Spotify Wrapped + Day One: superlative "story cards" (best day, first sunset),
// journey "chapters" (week by week), themed "collections" (dive trip, food
// journey), "reels" (the most photographed day), and a trip/year "recap" — all
// assembled from existing events + trips and packaged as consumer-ready DTOs the
// UI renders with almost zero logic.
//
// Every label is a fixed template filled with the traveller's own numbers/dates
// (never model-written). Deterministic, offline-first, reuses the feed/presenter
// primitives (zero duplication), no platform change, no backend term leaks.

import {
  selectMemories, categoriesFor, CATEGORY_META, dayOf, buildStats,
} from './feed.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function humanDate(iso) {
  const d = new Date(iso);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function shortDate(dayKey) {
  const d = new Date(`${dayKey}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}
function yearOf(iso) { return new Date(iso).getUTCFullYear(); }
function msBetween(a, b) { return new Date(b) - new Date(a); }
function hoursOf(ms) { return Math.round((ms / 3_600_000) * 10) / 10; }

function catsOf(entry) { return categoriesFor(entry); }
function has(entry, key) { return catsOf(entry).includes(key); }

// Pick a cover for a set of entries: prefer a photo, else the first.
function coverOf(entries) {
  return entries.find(e => e.kind === 'photo') ?? entries[0] ?? null;
}

// --- per-day rollup ---------------------------------------------------------

function buildDays(memoriesAsc) {
  const map = new Map();
  for (const m of memoriesAsc) {
    const key = dayOf(m.timestamp);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  const days = [...map.entries()].map(([date, entries]) => {
    const photos = entries.filter(e => e.kind === 'photo');
    const sunsets = entries.filter(e => has(e, 'sunset'));
    const dives = entries.filter(e => has(e, 'dive'));
    const adventureHits = entries.reduce((n, e) => n + catsOf(e).filter(c => c === 'dive' || c === 'mountain' || c === 'wildlife').length, 0);
    const journals = entries.filter(e => e.kind === 'journal');
    return {
      date,
      entries, // chronological
      count: entries.length,
      photoCount: photos.length,
      sunsetCount: sunsets.length,
      diveCount: dives.length,
      adventureHits,
      journalCount: journals.length,
      firstIso: entries[0].timestamp,
      lastIso: entries[entries.length - 1].timestamp,
      spanMs: msBetween(entries[0].timestamp, entries[entries.length - 1].timestamp),
      emotionalScore: sunsets.length * 2 + photos.length + journals.length,
    };
  });
  days.sort((a, b) => a.date.localeCompare(b.date)); // ascending → earliest wins ties
  return days;
}

// argmax/argmin over days (earliest date wins ties because days are ascending).
function pickDay(days, scoreFn, { mode = 'max', minScore = 1 } = {}) {
  let best = null;
  for (const d of days) {
    const s = scoreFn(d);
    if (s < minScore) continue;
    if (!best) { best = { d, s }; continue; }
    if (mode === 'max' ? s > best.s : s < best.s) best = { d, s };
  }
  return best?.d ?? null;
}

// --- story cards (superlatives) ---------------------------------------------

function dayCard(id, accent, icon, title, subtitle, day) {
  if (!day) return null;
  return { id, kind: 'story', accent, icon, title, subtitle, date: day.date, cover: coverOf(day.entries), entries: day.entries.slice(0, 24) };
}
function momentCard(id, accent, icon, title, entry) {
  if (!entry) return null;
  return { id, kind: 'story', accent, icon, title, subtitle: humanDate(entry.timestamp), date: dayOf(entry.timestamp), cover: entry, entries: [entry] };
}

function buildStoryCards(days, memoriesAsc, trip) {
  const cards = [];
  const add = (c) => { if (c) cards.push(c); };

  add(dayCard('best-day', 'sunset', 'star', 'The best day of the trip', 'The day you packed in the most', pickDay(days, d => d.count)));
  if (days.length >= 2) add(dayCard('quietest-day', 'slate', 'moon', 'A quiet day', 'A slower, gentler day', pickDay(days, d => d.count, { mode: 'min' })));
  add(dayCard('most-adventurous-day', 'forest', 'mountain', 'Your most adventurous day', 'Dives, peaks and wild encounters', pickDay(days, d => d.adventureHits, { minScore: 1 })));
  add(dayCard('most-photographed-day', 'dusk', 'camera', 'The most photographed day', 'The day your camera never rested', pickDay(days, d => d.photoCount, { minScore: 2 })));
  add(dayCard('best-dive-day', 'ocean', 'dive', 'Your best dive day', 'The most time below the surface', pickDay(days, d => d.diveCount, { minScore: 1 })));
  add(dayCard('longest-travel-day', 'sky', 'clock', 'Your longest day', 'From first light to last', pickDay(days, d => d.spanMs, { minScore: 1 })));

  const sunsets = memoriesAsc.filter(m => has(m, 'sunset'));
  add(momentCard('first-sunset', 'sunset', 'sunset', 'Your first sunset', sunsets[0]));
  if (sunsets.length >= 2) add(momentCard('last-sunset', 'sunset', 'sunset', 'Your last sunset', sunsets[sunsets.length - 1]));

  add(momentCard('first-memory', 'sky', 'flag', 'Your first memory', memoriesAsc[0]));
  if (memoriesAsc.length >= 2) add(momentCard('final-memory', 'dusk', 'flag', 'Your final memory', memoriesAsc[memoriesAsc.length - 1]));

  if (trip?.startDate) {
    cards.push({ id: 'trip-beginning', kind: 'story', accent: 'sky', icon: 'sunrise', title: trip.destination ? `Arrival in ${trip.destination}` : 'The journey begins', subtitle: humanDate(`${String(trip.startDate).slice(0, 10)}T00:00:00Z`), date: String(trip.startDate).slice(0, 10), cover: null, entries: [] });
  }
  if (trip?.endDate) {
    cards.push({ id: 'trip-ending', kind: 'story', accent: 'dusk', icon: 'sunset', title: trip.destination ? `Farewell to ${trip.destination}` : 'The journey ends', subtitle: humanDate(`${String(trip.endDate).slice(0, 10)}T00:00:00Z`), date: String(trip.endDate).slice(0, 10), cover: null, entries: [] });
  }

  // Most active week (7-day window from the trip start / first memory).
  const base = trip?.startDate ? String(trip.startDate).slice(0, 10) : days[0]?.date;
  if (base && days.length) {
    const byWeek = new Map();
    for (const d of days) {
      const w = Math.floor(msBetween(`${base}T00:00:00Z`, `${d.date}T00:00:00Z`) / (7 * 86_400_000));
      byWeek.set(w, (byWeek.get(w) ?? 0) + d.count);
    }
    let bestWeek = null;
    for (const [w, c] of [...byWeek.entries()].sort((a, b) => a[0] - b[0])) if (!bestWeek || c > bestWeek.c) bestWeek = { w, c };
    if (bestWeek) cards.push({ id: 'most-active-week', kind: 'story', accent: 'forest', icon: 'flame', title: `Your busiest week`, subtitle: `${bestWeek.c} ${bestWeek.c === 1 ? 'memory' : 'memories'} in seven days`, date: null, cover: null, entries: [] });
  }

  return cards;
}

// --- journey chapters (week by week) ----------------------------------------

function chapterHeadline(topKey) {
  if (!topKey) return 'A week on the move';
  return `A week of ${CATEGORY_META[topKey].label.toLowerCase()}`;
}

function buildChapters(days, trip) {
  if (!days.length) return [];
  const base = trip?.startDate ? String(trip.startDate).slice(0, 10) : days[0].date;
  const byWeek = new Map();
  for (const d of days) {
    const w = Math.floor(msBetween(`${base}T00:00:00Z`, `${d.date}T00:00:00Z`) / (7 * 86_400_000));
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w).push(d);
  }
  const weeks = [...byWeek.entries()].sort((a, b) => a[0] - b[0]);
  return weeks.map(([, weekDays], idx) => {
    const entries = weekDays.flatMap(d => d.entries);
    const counts = {};
    for (const e of entries) for (const c of catsOf(e)) counts[c] = (counts[c] ?? 0) + 1;
    const topKey = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))[0] ?? null;
    const n = idx + 1;
    const isFirst = idx === 0; const isLast = idx === weeks.length - 1;
    const suffix = weeks.length === 1 ? 'The journey' : isFirst ? 'Arrival' : isLast ? 'Farewell' : null;
    return {
      id: `chapter-${n}`,
      kind: 'chapter',
      title: suffix ? `Chapter ${n} · ${suffix}` : `Chapter ${n}`,
      story: chapterHeadline(topKey),
      subtitle: `${shortDate(weekDays[0].date)} – ${shortDate(weekDays[weekDays.length - 1].date)}`,
      dayCount: weekDays.length,
      memoryCount: entries.length,
      accent: topKey ? CATEGORY_META[topKey].accent : 'slate',
      cover: coverOf(entries),
    };
  });
}

// --- themed collections -----------------------------------------------------

const COLLECTION_THEMES = [
  { id: 'dive-trip', title: 'Dive trip', subtitle: 'Below the surface', accent: 'ocean', icon: 'dive', match: e => has(e, 'dive'), min: 2 },
  { id: 'food-journey', title: 'Food journey', subtitle: 'Tastes of the trip', accent: 'dusk', icon: 'food', match: e => has(e, 'food'), min: 2 },
  { id: 'wildlife-journey', title: 'Wildlife journey', subtitle: 'Creatures you met', accent: 'forest', icon: 'wildlife', match: e => has(e, 'wildlife'), min: 2 },
  { id: 'sunset-collection', title: 'Chasing sunsets', subtitle: 'Every golden hour', accent: 'sunset', icon: 'sunset', match: e => has(e, 'sunset'), min: 2 },
  { id: 'beach-collection', title: 'Beach days', subtitle: 'Sand and saltwater', accent: 'sand', icon: 'beach', match: e => has(e, 'beach'), min: 2 },
  { id: 'mountain-collection', title: 'High ground', subtitle: 'Peaks and trails', accent: 'forest', icon: 'mountain', match: e => has(e, 'mountain'), min: 2 },
  { id: 'road-trip', title: 'Road trip', subtitle: 'Miles on the move', accent: 'slate', icon: 'road', match: e => /\b(road trip|scooter|motorbike|moped|drive|driving|the road)\b/i.test(`${e.title} ${e.detail}`), min: 2 },
];

function buildCollections(memoriesAsc) {
  const collections = [];
  for (const theme of COLLECTION_THEMES) {
    const entries = memoriesAsc.filter(theme.match);
    if (entries.length < theme.min) continue;
    collections.push({
      id: theme.id, kind: 'collection', title: theme.title,
      subtitle: `${theme.subtitle} · ${entries.length}`,
      accent: theme.accent, icon: theme.icon, count: entries.length,
      cover: coverOf(entries), entries: entries.slice(0, 24),
    });
  }
  return collections;
}

// --- memory reels -----------------------------------------------------------

function buildReels(days) {
  const reels = [];
  const photoDay = pickDay(days, d => d.photoCount, { minScore: 2 });
  if (photoDay) {
    const photos = photoDay.entries.filter(e => e.kind === 'photo');
    reels.push({ id: 'most-photographed', kind: 'reel', title: 'The day in photos', subtitle: `${photos.length} photos · ${shortDate(photoDay.date)}`, accent: 'dusk', count: photos.length, cover: photos[0], entries: photos.slice(0, 24) });
  }
  const movingDay = pickDay(days, d => d.emotionalScore, { minScore: 2 });
  if (movingDay) {
    reels.push({ id: 'most-emotional', kind: 'reel', title: 'The most moving day', subtitle: `${movingDay.count} moments · ${shortDate(movingDay.date)}`, accent: 'sunset', count: movingDay.count, cover: coverOf(movingDay.entries), entries: movingDay.entries.slice(0, 24) });
  }
  return reels;
}

// --- recap (trip / year) ----------------------------------------------------

function buildRecap(events, trip, memoriesAsc, days) {
  if (!memoriesAsc.length) return null;
  const stats = buildStats(events, trip);
  const years = [...new Set(memoriesAsc.map(m => yearOf(m.timestamp)))];
  const singleYear = years.length === 1 ? years[0] : null;
  const topCategories = stats.categories.filter(c => c.count > 0).slice(0, 3).map(c => ({ label: c.label, count: c.count, accent: c.accent, icon: c.icon }));
  const title = trip?.destination
    ? `Your ${trip.destination} story`
    : singleYear ? `Your year in travel · ${singleYear}` : 'Your travel story';
  const topLabel = topCategories[0]?.label?.toLowerCase();
  return {
    id: 'recap', kind: 'recap', title,
    period: trip?.startDate && trip?.endDate ? `${shortDate(String(trip.startDate).slice(0, 10))} – ${shortDate(String(trip.endDate).slice(0, 10))}` : null,
    year: singleYear,
    headline: {
      memories: memoriesAsc.length,
      days: days.length,
      places: stats.journey.placesVisited,
      photos: stats.activity.photoCount,
    },
    storyLine: `${memoriesAsc.length} ${memoriesAsc.length === 1 ? 'memory' : 'memories'} across ${days.length} ${days.length === 1 ? 'day' : 'days'}${topLabel ? ` · mostly ${topLabel}` : ''}`,
    topCategories,
    cover: coverOf(memoriesAsc),
  };
}

/**
 * Build the full Memory Engine DTO. Pure function of (events, trips).
 */
export function buildMemories(events, trips = []) {
  const trip = trips[0] ?? null;
  const memoriesDesc = selectMemories(events);
  const memoriesAsc = [...memoriesDesc].reverse();
  const days = buildDays(memoriesAsc);

  return {
    recap: buildRecap(events, trip, memoriesAsc, days),
    storyCards: buildStoryCards(days, memoriesAsc, trip),
    chapters: buildChapters(days, trip),
    collections: buildCollections(memoriesAsc),
    reels: buildReels(days),
    basedOn: { memories: memoriesAsc.length, days: days.length },
  };
}
