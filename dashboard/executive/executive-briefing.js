// Executive Briefing — the top-level "Good Morning" dashboard view.
// Combines every widget into one cohesive snapshot.

import { buildMorningBriefing, formatBriefing } from '../widgets/morning-briefing.js';
import { buildClubHealthWidget, formatClubHealth } from '../widgets/club-health.js';
import { buildTodaysTasks, formatTodaysTasks } from '../widgets/todays-tasks.js';
import { buildActivityFeed, formatActivityFeed } from '../widgets/activity-feed.js';
import { buildRecommendations, formatRecommendations } from '../widgets/recommendations.js';
import { getPending, stats as approvalStats } from '../approval-centre/approval-queue.js';
import { seedDemoApprovals } from '../approval-centre/approval-router.js';

export async function buildExecutiveBriefing(role = 'coach', options = {}) {
  const { seedApprovals = false, clubName = "Coach's Eye Club", coachName = 'Coach' } = options;

  // Optionally seed demo approval items for demonstration purposes
  if (seedApprovals) {
    await seedDemoApprovals({ clubName });
  }

  // Build all widgets in parallel
  const [briefing, clubHealth, tasks, feed, recommendations] = await Promise.all([
    buildMorningBriefing(role, { clubName, coachName }),
    buildClubHealthWidget(role),
    buildTodaysTasks(role),
    Promise.resolve(buildActivityFeed(20)),
    buildRecommendations(role),
  ]);

  const approvalQueue = {
    items: getPending(),
    ...approvalStats(),
  };

  return {
    role,
    clubName,
    generatedAt: new Date().toISOString(),

    // Individual widgets
    briefing,
    clubHealth,
    tasks,
    feed,
    recommendations,
    approvalQueue,

    // Summary totals for quick access
    summary: {
      healthScore:       clubHealth.score,
      healthGrade:       clubHealth.grade,
      totalTasks:        tasks.total,
      criticalTasks:     tasks.critical,
      pendingApprovals:  approvalQueue.items.length,
      recentActivity:    feed.total,
      topRecommendations: recommendations.recommendations.length,
      headline:          briefing.headline,
    },

    isMock: briefing.isMock || clubHealth.isMock,
  };
}

export function formatExecutiveBriefing(eb) {
  const parts = [
    formatBriefing(eb.briefing),
    '',
    formatClubHealth(eb.clubHealth),
    '',
    formatTodaysTasks(eb.tasks),
    '',
    _formatApprovalQueue(eb.approvalQueue),
    '',
    formatActivityFeed(eb.feed, 10),
    '',
    formatRecommendations(eb.recommendations),
  ];
  return parts.join('\n');
}

function _formatApprovalQueue(queue) {
  const items = queue.items ?? [];
  if (items.length === 0) return '## Approval Centre\n\n_Nothing pending — all clear._\n';

  const highRisk  = items.filter(a => a.riskLevel === 'high');
  const medRisk   = items.filter(a => a.riskLevel === 'medium');
  const lowRisk   = items.filter(a => a.riskLevel === 'low');

  let out = `## Approval Centre (${items.length} pending)\n\n`;
  if (highRisk.length)  out += highRisk.map(a  => `- 🔴 **${a.title ?? a.type}** — ${a.generatedBy ?? 'system'} · high risk`).join('\n') + '\n';
  if (medRisk.length)   out += medRisk.map(a   => `- 🟡 **${a.title ?? a.type}** — ${a.generatedBy ?? 'system'}`).join('\n') + '\n';
  if (lowRisk.length)   out += lowRisk.map(a   => `- 🟢 **${a.title ?? a.type}** — ${a.generatedBy ?? 'system'}`).join('\n') + '\n';

  return out;
}
