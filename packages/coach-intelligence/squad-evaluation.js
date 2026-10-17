/**
 * @coach-intelligence — Squad Evaluation Engine (M121, DORMANT)
 *
 * Evaluates a whole squad by calling the M120 selection engine for each candidate against a
 * shared pipeline result + recommendation, then ranks the eligible players for coach review.
 * It does NOT select a final team, assign positions, or generate language — it produces a
 * deterministic ranked list.
 *
 * Pure and side-effect free: no persistence, filesystem, APIs, network, LLM, vector DB,
 * embeddings, randomness or clock. Inputs are never mutated; output is deeply frozen.
 */

import { evaluateSelectionCandidate } from './selection-engine.js'

const isObj = (v) => v !== null && typeof v === 'object'

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Validate + normalise the options, applying defaults. */
function normalizeOptions(options) {
  if (!isObj(options) || Array.isArray(options)) throw new TypeError('evaluateSquad requires an options object')

  let limit = 15
  if (options.limit !== undefined) {
    if (typeof options.limit !== 'number' || !Number.isFinite(options.limit) || options.limit < 1 || options.limit > 100) {
      throw new TypeError('evaluateSquad: limit must be a number in [1,100]')
    }
    limit = Math.floor(options.limit)
  }

  let groupByPosition = false
  if (options.groupByPosition !== undefined) {
    if (typeof options.groupByPosition !== 'boolean') throw new TypeError('evaluateSquad: groupByPosition must be a boolean')
    groupByPosition = options.groupByPosition
  }

  return { limit, groupByPosition }
}

const byPlayerId = (a, b) => (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0)
const byScoreThenPlayerId = (a, b) => (b.score - a.score) || byPlayerId(a, b)

/**
 * Evaluate and rank a squad of candidates.
 *
 * @param {Array<{ playerId:string, position:string, availability:boolean, confidence:number }>} candidates
 * @param {object} pipelineResult  an M118 pipeline result (shared across all candidates)
 * @param {object} recommendation  an M119 recommendation (shared across all candidates)
 * @param {{ limit?:number, groupByPosition?:boolean }} [options]
 * @returns {Readonly<object>}  { ranked, ineligible, metadata, byPosition? }
 */
export function evaluateSquad(candidates, pipelineResult, recommendation, options = {}) {
  if (!Array.isArray(candidates)) throw new TypeError('evaluateSquad requires an array of candidates')
  if (!isObj(pipelineResult)) throw new TypeError('evaluateSquad: invalid pipelineResult')
  if (!isObj(recommendation)) throw new TypeError('evaluateSquad: invalid recommendation')
  const { limit, groupByPosition } = normalizeOptions(options)

  const eligible = []
  const ineligible = []
  const seenIds = new Set()

  for (const candidate of candidates) {
    // evaluateSelectionCandidate validates candidate / pipelineResult / recommendation
    const e = evaluateSelectionCandidate(candidate, pipelineResult, recommendation)
    if (seenIds.has(candidate.playerId)) throw new TypeError(`evaluateSquad: duplicate playerId "${candidate.playerId}"`)
    seenIds.add(candidate.playerId)

    const item = {
      playerId: candidate.playerId,
      position: candidate.position,
      score: e.score,
      recommendationAction: e.recommendationAction,
      requiresCoachReview: e.requiresCoachReview,
      evidence: e.evidence,
    }
    ;(e.eligible ? eligible : ineligible).push(item)
  }

  const ranked = eligible.slice().sort(byScoreThenPlayerId).slice(0, limit)
  const ineligibleSorted = ineligible.slice().sort(byPlayerId)

  const result = {
    ranked,
    ineligible: ineligibleSorted,
    metadata: {
      candidateCount: candidates.length,
      eligibleCount: eligible.length,
      ineligibleCount: ineligibleSorted.length,
      limit,
      deterministic: true,
      explainable: true,
      llmGenerated: false,
    },
  }

  if (groupByPosition) {
    const byPosition = {}
    for (const item of ranked) {
      if (!byPosition[item.position]) byPosition[item.position] = []
      byPosition[item.position].push(item)
    }
    result.byPosition = byPosition
  }

  return deepFreeze(result)
}
