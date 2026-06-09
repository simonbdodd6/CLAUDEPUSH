/**
 * Workflow Runner — executes an ExecutionPlan step-by-step
 *
 * Execution model:
 * - Steps within a wave execute sequentially (safer for first version; parallel opt-in via options)
 * - Each step receives params, the shared context, and all previous step outputs
 * - On failure: non-critical steps are skipped; critical steps abort the workflow
 * - On critical failure: attempt rollback of all reversible completed steps
 * - All state transitions are logged to workflow-history
 *
 * RunResult:
 * {
 *   runId:          string
 *   planId:         string
 *   success:        boolean
 *   outcome:        'completed' | 'failed' | 'partial' | 'dry_run'
 *   stepResults:    { stepId → StepResult }
 *   stepOutputs:    { actionId → ActionResult.data }   — for step-to-step wiring
 *   rolledBack:     string[]   — stepIds that were undone
 *   summary:        string
 *   durationMs:     number
 *   warnings:       string[]
 * }
 *
 * StepResult:
 * {
 *   stepId, actionId, label, success, skipped,
 *   data, summary, error, durationMs, rolledBack
 * }
 */

import { getAction }  from './workflow-actions.js';
import { logEvent, EVENT_TYPES } from './workflow-history.js';

let _runSeq = 0;

function genRunId() {
  return `wfrun_${Date.now()}_${(++_runSeq).toString(36)}`;
}

// ── Step executor ─────────────────────────────────────────────────────────────

async function executeStep(step, context, stepOutputs, runId, dryRun) {
  const action = getAction(step.actionId);
  if (!action) {
    return {
      stepId:   step.stepId,
      actionId: step.actionId,
      label:    step.label,
      success:  false,
      skipped:  false,
      data:     null,
      summary:  `Action '${step.actionId}' not found`,
      error:    `Action '${step.actionId}' not registered`,
      durationMs: 0,
      rolledBack: false,
    };
  }

  if (dryRun) {
    return {
      stepId:   step.stepId,
      actionId: step.actionId,
      label:    step.label,
      success:  true,
      skipped:  false,
      data:     { _dryRun: true },
      summary:  `[dry-run] ${action.name}`,
      error:    null,
      durationMs: 0,
      rolledBack: false,
    };
  }

  logEvent(EVENT_TYPES.STEP_STARTED, null, runId, {
    stepId:   step.stepId,
    actionId: step.actionId,
    data:     { label: step.label },
  });

  const t0 = Date.now();
  let result;
  try {
    result = await action.execute(step.params ?? {}, context, stepOutputs);
  } catch (err) {
    result = { success: false, data: null, summary: err.message, error: err.message };
  }

  const durationMs = Date.now() - t0;

  if (result.success) {
    logEvent(EVENT_TYPES.STEP_COMPLETED, null, runId, {
      stepId: step.stepId, actionId: step.actionId, durationMs,
      data: { summary: result.summary },
    });
  } else {
    logEvent(EVENT_TYPES.STEP_FAILED, null, runId, {
      stepId: step.stepId, actionId: step.actionId, durationMs,
      error: result.error ?? result.summary,
    });
  }

  return {
    stepId:    step.stepId,
    actionId:  step.actionId,
    label:     step.label,
    success:   result.success,
    skipped:   false,
    data:      result.data,
    summary:   result.summary,
    error:     result.error ?? null,
    durationMs,
    rolledBack: false,
    undoKey:   result.undoKey ?? null,
  };
}

// ── Rollback ──────────────────────────────────────────────────────────────────

async function rollbackStep(step, context, stepResult, runId) {
  const action = getAction(step.actionId);
  if (!action?.isReversible || !action?.undo) return false;

  logEvent(EVENT_TYPES.UNDO_STARTED, null, runId, { stepId: step.stepId });
  try {
    await action.undo(step.params ?? {}, context, stepResult);
    logEvent(EVENT_TYPES.UNDO_COMPLETED, null, runId, { stepId: step.stepId });
    return true;
  } catch (err) {
    logEvent(EVENT_TYPES.UNDO_FAILED, null, runId, { stepId: step.stepId, error: err.message });
    return false;
  }
}

// ── Main runner ───────────────────────────────────────────────────────────────

/**
 * Execute an ExecutionPlan.
 *
 * @param {ExecutionPlan}  plan
 * @param {{ dryRun?, onStepComplete?, onStepFail?, contextOverride? }} options
 * @returns {Promise<RunResult>}
 */
