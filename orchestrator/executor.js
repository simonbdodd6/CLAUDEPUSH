/**
 * Orchestrator Executor
 *
 * Runs an ExecutionPlan phase by phase.
 * - Each engine receives the current context-bus snapshot + request metadata
 * - Each engine's contextWrites are committed to the bus after success
 * - Failed steps are retried (exponential backoff) before being marked failed
 * - Critical required-input failures skip dependent downstream engines
 * - Progress events emitted after every engine start/complete/fail/retry
 *
 * OrchestrationResult:
 * {
 *   orchestrationId: string
 *   planId:          string
 *   success:         boolean
 *   outcome:         'completed' | 'partial' | 'failed' | 'dry_run'
 *   phaseResults:    PhaseResult[]
 *   engineResults:   { engineName → EngineRunResult }
 *   durationMs:      number
 *   summary:         string
 *   warnings:        string[]
 * }
 *
 * EngineRunResult extends EngineResult with: attempts, durationMs, skipped
 */

import { getEngine }  from './engine-registry.js';

const DEFAULT_MAX_RETRIES  = 2;
const DEFAULT_BASE_DELAY   = 400;   // ms — multiplied by attempt number

let _orchSeq = 0;
function genId() { return `orch_run_${Date.now()}_${(++_orchSeq).toString(36)}`; }

// ── Retry wrapper ─────────────────────────────────────────────────────────────

async function withRetry(fn, maxRetries, baseDelayMs, onRetry) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return { result: await fn(attempt), attempts: attempt };
    } catch (err) {
      lastError = err;
      if (attempt <= maxRetries) {
        onRetry?.(attempt, err);
        await new Promise(r => setTimeout(r, baseDelayMs * attempt));
      }
    }
  }
  throw lastError;
}

// ── Single engine execution ───────────────────────────────────────────────────

async function runEngine(engineName, contextBus, request, options, emitter, completedEngines) {
  const descriptor = getEngine(engineName);
  if (!descriptor) {
    return {
      engineName,
      success:  false,
      skipped:  false,
      data:     null,
      contextWrites: {},
      summary:  `Engine '${engineName}' not found in registry`,
      evidence: [],
      warnings: [],
      attempts: 0,
      durationMs: 0,
      error:    'Not registered',
    };
  }

  // Deduplication: skip if this engine already ran successfully in this orchestration
  if (completedEngines.has(engineName)) {
    return {
      engineName,
      success:   true,
      skipped:   true,
      data:      null,
      contextWrites: {},
      summary:   `Skipped — already completed in this orchestration`,
      evidence:  [],
      warnings:  [],
      attempts:  0,
      durationMs: 0,
    };
  }

  // Check required inputs are present on the bus
  const missingRequired = (descriptor.requiredInputs ?? []).filter(k => !contextBus.has(k));
  if (missingRequired.length > 0) {
    return {
      engineName,
      success:  false,
      skipped:  true,
      data:     null,
      contextWrites: {},
      summary:  `Skipped — missing required context: ${missingRequired.join(', ')}`,
      evidence:  [],
      warnings: [`Required input(s) missing: ${missingRequired.join(', ')}`],
      attempts:  0,
      durationMs: 0,
      error:    `Missing: ${missingRequired.join(', ')}`,
    };
  }

  // Build snapshot (read tracking for optional inputs)
  const snap = contextBus.snapshot();
  for (const key of [...(descriptor.requiredInputs ?? []), ...(descriptor.optionalInputs ?? [])]) {
    if (contextBus.has(key)) contextBus.trackRead(key, engineName);
  }

  // Inject request metadata into snapshot
  snap._request = {
    requestId:       request.requestId,
    originalMessage: request.rawMessage,
    entities:        request.entities ?? {},
    options:         request.options  ?? {},
  };

  if (options.dryRun) {
    return {
      engineName,
      success:  true,
      skipped:  false,
      data:     { _dryRun: true },
      contextWrites: {},
      summary:  `[dry-run] ${descriptor.name}`,
      evidence:  [`Would run: ${descriptor.description}`],
      warnings:  [],
      attempts:  1,
      durationMs: 0,
    };
  }

  emitter?.emit('progress', { type: 'engine.started', engineName, timestamp: new Date().toISOString() });

  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelay  = options.retryDelay ?? DEFAULT_BASE_DELAY;
  const t0 = Date.now();

  let rawResult, attempts;

  try {
    const retryResult = await withRetry(
      async (attempt) => {
        return descriptor.execute(snap, { ...options, attempt });
      },
      maxRetries,
      baseDelay,
      (attempt, err) => {
        emitter?.emit('progress', {
          type: 'engine.retrying',
          engineName,
          attempt,
          error: err.message,
          timestamp: new Date().toISOString(),
        });
      }
    );
    rawResult = retryResult.result;
    attempts  = retryResult.attempts;
  } catch (err) {
    const durationMs = Date.now() - t0;
    emitter?.emit('progress', {
      type: 'engine.failed', engineName, durationMs,
      error: err.message, timestamp: new Date().toISOString(),
    });
    return {
      engineName,
      success:  false,
      skipped:  false,
      data:     null,
      contextWrites: {},
      summary:  `Failed after ${maxRetries + 1} attempts: ${err.message}`,
      evidence:  [],
      warnings:  [`${engineName} failed: ${err.message}`],
      attempts:  maxRetries + 1,
      durationMs,
      error:    err.message,
    };
  }

  const durationMs = Date.now() - t0;

  // Commit contextWrites to bus
  if (rawResult.success && rawResult.contextWrites) {
    contextBus.setMany(rawResult.contextWrites, engineName);
  }

  const runResult = {
    engineName,
    success:      rawResult.success  ?? false,
    skipped:      false,
    data:         rawResult.data     ?? null,
    contextWrites: rawResult.contextWrites ?? {},
    summary:      rawResult.summary  ?? (rawResult.success ? `${engineName} completed` : `${engineName} failed`),
    evidence:     rawResult.evidence ?? [],
    warnings:     rawResult.warnings ?? [],
    attempts,
    durationMs,
    error:        rawResult.success ? null : (rawResult.error ?? rawResult.summary),
  };

  const eventType = rawResult.success ? 'engine.completed' : 'engine.failed';
  emitter?.emit('progress', {
    type: eventType, engineName, durationMs, attempts,
    summary: runResult.summary, timestamp: new Date().toISOString(),
  });

  return runResult;
}

