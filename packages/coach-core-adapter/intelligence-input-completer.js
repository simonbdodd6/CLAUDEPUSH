/**
 * @coach-core-adapter — Intelligence Input Completer (DORMANT, COMPOSITION ONLY)
 *
 * Removes the inline patching the M139 harness exposed: M135 emits a plan in the M109 REQUEST
 * shape and a decision without `supportingMemoryIds`, but M118/M137 need the NORMALISED plan
 * ({ filters, retrieval }) and a decision that carries `supportingMemoryIds` (M118's M115 stage
 * requires it). This helper completes an M135 decisionPlanContext into that exact input shape.
 *
 * Pure composition only: it normalises the plan via the existing M109 createCoachMemoryQueryPlan
 * and appends the caller-supplied supporting memory ids. It generates no ids, retrieves no
 * memories, inspects no memoryProvider, and calls no intelligence engine. No Core, Redis,
 * network, filesystem, clock or randomness. Inputs are never mutated; output is deeply frozen.
 *
 * Reuses the existing coach-core-adapter → coach-memory dependency (no new edge, no cycle).
 */

import { createCoachMemoryQueryPlan } from '../coach-memory/index.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)
const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Validate + normalise supportingMemoryIds: strings, trimmed, non-empty, first-seen dedupe. */
function normalizeSupportingMemoryIds(raw) {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new TypeError('completeIntelligenceInput: options.supportingMemoryIds must be an array')
  const seen = new Set()
  const out = []
  for (const id of raw) {
    if (typeof id !== 'string') throw new TypeError('completeIntelligenceInput: supportingMemoryIds must be strings')
    const trimmed = id.trim()
    if (trimmed.length === 0) throw new TypeError('completeIntelligenceInput: supportingMemoryIds must be non-empty after trim')
    if (!seen.has(trimmed)) { seen.add(trimmed); out.push(trimmed) }
  }
  return out
}

/**
 * Complete an M135 decisionPlanContext into the M118/M137 intelligence input.
 *
 * @param {{ plan: object, decision: object, metadata?: object }} decisionPlanContext  M135 output
 * @param {{ supportingMemoryIds?: string[] }} [options]
 * @returns {Readonly<{ plan: object, decision: Readonly<{ category:string, confidence:number,
 *   matchedSignals:string[], supportingMemoryIds:string[] }>, metadata: any }>}
 */
export function completeIntelligenceInput(decisionPlanContext, options = {}) {
  if (!isObj(decisionPlanContext)) throw new TypeError('completeIntelligenceInput requires a decisionPlanContext object')
  if (!isObj(options)) throw new TypeError('completeIntelligenceInput: options must be an object')

  const { plan, decision } = decisionPlanContext
  if (!isObj(plan)) throw new TypeError('completeIntelligenceInput: malformed plan')
  if (!isObj(decision) || typeof decision.category !== 'string' || !isFiniteNumber(decision.confidence) || !isStringArray(decision.matchedSignals)) {
    throw new TypeError('completeIntelligenceInput: malformed decision (requires { category, confidence, matchedSignals })')
  }

  const supportingMemoryIds = normalizeSupportingMemoryIds(options.supportingMemoryIds)

  // 1. normalise the M109 request plan into the { filters, retrieval } plan M118/M110 consume
  const normalizedPlan = createCoachMemoryQueryPlan(plan)   // pure; throws TypeError if the request is malformed

  // 2. complete the decision (preserve existing fields; append supportingMemoryIds)
  const completedDecision = {
    category: decision.category,
    confidence: decision.confidence,
    matchedSignals: decision.matchedSignals.slice(),
    supportingMemoryIds,
  }

  // 3. preserve metadata (copied so freezing never touches the caller's object)
  const metadata = isObj(decisionPlanContext.metadata) ? { ...decisionPlanContext.metadata } : decisionPlanContext.metadata

  return deepFreeze({ plan: normalizedPlan, decision: completedDecision, metadata })
}
