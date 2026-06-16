// Travel App — On This Day Engine (M32).
//
// Surfaces everything that happened on the same calendar day (month + day) across
// previous years, so the app can show "a year ago today…". It COMPOSES existing
// engines (lifetime timeline + shared memory enrichment + journey transport
// tagging) — it calculates no new intelligence. NO AI, NO generated prose, NO
// randomness, NO networking.
//
// Deterministic: the reference date is an explicit argument (the caller passes
// "today"), so the pure function is fully reproducible. Presentation-only; reuses
// engines (zero duplicated enrichment); no platform change; no backend leak.

import { buildLifetimeTimeline } from './lifetime-timeline.js';
import { buildJourney } from './journey.js';
import { enrichMemories } from './travel-dna.js';
import { dayOf } from './feed.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthDayOf(iso) { return dayOf(iso).slice(5, 10); } // "MM-DD"
function yearOf(iso) { return Number(dayOf(iso).slice(0, 4)); }

// Category derived ONLY from existing enrichment (memory cats) + journey transport.
function categoryFromCats(cats, isPhoto) {
  if (cats.includes('dive')) return 'dive';
  if (cats.includes('mountain')) return 'hike';
  if (cats.includes('wildlife')) return 'wildlife';
  if (cats.includes('food')) return 'food';
  if (cats.includes('beach')) return 'beach';
  if (cats.includes('sunset')) return 'sunset';
  if (cats.includes('city')) return 'culture';
  return isPhoto ? 'photo' : 'memory';
}

const TONE = { 'first-visit': 'joyful', milestone: 'proud', achievement: 'proud', return: 'nostalgic', relationship: 'warm', memory: 'reflective', journey: 'adventurous' };
const HERO_BASE = { achievement: 90, 'first-visit': 80, milestone: 70, relationship: 60, return: 55, journey: 50, memory: 40 };
const TIER_BONUS = { Legend: 25, Platinum: 20, Gold: 10, Silver: 5, Bronze: 0 };

function emptyOnThisDay(refDate, refYear, monthDay, basedOn) {
  return {
    date: refDate, monthDay, referenceYear: refYear, hasMemories: false,
    hero: null, items: [], byYear: [], anniversaryBadges: [], milestones: [],
    comparisons: [], categories: [], basedOn,
  };
}

/**
 * Build the deterministic On This Day DTO.
 * @param {Array} events
 * @param {Array} trips
 * @param {string} referenceDate  ISO or "YYYY-MM-DD" — the day to look back on.
 */
