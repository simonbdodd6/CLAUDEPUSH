/**
 * Workflow Queue — in-memory queue for scheduled/future workflows
 *
 * Supports:
 * - enqueue(entry)              — add a workflow to run at a future time
 * - dequeue()                   — pop the next due entry (returns null if none ready)
 * - cancel(queueId)             — remove a queued entry
 * - peek(n)                     — view upcoming entries without removing
 * - listPending()               — all entries not yet executed
 * - listAll()                   — all entries including completed/cancelled
 * - processDue(runner)          — run all entries whose scheduledFor <= now
 *
 * Queue entry shape:
 * {
 *   queueId:      string
 *   name:         string
 *   workflowDef:  WorkflowDefinition
 *   scheduledFor: ISO string
 *   enqueueAt:    ISO string
 *   status:       'pending' | 'running' | 'done' | 'failed' | 'cancelled'
 *   runId?:       string        — set when execution starts
 *   completedAt?: ISO string
 *   error?:       string
 * }
 */

import { logEvent, EVENT_TYPES } from './workflow-history.js';

// ── Storage ───────────────────────────────────────────────────────────────────

const _queue = new Map();   // queueId → QueueEntry
let _seq = 0;

function genId() {
  return `wfq_${Date.now()}_${(++_seq).toString(36)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Add a workflow to the queue.
 * @param {{ name, workflowDef, scheduledFor? }} opts
 *   scheduledFor defaults to now (immediate).
 * @returns queueId
 */
export function enqueue(opts) {
  const queueId = genId();
  const now     = new Date().toISOString();

  const entry = {
    queueId,
    name:         opts.name ?? 'Unnamed workflow',
    workflowDef:  opts.workflowDef ?? {},
    scheduledFor: opts.scheduledFor ?? now,
    enqueueAt:    now,
    status:       'pending',
    runId:        null,
    completedAt:  null,
    error:        null,
  };

  _queue.set(queueId, entry);

  logEvent(EVENT_TYPES.QUEUE_ENQUEUED, opts.workflowDef?.id ?? queueId, null, {
    stepId: queueId,
    data: { name: entry.name, scheduledFor: entry.scheduledFor },
  });

  return queueId;
}

/**
 * Dequeue the next pending entry whose scheduledFor <= now.
 * Returns null if nothing is due.
 */
export function dequeue() {
  const now = new Date();
  for (const [id, entry] of _queue) {
    if (entry.status === 'pending' && new Date(entry.scheduledFor) <= now) {
      entry.status = 'running';
      logEvent(EVENT_TYPES.QUEUE_DEQUEUED, entry.workflowDef?.id ?? id, null, {
        stepId: id, data: { name: entry.name },
      });
      return entry;
    }
  }
  return null;
}

/**
 * Cancel a pending queue entry.
 * Returns true if cancelled, false if not found or not cancellable.
 */
export function cancel(queueId) {
  const entry = _queue.get(queueId);
  if (!entry || entry.status !== 'pending') return false;

  entry.status = 'cancelled';
  entry.completedAt = new Date().toISOString();

  logEvent(EVENT_TYPES.QUEUE_CANCELLED, entry.workflowDef?.id ?? queueId, null, {
    stepId: queueId, data: { name: entry.name },
  });
  return true;
}

/**
 * Mark a queue entry as done (called by runner after execution).
 */
export function markDone(queueId, runId, success, error = null) {
  const entry = _queue.get(queueId);
  if (!entry) return;
  entry.status      = success ? 'done' : 'failed';
  entry.runId       = runId ?? null;
  entry.completedAt = new Date().toISOString();
  entry.error       = error ?? null;
}

/**
 * View upcoming entries (sorted by scheduledFor) without dequeuing.
 */
export function peek(n = 10) {
  return [..._queue.values()]
    .filter(e => e.status === 'pending')
    .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor))
    .slice(0, n);
}

/**
 * All pending entries.
 */
export function listPending() {
  return [..._queue.values()].filter(e => e.status === 'pending');
}

/**
 * All entries (all statuses).
 */
export function listAll() {
  return [..._queue.values()].sort((a, b) => new Date(a.enqueueAt) - new Date(b.enqueueAt));
}

/**
 * Process all due entries using the provided runner function.
 * runner(workflowDef) must return a promise of { runId, success, error? }.
 * Returns a summary of what ran.
 */
export async function processDue(runner) {
  const processed = [];
  let entry;

  while ((entry = dequeue()) !== null) {
    let result = { runId: null, success: false, error: 'Runner not provided' };
    try {
      result = typeof runner === 'function'
        ? await runner(entry.workflowDef, entry)
        : result;
    } catch (err) {
      result = { runId: null, success: false, error: err.message };
    }

    markDone(entry.queueId, result.runId, result.success, result.error);
    processed.push({
      queueId:    entry.queueId,
      name:       entry.name,
      success:    result.success,
      runId:      result.runId,
      error:      result.error ?? null,
    });
  }

  return { processedCount: processed.length, results: processed };
}

/**
 * Count of pending entries.
 */
export function queueSize() {
  return [..._queue.values()].filter(e => e.status === 'pending').length;
}

/**
 * Get a specific queue entry.
 */
export function getEntry(queueId) {
  return _queue.get(queueId) ?? null;
}

/**
 * Clear all cancelled/done/failed entries (garbage collect).
 * Returns count removed.
 */
export function gc() {
  const toDelete = [..._queue.keys()].filter(id => {
    const e = _queue.get(id);
    return e.status === 'done' || e.status === 'failed' || e.status === 'cancelled';
  });
  toDelete.forEach(id => _queue.delete(id));
  return toDelete.length;
}
