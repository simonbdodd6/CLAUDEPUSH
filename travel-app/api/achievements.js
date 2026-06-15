// Travel App — Travel Achievement Engine (M29).
//
// Achievements are NEVER manually awarded — every one is EARNED deterministically
// from evidence already stored (memories + trips), via the lifetime data layers.
// NO AI, NO randomness. Tiered series (Bronze→Legend), one-off milestones,
// seasonal & yearly badges, progress %, rarity scoring, hidden achievements, and
// an earned-history timeline.
//
// Reuses buildWorld + buildGlobe + enrichMemories (zero duplicated enrichment).
// No platform change; no backend term leaks.

import { buildGlobe, haversineKm } from './globe.js';
import { buildWorld } from './world.js';
import { enrichMemories } from './travel-dna.js';
import { dayOf } from './feed.js';

const SEASONS = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'];
const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Legend'];
const TIER_META = {
  Bronze: { rarity: 'common', weight: 1 }, Silver: { rarity: 'uncommon', weight: 2 },
  Gold: { rarity: 'rare', weight: 3 }, Platinum: { rarity: 'epic', weight: 4 }, Legend: { rarity: 'legendary', weight: 5 },
};

function confidenceFor(count) { return count >= 12 ? 'defining' : count >= 4 ? 'strong' : 'emerging'; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function monthOf(iso) { return new Date(iso).getUTCMonth(); }
function yearOf(iso) { return new Date(iso).getUTCFullYear(); }
function rarityScore(tier, n) { return clamp(TIER_META[tier].weight * 15 + Math.round(Math.log2(n + 1) * 4), 0, 100); }

// --- detectors --------------------------------------------------------------
const RE = {
  flight: /\b(flight|flew|fly|flying|plane|airport|boarding|landed|red.?eye)\b/i,
  ferry: /\b(ferry|boat|fast boat|speed ?boat|sail|dinghy)\b/i,
  surf: /\b(surf|surfing|surfed|swell|barrel|lineup|point break)\b/i,
  culture: /\b(temple|museum|gallery|heritage|ruins|culture|festival|ceremony)\b/i,
  road: /\b(road trip|scooter|motorbike|moped|drive|driving|the road)\b/i,
  sunset: /\b(sunset|dusk|golden hour)\b/i,
  sunrise: /\b(sunrise|dawn|first light)\b/i,
  nationalPark: /\b(national park)\b/i,
  unesco: /\b(unesco|world heritage)\b/i,
};
const hasCat = (i, c) => i.cats.includes(c);
const isAdventure = (i) => i.cats.some(c => c === 'dive' || c === 'mountain' || c === 'wildlife');

export function buildAchievements(events, trips = []) {
  const items = enrichMemories(events, trips);
  const world = buildWorld(events, trips);
  const globe = buildGlobe(events, trips);

  // helper: trip covering a given ISO date
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

  // --- ordered evidence per metric (chronological) --------------------------
  const cumulative = (pred) => items.filter(pred).map(i => ({ date: i.entry.timestamp, entry: i.entry }));
  const distinctDays = (pred) => {
    const seen = new Set(); const out = [];
    for (const i of items) { if (!pred(i)) continue; const k = dayOf(i.entry.timestamp); if (seen.has(k)) continue; seen.add(k); out.push({ date: i.entry.timestamp, entry: i.entry }); }
    return out;
  };
  const firstVisitDates = (locations) => locations.map(l => ({ date: l.firstVisit })).filter(x => x.date).sort((a, b) => a.date.localeCompare(b.date));

  // distinct continents with first-visit date
  const continentFirst = new Map();
  for (const c of world.countries) {
    const cont = ({ Indonesia: 'Asia', Singapore: 'Asia', Thailand: 'Asia', Malaysia: 'Asia', Vietnam: 'Asia', Japan: 'Asia', India: 'Asia', France: 'Europe', Spain: 'Europe', Italy: 'Europe', 'United Kingdom': 'Europe', Australia: 'Oceania', 'New Zealand': 'Oceania', 'United States': 'North America', USA: 'North America', Canada: 'North America', Brazil: 'South America', Peru: 'South America', Morocco: 'Africa', Kenya: 'Africa', 'South Africa': 'Africa' })[c.name] ?? null;
    if (!cont) continue;
    if (!continentFirst.has(cont) || c.firstVisit < continentFirst.get(cont)) continentFirst.set(cont, c.firstVisit);
  }

  // returned-to-same-place ordered by 2nd-visit date (from globe markers)
  const startsByPlace = new Map();
  for (const m of globe.markers) { if (!startsByPlace.has(m.place)) startsByPlace.set(m.place, []); startsByPlace.get(m.place).push({ start: m.startDate, island: m.island }); }
  const returns = [...startsByPlace.entries()].map(([place, arr]) => ({ place, island: arr[0].island, starts: arr.map(a => a.start).sort() }))
    .filter(p => p.starts.length > 1).map(p => ({ date: p.starts[1], place: p.place, island: p.island })).sort((a, b) => a.date.localeCompare(b.date));

  // companion trips (top companion)
  const companionTrips = new Map();
  for (const i of items) for (const n of i.companions) { if (!companionTrips.has(n)) companionTrips.set(n, new Set()); if (i.tripId) companionTrips.get(n).add(i.tripId); }
  let topCompanion = null;
  for (const [n, set] of companionTrips) if (!topCompanion || set.size > topCompanion.count) topCompanion = { name: n, count: set.size, tripIds: [...set] };
  const companionOrdered = topCompanion
    ? topCompanion.tripIds.map(id => trips.find(t => t.tripId === id)).filter(Boolean).map(t => ({ date: `${String(t.startDate).slice(0, 10)}T00:00:00Z` })).sort((a, b) => a.date.localeCompare(b.date))
    : [];

  const M = {
    flights: cumulative(i => RE.flight.test(i.text) || hasCat(i, 'flight')),
    ferries: cumulative(i => RE.ferry.test(i.text)),
    dives: cumulative(i => hasCat(i, 'dive')),
    surf: cumulative(i => RE.surf.test(i.text)),
    hiking: cumulative(i => hasCat(i, 'mountain')),
    photos: cumulative(i => i.entry.kind === 'photo'),
    wildlife: cumulative(i => hasCat(i, 'wildlife')),
    food: cumulative(i => hasCat(i, 'food')),
    culture: cumulative(i => hasCat(i, 'city') || RE.culture.test(i.text)),
    adventure: cumulative(isAdventure),
    road: cumulative(i => RE.road.test(i.text)),
    sunsets: cumulative(i => RE.sunset.test(i.text)),
    sunrises: cumulative(i => RE.sunrise.test(i.text)),
    nationalParks: cumulative(i => RE.nationalPark.test(i.text)),
    unesco: cumulative(i => RE.unesco.test(i.text)),
    beaches: distinctDays(i => hasCat(i, 'beach')),
    mountainsDays: distinctDays(i => hasCat(i, 'mountain')),
    daysAbroad: distinctDays(() => true),
    countries: firstVisitDates(world.countries),
    islands: firstVisitDates(world.islands),
    cities: firstVisitDates(world.cities),
    continents: [...continentFirst.values()].sort().map(date => ({ date })),
    returns: returns.map(r => ({ date: r.date })),
    companionTrips: companionOrdered,
  };

  // --- series catalogue -----------------------------------------------------
  const CATALOGUE = [
    { id: 'countries', category: 'Countries', icon: 'globe', label: 'Countries', metric: 'countries', ns: [1, 5, 10, 20, 30] },
    { id: 'islands', category: 'Islands', icon: 'island', label: 'Islands', metric: 'islands', ns: [1, 5, 10, 25, 50] },
    { id: 'cities', category: 'Cities', icon: 'city', label: 'Cities', metric: 'cities', ns: [1, 5, 10, 25, 50] },
    { id: 'continents', category: 'Continents', icon: 'continents', label: 'Continents', metric: 'continents', ns: [1, 2, 4, 6, 7], legendTitle: 'Visited Every Continent' },
    { id: 'flights', category: 'Flights', icon: 'airplane', label: 'Flights', metric: 'flights', ns: [1, 10, 50, 100, 250] },
    { id: 'ferries', category: 'Ferries', icon: 'boat', label: 'Ferries', metric: 'ferries', ns: [1, 5, 10, 25, 50] },
    { id: 'roadtrips', category: 'Road Trips', icon: 'road', label: 'Road Trips', metric: 'road', ns: [1, 3, 5, 10, 25] },
    { id: 'diving', category: 'Diving', icon: 'dive', label: 'Dives', metric: 'dives', ns: [1, 10, 25, 50, 100] },
    { id: 'surfing', category: 'Surfing', icon: 'surf', label: 'Surf Sessions', metric: 'surf', ns: [1, 5, 10, 25, 50] },
    { id: 'hiking', category: 'Hiking', icon: 'mountain', label: 'Hikes', metric: 'hiking', ns: [1, 5, 10, 25, 50] },
    { id: 'mountains', category: 'Mountains', icon: 'mountain', label: 'Mountain Days', metric: 'mountainsDays', ns: [1, 5, 10, 25, 50] },
    { id: 'beaches', category: 'Beaches', icon: 'beach', label: 'Beach Days', metric: 'beaches', ns: [1, 25, 50, 100, 250] },
    { id: 'photography', category: 'Photography', icon: 'camera', label: 'Photos', metric: 'photos', ns: [10, 100, 500, 1000, 5000] },
    { id: 'wildlife', category: 'Wildlife', icon: 'wildlife', label: 'Wildlife Encounters', metric: 'wildlife', ns: [1, 5, 10, 25, 50] },
    { id: 'food', category: 'Food', icon: 'food', label: 'Food Experiences', metric: 'food', ns: [1, 5, 10, 25, 50] },
    { id: 'culture', category: 'Culture', icon: 'culture', label: 'Culture Visits', metric: 'culture', ns: [1, 5, 10, 25, 50] },
    { id: 'adventure', category: 'Adventure', icon: 'adventure', label: 'Adventures', metric: 'adventure', ns: [1, 10, 25, 50, 100] },
    { id: 'sunsets', category: 'Photography', icon: 'sunset', label: 'Sunsets', metric: 'sunsets', ns: [1, 10, 25, 50, 100], legendTitle: 'Sunset Collector' },
    { id: 'sunrises', category: 'Photography', icon: 'sunrise', label: 'Sunrises', metric: 'sunrises', ns: [1, 10, 25, 50, 100], legendTitle: 'Sunrise Collector' },
    { id: 'daysabroad', category: 'Lifetime', icon: 'calendar', label: 'Days Abroad', metric: 'daysAbroad', ns: [7, 30, 100, 365, 1000] },
    { id: 'return', category: 'Return Traveller', icon: 'repeat', label: 'Return Visits', metric: 'returns', ns: [1, 3, 5, 10, 20] },
    { id: 'companions', category: 'Return Traveller', icon: 'people', label: 'Trips Together', metric: 'companionTrips', ns: [1, 3, 5, 10, 20] },
    { id: 'nationalparks', category: 'National Parks', icon: 'park', label: 'National Parks', metric: 'nationalParks', ns: [1, 3, 5, 10, 25], hidden: true },
    { id: 'unesco', category: 'UNESCO', icon: 'unesco', label: 'UNESCO Sites', metric: 'unesco', ns: [1, 3, 5, 10, 25], hidden: true },
  ];

  const singular = (label) => (/ies$/.test(label) ? label.replace(/ies$/, 'y') : label.replace(/s$/, ''));
  const levelTitle = (spec, tier, n) => {
    if (tier === 'Legend' && spec.legendTitle) return spec.legendTitle;
    if (spec.id === 'companions' && n > 1) return `Travelled With Same Companion ${n} Trips`;
    if (n === 1) return `First ${singular(spec.label)}`;
    return `${n} ${spec.label}`;
  };

  const achievements = [];
  const seriesList = [];

  for (const spec of CATALOGUE) {
    const ordered = M[spec.metric] ?? [];
    const current = ordered.length;
    const levels = [];
    spec.ns.forEach((n, idx) => {
      const tier = TIERS[idx];
      const earned = current >= n;
      const earnedDate = earned ? (ordered[n - 1]?.date ?? null) : null;
      const used = ordered.slice(Math.max(0, (earned ? n : current) - 3), (earned ? n : current));
      const supportingMemories = used.map(o => o.entry).filter(Boolean).slice(0, 6);
      const supportingTrips = tripsForDates(ordered.slice(0, earned ? n : current).map(o => o.date));
      const ach = {
        id: `${spec.id}-${tier.toLowerCase()}`, seriesId: spec.id, category: spec.category, scope: 'lifetime',
        hidden: !!spec.hidden, title: levelTitle(spec, tier, n), subtitle: `${spec.category} · ${tier}`,
        tier, rarity: TIER_META[tier].rarity, rarityScore: rarityScore(tier, n), iconId: spec.icon,
        earned, earnedDate, confidence: confidenceFor(Math.min(current, n)),
        progress: { current, target: n, percent: clamp(Math.round((current / n) * 100), 0, 100), remaining: Math.max(0, n - current), isComplete: earned },
        remaining: Math.max(0, n - current),
        evidence: { count: current, detail: `${current} / ${n} ${spec.label.toLowerCase()}` },
        supportingMemories, supportingTrips,
        statistics: { value: current, target: n },
      };
      achievements.push(ach);
      levels.push({ tier, title: ach.title, achievementId: ach.id, earned });
    });
    const earnedLevels = levels.filter(l => l.earned);
    const currentTier = earnedLevels.length ? earnedLevels[earnedLevels.length - 1].tier : null;
    const nextLevel = levels.find(l => !l.earned) ?? null;
    seriesList.push({
      id: spec.id, category: spec.category, title: spec.label, icon: spec.icon, levels,
      currentTier, nextTier: nextLevel?.tier ?? null,
      progressToNext: nextLevel ? clamp(Math.round((current / spec.ns[levels.indexOf(nextLevel)]) * 100), 0, 100) : 100,
    });
  }

  // --- one-off milestones ---------------------------------------------------
  const milestone = (o) => {
    const ach = {
      id: o.id, seriesId: null, category: o.category, scope: o.scope ?? 'lifetime', hidden: !!o.hidden,
      title: o.title, subtitle: o.subtitle, tier: o.tier, rarity: TIER_META[o.tier].rarity, rarityScore: o.rarityScore ?? rarityScore(o.tier, o.n ?? 1),
      iconId: o.icon, earned: o.earned, earnedDate: o.earned ? (o.earnedDate ?? null) : null, confidence: o.confidence ?? (o.earned ? 'strong' : 'emerging'),
      progress: { current: o.current ?? (o.earned ? 1 : 0), target: o.target ?? 1, percent: o.earned ? 100 : clamp(Math.round(((o.current ?? 0) / (o.target ?? 1)) * 100), 0, 100), remaining: o.earned ? 0 : Math.max(0, (o.target ?? 1) - (o.current ?? 0)), isComplete: o.earned },
      remaining: o.earned ? 0 : Math.max(0, (o.target ?? 1) - (o.current ?? 0)),
      evidence: { count: o.current ?? (o.earned ? 1 : 0), detail: o.detail ?? '' },
      supportingMemories: o.supportingMemories ?? [], supportingTrips: o.supportingTrips ?? [],
      statistics: o.statistics ?? {},
    };
    achievements.push(ach);
    return ach;
  };

  // Longest Journey
  if (globe.arcs.length) {
    const longest = [...globe.arcs].sort((a, b) => b.distanceKm - a.distanceKm)[0];
    const mFrom = globe.markers.find(m => m.id === longest.fromMarkerId);
    const mTo = globe.markers.find(m => m.id === longest.toMarkerId);
    milestone({ id: 'longest-journey', category: 'Adventure', icon: 'route', tier: 'Gold', title: 'Longest Journey', subtitle: `${mFrom?.place} → ${mTo?.place}`, earned: true, earnedDate: mTo?.startDate ?? null, detail: `${longest.distanceKm} km by ${longest.transport}`, statistics: { distanceKm: longest.distanceKm, transport: longest.transport }, supportingTrips: tripsForDates([mTo?.startDate].filter(Boolean)) });
  }
  // Returned to Same Island (hidden)
  const islandReturn = returns.find(r => r.island);
  milestone({ id: 'returned-same-island', category: 'Islands', icon: 'repeat', tier: 'Silver', title: 'Returned to Same Island', subtitle: islandReturn ? islandReturn.island : 'Return to an island', hidden: true, earned: !!islandReturn, earnedDate: islandReturn?.date ?? null, detail: islandReturn ? `Returned to ${islandReturn.island}` : '', statistics: { island: islandReturn?.island ?? null }, supportingTrips: tripsForDates([islandReturn?.date].filter(Boolean)) });
  // Most Remote Island (hidden)
  const islandMarkers = globe.markers.filter(m => m.island);
  if (islandMarkers.length && globe.markers.length > 1) {
    const centroid = { lat: globe.markers.reduce((s, m) => s + m.latitude, 0) / globe.markers.length, lng: globe.markers.reduce((s, m) => s + m.longitude, 0) / globe.markers.length };
    const remote = [...islandMarkers].map(m => ({ m, d: haversineKm({ lat: m.latitude, lng: m.longitude }, centroid) })).sort((a, b) => b.d - a.d)[0];
    milestone({ id: 'most-remote-island', category: 'Islands', icon: 'island', tier: 'Platinum', title: 'Most Remote Island', subtitle: remote.m.island, hidden: true, earned: true, earnedDate: remote.m.startDate, detail: `${remote.d} km from the heart of your travels`, statistics: { island: remote.m.island, distanceKm: remote.d } });
  }
  // Explorer badges
  const oceanCount = items.filter(i => i.cats.includes('beach') || i.cats.includes('dive')).length;
  const cultureCount = M.culture.length; const foodCount = M.food.length;
  milestone({ id: 'ocean-explorer', category: 'Adventure', icon: 'beach', tier: 'Gold', title: 'Ocean Explorer', subtitle: 'A life by the water', earned: oceanCount >= 25, current: oceanCount, target: 25, earnedDate: oceanCount >= 25 ? items.filter(i => i.cats.includes('beach') || i.cats.includes('dive'))[24]?.entry.timestamp : null, detail: `${oceanCount} / 25 ocean memories` });
  milestone({ id: 'culture-explorer', category: 'Culture', icon: 'culture', tier: 'Gold', title: 'Culture Explorer', subtitle: 'Seeker of places and people', earned: cultureCount >= 15, current: cultureCount, target: 15, earnedDate: cultureCount >= 15 ? M.culture[14]?.date : null, detail: `${cultureCount} / 15 culture memories` });
  milestone({ id: 'food-explorer', category: 'Food', icon: 'food', tier: 'Gold', title: 'Food Explorer', subtitle: 'Tastes of the world', earned: foodCount >= 15, current: foodCount, target: 15, earnedDate: foodCount >= 15 ? M.food[14]?.date : null, detail: `${foodCount} / 15 food memories` });

  // Seasonal badges
  const bySeason = new Map();
  for (const i of items) { const s = SEASONS[monthOf(i.entry.timestamp)]; if (!bySeason.has(s)) bySeason.set(s, []); bySeason.get(s).push(i); }
  for (const season of ['Spring', 'Summer', 'Autumn', 'Winter']) {
    const list = (bySeason.get(season) ?? []).map(i => ({ date: i.entry.timestamp, entry: i.entry })).sort((a, b) => a.date.localeCompare(b.date));
    milestone({ id: `season-${season.toLowerCase()}`, category: 'Seasonal', icon: 'leaf', tier: 'Silver', scope: 'seasonal', title: `${season} Wanderer`, subtitle: `Travels in ${season.toLowerCase()}`, earned: list.length >= 5, current: list.length, target: 5, earnedDate: list[4]?.date ?? null, detail: `${list.length} / 5 ${season.toLowerCase()} memories`, supportingMemories: list.slice(0, 6).map(o => o.entry) });
  }

  // Yearly badges + Adventure Year (hidden)
  for (const era of world.eras) {
    milestone({ id: `year-${era.year}`, category: 'Yearly', icon: 'calendar', tier: 'Silver', scope: 'yearly', title: `Traveller of ${era.year}`, subtitle: `${era.memoryCount} memories`, earned: era.memoryCount >= 5, current: era.memoryCount, target: 5, earnedDate: era.memoryCount >= 5 ? era.span?.to : null, detail: `${era.memoryCount} / 5 memories in ${era.year}`, statistics: { year: era.year, memories: era.memoryCount } });
  }
  const advByYear = new Map();
  for (const i of items) { if (!isAdventure(i)) continue; const y = yearOf(i.entry.timestamp); advByYear.set(y, (advByYear.get(y) ?? 0) + 1); }
  const topAdvYear = [...advByYear.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  milestone({ id: 'adventure-year', category: 'Adventure', icon: 'adventure', tier: 'Gold', scope: 'yearly', title: 'Adventure Year', subtitle: topAdvYear ? `${topAdvYear[0]}` : 'A year of adventure', hidden: true, earned: !!topAdvYear && topAdvYear[1] >= 10, current: topAdvYear?.[1] ?? 0, target: 10, earnedDate: null, detail: `${topAdvYear?.[1] ?? 0} / 10 adventures in a year` });

  // --- assemble -------------------------------------------------------------
  const earned = achievements.filter(a => a.earned);
  const byTier = Object.fromEntries(TIERS.map(t => [t, earned.filter(a => a.tier === t).length]));
  const categoriesMap = new Map();
  for (const a of achievements) {
    if (!categoriesMap.has(a.category)) categoriesMap.set(a.category, { id: a.category, label: a.category, icon: a.iconId, total: 0, earned: 0 });
    const c = categoriesMap.get(a.category); c.total += 1; if (a.earned) c.earned += 1;
  }
  const categories = [...categoriesMap.values()].sort((a, b) => b.earned - a.earned || a.label.localeCompare(b.label));
  const timeline = earned.filter(a => a.earnedDate).sort((a, b) => a.earnedDate.localeCompare(b.earnedDate))
    .map(a => ({ achievementId: a.id, title: a.title, tier: a.tier, category: a.category, earnedDate: a.earnedDate }));
  const rewards = earned.map(a => ({ achievementId: a.id, tier: a.tier, badge: a.tier.toLowerCase(), frame: a.tier.toLowerCase(), titleUnlock: a.title }));
  const totalRarity = earned.reduce((s, a) => s + a.rarityScore, 0);

  const statistics = {
    totalEarned: earned.length, totalAvailable: achievements.length,
    completion: clamp(Math.round((earned.length / Math.max(1, achievements.length)) * 100), 0, 100),
    byTier, byCategory: categories.map(c => ({ category: c.id, earned: c.earned, total: c.total })),
    rarityScore: totalRarity, legendCount: byTier.Legend, hiddenEarned: earned.filter(a => a.hidden).length,
  };

  return {
    summary: { totalEarned: earned.length, totalAvailable: achievements.length, completion: statistics.completion, byTier, rarityScore: totalRarity },
    categories, series: seriesList, achievements,
    earned: earned.map(a => a.id), timeline, rewards, statistics,
    basedOn: world.basedOn,
  };
}
