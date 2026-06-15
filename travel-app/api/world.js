// Travel App — Lifetime World Engine (M28).
//
// The deterministic data layer for a traveller's ENTIRE visited world — not a
// single trip. It aggregates every place ever visited into countries, regions,
// islands and cities; builds travel eras (years), world connections (flights,
// ferries, repeat visits, return gaps), heat values for future rendering, and
// lifetime statistics. NO graphics, NO AI, NO randomness.
//
// Reuses the 3D Globe Engine (markers + great-circle arcs + coordinates) and the
// shared memory enrichment (companions, seasons) — zero duplicated enrichment.
// No platform change; no backend term leaks.

import { buildGlobe } from './globe.js';
import { enrichMemories } from './travel-dna.js';
import { CATEGORY_META, dayOf } from './feed.js';

const SEASONS = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'];
const CONTINENTS = {
  Indonesia: 'Asia', Singapore: 'Asia', Thailand: 'Asia', Malaysia: 'Asia', Vietnam: 'Asia', Cambodia: 'Asia', Laos: 'Asia', Philippines: 'Asia', Japan: 'Asia', China: 'Asia', India: 'Asia', 'Sri Lanka': 'Asia', Nepal: 'Asia',
  France: 'Europe', Spain: 'Europe', Italy: 'Europe', 'United Kingdom': 'Europe', Germany: 'Europe', Portugal: 'Europe', Greece: 'Europe', Netherlands: 'Europe',
  Australia: 'Oceania', 'New Zealand': 'Oceania', Fiji: 'Oceania',
  'United States': 'North America', USA: 'North America', Canada: 'North America', Mexico: 'North America',
  Brazil: 'South America', Peru: 'South America', Argentina: 'South America', Chile: 'South America', Colombia: 'South America',
  Morocco: 'Africa', Egypt: 'Africa', Kenya: 'Africa', Tanzania: 'Africa', 'South Africa': 'Africa',
};
const continentOf = (c) => (c ? CONTINENTS[c] ?? null : null);

function yearOf(iso) { return iso ? new Date(iso).getUTCFullYear() : null; }
function monthOf(iso) { return new Date(iso).getUTCMonth(); }
function confidenceFor(count) { return count >= 12 ? 'defining' : count >= 4 ? 'strong' : 'emerging'; }
function modeOf(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  for (const [v, c] of counts) if (v != null && (!best || c > best.count)) best = { value: v, count: c };
  return best;
}
function normalise(list, rawKey, outKey) {
  const max = Math.max(0, ...list.map(x => x[rawKey] ?? 0));
  for (const x of list) x[outKey] = max > 0 ? Math.round(((x[rawKey] ?? 0) / max) * 100) : 0;
  return list;
}
function placeOf(i) { return i.place ?? i.area ?? i.destination ?? i.country ?? null; }
function daysBetween(a, b) { return Math.round((Date.parse(`${String(b).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(a).slice(0, 10)}T00:00:00Z`)) / 86_400_000); }

const ACTIVITY_CATS = ['dive', 'mountain', 'wildlife', 'food', 'beach', 'sunset'];

function emptyWorld(globe) {
  return {
    profile: { firstVisit: null, latestVisit: null, span: null, totalCountries: 0, totalPlaces: 0, mostVisitedCountry: null, favouritePlace: null },
    countries: [], regions: [], islands: [], cities: [], eras: [], connections: [],
    repeatVisits: [], favouriteReturns: [], longestGaps: [],
    heat: { countryIntensity: [], cityIntensity: [], islandIntensity: [], revisitIntensity: [], memoryDensity: [], emotionalSignificance: [], photographyDensity: [], activityDensity: [] },
    statistics: { totalCountries: 0, totalCities: 0, totalIslands: 0, continents: 0, yearsTravelled: 0, totalTransportLegs: 0, totalFlights: 0, totalFerries: 0, totalJourneys: 0, totalPlaces: 0, totalMemories: 0, totalPhotos: 0, totalDays: 0 },
    worldStatistics: [],
    filters: { byYear: [], byContinent: [], byCountry: [], byCompanion: [], byActivity: [], bySeason: [], favourites: [], firstVisits: [], latestVisits: [] },
    basedOn: globe.basedOn,
  };
}

