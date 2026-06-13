// Executive Reasoning — confidence composition.
//
// IMPORTANT: this module does NOT compute or re-derive confidence. Confidence is
// already produced upstream (detectors set it; the learning engine calibrates it
// via EMA over prior outcomes). Here we only NORMALISE the already-computed value
// into a structured, inspectable object: a band, its calibration provenance, and —
// when the caller supplies a ranking breakdown — the weighted factors behind it.
//
// Reusing the upstream number (never recomputing it) is what keeps this a single
// source of truth and honours "never duplicate logic / never call the LLM twice".

import { bandFor, FACTOR_CATEGORY } from './constants.js';

/**
 * @param {object} input  normalized ReasoningInput
 * @returns {object} ConfidenceObject
 */
export function buildConfidence(input = {}) {
  const c = input.confidence ?? {};
  const value = clamp(numberOr(c.value, 0), 0, 100);

  // Calibration provenance (from the learning engine, when present) — surfaced,
  // never recomputed.
  const calibrated = Boolean(c.calibrated);
  const originalValue = Number.isFinite(c.originalValue) ? c.originalValue : null;
  const delta = (calibrated && originalValue !== null) ? value - originalValue : null;

  // Score/confidence factors: ONLY what the caller already decomposed. We never
  // hardcode a domain's ranking weights here.
  const factors = Array.isArray(input.ranking?.components)
    ? input.ranking.components.map(normaliseFactor)
    : [];

  return {
    value,
    band: bandFor(value),
    calibrated,
    originalValue,
    calibrationDelta: delta,
    sampleSize:       Number.isFinite(c.sampleSize) ? c.sampleSize : null,
    observedAccuracy: Number.isFinite(c.observedAccuracy) ? c.observedAccuracy : null,
    trend:            c.trend ?? null,
    note:             c.note ?? null,
    factors,
    // Where the value came from, so an inspector can trace it.
    basis: calibrated
      ? 'Calibrated by the learning engine from prior outcomes (upstream value, not recomputed here).'
      : 'Reported by the originating engine (upstream value, not recomputed here).',
  };
}

function normaliseFactor(f = {}) {
  const weight = numberOr(f.weight, null);
  const value  = numberOr(f.value, null);
  const contribution = Number.isFinite(f.contribution)
    ? f.contribution
    : (Number.isFinite(weight) && Number.isFinite(value) ? round(weight * value) : null);
  return {
    name:         f.name ?? 'factor',
    category:     f.category ?? FACTOR_CATEGORY.CUSTOM,
    weight,
    value,
    contribution,
    direction:    f.direction ?? (Number.isFinite(contribution) ? (contribution >= 0 ? 'positive' : 'negative') : 'neutral'),
  };
}

function numberOr(v, fallback) { return Number.isFinite(v) ? v : fallback; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round(v) { return Math.round(v * 100) / 100; }
