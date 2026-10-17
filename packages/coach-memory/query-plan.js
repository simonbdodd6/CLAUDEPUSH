/**
 * @coach-memory — Coach Memory retrieval planner (M109, DORMANT)
 *
 * Turns a STRUCTURED retrieval request into a deeply-frozen, normalised query plan. It does
 * NOT understand English — future LLMs convert natural language into this request shape, so
 * this layer stays provider-independent. It only PLANS: no store, retrieval, search,
 * ranking, LLM, embeddings, vector search, persistence, clock or randomness.
 *
 * Reuses the M108 model enums (COACH_MEMORY_TYPES, ONTOLOGY_KINDS) for validation. Input is
 * never mutated.
 */

import { COACH_MEMORY_TYPES, ONTOLOGY_KINDS } from './model.js'

export const COACH_MEMORY_SORTS = Object.freeze(['score', 'confidence', 'weight', 'createdAt'])

const isObj = (v) => v !== null && typeof v === 'object'
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Trim + de-duplicate strings, preserving first-seen order. */
function dedupeStrings(arr) {
  const seen = new Set()
  const out = []
  for (const raw of arr) {
    const v = raw.trim()
    if (!seen.has(v)) { seen.add(v); out.push(v) }
  }
  return out
}

/** De-duplicate exact enum tokens, preserving first-seen order. */
function dedupeExact(arr) {
  const seen = new Set()
  const out = []
  for (const v of arr) {
    if (!seen.has(v)) { seen.add(v); out.push(v) }
  }
  return out
}

/** Trim ontology target ids + de-duplicate by `kind:id`, preserving first-seen order. */
function dedupeOntologyTargets(targets) {
  const seen = new Set()
  const out = []
  for (const t of targets) {
    const id = t.id.trim()
    const key = `${t.kind}:${id}`
    if (!seen.has(key)) { seen.add(key); out.push({ kind: t.kind, id }) }
  }
  return out
}

/**
 * Build a normalised, deeply-frozen coach-memory query plan from a structured request.
 *
 * @param {{ types?:string[], ontologyTargets?:{kind:string,id:string}[], tags?:string[],
 *           minimumScore?:number, limit?:number, sort?:string }} [request]
 * @returns {Readonly<{
 *   filters: Readonly<{ types:string[], ontologyTargets:{kind:string,id:string}[], tags:string[], minimumScore:number }>,
 *   retrieval: Readonly<{ limit:number, sort:string }>,
 *   estimatedComplexity: ('low'|'medium'|'high')
 * }>}
 */
export function createCoachMemoryQueryPlan(request = {}) {
  if (!isObj(request) || Array.isArray(request)) {
    throw new TypeError('createCoachMemoryQueryPlan requires a request object')
  }

  // types — exact M108 enum tokens
  const rawTypes = request.types !== undefined ? request.types : []
  if (!Array.isArray(rawTypes)) throw new TypeError('query request types must be an array')
  for (const t of rawTypes) {
    if (!COACH_MEMORY_TYPES.includes(t)) throw new TypeError(`query request has invalid type "${t}"`)
  }

  // ontologyTargets — { kind (M108 enum), id (non-empty string) }
  const rawTargets = request.ontologyTargets !== undefined ? request.ontologyTargets : []
  if (!Array.isArray(rawTargets)) throw new TypeError('query request ontologyTargets must be an array')
  for (const t of rawTargets) {
    if (!isObj(t) || !ONTOLOGY_KINDS.includes(t.kind) || !isNonEmptyString(t.id)) {
      throw new TypeError('query request ontologyTargets must be { kind, id } with a valid kind and non-empty id')
    }
  }

  // tags — strings
  const rawTags = request.tags !== undefined ? request.tags : []
  if (!Array.isArray(rawTags) || !rawTags.every((t) => typeof t === 'string')) {
    throw new TypeError('query request tags must be an array of strings')
  }

  // minimumScore — number, clamped to [0,1]
  let minimumScore = 0
  if (request.minimumScore !== undefined) {
    if (!isFiniteNumber(request.minimumScore)) throw new TypeError('query request minimumScore must be a number')
    minimumScore = clamp(request.minimumScore, 0, 1)
  }

  // limit — number, clamped to [1,100], integer
  let limit = 10
  if (request.limit !== undefined) {
    if (!isFiniteNumber(request.limit)) throw new TypeError('query request limit must be a number')
    limit = Math.floor(clamp(request.limit, 1, 100))
  }

  // sort — one of the allowed fields
  const sort = request.sort !== undefined ? request.sort : 'score'
  if (!COACH_MEMORY_SORTS.includes(sort)) throw new TypeError(`query request has invalid sort "${sort}"`)

  // normalise (dedupe, preserve first-seen order)
  const types = dedupeExact(rawTypes)
  const ontologyTargets = dedupeOntologyTargets(rawTargets)
  const tags = dedupeStrings(rawTags)

  // deterministic complexity estimate
  const high = types.length > 3 || ontologyTargets.length > 5 || tags.length > 8
  const hasAnyFilter = types.length > 0 || ontologyTargets.length > 0 || tags.length > 0
  const estimatedComplexity = high ? 'high' : (hasAnyFilter ? 'medium' : 'low')

  return deepFreeze({
    filters: { types, ontologyTargets, tags, minimumScore },
    retrieval: { limit, sort },
    estimatedComplexity,
  })
}
