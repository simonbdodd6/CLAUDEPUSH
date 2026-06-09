/**
 * Workflow Planner — WorkflowDefinition → ExecutionPlan
 *
 * Responsibilities:
 * 1. Validate all step action IDs exist
 * 2. Resolve step dependencies (topological sort → execution waves)
 * 3. Identify non-reversible checkpoints
 * 4. Estimate total execution time
 * 5. Flag required context that's missing
 *
 * ExecutionPlan:
 * {
 *   planId:          string
 *   workflowDefId:   string
 *   name:            string
 *   waves:           Wave[]        — parallel execution groups in order
 *   totalSteps:      number
 *   criticalPath:    string[]      — stepIds on the critical path
 *   estimatedMs:     number
 *   isReversibleTo:  string|null   — stepId of last reversible checkpoint
 *   warnings:        string[]
 *   missingContext:  string[]      — required context keys absent
 *   approved:        boolean       — set to true before running
 * }
 *
 * Wave: { waveIndex, steps: PlanStep[], canRunInParallel }
 *
 * PlanStep: { stepId, actionId, label, params, depends, critical, optional,
 *             isReversible, estimatedMs }
 */

import { getAction, getAllActions } from './workflow-actions.js';

// ── Topological sort ──────────────────────────────────────────────────────────

/**
 * Kahn's algorithm — returns ordered arrays of step groups (waves).
 * Steps in the same wave have no interdependencies and can run in parallel.
 */
function topoWaves(steps) {
  const stepMap    = new Map(steps.map(s => [s.stepId, s]));
  const inDegree   = new Map(steps.map(s => [s.stepId, 0]));
  const adjReverse = new Map(steps.map(s => [s.stepId, []]));

  for (const step of steps) {
    for (const dep of (step.depends ?? [])) {
      if (!inDegree.has(dep)) continue;
      inDegree.set(step.stepId, (inDegree.get(step.stepId) ?? 0) + 1);
      adjReverse.get(dep).push(step.stepId);
    }
  }

  const waves  = [];
  const done   = new Set();
  let frontier = steps.filter(s => inDegree.get(s.stepId) === 0).map(s => s.stepId);

  while (frontier.length > 0) {
    waves.push(frontier.slice());
    const nextFrontier = [];

    for (const id of frontier) {
      done.add(id);
      for (const succ of adjReverse.get(id) ?? []) {
        const newDegree = inDegree.get(succ) - 1;
        inDegree.set(succ, newDegree);
        if (newDegree === 0 && !done.has(succ)) {
          nextFrontier.push(succ);
        }
      }
    }
    frontier = nextFrontier;
  }

  // Detect cycles
  if (done.size < steps.length) {
    const cycle = steps.filter(s => !done.has(s.stepId)).map(s => s.stepId);
    throw new Error(`Circular dependency detected: ${cycle.join(' → ')}`);
  }

  return waves.map(ids => ids.map(id => stepMap.get(id)));
}

// ── Critical path ─────────────────────────────────────────────────────────────

function computeCriticalPath(steps) {
  return steps
    .filter(s => s.critical !== false)
    .map(s => s.stepId);
}

// ── Reversibility checkpoint ──────────────────────────────────────────────────

function findLastReversible(steps) {
  // Find the last critical+reversible step before any non-reversible step
  let lastRev = null;
  for (const step of steps) {
    const action = getAction(step.actionId);
    if (action?.isReversible) lastRev = step.stepId;
    // Once we hit a non-reversible critical step, note it but keep scanning
  }
  return lastRev;
}

// ── Missing context detection ─────────────────────────────────────────────────

function detectMissingContext(steps, context) {
  const missing = new Set();
  for (const step of steps) {
    const action = getAction(step.actionId);
    if (!action?.requiredContext) continue;
    for (const key of action.requiredContext) {
      if (!context?.[key] && !context?.entities?.[key]) {
        missing.add(key);
      }
    }
  }
  return [...missing];
}

// ── Public API ────────────────────────────────────────────────────────────────

let _planSeq = 0;

/**
 * Create an ExecutionPlan from a WorkflowDefinition.
 * Throws if the definition is invalid or has circular dependencies.
 */
