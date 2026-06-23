/**
 * @coach-core-adapter — Coach Memory Adapter (DORMANT, INTERFACE)
 *
 * The audit found Core stores no structured coach-memory data, yet M110 (retrieveCoachMemories)
 * needs an injected provider exposing `searchCoachMemory(plan) => entry[]`. M110 itself performs
 * all filtering / scoring / sorting / limiting, so a provider only has to RETURN the candidate
 * coach-memory entries for a plan — it does not re-implement query logic.
 *
 * This module defines that provider interface plus a simple in-memory implementation (validated
 * against the canonical M108 model), so a real store (Redis, pgvector, Mem0, …) can be slotted in
 * later behind the same contract. Pure: no persistence, filesystem, network, randomness or clock.
 */

import { validateCoachMemoryEntry } from '../coach-memory/index.js'

const isObj = (v) => v !== null && typeof v === 'object'

/**
 * Wrap a search function `(plan) => entry[]` into an M110-compatible provider. The returned
 * provider validates that the search yields an array (M110 then filters/scores/sorts/limits).
 *
 * @param {(plan: object) => object[]} search
 * @returns {{ searchCoachMemory: (plan: object) => object[] }}
 */
export function createCoachMemoryAdapter(search) {
  if (typeof search !== 'function') throw new TypeError('createCoachMemoryAdapter requires a search function')
  return {
    searchCoachMemory(plan) {
      const results = search(plan)
      if (!Array.isArray(results)) throw new TypeError('searchCoachMemory must return an array of coach memory entries')
      return results
    },
  }
}

/**
 * An in-memory provider over a fixed set of coach-memory entries. Entries are validated against
 * the M108 model at construction (fail fast). `searchCoachMemory` returns a shallow copy of all
 * entries — M110 applies the plan; this provider does not filter.
 *
 * @param {object[]} entries  M108-valid coach memory entries
 * @param {{ validate?: boolean }} [options]  validate entries at construction (default true)
 * @returns {{ searchCoachMemory: (plan: object) => object[] }}
 */
export function inMemoryCoachMemoryAdapter(entries, options = {}) {
  if (!Array.isArray(entries)) throw new TypeError('inMemoryCoachMemoryAdapter requires an array of entries')
  if (!isObj(options) || Array.isArray(options)) throw new TypeError('inMemoryCoachMemoryAdapter: options must be an object')
  if (options.validate !== false) {
    for (const entry of entries) validateCoachMemoryEntry(entry)   // throws TypeError on the first malformed entry
  }
  return createCoachMemoryAdapter(() => entries.slice())
}
