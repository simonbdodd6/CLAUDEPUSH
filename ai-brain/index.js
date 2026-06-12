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

let _ca  = null    // context-assembly (M3)
let _rs  = null    // reasoning (M4)
let _ls  = null    // learning-store (M5)
let _cal = null    // calibrator (M5)
let _bt  = null    // brain-timeline (M6)
let _mem = null    // memory-engine (M7)
let _obs = null    // observation-engine (M8)
let _exp = null    // explanation-engine (M10)
let _diag = null   // diagnostics (M11)
let _pol  = null   // policy-engine (M12)
let _wf   = null   // workflow-engine (M13)
let _plan = null   // planning-engine (M14)
let _rec = null
let _ke  = null
let _le  = null
let _tl  = null
let _aa  = null    // autonomous-assistant
let _oe  = null    // observation-engine
let _ci  = null    // qa/club-intelligence

async function loadCA() {
  if (!_ca) _ca = await import('./context-assembly.js')
  return _ca
}

async function loadRS() {
  if (!_rs) _rs = await import('./reasoning.js')
  return _rs
}

async function loadLS() {
  if (!_ls) _ls = await import('./learning-store.js')
  return _ls
}

async function loadCal() {
  if (!_cal) _cal = await import('./calibrator.js')
  return _cal
}

async function loadBT() {
  if (!_bt) _bt = await import('./timeline.js')
  return _bt
}

async function loadMem() {
  if (!_mem) _mem = await import('./memory/memory-engine.js')
  return _mem
}

async function loadObs() {
  if (!_obs) _obs = await import('./observation/observation-engine.js')
  return _obs
}

async function loadExp() {
  if (!_exp) _exp = await import('./explain/explanation-engine.js')
  return _exp
}

async function loadDiag() {
  if (!_diag) _diag = await import('./diagnostics/brain-status.js')
  return _diag
}

async function loadPol() {
  if (!_pol) _pol = await import('./policy/policy-engine.js')
  return _pol
}

async function loadWf() {
  if (!_wf) _wf = await import('./workflow/workflow-engine.js')
  return _wf
}

async function loadPlan() {
  if (!_plan) _plan = await import('./planning/planning-engine.js')
  return _plan
}

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

async function loadAA() {
  if (!_aa) _aa = await import('../autonomous-assistant/index.js')
  return _aa
}

async function loadOE() {
  if (!_oe) _oe = await import('../autonomous-assistant/observation-engine.js')
  return _oe
}

