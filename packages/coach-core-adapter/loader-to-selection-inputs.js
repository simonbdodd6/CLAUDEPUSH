/**
 * @coach-core-adapter — Loader → Adapter Input Mapper (DORMANT, pure)
 *
 * Turns a validated M164 Core squad loader provider into the input object the adapter consumes:
 * it validates the provider's shape (M164 contract), calls its four read accessors once each, and
 * returns a deeply-frozen `{ players, availability, memories, playerTags }`. Those fields feed
 * assembleSelectionInputs (M160) — `players`/`availability` as passthrough, `memories` via M157,
 * `playerTags` via M153 (the caller's producer thunks read them).
 *
 * Pure adapter only: imports no Core and no engine, performs no networking / storage / AI, and has
 * no side effect beyond calling the provider's accessors. Accessor results are deep-copied (so the
 * provider's data is never mutated or frozen); the returned object is deterministic and frozen.
 */

import { createCoreSquadLoaderContract } from './core-squad-loader-contract.js'

const CONTRACT = createCoreSquadLoaderContract()   // module-scoped (deterministic)

/** Pure deterministic deep clone of plain data (objects / arrays / primitives). */
function deepClone(value) {
  if (Array.isArray(value)) return value.map(deepClone)
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value)) out[k] = deepClone(value[k])
    return out
  }
  return value
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/**
 * Map a validated M164 loader provider to the assembleSelectionInputs input shape.
 *
 * @param {{ getActivePlayers:Function, getAvailabilityResponses:Function, getCoachMemories:Function, getPlayerTags:Function }} provider
 * @returns {Readonly<{ players: object[], availability: object, memories: object[], playerTags: object }>}
 */
export function loaderToSelectionInputs(provider) {
  CONTRACT.validate(provider)   // M164 shape validation — throws TypeError if the provider is malformed

  // call each accessor exactly once; deep-copy the results (no mutation of the provider's data)
  const players = deepClone(provider.getActivePlayers())
  const availability = deepClone(provider.getAvailabilityResponses())
  const memories = deepClone(provider.getCoachMemories())
  const playerTags = deepClone(provider.getPlayerTags())

  return deepFreeze({ players, availability, memories, playerTags })
}
