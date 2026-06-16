/**
 * @brain/evidence-weighting — deterministic confidence-weighting mathematics (M47)
 *
 * PURE FUNCTIONS ONLY, implementing the M42 §6 weighting model:
 *   source trust · recency decay · corroboration boost · conflict penalty ·
 *   volume saturation.
 *
 * Guarantees (asserted by tests):
 *   - deterministic: identical input → identical output;
 *   - no Date, no Math.random, no clock, no I/O, no side effects, no storage;
 *   - all inputs are caller-supplied (ages/counts/timestamps too);
 *   - returns are immutable (numbers are immutable; objects are frozen);
 *   - never mutates caller input.
 *
 * The default parameters come from `@brain/evidence-contracts`'s
 * `CONFIDENCE_WEIGHT_CONTRACT` (its only import); callers may override per-call.
 * This is pure weighting maths — NO recommendation generation, reasoning or prediction.
 */

import { CONFIDENCE_WEIGHT_CONTRACT } from '@brain/evidence-contracts'
import { WeightingError, WEIGHTING_ERROR } from './errors.js'

/** Default weighting parameters (the declared contract). */
export const DEFAULT_WEIGHTS = CONFIDENCE_WEIGHT_CONTRACT

// ── helpers (pure) ────────────────────────────────────────────────────────────

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)

function num(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new WeightingError(WEIGHTING_ERROR.INVALID_INPUT, `${label} must be a finite number`)
  }
  return value
}

function nonNegInt(value, label) {
  const n = num(value, label)
  return Math.max(0, Math.trunc(n))
}

// ── single-factor functions ───────────────────────────────────────────────────

/**
 * Recency decay: confidence halves every `halfLifeDays`, the decay multiplier never
 * falling below `floor`. Future-dated (negative age) → no decay.
 * @returns {number} 0..1
 */
export function applyRecencyWeight(confidence, ageDays, recency = DEFAULT_WEIGHTS.recency) {
  const c = clamp01(num(confidence, 'confidence'))
  const age = Math.max(0, num(ageDays, 'ageDays'))
  const halfLife = num(recency.halfLifeDays, 'recency.halfLifeDays')
  const floor = clamp01(num(recency.floor, 'recency.floor'))
  const raw = Math.pow(2, -age / halfLife)               // 1 at age 0, →0 as age→∞
  const factor = Math.min(1, Math.max(floor, raw))       // floored multiplier
  return clamp01(c * factor)
}

/**
 * Corroboration boost: each independent corroborating source raises confidence by
 * `perIndependentSource`, capped at `cap`. The boost never lowers confidence.
 * @returns {number} 0..1
 */
export function applyCorroborationBoost(confidence, corroboratingSources, corroboration = DEFAULT_WEIGHTS.corroboration) {
  const c = clamp01(num(confidence, 'confidence'))
  const n = nonNegInt(corroboratingSources, 'corroboratingSources')
  const per = num(corroboration.perIndependentSource, 'corroboration.perIndependentSource')
  const cap = clamp01(num(corroboration.cap, 'corroboration.cap'))
  const boosted = Math.min(cap, c + per * n)
  return clamp01(Math.max(c, boosted))                   // boost is non-negative; cap never lowers c
}

/**
 * Conflict penalty: disagreement compounds a `(1 - penalty)` factor per conflicting
 * source and raises the `disputed` flag (never hidden — M42 §4.5).
 * @returns {Readonly<{ confidence:number, disputed:boolean, flag:string|null }>}
 */
export function applyConflictPenalty(confidence, conflictingSources, conflict = DEFAULT_WEIGHTS.conflict) {
  const c = clamp01(num(confidence, 'confidence'))
  const n = nonNegInt(conflictingSources, 'conflictingSources')
  if (n === 0) return Object.freeze({ confidence: c, disputed: false, flag: null })
  const penalty = clamp01(num(conflict.penalty, 'conflict.penalty'))
  const factor = Math.pow(1 - penalty, n)
  return Object.freeze({ confidence: clamp01(c * factor), disputed: true, flag: conflict.flag ?? null })
}

