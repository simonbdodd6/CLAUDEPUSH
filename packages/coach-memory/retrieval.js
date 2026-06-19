/**
 * @coach-memory — Coach Memory retrieval engine (M110, DORMANT)
 *
 * Executes an M109 query plan against an INJECTED provider. It is store-agnostic: it neither
 * knows nor cares whether the provider is backed by pgvector, Mem0, Redis, LlamaIndex, JSON,
 * or anything else. The provider's only required method is `searchCoachMemory(plan)`, which
 * returns an array of already-normalised coach memory entries.
 *
 * This layer only filters / scores / sorts / limits deterministically — no store, vector
 * search, embeddings, LLM, persistence, filesystem, network, clock or randomness. Provider
 * results are never mutated; the returned array is frozen.
 */

import { scoreCoachMemoryEntry } from './scoring.js'
import { COACH_MEMORY_SORTS } from './query-plan.js'

const isObj = (v) => v !== null && typeof v === 'object'

/** Validate that `plan` has the M109 shape this engine reads. */
function assertPlan(plan) {
  if (!isObj(plan) || Array.isArray(plan) || !isObj(plan.filters) || !isObj(plan.retrieval)) {
    throw new TypeError('retrieveCoachMemories requires an M109 query plan { filters, retrieval }')
  }
  const f = plan.filters
  if (!Array.isArray(f.types) || !Array.isArray(f.ontologyTargets) || !Array.isArray(f.tags) || typeof f.minimumScore !== 'number') {
    throw new TypeError('retrieveCoachMemories: plan.filters is malformed')
  }
  if (typeof plan.retrieval.limit !== 'number' || !COACH_MEMORY_SORTS.includes(plan.retrieval.sort)) {
    throw new TypeError('retrieveCoachMemories: plan.retrieval is malformed')
  }
}

/**
 * Execute a query plan against an injected provider and return deterministically filtered,
 * sorted, and limited results.
 *
 * @param {object} plan      a plan from `createCoachMemoryQueryPlan` (M109)
 * @param {{ searchCoachMemory: (plan:object) => object[] }} provider  injected store adapter
 * @returns {Readonly<object[]>}  frozen array of matching coach memory entries
 */
export function retrieveCoachMemories(plan, provider) {
  assertPlan(plan)
  if (!isObj(provider) || typeof provider.searchCoachMemory !== 'function') {
    throw new TypeError('retrieveCoachMemories requires a provider with a searchCoachMemory function')
  }

  const results = provider.searchCoachMemory(plan)   // called exactly once; exceptions propagate
  if (!Array.isArray(results)) {
    throw new TypeError('provider.searchCoachMemory must return an array of coach memory entries')
  }

  const { types, ontologyTargets, tags, minimumScore } = plan.filters

  // structural filters (ANY-match) — operate on a new array; provider results untouched
  let working = results.slice()
  if (types.length) {
    const typeSet = new Set(types)
    working = working.filter((e) => typeSet.has(e.type))
  }
  if (ontologyTargets.length) {
    const targetSet = new Set(ontologyTargets.map((t) => `${t.kind}:${t.id}`))
    working = working.filter((e) => Array.isArray(e.ontologyLinks) && e.ontologyLinks.some((l) => targetSet.has(`${l.kind}:${l.id}`)))
  }
  if (tags.length) {
    const tagSet = new Set(tags)
    working = working.filter((e) => Array.isArray(e.tags) && e.tags.some((t) => tagSet.has(t)))
  }

  // score each survivor once (reuse M108 scoring); used by minimumScore filter + score sort
  const scoreOf = new Map()
  for (const e of working) scoreOf.set(e, scoreCoachMemoryEntry(e).score)
  if (minimumScore > 0) working = working.filter((e) => scoreOf.get(e) >= minimumScore)

  // deterministic sort: primary field DESC, then createdAt DESC, then id ASC
  const sort = plan.retrieval.sort
  const primary = (e) => (sort === 'score' ? scoreOf.get(e)
    : sort === 'confidence' ? e.confidence
      : sort === 'weight' ? e.weight
        : e.createdAt)   // 'createdAt'

  const sorted = working.slice().sort((a, b) => {
    const av = primary(a), bv = primary(b)
    let cmp
    if (sort === 'createdAt') cmp = av < bv ? 1 : av > bv ? -1 : 0   // string DESC
    else cmp = bv - av                                               // number DESC
    if (cmp !== 0) return cmp
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1   // createdAt DESC
    if (a.id !== b.id) return a.id < b.id ? -1 : 1                               // id ASC
    return 0
  })

  return Object.freeze(sorted.slice(0, plan.retrieval.limit))
}
