/**
 * Workflow Engine — Public API
 *
 * The execution layer for the Coach's Eye AI Copilot.
 * Chains multiple actions into auditable, reversible workflows.
 *
 * Primary usage:
 *   const result = await executeWorkflow('Build next Tuesday\'s U16 training', context);
 *
 * Full pipeline:
 *   const def    = parseWorkflow(text, context);
 *   const plan   = planWorkflow(def);
 *   const result = await approveAndRun(plan);
 */

export { parseWorkflow, listTemplates }    from './workflow-parser.js';
export { planWorkflow, formatPlan, validatePlan } from './workflow-planner.js';
export { runWorkflow, approveAndRun, dryRun, formatRunResult } from './workflow-runner.js';
export { logEvent, getRunHistory, getWorkflowHistory, getRecentHistory,
         formatRunTimeline, getRunSummary, loadPersistedHistory,
         historySize, EVENT_TYPES }        from './workflow-history.js';
export { enqueue, dequeue, cancel, peek, listPending, listAll,
         processDue, queueSize, getEntry, gc, markDone } from './workflow-queue.js';
export { getAction, getAllActions, listActions, hasAction } from './workflow-actions.js';

// ── High-level convenience API ────────────────────────────────────────────────

import { parseWorkflow }   from './workflow-parser.js';
import { planWorkflow }    from './workflow-planner.js';
import { approveAndRun, dryRun } from './workflow-runner.js';

/**
 * Full pipeline: parse → plan → execute.
 * Returns { plan, result }.
 *
 * @param {string} text           — natural language workflow request
 * @param {object} context        — { entities, player, team, allPlayers, ... }
 * @param {{ preview?, dryRun? }} options
 */
export async function executeWorkflow(text, context = {}, options = {}) {
  const def = parseWorkflow(text, context);
  if (!def) {
    return {
      plan:    null,
      result:  null,
      error:   `Could not parse a workflow from: "${text.slice(0, 80)}"`,
      parsed:  false,
    };
  }

  const plan = planWorkflow(def);

  if (options.preview) {
    return { plan, result: null, parsed: true, preview: true };
  }

  const result = options.dryRun
    ? await dryRun(plan)
    : await approveAndRun(plan, { contextOverride: context });

  return { plan, result, parsed: true, preview: false };
}

/**
 * Describe what a workflow would do without executing it.
 * Safe to call from the Copilot response builder.
 */
export function previewWorkflow(text, context = {}) {
  const def = parseWorkflow(text, context);
  if (!def) return null;

  try {
    const plan = planWorkflow(def);
    return {
      name:        plan.name,
      description: plan.description,
      stepCount:   plan.totalSteps,
      estimatedMs: plan.estimatedMs,
      steps:       plan.waves.flatMap(w => w.steps).map(s => ({
        label:       s.label,
        isReversible: s.isReversible,
        optional:    s.optional ?? false,
        category:    s.category,
      })),
      warnings:    plan.warnings,
      confidence:  def.confidence,
    };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * List all available actions (for the Copilot to describe capabilities).
 */
export { listActions as describeActions } from './workflow-actions.js';
