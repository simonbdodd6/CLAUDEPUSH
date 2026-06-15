// Travel App — Travel Intelligence (M24.2).
//
// Deterministic PRODUCT intelligence — NOT AI. Every observation is a plain,
// reproducible function of the traveller's own data (their memories + trips).
// The feeling we build toward, gradually: "this app knows my travel style."
// Think Spotify Wrapped + Apple Photos Memories + Polarsteps — but every card is
// an honest, evidence-backed observation, never a guess.
//
// Rules: deterministic (no clock, no randomness), offline-first (pure function
// of stored data), reuses the feed/presenter primitives (zero duplication),
// honest (an insight is emitted ONLY when the data supports it; everything else
// is surfaced as "locked" with a friendly hint so the UI can say "keep
// travelling to unlock"). No platform module is touched; no backend term leaks.

import {
  selectMemories, countCategories, streaks, inclusiveDays, categoriesFor,
  CATEGORY_META, dayOf,
} from './feed.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SEASONS = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'];

function pct(part, total) { return total > 0 ? Math.round((part / total) * 100) : 0; }
function pad(n) { return String(n).padStart(2, '0'); }

// Mode of a list (most frequent value); deterministic tie-break by first-seen.
function modeOf(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  for (const [v, c] of counts) if (!best || c > best.count) best = { value: v, count: c };
  return best;
}

