// CoachEasier Performance — plate calculator & warm-up suggestions (SC7).
//
// Practical helpers that never modify the prescription. The plate
// calculator only ever uses the plates it is told exist; warm-up
// suggestions are clearly-labelled, skippable extras whose ramp table is
// PROVISIONAL_REQUIRES_SNC_REVIEW. Pure module.

import { BAR_WEIGHTS_KG, DEFAULT_PLATES_KG, WARMUP_MIN_WORKING_KG, WARMUP_RAMP } from '../types/workout.js';
import { roundToIncrement } from './load-model.js';

export { BAR_WEIGHTS_KG, DEFAULT_PLATES_KG };

/**
 * Plates per side for a barbell target. Deterministic greedy fill using
 * ONLY the available plates — never invents an unavailable plate.
 * @returns {{ok:boolean, perSide:number[], achievedTotal:number, shortfallKg:number}}
 */
export function platesPerSide(targetTotalKg, barWeightKg = 20, availablePlatesKg = DEFAULT_PLATES_KG) {
  const target = Number(targetTotalKg);
  const bar = Number(barWeightKg);
  if (!Number.isFinite(target) || !Number.isFinite(bar) || target < bar) {
    return { ok: false, perSide: [], achievedTotal: bar, shortfallKg: Math.max(0, target - bar) };
  }
  let remainingPerSide = (target - bar) / 2;
  const perSide = [];
  const plates = [...availablePlatesKg].sort((a, b) => b - a);
  for (const p of plates) {
    while (remainingPerSide >= p - 1e-9) {
      perSide.push(p);
      remainingPerSide -= p;
    }
  }
  const achievedTotal = bar + (perSide.reduce((a, b) => a + b, 0) * 2);
  return {
    ok: Math.abs(achievedTotal - target) < 1e-9,
    perSide,
    achievedTotal,
    shortfallKg: Math.round((target - achievedTotal) * 100) / 100,
  };
}

/**
 * Conservative warm-up SUGGESTIONS derived from a kg-like working load.
 * Never prescribed work, never required, always skippable. Returns [] with
 * a general note for light/unloadable work.
 * @returns {{suggestions:Array<{label:string, loadKg:number, reps:number}>, note:string, provisional:true}}
 */
export function warmupSuggestions(workingLoad, equipmentKind = 'barbell') {
  const value = workingLoad && (workingLoad.type === 'kg' || workingLoad.type === 'bodyweight_plus_kg') ? workingLoad.value : null;
  if (!Number.isFinite(value) || value < WARMUP_MIN_WORKING_KG) {
    return {
      suggestions: [],
      note: 'Warm up generally: easy movement, then a couple of lighter practice sets. Suggestions only — skip if already warm.',
      provisional: true,
    };
  }
  const suggestions = WARMUP_RAMP.map((step) => ({
    label: `~${step.percent}%`,
    loadKg: Math.max(0, roundToIncrement((value * step.percent) / 100, equipmentKind)),
    reps: step.reps,
  })).filter((s) => s.loadKg > 0 && s.loadKg < value);
  return {
    suggestions,
    note: 'Suggested warm-up only — not part of the prescribed work and never counted as work sets. Skip freely.',
    provisional: true,
  };
}
