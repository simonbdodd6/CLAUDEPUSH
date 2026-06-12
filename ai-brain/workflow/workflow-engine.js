/**
 * AI Brain — Workflow Engine (M13)
 *
 * Coordinates all existing Brain modules through a named, timed, fault-tolerant
 * pipeline. This is orchestration, not new intelligence — every stage delegates
 * to an existing module; no reasoning or business logic lives here.
 *
 * Pipeline (in execution order):
 *
 *   context     — assemble full context bundle (M3)
 *   observation — refresh observations for this coach/club (M8, best-effort)
 *   reasoning   — run parallel reasoners + synthesis (M4)
 *   calibration — adjust confidence from learning history (M5)
 *   policy      — apply safety guard to all recommendations (M12)
 *   explanation — record explanation snapshots (M10, best-effort)
 *   timeline    — append REQUEST + RECOMMENDATION_SHOWN events (M6, best-effort)
 *   response    — assemble the final BrainResponse
 *
 * Every stage:
 *   - is timed (durationMs)
 *   - reports started/completed/failed
 *   - captures its result or error
 *   - NEVER crashes the workflow (all errors are caught and recorded)
 *
 * The workflow object is the complete execution record. AI.request() runs a
 * workflow and returns workflow.response — the BrainResponse shape is unchanged.
 *
 * Future extension points (via workflow-events.js runStage):
 *   - LLM reasoning hooks before/after any stage
 *   - Planning overlays that inspect results between stages
 *   - Scheduling gates that pause and resume mid-run
 *   - Autonomous agent injection replacing or augmenting a stage
 *
 * No modifications to existing modules are ever required for these extensions.
 */

import { randomUUID } from 'crypto'
import { toBrainResponse } from '../schema.js'
import { STAGE, WORKFLOW_STATUS, WORKFLOW_SCHEMA_VERSION } from './workflow-types.js'
import { createWorkflow, finalizeWorkflow } from './workflow-state.js'
import { runStage } from './workflow-events.js'

// ── Lazy module loaders (mirrored from index.js) ──────────────────────────────
// Each loader resolves at most once per process — modules are cached in index.js.
// Importing via dynamic import here gets the same cached module instance.

async function loadCA()  { return import('../context-assembly.js') }
async function loadRS()  { return import('../reasoning.js') }
async function loadLS()  { return import('../learning-store.js') }
async function loadCal() { return import('../calibrator.js') }
async function loadBT()  { return import('../timeline.js') }
async function loadObs() { return import('../observation/observation-engine.js') }
async function loadExp() { return import('../explain/explanation-engine.js') }
async function loadPol() { return import('../policy/policy-engine.js') }

// ── Main workflow ─────────────────────────────────────────────────────────────

/**
 * Run the full Brain recommendation pipeline as a tracked, fault-tolerant workflow.
 *
 * @param {object} context  - RequestContext: { coachId?, clubId?, sessionId?, ... }
 * @returns {Promise<WorkflowResult>}
 */