export function planWorkflow(workflowDef) {
  if (!workflowDef?.steps?.length) {
    throw new Error('WorkflowDefinition has no steps');
  }

  const warnings = [...(workflowDef.warnings ?? [])];
  const steps    = workflowDef.steps;

  // Enrich steps with action metadata
  const enrichedSteps = steps.map(step => {
    const action = getAction(step.actionId);
    if (!action) {
      warnings.push(`Action '${step.actionId}' missing from registry — will fail at runtime`);
    }
    return {
      ...step,
      isReversible: action?.isReversible ?? false,
      estimatedMs:  action?.estimatedMs  ?? 500,
      category:     action?.category     ?? 'unknown',
    };
  });

  // Topological sort → waves
  let waves;
  try {
    const rawWaves = topoWaves(enrichedSteps);
    waves = rawWaves.map((waveSteps, i) => ({
      waveIndex:        i,
      steps:            waveSteps,
      canRunInParallel: waveSteps.length > 1,
    }));
  } catch (err) {
    throw new Error(`Planning failed: ${err.message}`);
  }

  const criticalPath   = computeCriticalPath(enrichedSteps);
  const isReversibleTo = findLastReversible(enrichedSteps);
  const missingContext = detectMissingContext(enrichedSteps, workflowDef.context);

  // Estimate total time (sequential worst-case for now)
  const estimatedMs = enrichedSteps.reduce((sum, s) => sum + (s.estimatedMs ?? 500), 0);

  // Check non-reversible actions — warn but don't block
  const irreversible = enrichedSteps.filter(s => !s.isReversible && !s.optional);
  if (irreversible.length) {
    warnings.push(
      `${irreversible.length} non-reversible step(s): ${irreversible.map(s => s.label).join(', ')}`
    );
  }

  if (missingContext.length) {
    warnings.push(`Missing context: ${missingContext.join(', ')} — steps may fall back to defaults`);
  }

  return {
    planId:         `wfplan_${Date.now()}_${(++_planSeq).toString(36)}`,
    workflowDefId:  workflowDef.id,
    name:           workflowDef.name,
    description:    workflowDef.description,
    intent:         workflowDef.intent,
    context:        workflowDef.context ?? {},
    waves,
    totalSteps:     enrichedSteps.length,
    criticalPath,
    estimatedMs,
    isReversibleTo,
    warnings,
    missingContext,
    approved:       false,     // caller must set true before running
  };
}

/**
 * Returns a human-readable plan summary.
 */
export function formatPlan(plan) {
  const lines = [
    `Workflow Plan: ${plan.name}`,
    `  ID:          ${plan.planId}`,
    `  Steps:       ${plan.totalSteps}`,
    `  Est. time:   ~${Math.round(plan.estimatedMs / 1000)}s`,
    `  Reversible:  ${plan.isReversibleTo ? `up to step ${plan.isReversibleTo}` : 'no'}`,
    '',
  ];

  for (const wave of plan.waves) {
    const label = wave.canRunInParallel ? `[Wave ${wave.waveIndex + 1} — parallel]` : `[Wave ${wave.waveIndex + 1}]`;
    lines.push(`  ${label}`);
    for (const step of wave.steps) {
      const rev = step.isReversible ? ' ↩' : '';
      const opt = step.optional ? ' (optional)' : '';
      lines.push(`    ${step.stepId.padEnd(36)} ${step.label}${rev}${opt}`);
    }
  }

  if (plan.warnings.length) {
    lines.push('', '  Warnings:');
    plan.warnings.forEach(w => lines.push(`    ⚠ ${w}`));
  }

  return lines.join('\n');
}

/**
 * Quick validation — returns { valid, errors[] }.
 */
export function validatePlan(plan) {
  const errors = [];
  if (!plan?.planId)    errors.push('Plan has no planId');
  if (!plan?.waves?.length) errors.push('Plan has no execution waves');
  for (const wave of (plan?.waves ?? [])) {
    for (const step of (wave.steps ?? [])) {
      if (!getAction(step.actionId)) errors.push(`Action not found: ${step.actionId}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
