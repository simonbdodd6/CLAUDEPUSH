// Travel App — Journey Visualisation Engine (M25).
//
// Builds a deterministic, presentation-ready ROUTE the future UI can replay from
// departure to return: an ordered ribbon of stops (places) connected by segments
// (transport — flights, boats, taxis, walks…). NO AI, NO generated prose, NO
// randomness. Every node/segment is assembled from existing evidence (memories +
// trips + optional place/move tags) and exposes exactly the fields a UI needs to
// animate routes, draw ribbons, and zoom into chapters — with zero UI logic.
//
// Reuses the shared memory enrichment + categories (zero duplication). No
// platform change; no backend term leaks. Map coordinates are intentionally
// null (exact location is forbidden by the platform) until a future,
// region-granularity source provides them — the field exists so the UI is ready.

import { CATEGORY_META, dayOf } from './feed.js';
import { enrichMemories } from './travel-dna.js';

// Transport detection (order matters — "fast boat" before "boat").
const TRANSPORT = [
  { type: 'flight', icon: 'airplane', re: /\b(flight|flew|fly|flying|plane|airport|landed|boarding|red.?eye)\b/i },
  { type: 'fast boat', icon: 'boat', re: /\b(fast boat|speed ?boat)\b/i },
  { type: 'ferry', icon: 'ferry', re: /\b(ferry)\b/i },
  { type: 'boat', icon: 'boat', re: /\b(boat|dinghy|liveaboard|kayak|canoe|sail)\b/i },
  { type: 'train', icon: 'train', re: /\b(train|rail|metro|subway)\b/i },
  { type: 'taxi', icon: 'car', re: /\b(taxi|cab|grab|gojek|uber|car|drove|driving|scooter|motorbike|moped)\b/i },
  { type: 'walk', icon: 'walk', re: /\b(walk|walked|on foot|hike|hiked|trek|trekked)\b/i },
];
const ACCOMMODATION_RE = /\b(hotel|villa|homestay|hostel|resort|guesthouse|bungalow|airbnb|liveaboard|lodge|camp)\b/i;

function detectTransport(text) {
  for (const t of TRANSPORT) if (t.re.test(text)) return { type: t.type, icon: t.icon };
  return null;
}
function iconForType(type) {
  const t = TRANSPORT.find(x => x.type === type) || TRANSPORT.find(x => new RegExp(`\\b${x.type}\\b`, 'i').test(type));
  return t ? t.icon : 'route';
}

// Clean a raw `move` tag into a safe transport leg, or null.
export function normalizeMove(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const type = typeof input.type === 'string' && input.type.trim() ? input.type.trim() : null;
  if (!type) return null;
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return { type, from: str(input.from), to: str(input.to) };
}