export async function runWorkflow(context = {}) {
  const workflowId = randomUUID()
  const t0         = Date.now()
  const workflow   = createWorkflow(workflowId, context ?? {})

  // Mutable pipeline accumulator — flows through all stages.
  const pipe = {
    coachId:    context?.coachId  ?? null,
    clubId:     context?.clubId   ?? null,
    sessionId:  context?.sessionId ?? null,
    modules:    [],
    bundle:     null,
    rb:         null,
    cal:        null,
    recs:       [],
    policyRecs: [],
    policyMeta: null,
    isMock:     true,
  }

  // ── Stage 1: Context ────────────────────────────────────────────────────────
  await runStage(workflow, STAGE.CONTEXT, async () => {
    const { assembleContext } = await loadCA()
    pipe.bundle = await assembleContext(context ?? {})
    pipe.modules.push('context-assembly')
    return {
      assembledAt: pipe.bundle?.assembledAt ?? null,
      providers:   pipe.bundle?.providers   ?? [],
    }
  })

  // ── Stage 2: Observation (best-effort — failure never blocks the pipeline) ──
  await runStage(workflow, STAGE.OBSERVATION, async () => {
    const { observe: observeFn } = await loadObs()
    const refreshed = []
    if (pipe.coachId) { observeFn(pipe.coachId); refreshed.push(pipe.coachId) }
    if (pipe.clubId && pipe.clubId !== pipe.coachId) {
      observeFn(pipe.clubId); refreshed.push(pipe.clubId)
    }
    return { refreshed }
  })

  // ── Stage 3: Reasoning ──────────────────────────────────────────────────────
  await runStage(workflow, STAGE.REASONING, async () => {
    const bundle = pipe.bundle ?? await (async () => {
      // Context failed — build minimal fallback bundle so reasoning can run
      const { assembleContext } = await loadCA()
      return assembleContext({})
    })()
    const { reason: reasonFn } = await loadRS()
    pipe.rb = await reasonFn(bundle)
    pipe.modules.push('reasoning', 'synthesis')
    return {
      recommendationCount: pipe.rb.recommendations.length,
      reasoners:           pipe.rb.trace?.reasoners ?? [],
    }
  })

  // ── Stage 4: Calibration ────────────────────────────────────────────────────
  await runStage(workflow, STAGE.CALIBRATION, async () => {
    const recs = pipe.rb?.recommendations ?? []
    const { calibrate: calibrateFn } = await loadCal()
    const { getHistory }             = await loadLS()
    pipe.cal  = calibrateFn(recs, { coachId: pipe.coachId, clubId: pipe.clubId, getHistory })
    pipe.recs = pipe.cal.recommendations
    pipe.isMock = pipe.recs.length === 0 ||
      pipe.recs.every(r => (r.source ?? '').includes('/mock'))
    pipe.modules.push('calibration')
    return {
      applied:  pipe.cal.applied,
      count:    pipe.recs.length,
      isMock:   pipe.isMock,
    }
  })

  // ── Stage 5: Policy ─────────────────────────────────────────────────────────
  await runStage(workflow, STAGE.POLICY, async () => {
    const { checkPolicy } = await loadPol()
    const result = checkPolicy(pipe.recs, { coachId: pipe.coachId, clubId: pipe.clubId })
    pipe.policyRecs = result.recommendations
    pipe.policyMeta = {
      overallStatus: result.overallStatus,
      summary:       result.summary,
      checkedAt:     result.checkedAt,
    }
    pipe.modules.push('policy')
    return { overallStatus: result.overallStatus, ...result.summary }
  })

  // ── Stage 6: Explanation (best-effort) ──────────────────────────────────────
  await runStage(workflow, STAGE.EXPLANATION, async () => {
    const { record: recordExp } = await loadExp()
    const observations = pipe.rb?.trace?.observations ?? []
    const recsToRecord = pipe.policyRecs.length > 0 ? pipe.policyRecs : pipe.recs
    let recorded = 0
    for (const rec of recsToRecord) {
      const calAdj = pipe.cal?.adjustments?.find(a => a.recommendationId === rec.id) ?? null
      recordExp(rec, {
        observations,
        calibrationAdjustment: calAdj,
        coachId: pipe.coachId,
        clubId:  pipe.clubId,
      })
      recorded++
    }
    return { recorded }
  })

  // ── Stage 7: Timeline (best-effort) ─────────────────────────────────────────
  await runStage(workflow, STAGE.TIMELINE, async () => {
    const { append: appendEvent, EVENT_TYPE } = await loadBT()
    const finalRecs = pipe.policyRecs.length > 0 ? pipe.policyRecs : pipe.recs
    appendEvent(EVENT_TYPE.REQUEST, {
      clubId:    pipe.clubId,
      coachId:   pipe.coachId,
      sessionId: pipe.sessionId,
      metadata: {
        workflowId:          workflowId,
        recommendationCount: finalRecs.length,
        isMock:              pipe.isMock,
        calibrationApplied:  pipe.cal?.applied ?? false,
        categories:          [...new Set(finalRecs.map(r => r.category))],
      },
    })
    for (const rec of finalRecs) {
      appendEvent(EVENT_TYPE.RECOMMENDATION_SHOWN, {
        clubId:          pipe.clubId,
        coachId:         pipe.coachId,
        sessionId:       pipe.sessionId,
        recommendationId: rec.id,
        entities:        context?.entities ?? [],
        metadata: {
          category:   rec.category,
          priority:   rec.priority,
          confidence: rec.confidence,
          source:     rec.source,
          isMock:     (rec.source ?? '').includes('/mock'),
        },
      })
    }
    return { eventsRecorded: 1 + finalRecs.length }
  })

  // ── Stage 8: Response assembly ───────────────────────────────────────────────
  await runStage(workflow, STAGE.RESPONSE, async () => {
    const finalRecs = pipe.policyRecs.length > 0 ? pipe.policyRecs : pipe.recs
    const response  = toBrainResponse(finalRecs, {
      meta: {
        isMock:      pipe.isMock,
        generatedAt: pipe.bundle?.assembledAt ?? null,
        total:       finalRecs.length,
        highCount:   finalRecs.filter(r => r.priority === 'HIGH').length,
        mediumCount: finalRecs.filter(r => r.priority === 'MEDIUM').length,
        lowCount:    finalRecs.filter(r => r.priority === 'LOW').length,
        categories:  [...new Set(finalRecs.map(r => r.category))],
        providers:   pipe.bundle?.providers ?? [],
        reasoning:   pipe.rb?.trace ?? null,
        calibration: pipe.cal ? {
          coachId:     pipe.cal.coachId,
          clubId:      pipe.cal.clubId,
          applied:     pipe.cal.applied,
          adjustments: pipe.cal.adjustments,
        } : null,
        policy: pipe.policyMeta,
      },
      trace: {
        modules:  pipe.modules,
        duration: Date.now() - t0,
      },
    })
    // Attach workflow identity to the response trace for observability.
    // Additive — does not alter any existing field.
    response.trace.workflowId = workflowId
    return { total: finalRecs.length }
  })

  // ── Finalize ─────────────────────────────────────────────────────────────────

  // Retrieve the BrainResponse from the response stage result,
  // or produce a safe fallback if the response stage itself failed.
  let brainResponse = null
  const responseStage = workflow.stages[STAGE.RESPONSE]
  if (responseStage?.status === 'completed') {
    // The response was built inside the stage fn and attached to pipe — reconstruct it.
    // We rebuild here because runStage only stores the stage *result* (metadata object),
    // not the full BrainResponse. We need to rebuild from pipe.
    const finalRecs = pipe.policyRecs.length > 0 ? pipe.policyRecs : pipe.recs
    brainResponse = toBrainResponse(finalRecs, {
      meta: {
        isMock:      pipe.isMock,
        generatedAt: pipe.bundle?.assembledAt ?? null,
        total:       finalRecs.length,
        highCount:   finalRecs.filter(r => r.priority === 'HIGH').length,
        mediumCount: finalRecs.filter(r => r.priority === 'MEDIUM').length,
        lowCount:    finalRecs.filter(r => r.priority === 'LOW').length,
        categories:  [...new Set(finalRecs.map(r => r.category))],
        providers:   pipe.bundle?.providers ?? [],
        reasoning:   pipe.rb?.trace ?? null,
        calibration: pipe.cal ? {
          coachId:     pipe.cal.coachId,
          clubId:      pipe.cal.clubId,
          applied:     pipe.cal.applied,
          adjustments: pipe.cal.adjustments,
        } : null,
        policy: pipe.policyMeta,
      },
      trace: {
        modules:  pipe.modules,
        duration: Date.now() - t0,
      },
    })
    brainResponse.trace.workflowId = workflowId
  } else {
    // Response stage failed — safe fallback
    brainResponse = toBrainResponse([], {
      meta:  { isMock: true, workflow: { workflowId, failed: true } },
      trace: { modules: pipe.modules, duration: Date.now() - t0 },
    })
    brainResponse.trace.workflowId = workflowId
  }

  return finalizeWorkflow(workflow, t0, brainResponse)
}
