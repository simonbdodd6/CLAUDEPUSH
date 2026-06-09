// Thin adapter over the Communications Engine — pending drafts, schedule, history.
let _ce = null;
async function ce() {
  if (!_ce) { try { _ce = await import('../../communications-engine/index.js'); } catch { _ce = null; } }
  return _ce;
}

export async function fetchPendingDrafts() {
  const c = await ce();
  if (!c) return { drafts: [], count: 0, isMock: true };

  try {
    const history = c.getRecentHistory?.(100) ?? [];
    // Scheduled items that haven't been sent yet
    const pending = history.filter(e => e.event === 'comm.scheduled');
    return { drafts: pending, count: pending.length, isMock: false };
  } catch { return { drafts: [], count: 0, isMock: true }; }
}

export async function fetchSchedule() {
  const c = await ce();
  if (!c) return { scheduled: [], recurring: 0, isMock: true };

  try {
    const scheduled = c.getScheduled?.() ?? [];
    const stats     = c.scheduleStats?.() ?? {};
    return { scheduled, recurring: stats.recurring ?? 0, total: stats.total ?? 0, isMock: false };
  } catch { return { scheduled: [], recurring: 0, isMock: true }; }
}

export async function fetchCommsStats() {
  const c = await ce();
  if (!c) return { total: 0, sent: 0, failed: 0, successRate: 100, isMock: true };

  try {
    const stats = c.getHistoryStats?.() ?? {};
    return { ...stats, isMock: false };
  } catch { return { total: 0, sent: 0, failed: 0, successRate: 100, isMock: true }; }
}

// Returns high-level summary of comms awaiting approval.
export async function fetchApprovalSummary() {
  const c = await ce();
  if (!c) return { awaitingApproval: 0, highRisk: 0, isMock: true };

  try {
    // Count scheduled items as "awaiting approval" in the dashboard context
    const scheduled = c.getScheduled?.() ?? [];
    return { awaitingApproval: scheduled.length, highRisk: 0, isMock: false };
  } catch { return { awaitingApproval: 0, highRisk: 0, isMock: true }; }
}
