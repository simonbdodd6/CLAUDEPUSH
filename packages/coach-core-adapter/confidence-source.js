/**
 * @coach-core-adapter — Confidence Source (DORMANT)
 *
 * Core stores no per-player form/rating, but it does store availability. This module turns a
 * player's recent availability history into a deterministic baseline confidence in [0,1] and
 * exposes it as the M132 confidence-provider interface the candidate assembler already accepts.
 * A real form/suitability source remains an injected override — this is the contract plus a
 * Core-derivable baseline, not a fabricated number.
 *
 * Pure deterministic: no Core, Redis, network, filesystem, clock or randomness ("recent" is
 * whatever history the caller passes). Inputs are never mutated.
 */

import { createConfidenceProvider } from './player-confidence-provider.js'

const DEFAULT_WEIGHTS = Object.freeze({ available: 1, maybe: 0.5, unavailable: 0 })

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)
const clamp01 = (x) => Math.min(1, Math.max(0, x))

/** Read the response token from a Core string or `{ response }` object (lowercased/trimmed). */
function responseToken(value) {
  if (typeof value === 'string') return value.trim().toLowerCase()
  if (isObj(value) && typeof value.response === 'string') return value.response.trim().toLowerCase()
  return null
}

/**
 * Derive a baseline confidence in [0,1] from one player's availability history (the average of
 * per-response weights). Empty history → the configurable default.
 *
 * @param {Array<string|{response:string}>} history  recent availability responses
 * @param {{ weights?: object, unknownWeight?: number, default?: number }} [options]
 * @returns {number} confidence in [0,1]
 */
export function deriveAvailabilityConfidence(history, options = {}) {
  if (!Array.isArray(history)) throw new TypeError('deriveAvailabilityConfidence requires an array of availability responses')
  if (!isObj(options)) throw new TypeError('deriveAvailabilityConfidence: options must be an object')
  if (options.weights !== undefined && !isObj(options.weights)) throw new TypeError('deriveAvailabilityConfidence: options.weights must be an object')

  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) }
  for (const k of Object.keys(weights)) {
    if (!isFiniteNumber(weights[k])) throw new TypeError(`deriveAvailabilityConfidence: weight for "${k}" must be a finite number`)
  }
  const unknownWeight = options.unknownWeight !== undefined ? options.unknownWeight : 0
  const fallback = options.default !== undefined ? options.default : 0.5
  if (!isFiniteNumber(unknownWeight)) throw new TypeError('deriveAvailabilityConfidence: unknownWeight must be a finite number')
  if (!isFiniteNumber(fallback)) throw new TypeError('deriveAvailabilityConfidence: default must be a finite number')

  if (history.length === 0) return clamp01(fallback)

  let sum = 0
  for (const entry of history) {
    const token = responseToken(entry)
    sum += (token !== null && weights[token] !== undefined) ? weights[token] : unknownWeight
  }
  return clamp01(sum / history.length)
}

/**
 * Build a confidence provider that derives each player's confidence from their availability
 * history (looked up by userId, falling back to id, or a configurable field). Players with no
 * history get the baseline default.
 *
 * @param {Record<string, Array<string|{response:string}>>} historyByPlayer  history keyed by player id
 * @param {{ weights?: object, unknownWeight?: number, default?: number, playerIdField?: string }} [options]
 * @returns {{ getConfidence: (player: object) => number }}
 */
export function createBaselineConfidenceProvider(historyByPlayer, options = {}) {
  if (!isObj(historyByPlayer)) throw new TypeError('createBaselineConfidenceProvider requires a historyByPlayer object')
  if (!isObj(options)) throw new TypeError('createBaselineConfidenceProvider: options must be an object')
  if (options.playerIdField !== undefined && !isNonEmptyString(options.playerIdField)) {
    throw new TypeError('createBaselineConfidenceProvider: playerIdField must be a non-empty string')
  }

  const keyFor = (player) => {
    if (options.playerIdField !== undefined) return player[options.playerIdField]
    if (isNonEmptyString(player.userId)) return player.userId
    return player.id
  }

  // reuse M132's provider (validates player + clamps result)
  return createConfidenceProvider((player) => {
    const key = keyFor(player)
    const history = isNonEmptyString(key) && Array.isArray(historyByPlayer[key]) ? historyByPlayer[key] : []
    return deriveAvailabilityConfidence(history, options)
  })
}
