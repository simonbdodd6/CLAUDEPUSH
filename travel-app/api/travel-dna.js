// Travel App — Personal Travel DNA (M24.6).
//
// The long-term sense of WHO the traveller is, learned from evidence gathered
// across every journey. Each characteristic ("trait") is a deterministic
// function of the traveller's own memories + trips — NO AI, NO generated prose,
// NO randomness. The tone is premium and human: the app can eventually say
// "You live for the ocean", "You slow down near water", "You return to the
// places that move you" — and each statement is a fixed template backed by real
// evidence, never a model.
//
// Honest by design: a trait appears ONLY when there is enough evidence; traits
// with no data (e.g. spending) simply don't show. Every trait carries a score,
// evidence, confidence, trend, and first/latest observed. Reuses the feed
// primitives (zero duplication); no platform change; no backend term leaks.

import { selectMemories, categoriesFor, CATEGORY_META, dayOf, inclusiveDays } from './feed.js';
import { normalizeCompanions } from './relationships.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }
function clamp(n, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, n)); }
function hourOf(iso) { return new Date(iso).getUTCHours(); }
function monthOf(iso) { return new Date(iso).getUTCMonth(); }
function bandOf(score) { return score >= 66 ? 'high' : score >= 33 ? 'medium' : 'low'; }
function confidenceFor(count) { return count >= 12 ? 'defining' : count >= 4 ? 'strong' : 'emerging'; }

// Trend from a chronological list + a predicate: compare the earlier half to the
// later half. Deterministic; 'new' when there isn't enough history to compare.
function trendFor(items, pred) {
  if (items.length < 4) return 'new';
  const mid = Math.floor(items.length / 2);
  const early = items.slice(0, mid);
  const late = items.slice(mid);
  const e = pct(early.filter(pred).length, early.length);
  const l = pct(late.filter(pred).length, late.length);
  if (l - e >= 10) return 'rising';
  if (e - l >= 10) return 'falling';
  return 'steady';
}

function pickStatement(statements, score) { return statements[bandOf(score)] ?? statements.high; }

function baseTrait(t) {
  return {
    id: t.id, label: t.label, statement: t.statement,
    category: t.category, accent: t.accent, icon: t.icon,
    score: t.score, level: t.level ?? bandOf(t.score),
    evidence: t.evidence,
    confidence: confidenceFor(t.evidence.count),
    trend: t.trend ?? 'steady',
    firstObserved: t.firstObserved ?? null,
    latestObserved: t.latestObserved ?? null,
    ...(t.value !== undefined ? { value: t.value } : {}),
  };
}

// --- evidence enrichment ----------------------------------------------------

// Chronological clean memory entries enriched with the evidence other layers
// need (place, companions, trip context). Shared by Travel DNA and Predictions
// so enrichment lives in one place (zero duplication).
export function enrichMemories(events, trips) {
  const tripById = new Map(trips.filter(t => t?.tripId).map(t => [t.tripId, t]));
  const metaById = new Map();
  for (const ev of events) {
    const note = ev.metadata?.note ?? '';
    const photoRef = ev.metadata?.photoRef ?? null;
    if (!note && !photoRef) continue;
    const trip = ev.tripId ? tripById.get(ev.tripId) : null;
    metaById.set(ev.timelineEventId, {
      destination: trip?.destination ?? null,
      country: trip?.country ?? null,
      companions: normalizeCompanions(ev.metadata?.companions),
      tripId: ev.tripId ?? null,
      tripStartDate: trip?.startDate ?? null,
    });
  }
  // ascending (chronological) clean entries enriched with evidence
  const asc = [...selectMemories(events)].reverse();
  return asc.map(entry => ({
    entry,
    text: `${entry.title} ${entry.detail}`,
    cats: categoriesFor(entry),
    hour: hourOf(entry.timestamp),
    ...(metaById.get(entry.id) ?? { destination: null, country: null, companions: [], tripId: null, tripStartDate: null }),
  }));
}

