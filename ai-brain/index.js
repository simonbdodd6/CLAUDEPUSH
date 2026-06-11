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
  const t0      = Date.now()
  const modules = []

  try {
    // M3: Assemble full context bundle before invoking any reasoning.
    const { assembleContext } = await loadCA()
    modules.push('context-assembly')
    const bundle = await assembleContext(context ?? {})

    // M4: Run three parallel reasoners over the bundle, then synthesise.
    const { reason: reasonFn } = await loadRS()
    modules.push('reasoning')
    const rb = await reasonFn(bundle)
    modules.push('synthesis')

    // M5: Calibrate confidence using coach/club learning history.
    const { calibrate: calibrateFn } = await loadCal()
    const { getHistory }             = await loadLS()
    modules.push('calibration')

    const coachId = context?.coachId ?? null
    const clubId  = context?.clubId  ?? null
    const cal     = calibrateFn(rb.recommendations, { coachId, clubId, getHistory })

    const recs   = cal.recommendations
    const isMock = recs.length === 0 ||
      recs.every(r => (r.source ?? '').includes('/mock'))

    // M6: Record REQUEST + RECOMMENDATION_SHOWN events on Brain timeline.
    try {
      const { append: appendEvent, EVENT_TYPE } = await loadBT()
      const sessionId = context?.sessionId ?? null
      appendEvent(EVENT_TYPE.REQUEST, {
        clubId:  clubId,
        coachId: coachId,
        sessionId,
        metadata: {
          recommendationCount: recs.length,
          isMock,
          calibrationApplied:  cal.applied,
          categories:          [...new Set(recs.map(r => r.category))],
        },
      })
      for (const rec of recs) {
        appendEvent(EVENT_TYPE.RECOMMENDATION_SHOWN, {
          clubId,
          coachId,
          sessionId,
          recommendationId: rec.id,
          entities:         context?.entities ?? [],
          metadata: {
            category:   rec.category,
            priority:   rec.priority,
            confidence: rec.confidence,
            source:     rec.source,
            isMock:     (rec.source ?? '').includes('/mock'),
          },
        })
      }
    } catch { /* timeline failures must never surface */ }

    return toBrainResponse(recs, {
      meta: {
        isMock,
        generatedAt: bundle.assembledAt,
        total:       recs.length,
        highCount:   recs.filter(r => r.priority === 'HIGH').length,
        mediumCount: recs.filter(r => r.priority === 'MEDIUM').length,
        lowCount:    recs.filter(r => r.priority === 'LOW').length,
        categories:  [...new Set(recs.map(r => r.category))],
        providers:   bundle.providers,
        reasoning:   rb.trace,
        calibration: {
          coachId:     cal.coachId,
          clubId:      cal.clubId,
          applied:     cal.applied,
          adjustments: cal.adjustments,
        },
      },
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

// ── Learning status ───────────────────────────────────────────────────────────

/**
 * Return the current Coaching Intelligence Score and prediction accuracy.
 * Used by /api/learning/status.
 *
 * @returns {Promise<{ cis: object, accuracy: object }>}
 */
export async function status() {
  try {
    const { computeClubIntelligenceScore, getPredictionAccuracy } = await loadLe()
    const [cis, accuracy] = await Promise.all([
      Promise.resolve().then(() => computeClubIntelligenceScore())
        .catch(() => ({ score: 0, grade: 'N/A', stage: 'COLD_START', components: {} })),
      Promise.resolve().then(() => getPredictionAccuracy())
        .catch(() => ({ overall: { f1: 0, grade: 'N/A', precision: 0, recall: 0 } })),
    ])
    return { cis, accuracy }
  } catch {
    return {
      cis:      { score: 0, grade: 'N/A', stage: 'COLD_START', components: {} },
      accuracy: { overall: { f1: 0, grade: 'N/A', precision: 0, recall: 0 } },
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
}
