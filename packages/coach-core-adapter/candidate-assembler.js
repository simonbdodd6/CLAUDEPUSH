/**
 * @coach-core-adapter — Candidate Assembler (DORMANT)
 *
 * Transforms a real Coach's Eye Core player record (plus its Core position and availability
 * response) into the EXACT M120/M121 candidate shape `{ playerId, position, availability,
 * confidence }`. It reuses the adapter's own primitives — position normalization, availability
 * mapping, and the injected confidence provider — and adds no logic of its own.
 *
 * Pure, deterministic: no network, Redis, filesystem, AI/LLM, randomness or clock. The Core
 * player record is never mutated; the returned candidate is frozen.
 */

import { normalizePosition } from './position-normalization.js'
import { mapAvailability } from './availability-mapping.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0

/** Resolve the Brain `playerId` from a Core player record. */
function resolvePlayerId(player, playerIdField) {
  if (playerIdField !== undefined) {
    if (!isNonEmptyString(playerIdField)) throw new TypeError('assembleCandidate: playerIdField must be a non-empty string')
    if (!isNonEmptyString(player[playerIdField])) throw new TypeError(`assembleCandidate: player has no non-empty "${playerIdField}"`)
    return player[playerIdField]
  }
  if (isNonEmptyString(player.userId)) return player.userId   // Core join key (availability / matchday)
  if (isNonEmptyString(player.id)) return player.id
  throw new TypeError('assembleCandidate: player requires a non-empty userId or id')
}

function assertProvider(confidenceProvider) {
  if (!isObj(confidenceProvider) || typeof confidenceProvider.getConfidence !== 'function') {
    throw new TypeError('assembleCandidate requires a confidence provider with a getConfidence() method')
  }
}

/**
 * Assemble one M120/M121 candidate from a Core player record.
 *
 * @param {{ player: object, position?: string, availabilityResponse?: (string|{response:string}) }} input
 *   player              — the Core player profile (used for id + confidence)
 *   position            — the Core position string; defaults to `player.position`
 *   availabilityResponse— the Core availability response (string or `{response}`); default → unavailable
 * @param {{ getConfidence: (player:object) => number }} confidenceProvider
 * @param {{ playerIdField?: string, maybeAvailable?: boolean, unknownAvailable?: boolean }} [options]
 * @returns {Readonly<{ playerId:string, position:string, availability:boolean, confidence:number }>}
 */
export function assembleCandidate(input, confidenceProvider, options = {}) {
  if (!isObj(input)) throw new TypeError('assembleCandidate requires an input object { player, position?, availabilityResponse? }')
  if (!isObj(options)) throw new TypeError('assembleCandidate: options must be an object')
  if (!isObj(input.player)) throw new TypeError('assembleCandidate requires a Core player object')
  assertProvider(confidenceProvider)

  const player = input.player
  const playerId = resolvePlayerId(player, options.playerIdField)

  const rawPosition = input.position !== undefined ? input.position : player.position
  const position = normalizePosition(rawPosition)
  if (position === null) throw new TypeError(`assembleCandidate: unrecognised position "${rawPosition}" for player "${playerId}"`)

  const availability = mapAvailability(input.availabilityResponse, {
    maybeAvailable: options.maybeAvailable === true,
    unknownAvailable: options.unknownAvailable === true,
  })

  const confidence = confidenceProvider.getConfidence(player)   // provider validates + clamps to [0,1]

  return Object.freeze({ playerId, position, availability, confidence })
}

/**
 * Assemble many candidates from an array of records, sharing one confidence provider.
 * With `options.skipUnknownPosition`, records whose position cannot be normalised are skipped
 * (e.g. Core "TBC"); otherwise an unknown position throws. Malformed records always throw.
 *
 * @param {Array<{ player: object, position?: string, availabilityResponse?: any }>} records
 * @param {{ getConfidence: (player:object) => number }} confidenceProvider
 * @param {{ playerIdField?: string, maybeAvailable?: boolean, unknownAvailable?: boolean, skipUnknownPosition?: boolean }} [options]
 * @returns {Array<Readonly<{ playerId:string, position:string, availability:boolean, confidence:number }>>}
 */
export function assembleCandidates(records, confidenceProvider, options = {}) {
  if (!Array.isArray(records)) throw new TypeError('assembleCandidates requires an array of records')
  if (!isObj(options)) throw new TypeError('assembleCandidates: options must be an object')
  const skipUnknownPosition = options.skipUnknownPosition === true

  const out = []
  for (const record of records) {
    if (skipUnknownPosition && isObj(record)) {
      const rawPosition = record.position !== undefined ? record.position : (isObj(record.player) ? record.player.position : undefined)
      if (normalizePosition(rawPosition) === null) continue   // skip e.g. "TBC"; malformed records fall through and throw
    }
    out.push(assembleCandidate(record, confidenceProvider, options))
  }
  return out
}
