/**
 * Execution Planner
 *
 * OrchestratorRequest + registry → ExecutionPlan
 *
 * Resolves which engines to run, in what order, and which can run in parallel.
 * Uses topological sort (Kahn's algorithm) over the engine dependency graph.
 *
 * An engine B depends on engine A if:
 *   A.outputs intersects B.requiredInputs ∪ B.optionalInputs
 *   AND both A and B are in the required set for this request.
 *
 * ExecutionPlan:
 * {
 *   planId:        string
 *   requestId:     string
 *   phases:        Phase[]
 *   engineCount:   number
 *   estimatedMs:   number
 *   warnings:      string[]
 * }
 *
 * Phase: { phaseIndex, engines: EnginePlanEntry[], canRunInParallel }
 *
 * EnginePlanEntry: { name, priority, estimatedMs, requiredInputs, optionalInputs, outputs }
 */

import { getEngine, getAllEngines } from './engine-registry.js';

// Per-engine estimated execution times (ms) for planning display
const ENGINE_EST_MS = {
  'memory-engine':       400,
  'coaching-engine':     2500,
  'player-development':  2000,
  'rugby-knowledge':     1000,
  'discovery-agent':     1500,
  'market-intel':        1500,
  'lead-personalisation': 1000,
  'ai-copilot':          1500,
  'workflow-engine':     3000,
  'club-intelligence':   4000,
};

// ── Dependency graph ──────────────────────────────────────────────────────────

function buildDependencyGraph(engineNames) {
  // For each engine pair (A, B): A → B means A must run before B
  // (A.outputs ∩ B.requiredInputs+optionalInputs is non-empty)
  const deps = new Map(engineNames.map(n => [n, new Set()]));

  for (const nameB of engineNames) {
    const b = getEngine(nameB);
    if (!b) continue;
    const bNeeds = new Set([...b.requiredInputs, ...b.optionalInputs]);

    for (const nameA of engineNames) {
      if (nameA === nameB) continue;
      const a = getEngine(nameA);
      if (!a) continue;

      // If A produces something B needs, B depends on A
      const overlap = a.outputs.some(o => bNeeds.has(o));
      if (overlap) deps.get(nameB).add(nameA);
    }
  }

  return deps;
}

// ── Kahn's topological sort → phases ─────────────────────────────────────────

function topoPhases(engineNames, deps) {
  const inDegree = new Map(engineNames.map(n => [n, 0]));
  const adjFwd   = new Map(engineNames.map(n => [n, []]));

  for (const [node, predecessors] of deps) {
    inDegree.set(node, predecessors.size);
    for (const pred of predecessors) {
      adjFwd.get(pred).push(node);
    }
  }

  const phases = [];
  const done   = new Set();
  let frontier = engineNames.filter(n => inDegree.get(n) === 0);

  while (frontier.length > 0) {
    // Sort by priority (higher first) within each phase
    frontier.sort((a, b) => {
      const pa = getEngine(a)?.priority ?? 50;
      const pb = getEngine(b)?.priority ?? 50;
      return pb - pa;
    });

    phases.push(frontier.slice());
    const next = [];

    for (const n of frontier) {
      done.add(n);
      for (const succ of adjFwd.get(n) ?? []) {
        const newDeg = inDegree.get(succ) - 1;
        inDegree.set(succ, newDeg);
        if (newDeg === 0 && !done.has(succ)) next.push(succ);
      }
    }
    frontier = next;
  }

  if (done.size < engineNames.length) {
    const cycle = engineNames.filter(n => !done.has(n));
    throw new Error(`Circular engine dependency: ${cycle.join(' ↔ ')}`);
  }

  return phases;
}

// ── Public API ────────────────────────────────────────────────────────────────

let _planSeq = 0;

/**
 * Build an ExecutionPlan from an OrchestratorRequest.
 */
export function planExecution(request) {
  const { requestId, requiredEngines } = request;
  const warnings = [];

  // Filter to only registered engines
  const engineNames = requiredEngines.filter(name => {
    const e = getEngine(name);
    if (!e) warnings.push(`Engine '${name}' not registered — skipped`);
    return !!e;
  });

  if (engineNames.length === 0) {
    throw new Error('No registered engines available for this request');
  }

  // Build dependency graph and topological sort
  const deps = buildDependencyGraph(engineNames);
  const rawPhases = topoPhases(engineNames, deps);

  // Build phase objects
  const phases = rawPhases.map((names, i) => {
    const entries = names.map(name => {
      const eng = getEngine(name);
      return {
        name:           name,
        priority:       eng.priority        ?? 50,
        estimatedMs:    ENGINE_EST_MS[name] ?? 1000,
        requiredInputs: eng.requiredInputs  ?? [],
        optionalInputs: eng.optionalInputs  ?? [],
        outputs:        eng.outputs         ?? [],
        capabilities:   eng.capabilities    ?? [],
      };
    });

    return {
      phaseIndex:       i,
      engines:          entries,
      canRunInParallel: entries.length > 1,
    };
  });

  const estimatedMs = phases.reduce(
    (sum, phase) => sum + Math.max(...phase.engines.map(e => e.estimatedMs)),
    0
  );

  // Warn about missing required inputs
  for (const name of engineNames) {
    const eng = getEngine(name);
    for (const req of (eng?.requiredInputs ?? [])) {
      const producer = engineNames.find(n => getEngine(n)?.outputs?.includes(req));
      if (!producer) {
        warnings.push(`Engine '${name}' requires '${req}' but no selected engine produces it`);
      }
    }
  }

  return {
    planId:      `orch_plan_${Date.now()}_${(++_planSeq).toString(36)}`,
    requestId,
    phases,
    engineCount: engineNames.length,
    estimatedMs,
    warnings,
  };
}

/**
 * Human-readable plan summary.
 */
export function formatPlan(plan) {
  const lines = [
    `Orchestration Plan: ${plan.planId}`,
    `  Engines:    ${plan.engineCount}`,
    `  Phases:     ${plan.phases.length}`,
    `  Est. time:  ~${Math.round(plan.estimatedMs / 1000)}s`,
    '',
  ];

  for (const phase of plan.phases) {
    const label = phase.canRunInParallel ? `[Phase ${phase.phaseIndex + 1} — ${phase.engines.length} engines]` : `[Phase ${phase.phaseIndex + 1}]`;
    lines.push(`  ${label}`);
    for (const e of phase.engines) {
      const out = e.outputs.length ? ` → ${e.outputs.join(', ')}` : '';
      lines.push(`    • ${e.name.padEnd(28)} ~${e.estimatedMs}ms${out}`);
    }
  }

  if (plan.warnings.length) {
    lines.push('', '  Warnings:');
    plan.warnings.forEach(w => lines.push(`    ⚠ ${w}`));
  }

  return lines.join('\n');
}
