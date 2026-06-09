/**
 * Workflow History — append-only audit log
 *
 * Every state transition is logged immediately and immutably.
 * Entries are stored in memory (ring-buffer, capped at MAX_ENTRIES)
 * and written to a JSONL file for persistence between restarts.
 *
 * Log entry shape:
 * {
 *   entryId:     string        — unique log row ID
 *   timestamp:   ISO string
 *   workflowId:  string
 *   runId:       string        — unique per execution attempt
 *   event:       string        — see EVENT_TYPES
 *   stepId?:     string
 *   actionId?:   string
 *   durationMs?: number
 *   data?:       any           — event-specific payload (never mutated after write)
 *   error?:      string
 * }
 */

import { appendFileSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_PATH  = join(__dirname, '..', 'memory-engine', 'data', 'workflow-history.jsonl');
const MAX_MEMORY = 2000;

export const EVENT_TYPES = {
  WORKFLOW_STARTED:   'workflow.started',
  WORKFLOW_COMPLETED: 'workflow.completed',
  WORKFLOW_FAILED:    'workflow.failed',
  WORKFLOW_CANCELLED: 'workflow.cancelled',
  WORKFLOW_ROLLED_BACK: 'workflow.rolled_back',

  STEP_STARTED:   'step.started',
  STEP_COMPLETED: 'step.completed',
  STEP_SKIPPED:   'step.skipped',
  STEP_FAILED:    'step.failed',
  STEP_RETRYING:  'step.retrying',

  UNDO_STARTED:   'undo.started',
  UNDO_COMPLETED: 'undo.completed',
  UNDO_FAILED:    'undo.failed',

  QUEUE_ENQUEUED: 'queue.enqueued',
  QUEUE_DEQUEUED: 'queue.dequeued',
  QUEUE_CANCELLED: 'queue.cancelled',

  INFO: 'info',
};

// ── In-memory ring buffer ─────────────────────────────────────────────────────

const _log = [];
let _seq = 0;

function genId() {
  return `hlog_${Date.now()}_${(++_seq).toString(36)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Append a log entry. Returns the written entry.
 */
export function logEvent(event, workflowId, runId, extra = {}) {
  const entry = Object.freeze({
    entryId:    genId(),
    timestamp:  new Date().toISOString(),
    workflowId: workflowId ?? null,
    runId:      runId ?? null,
    event,
    ...extra,
  });

  _log.push(entry);
  if (_log.length > MAX_MEMORY) _log.shift();

  // Best-effort persistence
  try {
    appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch { /* storage not critical */ }

  return entry;
}

/**
 * All log entries for a specific workflow run, in chronological order.
 */
export function getRunHistory(runId) {
  return _log.filter(e => e.runId === runId);
}

/**
 * All log entries for a workflow ID (all runs).
 */
export function getWorkflowHistory(workflowId) {
  return _log.filter(e => e.workflowId === workflowId);
}

/**
 * Last N entries across all workflows.
 */
export function getRecentHistory(n = 50) {
  return _log.slice(-n);
}

/**
 * Returns a human-readable timeline string for a run.
 */
export function formatRunTimeline(runId) {
  const entries = getRunHistory(runId);
  if (!entries.length) return `No history found for run: ${runId}`;

  const lines = [`Run timeline: ${runId}`, '─'.repeat(50)];
  const t0 = new Date(entries[0].timestamp).getTime();

  for (const e of entries) {
    const t     = new Date(e.timestamp).getTime();
    const delta = `+${(t - t0)}ms`.padStart(8);
    const step  = e.stepId ? ` [${e.stepId}]` : '';
    const err   = e.error  ? ` ⚠ ${e.error}` : '';
    lines.push(`  ${delta}  ${e.event}${step}${err}`);
  }
  return lines.join('\n');
}

/**
 * Summary stats for a completed run.
 */
export function getRunSummary(runId) {
  const entries = getRunHistory(runId);
  if (!entries.length) return null;

  const start   = entries.find(e => e.event === EVENT_TYPES.WORKFLOW_STARTED);
  const end     = entries.find(e =>
    e.event === EVENT_TYPES.WORKFLOW_COMPLETED ||
    e.event === EVENT_TYPES.WORKFLOW_FAILED ||
    e.event === EVENT_TYPES.WORKFLOW_CANCELLED
  );

  const steps   = entries.filter(e => e.event === EVENT_TYPES.STEP_COMPLETED);
  const failed  = entries.filter(e => e.event === EVENT_TYPES.STEP_FAILED);
  const skipped = entries.filter(e => e.event === EVENT_TYPES.STEP_SKIPPED);

  const durationMs = start && end
    ? new Date(end.timestamp).getTime() - new Date(start.timestamp).getTime()
    : null;

  return {
    runId,
    workflowId:    start?.workflowId,
    outcome:       end?.event ?? 'unknown',
    durationMs,
    stepsCompleted: steps.length,
    stepsFailed:    failed.length,
    stepsSkipped:   skipped.length,
    startedAt:      start?.timestamp,
    endedAt:        end?.timestamp,
  };
}

/**
 * Load persisted history from JSONL file (call at startup if needed).
 */
export function loadPersistedHistory() {
  if (!existsSync(LOG_PATH)) return 0;
  try {
    const lines = readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean);
    const entries = lines
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);

    const toLoad = entries.slice(-MAX_MEMORY);
    _log.length = 0;
    _log.push(...toLoad.map(Object.freeze));
    return _log.length;
  } catch {
    return 0;
  }
}

/**
 * Full log length (for diagnostics).
 */
export function historySize() {
  return _log.length;
}
