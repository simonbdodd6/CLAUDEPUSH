// Travel App — 3D Globe Journey Engine (M27).
//
// The complete DATA layer a future interactive globe needs — and nothing more.
// NO graphics, NO AI, NO randomness. It reuses the Interactive Journey Replay
// (M26) and resolves each place to a coordinate via a curated, REGION-LEVEL
// gazetteer (public place centroids — not the traveller's GPS, so the
// no-exact-location rule holds). Unknown places fall back to deterministic,
// clearly-flagged coordinates (`resolved:false`) so the UI can prompt or skip.
//
// Exposes reusable DTOs — Globe, Marker, TransportArc, ReplayFrame, CameraMove,
// Highlight — plus filter indexes for replay by country / transport / activity /
// year / favourites / longest journeys. Deterministic, offline-first, no
// duplicated enrichment, no platform change, no backend leak.

import { buildJourneyReplay } from './journey-replay.js';

// --- curated region-level gazetteer (public centroids) ----------------------
// lat/lng are approximate REGION centroids of well-known places, not GPS.
const GAZETTEER = {
  bali: { lat: -8.41, lng: 115.19, country: 'Indonesia', island: 'Bali', city: null, region: 'Bali' },
  canggu: { lat: -8.65, lng: 115.13, country: 'Indonesia', island: 'Bali', city: 'Canggu', region: 'Bali' },
  ubud: { lat: -8.51, lng: 115.26, country: 'Indonesia', island: 'Bali', city: 'Ubud', region: 'Bali' },
  'uluwatu': { lat: -8.83, lng: 115.09, country: 'Indonesia', island: 'Bali', city: 'Uluwatu', region: 'Bali' },
  'gili air': { lat: -8.36, lng: 116.08, country: 'Indonesia', island: 'Gili Air', city: null, region: 'West Nusa Tenggara' },
  'gili meno': { lat: -8.35, lng: 116.05, country: 'Indonesia', island: 'Gili Meno', city: null, region: 'West Nusa Tenggara' },
  'gili trawangan': { lat: -8.35, lng: 116.04, country: 'Indonesia', island: 'Gili Trawangan', city: null, region: 'West Nusa Tenggara' },
  lombok: { lat: -8.65, lng: 116.32, country: 'Indonesia', island: 'Lombok', city: null, region: 'West Nusa Tenggara' },
  sorong: { lat: -0.88, lng: 131.25, country: 'Indonesia', island: null, city: 'Sorong', region: 'Southwest Papua' },
  'raja ampat': { lat: -0.23, lng: 130.52, country: 'Indonesia', island: 'Raja Ampat', city: null, region: 'Southwest Papua' },
  jakarta: { lat: -6.20, lng: 106.85, country: 'Indonesia', island: 'Java', city: 'Jakarta', region: 'Jakarta' },
  singapore: { lat: 1.35, lng: 103.82, country: 'Singapore', island: null, city: 'Singapore', region: 'Singapore' },
  'marina bay': { lat: 1.28, lng: 103.85, country: 'Singapore', island: null, city: 'Singapore', region: 'Singapore' },
  phuket: { lat: 7.88, lng: 98.39, country: 'Thailand', island: 'Phuket', city: null, region: 'Phuket' },
  'kuala lumpur': { lat: 3.14, lng: 101.69, country: 'Malaysia', island: null, city: 'Kuala Lumpur', region: 'Kuala Lumpur' },
};

// Deterministic fallback coordinate for an unknown place (region-ish, flagged).
function derivedCoord(name) {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) | 0;
  const u = Math.abs(h);
  const lat = ((u % 12000) / 100) - 60;   // -60 .. 60
  const lng = ((Math.floor(u / 12000) % 36000) / 100) - 180; // -180 .. 180
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100, country: null, island: null, city: null, region: null };
}

function resolvePlace(place) {
  const key = String(place || '').trim().toLowerCase();
  if (GAZETTEER[key]) return { ...GAZETTEER[key], coordinateSource: 'gazetteer', resolved: true };
  return { ...derivedCoord(key || 'unknown'), coordinateSource: 'derived', resolved: false };
}

// --- great-circle math (deterministic) --------------------------------------
const toRad = d => (d * Math.PI) / 180;
const toDeg = r => (r * 180) / Math.PI;

