/**
 * Recommendation Engine
 *
 * 8 detectors map observations → recommendations.
 * Each recommendation is ranked by a weighted score:
 *   urgency 40% · impact 25% · confidence 20% · time-saved 15%
 *
 * Every recommendation has one-tap actions, dismiss, snooze, and remind-later.
 */

import { randomUUID } from 'crypto';

const URGENCY = { CRITICAL: 100, HIGH: 75, MEDIUM: 50, LOW: 25 };
const IMPACT  = { HIGH: 100, MEDIUM: 60, LOW: 25 };

function rec(fields) {
  return {
    id:            randomUUID(),
    state:         'ACTIVE',
    createdAt:     new Date().toISOString(),
    ...fields,
    // Actions always include dismiss + snooze
    actions: [
      ...(fields.actions ?? []),
      { id: 'snooze-4h',  label: 'Remind in 4h',  system: true, type: 'SNOOZE', snoozeHours: 4  },
      { id: 'snooze-24h', label: 'Remind tomorrow', system: true, type: 'SNOOZE', snoozeHours: 24 },
      { id: 'dismiss',    label: 'Dismiss',          system: true, type: 'DISMISS' },
    ],
  };
}

// ── Detectors ──────────────────────────────────────────────────────────────────

function detectAttendanceDecline(obs) {
  const { attendance } = obs;
  if (!attendance?.decliningTeams?.length) return null;
  const worst = [...attendance.decliningTeams].sort((a,b) => a.rate - b.rate)[0];
  const weeks = Math.ceil((worst.rate - 50) / Math.max(1, Math.abs(worst.trend ?? 1)));
  return rec({
    type:     'ATTENDANCE_DECLINE',
    category: 'Operations',
    title:    `${worst.name} attendance ${worst.rate}% — declining ${Math.abs(worst.trend ?? 0)}%/week`,
    reason:   `Attendance has fallen over multiple consecutive weeks. At this trend, ${worst.name} falls below the 50% minimum in ~${weeks} weeks.`,
    supportingData: { teams: attendance.decliningTeams, averageRate: attendance.averageRate },
    confidence:     attendance.confidence ?? 60,
    urgency:        worst.rate < 60 ? 'HIGH' : 'MEDIUM',
    impact:         'MEDIUM',
    riskIfIgnored:  'Player dropout accelerates. Team viability threatened. Registration fees at risk.',
    timeSaved:      20,
    actions: [
      { id: 'msg-parents',   label: 'Message parents', actionId: 'SEND_TEAM_MESSAGE',      params: { teamId: worst.id, subject: 'Attendance check-in' } },
      { id: 'review-sched',  label: 'Review schedule', actionId: 'SCHEDULE_SESSION',        params: { type: 'attendance-review', teamId: worst.id } },
      { id: 'run-report',    label: 'Full report',      actionId: 'ATTENDANCE_TRENDS',       params: { teamId: worst.id } },
    ],
  });
}

function detectInjuryPositionCrisis(obs) {
  const { injuries, fixtures } = obs;
  if (!injuries?.criticalPositions?.length) return null;
  const crisis = injuries.criticalPositions[0];
  const imminent = (fixtures?.within48h?.length ?? 0) > 0;
  return rec({
    type:     'INJURY_POSITION_CRISIS',
    category: 'Player Welfare',
    title:    `${crisis.count} ${crisis.pos} players unavailable${imminent ? ' — match THIS WEEKEND' : ''}`,
    reason:   `${crisis.count} players in the same position are simultaneously unavailable. Structural gap in the lineup that selectors must address before next fixture.`,
    supportingData: { criticalPositions: injuries.criticalPositions, total: injuries.total, nextFixture: fixtures?.next },
    confidence:     injuries.confidence ?? 70,
    urgency:        imminent ? 'CRITICAL' : 'HIGH',
    impact:         'HIGH',
    riskIfIgnored:  'Unable to field a complete team. Risk of forfeit or injury from playing out-of-position players.',
    timeSaved:      30,
    actions: [
      { id: 'check-avail',  label: 'Check availability',  actionId: 'CHECK_AVAILABILITY',    params: { position: crisis.pos } },
      { id: 'alert-selectors', label: 'Alert selectors',  actionId: 'SEND_TEAM_MESSAGE',     params: { to: 'selectors', subject: `${crisis.pos} shortage` } },
      { id: 'log-injury',   label: 'Update injury log',   actionId: 'LOG_INJURY',            params: {} },
    ],
  });
}

