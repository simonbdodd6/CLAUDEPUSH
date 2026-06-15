// Travel App — Relationship & Shared Journey Intelligence (M24.3).
//
// Deterministic PRODUCT intelligence about the people you travel with — NOT AI.
// Every line is a plain, reproducible function of the traveller's own data: the
// memories they captured and who they tagged as "with" them. The feeling we
// build toward is warmth, not a spreadsheet: "You and Manon have explored 6
// places together", "You've watched 31 sunsets together", "You always dive
// together."
//
// Companions are a PRODUCT concept here (names tagged on a memory, stored in the
// timeline event metadata). They could later be promoted to graph COMPANION
// entities + TRAVELLED_WITH edges (see PRODUCT_VISION.md) — but the aggregation
// below is presentation logic, so it stays in the product layer with zero
// platform duplication. Deterministic, offline-first, no backend term leaks.

import { categoriesFor, dayOf } from './feed.js';

// Clean a raw companions input into a de-duplicated, ordered list of names.
export function normalizeCompanions(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

// Is this event one of the traveller's own captured memories (note or photo)?
function memoryText(ev) {
  const note = ev.metadata?.note ?? '';
  const photoRef = ev.metadata?.photoRef ?? null;
  if (!note && !photoRef) return null;
  return { note, photoRef };
}

function categoriesForEvent(ev, mem) {
  return categoriesFor({ title: mem.note, detail: mem.note });
}

function modeOf(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  for (const [v, c] of counts) if (!best || c > best.count) best = { value: v, count: c };
  return best;
}

function pluralise(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

/**
 * Build deterministic shared-journey intelligence.
 * @param {Array} events  raw timeline events (carry tripId + metadata.companions)
 * @param {Array} trips   the traveller's trips (for country/destination context)
 */
export function buildRelationships(events, trips = []) {
  const tripById = new Map(trips.filter(t => t?.tripId).map(t => [t.tripId, t]));

  // The traveller's own dive total (for "you always dive together").
  let myDiveCount = 0;
  const perCompanion = new Map(); // name -> { events: [] }
  const tripCompanionSets = new Map(); // tripId -> Set(names)

  for (const ev of events) {
    const mem = memoryText(ev);
    if (!mem) continue;
    if (categoriesForEvent(ev, mem).includes('dive')) myDiveCount += 1;

    const companions = normalizeCompanions(ev.metadata?.companions);
    if (!companions.length) continue;
    if (ev.tripId) {
      if (!tripCompanionSets.has(ev.tripId)) tripCompanionSets.set(ev.tripId, new Set());
      const set = tripCompanionSets.get(ev.tripId);
      for (const n of companions) set.add(n);
    }
    for (const name of companions) {
      if (!perCompanion.has(name)) perCompanion.set(name, []);
      perCompanion.get(name).push(ev);
    }
  }

  const stories = [];
  let totalShared = 0;

  for (const [name, evs] of perCompanion) {
    totalShared += evs.length;
    const days = new Set(evs.map(e => dayOf(e.timestamp)));
    const tripIds = new Set(evs.map(e => e.tripId).filter(Boolean));
    const destinations = [...tripIds].map(id => tripById.get(id)?.destination).filter(Boolean);
    const countries = new Set([...tripIds].map(id => tripById.get(id)?.country).filter(Boolean));
    const places = new Set(destinations);

    let sunsets = 0; let dives = 0; let flights = 0; let photos = 0;
    for (const e of evs) {
      const mem = memoryText(e);
      const cats = categoriesForEvent(e, mem);
      if (cats.includes('sunset')) sunsets += 1;
      if (cats.includes('dive')) dives += 1;
      if (cats.includes('flight')) flights += 1;
      if (mem.photoRef) photos += 1;
    }

    const favDestination = modeOf(destinations)?.value ?? null;
    const stats = {
      tripsTogether: tripIds.size,
      daysTogether: days.size,
      countriesTogether: countries.size,
      placesTogether: places.size,
      sharedMemories: evs.length,
      sharedSunsets: sunsets,
      sharedDives: dives,
      sharedFlights: flights,
      sharedPhotos: photos,
    };

    // Emotional cards — only emitted when the data supports them.
    const insights = [];
    const card = (score, id, accent, icon, title, detail, stat) => insights.push({ score, id, kind: 'insight', accent, icon, title, detail, ...(stat ? { stat } : {}) });

    card(100, 'memories-together', 'dusk', 'heart',
      `You've created ${pluralise(evs.length, 'memory', 'memories')} together`,
      'Every one of them with them by your side.', { value: evs.length, label: 'memories' });

    if (days.size >= 1) {
      card(95, 'days-together', 'sky', 'calendar',
        `You've spent ${pluralise(days.size, 'day', 'days')} travelling together`,
        'Time on the road that you shared.', { value: days.size, label: 'days' });
    }
    if (places.size >= 2) {
      card(90, 'places-together', 'sand', 'map',
        `You and ${name} have explored ${pluralise(places.size, 'place', 'places')} together`,
        'A map you are drawing side by side.', { value: places.size, label: 'places' });
    }
    if (countries.size >= 2) {
      card(85, 'countries-together', 'globe', 'globe',
        `${pluralise(countries.size, 'country', 'countries')} explored together`,
        'Borders crossed as a pair.', { value: countries.size, label: 'countries' });
    }
    if (sunsets >= 1) {
      card(80, 'sunsets-together', 'sunset', 'sunset',
        `You've watched ${pluralise(sunsets, 'sunset', 'sunsets')} together`,
        'The sky put on a show, just for you two.', { value: sunsets, label: 'sunsets' });
    }
    if (dives >= 2 && dives === myDiveCount) {
      card(78, 'always-dive', 'ocean', 'dive',
        'You always dive together',
        'Every descent, the same buddy on your shoulder.', { value: dives, label: 'dives' });
    } else if (dives >= 1) {
      card(70, 'dives-together', 'ocean', 'dive',
        `You've dived together ${pluralise(dives, 'time', 'times')}`,
        'Down below, side by side.', { value: dives, label: 'dives' });
    }
    if (flights >= 1) {
      card(60, 'flights-together', 'sky', 'flight',
        `You've taken ${pluralise(flights, 'flight', 'flights')} together`,
        'Window seats and shared horizons.', { value: flights, label: 'flights' });
    }
    if (favDestination) {
      card(75, 'favourite-together', 'forest', 'star',
        `Your favourite place together is ${favDestination}`,
        'The one you keep coming back to as a pair.', { value: favDestination, label: 'destination' });
    }

    insights.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const publicInsights = insights.map(({ score, ...rest }) => rest);

    stories.push({
      name,
      headline: `You and ${name}`,
      summary: publicInsights[0]?.title ?? `You and ${name} have travelled together`,
      favouriteDestination: favDestination,
      stats,
      insights: publicInsights,
      _sort: { memories: evs.length, days: days.size },
    });
  }

  // Strongest bond first (most shared memories, then days, then name).
  stories.sort((a, b) => b._sort.memories - a._sort.memories || b._sort.days - a._sort.days || a.name.localeCompare(b.name));
  const companions = stories.map(({ _sort, ...rest }) => rest);

  // Most travelled with (the headline relationship).
  const mostTravelledWith = companions.length
    ? { name: companions[0].name, tripsTogether: companions[0].stats.tripsTogether, daysTogether: companions[0].stats.daysTogether, sharedMemories: companions[0].stats.sharedMemories }
    : null;

  // Friends met on multiple trips.
  const recurringCompanions = companions
    .filter(c => c.stats.tripsTogether >= 2)
    .map(c => ({ name: c.name, tripsTogether: c.stats.tripsTogether }));

  // Travel circles — groups who travelled together on the same trip(s).
  const circleMap = new Map(); // sorted-members-key -> { members, tripsTogether }
  for (const set of tripCompanionSets.values()) {
    if (set.size < 2) continue;
    const members = [...set].sort((a, b) => a.localeCompare(b));
    const key = members.join(' · ').toLowerCase();
    if (!circleMap.has(key)) circleMap.set(key, { members, tripsTogether: 0 });
    circleMap.get(key).tripsTogether += 1;
  }
  const circles = [...circleMap.values()].sort((a, b) => b.tripsTogether - a.tripsTogether || a.members.join().localeCompare(b.members.join()));

  // Honest "not yet" hints.
  const locked = [
    { id: 'anniversary', title: 'Anniversary trips', hint: 'Mark a trip as an anniversary to unlock this.' },
    { id: 'honeymoon', title: 'Honeymoon timeline', hint: 'Tag your honeymoon to see it as its own story.' },
    { id: 'shared-hotels', title: 'Hotels you’ve shared', hint: 'Log where you stayed together to unlock this.' },
  ];

  return {
    mostTravelledWith,
    companions,
    recurringCompanions,
    circles,
    locked,
    basedOn: { companions: companions.length, sharedMemories: totalShared },
  };
}
