// Thin adapter over the Workflow Engine — pending queue, recent runs, actions.
let _wq = null, _wh = null;
async function queue() {
  if (!_wq) { try { _wq = await import('../../workflow-engine/workflow-queue.js'); } catch { _wq = null; } }
  return _wq;
}
async function history() {
  if (!_wh) { try { _wh = await import('../../workflow-engine/workflow-history.js'); } catch { _wh = null; } }
  return _wh;
}

export async function fetchPendingWorkflows() {
  const q = await queue();
  if (!q) return { pending: [], count: 0, isMock: true };

  try {
    const pending = q.listPending?.() ?? [];
    return { pending, count: pending.length, isMock: false };
  } catch { return { pending: [], count: 0, isMock: true }; }
}

export async function fetchRecentRuns(n = 10) {
  const h = await history();
  if (!h) return { runs: [], isMock: true };

  try {
    const recent = h.getRecentHistory?.(n) ?? [];
    return { runs: recent, isMock: false };
  } catch { return { runs: [], isMock: true }; }
}

export async function fetchWorkflowStats() {
  const q = await queue();
  const h = await history();

  const qSize  = q?.queueSize?.()   ?? 0;
  const recent = h?.getRecentHistory?.(50) ?? [];

  const completed = recent.filter(e => e.event === 'workflow.completed').length;
  const failed    = recent.filter(e => e.event === 'workflow.failed').length;

  return { queueSize: qSize, completed, failed, isMock: false };
}
