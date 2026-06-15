// Travel App — Interactive Journey Replay (M26).
//
// A pure PRESENTATION layer on top of the Journey Visualisation Engine (M25). It
// adds the metadata a future UI needs to REPLAY a whole holiday exactly as it
// happened — a continuous replay timeline, per-segment path/colour/animation
// descriptors, per-stop arrival/cover/highlights, and control indexes for
// play / pause / resume / jump-to-chapter / replay-one-destination /
// replay-one-transport / flights-only / islands-only.
//
// NO AI, NO randomness, NO animations here — only deterministic data. It builds
// on buildJourney() and never re-derives enrichment (zero duplication). No
// platform change; no backend term leaks. Replay times are abstract units (ms of
// replay clock), not wall-clock, so playback is reproducible.

import { buildJourney } from './journey.js';

// Abstract replay-clock constants (ms of replay time).
const STOP_BASE = 2000;
const PER_DAY = 400;
const STAY_MIN = 2000;
const STAY_MAX = 6000;
const HOME_STAY = 1500;
const ARRIVAL_PAUSE = 800;
const DEPARTURE_PAUSE = 600;
const HOME_PAUSE = 400;

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// Classify any transport label into a movement family.
function classify(transport) {
  const t = String(transport || '').toLowerCase();
  if (/flight|fly|plane|air/.test(t)) return 'flight';
  if (/boat|ferry|sail|kayak|canoe/.test(t)) return 'sea';
  if (/train|rail|metro|subway/.test(t)) return 'rail';
  if (/taxi|cab|car|drive|scooter|motorbike|grab|gojek|uber/.test(t)) return 'road';
  if (/walk|foot|hike|trek/.test(t)) return 'walk';
  return 'generic';
}

const MOVEMENT = {
  flight: { duration: 2500, speed: 100, zoom: 1, colour: 'sky', icon: 'airplane', animationStyle: 'arc-fly', pathType: 'flight', path: { style: 'arc', curve: 0.45, dashed: false } },
  sea: { duration: 2000, speed: 70, zoom: 2, colour: 'ocean', icon: 'boat', animationStyle: 'wave-glide', pathType: 'sea', path: { style: 'wave', curve: 0.18, dashed: false } },
  rail: { duration: 1500, speed: 80, zoom: 3, colour: 'slate', icon: 'train', animationStyle: 'rail-slide', pathType: 'rail', path: { style: 'line', curve: 0.0, dashed: false } },
  road: { duration: 1000, speed: 50, zoom: 3, colour: 'sunset', icon: 'car', animationStyle: 'road-move', pathType: 'road', path: { style: 'line', curve: 0.12, dashed: false } },
  walk: { duration: 800, speed: 30, zoom: 4, colour: 'forest', icon: 'walk', animationStyle: 'dotted-step', pathType: 'walking', path: { style: 'dotted', curve: 0.06, dashed: true } },
  generic: { duration: 1200, speed: 60, zoom: 2, colour: 'slate', icon: 'route', animationStyle: 'fade', pathType: 'generic', path: { style: 'line', curve: 0.2, dashed: true } },
};

function activitySummary(stop) {
  if (stop.activities?.length) return stop.activities.join(' · ');
  if (stop.memoryCount) return `${stop.memoryCount} ${stop.memoryCount === 1 ? 'memory' : 'memories'}`;
  return null;
}

function arrivalAnimationFor(transition) {
  if (transition === 'home') return 'fade-in';
  if (transition === 'country') return 'zoom-from-space';
  if (transition === 'start') return 'zoom-to-pin';
  return 'pan-to-pin';
}
function stopZoom(transition) {
  if (transition === 'home') return 1;
  if (transition === 'country') return 2;
  return 4;
}

/**
 * Build the deterministic Interactive Journey Replay DTO. Pure function of (events, trips).
 */