function detectVolunteerGap(obs) {
  const { volunteers, fixtures } = obs;
  if (!volunteers?.criticalGaps?.length && (volunteers?.openRoles ?? 0) < 1) return null;
  const imminent = (fixtures?.within48h?.length ?? 0) > 0;
  return rec({
    type:     'VOLUNTEER_GAP',
    category: 'Operations',
    title:    `${volunteers.openRoles} volunteer roles unfilled${imminent ? ' — MATCH THIS WEEKEND' : ''}`,
    reason:   'Fixtures cannot proceed without confirmed First Aider. Unfilled linesperson roles also violate competition rules.',
    supportingData: { openRoles: volunteers.openRoles, gaps: volunteers.criticalGaps, fixtures: fixtures?.within7d },
    confidence:     volunteers.confidence ?? 60,
    urgency:        imminent ? 'CRITICAL' : 'HIGH',
    impact:         'HIGH',
    riskIfIgnored:  'Match forfeited. League disciplinary action. Club reputation damage.',
    timeSaved:      25,
    actions: [
      { id: 'contact-vols',   label: 'Contact volunteers', actionId: 'CONFIRM_VOLUNTEERS',   params: {} },
      { id: 'broadcast-appeal', label: 'Broadcast appeal', actionId: 'SEND_NEWSLETTER',      params: { subject: 'Volunteer needed this weekend', urgent: true } },
    ],
  });
}

function detectMembershipExpiry(obs) {
  const { memberships } = obs;
  if ((memberships?.expiringThisWeek ?? 0) < 2) return null;
  const atRisk = Math.ceil(memberships.expiringThisWeek * (1 - (memberships.renewalRate ?? 0.82)));
  return rec({
    type:     'MEMBERSHIP_EXPIRY',
    category: 'Membership',
    title:    `${memberships.expiringThisWeek} memberships expiring this week — ${atRisk} at risk of lapsing`,
    reason:   `At the historical renewal rate of ${Math.round((memberships.renewalRate ?? 0.82) * 100)}%, ${atRisk} of these members may not renew without a prompt.`,
    supportingData: { expiring: memberships.expiringThisWeek, atRisk, renewalRate: memberships.renewalRate, total: memberships.total },
    confidence:     memberships.confidence ?? 55,
    urgency:        memberships.expiringThisWeek > 10 ? 'HIGH' : 'MEDIUM',
    impact:         'MEDIUM',
    riskIfIgnored:  `Estimated €${atRisk * 85} in annual fees at risk. Player pool shrinks.`,
    timeSaved:      45,
    actions: [
      { id: 'send-renewal', label: 'Send renewal reminders', actionId: 'SEND_RENEWAL_REMINDERS', params: { count: memberships.expiringThisWeek } },
    ],
  });
}

function detectCommunicationGap(obs) {
  const { communications } = obs;
  if ((communications?.lastNewsletterDays ?? 0) < 10) return null;
  return rec({
    type:     'COMMUNICATION_GAP',
    category: 'Communications',
    title:    `No newsletter sent in ${communications.lastNewsletterDays} days`,
    reason:   'Regular communication (weekly) keeps members engaged and reduces dropout. The AI can auto-generate from this week\'s activity data.',
    supportingData: { daysSince: communications.lastNewsletterDays, unread: communications.unreadMessages },
    confidence:     communications.confidence ?? 60,
    urgency:        (communications.lastNewsletterDays ?? 0) > 21 ? 'HIGH' : 'MEDIUM',
    impact:         'MEDIUM',
    riskIfIgnored:  'Member disengagement. Reduced match-day attendance. Higher lapse rate at renewal.',
    timeSaved:      40,
    actions: [
      { id: 'gen-newsletter', label: 'Generate newsletter', actionId: 'SEND_NEWSLETTER', params: { type: 'weekly', auto: true } },
    ],
  });
}

function detectApprovalBacklog(obs) {
  const { approvals } = obs;
  if ((approvals?.pending ?? 0) < 2) return null;
  return rec({
    type:     'APPROVAL_BACKLOG',
    category: 'Governance',
    title:    `${approvals.pending} items awaiting approval${approvals.overdue > 0 ? ` (${approvals.overdue} overdue)` : ''}`,
    reason:   'Overdue committee approvals block player registrations, kit deliveries, and referee payments. Each day of delay compounds.',
    supportingData: { pending: approvals.pending, overdue: approvals.overdue, items: approvals.items },
    confidence:     approvals.confidence ?? 70,
    urgency:        (approvals.overdue ?? 0) > 0 ? 'HIGH' : 'MEDIUM',
    impact:         'MEDIUM',
    riskIfIgnored:  'Player ineligibility risk. Supplier late-payment penalties. Committee accountability issues.',
    timeSaved:      15,
    actions: [
      { id: 'review-approvals', label: 'Review approvals',  actionId: 'REVIEW_APPROVALS',  params: {} },
      { id: 'remind-committee', label: 'Remind committee',  actionId: 'SEND_TEAM_MESSAGE', params: { to: 'committee', subject: 'Pending approvals' } },
    ],
  });
}

