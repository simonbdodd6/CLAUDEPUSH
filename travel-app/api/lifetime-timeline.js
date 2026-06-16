// Travel App — Lifetime Travel Timeline (M30).
//
// Assembles a traveller's ENTIRE travel life into one beautiful chronological
// story of typed "moments" — firsts, milestones, returns, achievements,
// relationships, memories and journeys — grouped into years, months and eras.
// NO AI, NO generated prose, NO randomness. Pure presentation: the UI renders it
// with almost zero logic.
//
// Reuses the existing engines (achievements, world, globe, relationships, memory
// enrichment) — zero duplicated enrichment. No platform change; no backend leak.

import { buildAchievements } from './achievements.js';
import { buildWorld } from './world.js';
import { buildGlobe } from './globe.js';
import { buildRelationships } from './relationships.js';
import { enrichMemories } from './travel-dna.js';
import { inclusiveDays, dayOf } from './feed.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TONE = { 'first-visit': 'joyful', milestone: 'proud', achievement: 'proud', return: 'nostalgic', relationship: 'warm', memory: 'reflective', journey: 'adventurous' };
const ACTIVITY_CATEGORIES = new Set(['Diving', 'Surfing', 'Hiking', 'Mountains', 'Beaches', 'Food', 'Culture', 'Wildlife', 'Adventure', 'Photography']);

function yearOf(iso) { return new Date(iso).getUTCFullYear(); }
function monthOf(iso) { return new Date(iso).getUTCMonth(); }
function confidenceFor(count) { return count >= 12 ? 'defining' : count >= 4 ? 'strong' : 'emerging'; }

