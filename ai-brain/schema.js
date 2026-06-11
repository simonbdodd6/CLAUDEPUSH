/**
 * AI Brain — Response Schemas
 *
 * Defines the versioned, stable output contracts for the Brain's public API.
 * Every response the Core receives is constructed through these functions.
 * The schema version must be bumped on any breaking change to field names or types.
 */

export const BRAIN_SCHEMA_VERSION = '1.0'

/**
 * Construct a BrainResponse from raw recommendation engine output.
 *
 * Preserves the original `meta` object so that callers that depended on
 * recommendation-engine's meta shape (isMock, categories, highCount, etc.)
 * continue to receive it unchanged.
 *
 * @param {object[]} recommendations  - ranked recommendation objects
 * @param {object}   opts
 * @param {object}   opts.meta        - engine metadata (isMock, error, etc.)
 * @param {object}   opts.trace       - debug trace (modules[], duration)
 * @returns {BrainResponse}
 */
export function toBrainResponse(recommendations, { meta = {}, trace = {} } = {}) {
  const recs = Array.isArray(recommendations) ? recommendations : []

  return {
    schemaVersion:   BRAIN_SCHEMA_VERSION,
    recommendations: recs,
    insights:        [],
    warnings:        [],
    seasonContext:   meta.seasonContext ?? null,
    meta,            // preserved verbatim so existing consumers of meta.isMock etc. work unchanged
    trace: {
      modules:  Array.isArray(trace.modules) ? trace.modules : [],
      duration: typeof trace.duration === 'number' ? trace.duration : 0,
      isMock:   meta.isMock ?? false,
    },
  }
}

/**
 * Construct a QueryResponse from raw knowledge-engine output.
 *
 * Spreads ALL original knowledge-engine result fields first so that
 * consumers of domain-specific fields (count, summary, domain, etc.)
 * receive them unchanged. Brain-specific fields are added on top.
 *
 * @param {object} result  - knowledge-engine ask() result
 * @param {object} opts
 * @param {object} opts.trace - debug trace (modules[], duration)
 * @returns {QueryResponse}
 */
export function toQueryResponse(result, { trace = {} } = {}) {
  const r = result ?? {}

  return {
    ...r,                                                        // preserve all knowledge-engine fields
    schemaVersion:   BRAIN_SCHEMA_VERSION,
    answer:          r.answer          ?? '',
    intent:          r.intent          ?? 'general',
    confidence:      typeof r.confidence === 'number' ? r.confidence : 0,
    citations:       Array.isArray(r.citations)  ? r.citations  : [],
    data:            Array.isArray(r.data)        ? r.data       : [],
    graphTraversal:  r.graphTraversal  ?? false,
    trace: {
      modules:  Array.isArray(trace.modules) ? trace.modules : [],
      duration: typeof trace.duration === 'number' ? trace.duration : 0,
      cached:   r.cached ?? false,
    },
  }
}