export async function runWorkflow(plan, options = {}) {
  const { dryRun = false, onStepComplete, onStepFail, contextOverride } = options;

  if (!plan.approved && !dryRun) {
    throw new Error('Plan must be approved before running. Set plan.approved = true');
  }

  const runId      = genRunId();
  const context    = { ...plan.context, ...contextOverride };
  const stepOutputs = {};       // actionId → result.data (for step chaining)
  const stepResults = {};
  const rolledBack  = [];
  const warnings    = [...(plan.warnings ?? [])];
  const t0          = Date.now();

  const workflowId = plan.workflowDefId ?? plan.planId;

  logEvent(EVENT_TYPES.WORKFLOW_STARTED, workflowId, runId, {
    data: { name: plan.name, totalSteps: plan.totalSteps, dryRun },
  });

  let aborted = false;
  let abortReason = '';

  outerLoop:
  for (const wave of plan.waves) {
    for (const step of wave.steps) {
      if (aborted) {
        // Mark remaining steps as skipped
        stepResults[step.stepId] = {
          stepId: step.stepId, actionId: step.actionId, label: step.label,
          success: false, skipped: true, data: null,
          summary: `Skipped — workflow aborted: ${abortReason}`,
          error: null, durationMs: 0, rolledBack: false,
        };
        logEvent(EVENT_TYPES.STEP_SKIPPED, workflowId, runId, {
          stepId: step.stepId, data: { reason: abortReason },
        });
        continue;
      }

      // Check all dependencies completed successfully
      const unmetDeps = (step.depends ?? []).filter(depId => {
        const depResult = stepResults[depId];
        return !depResult || (!depResult.success && !depResult.skipped);
      });

      if (unmetDeps.length && step.critical !== false) {
        const reason = `Unmet dependencies: ${unmetDeps.join(', ')}`;
        stepResults[step.stepId] = {
          stepId: step.stepId, actionId: step.actionId, label: step.label,
          success: false, skipped: true, data: null,
          summary: `Skipped — ${reason}`,
          error: null, durationMs: 0, rolledBack: false,
        };
        logEvent(EVENT_TYPES.STEP_SKIPPED, workflowId, runId, {
          stepId: step.stepId, data: { reason },
        });
        if (!step.optional) {
          aborted = true;
          abortReason = reason;
        }
        continue;
      }

      const result = await executeStep(step, context, stepOutputs, runId, dryRun);
      stepResults[step.stepId] = result;

      if (result.success) {
        // Wire outputs for downstream steps
        stepOutputs[step.actionId] = result.data;
        onStepComplete?.(step, result);
      } else {
        onStepFail?.(step, result);

        if (step.critical !== false && !step.optional) {
          // Critical failure — abort and rollback
          aborted     = true;
          abortReason = result.error ?? result.summary;
          warnings.push(`Critical step failed: ${step.label} — ${abortReason}`);

          // Rollback in reverse order of completion
          const completedStepIds = Object.entries(stepResults)
            .filter(([, r]) => r.success && !r.rolledBack)
            .map(([id]) => id)
            .reverse();

          for (const completedId of completedStepIds) {
            const completedStep = plan.waves.flatMap(w => w.steps).find(s => s.stepId === completedId);
            if (!completedStep) continue;
            const rolled = await rollbackStep(completedStep, context, stepResults[completedId], runId);
            if (rolled) {
              stepResults[completedId].rolledBack = true;
              rolledBack.push(completedId);
            }
          }

          logEvent(EVENT_TYPES.WORKFLOW_ROLLED_BACK, workflowId, runId, {
            data: { rolledBackSteps: rolledBack, reason: abortReason },
          });
        } else {
          warnings.push(`Optional step skipped: ${step.label}`);
        }
      }
    }
  }

  const durationMs = Date.now() - t0;
  const successCount = Object.values(stepResults).filter(r => r.success).length;
  const failCount    = Object.values(stepResults).filter(r => !r.success && !r.skipped).length;
  const skipCount    = Object.values(stepResults).filter(r => r.skipped).length;

  let outcome;
  if (dryRun) {
    outcome = 'dry_run';
  } else if (aborted) {
    outcome = rolledBack.length ? 'failed' : 'failed';
  } else if (failCount > 0) {
    outcome = 'partial';
  } else {
    outcome = 'completed';
  }

  const success = outcome === 'completed' || outcome === 'dry_run';

  const summary = dryRun
    ? `Dry run: ${plan.totalSteps} steps validated`
    : `${outcome}: ${successCount} completed, ${failCount} failed, ${skipCount} skipped in ${durationMs}ms`;

  logEvent(success ? EVENT_TYPES.WORKFLOW_COMPLETED : EVENT_TYPES.WORKFLOW_FAILED, workflowId, runId, {
    durationMs,
    data: { outcome, successCount, failCount, skipCount, summary },
    error: aborted ? abortReason : undefined,
  });

  return {
    runId,
    planId:      plan.planId,
    workflowId,
    success,
    outcome,
    stepResults,
    stepOutputs,
    rolledBack,
    summary,
    durationMs,
    warnings,
  };
}

/**
 * Convenience: approve and run a plan in one call.
 */
export async function approveAndRun(plan, options = {}) {
  plan.approved = true;
  return runWorkflow(plan, options);
}

/**
 * Run a plan in dry-run mode (validates all steps, no side effects).
 */
export async function dryRun(plan, options = {}) {
  return runWorkflow(plan, { ...options, dryRun: true });
}

/**
 * Format a RunResult as a human-readable summary.
 */
export function formatRunResult(result) {
  const lines = [
    `Run: ${result.runId}`,
    `Outcome: ${result.outcome.toUpperCase()} — ${result.summary}`,
    '',
    'Steps:',
  ];

  for (const [id, step] of Object.entries(result.stepResults)) {
    const icon     = step.success ? '✓' : step.skipped ? '○' : '✗';
    const duration = step.durationMs ? ` (${step.durationMs}ms)` : '';
    const undo     = step.rolledBack ? ' [rolled back]' : '';
    const err      = step.error ? ` — ${step.error}` : '';
    lines.push(`  ${icon} ${step.label}${duration}${undo}${err}`);
  }

  if (result.warnings.length) {
    lines.push('', 'Warnings:');
    result.warnings.forEach(w => lines.push(`  ⚠ ${w}`));
  }

  return lines.join('\n');
}