function spanEnds(hits) {
  if (!hits.length) return { firstObserved: null, latestObserved: null };
  return { firstObserved: hits[0].entry.timestamp, latestObserved: hits[hits.length - 1].entry.timestamp };
}

// --- trait builders ---------------------------------------------------------

// Intensity trait: how much of the traveller's memories express something.
function intensityTrait(spec, items) {
  const hits = items.filter(spec.predicate);
  if (hits.length < (spec.min ?? 2)) return null;
  const score = clamp(pct(hits.length, items.length));
  return baseTrait({
    ...spec, score,
    evidence: { count: hits.length, detail: `${hits.length} of ${items.length} memories` },
    trend: trendFor(items, spec.predicate),
    statement: pickStatement(spec.statements, score),
    ...spanEnds(hits),
  });
}

// Spectrum trait: a tendency between two poles (score 0 = pole A, 100 = pole B).
function spectrumTrait(spec, items) {
  const a = items.filter(spec.aPred).length;
  const b = items.filter(spec.bPred).length;
  if (a + b < (spec.min ?? 2)) return null;
  const score = clamp(pct(b, a + b));
  const statement = score >= 60 ? spec.statements.b : score <= 40 ? spec.statements.a : spec.statements.mid;
  const hits = items.filter(i => spec.aPred(i) || spec.bPred(i));
  return baseTrait({
    ...spec, score, statement,
    evidence: { count: a + b, detail: `${b} ${spec.poleB} · ${a} ${spec.poleA}` },
    trend: trendFor(items, i => spec.bPred(i)),
    ...spanEnds(hits),
  });
}

function modeOf(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  for (const [v, c] of counts) if (!best || c > best.count) best = { value: v, count: c };
  return best;
}

// --- predicates -------------------------------------------------------------

const has = (key) => (i) => i.cats.includes(key);
const isAdventure = (i) => i.cats.some(c => c === 'dive' || c === 'mountain' || c === 'wildlife');
const isWater = (i) => i.cats.includes('beach') || i.cats.includes('dive');
const isNature = (i) => i.cats.some(c => c === 'beach' || c === 'mountain' || c === 'wildlife' || c === 'sunset');
const isCalm = (i) => i.entry.kind === 'journal' || i.cats.includes('sunset');
const isPhoto = (i) => i.entry.kind === 'photo';
const isSurf = (i) => /\b(surf|surfing|surfed|swell|barrel|lineup|point break)\b/i.test(i.text);
const isCulture = (i) => i.cats.includes('city') || /\b(temple|museum|gallery|heritage|ruins|culture|festival|ceremony)\b/i.test(i.text);
const withCompanions = (i) => i.companions.length > 0;

/**
 * Build the deterministic Personal Travel DNA DTO. Pure function of (events, trips).
 */