// Roll a set of per-place aggregates into a Visited* DTO.
function aggregateGroup(name, members, type) {
  const all = members;
  const memories = all.flatMap(p => p.memories);
  const photoMemories = memories.filter(e => e.kind === 'photo');
  const months = all.flatMap(p => p.months);
  const companions = new Map();
  for (const p of all) for (const [n, c] of p.companions) companions.set(n, (companions.get(n) ?? 0) + c);
  const visitCount = all.reduce((n, p) => n + p.visitCount, 0);
  const totalDays = all.reduce((n, p) => n + p.totalDays, 0);
  const photos = all.reduce((n, p) => n + p.photos, 0);
  const sunsets = all.reduce((n, p) => n + p.sunsets, 0);
  const journals = all.reduce((n, p) => n + p.journals, 0);
  const activityHits = all.reduce((n, p) => n + p.activityHits, 0);
  const memoryCount = memories.length;
  const firstVisit = all.map(p => p.firstVisit).sort()[0];
  const latestVisit = all.map(p => p.latestVisit).sort().slice(-1)[0];
  const favSeason = modeOf(months.map(m => SEASONS[m]));
  const coords = all.filter(p => p.geo);
  const coordinates = coords.length
    ? { latitude: Math.round((coords.reduce((s, p) => s + p.geo.lat, 0) / coords.length) * 1000) / 1000, longitude: Math.round((coords.reduce((s, p) => s + p.geo.lng, 0) / coords.length) * 1000) / 1000 }
    : null;
  const favouriteMemories = [...photoMemories, ...memories.filter(e => e.kind !== 'photo')].slice(0, 6);

  return {
    type, name,
    country: type === 'country' ? name : (all[0].geo?.country ?? null),
    places: all.map(p => p.place),
    firstVisit, latestVisit,
    visitCount, totalDays, memoryCount, photoCount: photos,
    companions: [...companions.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([cn, c]) => ({ name: cn, count: c })),
    favouriteSeason: favSeason ? favSeason.value : null,
    favouriteMemories,
    coordinates,
    confidence: confidenceFor(memoryCount),
    isFavourite: all.some(p => p.isFavourite),
    // raw heat metrics (normalised across the type-list afterwards)
    _highlightRaw: memoryCount + visitCount * 4 + photos + sunsets * 2 + (visitCount > 1 ? 10 : 0),
    _emotionRaw: sunsets * 2 + journals * 2 + (visitCount > 1 ? 5 : 0) + memoryCount * 0.5,
    _densityRaw: totalDays > 0 ? memoryCount / totalDays : memoryCount,
    _photoRaw: memoryCount > 0 ? photos / memoryCount : 0,
    _activityRaw: memoryCount > 0 ? activityHits / memoryCount : 0,
    _intensityRaw: memoryCount,
    _revisitRaw: visitCount,
  };
}

function finaliseHeat(list) {
  normalise(list, '_highlightRaw', 'highlightScore');
  normalise(list, '_intensityRaw', '_intensity');
  for (const x of list) {
    x.heat = {
      intensity: x._intensity,
      revisitIntensity: x._revisitRaw,
      memoryDensity: Math.round(x._densityRaw * 10) / 10,
      photographyDensity: Math.round(x._photoRaw * 100),
      activityDensity: Math.round(x._activityRaw * 100),
      emotionalSignificance: x._emotionRaw,
    };
    delete x._highlightRaw; delete x._emotionRaw; delete x._densityRaw; delete x._photoRaw; delete x._activityRaw; delete x._intensityRaw; delete x._revisitRaw; delete x._intensity;
  }
  return list;
}

/**
 * Build the deterministic Lifetime World data layer. Pure function of (events, trips).
 */
