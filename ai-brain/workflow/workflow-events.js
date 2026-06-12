/**
 * AI Brain — Workflow Events (M13)
 *
 * Stage execution primitives.
 *
 * `runStage` is the single seam through which every pipeline stage runs.
 * It is the designated insertion point for future cross-cutting concerns:
 *
 *   - LLM reasoning hooks (pre/post stage)
 *   - Planning overlays (inspect result before next stage runs)
 *   - Scheduling gates (pause and resume a workflow mid-run)
 *   - Autonomous agent injection (replace or augment any stage fn)
 *   - Audit logging (record every stage transition to an external store)
 *
 * Adding any of the above never requires touching workflow-engine.js —
 * the insertion point is here, in the stage executor.
 *
 * Contract:
 *   - `runStage` never throws, regardless of what `fn` does.
 *   - On success, workflow.stages[name] has status COMPLETED.
 *   - On failure, workflow.stages[name] has status FAILED; error is captured.
 *   - The workflow.errors array always reflects all stage failures.
 *   - `fn` must be an async function returning a plain object (the stage result).
 */

import { createStageRecord, completeStageRecord, failStageRecord } from './workflow-state.js'

/**
 * Execute a single pipeline stage.
 *
 * @param {object}   workflow   - mutable workflow accumulator (stages, errors)
 * @param {string}   stageName  - one of STAGE.*
 * @param {Function} fn         - async () => result — must not throw intentionally
 * @returns {Promise<boolean>}  - true if stage completed, false if it failed
 */
export async function runStage(workflow, stageName, fn) {
  const startMs    = Date.now()
  const stageStart = createStageRecord(stageName)
  workflow.stages[stageName] = stageStart

  try {
    const result = await fn()
    workflow.stages[stageName] = completeStageRecord(stageStart, result ?? null, startMs)
    return true
  } catch (err) {
    const message = err?.message ?? String(err)
    workflow.stages[stageName] = failStageRecord(stageStart, message, startMs)
    workflow.errors.push({ stage: stageName, message })
    return false
  }
}