function detectWeatherRisk(obs) {
  const { weather, fixtures } = obs;
  if (!weather || weather.saturdayRisk === 'CLEAR' || !(fixtures?.within7d?.length)) return null;
  return rec({
    type:     'WEATHER_RISK',
    category: 'Logistics',
    title:    `${weather.saturdayRisk} forecast — match weekend conditions`,
    reason:   `${weather.forecast ?? 'Adverse conditions expected'}. Consider indoor alternatives for skills work and notify transport arrangements.`,
    supportingData: { forecast: weather.saturdayRisk, temp: weather.saturdayTemp, fixtures: fixtures.within7d },
    confidence:     weather.confidence ?? 50,
    urgency:        'MEDIUM',
    impact:         'LOW',
    riskIfIgnored:  'Increased injury rate on waterlogged pitch. Transport no-shows if parents not warned.',
    timeSaved:      10,
    actions: [
      { id: 'check-pitch',   label: 'Check pitch status', actionId: 'CHECK_PITCH_STATUS',  params: {} },
      { id: 'weather-alert', label: 'Notify players',     actionId: 'SEND_TEAM_MESSAGE',   params: { subject: 'Weather update — Saturday', type: 'weather' } },
    ],
  });
}

function detectPlayerWorkload(obs) {
  const { workload, fixtures } = obs;
  if (!workload?.overloadedPlayers?.length) return null;
  const p = workload.overloadedPlayers[0];
  return rec({
    type:     'PLAYER_OVERLOAD',
    category: 'Player Welfare',
    title:    `${p.name} — ${p.sessionCount} sessions this week (overload risk)`,
    reason:   'High training volume increases acute injury risk. Youth players especially require mandatory rest days between sessions.',
    supportingData: { player: p, avgSessions: workload.averageSessionsPerWeek, nextFixture: fixtures?.next },
    confidence:     workload.confidence ?? 40,
    urgency:        p.riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM',
    impact:         'MEDIUM',
    riskIfIgnored:  'Acute injury risk. Burnout. Potential safeguarding concern (welfare duty of care).',
    timeSaved:      15,
    actions: [
      { id: 'log-load',    label: 'Log workload note',  actionId: 'LOG_PLAYER_NOTE', params: { playerId: p.id, type: 'workload' } },
      { id: 'alert-coach', label: 'Alert lead coach',   actionId: 'SEND_TEAM_MESSAGE', params: { to: 'head-coach', subject: `Workload alert: ${p.name}` } },
    ],
  });
}

// ── Ranking ────────────────────────────────────────────────────────────────────

function rankScore(r) {
  const u = URGENCY[r.urgency] ?? 25;
  const i = IMPACT[r.impact]   ?? 25;
  const c = r.confidence       ?? 50;
  const t = Math.min(100, ((r.timeSaved ?? 0) / 60) * 100);
  return (u * 0.40) + (i * 0.25) + (c * 0.20) + (t * 0.15);
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function detect(observations) {
  const detectors = [
    detectInjuryPositionCrisis,
    detectVolunteerGap,
    detectApprovalBacklog,
    detectAttendanceDecline,
    detectMembershipExpiry,
    detectCommunicationGap,
    detectPlayerWorkload,
    detectWeatherRisk,
  ];
  return detectors.map(d => d(observations)).filter(Boolean);
}

export function rank(recommendations) {
  return recommendations
    .map(r => ({ ...r, rankScore: Math.round(rankScore(r)) }))
    .sort((a, b) => b.rankScore - a.rankScore);
}

export function detectAndRank(observations) {
  return rank(detect(observations));
}

export function summarise(recommendations) {
  return {
    total:    recommendations.length,
    critical: recommendations.filter(r => r.urgency === 'CRITICAL').length,
    high:     recommendations.filter(r => r.urgency === 'HIGH').length,
    medium:   recommendations.filter(r => r.urgency === 'MEDIUM').length,
    low:      recommendations.filter(r => r.urgency === 'LOW').length,
    topRec:   recommendations[0] ?? null,
    totalTimeSavedMin: recommendations.reduce((s,r) => s + (r.timeSaved ?? 0), 0),
  };
}