export function buildLifetimeTimeline(events, trips = []) {
  const items = enrichMemories(events, trips);
  const world = buildWorld(events, trips);
  const globe = buildGlobe(events, trips);
  const achievements = buildAchievements(events, trips);
  const relationships = buildRelationships(events, trips);

  const tripForDate = (iso) => {
    if (!iso) return null;
    const d = String(iso).slice(0, 10);
    return trips.find(t => t.startDate && d >= String(t.startDate).slice(0, 10) && (!t.endDate || d <= String(t.endDate).slice(0, 10))) || null;
  };
  const tripsForDates = (dates) => {
    const seen = new Map();
    for (const d of dates) { const t = tripForDate(d); if (t && !seen.has(t.tripId)) seen.set(t.tripId, { tripId: t.tripId, name: t.tripName ?? t.destination ?? t.tripId }); }
    return [...seen.values()].slice(0, 5);
  };

  // place -> country (from the lifetime world)
  const placeCountry = new Map();
  const countryNames = new Set(world.countries.map(c => c.name));
  for (const loc of [...world.countries, ...world.regions, ...world.islands, ...world.cities]) {
    for (const pl of loc.places) if (loc.country) placeCountry.set(pl, loc.country);
  }

  const moments = [];
  const seenIds = new Set();
  const moment = (o) => {
    if (!o.date || seenIds.has(o.id)) return;
    seenIds.add(o.id);
    moments.push({
      id: o.id, type: o.type, title: o.title, subtitle: o.subtitle ?? null,
      date: o.date, year: yearOf(o.date), month: monthOf(o.date) + 1,
      supportingMemories: (o.supportingMemories ?? []).slice(0, 6),
      supportingTrips: o.supportingTrips ?? [],
      relatedAchievements: o.relatedAchievements ?? [],
      relatedPlaces: o.relatedPlaces ?? [],
      relatedCompanions: o.relatedCompanions ?? [],
      emotionalTone: o.emotionalTone ?? TONE[o.type] ?? 'reflective',
      iconId: o.iconId ?? 'sparkles',
      confidence: o.confidence ?? 'emerging',
      evidence: o.evidence ?? { count: 0, detail: '' },
      category: o.category ?? null, tier: o.tier ?? null, favourite: !!o.favourite,
    });
  };

  // --- moments from earned achievements -------------------------------------
  const earnedAch = achievements.achievements.filter(a => a.earned && a.earnedDate);
  for (const a of earnedAch) {
    if (a.seriesId === 'return' || a.id === 'returned-same-island') continue; // dedicated return moments
    if (a.seriesId === 'companions') continue; // dedicated relationship moments
    const isFirst = a.tier === 'Bronze' && /^First /.test(a.title);
    const type = isFirst ? 'first-visit' : (a.seriesId ? 'milestone' : 'achievement');
    const relatedPlaces = [a.statistics?.island, a.statistics?.country].filter(Boolean);
    moment({
      id: `ach-${a.id}`, type, title: a.title, subtitle: a.subtitle,
      date: a.earnedDate, supportingMemories: a.supportingMemories, supportingTrips: a.supportingTrips,
      relatedAchievements: [a.id], relatedPlaces, iconId: a.iconId, confidence: a.confidence,
      evidence: a.evidence, category: a.category, tier: a.tier,
      favourite: a.tier === 'Platinum' || a.tier === 'Legend',
    });
  }

  // --- first trip / longest trip --------------------------------------------
  const datedTrips = trips.filter(t => t?.startDate).slice().sort((x, y) => String(x.startDate).localeCompare(String(y.startDate)));
  if (datedTrips.length) {
    const first = datedTrips[0];
    moment({ id: 'first-trip', type: 'milestone', title: 'Your first trip', subtitle: first.tripName ?? first.destination ?? null, date: `${String(first.startDate).slice(0, 10)}T00:00:00Z`, relatedPlaces: [first.destination].filter(Boolean), supportingTrips: [{ tripId: first.tripId, name: first.tripName ?? first.destination ?? first.tripId }], iconId: 'suitcase', confidence: 'strong', evidence: { count: 1, detail: 'Where it all began' } });
    const longest = datedTrips.map(t => ({ t, d: inclusiveDays(t.startDate, t.endDate) ?? 0 })).sort((a, b) => b.d - a.d)[0];
    if (longest.d > 0) moment({ id: 'longest-trip', type: 'milestone', title: 'Your longest trip', subtitle: `${longest.d} days in ${longest.t.destination ?? 'the world'}`, date: `${String(longest.t.startDate).slice(0, 10)}T00:00:00Z`, relatedPlaces: [longest.t.destination].filter(Boolean), supportingTrips: [{ tripId: longest.t.tripId, name: longest.t.tripName ?? longest.t.destination ?? longest.t.tripId }], iconId: 'calendar', confidence: 'strong', evidence: { count: longest.d, detail: `${longest.d} days` } });
  }

  // --- first memory ---------------------------------------------------------
  if (items.length) {
    const first = items[0];
    moment({ id: 'first-memory', type: 'memory', title: 'Your first memory', subtitle: first.entry.title, date: first.entry.timestamp, supportingMemories: [first.entry], supportingTrips: tripsForDates([first.entry.timestamp]), relatedPlaces: [first.destination].filter(Boolean), relatedCompanions: first.companions, iconId: 'sparkles', confidence: 'strong', evidence: { count: 1, detail: 'The first you captured' } });
  }

  // --- most photographed day ------------------------------------------------
  const dayPhotos = new Map();
  for (const i of items) { if (i.entry.kind !== 'photo') continue; const k = dayOf(i.entry.timestamp); if (!dayPhotos.has(k)) dayPhotos.set(k, []); dayPhotos.get(k).push(i.entry); }
  let topDay = null;
  for (const [k, ph] of [...dayPhotos.entries()].sort((a, b) => a[0].localeCompare(b[0]))) if (!topDay || ph.length > topDay.ph.length) topDay = { k, ph };
  if (topDay && topDay.ph.length >= 2) {
    const date = topDay.ph[0].timestamp;
    moment({ id: 'most-photographed-day', type: 'journey', title: 'Most photographed day', subtitle: `${topDay.ph.length} photos in a single day`, date, supportingMemories: topDay.ph, supportingTrips: tripsForDates([date]), iconId: 'camera', confidence: confidenceFor(topDay.ph.length), evidence: { count: topDay.ph.length, detail: `${topDay.ph.length} photos` } });
  }

  // --- favourite memories (deterministic emotional score) -------------------
  const scored = items.filter(i => i.entry.kind === 'photo').map(i => ({
    i, s: (i.cats.includes('sunset') ? 2 : 0) + (i.cats.includes('dive') ? 2 : 0) + (i.cats.includes('wildlife') ? 1 : 0) + (i.entry.detail ? 1 : 0),
  })).filter(x => x.s > 0).sort((a, b) => b.s - a.s || a.i.entry.timestamp.localeCompare(b.i.entry.timestamp)).slice(0, 3);
  scored.forEach((x, idx) => moment({
    id: `favourite-memory-${idx}`, type: 'memory', title: 'A favourite memory', subtitle: x.i.entry.title,
    date: x.i.entry.timestamp, supportingMemories: [x.i.entry], supportingTrips: tripsForDates([x.i.entry.timestamp]),
    relatedPlaces: [x.i.destination].filter(Boolean), relatedCompanions: x.i.companions, iconId: 'heart',
    confidence: 'strong', evidence: { count: 1, detail: 'One that stayed with you' }, favourite: true,
  }));

  // --- return moments (per revisited place, from globe markers) -------------
  const startsByPlace = new Map();
  for (const m of globe.markers) { if (!startsByPlace.has(m.place)) startsByPlace.set(m.place, []); startsByPlace.get(m.place).push(m.startDate); }
  for (const [place, starts] of startsByPlace) {
    if (starts.length < 2) continue;
    const sorted = [...starts].sort();
    moment({ id: `return-${place.toLowerCase().replace(/\s+/g, '-')}`, type: 'return', title: `You returned to ${place}`, subtitle: `Visit ${starts.length}`, date: sorted[1], relatedPlaces: [place], supportingTrips: tripsForDates([sorted[1]]), iconId: 'repeat', confidence: 'strong', evidence: { count: starts.length, detail: `${starts.length} visits` } });
  }

  // --- relationship moments (top companions) --------------------------------
  for (const c of relationships.companions.slice(0, 2)) {
    const shared = items.filter(i => i.companions.includes(c.name)).map(i => i.entry).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (shared.length) {
      moment({ id: `first-with-${c.name.toLowerCase().replace(/\s+/g, '-')}`, type: 'relationship', title: `First trip with ${c.name}`, subtitle: 'The start of shared journeys', date: shared[0].timestamp, supportingMemories: shared.slice(0, 6), supportingTrips: tripsForDates(shared.map(e => e.timestamp)), relatedCompanions: [c.name], iconId: 'heart', confidence: confidenceFor(shared.length), evidence: { count: shared.length, detail: `${shared.length} shared memories` } });
      if (c.stats.tripsTogether >= 2) {
        moment({ id: `trips-with-${c.name.toLowerCase().replace(/\s+/g, '-')}`, type: 'relationship', title: `${c.stats.tripsTogether} trips with ${c.name}`, subtitle: c.favouriteDestination ? `Often in ${c.favouriteDestination}` : 'A steady travel companion', date: shared[shared.length - 1].timestamp, supportingMemories: shared.slice(-6), supportingTrips: tripsForDates(shared.map(e => e.timestamp)), relatedCompanions: [c.name], iconId: 'people', confidence: 'strong', evidence: { count: c.stats.tripsTogether, detail: `${c.stats.tripsTogether} trips together` } });
      }
    }
  }

  // --- order the story ------------------------------------------------------
  moments.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  // --- group into years + months --------------------------------------------
  const yearMap = new Map();
  for (const m of moments) {
    if (!yearMap.has(m.year)) yearMap.set(m.year, new Map());
    const months = yearMap.get(m.year);
    if (!months.has(m.month)) months.set(m.month, []);
    months.get(m.month).push(m.id);
  }
  const years = [...yearMap.entries()].sort((a, b) => a[0] - b[0]).map(([year, months]) => {
    const era = world.eras.find(e => e.year === year);
    const monthList = [...months.entries()].sort((a, b) => a[0] - b[0]).map(([month, ids]) => ({ year, month, label: MONTHS[month - 1], momentIds: ids, momentCount: ids.length }));
    const momentIds = monthList.flatMap(mm => mm.momentIds);
    return {
      year,
      summary: { trips: era?.trips ?? 0, countries: era?.countryCount ?? 0, places: era?.placeCount ?? 0, memories: era?.memoryCount ?? 0, photos: era?.photoCount ?? 0, moments: momentIds.length },
      months: monthList, momentIds,
      topMoment: momentIds.find(id => { const m = moments.find(x => x.id === id); return m && (m.tier === 'Legend' || m.tier === 'Platinum' || m.favourite); }) ?? momentIds[0] ?? null,
    };
  });

  // --- chapters / travel eras (consecutive active years) --------------------
  const activeYears = years.map(y => y.year);
  const chapters = [];
  let cur = null;
  for (const y of activeYears) {
    if (cur && y - cur.years[cur.years.length - 1] <= 1) cur.years.push(y);
    else { cur = { years: [y] }; chapters.push(cur); }
  }
  const chapterList = chapters.map((c, idx) => {
    const yrs = c.years;
    const inChapter = years.filter(y => yrs.includes(y.year));
    const countries = new Set(inChapter.flatMap(y => (world.eras.find(e => e.year === y.year)?.countries ?? [])));
    return {
      id: `chapter-${idx + 1}`, title: yrs.length > 1 ? `${yrs[0]}–${yrs[yrs.length - 1]}` : `${yrs[0]}`,
      years: yrs, from: `${yrs[0]}-01-01`, to: `${yrs[yrs.length - 1]}-12-31`,
      summary: { years: yrs.length, countries: [...countries], memories: inChapter.reduce((n, y) => n + y.summary.memories, 0), moments: inChapter.reduce((n, y) => n + y.momentIds.length, 0) },
    };
  });

  // --- filters --------------------------------------------------------------
  const groupIds = (keyFn) => {
    const map = new Map();
    for (const m of moments) for (const k of keyFn(m)) { if (k == null) continue; if (!map.has(k)) map.set(k, []); map.get(k).push(m.id); }
    return map;
  };
  const countryKeys = (m) => {
    const set = new Set();
    for (const p of m.relatedPlaces) { if (countryNames.has(p)) set.add(p); else if (placeCountry.has(p)) set.add(placeCountry.get(p)); }
    return [...set];
  };
  const byCountry = [...groupIds(countryKeys).entries()].map(([country, momentIds]) => ({ country, momentIds }));
  const byCompanion = [...groupIds(m => m.relatedCompanions).entries()].map(([companion, momentIds]) => ({ companion, momentIds }));
  const byActivity = [...groupIds(m => (m.category && ACTIVITY_CATEGORIES.has(m.category) ? [m.category] : [])).entries()].map(([activity, momentIds]) => ({ activity, momentIds }));
  const byAchievement = moments.filter(m => m.relatedAchievements.length).map(m => ({ momentId: m.id, achievementIds: m.relatedAchievements }));

  const filters = {
    byYear: years.map(y => ({ year: y.year, momentIds: y.momentIds })),
    byMonth: years.flatMap(y => y.months.map(mm => ({ year: mm.year, month: mm.month, label: mm.label, momentIds: mm.momentIds }))),
    byCountry, byCompanion, byActivity, byAchievement,
    favourites: moments.filter(m => m.favourite).map(m => m.id),
    firsts: moments.filter(m => m.type === 'first-visit' || m.id.startsWith('first-')).map(m => m.id),
    returns: moments.filter(m => m.type === 'return').map(m => m.id),
  };

  // --- summary --------------------------------------------------------------
  const span = moments.length ? { from: moments[0].date, to: moments[moments.length - 1].date } : null;
  const summary = {
    totalMoments: moments.length, years: years.length, chapters: chapterList.length, span,
    firstMoment: moments[0]?.id ?? null, latestMoment: moments[moments.length - 1]?.id ?? null,
    byType: moments.reduce((acc, m) => { acc[m.type] = (acc[m.type] ?? 0) + 1; return acc; }, {}),
  };

  return { summary, years, chapters: chapterList, moments, filters, basedOn: world.basedOn };
}
