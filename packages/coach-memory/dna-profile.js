/**
 * @coach-memory — Coach DNA profile (M114, DORMANT)
 *
 * Combines M113 Coach DNA signals into a deterministic Coach DNA Profile — the single
 * structured source of truth describing a coach's style for future recommendation engines.
 * It is NOT natural language and invents nothing: it only selects, ranks, and measures
 * existing signals.
 *
 * Pure and side-effect free: no storage, LLM, persistence, randomness, clock, filesystem,
 * network, embeddings or vector search. Input is never mutated; output is deeply frozen.
 */

import { COACH_MEMORY_TYPES } from './model.js'

const TOTAL_TYPES = COACH_MEMORY_TYPES.length   // diversity is measured against the possible coaching dimensions
const isObj = (v) => v !== null && typeof v === 'object'
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)
const clamp01 = (x) => Math.min(1, Math.max(0, x))

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Accept the M113 output object ({ signals }) or a raw signals array. */
function extractSignalArray(input) {
  if (Array.isArray(input)) return input
  if (isObj(input) && Array.isArray(input.signals)) return input.signals
  throw new TypeError('buildCoachDnaProfile requires M113 signals (an array, or an object with a signals array)')
}

/** Validate one M113 signal. */
function assertSignal(s) {
  if (!isObj(s) || typeof s.category !== 'string' ||
      !isFiniteNumber(s.occurrences) || !isFiniteNumber(s.averageConfidence) ||
      !isFiniteNumber(s.averageWeight) || !isFiniteNumber(s.strength) || !Array.isArray(s.supportingMemoryIds)) {
    throw new TypeError('buildCoachDnaProfile: malformed signal')
  }
}

/**
 * Build a deterministic Coach DNA Profile from M113 signals.
 *
 * @param {{ signals: object[] } | object[]} signals  the M113 output (or its signals array)
 * @returns {Readonly<{
 *   profileVersion:string,
 *   generatedFrom: Readonly<{ signalCount:number, generatedDeterministically:boolean }>,
 *   dominantSignals: ReadonlyArray<Readonly<object>>,
 *   balance: Readonly<{ strongestCategory:(string|null), weakestCategory:(string|null), diversityScore:number }>,
 *   confidence:number,
 *   metadata: Readonly<{ explainable:boolean, llmGenerated:boolean, deterministic:boolean }>
 * }>}
 */
export function buildCoachDnaProfile(signals) {
  const arr = extractSignalArray(signals)
  for (const s of arr) assertSignal(s)

  // rank by strength desc, category asc (deterministic), independent of input order
  const sorted = arr.slice().sort((a, b) => (b.strength - a.strength) || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0))
  const signalCount = arr.length

  const dominantSignals = sorted.slice(0, 5).map((s) => ({
    category: s.category,
    occurrences: s.occurrences,
    averageConfidence: s.averageConfidence,
    averageWeight: s.averageWeight,
    strength: s.strength,
    supportingMemoryIds: [...s.supportingMemoryIds],
  }))

  const balance = {
    strongestCategory: signalCount ? sorted[0].category : null,
    weakestCategory: signalCount ? sorted[sorted.length - 1].category : null,
    diversityScore: clamp01(signalCount / TOTAL_TYPES),
  }

  const confidence = signalCount ? arr.reduce((sum, s) => sum + s.strength, 0) / signalCount : 0

  return deepFreeze({
    profileVersion: '1.0',
    generatedFrom: { signalCount, generatedDeterministically: true },
    dominantSignals,
    balance,
    confidence,
    metadata: { explainable: true, llmGenerated: false, deterministic: true },
  })
}