export function buildOnThisDay(events, trips = [], referenceDate) {
  const refIso = referenceDate ?? '1970-01-01';
  const refDate = dayOf(refIso);
  const refYear = yearOf(refIso);
  const monthDay = refDate.slice(5, 10);

  const lifetime = buildLifetimeTimeline(events, trips);
  const enriched = enrichMemories(events, trips);
  const journey = buildJourney(events, trips);

  // memory id -> transport (from the journey engine; reuse, no new detection)
  const memoryTransport = new Map();
  for (const seg of journey.segments) {
    for (const e of (seg.supportingMemories ?? [])) {
      const fam = /flight|fly|plane|air/i.test(seg.transport) ? 'flight'
        : /boat|ferry|sail/i.test(seg.transport) ? 'ferry'
          : /train|rail/i.test(seg.transport) ? 'train' : null;
      if (fam) memoryTransport.set(e.id, fam);
    }
  }

  const mediaOf = (memories) => memories.map(e => e.photoRef).filter(Boolean);
  const items = [];
  const covered = new Set(); // memory ids already represented by a timeline moment

  // --- 1) timeline moments on this calendar day (previous years) ------------
  for (const m of lifetime.moments) {
    if (monthDayOf(m.date) !== monthDay) continue;
    const yearsAgo = refYear - m.year;
    if (yearsAgo < 1) continue; // previous years only
    for (const e of m.supportingMemories) covered.add(e.id);
    items.push({
      id: `otd-${m.id}`, sourceId: m.id, type: m.type,
      category: m.category ?? m.type,
      title: m.title, subtitle: m.subtitle ?? null,
      date: m.date, year: m.year, yearsAgo,
      isMilestone: ['first-visit', 'milestone', 'achievement'].includes(m.type),
      isAnniversary: true, borderCrossing: false,
      place: m.relatedPlaces[0] ?? null, companions: m.relatedCompanions ?? [],
      relatedAchievements: m.relatedAchievements ?? [],
      supportingMemories: m.supportingMemories, mediaRefs: mediaOf(m.supportingMemories),
      emotionalTone: m.emotionalTone ?? TONE[m.type] ?? 'reflective',
      iconId: m.iconId ?? 'sparkles', confidence: m.confidence ?? 'emerging', evidence: m.evidence ?? { count: 0, detail: '' },
      tier: m.tier ?? null, favourite: !!m.favourite,
    });
  }

  // --- 2) raw memories on this day not already represented ------------------
  // (transport legs are always surfaced — "a ferry/flight on this day" is itself
  //  worth showing — even if a moment already references the same memory.)
  for (const i of enriched) {
    if (monthDayOf(i.entry.timestamp) !== monthDay) continue;
    const yearsAgo = refYear - yearOf(i.entry.timestamp);
    if (yearsAgo < 1) continue;
    const transport = memoryTransport.get(i.entry.id) ?? null;
    if (covered.has(i.entry.id) && !transport) continue;
    covered.add(i.entry.id);
    const category = transport ?? categoryFromCats(i.cats, i.entry.kind === 'photo');
    items.push({
      id: `otd-mem-${i.entry.id}`, sourceId: i.entry.id, type: 'memory', category,
      title: i.entry.title, subtitle: i.entry.subtitle ?? null,
      date: i.entry.timestamp, year: yearOf(i.entry.timestamp), yearsAgo,
      isMilestone: false, isAnniversary: true, borderCrossing: false,
      place: i.place ?? i.destination ?? null, companions: i.companions ?? [],
      relatedAchievements: [], supportingMemories: [i.entry], mediaRefs: mediaOf([i.entry]),
      emotionalTone: 'reflective', iconId: i.entry.kind === 'photo' ? 'camera' : 'sparkles',
      confidence: 'emerging', evidence: { count: 1, detail: `${yearsAgo} ${yearsAgo === 1 ? 'year' : 'years'} ago` },
      tier: null, favourite: false,
    });
  }

  if (!items.length) return emptyOnThisDay(refDate, refYear, monthDay, lifetime.basedOn);

  // chronological (oldest first → the story builds toward today)
  items.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  // --- hero moment ----------------------------------------------------------
  const heroScore = (it) => (HERO_BASE[it.type] ?? 40) + (it.tier ? (TIER_BONUS[it.tier] ?? 0) : 0) + (it.favourite ? 8 : 0) + Math.min(it.yearsAgo, 10);
  const hero = [...items].sort((a, b) => heroScore(b) - heroScore(a) || b.yearsAgo - a.yearsAgo || a.id.localeCompare(b.id))[0] ?? null;

  // --- grouped by year ------------------------------------------------------
  const yearMap = new Map();
  for (const it of items) {
    if (!yearMap.has(it.year)) yearMap.set(it.year, []);
    yearMap.get(it.year).push(it);
  }
  const byYear = [...yearMap.entries()].sort((a, b) => b[0] - a[0]).map(([year, list]) => {
    const placeMode = mode(list.map(x => x.place).filter(Boolean));
    return { year, yearsAgo: refYear - year, count: list.length, place: placeMode, itemIds: list.map(x => x.id) };
  });

  // --- anniversary badges + comparisons -------------------------------------
  const anniversaryBadges = [...new Set(items.map(i => i.yearsAgo))].sort((a, b) => a - b)
    .map(y => ({ yearsAgo: y, label: `${y} ${y === 1 ? 'year' : 'years'} ago`, count: items.filter(i => i.yearsAgo === y).length }));
  const comparisons = byYear.map(y => ({
    year: y.year, yearsAgo: y.yearsAgo,
    headline: `${y.yearsAgo} ${y.yearsAgo === 1 ? 'year' : 'years'} ago${y.place ? ` in ${y.place}` : ''}`,
    place: y.place, count: y.count,
  }));

  // --- category breakdown ---------------------------------------------------
  const catMap = new Map();
  for (const it of items) catMap.set(it.category, (catMap.get(it.category) ?? 0) + 1);
  const categories = [...catMap.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([category, count]) => ({ category, count }));

  return {
    date: refDate, monthDay, referenceYear: refYear, hasMemories: true,
    label: `${Number(monthDay.slice(3))} ${MONTHS[Number(monthDay.slice(0, 2)) - 1]}`,
    hero, items,
    byYear, anniversaryBadges,
    milestones: items.filter(i => i.isMilestone).map(i => i.id),
    comparisons, categories,
    basedOn: lifetime.basedOn,
  };
}

function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  for (const [v, c] of counts) if (!best || c > best.count) best = { value: v, count: c };
  return best ? best.value : null;
}
