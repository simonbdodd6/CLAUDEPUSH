// Morning Briefing widget — "What do I need to know today?"
// Aggregates from all adapters, returns a structured priority list.

import { fetchPlayerSnapshot, fetchUpcomingFixtures, fetchUpcomingSessions } from '../adapters/memory-adapter.js';
import { fetchHealthScore } from '../adapters/club-intel-adapter.js';
import { fetchApprovalSummary, fetchSchedule } from '../adapters/comms-adapter.js';
import { fetchMembershipAlerts, fetchSponsorAlerts, fetchVolunteerStatus } from '../adapters/data-adapter.js';
import { getPending } from '../approval-centre/approval-queue.js';

export async function buildMorningBriefing(role = 'coach', options = {}) {
  const { clubName = 'Your Club', coachName = 'Coach' } = options;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const [players, fixtures, sessions, health, commsSummary, membership, sponsors, volunteers] = await Promise.all([
    fetchPlayerSnapshot(),
    fetchUpcomingFixtures(),
    fetchUpcomingSessions(),
    fetchHealthScore(),
    fetchApprovalSummary(),
    fetchMembershipAlerts(),
    fetchSponsorAlerts(),
    fetchVolunteerStatus(),
  ]);

  const pendingApprovals = getPending();
  const priorities = [];

  // Training sessions today/tomorrow
  if (sessions.sessions.length > 0) {
    sessions.sessions.forEach(s => {
      const dateStr = s.date ? new Date(s.date).toLocaleDateString('en-IE', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : 'soon';
      priorities.push({ urgency: 'high', icon: '🏉', text: `${s.ageGroup ?? 'Squad'} training ${dateStr} — ${s.focus ?? 'General'}`, category: 'training', data: s });
    });
  }

  // Upcoming fixtures in next 3 days
  fixtures.upcoming.filter(f => {
    const days = (new Date(f.date) - Date.now()) / 86400000;
    return days >= 0 && days <= 3;
  }).forEach(f => {
    const dateStr = f.date ? new Date(f.date).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'short' }) : 'soon';
    priorities.push({ urgency: 'high', icon: '🏆', text: `Fixture ${dateStr}: ${f.homeTeam} vs ${f.awayTeam} — ${f.venue ?? 'TBC'}`, category: 'fixture', data: f });
  });

  // Active injuries
  if (players.injuredCount > 0) {
    priorities.push({
      urgency: players.injuredCount >= 3 ? 'high' : 'medium',
      icon: '🩹',
      text: `${players.injuredCount} active injur${players.injuredCount === 1 ? 'y' : 'ies'} — ${players.injuries.map(i => i.playerName ?? i.playerId).join(', ')}`,
      category: 'injury',
      data: players.injuries,
    });
  }

  // Low attendance (if data available)
  // (pulled from sessions adapter — calculated from recent data)

  // Pending approvals
  if (pendingApprovals.length > 0) {
    const highRisk = pendingApprovals.filter(a => a.riskLevel === 'high').length;
    priorities.push({
      urgency: highRisk > 0 ? 'high' : 'medium',
      icon: '📬',
      text: `${pendingApprovals.length} communication${pendingApprovals.length === 1 ? '' : 's'} awaiting approval${highRisk > 0 ? ` (${highRisk} high-risk)` : ''}`,
      category: 'approval',
      data: { count: pendingApprovals.length, highRisk },
    });
  }

  // Membership alerts
  if (membership.expiringSoon.length > 0) {
    priorities.push({
      urgency: 'medium',
      icon: '🏅',
      text: `${membership.expiringSoon.length} membership${membership.expiringSoon.length === 1 ? '' : 's'} expiring within 30 days`,
      category: 'membership',
      data: membership.expiringSoon,
    });
  }
  if (membership.lapsed.length > 0) {
    priorities.push({ urgency: 'low', icon: '⚠️', text: `${membership.lapsed.length} lapsed member${membership.lapsed.length === 1 ? '' : 's'} — re-engagement needed`, category: 'membership' });
  }

  // Sponsor reminders
  if (sponsors.count > 0) {
    priorities.push({ urgency: 'low', icon: '🤝', text: `${sponsors.count} active sponsor${sponsors.count === 1 ? '' : 's'} — monthly update due`, category: 'sponsor' });
  }

  // Club health alert
  if (health.score !== null && health.score < 60) {
    priorities.push({ urgency: 'high', icon: '🚨', text: `Club health score is ${health.score}/100 (${health.grade}) — action required`, category: 'health' });
  }

  // Sort by urgency
  const urgencyOrder = { high: 0, medium: 1, low: 2 };
  priorities.sort((a, b) => (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2));

  return {
    greeting: `${greeting}, ${coachName}`,
    clubName,
    date: new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    headline: buildHeadline(priorities, health),
    priorities,
    totals: {
      activePlayers:  players.activeCount,
      injuries:       players.injuredCount,
      sessionsToday:  sessions.sessions.length,
      upcomingFixtures: fixtures.upcoming.length,
      pendingApprovals: pendingApprovals.length,
      membershipAlerts: membership.expiringSoon.length + membership.lapsed.length,
      healthScore:    health.score,
    },
    isMock: players.isMock || health.isMock,
  };
}

function buildHeadline(priorities, health) {
  const high = priorities.filter(p => p.urgency === 'high').length;
  if (high === 0 && (health.score ?? 100) >= 70) return 'All clear — good day ahead.';
  if (high >= 3) return `${high} urgent items need your attention today.`;
  if (high > 0) return `${high} priority item${high === 1 ? '' : 's'} to address today.`;
  return 'A few things to keep an eye on.';
}

export function formatBriefing(briefing) {
  const urgent = briefing.priorities.filter(p => p.urgency === 'high');
  const medium = briefing.priorities.filter(p => p.urgency === 'medium');
  const low    = briefing.priorities.filter(p => p.urgency === 'low');

  const formatItems = items => items.map(p => `- ${p.icon} ${p.text}`).join('\n') || '_None_';

  return `## ${briefing.greeting}
*${briefing.date} — ${briefing.clubName}*

### ${briefing.headline}

#### 🔴 Urgent
${formatItems(urgent)}

#### 🟡 Today
${formatItems(medium)}

#### 🟢 Keep in mind
${formatItems(low)}

---
**Club snapshot:** ${briefing.totals.activePlayers} active players · ${briefing.totals.injuries} injured · ${briefing.totals.upcomingFixtures} upcoming fixtures · ${briefing.totals.pendingApprovals} pending approvals · Health: ${briefing.totals.healthScore ?? '—'}/100`;
}
