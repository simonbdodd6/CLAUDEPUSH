/**
 * @coach-core-adapter — Core Selection Context Builder (DORMANT)
 *
 * The final adapter-layer composition helper: it converts Core player information into a single
 * selection-ready context object for the M131 pipeline. It is PURE COMPOSITION — it reuses only
 * the adapter's own M132 `assembleCandidates` and M133 `resolveFormationFromCandidates`, adds no
 * intelligence, ranking, recommendations, squad/jersey decisions, AI or DNA logic, and never
 * touches Core, Redis, the network or the filesystem.
 *
 * Deterministic: inputs are never mutated; output is deeply frozen.
 */

import { assembleCandidates } from './candidate-assembler.js'
import { resolveFormationFromCandidates } from './formation-resolver.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** The key under which a player's availability response is stored (Core keys by userId). */
function availabilityKeyFor(player, options) {
  if (options.availabilityKeyField !== undefined) return player[options.availabilityKeyField]
  if (isNonEmptyString(player.userId)) return player.userId
  return player.id
}

/**
 * Build a selection-ready context for the M131 pipeline from Core player information.
 *
 * @param {{
 *   players: object[],                                  // Core player records
 *   availabilityResponses: Record<string, any>,         // Core availability map, keyed by userId
 *   confidenceProvider: { getConfidence: (player:object) => number },
 *   options?: object                                    // passthrough to M132 + M133
 * }} input
 * @returns {Readonly<{
 *   candidates: ReadonlyArray<object>,
 *   formation: Record<string,string>,
 *   positionGroups: Record<string,string[]>,
 *   coverage: ReadonlyArray<object>,
 *   unresolved: ReadonlyArray<object>,
 *   metadata: object
 * }>}
 */
export function buildSelectionContext(input) {
  if (!isObj(input)) throw new TypeError('buildSelectionContext requires an input object { players, availabilityResponses, confidenceProvider, options? }')
  const { players, availabilityResponses, confidenceProvider } = input
  const options = input.options !== undefined ? input.options : {}

  if (!Array.isArray(players)) throw new TypeError('buildSelectionContext: players must be an array')
  if (!isObj(availabilityResponses)) throw new TypeError('buildSelectionContext: availabilityResponses must be an object')
  if (!isObj(confidenceProvider) || typeof confidenceProvider.getConfidence !== 'function') {
    throw new TypeError('buildSelectionContext: confidenceProvider must have a getConfidence() method')
  }
  if (!isObj(options)) throw new TypeError('buildSelectionContext: options must be an object')

  // pair each player with its Core availability response (order preserved)
  const records = players.map((player) => {
    let availabilityResponse
    if (isObj(player)) {
      const key = availabilityKeyFor(player, options)
      if (isNonEmptyString(key)) availabilityResponse = availabilityResponses[key]
    }
    return { player, availabilityResponse }
  })

  // M132: Core records → exact M121 candidates (validates players, handles unknown positions)
  const candidates = assembleCandidates(records, confidenceProvider, options)

  // M133: candidates → formation coverage (handles formation / positionGroups from options)
  const resolved = resolveFormationFromCandidates(candidates, options)

  return deepFreeze({
    candidates,
    formation: resolved.formation,
    positionGroups: resolved.positionGroups,
    coverage: resolved.coverage,
    unresolved: resolved.unresolved,
    metadata: {
      playerCount: players.length,
      candidateCount: candidates.length,
      formationSize: resolved.metadata.formationSize,
      unresolvedCount: resolved.metadata.unresolvedCount,
      deterministic: true,
      adapterLayer: true,
    },
  })
}