export function buildTravelDna(events, trips = []) {
  const items = enrichMemories(events, trips);
  const total = items.length;
  const traits = [];
  const add = (t) => { if (t) traits.push(t); };

  // --- intensity traits -----------------------------------------------------
  add(intensityTrait({ id: 'ocean-affinity', label: 'Ocean affinity', category: 'element', accent: CATEGORY_META.dive.accent, icon: 'beach', predicate: isWater, statements: { high: 'You live for the ocean.', medium: 'The water keeps pulling you back.', low: 'You visit the water now and then.' } }, items));
  add(intensityTrait({ id: 'adventure', label: 'Adventure', category: 'drive', accent: 'forest', icon: 'mountain', predicate: isAdventure, statements: { high: 'You seek out adventure.', medium: 'You like a little adventure.', low: 'You keep adventure gentle.' } }, items));
  add(intensityTrait({ id: 'relaxation', label: 'Relaxation', category: 'drive', accent: 'sand', icon: 'moon', predicate: isCalm, statements: { high: 'You travel to slow down.', medium: 'You balance calm and motion.', low: 'You rarely sit still.' } }, items));
  add(intensityTrait({ id: 'food-explorer', label: 'Food explorer', category: 'identity', accent: CATEGORY_META.food.accent, icon: 'food', predicate: has('food'), statements: { high: 'You travel to eat.', medium: 'Food is part of your journey.', low: 'You eat to travel.' } }, items));
  add(intensityTrait({ id: 'diving-identity', label: 'Diving', category: 'identity', accent: CATEGORY_META.dive.accent, icon: 'dive', predicate: has('dive'), min: 1, statements: { high: 'Diving is part of who you are.', medium: 'Diving runs through your travels.', low: 'You dive when you can.' } }, items));
  add(intensityTrait({ id: 'surfing-identity', label: 'Surfing', category: 'identity', accent: 'ocean', icon: 'beach', predicate: isSurf, min: 1, statements: { high: 'You chase waves.', medium: 'Surfing is part of your trips.', low: 'You catch the odd wave.' } }, items));
  add(intensityTrait({ id: 'hiking-identity', label: 'Hiking', category: 'identity', accent: CATEGORY_META.mountain.accent, icon: 'mountain', predicate: has('mountain'), min: 1, statements: { high: 'You head for high ground.', medium: 'You love a good trail.', low: 'You hike occasionally.' } }, items));
  add(intensityTrait({ id: 'culture-seeker', label: 'Culture seeker', category: 'identity', accent: 'slate', icon: 'city', predicate: isCulture, statements: { high: 'You travel for culture.', medium: 'Culture draws you in.', low: 'You sample the local culture.' } }, items));
  add(intensityTrait({ id: 'photography', label: 'Photography', category: 'habit', accent: 'dusk', icon: 'camera', predicate: isPhoto, statements: { high: 'You see the world through a lens.', medium: 'You capture as you go.', low: 'You photograph the highlights.' } }, items));

  // --- spectrum traits ------------------------------------------------------
  add(spectrumTrait({ id: 'water-vs-mountains', label: 'Water vs mountains', category: 'spectrum', accent: 'sky', icon: 'compass', aPred: has('mountain'), bPred: isWater, poleA: 'mountains', poleB: 'water', statements: { a: 'The mountains call you.', mid: 'Equal parts sea and summit.', b: 'You belong by the water.' } }, items));
  add(spectrumTrait({ id: 'cities-vs-nature', label: 'Cities vs nature', category: 'spectrum', accent: 'forest', icon: 'compass', aPred: has('city'), bPred: isNature, poleA: 'city', poleB: 'nature', statements: { a: 'You thrive in cities.', mid: 'You move between city and wild.', b: 'Nature is where you breathe.' } }, items));
  add(spectrumTrait({ id: 'rhythm', label: 'Daily rhythm', category: 'spectrum', accent: 'sunset', icon: 'sunrise', aPred: (i) => i.hour >= 5 && i.hour < 10, bPred: (i) => i.hour >= 20 || i.hour < 4, poleA: 'mornings', poleB: 'nights', statements: { a: 'You rise with the sun.', mid: 'You travel morning and night.', b: 'You come alive after dark.' } }, items));
  add(spectrumTrait({ id: 'social', label: 'Solo vs together', category: 'spectrum', accent: 'dusk', icon: 'people', aPred: (i) => i.companions.length === 0, bPred: withCompanions, poleA: 'solo', poleB: 'shared', statements: { a: 'You travel best alone.', mid: 'You mix solo trips and shared ones.', b: 'You travel best with others.' } }, items));

  // --- pace (fast vs slow) from average trip duration ------------------------
  const datedTrips = trips.filter(t => t?.startDate && t?.endDate);
  const durations = datedTrips.map(t => inclusiveDays(t.startDate, t.endDate)).filter(Boolean);
  if (durations.length) {
    const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    // longer average stay → slower traveller → lower score (score: 0 slow … 100 fast)
    const score = clamp(Math.round(100 - Math.min(avg, 21) / 21 * 100));
    add(baseTrait({
      id: 'pace', label: 'Travel pace', category: 'spectrum', accent: 'slate', icon: 'clock', score,
      statement: score <= 40 ? 'You travel slowly and stay a while.' : score >= 60 ? 'You travel fast and cover ground.' : 'You keep an easy, balanced pace.',
      evidence: { count: durations.length, detail: `avg ${avg} ${avg === 1 ? 'day' : 'days'} per trip` },
      trend: 'steady',
      firstObserved: `${String(datedTrips[0].startDate).slice(0, 10)}T00:00:00Z`,
      latestObserved: `${String(datedTrips[datedTrips.length - 1].startDate).slice(0, 10)}T00:00:00Z`,
      value: avg,
    }));
  }

  // --- memory density -------------------------------------------------------
  if (total >= 2) {
    const days = new Set(items.map(i => dayOf(i.entry.timestamp))).size;
    const density = days ? total / days : 0;
    const score = clamp(Math.round(Math.min(density, 5) / 5 * 100));
    add(baseTrait({
      id: 'memory-density', label: 'Memory density', category: 'habit', accent: 'dusk', icon: 'sparkles', score,
      statement: score >= 66 ? 'You capture a lot of each day.' : score >= 33 ? 'You capture the moments that matter.' : 'You keep a light, selective record.',
      evidence: { count: total, detail: `${Math.round(density * 10) / 10} memories per day` },
      trend: 'steady', ...spanEnds(items), value: Math.round(density * 10) / 10,
    }));
  }

  // --- explorer breadth -----------------------------------------------------
  const destinations = new Set(items.map(i => i.destination).filter(Boolean));
  const countries = new Set(items.map(i => i.country).filter(Boolean));
  if (destinations.size || countries.size) {
    const score = clamp(destinations.size * 20 + countries.size * 15);
    add(baseTrait({
      id: 'explorer', label: 'Explorer', category: 'drive', accent: 'sky', icon: 'globe', score,
      statement: score >= 66 ? 'You roam far and wide.' : score >= 33 ? 'You like to keep exploring.' : 'You go deep rather than wide.',
      evidence: { count: destinations.size, detail: `${destinations.size} ${destinations.size === 1 ? 'place' : 'places'} · ${countries.size} ${countries.size === 1 ? 'country' : 'countries'}` },
      trend: 'steady', ...spanEnds(items),
    }));
  }

  // --- return affinity ------------------------------------------------------
  const tripsByDest = new Map();
  for (const t of trips) if (t?.destination) {
    if (!tripsByDest.has(t.destination)) tripsByDest.set(t.destination, new Set());
    tripsByDest.get(t.destination).add(t.tripId);
  }
  const totalTrips = trips.length;
  if (totalTrips >= 1) {
    const revisitedTrips = [...tripsByDest.values()].filter(s => s.size >= 2).reduce((n, s) => n + s.size, 0);
    const score = clamp(pct(revisitedTrips, totalTrips));
    const topReturn = [...tripsByDest.entries()].filter(([, s]) => s.size >= 2).sort((a, b) => b[1].size - a[1].size)[0];
    add(baseTrait({
      id: 'return-affinity', label: 'Return affinity', category: 'pattern', accent: 'ocean', icon: 'repeat', score,
      statement: topReturn ? `You return to the places that move you.` : 'You chase somewhere new each time.',
      evidence: { count: totalTrips, detail: topReturn ? `${topReturn[1].size} trips to ${topReturn[0]}` : `${destinations.size} different places` },
      trend: 'steady', value: topReturn ? topReturn[0] : null,
    }));
  }

  // --- fact traits (favourites) ---------------------------------------------
  const favCountry = modeOf(trips.map(t => t?.country).filter(Boolean));
  if (favCountry) {
    add(baseTrait({
      id: 'favourite-country', label: 'Favourite country', category: 'favourite', accent: 'sky', icon: 'flag',
      score: clamp(pct(favCountry.count, totalTrips || 1)),
      statement: favCountry.count >= 2 ? `You spend longer in ${favCountry.value} than anywhere else.` : `${favCountry.value} is where your story lives so far.`,
      evidence: { count: favCountry.count, detail: `${favCountry.count} of ${totalTrips} trips` },
      trend: 'steady', value: favCountry.value,
    }));
  }
  const favRegion = modeOf(trips.map(t => t?.destination).filter(Boolean));
  if (favRegion) {
    add(baseTrait({
      id: 'favourite-region', label: 'Favourite region', category: 'favourite', accent: 'sand', icon: 'map',
      score: clamp(pct(favRegion.count, totalTrips || 1)),
      statement: `You keep finding your way to ${favRegion.value}.`,
      evidence: { count: favRegion.count, detail: `${favRegion.count} ${favRegion.count === 1 ? 'trip' : 'trips'}` },
      trend: 'steady', value: favRegion.value,
    }));
  }
  const months = trips.map(t => t?.startDate).filter(Boolean).map(d => monthOf(`${String(d).slice(0, 10)}T00:00:00Z`));
  const favMonth = modeOf(months);
  if (favMonth) {
    add(baseTrait({
      id: 'favourite-months', label: 'Favourite month to travel', category: 'favourite', accent: 'sunset', icon: 'calendar',
      score: clamp(pct(favMonth.count, months.length || 1)),
      statement: `You travel most in ${MONTHS[favMonth.value]}.`,
      evidence: { count: favMonth.count, detail: `${MONTHS[favMonth.value]}` },
      trend: 'steady', value: MONTHS[favMonth.value],
    }));
  }

  // --- favourite companion --------------------------------------------------
  const byCompanion = new Map();
  for (const i of items) for (const n of i.companions) byCompanion.set(n, (byCompanion.get(n) ?? 0) + 1);
  const favCompanion = [...byCompanion.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (favCompanion) {
    const sharedHits = items.filter(i => i.companions.includes(favCompanion[0]));
    add(baseTrait({
      id: 'favourite-companion', label: 'Favourite companion', category: 'favourite', accent: 'dusk', icon: 'heart',
      score: clamp(pct(favCompanion[1], total)),
      statement: `You travel best alongside ${favCompanion[0]}.`,
      evidence: { count: favCompanion[1], detail: `${favCompanion[1]} shared ${favCompanion[1] === 1 ? 'memory' : 'memories'}` },
      trend: 'steady', value: favCompanion[0], ...spanEnds(sharedHits),
    }));
  }

  // --- average trip duration (fact) -----------------------------------------
  if (durations.length) {
    const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    add(baseTrait({
      id: 'average-trip-duration', label: 'Typical trip length', category: 'favourite', accent: 'slate', icon: 'calendar',
      score: clamp(Math.round(Math.min(avg, 21) / 21 * 100)),
      statement: durations.length >= 2 ? `Your trips usually last about ${avg} days.` : `This trip runs ${avg} days.`,
      evidence: { count: durations.length, detail: `${avg} ${avg === 1 ? 'day' : 'days'}` },
      trend: 'steady', value: avg,
    }));
  }

  // Order: most defining first (confidence weight × score), then score, then id.
  const weight = { emerging: 1, strong: 2, defining: 3 };
  traits.sort((a, b) => (weight[b.confidence] * b.score) - (weight[a.confidence] * a.score) || b.score - a.score || a.id.localeCompare(b.id));

  // Headline: the single most defining statement.
  const headline = traits.length ? { statement: traits[0].statement, trait: traits[0].id } : null;

  const allSpan = items.length ? { from: items[0].entry.timestamp, to: items[items.length - 1].entry.timestamp } : null;
  return {
    headline,
    traits,
    basedOn: { memories: total, trips: trips.length, span: allSpan },
  };
}