// ── Main executor ─────────────────────────────────────────────────────────────

/**
 * Execute an orchestration plan.
 *
 * @param {ExecutionPlan}  plan
 * @param {ContextBus}     contextBus
 * @param {OrchestratorRequest} request
 * @param {object}         options  — { dryRun?, maxRetries?, retryDelay?, parallel? }
 * @param {EventEmitter?}  emitter  — optional progress event target
 */
export async function execute(plan, contextBus, request, options = {}, emitter = null) {
  const orchestrationId = genId();
  const t0              = Date.now();
  const phaseResults    = [];
  const engineResults   = {};
  const warnings        = [...(plan.warnings ?? [])];
  const completedEngines = new Set();

  emitter?.emit('progress', {
    type: 'orchestration.started',
    orchestrationId,
    planId:      plan.planId,
    engineCount: plan.engineCount,
    phases:      plan.phases.length,
    timestamp:   new Date().toISOString(),
  });

  for (const phase of plan.phases) {
    const phaseT0      = Date.now();
    const phaseResults_ = [];

    // Decide: parallel or sequential within phase
    const runParallel = options.parallel !== false && phase.canRunInParallel;

    let engineRunResults;
    if (runParallel) {
      // Parallel: run all engines in this phase concurrently
      engineRunResults = await Promise.all(
        phase.engines.map(entry =>
          runEngine(entry.name, contextBus, request, options, emitter, completedEngines)
        )
      );
      // Commit writes sequentially after parallel run
      for (const r of engineRunResults) {
        if (r.success && r.contextWrites && Object.keys(r.contextWrites).length > 0) {
          contextBus.setMany(r.contextWrites, r.engineName);
        }
        if (r.success) completedEngines.add(r.engineName);
        engineResults[r.engineName] = r;
        phaseResults_.push(r);
      }
    } else {
      // Sequential: run engines one by one so each can use previous outputs
      for (const entry of phase.engines) {
        const r = await runEngine(entry.name, contextBus, request, options, emitter, completedEngines);
        if (r.success) completedEngines.add(r.engineName);
        engineResults[r.engineName] = r;
        phaseResults_.push(r);
        warnings.push(...r.warnings);
      }
      engineRunResults = phaseResults_;
    }

    const phaseSuccess = phaseResults_.every(r => r.success || r.skipped);
    phaseResults.push({
      phaseIndex:  phase.phaseIndex,
      engines:     phase.engines.map(e => e.name),
      results:     phaseResults_,
      success:     phaseSuccess,
      durationMs:  Date.now() - phaseT0,
    });
  }

  const durationMs    = Date.now() - t0;
  const successCount  = Object.values(engineResults).filter(r => r.success && !r.skipped).length;
  const failCount     = Object.values(engineResults).filter(r => !r.success && !r.skipped).length;
  const skipCount     = Object.values(engineResults).filter(r => r.skipped).length;

  let outcome;
  if (options.dryRun)        outcome = 'dry_run';
  else if (failCount === 0)  outcome = 'completed';
  else if (successCount > 0) outcome = 'partial';
  else                       outcome = 'failed';

  const success = outcome === 'completed' || outcome === 'dry_run' || outcome === 'partial';

  const summary = options.dryRun
    ? `Dry run: ${plan.engineCount} engines validated`
    : `${outcome}: ${successCount} succeeded, ${failCount} failed, ${skipCount} skipped in ${durationMs}ms`;

  emitter?.emit('progress', {
    type: 'orchestration.completed',
    orchestrationId,
    outcome, success, durationMs, successCount, failCount, skipCount,
    summary, timestamp: new Date().toISOString(),
  });

  return {
    orchestrationId,
    planId:       plan.planId,
    requestId:    request.requestId,
    success,
    outcome,
    phaseResults,
    engineResults,
    durationMs,
    summary,
    warnings: [...new Set(warnings)],
  };
}
