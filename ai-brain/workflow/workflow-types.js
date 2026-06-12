/**
 * AI Brain — Workflow Types (M13)
 *
 * Constants shared by workflow-engine, workflow-state, workflow-events, and tests.
 */

export const WORKFLOW_SCHEMA_VERSION = '1.0'

/** Pipeline stage names, in canonical execution order. */
export const STAGE = Object.freeze({
  CONTEXT:     'context',
  OBSERVATION: 'observation',
  REASONING:   'reasoning',
  CALIBRATION: 'calibration',
  POLICY:      'policy',
  PLANNING:    'planning',
  EXPLANATION: 'explanation',
  TIMELINE:    'timeline',
  RESPONSE:    'response',
})

/** Ordered list of stage names — used for iteration and reporting. */
export const STAGE_ORDER = [
  STAGE.CONTEXT,
  STAGE.OBSERVATION,
  STAGE.REASONING,
  STAGE.CALIBRATION,
  STAGE.POLICY,
  STAGE.PLANNING,
  STAGE.EXPLANATION,
  STAGE.TIMELINE,
  STAGE.RESPONSE,
]

export const WORKFLOW_STATUS = Object.freeze({
  RUNNING:   'running',
  COMPLETED: 'completed',
  FAILED:    'failed',
})

export const STAGE_STATUS = Object.freeze({
  PENDING:   'pending',
  RUNNING:   'running',
  COMPLETED: 'completed',
  FAILED:    'failed',
  SKIPPED:   'skipped',
})
