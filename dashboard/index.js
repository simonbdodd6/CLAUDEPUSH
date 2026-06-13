// Coach's Eye Executive Dashboard — public API
// Connects every engine into one cohesive dashboard.

export { buildExecutiveBriefing, formatExecutiveBriefing } from './executive/executive-briefing.js';
export { buildTodayAgenda, formatTodayAgenda } from './today/today-agenda.js';

// Widgets
export { buildMorningBriefing, formatBriefing } from './widgets/morning-briefing.js';
export { buildClubHealthWidget, formatClubHealth } from './widgets/club-health.js';
export { buildTodaysTasks, formatTodaysTasks } from './widgets/todays-tasks.js';
export { buildActivityFeed, logActivity, formatActivityFeed } from './widgets/activity-feed.js';
export { buildRecommendations, formatRecommendations } from './widgets/recommendations.js';
export { ask as copilotAsk, EXAMPLE_PROMPTS, formatCopilotResponse } from './widgets/global-copilot.js';

// Approval Centre
export {
  enqueue, approve, reject, archive, edit,
  getPending, getApproved, getAll, getById, getByType, stats as approvalStats,
  APPROVAL_STATUS,
} from './approval-centre/approval-queue.js';
export { createCard, cardsFromCommsDrafts, cardFromWorkflow, formatCard } from './approval-centre/approval-card.js';
export {
  routeCommsPack, routeCommsDraft, routeWorkflowResult, routeCopilotSuggestion, routeGeneric, seedDemoApprovals,
} from './approval-centre/approval-router.js';
// Durable ledger + audit trail (PIF-2)
export {
  appendAudit, readAudit, appendEvent, readEvents, replayState, getLedger, setLedger,
} from './approval-centre/approval-ledger.js';

// Adapters (for engine integrators)
export { fetchPlayerSnapshot, fetchAttendanceSummary, fetchUpcomingFixtures, fetchUpcomingSessions } from './adapters/memory-adapter.js';
export { fetchHealthScore, fetchRecommendations, fetchInsights } from './adapters/club-intel-adapter.js';
export { fetchPendingDrafts, fetchSchedule, fetchCommsStats, fetchApprovalSummary } from './adapters/comms-adapter.js';
export { fetchPendingWorkflows, fetchRecentRuns, fetchWorkflowStats } from './adapters/workflow-adapter.js';
export { fetchDataHealth, fetchMembershipAlerts, fetchSponsorAlerts, fetchVolunteerStatus } from './adapters/data-adapter.js';

// High-level convenience API
export async function buildDashboard(role = 'coach', options = {}) {
  const { buildExecutiveBriefing: _build } = await import('./executive/executive-briefing.js');
  return _build(role, options);
}