// Median of numbers (lower-middle for even counts → deterministic).
function medianOf(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

// The signature line: the traveller's dominant memory category, as a feeling.
const STYLE_LINES = {
  dive: { headline: 'You live for the water', detail: 'Diving and the ocean run through your memories.' },
  beach: { headline: "You're a beach soul", detail: 'Sand, surf and shoreline define your trips.' },
  mountain: { headline: 'The mountains call you', detail: 'You head for high ground and the trail.' },
  city: { headline: "You're a city explorer", detail: 'Streets, markets and culture pull you in.' },
  wildlife: { headline: 'You travel for the wild', detail: 'Encounters with wildlife mark your journeys.' },
  food: { headline: 'You travel to taste', detail: 'Local food is at the heart of your trips.' },
  sunset: { headline: 'You chase the light', detail: 'Sunsets and golden hours fill your memories.' },
  flight: { headline: "You're always moving", detail: 'The journey itself is part of your story.' },
};

function styleFor(topKey) {
  if (!topKey) return null;
  const line = STYLE_LINES[topKey];
  const meta = CATEGORY_META[topKey];
  return line ? { headline: line.headline, detail: line.detail, accent: meta.accent, icon: meta.icon } : null;
}

// Activity-flavoured categories (things you DO) for "favourite activity".
const ACTIVITY_KEYS = ['dive', 'mountain', 'food', 'wildlife', 'flight'];

/**
 * Build the deterministic Travel Intelligence DTO.
 * @param {Array} events  timeline events (raw platform records)
 * @param {Array} trips   all trips owned by the traveller (may be empty)
 * @returns clean consumer DTO: { travelStyle, insights, locked, basedOn }
 */
export function buildIntelligence(events, trips = []) {
  const memories = selectMemories(events);
  const total = memories.length;
  const counts = countCategories(memories);
  const photos = memories.filter(m => m.kind === 'photo');

  // Ordered category list (richest-first; deterministic tie-break by key order
  // via CATEGORY_META insertion order).
  const ranked = Object.keys(CATEGORY_META)
    .map(key => ({ key, count: counts[key] }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count); // stable: keeps CATEGORY_META order on ties

  const insights = [];
  const push = (score, insight) => insights.push({ score, ...insight });

  // --- Signature style ------------------------------------------------------
  const topKey = ranked[0]?.key ?? null;
  const travelStyle = total >= 1 ? styleFor(topKey) : null;

  // --- Sunsets share --------------------------------------------------------
  if (total >= 3 && counts.sunset > 0) {
    push(80 + counts.sunset, {
      id: 'sunset-share', kind: 'insight', accent: CATEGORY_META.sunset.accent, icon: 'sunset',
      title: `Sunsets appear in ${pct(counts.sunset, total)}% of your memories`,
      detail: 'You have a soft spot for golden hour.',
      stat: { value: pct(counts.sunset, total), label: '% of memories' },
    });
  }

  // --- Beaches vs cities ----------------------------------------------------
  if (counts.beach + counts.city >= 2 && counts.beach !== counts.city) {
    const beachy = counts.beach > counts.city;
    push(70 + Math.abs(counts.beach - counts.city), {
      id: 'beach-vs-city', kind: 'insight', accent: beachy ? CATEGORY_META.beach.accent : CATEGORY_META.city.accent, icon: beachy ? 'beach' : 'city',
      title: beachy ? 'You spend more time on beaches than in cities' : 'You spend more time in cities than on beaches',
      detail: beachy ? 'The coast is where you slow down.' : 'You gravitate to the buzz of a city.',
    });
  }

  // --- Underwater vs land photos -------------------------------------------
  if (photos.length >= 3) {
    const underwater = photos.filter(p => categoriesFor(p).includes('dive')).length;
    const land = photos.length - underwater;
    if (underwater >= 2 && underwater > land) {
      push(75 + underwater, {
        id: 'underwater-photos', kind: 'insight', accent: CATEGORY_META.dive.accent, icon: 'dive',
        title: 'You take more photos underwater than on land',
        detail: 'Your camera comes alive below the surface.',
        stat: { value: pct(underwater, photos.length), label: '% of photos underwater' },
      });
    }
  }

  // --- Favourite activity ---------------------------------------------------
  const activity = ranked.find(c => ACTIVITY_KEYS.includes(c.key));
  if (activity) {
    push(60 + activity.count, {
      id: 'favourite-activity', kind: 'insight', accent: CATEGORY_META[activity.key].accent, icon: CATEGORY_META[activity.key].icon,
      title: `Your favourite thing to do: ${CATEGORY_META[activity.key].label}`,
      detail: 'It shows up more than anything else you do.',
      stat: { value: activity.count, label: CATEGORY_META[activity.key].label },
    });
  }

  // --- Daily rhythm (deterministic from memory times) ----------------------
  const byDayEarliest = new Map();
  for (const m of memories) {
    const d = dayOf(m.timestamp);
    const hour = new Date(m.timestamp).getUTCHours() + new Date(m.timestamp).getUTCMinutes() / 60;
    if (!byDayEarliest.has(d) || hour < byDayEarliest.get(d)) byDayEarliest.set(d, hour);
  }
  const activeDays = byDayEarliest.size;
  if (activeDays >= 3) {
    const medianHour = Math.floor(medianOf([...byDayEarliest.values()]));
    const earlyRiser = medianHour < 7;
    push(55, {
      id: 'daily-rhythm', kind: 'insight', accent: 'sky', icon: earlyRiser ? 'sunrise' : 'clock',
      title: earlyRiser
        ? `You're usually up before 7am while travelling`
        : `While travelling, your day usually starts around ${pad(medianHour)}:00`,
      detail: earlyRiser ? 'You catch the quiet early hours.' : 'You ease into your travel days.',
      stat: { value: `${pad(medianHour)}:00`, label: 'typical first memory' },
    });
  }

  // --- Travel streak --------------------------------------------------------
  const streak = streaks(memories.map(m => dayOf(m.timestamp)));
  if (streak.longest >= 2) {
    push(50, {
      id: 'travel-streak', kind: 'insight', accent: 'forest', icon: 'flame',
      title: `Your longest run of travel days: ${streak.longest} in a row`,
      detail: 'A proper stretch of being on the move.',
      stat: { value: streak.longest, label: 'days in a row' },
    });
  }

  // --- Dive streak ----------------------------------------------------------
  const diveDays = memories.filter(m => categoriesFor(m).includes('dive')).map(m => dayOf(m.timestamp));
  const diveStreak = streaks(diveDays);
  if (diveStreak.longest >= 2) {
    push(58, {
      id: 'dive-streak', kind: 'insight', accent: CATEGORY_META.dive.accent, icon: 'dive',
      title: `Your longest dive streak: ${diveStreak.longest} days running`,
      detail: 'Back in the water, day after day.',
      stat: { value: diveStreak.longest, label: 'dive days in a row' },
    });
  }

  // --- Trips: favourite country, average length, season, revisits ----------
  const datedTrips = trips.filter(t => t?.startDate);
  const countries = trips.map(t => t?.country).filter(Boolean);
  const favCountry = modeOf(countries);
  if (favCountry) {
    push(favCountry.count >= 2 ? 90 : 45, {
      id: 'favourite-country', kind: 'insight', accent: 'sky', icon: 'globe',
      title: favCountry.count >= 2 ? `Your favourite country is ${favCountry.value}` : `${favCountry.value} is your kind of place`,
      detail: favCountry.count >= 2 ? `You keep coming back — ${favCountry.count} trips and counting.` : 'Where your story so far is set.',
      stat: { value: favCountry.value, label: favCountry.count >= 2 ? `${favCountry.count} trips` : 'destination' },
    });
  }

  const lengths = datedTrips.map(t => inclusiveDays(t.startDate, t.endDate)).filter(Boolean);
  if (lengths.length) {
    const avg = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
    push(40, {
      id: lengths.length >= 2 ? 'average-trip-length' : 'trip-length', kind: 'insight', accent: 'slate', icon: 'calendar',
      title: lengths.length >= 2 ? `Your trips average ${avg} days` : `This trip is ${avg} days`,
      detail: lengths.length >= 2 ? 'Your natural rhythm for a journey.' : 'A good while to settle into a place.',
      stat: { value: avg, label: 'days' },
    });
  }

  const months = datedTrips.map(t => new Date(`${String(t.startDate).slice(0, 10)}T00:00:00Z`).getUTCMonth());
  const favSeason = modeOf(months.map(m => SEASONS[m]));
  if (favSeason) {
    const favMonth = modeOf(months);
    push(38, {
      id: 'favourite-season', kind: 'insight', accent: 'sunset', icon: 'leaf',
      title: `You love travelling in ${favSeason.value.toLowerCase()}`,
      detail: favMonth ? `${MONTHS[favMonth.value]} is your month to go.` : 'The season you set off most.',
      stat: { value: favSeason.value, label: 'favourite season' },
    });
  }

  // Revisits: a destination or country that appears in more than one trip.
  const destinations = trips.map(t => t?.destination).filter(Boolean);
  const revisit = modeOf(destinations);
  if (revisit && revisit.count >= 2) {
    push(85, {
      id: 'revisits', kind: 'insight', accent: 'ocean', icon: 'repeat',
      title: `You keep returning to ${revisit.value}`,
      detail: 'Some places get under your skin.',
      stat: { value: revisit.count, label: 'visits' },
    });
  }

  // Gentle revisit suggestion when one place holds a lot of memories.
  const currentDestination = trips[0]?.destination ?? null;
  if (currentDestination && total >= 5 && (!revisit || revisit.count < 2)) {
    push(30, {
      id: 'should-revisit', kind: 'insight', accent: 'ocean', icon: 'heart',
      title: `You should go back to ${currentDestination}`,
      detail: `You gathered ${total} memories there — clearly your kind of place.`,
      stat: { value: total, label: 'memories' },
    });
  }

  insights.sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
  const publicInsights = insights.map(({ score, ...rest }) => rest); // drop internal score

  // --- Locked insights (need more data) — honest "keep travelling" hints ----
  const locked = [];
  const lockedIf = (cond, id, title, hint) => { if (cond) locked.push({ id, title, hint }); };
  lockedIf(trips.length < 2, 'more-countries', 'Your favourite countries', 'Take another trip to compare destinations.');
  lockedIf(destinations.every((d, _i, a) => a.indexOf(d) === a.lastIndexOf(d)), 'revisit-pattern', 'Places you revisit', 'Return to a place you loved to unlock this.');
  lockedIf(true, 'companions', 'Your favourite travel companion', 'Add who you travelled with to unlock this.');
  lockedIf(true, 'accommodation', 'Your favourite place to stay', 'Log where you stayed to unlock this.');
  lockedIf(true, 'similar-places', 'Places similar to ones you loved', 'Travel more so we can spot your patterns.');
  lockedIf(true, 'quiet-vs-busy', 'Quiet escapes vs busy cities', 'A few more trips will reveal your preference.');

  return {
    travelStyle,
    insights: publicInsights,
    locked,
    basedOn: { memories: total, trips: trips.length, activeDays },
  };
}
