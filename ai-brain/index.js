/**
 * Coach's Eye — AI Brain v1.0
 *
 * This is the ONLY file the Core application imports from the AI layer.
 * Every intelligence capability flows through three stable methods:
 *
 *   AI.request(context)  — proactive recommendations for a given club state
 *   AI.ask(query)        — reactive answer to a natural-language question
 *   AI.learn(outcome)    — record a coaching decision to close the learning loop
 *
 * Internal module routing is an implementation detail hidden from Core.
 * The schema version (BRAIN_SCHEMA_VERSION) must be bumped on any breaking
 * change to the BrainResponse or QueryResponse shapes.
 *
 * M1 — Brain Shell: methods pass through to existing modules.
 * Context assembly, reasoning layers, and memory integration arrive in M3–M8.
 */

import { toBrainResponse, toQueryResponse } from './schema.js'

// ── Schema version re-exported so Core can version-gate if needed ─────────────
export { BRAIN_SCHEMA_VERSION } from './schema.js'

// ── Lazy module cache ─────────────────────────────────────────────────────────
// Lazy imports keep boot time O(1) and allow individual engines to fail
// without taking down the Brain. Each loader is called at most once per process.

let _rec = null
let _ke  = null
let _le  = null
let _tl  = null

async function loadRec() {
  if (!_rec) _rec = await import('../recommendation-engine/index.js')
  return _rec
}

async function loadKe() {
  if (!_ke) _ke = await import('../knowledge-engine/index.js')
  return _ke
}

async function loadLe() {
  if (!_le) _le = await import('../learning-engine/index.js')
  return _le
}

async function loadTl() {
  if (!_tl) _tl = await import('../intelligence-timeline/index.js')
  return _tl
}

// ── Outcome normalisation ─────────────────────────────────────────────────────

const OUTCOME_MAP = {
  accepted:  'ACCEPTED',
  actioned:  'ACCEPTED',
  dismissed: 'REJECTED',
  rejected:  'REJECTED',
  snoozed:   'SNOOZED',
}

function normaliseOutcome(raw = '') {
  return OUTCOME_MAP[String(raw).toLowerCase()] ?? 'REJECTED'
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate ranked, calibrated recommendations for the current club state.
 *
 * M1 accepts the same raw context fields passed to recommendation-engine
 * buildContext(). From M3 onward, the Brain assembles context internally
 * from trigger + IDs alone; this interface remains backward-compatible.
 *
 * @param {RequestContext} context
 * @returns {Promise<BrainResponse>}
 */
export async function request(context = {}) {
  const t0      = Date.now()
  const modules = []

  try {
    const { generate, buildContext } = await loadRec()
    modules.push('recommendation-engine')

    const ctx = buildContext({
      fixture:        context.fixture        ?? null,
      digitalTwin:    context.digitalTwin    ?? null,
      attendanceData: context.attendanceData ?? null,
      clubScoreData:  context.clubScoreData  ?? null,
      seasonData:     context.seasonData     ?? null,
      weatherData:    context.weatherData    ?? null,
      fixtureList:    context.fixtureList    ?? null,
      resultHistory:  context.resultHistory  ?? null,
    })

    const maxResults = typeof context.maxResults === 'number' ? context.maxResults : 10
    const { recommendations = [], meta = {} } = generate(ctx, { maxResults, useMockFallback: true })

    return toBrainResponse(recommendations, {
      meta,
      trace: { modules, duration: Date.now() - t0 },
    })
  } catch (err) {
    return toBrainResponse([], {
      meta:  { isMock: true, error: err.message },
      trace: { modules, duration: Date.now() - t0 },
    })
  }
}

/**
 * Answer a natural-language question from a coach.
 *
 * Accepts either a string shorthand ("What are our injury risks?") or a
 * QueryContext object ({ question, coachId, clubId, role, useCache }).
 * The caller never needs to know which internal module answered.
 *
 * @param {string|QueryContext} query
 * @returns {Promise<QueryResponse>}
 */
export async function ask(query = {}) {
  const t0      = Date.now()
  const modules = []

  if (query == null) {
    return toQueryResponse({ answer: '', confidence: 0 }, { trace: { modules, duration: 0 } })
  }

  const question = typeof query === 'string' ? query : (query.question ?? '')

  if (!question.trim()) {
    return toQueryResponse({ answer: '', confidence: 0 }, {
      trace: { modules, duration: Date.now() - t0 },
    })
  }

  try {
    const { ask: askFn } = await loadKe()
    modules.push('knowledge-engine')

    const result = await askFn(question, {
      role:     query.role     ?? 'coach',
      useCache: query.useCache ?? true,
    })

    return toQueryResponse(result, {
      trace: { modules, duration: Date.now() - t0 },
    })
  } catch (err) {
    return toQueryResponse({ answer: '', confidence: 0, error: err.message }, {
      trace: { modules, duration: Date.now() - t0 },
    })
  }
}

/**
 * Record a coach decision to close the learning loop.
 *
 * Routes the outcome to both the calibration model and the timeline.
 * Both writes are best-effort: a failure in either does not throw.
 * The caller does not need to know about calibration or timeline internals.
 *
 * @param {LearningEvent} outcome
 * @returns {Promise<void>}
 */
export async function learn(outcome = {}) {
  if (outcome == null) return
  const { recommendationId, result, coachId } = outcome
  const coachDecision = normaliseOutcome(outcome.outcome)

  // Micro-correction: update calibration for this recommendation type
  try {
    const { recordOutcome } = await loadLe()
    recordOutcome({
      recommendationId,
      recommendationType: outcome.recommendationType ?? 'GENERAL',
      coachDecision,
      confidenceAtTime:   outcome.confidenceAtTime   ?? null,
      predictionCorrect:  outcome.predictionCorrect  ?? null,
    })
  } catch { /* non-blocking — calibration failure must never surface to Core */ }

  // Working memory: update timeline status for this recommendation
  try {
    const { updateStatus } = await loadTl()
    updateStatus(recommendationId, coachDecision)
  } catch { /* non-blocking — timeline failure must never surface to Core */ }
}

// ── AI namespace export (primary idiom for Core consumers) ────────────────────
export const AI = { request, ask, learn }