function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat); const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(s))));
}
function bearing(a, b) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return Math.round(((toDeg(Math.atan2(y, x)) + 360) % 360) * 10) / 10;
}
// Sample N points along the great circle from a to b (deterministic slerp).
function greatCircle(a, b, n = 24) {
  const lat1 = toRad(a.lat); const lon1 = toRad(a.lng); const lat2 = toRad(b.lat); const lon2 = toRad(b.lng);
  const d = 2 * Math.asin(Math.min(1, Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2)));
  const pts = [];
  if (d === 0) return [{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }];
  for (let i = 0; i < n; i += 1) {
    const f = i / (n - 1);
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    pts.push({ lat: Math.round(toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))) * 1000) / 1000, lng: Math.round(toDeg(Math.atan2(y, x)) * 1000) / 1000 });
  }
  return pts;
}

function classify(transport) {
  const t = String(transport || '').toLowerCase();
  if (/flight|fly|plane|air/.test(t)) return 'flight';
  if (/boat|ferry|sail|kayak|canoe/.test(t)) return 'sea';
  if (/train|rail|metro|subway/.test(t)) return 'rail';
  if (/taxi|cab|car|drive|scooter|motorbike|grab|gojek|uber/.test(t)) return 'road';
  if (/walk|foot|hike|trek/.test(t)) return 'walk';
  return 'generic';
}
const ARC_STYLE = {
  flight: { curvature: 0.45, elevation: 'high', flightHeight: 0.18, boatHeight: 0, glowIntensity: 0.9, colour: 'sky' },
  sea: { curvature: 0.12, elevation: 'surface', flightHeight: 0, boatHeight: 0.02, glowIntensity: 0.5, colour: 'ocean' },
  rail: { curvature: 0.08, elevation: 'ground', flightHeight: 0, boatHeight: 0, glowIntensity: 0.4, colour: 'slate' },
  road: { curvature: 0.10, elevation: 'ground', flightHeight: 0, boatHeight: 0, glowIntensity: 0.4, colour: 'sunset' },
  walk: { curvature: 0.05, elevation: 'ground', flightHeight: 0, boatHeight: 0, glowIntensity: 0.3, colour: 'forest' },
  generic: { curvature: 0.15, elevation: 'ground', flightHeight: 0, boatHeight: 0, glowIntensity: 0.35, colour: 'slate' },
};

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function yearOf(iso) { return iso ? new Date(iso).getUTCFullYear() : null; }

/**
 * Build the deterministic 3D Globe data layer. Pure function of (events, trips).
 */
