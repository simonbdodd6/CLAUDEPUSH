/**
 * Coach's Eye Orchestrator — Public API
 *
 * The brain above every AI system.
 * Accepts one natural language request and coordinates all engines automatically.
 *
 * Usage:
 *   import { orchestrate } from './orchestrator/index.js';
 *   const result = await orchestrate("Prepare Thursday's U14 training...");
 *
 * With live progress:
 *   import { createOrchestrator } from './orchestrator/index.js';
 *   const orch = createOrchestrator();
 *   orch.on('progress', event => console.log(event));
 *   const result = await orch.run("...");
 */

import { EventEmitter }    from 'events';
import { analyseRequest }  from './request-analyser.js';
import { planExecution, formatPlan } from './execution-planner.js';
import { execute }         from './executor.js';
import { buildReport }     from './report-builder.js';
import { createContextBus } from './context-bus.js';
import { registryStats, listEngines, getAllEngines } from './engine-registry.js';

// Bootstrap all adapters (self-registration)
await import('./adapters/index.js');

// ── Orchestrator class ────────────────────────────────────────────────────────

export class Orchestrator extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20);
  }

  /**
   * Run a full orchestration from a natural language message.
   *
   * @param {string} message      — e.g. "Prepare Thursday's U14 training..."
   * @param {object} options
   *   options.entities           — pre-extracted entities to merge
   *   options.dryRun             — true → validate only, no side effects
   *   options.maxRetries         — per-engine retry limit (default 2)
   *   options.parallel           — false → disable parallel phase execution
   *   options.contextSeed        — additional key/values to pre-load on context bus
   *   options.previewOnly        — true → return plan without executing
   * @returns {Promise<OrchestrationResult>}
   */
  async run(message, options = {}) {
    const t0 = Date.now();

    // 1. Analyse request
    const request = analyseRequest(message, options);

    this.emit('progress', {
      type:      'analysis.complete',
      requestId: request.requestId,
      engines:   request.requiredEngines,
      entities:  request.entities,
      timestamp: new Date().toISOString(),
    });

    if (request.requiredEngines.length === 0) {
      return {
        orchestrationId: `orch_noop_${Date.now()}`,
        planId:          null,
        requestId:       request.requestId,
        success:         false,
        outcome:         'failed',
        phaseResults:    [],
        engineResults:   {},
        durationMs:      Date.now() - t0,
        summary:         'No engines matched for this request',
        warnings:        ['Could not determine required engines — try a more specific request'],
        report:          null,
        request,
      };
    }

    // 2. Plan execution
    let plan;
    try {
      plan = planExecution(request);
    } catch (err) {
      return {
        orchestrationId: `orch_plan_err_${Date.now()}`,
        planId:          null,
        requestId:       request.requestId,
        success:         false,
        outcome:         'failed',
        phaseResults:    [],
        engineResults:   {},
        durationMs:      Date.now() - t0,
        summary:         `Planning failed: ${err.message}`,
        warnings:        [err.message],
        report:          null,
        request,
      };
    }

    this.emit('progress', {
      type:      'plan.ready',
      planId:    plan.planId,
      phases:    plan.phases.length,
      engines:   plan.phases.flatMap(p => p.engines.map(e => e.name)),
      timestamp: new Date().toISOString(),
    });

    if (options.previewOnly) {
      return {
        orchestrationId: null,
        planId:          plan.planId,
        requestId:       request.requestId,
        success:         true,
        outcome:         'preview',
        phaseResults:    [],
        engineResults:   {},
        durationMs:      Date.now() - t0,
        summary:         formatPlan(plan),
        warnings:        plan.warnings ?? [],
        report:          formatPlan(plan),
        plan,
        request,
      };
    }

    // 3. Initialise context bus
    const contextBus = createContextBus({
      ...(options.contextSeed ?? {}),
    });

    // 4. Execute
    const orchResult = await execute(plan, contextBus, request, options, this);

    // 5. Build report
    const report = buildReport(orchResult, contextBus, request);

    return {
      ...orchResult,
      request,
      plan,
      contextSnapshot: contextBus.snapshot(),
      report,
    };
  }

  /**
   * Preview what the orchestrator would do without executing.
   * Returns a formatted plan string.
   */
  preview(message, options = {}) {
    const request = analyseRequest(message, options);
    if (!request.requiredEngines.length) return 'No engines matched.';

    try {
      const plan = planExecution(request);
      return formatPlan(plan);
    } catch (err) {
      return `Planning error: ${err.message}`;
    }
  }

  /** Engine registry stats. */
  stats() { return registryStats(); }
  engines() { return listEngines(); }
}

// ── Singleton + convenience exports ──────────────────────────────────────────

const _singleton = new Orchestrator();

/**
 * Single-call convenience: orchestrate a request and return the result.
 */
export async function orchestrate(message, options = {}) {
  return _singleton.run(message, options);
}

/**
 * Create a fresh Orchestrator instance (useful when you need separate event streams).
 */
export function createOrchestrator() {
  return new Orchestrator();
}

/**
 * Create a console-streaming orchestrator for CLI use.
 */
export function createConsoleOrchestrator(quiet = false) {
  const orch = new Orchestrator();
  if (!quiet) {
    orch.on('progress', event => {
      const ts = new Date().toLocaleTimeString('en-IE', { hour12: false });
      switch (event.type) {
        case 'analysis.complete':
          console.log(`  [${ts}] ▶ Analysis complete — engines: ${event.engines?.join(', ')}`);
          break;
        case 'plan.ready':
          console.log(`  [${ts}] ▶ Plan ready — ${event.phases} phases, engines: ${event.engines?.join(', ')}`);
          break;
        case 'engine.started':
          process.stdout.write(`  [${ts}]   → ${event.engineName}... `);
          break;
        case 'engine.completed':
          console.log(`✓ (${event.durationMs}ms)`);
          break;
        case 'engine.failed':
          console.log(`✗ (${event.error})`);
          break;
        case 'engine.retrying':
          process.stdout.write(`⟳ `);
          break;
        case 'orchestration.completed':
          console.log(`  [${ts}] ◀ Done — ${event.outcome} in ${event.durationMs}ms`);
          break;
      }
    });
  }
  return orch;
}

// Re-export registry helpers
export { registryStats, listEngines, analyseRequest, planExecution, formatPlan };