function byTimeAsc(a, b) { return new Date(a.timestamp) - new Date(b.timestamp) || String(a.id).localeCompare(String(b.id)); }
function confidenceFor(count) { return count >= 12 ? 'defining' : count >= 4 ? 'strong' : 'emerging'; }
function placeOf(i) { return i.place ?? i.area ?? i.destination ?? i.country ?? null; }
function daysInclusive(fromIso, toIso) {
  const a = Date.parse(`${dayOf(fromIso)}T00:00:00Z`);
  const b = Date.parse(`${dayOf(toIso)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}
function hoursBetween(fromIso, toIso) {
  return Math.max(0, Math.round((new Date(toIso) - new Date(fromIso)) / 3_600_000));
}

// Activity-ish categories that read as "things you did" at a stop.
const ACTIVITY_CATS = ['dive', 'mountain', 'wildlife', 'food', 'beach', 'sunset'];

function buildStop(group, index, weekOf) {
  const asc = group.items.map(i => i.entry).sort(byTimeAsc);
  const photos = asc.filter(e => e.kind === 'photo');
  const cats = new Set(group.items.flatMap(i => i.cats));
  const activities = ACTIVITY_CATS.filter(c => cats.has(c)).map(c => CATEGORY_META[c].label);
  const accommodation = group.items.filter(i => ACCOMMODATION_RE.test(i.text)).map(i => i.entry.title);
  const week = weekOf(asc[0].timestamp);
  return {
    type: 'stop',
    id: `stop-${index}`,
    place: group.place,
    country: group.country,
    transition: null, // set during assembly (start | country | place)
    startDate: asc[0].timestamp,
    endDate: asc[asc.length - 1].timestamp,
    durationDays: daysInclusive(asc[0].timestamp, asc[asc.length - 1].timestamp),
    memoryCount: asc.length,
    supportingMemories: asc.slice(0, 8),
    supportingPhotos: photos.map(p => p.photoRef).filter(Boolean).slice(0, 8),
    accommodation,
    activities,
    chapter: week,
    icon: 'pin',
    coordinates: null,
    confidence: confidenceFor(asc.length),
    inferred: false,
  };
}

function buildSegment(id, prevGroup, nextGroup) {
  const fromLast = prevGroup.items[prevGroup.items.length - 1];
  const toFirst = nextGroup.items[0];
  const explicit = toFirst.move ?? null;
  let type; let icon; let confidence; let support; let origin; let destination;
  if (explicit?.type) {
    type = explicit.type; icon = iconForType(explicit.type); confidence = 'strong';
    support = [toFirst.entry]; origin = explicit.from ?? prevGroup.place; destination = explicit.to ?? nextGroup.place;
  } else {
    const fromText = detectTransport(toFirst.text);
    const t = fromText || detectTransport(fromLast.text);
    type = t ? t.type : 'travel'; icon = t ? t.icon : 'route'; confidence = t ? 'emerging' : 'emerging';
    support = t ? [(fromText ? toFirst.entry : fromLast.entry)] : [];
    origin = prevGroup.place; destination = nextGroup.place;
  }
  return {
    type: 'segment', id,
    transport: type, icon,
    origin, destination,
    startDate: fromLast.entry.timestamp,
    endDate: toFirst.entry.timestamp,
    durationHours: hoursBetween(fromLast.entry.timestamp, toFirst.entry.timestamp),
    supportingMemories: support,
    supportingPhotos: support.filter(e => e.kind === 'photo').map(e => e.photoRef).filter(Boolean),
    chapter: null,
    coordinates: null,
    confidence,
    inferred: false,
  };
}

function homeStop(id) {
  return {
    type: 'stop', id, place: 'Home', country: null, transition: 'home',
    startDate: null, endDate: null, durationDays: null, memoryCount: 0,
    supportingMemories: [], supportingPhotos: [], accommodation: [], activities: [],
    chapter: null, icon: 'house', coordinates: null, confidence: 'inferred', inferred: true,
  };
}
function homeSegment(id, origin, destination, type, when) {
  return {
    type: 'segment', id, transport: type, icon: iconForType(type),
    origin, destination, startDate: when ?? null, endDate: when ?? null, durationHours: null,
    supportingMemories: [], supportingPhotos: [], chapter: null, coordinates: null,
    confidence: 'inferred', inferred: true,
  };
}

/**
 * Build the deterministic Journey Visualisation DTO. Pure function of (events, trips).
 */
export function buildJourney(events, trips = []) {
  const items = enrichMemories(events, trips);
  const placed = items.filter(placeOf);

  // Trip-start anchor for chapter (week) numbering.
  const tripStart = trips.filter(t => t?.startDate).map(t => String(t.startDate).slice(0, 10)).sort()[0]
    ?? (placed[0] ? dayOf(placed[0].entry.timestamp) : null);
  const weekOf = (iso) => {
    if (!tripStart) return null;
    const w = Math.floor((Date.parse(`${dayOf(iso)}T00:00:00Z`) - Date.parse(`${tripStart}T00:00:00Z`)) / (7 * 86_400_000));
    return { index: w + 1, label: `Chapter ${w + 1}` };
  };

  // Group consecutive same-place memories into stops.
  const groups = [];
  for (const it of placed) {
    const place = placeOf(it);
    const last = groups[groups.length - 1];
    if (last && last.place === place) last.items.push(it);
    else groups.push({ place, country: it.country, items: [it] });
  }

  if (!groups.length) {
    return { route: [], stops: [], segments: [], chapters: [], basedOn: { memories: items.length, stops: 0, segments: 0, span: null } };
  }

  const stops = groups.map((g, i) => buildStop(g, i, weekOf));
  // transitions
  stops.forEach((s, i) => {
    if (i === 0) s.transition = 'start';
    else if (s.country && stops[i - 1].country && s.country !== stops[i - 1].country) s.transition = 'country';
    else s.transition = 'place';
    // Time AT the stop runs until departure (the next stop's first memory).
    const depart = i < stops.length - 1 ? stops[i + 1].startDate : s.endDate;
    s.durationDays = daysInclusive(s.startDate, depart);
  });
  const interSegments = groups.slice(1).map((g, i) => buildSegment(`segment-${i}`, groups[i], g));

  // Home bookends (structural, inferred) — every trip departs from and returns home.
  const hasTrip = trips.length > 0;
  const arrival = detectTransport(groups[0].items[0].text);
  const departure = detectTransport(groups[groups.length - 1].items[groups[groups.length - 1].items.length - 1].text);

  const route = [];
  if (hasTrip) {
    route.push(homeStop('home-start'));
    route.push(homeSegment('home-arrival', 'Home', stops[0].place, arrival?.type ?? 'travel', stops[0].startDate));
  }
  stops.forEach((s, i) => {
    route.push(s);
    if (i < stops.length - 1) route.push(interSegments[i]);
  });
  if (hasTrip) {
    route.push(homeSegment('home-return', stops[stops.length - 1].place, 'Home', departure?.type ?? 'travel', stops[stops.length - 1].endDate));
    route.push(homeStop('home-end'));
  }

  // replay order across the whole ribbon
  route.forEach((node, i) => { node.replayOrder = i; });

  // Chapters: group real stops by chapter index, with their place range.
  const chapterMap = new Map();
  for (const s of stops) {
    if (!s.chapter) continue;
    const key = s.chapter.index;
    if (!chapterMap.has(key)) chapterMap.set(key, { index: key, label: s.chapter.label, places: [], from: s.startDate, to: s.endDate });
    const c = chapterMap.get(key);
    c.places.push(s.place);
    if (s.startDate < c.from) c.from = s.startDate;
    if (s.endDate > c.to) c.to = s.endDate;
  }
  const chapters = [...chapterMap.values()].sort((a, b) => a.index - b.index);

  return {
    route,
    stops,
    segments: route.filter(n => n.type === 'segment'),
    chapters,
    basedOn: { memories: items.length, stops: stops.length, segments: interSegments.length, span: { from: stops[0].startDate, to: stops[stops.length - 1].endDate } },
  };
}