/**
 * Volume saturation: a 0..1 reliability weight with diminishing returns —
 * `count / (count + saturationK)`. 0 at count 0; 0.5 at count = K; →1 as count→∞,
 * never reaching 1.
 * @returns {number} 0..1
 */
export function applyVolumeSaturation(count, volume = DEFAULT_WEIGHTS.volume) {
  const n = Math.max(0, num(count, 'count'))
  const k = num(volume.saturationK, 'volume.saturationK')
  return n / (n + k)
}

// ── composite functions ───────────────────────────────────────────────────────

/**
 * Confidence of a single piece of evidence: its source-trust ceiling decayed by
 * recency. `sourceTrust` is either a number (0..1) or a key of `weights.sourceTrust`
 * (e.g. 'providerVerified'). `ageDays` is caller-supplied (no clock here).
 * @returns {number} 0..1
 */
export function calculateEvidenceConfidence({ sourceTrust, ageDays = 0 } = {}, weights = DEFAULT_WEIGHTS) {
  let trust
  if (typeof sourceTrust === 'string') {
    trust = weights.sourceTrust?.[sourceTrust]
    if (typeof trust !== 'number') throw new WeightingError(WEIGHTING_ERROR.INVALID_INPUT, `unknown sourceTrust key: ${sourceTrust}`)
  } else {
    trust = clamp01(num(sourceTrust, 'sourceTrust'))
  }
  return applyRecencyWeight(trust, ageDays, weights.recency)
}

/**
 * Aggregate confidence for one (subject, signal) from a set of evidence items.
 * Each item: { confidence: 0..1, stance?: 'agree'|'conflict'|'neutral' (default
 * 'agree'), independent?: boolean (default true) }. Deterministic pipeline:
 * strongest supporting confidence → corroboration boost (extra independent
 * supporters) → conflict penalty (+ disputed) → volume saturation weight.
 *
 * No evidence → confidence 0 (no evidence ⇒ no claim).
 *
 * @returns {Readonly<{ confidence:number, disputed:boolean, supporting:number, conflicting:number, volumeWeight:number }>}
 */
export function combineEvidenceConfidence(items, weights = DEFAULT_WEIGHTS) {
  if (!Array.isArray(items)) throw new WeightingError(WEIGHTING_ERROR.INVALID_INPUT, 'items must be an array')
  if (items.length === 0) {
    return Object.freeze({ confidence: 0, disputed: false, supporting: 0, conflicting: 0, volumeWeight: 0 })
  }

  const normalised = items.map((it, i) => {
    if (it == null || typeof it !== 'object') throw new WeightingError(WEIGHTING_ERROR.INVALID_INPUT, `items[${i}] must be an object`)
    return {
      confidence: clamp01(num(it.confidence, `items[${i}].confidence`)),
      stance: it.stance === 'conflict' ? 'conflict' : it.stance === 'neutral' ? 'neutral' : 'agree',
      independent: it.independent !== false,
    }
  })

  const supporting = normalised.filter(n => n.stance !== 'conflict')
  const conflicting = normalised.filter(n => n.stance === 'conflict')

  const base = supporting.length ? Math.max(...supporting.map(s => s.confidence)) : 0
  const independentSupport = supporting.filter(s => s.independent).length
  const corroborated = Math.max(0, independentSupport - 1)   // extra independent supporters beyond the first

  const boosted = applyCorroborationBoost(base, corroborated, weights.corroboration)
  const penalised = applyConflictPenalty(boosted, conflicting.length, weights.conflict)
  const volumeWeight = applyVolumeSaturation(supporting.length, weights.volume)

  return Object.freeze({
    confidence: penalised.confidence,
    disputed: penalised.disputed,
    supporting: supporting.length,
    conflicting: conflicting.length,
    volumeWeight,
  })
}