export function buildJourneyReplay(events, trips = []) {
  const journey = buildJourney(events, trips);

  if (!journey.route.length) {
    return {
      replay: { replayStart: 0, replayEnd: 0, replayDuration: 0, nodeCount: 0 },
      timeline: [], chapters: [],
      capabilities: { play: true, pause: true, resume: true, jumpToChapter: false, replayDestination: false, replayTransport: false, replayFlightsOnly: false, replayIslandsOnly: false },
      controls: { jumpToChapter: [], replayDestination: [], replayTransport: [], replayFlightsOnly: null, replayIslandsOnly: [] },
      basedOn: journey.basedOn,
    };
  }

  // Walk the route, accumulate the replay clock, decorate each node.
  let clock = 0;
  const timeline = journey.route.map((node, idx) => {
    if (node.type === 'stop') {
      const isHome = node.inferred;
      const stayDuration = isHome ? HOME_STAY : clamp(STOP_BASE + (node.durationDays || 1) * PER_DAY, STAY_MIN, STAY_MAX);
      const arrivalPause = isHome ? HOME_PAUSE : ARRIVAL_PAUSE;
      const departurePause = isHome ? HOME_PAUSE : DEPARTURE_PAUSE;
      const startAt = clock;
      clock += arrivalPause + stayDuration + departurePause;
      const endAt = clock;
      return {
        ...node,
        chapterTitle: node.chapter?.label ?? null,
        coverPhoto: node.supportingPhotos?.[0] ?? null,
        favouriteMemories: (node.supportingMemories ?? []).slice(0, 3),
        highlightMemories: node.supportingMemories ?? [],
        activitySummary: activitySummary(node),
        arrivedBy: null, // set in the pass below
        isIsland: false,
        replay: {
          order: idx, startAt, endAt,
          arrivalPause, stayDuration, departurePause,
          zoomLevel: stopZoom(node.transition),
          arrivalAnimation: arrivalAnimationFor(node.transition),
        },
      };
    }
    // segment
    const m = MOVEMENT[classify(node.transport)];
    const startAt = clock;
    clock += m.duration;
    const endAt = clock;
    return {
      ...node,
      transportIcon: m.icon,
      transportColour: m.colour,
      animationStyle: m.animationStyle,
      pathType: m.pathType,
      path: m.path,
      replay: {
        order: idx, startAt, endAt,
        duration: m.duration,
        movementSpeed: m.speed,
        zoomLevel: m.zoom,
      },
    };
  });

  // Second pass: arrivedBy (the segment that led into a stop) + island heuristic.
  let lastSegment = null;
  for (const node of timeline) {
    if (node.type === 'segment') { lastSegment = node; continue; }
    if (lastSegment) {
      node.arrivedBy = lastSegment.transport;
      node.isIsland = !node.inferred && classify(lastSegment.transport) === 'sea';
    }
  }

  const replayDuration = clock;

  // Chapters with replay ranges (jump-to-chapter).
  const chapterMap = new Map();
  for (const node of timeline) {
    if (node.type !== 'stop' || !node.chapter) continue;
    const key = node.chapter.index;
    if (!chapterMap.has(key)) chapterMap.set(key, { index: key, label: node.chapter.label, title: node.chapter.label, places: [], startAt: node.replay.startAt, endAt: node.replay.endAt, nodeIds: [] });
    const c = chapterMap.get(key);
    c.places.push(node.place);
    c.nodeIds.push(node.id);
    c.startAt = Math.min(c.startAt, node.replay.startAt);
    c.endAt = Math.max(c.endAt, node.replay.endAt);
  }
  const chapters = [...chapterMap.values()].sort((a, b) => a.index - b.index);

  // Control indexes (the UI just plays the ranges).
  const realStops = timeline.filter(n => n.type === 'stop' && !n.inferred);
  const segments = timeline.filter(n => n.type === 'segment');

  const replayDestination = realStops.map(s => ({ place: s.place, nodeId: s.id, startAt: s.replay.startAt, endAt: s.replay.endAt }));

  const byTransport = new Map();
  for (const s of segments) {
    if (!byTransport.has(s.transport)) byTransport.set(s.transport, []);
    byTransport.get(s.transport).push({ id: s.id, origin: s.origin, destination: s.destination, startAt: s.replay.startAt, endAt: s.replay.endAt });
  }
  const replayTransport = [...byTransport.entries()].map(([transport, segs]) => ({ transport, segments: segs }));

  const flightSegs = segments.filter(s => classify(s.transport) === 'flight')
    .map(s => ({ id: s.id, origin: s.origin, destination: s.destination, startAt: s.replay.startAt, endAt: s.replay.endAt }));
  const replayFlightsOnly = flightSegs.length ? { transport: 'flight', segments: flightSegs } : null;

  const replayIslandsOnly = realStops.filter(s => s.isIsland)
    .map(s => ({ place: s.place, nodeId: s.id, startAt: s.replay.startAt, endAt: s.replay.endAt }));

  return {
    replay: { replayStart: 0, replayEnd: replayDuration, replayDuration, nodeCount: timeline.length },
    timeline,
    chapters,
    capabilities: {
      play: true, pause: true, resume: true,
      jumpToChapter: chapters.length > 0,
      replayDestination: replayDestination.length > 0,
      replayTransport: replayTransport.length > 0,
      replayFlightsOnly: replayFlightsOnly !== null,
      replayIslandsOnly: replayIslandsOnly.length > 0,
    },
    controls: { jumpToChapter: chapters.map(c => ({ index: c.index, label: c.label, startAt: c.startAt, endAt: c.endAt })), replayDestination, replayTransport, replayFlightsOnly, replayIslandsOnly },
    basedOn: journey.basedOn,
  };
}