export function buildGlobe(events, trips = []) {
  const replay = buildJourneyReplay(events, trips);
  const realStops = replay.timeline.filter(n => n.type === 'stop' && !n.inferred);

  if (!realStops.length) {
    return {
      globe: { defaultZoom: 2, markerCount: 0, arcCount: 0, bounds: null, span: null },
      markers: [], arcs: [], cameraMoves: [], replayFrames: [], highlights: [],
      replay: { replayStart: 0, replayEnd: 0, replayDuration: 0 },
      filters: { byCountry: [], byTransport: [], byActivity: [], byYear: [], favouritesOnly: [], longestJourneys: [] },
      basedOn: replay.basedOn,
    };
  }

  // Favourite places: revisited across trips, plus the most-memoried place.
  const placeMemories = new Map();
  for (const s of realStops) placeMemories.set(s.place, (placeMemories.get(s.place) ?? 0) + s.memoryCount);
  const tripsByDest = new Map();
  for (const t of trips) if (t?.destination) tripsByDest.set(t.destination, (tripsByDest.get(t.destination) ?? 0) + 1);
  const topPlace = [...placeMemories.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  const favouriteSet = new Set([...[...tripsByDest.entries()].filter(([, c]) => c >= 2).map(([p]) => p), ...(topPlace ? [topPlace] : [])]);

  // --- markers --------------------------------------------------------------
  const markers = realStops.map((s, i) => {
    const geo = resolvePlace(s.place);
    const isFavourite = favouriteSet.has(s.place);
    const markerSize = clamp(8 + s.memoryCount * 2 + (s.durationDays || 0), 8, 40);
    const markerColour = isFavourite ? 'gold' : s.isIsland ? 'ocean' : s.transition === 'country' ? 'sky' : 'sand';
    return {
      id: s.id, place: s.place, visitOrder: i,
      latitude: geo.lat, longitude: geo.lng, coordinateSource: geo.coordinateSource, resolved: geo.resolved,
      country: geo.country ?? s.country ?? null, island: geo.island, city: geo.city, region: geo.region,
      isIsland: s.isIsland, isFavourite,
      zoomLevel: s.replay.zoomLevel, cameraAngle: 45,
      arrivalDirection: null, departureDirection: null, // set below
      markerSize, markerColour,
      startDate: s.startDate, endDate: s.endDate, year: yearOf(s.startDate),
      startAt: s.replay.startAt, endAt: s.replay.endAt,
      durationDays: s.durationDays, memoryCount: s.memoryCount,
      coverPhoto: s.coverPhoto, chapterTitle: s.chapterTitle, activities: s.activities,
    };
  });
  // arrival/departure bearings from neighbouring markers
  markers.forEach((m, i) => {
    const prev = markers[i - 1]; const next = markers[i + 1];
    if (prev) m.arrivalDirection = bearing({ lat: prev.latitude, lng: prev.longitude }, { lat: m.latitude, lng: m.longitude });
    if (next) m.departureDirection = bearing({ lat: m.latitude, lng: m.longitude }, { lat: next.latitude, lng: next.longitude });
  });
  const markerByPlace = new Map(markers.map(m => [m.id, m]));

  // --- arcs (one per real inter-stop transport segment) ---------------------
  const arcs = [];
  const timeline = replay.timeline;
  for (let i = 0; i < timeline.length; i += 1) {
    const node = timeline[i];
    if (node.type !== 'segment' || node.inferred) continue;
    // nearest real stops either side
    let prev = null; let next = null;
    for (let j = i - 1; j >= 0; j -= 1) if (timeline[j].type === 'stop' && !timeline[j].inferred) { prev = timeline[j]; break; }
    for (let j = i + 1; j < timeline.length; j += 1) if (timeline[j].type === 'stop' && !timeline[j].inferred) { next = timeline[j]; break; }
    if (!prev || !next) continue;
    const from = markerByPlace.get(prev.id); const to = markerByPlace.get(next.id);
    const fam = classify(node.transport);
    const style = ARC_STYLE[fam];
    const a = { lat: from.latitude, lng: from.longitude }; const b = { lat: to.latitude, lng: to.longitude };
    arcs.push({
      id: node.id, transport: node.transport, family: fam,
      fromMarkerId: from.id, toMarkerId: to.id,
      origin: a, destination: b,
      greatCircleArc: greatCircle(a, b, 24),
      distanceKm: haversineKm(a, b),
      bearing: bearing(a, b),
      pathCurvature: style.curvature, elevation: style.elevation,
      flightHeight: style.flightHeight, boatHeight: style.boatHeight,
      travelColour: style.colour, glowIntensity: style.glowIntensity,
      animationDuration: node.replay.duration,
      startAt: node.replay.startAt, endAt: node.replay.endAt,
    });
  }

  // --- replay frames + camera moves -----------------------------------------
  const replayFrames = []; const cameraMoves = [];
  let order = 0;
  // markers and arcs interleaved in replay-time order
  const ordered = [...markers.map(m => ({ k: 'marker', ref: m, startAt: m.startAt, endAt: m.endAt })),
    ...arcs.map(arc => ({ k: 'arc', ref: arc, startAt: arc.startAt, endAt: arc.endAt }))]
    .sort((x, y) => x.startAt - y.startAt || (x.k === 'marker' ? -1 : 1));
  for (const item of ordered) {
    const isMarker = item.k === 'marker';
    const target = isMarker
      ? { latitude: item.ref.latitude, longitude: item.ref.longitude }
      : { latitude: (item.ref.origin.lat + item.ref.destination.lat) / 2, longitude: (item.ref.origin.lng + item.ref.destination.lng) / 2 };
    const camera = {
      id: `camera-${order}`,
      target, markerId: isMarker ? item.ref.id : null,
      zoomLevel: isMarker ? item.ref.zoomLevel : (item.ref.family === 'flight' ? 1 : 2),
      angle: 45, bearing: isMarker ? (item.ref.departureDirection ?? item.ref.arrivalDirection ?? 0) : item.ref.bearing,
      durationMs: Math.max(0, item.endAt - item.startAt), startAt: item.startAt, easing: 'ease-in-out',
    };
    cameraMoves.push(camera);
    replayFrames.push({
      order, kind: isMarker ? 'marker' : 'arc',
      refId: item.ref.id,
      action: isMarker ? (order === 0 ? 'arrive' : 'arrive') : 'travel',
      startAt: item.startAt, endAt: item.endAt, camera,
    });
    order += 1;
  }

  // --- highlights -----------------------------------------------------------
  const highlights = [];
  if (arcs.length) {
    const longest = [...arcs].sort((a, b) => b.distanceKm - a.distanceKm)[0];
    const fromM = markerByPlace.get(longest.fromMarkerId); const toM = markerByPlace.get(longest.toMarkerId);
    highlights.push({ id: 'longest-journey', kind: 'longest-journey', refType: 'arc', refId: longest.id, label: `Longest leg: ${fromM.place} → ${toM.place} by ${longest.transport}`, value: longest.distanceKm, unit: 'km' });
  }
  const mostMem = [...markers].sort((a, b) => b.memoryCount - a.memoryCount || a.visitOrder - b.visitOrder)[0];
  highlights.push({ id: 'most-memories', kind: 'most-memories', refType: 'marker', refId: mostMem.id, label: `Most memories: ${mostMem.place}`, value: mostMem.memoryCount, unit: 'memories' });
  highlights.push({ id: 'first-arrival', kind: 'first-arrival', refType: 'marker', refId: markers[0].id, label: `First stop: ${markers[0].place}`, value: markers[0].place });
  highlights.push({ id: 'final-stop', kind: 'final-stop', refType: 'marker', refId: markers[markers.length - 1].id, label: `Final stop: ${markers[markers.length - 1].place}`, value: markers[markers.length - 1].place });
  const fav = markers.find(m => m.isFavourite);
  if (fav) highlights.push({ id: 'favourite-place', kind: 'favourite-place', refType: 'marker', refId: fav.id, label: `Favourite: ${fav.place}`, value: fav.place });

  // --- filter indexes -------------------------------------------------------
  const groupBy = (arr, keyFn) => {
    const m = new Map();
    for (const x of arr) { const k = keyFn(x); if (k == null) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    return m;
  };
  const byCountry = [...groupBy(markers, m => m.country).entries()].map(([country, ms]) => ({ country, markerIds: ms.map(m => m.id) }));
  const byTransport = [...groupBy(arcs, a => a.transport).entries()].map(([transport, as]) => ({ transport, arcIds: as.map(a => a.id) }));
  const activityIndex = new Map();
  for (const m of markers) for (const act of (m.activities ?? [])) { if (!activityIndex.has(act)) activityIndex.set(act, []); activityIndex.get(act).push(m.id); }
  const byActivity = [...activityIndex.entries()].map(([activity, markerIds]) => ({ activity, markerIds }));
  const arcYear = (a) => markerByPlace.get(a.fromMarkerId)?.year ?? null;
  const byYear = [...groupBy(markers, m => m.year).entries()].sort((a, b) => a[0] - b[0]).map(([year, ms]) => ({
    year, markerIds: ms.map(m => m.id), arcIds: arcs.filter(a => arcYear(a) === year).map(a => a.id),
  }));
  const favouritesOnly = markers.filter(m => m.isFavourite).map(m => m.id);
  const longestJourneys = [...arcs].sort((a, b) => b.distanceKm - a.distanceKm).map(a => ({ arcId: a.id, distanceKm: a.distanceKm, transport: a.transport }));

  // --- globe summary --------------------------------------------------------
  const lats = markers.map(m => m.latitude); const lngs = markers.map(m => m.longitude);
  const bounds = { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
  const replayStart = ordered.length ? ordered[0].startAt : 0;
  const replayEnd = ordered.length ? Math.max(...ordered.map(o => o.endAt)) : 0;

  return {
    globe: { defaultZoom: 2, markerCount: markers.length, arcCount: arcs.length, bounds, span: { from: markers[0].startDate, to: markers[markers.length - 1].endDate } },
    markers, arcs, cameraMoves, replayFrames, highlights,
    replay: { replayStart, replayEnd, replayDuration: replayEnd - replayStart },
    filters: { byCountry, byTransport, byActivity, byYear, favouritesOnly, longestJourneys },
    basedOn: replay.basedOn,
  };
}
