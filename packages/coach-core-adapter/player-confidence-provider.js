/**
 * @coach-core-adapter — Player Confidence Provider (DORMANT, INTERFACE)
 *
 * The audit found Core stores no per-player suitability/form score, yet the M120/M121 candidate
 * contract requires a `confidence` in [0,1] — and it is the only per-player differentiator in
 * the selection score. This module defines the dependency-injection INTERFACE for supplying that
 * confidence from whatever real source eventually exists (form model, coach rating, stats), so
 * the rest of the pipeline stays store-agnostic.
 *
 * It introduces NO scoring intelligence — a provider is just a validated wrapper around a
 * caller-supplied resolver. Pure: no persistence, filesystem, network, randomness or clock.
 */

const isObj = (v) => v !== null && typeof v === 'object'
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)
const clamp01 = (x) => Math.min(1, Math.max(0, x))

/**
 * Wrap a resolver `(player) => number` into a confidence provider. The provider validates the
 * player is an object and that the resolver returns a finite number, then clamps it to [0,1].
 *
 * @param {(player: object) => number} resolve
 * @returns {{ getConfidence: (player: object) => number }}
 */
export function createConfidenceProvider(resolve) {
  if (typeof resolve !== 'function') throw new TypeError('createConfidenceProvider requires a resolver function')
  return {
    getConfidence(player) {
      if (!isObj(player) || Array.isArray(player)) throw new TypeError('getConfidence requires a player object')
      const raw = resolve(player)
      if (!isFiniteNumber(raw)) throw new TypeError('confidence resolver must return a finite number')
      return clamp01(raw)   // out-of-range scores are clamped, not rejected
    },
  }
}

/**
 * A provider that returns the same confidence for every player (useful as a neutral default
 * until a real per-player source exists).
 *
 * @param {number} value  a finite number; clamped to [0,1] per call
 */
export function constantConfidenceProvider(value) {
  if (!isFiniteNumber(value)) throw new TypeError('constantConfidenceProvider requires a finite number')
  return createConfidenceProvider(() => value)
}

/**
 * A provider that reads a numeric field off the player record, falling back when it is missing
 * or non-numeric. (e.g. a future `formScore` written onto the Core player profile.)
 *
 * @param {string} fieldName
 * @param {number} [fallback=0]  used when the field is absent / non-numeric
 */
export function fieldConfidenceProvider(fieldName, fallback = 0) {
  if (typeof fieldName !== 'string' || fieldName.trim().length === 0) throw new TypeError('fieldConfidenceProvider requires a non-empty field name')
  if (!isFiniteNumber(fallback)) throw new TypeError('fieldConfidenceProvider fallback must be a finite number')
  return createConfidenceProvider((player) => {
    const v = player[fieldName]
    return isFiniteNumber(v) ? v : fallback
  })
}