export function buildWorld(events, trips = []) {
  const globe = buildGlobe(events, trips);
  if (!globe.markers.length) return emptyWorld(globe);
  const items = enrichMemories(events, trips);

  // --- per-place aggregates -------------------------------------------------
  const perPlace = new Map();
  for (const m of globe.markers) {
    let p = perPlace.get(m.place);
    if (!p) {
      p = { place: m.place, geo: { country: m.country, region: m.region, island: m.island, city: m.city, lat: m.latitude, lng: m.longitude }, visitCount: 0, totalDays: 0, days: new Set(), firstVisit: m.startDate, latestVisit: m.endDate, visitStarts: [], isFavourite: false, memories: [], companions: new Map(), months: [], photos: 0, sunsets: 0, journals: 0, activityHits: 0 };
      perPlace.set(m.place, p);
    }
    p.visitCount += 1; p.visitStarts.push(m.startDate);
    if (m.startDate < p.firstVisit) p.firstVisit = m.startDate;
    if (m.endDate > p.latestVisit) p.latestVisit = m.endDate;
    p.isFavourite = p.isFavourite || m.isFavourite;
  }
  for (const it of items) {
    const place = placeOf(it);
    const p = place && perPlace.get(place);
    if (!p) continue;
    p.memories.push(it.entry);
    if (it.entry.kind === 'photo') p.photos += 1;
    if (it.entry.kind === 'journal') p.journals += 1;
    if (it.cats.includes('sunset')) p.sunsets += 1;
    p.activityHits += it.cats.filter(c => ACTIVITY_CATS.includes(c)).length;
    for (const n of it.companions) p.companions.set(n, (p.companions.get(n) ?? 0) + 1);
    p.months.push(monthOf(it.entry.timestamp));
    p.days.add(dayOf(it.entry.timestamp));
  }
  // Real days present at a place = distinct memory-days (robust across trips).
  for (const p of perPlace.values()) p.totalDays = p.days.size;
  const places = [...perPlace.values()];

  // --- rollups --------------------------------------------------------------
  const rollup = (keyFn, type) => {
    const groups = new Map();
    for (const p of places) { const k = keyFn(p); if (k == null) continue; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
    const list = [...groups.entries()].map(([name, members]) => aggregateGroup(name, members, type));
    return finaliseHeat(list).sort((a, b) => b.highlightScore - a.highlightScore || a.name.localeCompare(b.name));
  };
  const countries = rollup(p => p.geo.country, 'country');
  const regions = rollup(p => p.geo.region, 'region');
  const islands = rollup(p => p.geo.island, 'island');
  const cities = rollup(p => p.geo.city, 'city');

  // --- travel eras (years) --------------------------------------------------
  const eraMap = new Map();
  for (const m of globe.markers) {
    const y = m.year; if (y == null) continue;
    if (!eraMap.has(y)) eraMap.set(y, { year: y, countries: new Set(), places: new Set(), memoryCount: 0, photoCount: 0, from: m.startDate, to: m.endDate });
    const e = eraMap.get(y);
    if (m.country) e.countries.add(m.country); e.places.add(m.place);
    if (m.startDate < e.from) e.from = m.startDate; if (m.endDate > e.to) e.to = m.endDate;
  }
  for (const it of items) { const y = yearOf(it.entry.timestamp); const e = eraMap.get(y); if (!e) continue; e.memoryCount += 1; if (it.entry.kind === 'photo') e.photoCount += 1; }
  const eras = [...eraMap.values()].sort((a, b) => a.year - b.year).map(e => ({
    year: e.year, countries: [...e.countries], countryCount: e.countries.size, placeCount: e.places.size,
    memoryCount: e.memoryCount, photoCount: e.photoCount, trips: trips.filter(t => yearOf(`${String(t.startDate).slice(0, 10)}T00:00:00Z`) === e.year).length,
    span: { from: e.from, to: e.to },
  }));

  // --- world connections (from globe arcs) ----------------------------------
  const markerById = new Map(globe.markers.map(m => [m.id, m]));
  const connKey = (a, b) => [a, b].sort().join(' ↔ ');
  const connections = new Map();
  for (const arc of globe.arcs) {
    const from = markerById.get(arc.fromMarkerId); const to = markerById.get(arc.toMarkerId);
    if (!from || !to) continue;
    if (arc.family === 'generic') continue; // only evidenced legs become connections
    const crossesCountry = from.country && to.country && from.country !== to.country;
    const level = arc.family === 'flight' ? (crossesCountry ? 'country' : 'region') : (from.island && to.island ? 'island' : 'place');
    const kind = arc.family === 'flight' ? 'flight' : arc.family === 'sea' ? 'ferry' : 'land';
    const aName = level === 'country' ? from.country : level === 'island' ? from.island : from.place;
    const bName = level === 'country' ? to.country : level === 'island' ? to.island : to.place;
    if (!aName || !bName || aName === bName) continue; // skip self-loops
    const key = `${kind}:${connKey(aName, bName)}`;
    if (!connections.has(key)) connections.set(key, { id: key, kind, level, from: aName, to: bName, count: 0, transports: new Set(), totalKm: 0 });
    const c = connections.get(key);
    c.count += 1; c.transports.add(arc.transport); c.totalKm += arc.distanceKm;
  }
  const connectionList = [...connections.values()].map(c => ({ ...c, transports: [...c.transports] })).sort((a, b) => b.count - a.count || b.totalKm - a.totalKm || a.id.localeCompare(b.id));

  // --- repeat visits / favourite returns / longest gaps ---------------------
  const repeatVisits = places.filter(p => p.visitCount > 1).map(p => ({ place: p.place, country: p.geo.country, visitCount: p.visitCount, firstVisit: p.firstVisit, latestVisit: p.latestVisit })).sort((a, b) => b.visitCount - a.visitCount || a.place.localeCompare(b.place));
  const favouriteReturns = repeatVisits.slice(0, 5);
  const longestGaps = places.filter(p => p.visitStarts.length > 1).map(p => {
    const sorted = [...p.visitStarts].sort();
    let maxGap = 0; let gapFrom = null; let gapTo = null;
    for (let i = 1; i < sorted.length; i += 1) { const g = daysBetween(sorted[i - 1], sorted[i]); if (g > maxGap) { maxGap = g; gapFrom = sorted[i - 1]; gapTo = sorted[i]; } }
    return { place: p.place, gapDays: maxGap, from: gapFrom, to: gapTo };
  }).filter(g => g.gapDays > 0).sort((a, b) => b.gapDays - a.gapDays);

  // --- heat (top-level, normalised) -----------------------------------------
  const placeHeat = places.map(p => ({
    place: p.place, country: p.geo.country, island: p.geo.island, city: p.geo.city,
    _mem: p.memories.length, _revisit: p.visitCount,
    _density: p.totalDays > 0 ? p.memories.length / p.totalDays : p.memories.length,
    _emotion: p.sunsets * 2 + p.journals * 2 + (p.visitCount > 1 ? 5 : 0) + p.memories.length * 0.5,
    _photo: p.memories.length > 0 ? p.photos / p.memories.length : 0,
    _activity: p.memories.length > 0 ? p.activityHits / p.memories.length : 0,
  }));
  const heatArray = (rawKey, nameKey = 'place') => {
    const filtered = placeHeat.filter(p => p[nameKey] != null);
    const max = Math.max(0, ...filtered.map(p => p[rawKey]));
    return filtered.map(p => ({ name: p[nameKey], value: max > 0 ? Math.round((p[rawKey] / max) * 100) : 0 })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  };
  const heat = {
    countryIntensity: countries.map(c => ({ name: c.name, value: c.heat.intensity })),
    cityIntensity: cities.map(c => ({ name: c.name, value: c.heat.intensity })),
    islandIntensity: islands.map(c => ({ name: c.name, value: c.heat.intensity })),
    revisitIntensity: heatArray('_revisit'),
    memoryDensity: heatArray('_density'),
    emotionalSignificance: heatArray('_emotion'),
    photographyDensity: heatArray('_photo'),
    activityDensity: heatArray('_activity'),
  };

  // --- statistics -----------------------------------------------------------
  const distinct = (key) => new Set(globe.markers.map(m => m[key]).filter(Boolean)).size;
  const flights = globe.arcs.filter(a => a.family === 'flight').length;
  const ferries = globe.arcs.filter(a => a.family === 'sea').length;
  const totalMemories = places.reduce((n, p) => n + p.memories.length, 0);
  const totalPhotos = places.reduce((n, p) => n + p.photos, 0);
  const totalDays = places.reduce((n, p) => n + p.totalDays, 0);
  const continents = new Set(countries.map(c => continentOf(c.name)).filter(Boolean));
  const statistics = {
    totalCountries: countries.length, totalCities: cities.length, totalIslands: islands.length,
    continents: continents.size, yearsTravelled: eras.length,
    totalTransportLegs: globe.arcs.length, totalFlights: flights, totalFerries: ferries, totalJourneys: trips.length,
    totalPlaces: places.length, totalMemories, totalPhotos, totalDays,
  };
  const worldStatistics = [
    { id: 'countries', label: 'Countries', value: statistics.totalCountries },
    { id: 'cities', label: 'Cities', value: statistics.totalCities },
    { id: 'islands', label: 'Islands', value: statistics.totalIslands },
    { id: 'continents', label: 'Continents', value: statistics.continents },
    { id: 'years', label: 'Years travelled', value: statistics.yearsTravelled },
    { id: 'legs', label: 'Transport legs', value: statistics.totalTransportLegs },
    { id: 'flights', label: 'Flights', value: statistics.totalFlights },
    { id: 'ferries', label: 'Ferries & boats', value: statistics.totalFerries },
    { id: 'journeys', label: 'Journeys', value: statistics.totalJourneys },
  ];

  // --- profile --------------------------------------------------------------
  const firstVisit = places.map(p => p.firstVisit).sort()[0];
  const latestVisit = places.map(p => p.latestVisit).sort().slice(-1)[0];
  const profile = {
    firstVisit, latestVisit, span: { from: firstVisit, to: latestVisit },
    totalCountries: countries.length, totalPlaces: places.length,
    mostVisitedCountry: countries[0]?.name ?? null,
    favouritePlace: places.find(p => p.isFavourite)?.place ?? (places.sort((a, b) => b.memories.length - a.memories.length)[0]?.place ?? null),
  };

  // --- filters --------------------------------------------------------------
  const companionPlaces = new Map();
  const activityPlaces = new Map();
  const seasonPlaces = new Map();
  for (const p of places) {
    for (const n of p.companions.keys()) { if (!companionPlaces.has(n)) companionPlaces.set(n, []); companionPlaces.get(n).push(p.place); }
    const months = p.months.map(m => SEASONS[m]);
    for (const s of new Set(months)) { if (!seasonPlaces.has(s)) seasonPlaces.set(s, []); seasonPlaces.get(s).push(p.place); }
  }
  for (const it of items) {
    const place = placeOf(it); if (!place || !perPlace.has(place)) continue;
    for (const c of it.cats) { if (!ACTIVITY_CATS.includes(c)) continue; const label = CATEGORY_META[c].label; if (!activityPlaces.has(label)) activityPlaces.set(label, new Set()); activityPlaces.get(label).add(place); }
  }
  const filters = {
    byYear: eras.map(e => ({ year: e.year, places: [...new Set(globe.markers.filter(m => m.year === e.year).map(m => m.place))], countries: e.countries })),
    byContinent: [...new Set(countries.map(c => continentOf(c.name)).filter(Boolean))].map(cont => ({ continent: cont, countries: countries.filter(c => continentOf(c.name) === cont).map(c => c.name) })),
    byCountry: countries.map(c => ({ country: c.name, places: c.places })),
    byCompanion: [...companionPlaces.entries()].map(([name, pl]) => ({ companion: name, places: [...new Set(pl)] })),
    byActivity: [...activityPlaces.entries()].map(([activity, set]) => ({ activity, places: [...set] })),
    bySeason: [...seasonPlaces.entries()].map(([season, pl]) => ({ season, places: [...new Set(pl)] })),
    favourites: places.filter(p => p.isFavourite).map(p => p.place),
    firstVisits: places.map(p => ({ place: p.place, date: p.firstVisit })).sort((a, b) => a.date.localeCompare(b.date)),
    latestVisits: places.map(p => ({ place: p.place, date: p.latestVisit })).sort((a, b) => b.date.localeCompare(a.date)),
  };

  return {
    profile, countries, regions, islands, cities, eras,
    connections: connectionList, repeatVisits, favouriteReturns, longestGaps,
    heat, statistics, worldStatistics, filters,
    basedOn: globe.basedOn,
  };
}
