// Travel App — Predictive Travel Companion (M24.7).
//
// Gently anticipates what the traveller is likely to enjoy NEXT — using
// deterministic evidence only. NO AI, NO LLM, NO generated prose, NO randomness.
// Each prediction is a fixed template filled from observed patterns, and appears
// ONLY when there is sufficient evidence; no guessing.
//
// Every prediction exposes: confidence, evidence, supporting memories, first &
// last observed, trend, and a plain-language explanation of WHY. Reuses the DNA
// enrichment + feed primitives (zero duplication); no platform change; no
// backend term leaks; presentation stays separate from platform logic.

import { CATEGORY_META, inclusiveDays, dayOf } from './feed.js';
import { enrichMemories, buildTravelDna } from './travel-dna.js';

function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }
function confidenceFor(count) { return count >= 12 ? 'defining' : count >= 4 ? 'strong' : 'emerging'; }
function byTimeAsc(a, b) { return new Date(a.timestamp) - new Date(b.timestamp) || String(a.id).localeCompare(String(b.id)); }
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']; const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function dayNumber(item) {
  if (!item.tripStartDate) return null;
  const start = Date.parse(`${String(item.tripStartDate).slice(0, 10)}T00:00:00Z`);
  const day = Date.parse(`${dayOf(item.entry.timestamp)}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(day)) return null;
  const n = Math.round((day - start) / 86_400_000) + 1;
  return n >= 1 ? n : null;
}
function modeOf(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  for (const [v, c] of counts) if (!best || c > best.count) best = { value: v, count: c };
  return best;
}

// Trend over a chronological list + predicate (earlier half vs later half).
function trendFor(items, pred) {
  if (items.length < 4) return 'new';
  const mid = Math.floor(items.length / 2);
  const e = pct(items.slice(0, mid).filter(pred).length, mid);
  const l = pct(items.slice(mid).filter(pred).length, items.length - mid);
  if (l - e >= 10) return 'rising';
  if (e - l >= 10) return 'falling';
  return 'steady';
}

// Build one prediction from supporting memory items (evidence-gated).
function predict(spec, supportingItems, min) {
  const count = spec.evidenceCount ?? supportingItems.length;
  if (count < min) return null;
  const asc = supportingItems.map(i => i.entry).sort(byTimeAsc);
  return {
    id: spec.id, category: spec.category,
    statement: spec.statement, explanation: spec.explanation,
    score: Math.max(0, Math.min(100, spec.score)),
    confidence: confidenceFor(count),
    evidence: { count, detail: spec.detail },
    supportingMemories: asc.slice(0, 8),
    firstObserved: spec.firstObserved ?? asc[0]?.timestamp ?? null,
    lastObserved: spec.lastObserved ?? asc[asc.length - 1]?.timestamp ?? null,
    trend: spec.trend ?? 'steady',
    accent: spec.accent, icon: spec.icon,
    ...(spec.items ? { items: spec.items } : {}),
  };
}

const ACTIVITY_KEYS = [
  { key: 'dive', verb: 'dive', icon: 'dive' },
  { key: 'mountain', verb: 'hike', icon: 'mountain' },
];
const isSurf = (i) => /\b(surf|surfing|surfed|swell|barrel|lineup|point break)\b/i.test(i.text);
const isWater = (i) => i.cats.includes('beach') || i.cats.includes('dive');

/**
 * Build the deterministic Predictive Companion DTO. Pure function of (events, trips).
 */
export function buildPredictions(events, trips = []) {
  const items = enrichMemories(events, trips);
  const total = items.length;
  const dna = buildTravelDna(events, trips);
  const traitById = new Map(dna.traits.map(t => [t.id, t]));
  const predictions = [];
  const add = (p) => { if (p) predictions.push(p); };

  // --- likely activity on a particular trip-day -----------------------------
  const activityChecks = [...ACTIVITY_KEYS, { key: 'surf', verb: 'surf', icon: 'beach', match: isSurf }];
  for (const a of activityChecks) {
    const hits = items.filter(a.match ? a.match : (i => i.cats.includes(a.key)));
    const dayNums = hits.map(dayNumber).filter(Boolean);
    const mode = modeOf(dayNums);
    if (mode && mode.count >= 2) {
      const onDay = hits.filter(i => dayNumber(i) === mode.value);
      add(predict({
        id: `activity-day-${a.key}`, category: 'likely-activity',
        statement: `You normally ${a.verb} on your ${ordinal(mode.value)} day.`,
        explanation: `On ${mode.count} trips your ${a.verb === 'dive' ? 'first dive' : `first ${a.verb}`} came on day ${mode.value}.`,
        score: pct(mode.count, dayNums.length), detail: `${mode.count} of ${dayNums.length} ${a.verb} days were day ${mode.value}`,
        accent: a.key === 'dive' ? CATEGORY_META.dive.accent : a.key === 'mountain' ? CATEGORY_META.mountain.accent : 'ocean', icon: a.icon,
        trend: trendFor(items, a.match ? a.match : (i => i.cats.includes(a.key))),
      }, onDay, 2));
    }
  }

  // --- likely wake rhythm ---------------------------------------------------
  const earliestByDay = new Map();
  for (const i of items) {
    const d = dayOf(i.entry.timestamp);
    if (!earliestByDay.has(d) || i.hour < earliestByDay.get(d).hour) earliestByDay.set(d, i);
  }
  const earlyItems = [...earliestByDay.values()].filter(i => i.hour < 7);
  if (earlyItems.length >= 2) {
    const nearWater = earlyItems.filter(isWater).length >= Math.ceil(earlyItems.length / 2);
    add(predict({
      id: 'wake-rhythm', category: 'likely-wake-rhythm',
      statement: nearWater ? 'You usually wake before sunrise near the ocean.' : 'You usually wake before sunrise while travelling.',
      explanation: `On ${earlyItems.length} days your first memory was before 7am${nearWater ? ', most of them by the water' : ''}.`,
      score: pct(earlyItems.length, earliestByDay.size), detail: `${earlyItems.length} of ${earliestByDay.size} days started before 7am`,
      accent: 'sunset', icon: 'sunrise', trend: 'steady',
    }, earlyItems, 2));
  }

  // --- likely photography moment --------------------------------------------
  const sunsetMems = items.filter(i => i.cats.includes('sunset'));
  const sunsetPhotos = sunsetMems.filter(i => i.entry.kind === 'photo');
  if (sunsetPhotos.length >= 2) {
    add(predict({
      id: 'photo-sunset', category: 'likely-photography',
      statement: 'You normally photograph sunsets.',
      explanation: `${sunsetPhotos.length} of your ${sunsetMems.length} sunset memories are photos.`,
      score: pct(sunsetPhotos.length, sunsetMems.length), detail: `${sunsetPhotos.length} sunset photos`,
      accent: CATEGORY_META.sunset.accent, icon: 'camera', trend: trendFor(items, i => i.cats.includes('sunset') && i.entry.kind === 'photo'),
    }, sunsetPhotos, 2));
  }

  // --- likely travelling companion ------------------------------------------
  const byCompanion = new Map();
  for (const i of items) for (const n of i.companions) {
    if (!byCompanion.has(n)) byCompanion.set(n, []);
    byCompanion.get(n).push(i);
  }
  const topCompanion = [...byCompanion.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
  if (topCompanion && topCompanion[1].length >= 3) {
    add(predict({
      id: 'companion', category: 'likely-companion',
      statement: `You often travel with ${topCompanion[0]}.`,
      explanation: `${topCompanion[1].length} of your memories include ${topCompanion[0]}.`,
      score: pct(topCompanion[1].length, total), detail: `${topCompanion[1].length} shared memories`,
      accent: 'dusk', icon: 'heart', trend: trendFor(items, i => i.companions.includes(topCompanion[0])),
    }, topCompanion[1], 3));
  }

  // --- likely return location -----------------------------------------------
  const tripsByDest = new Map();
  for (const t of trips) if (t?.destination) {
    if (!tripsByDest.has(t.destination)) tripsByDest.set(t.destination, new Set());
    tripsByDest.get(t.destination).add(t.tripId);
  }
  const returnDest = [...tripsByDest.entries()].filter(([, s]) => s.size >= 2).sort((a, b) => b[1].size - a[1].size)[0];
  const favCountry = modeOf(trips.map(t => t?.country).filter(Boolean));
  if (returnDest) {
    const [destination, set] = returnDest;
    const supporting = items.filter(i => i.destination === destination);
    add(predict({
      id: 'return-destination', category: 'likely-return',
      statement: `You often return to ${destination}.`,
      explanation: `You've travelled to ${destination} on ${set.size} trips.`,
      score: pct(set.size, trips.length), detail: `${set.size} trips to ${destination}`,
      accent: 'ocean', icon: 'repeat', evidenceCount: set.size, trend: 'steady',
    }, supporting, 1));
  } else if (favCountry && favCountry.count >= 2) {
    const supporting = items.filter(i => i.country === favCountry.value);
    add(predict({
      id: 'return-country', category: 'likely-return',
      statement: `You often return to ${favCountry.value}.`,
      explanation: `${favCountry.count} of your trips have been to ${favCountry.value}.`,
      score: pct(favCountry.count, trips.length), detail: `${favCountry.count} trips to ${favCountry.value}`,
      accent: 'sky', icon: 'globe', evidenceCount: favCountry.count, trend: 'steady',
    }, supporting, 1));
  }

  // --- likely destination type (from DNA) -----------------------------------
  const citiesNature = traitById.get('cities-vs-nature');
  if (citiesNature) {
    const nature = citiesNature.score >= 60;
    const city = citiesNature.score <= 40;
    if (nature || city) {
      const supporting = items.filter(i => (nature ? (i.cats.includes('beach') || i.cats.includes('mountain') || i.cats.includes('wildlife') || i.cats.includes('sunset')) : i.cats.includes('city')));
      add(predict({
        id: 'destination-type', category: 'likely-destination-type',
        statement: nature ? 'You’re likely to enjoy nature-rich destinations.' : 'You’re likely to enjoy vibrant cities.',
        explanation: citiesNature.evidence.detail,
        score: nature ? citiesNature.score : 100 - citiesNature.score, detail: citiesNature.evidence.detail,
        accent: nature ? 'forest' : 'slate', icon: 'compass', trend: citiesNature.trend,
      }, supporting, 2));
    }
  }

  // --- likely trip style (Travel DNA match) ---------------------------------
  const signatureTrait = dna.traits.find(t => ['element', 'identity', 'drive'].includes(t.category) && t.score >= 50);
  if (signatureTrait) {
    const supporting = items.filter(i => i.cats.length); // memories that carry a theme
    add(predict({
      id: 'trip-style', category: 'likely-trip-style',
      statement: `Your next trip is likely to match your travel DNA — ${signatureTrait.label.toLowerCase()} (${signatureTrait.score}%).`,
      explanation: `${signatureTrait.label} is your strongest signal: ${signatureTrait.evidence.detail}.`,
      score: signatureTrait.score, detail: `${signatureTrait.score}% ${signatureTrait.label.toLowerCase()}`,
      accent: signatureTrait.accent, icon: 'sparkles', evidenceCount: signatureTrait.evidence.count, trend: signatureTrait.trend,
    }, supporting, 2));
  }

  // --- likely best travel season --------------------------------------------
  const months = trips.map(t => t?.startDate).filter(Boolean).map(d => new Date(`${String(d).slice(0, 10)}T00:00:00Z`).getUTCMonth());
  const favMonth = modeOf(months);
  if (favMonth) {
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    add(predict({
      id: 'season', category: 'likely-season',
      statement: favMonth.count >= 2 ? `You’re most likely to travel again in ${MONTHS[favMonth.value]}.` : `So far you travel in ${MONTHS[favMonth.value]}.`,
      explanation: `${favMonth.count} of ${months.length} trips began in ${MONTHS[favMonth.value]}.`,
      score: pct(favMonth.count, months.length), detail: MONTHS[favMonth.value],
      accent: 'sunset', icon: 'calendar', evidenceCount: months.length, trend: 'steady',
      firstObserved: null, lastObserved: null,
    }, [], 1));
  }

  // --- likely trip length ---------------------------------------------------
  const durations = trips.filter(t => t?.startDate && t?.endDate).map(t => inclusiveDays(t.startDate, t.endDate)).filter(Boolean);
  if (durations.length) {
    const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    add(predict({
      id: 'trip-length', category: 'likely-trip-length',
      statement: durations.length >= 2 ? `Your next trip is likely to last about ${avg} days.` : `You tend to travel for around ${avg} days.`,
      explanation: `Based on ${durations.length} ${durations.length === 1 ? 'trip' : 'trips'} averaging ${avg} days.`,
      score: Math.min(100, Math.round(avg / 21 * 100)), detail: `${avg} days`,
      accent: 'slate', icon: 'calendar', evidenceCount: durations.length, trend: 'steady',
      firstObserved: null, lastObserved: null,
    }, [], 1));
  }

  // --- likely food preference -----------------------------------------------
  const foodMems = items.filter(i => i.cats.includes('food'));
  if (foodMems.length >= 2) {
    add(predict({
      id: 'food', category: 'likely-food',
      statement: 'You’re likely to seek out local food.',
      explanation: `${foodMems.length} of your memories are about food.`,
      score: pct(foodMems.length, total), detail: `${foodMems.length} food memories`,
      accent: CATEGORY_META.food.accent, icon: 'food', trend: trendFor(items, i => i.cats.includes('food')),
    }, foodMems, 2));
  }

  // --- likely packing suggestions (from identity evidence) ------------------
  const packing = [];
  const reasonFor = (id) => traitById.get(id)?.evidence.detail ?? '';
  if (traitById.has('diving-identity')) packing.push({ item: 'Your dive gear', reason: `You dive often (${reasonFor('diving-identity')})` });
  if (traitById.has('surfing-identity')) packing.push({ item: 'A board and wax', reason: `You surf (${reasonFor('surfing-identity')})` });
  if (traitById.has('hiking-identity')) packing.push({ item: 'Hiking boots', reason: `You hit the trails (${reasonFor('hiking-identity')})` });
  if ((traitById.get('photography')?.score ?? 0) >= 50) packing.push({ item: 'Your camera', reason: 'You photograph as you go' });
  if ((traitById.get('ocean-affinity')?.score ?? 0) >= 50) packing.push({ item: 'Reef-safe sunscreen & swimwear', reason: 'You spend your time by the water' });
  if (packing.length) {
    const supporting = items.filter(i => i.cats.length);
    add(predict({
      id: 'packing', category: 'likely-packing',
      statement: 'Based on how you travel, you’ll likely want to pack a few things.',
      explanation: `${packing.length} ${packing.length === 1 ? 'suggestion' : 'suggestions'} drawn from how you travel.`,
      score: Math.min(100, packing.length * 20), detail: `${packing.length} suggestions`,
      accent: 'slate', icon: 'bag', evidenceCount: packing.length, items: packing, trend: 'steady',
      firstObserved: null, lastObserved: null,
    }, supporting, 1));
  }

  // Most confident, strongest predictions first.
  const weight = { emerging: 1, strong: 2, defining: 3 };
  predictions.sort((a, b) => (weight[b.confidence] * b.score) - (weight[a.confidence] * a.score) || b.score - a.score || a.id.localeCompare(b.id));

  const span = total ? { from: items[0].entry.timestamp, to: items[total - 1].entry.timestamp } : null;
  return { predictions, basedOn: { memories: total, trips: trips.length, span } };
}
