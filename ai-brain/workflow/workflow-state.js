/**
 * AI Brain — Workflow State (M13)
 *
 * Pure functions for constructing and updating workflow objects.
 * Nothing here mutates — callers are responsible for replacing fields.
 *
 * The workflow object shape:
 * {
 *   workflowId, schemaVersion, trigger,
 *   status, startedAt, completedAt, durationMs,
 *   stages: { [stageName]: StageRecord },
 *   errors: [{ stage, message }],
 *   response: BrainResponse | null,
 * }
 *
 * StageRecord shape:
 * { name, status, startedAt, completedAt, durationMs, result, error }
 */

import { WORKFLOW_SCHEMA_VERSION, WORKFLOW_STATUS, STAGE_STATUS } from './workflow-types.js'

// ── Workflow construction ─────────────────────────────────────────────────────

export function createWorkflow(workflowId, trigger = {}) {
  return {
    workflowId,
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    trigger,
    status:        WORKFLOW_STATUS.RUNNING,
    startedAt:     new Date().toISOString(),
    completedAt:   null,
    durationMs:    null,
    stages:        {},
    errors:        [],
    response:      null,
  }
}

export function finalizeWorkflow(workflow, startMs, response) {
  const durationMs = Date.now() - startMs
  return {
    ...workflow,
    status:      WORKFLOW_STATUS.COMPLETED,
    completedAt: new Date().toISOString(),
    durationMs,
    response,
  }
}

// ── Stage record construction ─────────────────────────────────────────────────

export function createStageRecord(stageName) {
  return {
    name:        stageName,
    status:      STAGE_STATUS.RUNNING,
    startedAt:   new Date().toISOString(),
    completedAt: null,
    durationMs:  null,
    result:      null,
    error:       null,
  }
}

export function completeStageRecord(stageRecord, result, startMs) {
  const durationMs = Date.now() - startMs
  return {
    ...stageRecord,
    status:      STAGE_STATUS.COMPLETED,
    completedAt: new Date().toISOString(),
    durationMs,
    result:      result ?? null,
    error:       null,
  }
}

export function failStageRecord(stageRecord, error, startMs) {
  const durationMs = Date.now() - startMs
  return {
    ...stageRecord,
    status:      STAGE_STATUS.FAILED,
    completedAt: new Date().toISOString(),
    durationMs,
    result:      null,
    error:       typeof error === 'string' ? error : (error?.message ?? String(error)),
  }
}

// ── Accessors ─────────────────────────────────────────────────────────────────

export function stageSucceeded(workflow, stageName) {
  return workflow.stages[stageName]?.status === STAGE_STATUS.COMPLETED
}

export function stageFailed(workflow, stageName) {
  return workflow.stages[stageName]?.status === STAGE_STATUS.FAILED
}

export function getStageResult(workflow, stageName) {
  return workflow.stages[stageName]?.result ?? null
}

export function getStageSummary(workflow) {
  const stages = Object.values(workflow.stages)
  return {
    total:     stages.length,
    completed: stages.filter(s => s.status === STAGE_STATUS.COMPLETED).length,
    failed:    stages.filter(s => s.status === STAGE_STATUS.FAILED).length,
    skipped:   stages.filter(s => s.status === STAGE_STATUS.SKIPPED).length,
  }
}