async function loadCI() {
  if (!_ci) _ci = await import('../qa/club-intelligence/index.js')
  return _ci
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
  // M13: All execution now routes through the Workflow Engine.
  // The BrainResponse contract is unchanged — callers receive the same shape as before.
  try {
    const { runWorkflow } = await loadWf()
    const workflow = await runWorkflow(context)
    return workflow.response
  } catch (err) {
    return toBrainResponse([], {
      meta:  { isMock: true, error: err.message },
      trace: { modules: [], duration: 0 },
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

  const isString = typeof query === 'string'
  const question = isString ? query : (query.question ?? '')

  if (!question.trim()) {
    return toQueryResponse({ answer: '', confidence: 0 }, {
      trace: { modules, duration: Date.now() - t0 },
    })
  }

  // Collect any extra options (e.g. maxTokens) and pass them through
  const { question: _q, role, useCache, ...extraOpts } = isString ? {} : query

  try {
    const { ask: askFn } = await loadKe()
    modules.push('knowledge-engine')

    const result = await askFn(question, {
      role:     role     ?? 'coach',
      useCache: useCache ?? true,
      ...extraOpts,
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
  const { recommendationId, coachId, clubId } = outcome
  const coachDecision = normaliseOutcome(outcome.outcome)
  const category = outcome.recommendationType ?? outcome.category ?? null

  // M5: Record outcome in the Brain learning store for per-coach calibration.
  // Key = coachId + clubId + category — isolated; never leaks across clubs.
  if (category) {
    try {
      const { record } = await loadLS()
      record(coachId ?? null, clubId ?? null, category, outcome.outcome)
    } catch { /* non-blocking */ }
  }

  // M6: Record outcome event on Brain timeline.
  try {
    const { append: appendEvent, EVENT_TYPE } = await loadBT()
    const outcomeKey = String(outcome.outcome ?? '').toLowerCase()
    const evtType = {
      accepted:  EVENT_TYPE.RECOMMENDATION_ACCEPTED,
      actioned:  EVENT_TYPE.RECOMMENDATION_ACTIONED,
      dismissed: EVENT_TYPE.RECOMMENDATION_DISMISSED,
      rejected:  EVENT_TYPE.RECOMMENDATION_DISMISSED,
      snoozed:   EVENT_TYPE.RECOMMENDATION_SNOOZED,
    }[outcomeKey] ?? EVENT_TYPE.LEARN
    appendEvent(evtType, {
      clubId:           clubId ?? null,
      coachId:          coachId ?? null,
      sessionId:        outcome.sessionId ?? null,
      recommendationId: recommendationId ?? null,
      entities:         outcome.entities ?? [],
      metadata: {
        outcome:            coachDecision,
        recommendationType: category,
        confidenceAtTime:   outcome.confidenceAtTime ?? null,
      },
    })
  } catch { /* non-blocking */ }

  // Micro-correction: update calibration for this recommendation type
  try {
    const { recordOutcome } = await loadLe()
    recordOutcome({
      recommendationId,
      recommendationType: category ?? 'GENERAL',
      coachDecision,
      confidenceAtTime:   outcome.confidenceAtTime  ?? null,
      predictionCorrect:  outcome.predictionCorrect ?? null,
      notes:              outcome.notes             ?? null,
    })
  } catch { /* non-blocking — calibration failure must never surface to Core */ }

  // Working memory: update timeline status for this recommendation
  try {
    const { updateStatus } = await loadTl()
    updateStatus(recommendationId, coachDecision)
  } catch { /* non-blocking — timeline failure must never surface to Core */ }
}

// ── Observation ───────────────────────────────────────────────────────────────

/**
 * Return the current club observation snapshot (attendance, injuries, weather,
 * approvals, memberships). Wraps autonomous-assistant/observation-engine.
 *
 * @returns {Promise<ObservationSnapshot|null>}
 */
export async function observe() {
  try {
    const { observe: observeFn } = await loadOE()
    return await observeFn().catch(() => null)
  } catch { return null }
}

// ── Recommendation state management ──────────────────────────────────────────

/**
 * Return the current list of active recommendations from the autonomous
 * assistant. Used by endpoints that need to look up a rec by id before
 * recording an outcome.
 *
 * @returns {Promise<object[]>}
 */
export async function activeRecommendations() {
  try {
    const { getActiveRecommendations } = await loadAA()
    return await getActiveRecommendations().catch(() => [])
  } catch { return [] }
}

/**
 * Apply a coaching decision to a recommendation (accept / snooze / dismiss).
 * Calls the autonomous-assistant state machine, then closes the learning loop
 * via AI.learn() if the recommendation is found.
 *
 * @param {string}  id      - recommendation id
 * @param {string}  action  - 'accept' | 'snooze' | 'dismiss'
 * @param {object}  opts
 * @param {number}  opts.hours             - snooze duration (default 24)
 * @param {boolean} opts.predictionCorrect - optional outcome signal
 * @returns {Promise<{ ok: boolean, id: string, action: string }>}
 */
export async function decide(id, action, opts = {}) {
  const { hours = 24, predictionCorrect = null } = opts

  let rec = null
  try {
    const { getActiveRecommendations, resolve, snooze, dismiss } = await loadAA()
    const recs = await getActiveRecommendations().catch(() => [])
    rec = recs.find(r => r.id === id) ?? null

    if (action === 'accept')      resolve(id)
    else if (action === 'snooze') snooze(id, hours)
    else                          dismiss(id)
  } catch { /* non-blocking — state mutation failure must not surface to Core */ }

  if (rec) {
    await learn({
      recommendationId:   id,
      outcome:            action,
      recommendationType: rec.type ?? 'GENERAL',
      confidenceAtTime:   rec.confidence ?? null,
      predictionCorrect,
    })
  }

  return { ok: true, id, action }
}

/**
 * Resolve a non-recommendation item (e.g. an approval workflow item).
 * Does NOT trigger learning — use AI.decide() for recommendation decisions.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function resolveItem(id) {
  try {
    const { resolve } = await loadAA()
    resolve(id)
  } catch { }
}

// ── Scheduled intelligence ────────────────────────────────────────────────────

/**
 * Run the morning briefing and return the structured briefing result.
 * Wraps autonomous-assistant runMorningBriefing().
 *
 * @returns {Promise<object|null>}
 */
export async function briefing() {
  try {
    const { runMorningBriefing } = await loadAA()
    return await runMorningBriefing().catch(() => null)
  } catch { return null }
}

/**
 * Run an autonomous check and return the timeline result.
 * Wraps autonomous-assistant runCheck().
 *
 * @param {object} opts  - passed through to runCheck (e.g. { saveToState: false })
 * @returns {Promise<object|null>}
 */
export async function timelineCheck(opts = {}) {
  try {
    const { runCheck } = await loadAA()
    return await runCheck(opts).catch(() => null)
  } catch { return null }
}

// ── Intelligence Timeline ─────────────────────────────────────────────────────

/**
 * Query the intelligence timeline.
 * Returns { events, total, stats } — same shape as getTimeline() + summarise().
 *
 * @param {object} filters  - pre-parsed filter object (use parseTimelineFilters first)
 * @returns {Promise<{ events: object[], total: number, stats: object }>}
 */
export async function timeline(filters = {}) {
  try {
    const { query } = await loadBT()
    return query(filters ?? {})
  } catch { return { events: [], total: 0, stats: {} } }
}

/**
 * Update the status of a timeline event.
 * Wraps intelligence-timeline updateStatus().
 *
 * @param {string}      id
 * @param {string}      status
 * @param {string|null} notes
 * @returns {Promise<object|null>}
 */
export async function updateTimeline(id, status, notes = null) {
  try {
    const { updateStatus } = await loadTl()
    return updateStatus(id, status, notes)
  } catch { return null }
}

/**
 * Append recommendations to the intelligence timeline.
 * This is the Brain's working-memory write path.
 *
 * @param {object[]} recs
 * @param {object}   ctx    - context metadata (teamId, seasonPhase, fixture, etc.)
 * @param {string}   engine - engine identifier tag
 * @returns {Promise<void>}
 */
export async function appendTimeline(recs, ctx = {}, engine = 'recommendation-engine') {
  try {
    const { appendFromRecommendations } = await loadTl()
    appendFromRecommendations(recs, ctx, engine)
  } catch { }
}

/**
 * Parse URL query parameters into timeline filter shape.
 * Wraps intelligence-timeline parseFilters().
 *
 * @param {object} query  - key/value pairs from URL.searchParams
 * @returns {Promise<object>}
 */
export async function parseTimelineFilters(query = {}) {
  try {
    const { parseFilters } = await loadTl()
    return parseFilters(query)
  } catch { return {} }
}

// ── Brain status / diagnostics (M11) ─────────────────────────────────────────

/**
 * Return the full Brain diagnostic status report.
 *
 * Runs deterministic health checks for every AI subsystem and cross-system
 * integrity validation. No reasoning, no LLM, no randomness.
 *
 * The returned object is a superset of the M2 { cis, accuracy } shape:
 * cis and accuracy are hoisted to the top level for backward compatibility.
 *
 * @returns {Promise<BrainStatusReport>}
 */
export async function status() {
  try {
    const { getBrainStatus } = await loadDiag()
    return getBrainStatus()
  } catch (err) {
    return {
      overallHealth:  'error',
      modules:        {},
      totalMemories:  0, totalObservations: 0, totalRecommendations: 0, totalTimelineEvents: 0,
      calibrationState: { maturity: 'COLD_START', totalKeys: 0, activeKeys: 0, coldStartKeys: 0 },
      schemaVersions: {},
      integrity:      { consistent: false, totalIssues: 0, orphanObservations: [], orphanMemories: [], brokenTraces: [], missingExplanations: [], duplicateIds: { timeline: [], memory: [] }, schemaMismatches: [] },
      // M2 backward compat
      cis:      { score: 0, grade: 'N/A', stage: 'COLD_START', components: {} },
      accuracy: { overall: { f1: 0, grade: 'N/A', precision: 0, recall: 0 } },
      error:    err.message,
    }
  }
}

// ── Club health (fallback path) ───────────────────────────────────────────────

/**
 * Return club health and insights from the club intelligence engine.
 * Used as the fallback when season-intelligence is unavailable.
 *
 * @returns {Promise<{ health: object, insights: object[] }>}
 */
export async function clubHealth() {
  try {
    const { getClubHealth, getInsights } = await loadCI()
    const [health, insights] = await Promise.all([
      Promise.resolve().then(() => getClubHealth())
        .catch(() => ({ overallScore: 52, trend: 'stable', isMock: true })),
      Promise.resolve().then(() => getInsights())
        .catch(() => []),
    ])
    return { health, insights }
  } catch {
    return { health: { overallScore: 52, trend: 'stable', isMock: true }, insights: [] }
  }
}

// ── Brain timeline (M6) — episodic event history ──────────────────────────────

/**
 * Record a manual coach observation on the Brain timeline.
 * This is the public entry point for COACH_OBSERVATION events.
 *
 * @param {object} opts
 * @param {string|null} opts.coachId
 * @param {string|null} opts.clubId
 * @param {string|null} opts.sessionId
 * @param {string[]}    opts.entities
 * @param {object}      opts.metadata   - any coach-supplied context
 * @returns {Promise<TimelineEvent|null>}
 */
export async function recordObservation(opts) {
  const { coachId = null, clubId = null, sessionId = null, entities = [], metadata = {} } = (opts != null ? opts : {})
  try {
    const { append: appendEvent, EVENT_TYPE } = await loadBT()
    return appendEvent(EVENT_TYPE.COACH_OBSERVATION, { coachId, clubId, sessionId, entities, metadata })
  } catch { return null }
}

// ── Calibration history (M5) — exposed for diagnostics and testing ────────────

/**
 * Return the Brain's accumulated learning history for a specific
 * coach + club + category combination.
 * Returns null when no history exists (cold start).
 *
 * @param {string|null} coachId
 * @param {string|null} clubId
 * @param {string}      category
 * @returns {Promise<{ acceptWeight: number, totalSeen: number } | null>}
 */
export async function getCalibrationHistory(coachId, clubId, category) {
  try {
    const { getHistory } = await loadLS()
    return getHistory(coachId ?? null, clubId ?? null, category)
  } catch { return null }
}

// ── Parallel reasoning (M4) — exposed for integration testing ─────────────────

/**
 * Run the three parallel reasoners over a ContextBundle and return a
 * ReasoningBundle. Exposed for integration tests and advanced callers.
 * Normal callers use AI.request() which calls this internally.
 *
 * @param {ContextBundle} bundle
 * @returns {Promise<ReasoningBundle>}
 */
export async function reason(bundle) {
  try {
    const { reason: reasonFn } = await loadRS()
    return reasonFn(bundle ?? {})
  } catch (err) {
    return {
      recommendations: [],
      insights:        [],
      warnings:        [{ message: `reasoning failed: ${err.message}`, severity: 'high' }],
      evidence:        [],
      trace:           { reasoners: [], reasonerDurations: {}, synthesisDurationMs: 0, totalDurationMs: 0, recommendationCount: { preMerge: 0, postMerge: 0 } },
    }
  }
}

// ── Context assembly (M3) — exposed for integration testing ──────────────────

/**
 * Assemble a ContextBundle from all registered providers.
 * Called internally by AI.request() before reasoning. Exposed on the AI
 * namespace so tests can verify bundle shape without going through request().
 *
 * @param {object} trigger
 * @returns {Promise<ContextBundle>}
 */
export async function assembleContext(trigger = {}) {
  const { assembleContext: assemble } = await loadCA()
  return assemble(trigger ?? {})
}

// ── Memory Engine (M7) — long-term memory derived from Timeline events ────────

/**
 * AI.memory — transform repeated Timeline events into long-term Memory objects.
 * No reasoning occurs here. Only statistical pattern counting.
 *
 * AI.memory.get(entityId)     — all memories for an entity (with decay)
 * AI.memory.search(query)     — full-text search over all memories
 * AI.memory.related(entityId) — memories of co-appearing entities
 * AI.memory.refresh(entityId) — rebuild memories from Timeline events
 */
export const memory = {
  async get(entityId) {
    try {
      const { get: getFn } = await loadMem()
      return getFn(entityId ?? null)
    } catch { return [] }
  },

  async search(queryText) {
    try {
      const { search: searchFn } = await loadMem()
      return searchFn(queryText ?? '')
    } catch { return [] }
  },

  async related(entityId) {
    try {
      const { related: relatedFn } = await loadMem()
      return relatedFn(entityId ?? null)
    } catch { return [] }
  },

  async refresh(entityId) {
    try {
      const { refresh: refreshFn } = await loadMem()
      return refreshFn(entityId ?? null)
    } catch { return [] }
  },
}

// ── Observation Engine (M8) — deterministic facts derived from Memory ─────────

/**
 * AI.observations — derive typed Observations from Memory objects.
 * Pure and deterministic: same memory state → same observations.
 * No recommendations, no predictions, no LLM calls.
 *
 * AI.observations.forEntity(entityId)              — all observations for an entity
 * AI.observations.all()                            — all observations across all entities
 * AI.observations.byType(entityId, observationType) — observations of a specific type
 */
export const observations = {
  async forEntity(entityId) {
    try {
      const { observe: observeFn } = await loadObs()
      return observeFn(entityId ?? null)
    } catch { return [] }
  },

  async all() {
    try {
      const { observeAll } = await loadObs()
      return observeAll()
    } catch { return [] }
  },

  async byType(entityId, observationType) {
    try {
      const { byType: byTypeFn } = await loadObs()
      return byTypeFn(entityId ?? null, observationType)
    } catch { return [] }
  },
}

// ── Policy Guard (M12) ───────────────────────────────────────────────────────

/**
 * Apply the Brain Safety & Policy Guard to a BrainResponse (or rec array).
 *
 * Runs eight deterministic safety rules over every recommendation and returns
 * a PolicyCheckResult — a new object with each recommendation annotated with
 * a `policy` field. The input is never mutated. Evidence and confidence are
 * never changed. Recommendations are never deleted.
 *
 * @param {object|object[]} response  - BrainResponse from AI.request(), or a rec array
 * @param {object}          context   - { coachId?, clubId? } for cross-club rule
 * @returns {Promise<PolicyCheckResult>}
 */
export async function policyCheck(response, context = {}) {
  try {
    const { checkPolicy } = await loadPol()
    return checkPolicy(response ?? [], context)
  } catch (err) {
    const recs = Array.isArray(response) ? response : (response?.recommendations ?? [])
    return {
      policySchemaVersion: '1.0',
      checkedAt:           new Date().toISOString(),
      overallStatus:       'allowed',
      recommendations:     recs,
      summary:             { total: recs.length, allowed: recs.length, needsReview: 0, blocked: 0 },
      error:               err.message,
    }
  }
}

// ── Planning Engine (M14) ─────────────────────────────────────────────────────

/**
 * Convert a single recommendation into a structured coach action plan.
 *
 * Applies the policy gate first if `rec.policy` is absent, then delegates to
 * createPlan(). Returns null when the rec is blocked by policy.
 *
 * No LLM calls. No randomness. All plan content comes from deterministic templates.
 *
 * @param {object} rec      - BrainRecommendation (must have at minimum: id, title)
 * @param {object} context  - { coachId?, clubId? }
 * @returns {Promise<object|null>}  Plan | null
 */
export async function plan(rec, context = {}) {
  try {
    if (!rec) return null
    // Run policy check if the rec hasn't been through the policy stage yet
    const recWithPolicy = rec.policy ? rec : await (async () => {
      const { checkPolicy } = await loadPol()
      const result = checkPolicy([rec], context)
      return result.recommendations[0] ?? rec
    })()
    const { createPlan: createPlanFn } = await loadPlan()
    return createPlanFn(recWithPolicy, context)
  } catch { return null }
}

// ── Explainability (M10) ──────────────────────────────────────────────────────

/**
 * Reconstruct exactly why a recommendation was generated.
 *
 * Returns a complete ExplanationRecord: the generating reasoner, every
 * observation / memory / timeline event that influenced the result,
 * the confidence breakdown, calibration adjustments, and a plain-language
 * narrative — all captured at generation time, requiring no live data.
 *
 * Returns null when the id is not found (e.g. never recorded, or store cleared).
 *
 * @param {string} recommendationId
 * @returns {Promise<object|null>}
 */
export async function explain(recommendationId) {
  try {
    const { explain: explainFn } = await loadExp()
    return explainFn(recommendationId ?? null)
  } catch { return null }
}

// ── AI namespace export (primary idiom for Core consumers) ────────────────────
export const AI = {
  // M1 — Core intelligence methods
  request, ask, learn,
  // M2 — Observation and state management
  observe,
  activeRecommendations, decide, resolveItem,
  briefing, timelineCheck,
  // M2 — Timeline access
  timeline, updateTimeline, appendTimeline, parseTimelineFilters,
  // M2 — Status and fallback health
  status, clubHealth,
  // M3 — Context assembly
  assembleContext,
  // M4 — Parallel reasoning
  reason,
  // M5 — Calibration diagnostics
  getCalibrationHistory,
  // M6 — Intelligence timeline
  recordObservation,
  // M7 — Memory Engine
  memory,
  // M8 — Observation Engine
  observations,
  // M10 — Explainability Layer
  explain,
  // M12 — Safety Policy Guard
  policyCheck,
  // M14 — Planning Engine
  plan,
}
