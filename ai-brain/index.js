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
let _api      = null   // coach-experience-api (M15)
let _products = null   // coach-intelligence-products (M16)
let _clp      = null   // coach-learning-profile (M19)
let _dna      = null   // coach-dna-engine (M23)
let _opp      = null   // opponent-intelligence (M24)
let _td       = null   // training-designer (M25)
let _ms       = null   // match-strategy (M26)
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

async function loadApi() {
  if (!_api) _api = await import('./api/index.js')
  return _api
}

async function loadProducts() {
  if (!_products) _products = await import('./products/index.js')
  return _products
}

async function loadClp() {
  if (!_clp) _clp = await import('./learning/index.js')
  return _clp
}

async function loadDna() {
  if (!_dna) _dna = await import('./coach-dna/index.js')
  return _dna
}

async function loadOpp() {
  if (!_opp) _opp = await import('./opponent/index.js')
  return _opp
}

async function loadTd() {
  if (!_td) _td = await import('./training-designer/index.js')
  return _td
}

async function loadMs() {
  if (!_ms) _ms = await import('./match-strategy/index.js')
  return _ms
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

  // M19 — Coach Learning Profile: record this decision to evolve the coach profile
  if (coachId) {
    try {
      const { recordAndSave } = await loadClp()
      const outcomeToEventType = {
        ACCEPTED:  'recommendation_accepted',
        REJECTED:  'recommendation_rejected',
        SNOOZED:   'recommendation_ignored',
      }
      const evtType = outcomeToEventType[coachDecision] ?? 'recommendation_ignored'
      recordAndSave(coachId, {
        eventType: evtType,
        eventData: {
          recommendationId,
          category: category ?? null,
          urgency:  outcome.urgency ?? null,
          action:   outcome.action  ?? null,
        },
      }, { recordedAt: outcome.recordedAt ?? null })
    } catch { /* non-blocking */ }
  }
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

// ── Coach Experience API (M15) ────────────────────────────────────────────────
//
// The stable, versioned facade between Core and Intelligence.
// Core MUST only use these four methods — never call Brain internals directly.
//
// Every method returns an ApiResponse:
//   { apiVersion, status, ok, generatedAt, durationMs, data, error }
//
// Pass opts.flags to enable/disable individual endpoints:
//   AI.getDashboard(coachId, clubId, { flags: { 'ai.dashboard': false } })

/**
 * Return a full coach dashboard: top recommendations, planning checklist,
 * observations, policy warnings, explanation summaries, and confidence.
 *
 * @param {string|null} coachId
 * @param {string|null} clubId
 * @param {object}      opts   - { flags? }
 * @returns {Promise<ApiResponse>}
 */
export async function getDashboard(coachId, clubId, opts = {}) {
  try {
    const { getDashboard: fn } = await loadApi()
    return fn(coachId, clubId, opts)
  } catch (err) {
    return { apiVersion: 'v1', status: 'error', ok: false, generatedAt: new Date().toISOString(), durationMs: 0, data: null, error: { message: err.message, code: 'INTERNAL_ERROR' } }
  }
}

/**
 * Return attendance trend, availability trend, improvement and welfare
 * observations, supporting evidence, and explanations for a single player.
 *
 * @param {string} playerId
 * @param {object} opts    - { flags? }
 * @returns {Promise<ApiResponse>}
 */
export async function getPlayerInsight(playerId, opts = {}) {
  try {
    const { getPlayerInsight: fn } = await loadApi()
    return fn(playerId, opts)
  } catch (err) {
    return { apiVersion: 'v1', status: 'error', ok: false, generatedAt: new Date().toISOString(), durationMs: 0, data: null, error: { message: err.message, code: 'INTERNAL_ERROR' } }
  }
}

/**
 * Return squad health, availability, training load, preparation status,
 * and pending planning actions for a team.
 *
 * @param {string} teamId
 * @param {object} opts   - { flags? }
 * @returns {Promise<ApiResponse>}
 */
export async function getTeamInsight(teamId, opts = {}) {
  try {
    const { getTeamInsight: fn } = await loadApi()
    return fn(teamId, opts)
  } catch (err) {
    return { apiVersion: 'v1', status: 'error', ok: false, generatedAt: new Date().toISOString(), durationMs: 0, data: null, error: { message: err.message, code: 'INTERNAL_ERROR' } }
  }
}

/**
 * Return club activity, engagement, operational health, trends,
 * and top recommendations for a club.
 *
 * @param {string} clubId
 * @param {object} opts   - { flags? }
 * @returns {Promise<ApiResponse>}
 */
export async function getClubInsight(clubId, opts = {}) {
  try {
    const { getClubInsight: fn } = await loadApi()
    return fn(clubId, opts)
  } catch (err) {
    return { apiVersion: 'v1', status: 'error', ok: false, generatedAt: new Date().toISOString(), durationMs: 0, data: null, error: { message: err.message, code: 'INTERNAL_ERROR' } }
  }
}

// ── Coach Intelligence Products (M16) ────────────────────────────────────────
//
// Four coaching products that compose the Experience API (M15) outputs into
// complete, coach-facing deliverables. These are the top of the stack.
//
// Every method returns a ProductResponse:
//   { productId, productVersion, ok, generatedAt, durationMs, data, error }
//
// Product flags: pass opts.flags with 'ai.product.*' keys to disable.

const _productFallback = (productId, message) => ({
  productId, productVersion: '1.0', ok: false,
  generatedAt: new Date().toISOString(), durationMs: 0, data: null,
  error: { message, code: 'INTERNAL_ERROR' },
})

/**
 * Weekly Coach Brief — top priorities, risks, training checklist, attendance,
 * medical summary, selection reminders, and recommended actions for the week.
 *
 * @param {string|null} coachId
 * @param {string|null} clubId
 * @param {object}      opts   - { flags? }
 * @returns {Promise<ProductResponse>}
 */
export async function getWeeklyBrief(coachId, clubId, opts = {}) {
  try {
    const { getWeeklyBrief: fn } = await loadProducts()
    return fn(coachId, clubId, opts)
  } catch (err) { return _productFallback('weekly-brief', err.message) }
}

/**
 * Match Readiness Report — squad readiness %, availability %, injury concerns,
 * training completion, preparation checklist, and missing actions.
 *
 * @param {string} teamId
 * @param {object} opts   - { flags? }
 * @returns {Promise<ProductResponse>}
 */
export async function getMatchReadiness(teamId, opts = {}) {
  try {
    const { getMatchReadiness: fn } = await loadProducts()
    return fn(teamId, opts)
  } catch (err) { return _productFallback('match-readiness', err.message) }
}

/**
 * Player Development Card — attendance, availability, improvement trend,
 * coach observations, welfare indicators, and development priorities.
 *
 * @param {string} playerId
 * @param {object} opts    - { flags? }
 * @returns {Promise<ProductResponse>}
 */
export async function getPlayerCard(playerId, opts = {}) {
  try {
    const { getPlayerCard: fn } = await loadProducts()
    return fn(playerId, opts)
  } catch (err) { return _productFallback('player-card', err.message) }
}

/**
 * Club Health Snapshot — engagement, attendance, operational health, activity
 * trends, key warnings, and suggested focus areas.
 *
 * @param {string} clubId
 * @param {object} opts   - { flags? }
 * @returns {Promise<ProductResponse>}
 */
export async function getClubSnapshot(clubId, opts = {}) {
  try {
    const { getClubSnapshot: fn } = await loadProducts()
    return fn(clubId, opts)
  } catch (err) { return _productFallback('club-snapshot', err.message) }
}

// ── Coach Learning Profile (M19) ──────────────────────────────────────────────
//
// AI.coachProfile — evolving per-coach preference profile.
// Products READ via AI.coachProfile.get() / preferences().
// Updates flow through AI.learn() → Learning Engine only.
//
// AI.coachProfile.get(coachId)                 → full CoachProfile
// AI.coachProfile.record(coachId, event, opts) → record event, return updated profile
// AI.coachProfile.replay(coachId, observations)→ rebuild profile from observations
// AI.coachProfile.preferences(coachId)         → derived Preferences map only
// AI.coachProfile.snapshot(coachId)            → lightweight summary
// AI.coachProfile.explain(coachId)             → confidence report per preference

export const coachProfile = {
  async get(coachId) {
    try {
      const { getProfile } = await loadClp()
      return getProfile(coachId ?? null)
    } catch { return null }
  },

  async record(coachId, event, opts = {}) {
    try {
      const { recordAndSave } = await loadClp()
      return recordAndSave(coachId ?? null, event, opts)
    } catch { return null }
  },

  async replay(coachId, observations) {
    try {
      const { replayAndSave } = await loadClp()
      return replayAndSave(coachId ?? null, observations ?? [])
    } catch { return null }
  },

  async preferences(coachId) {
    try {
      const { getProfile } = await loadClp()
      return getProfile(coachId ?? null)?.preferences ?? null
    } catch { return null }
  },

  async snapshot(coachId) {
    try {
      const { getProfile } = await loadClp()
      const profile = getProfile(coachId ?? null)
      if (!profile) return null
      return {
        coachId:           profile.coachId,
        profileVersion:    profile.profileVersion,
        overallConfidence: profile.overallConfidence,
        observationCount:  profile.observationCount,
        preferences:       profile.preferences,
        updatedAt:         profile.updatedAt,
      }
    } catch { return null }
  },

  async explain(coachId) {
    try {
      const { getProfile, buildConfidenceReport } = await loadClp()
      const profile = getProfile(coachId ?? null)
      if (!profile) return null
      return buildConfidenceReport(profile.preferences, profile.observationCount)
    } catch { return null }
  },
}

// ── M23 — Coach DNA Engine ────────────────────────────────────────────────────
// Discovers WHO the coach is from historical observations. Advisory only —
// explicit coach settings always win, and the engine never writes Core or the
// CoachProfile. Subscription-aware (Professional/Club/Enterprise), feature-flagged
// (ai.coachDNA), and gracefully degrading.
//
// AI.getCoachDNA(coachId, opts)            → full evolving CoachDNA profile
// AI.getCoachStyle(coachId, opts)          → high-level coaching style summary
// AI.compareCoachEvolution(coachId, opts)  → season-over-season evolution
// AI.getSeasonLearning(coachId, opts)      → what was learned in a season

/** Resolve the observation stream for a coach from the Learning store. */
async function dnaObservations(coachId) {
  const { getProfile } = await loadClp()
  return getProfile(coachId ?? null)?.observations ?? []
}

/** Gate: feature flag + subscription tier. Returns a fallback object or null. */
async function dnaGate(opts = {}) {
  const { DNA_FLAG, DNA_TIERS } = await loadDna()
  const flags = opts.flags ?? {}
  if (DNA_FLAG in flags && !flags[DNA_FLAG]) {
    return { available: false, ok: false, reason: 'feature_disabled', dnaVersion: null }
  }
  if (opts.tier != null && !DNA_TIERS.has(String(opts.tier).toLowerCase())) {
    return { available: false, ok: false, reason: 'insufficient_tier', dnaVersion: null }
  }
  return null
}

export const coachDNA = {
  async get(coachId, opts = {}) {
    try {
      const gate = await dnaGate(opts); if (gate) return gate
      const { getCoachDNA } = await loadDna()
      const observations = await dnaObservations(coachId)
      return { available: true, ok: true, reason: null, ...getCoachDNA(coachId ?? null, observations, { asOf: opts.asOf ?? null }) }
    } catch { return { available: false, ok: false, reason: 'brain_unavailable', dnaVersion: null } }
  },

  async style(coachId, opts = {}) {
    try {
      const gate = await dnaGate(opts); if (gate) return gate
      const { getCoachStyle } = await loadDna()
      const observations = await dnaObservations(coachId)
      return { available: true, ok: true, reason: null, ...getCoachStyle(coachId ?? null, observations, { asOf: opts.asOf ?? null }) }
    } catch { return { available: false, ok: false, reason: 'brain_unavailable', dnaVersion: null } }
  },

  async evolution(coachId, opts = {}) {
    try {
      const gate = await dnaGate(opts); if (gate) return gate
      const { compareCoachEvolution } = await loadDna()
      const observations = await dnaObservations(coachId)
      return { available: true, ok: true, reason: null, ...compareCoachEvolution(coachId ?? null, observations, { asOf: opts.asOf ?? null }) }
    } catch { return { available: false, ok: false, reason: 'brain_unavailable', dnaVersion: null } }
  },

  async seasonLearning(coachId, opts = {}) {
    try {
      const gate = await dnaGate(opts); if (gate) return gate
      const { getSeasonLearning } = await loadDna()
      const observations = await dnaObservations(coachId)
      return { available: true, ok: true, reason: null, ...getSeasonLearning(coachId ?? null, observations, { season: opts.season ?? null, asOf: opts.asOf ?? null }) }
    } catch { return { available: false, ok: false, reason: 'brain_unavailable', dnaVersion: null } }
  },

  async reset(coachId, opts = {}) {
    try {
      const { resetCoachDNA } = await loadDna()
      return resetCoachDNA(coachId ?? null, { asOf: opts.asOf ?? null })
    } catch { return null }
  },

  async export(coachId, opts = {}) {
    try {
      const gate = await dnaGate(opts); if (gate) return gate
      const { exportCoachDNA } = await loadDna()
      const observations = await dnaObservations(coachId)
      return exportCoachDNA(coachId ?? null, observations, { asOf: opts.asOf ?? null })
    } catch { return null }
  },
}

/** AI.getCoachDNA — full evolving CoachDNA profile. */
export async function getCoachDNA(coachId, opts = {})           { return coachDNA.get(coachId, opts) }
/** AI.getCoachStyle — high-level coaching style summary. */
export async function getCoachStyle(coachId, opts = {})         { return coachDNA.style(coachId, opts) }
/** AI.compareCoachEvolution — season-over-season evolution. */
export async function compareCoachEvolution(coachId, opts = {}) { return coachDNA.evolution(coachId, opts) }
/** AI.getSeasonLearning — what was learned in a season. */
export async function getSeasonLearning(coachId, opts = {})     { return coachDNA.seasonLearning(coachId, opts) }

// ── M24 — Opponent Intelligence Engine ────────────────────────────────────────
// Builds a complete, evidence-backed Opponent Profile from historical match
// observations. No LLM, no Core dependency, subscription-aware (Performance+),
// feature-flagged (ai.opponentIntelligence), versioned, gracefully degrading.
//
// AI.getOpponentProfile(opponentId, opts)        → full Opponent Profile
// AI.getOpponentSummary(opponentId, opts)        → headline strengths/weaknesses
// AI.getOpponentThreats(opponentId, opts)        → threats (+ how to nullify)
// AI.getOpponentOpportunities(opponentId, opts)  → opportunities (+ how to exploit)
// AI.compareOpponents([idA, idB], opts)          → dimension-by-dimension compare
// AI.getOpponentEvolution(opponentId, opts)      → earlier vs recent windows
// AI.opponent.record(opponentId, observations)   → append match observations

async function oppGate(opts = {}) {
  const { OPPONENT_FLAG, OPPONENT_TIERS } = await loadOpp()
  const flags = opts.flags ?? {}
  if (OPPONENT_FLAG in flags && !flags[OPPONENT_FLAG]) {
    return { available: false, ok: false, reason: 'feature_disabled', profileVersion: null }
  }
  if (opts.tier != null && !OPPONENT_TIERS.has(String(opts.tier).toLowerCase())) {
    return { available: false, ok: false, reason: 'insufficient_tier', profileVersion: null }
  }
  return null
}

export const opponent = {
  async record(opponentId, observations) {
    try {
      const { recordOpponentObservations } = await loadOpp()
      return recordOpponentObservations(opponentId ?? null, observations ?? [])
    } catch { return 0 }
  },

  async profile(opponentId, opts = {}) {
    try {
      const gate = await oppGate(opts); if (gate) return gate
      const { buildOpponentProfile, getOpponentObservations } = await loadOpp()
      return { available: true, ok: true, reason: null, ...buildOpponentProfile(opponentId ?? null, getOpponentObservations(opponentId), { asOf: opts.asOf ?? null, opponentName: opts.opponentName ?? null }) }
    } catch { return { available: false, ok: false, reason: 'brain_unavailable', profileVersion: null } }
  },

  async summary(opponentId, opts = {}) {
    try {
      const gate = await oppGate(opts); if (gate) return gate
      const { buildOpponentSummary, getOpponentObservations } = await loadOpp()
      return { available: true, ok: true, reason: null, ...buildOpponentSummary(opponentId ?? null, getOpponentObservations(opponentId), { asOf: opts.asOf ?? null }) }
    } catch { return { available: false, ok: false, reason: 'brain_unavailable', profileVersion: null } }
  },

  async threats(opponentId, opts = {}) {
    try {
      const gate = await oppGate(opts); if (gate) return gate
      const { buildOpponentThreats, getOpponentObservations } = await loadOpp()
      return { available: true, ok: true, reason: null, ...buildOpponentThreats(opponentId ?? null, getOpponentObservations(opponentId), { asOf: opts.asOf ?? null }) }
    } catch { return { available: false, ok: false, reason: 'brain_unavailable', profileVersion: null } }
  },

  async opportunities(opponentId, opts = {}) {
    try {
      const gate = await oppGate(opts); if (gate) return gate
      const { buildOpponentOpportunities, getOpponentObservations } = await loadOpp()
      return { available: true, ok: true, reason: null, ...buildOpponentOpportunities(opponentId ?? null, getOpponentObservations(opponentId), { asOf: opts.asOf ?? null }) }
    } catch { return { available: false, ok: false, reason: 'brain_unavailable', profileVersion: null } }
  },

  async compare(opponentIds = [], opts = {}) {
    try {
      const gate = await oppGate(opts); if (gate) return gate
      const { compareOpponentProfiles, getOpponentObservations } = await loadOpp()
      const [idA, idB] = Array.isArray(opponentIds) ? opponentIds : []
      return { available: true, ok: true, reason: null, ...compareOpponentProfiles(
        { opponentId: idA ?? null, observations: getOpponentObservations(idA) },
        { opponentId: idB ?? null, observations: getOpponentObservations(idB) },
        { asOf: opts.asOf ?? null }) }
    } catch { return { available: false, ok: false, reason: 'brain_unavailable', profileVersion: null } }
  },

  async evolution(opponentId, opts = {}) {
    try {
      const gate = await oppGate(opts); if (gate) return gate
      const { buildOpponentEvolution, getOpponentObservations } = await loadOpp()
      return { available: true, ok: true, reason: null, ...buildOpponentEvolution(opponentId ?? null, getOpponentObservations(opponentId), { asOf: opts.asOf ?? null }) }
    } catch { return { available: false, ok: false, reason: 'brain_unavailable', profileVersion: null } }
  },

  async export(opponentId, opts = {}) {
    try {
      const gate = await oppGate(opts); if (gate) return gate
      const { exportOpponentProfile, getOpponentObservations } = await loadOpp()
      return exportOpponentProfile(opponentId ?? null, getOpponentObservations(opponentId), { asOf: opts.asOf ?? null })
    } catch { return null }
  },

  async reset(opponentId) {
    try { const { resetOpponent } = await loadOpp(); return resetOpponent(opponentId ?? null) } catch { return null }
  },
}

/** AI.getOpponentProfile — full evidence-backed Opponent Profile. */
export async function getOpponentProfile(opponentId, opts = {})       { return opponent.profile(opponentId, opts) }
/** AI.getOpponentSummary — headline strengths / weaknesses. */
export async function getOpponentSummary(opponentId, opts = {})       { return opponent.summary(opponentId, opts) }
/** AI.getOpponentThreats — their strengths, and how to nullify them. */
export async function getOpponentThreats(opponentId, opts = {})       { return opponent.threats(opponentId, opts) }
/** AI.getOpponentOpportunities — their weaknesses, and how to exploit them. */
export async function getOpponentOpportunities(opponentId, opts = {}) { return opponent.opportunities(opponentId, opts) }
/** AI.compareOpponents — dimension-by-dimension comparison of two opponents. */
export async function compareOpponents(opponentIds, opts = {})        { return opponent.compare(opponentIds, opts) }
/** AI.getOpponentEvolution — how the opponent has changed over time. */
export async function getOpponentEvolution(opponentId, opts = {})     { return opponent.evolution(opponentId, opts) }

// ── M25 — Autonomous Training Designer ────────────────────────────────────────
// Designs complete, deterministic, evidence-backed rugby training sessions from
// upstream products (Coach DNA, Weekly Brief, Match Readiness, Opponent
// Intelligence, squad/welfare/load). No LLM, no Core dependency, feature-flagged
// (ai.trainingDesigner), subscription-aware (Performance+), versioned,
// gracefully degrading with safe fallback templates.
//
// AI.designTrainingSession(context, opts) → full session plan
// context: { coachDNA, weeklyBrief, matchReadiness, opponent, squad, welfare,
//   trainingLoad, format, grade, durationMin, players, space, weather,
//   matchImportance, seasonPhase, overrides, generatedAt }

async function tdGate(opts = {}) {
  const { DESIGNER_FLAG, DESIGNER_TIERS } = await loadTd()
  const flags = opts.flags ?? {}
  if (DESIGNER_FLAG in flags && !flags[DESIGNER_FLAG]) {
    return { available: false, ok: false, reason: 'feature_disabled', designerVersion: null }
  }
  if (opts.tier != null && !DESIGNER_TIERS.has(String(opts.tier).toLowerCase())) {
    return { available: false, ok: false, reason: 'insufficient_tier', designerVersion: null }
  }
  return null
}

export const trainingDesigner = {
  async design(context = {}, opts = {}) {
    try {
      const gate = await tdGate(opts); if (gate) return gate
      const { designSession } = await loadTd()
      return { available: true, ok: true, reason: null, ...designSession(context) }
    } catch { return { available: false, ok: false, reason: 'brain_unavailable', designerVersion: null } }
  },
}

/** AI.designTrainingSession — design a complete training session. */
export async function designTrainingSession(context = {}, opts = {}) { return trainingDesigner.design(context, opts) }

// ── M26 — Autonomous Match Strategy Engine ────────────────────────────────────
// Synthesises Coach DNA, Opponent Intelligence, Selection Assistant, Match
// Readiness, Training Designer, Weekly Brief and Availability into a complete,
// deterministic, evidence-backed match plan. No LLM, no Core dependency,
// feature-flagged (ai.matchStrategy), subscription-aware (Performance+),
// versioned, gracefully degrading with a safe fallback template.
//
// AI.buildMatchStrategy(context, opts) → complete Match Plan

async function msGate(opts = {}) {
  const { STRATEGY_FLAG, STRATEGY_TIERS } = await loadMs()
  const flags = opts.flags ?? {}
  if (STRATEGY_FLAG in flags && !flags[STRATEGY_FLAG]) {
    return { available: false, ok: false, reason: 'feature_disabled', strategyVersion: null }
  }
  if (opts.tier != null && !STRATEGY_TIERS.has(String(opts.tier).toLowerCase())) {
    return { available: false, ok: false, reason: 'insufficient_tier', strategyVersion: null }
  }
  return null
}

export const matchStrategy = {
  async build(context = {}, opts = {}) {
    try {
      const gate = await msGate(opts); if (gate) return gate
      const { buildMatchPlan } = await loadMs()
      return { available: true, ok: true, reason: null, ...buildMatchPlan(context) }
    } catch { return { available: false, ok: false, reason: 'brain_unavailable', strategyVersion: null } }
  },
}

/** AI.buildMatchStrategy — build a complete match plan. */
export async function buildMatchStrategy(context = {}, opts = {}) { return matchStrategy.build(context, opts) }

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
  // M15 — Coach Experience API (the ONLY interface Core should use for AI data)
  getDashboard,
  getPlayerInsight,
  getTeamInsight,
  getClubInsight,
  // M16 — Coach Intelligence Products
  getWeeklyBrief,
  getMatchReadiness,
  getPlayerCard,
  getClubSnapshot,
  // M19 — Coach Learning Profile
  coachProfile,
  // M23 — Coach DNA Engine
  coachDNA,
  getCoachDNA,
  getCoachStyle,
  compareCoachEvolution,
  getSeasonLearning,
  // M24 — Opponent Intelligence Engine
  opponent,
  getOpponentProfile,
  getOpponentSummary,
  getOpponentThreats,
  getOpponentOpportunities,
  compareOpponents,
  getOpponentEvolution,
  // M25 — Autonomous Training Designer
  trainingDesigner,
  designTrainingSession,
  // M26 — Autonomous Match Strategy Engine
  matchStrategy,
  buildMatchStrategy,
}
