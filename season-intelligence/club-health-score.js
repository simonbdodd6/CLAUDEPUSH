/**
 * Club Health Score
 *
 * Aggregates team health scores + club-wide metrics into one number.
 *
 * Club-wide components (weight 40% of total):
 *   Membership health    12%
 *   Financial indicators  8%   (placeholder)
 *   Governance           10%
 *   Volunteer depth      10%
 *
 * Team average (weight 60% of total)
 */

import { buildTeamHealthScore, grade, status } from './team-health-score.js';
import { detectCurrentPhase, getPhaseMeta }     from './season-phases.js';

const CLUB_WEIGHTS = {
  teamAverage:  0.60,
  membership:   0.12,
  finance:      0.08,
  governance:   0.10,
  volunteerDept:0.10,
};

// ── Club-level dimension scorers ───────────────────────────────────────────────

function scoreMembership(obs) {
  const total    = obs?.memberships?.total ?? 100;
  const expiring = obs?.memberships?.expiringThisWeek ?? 5;
  const renewal  = obs?.memberships?.renewalRate ?? 0.82;
  const atRisk   = Math.ceil(expiring * (1 - renewal));
  const atRiskPct= Math.round((atRisk / Math.max(1, total)) * 100);
  const score    = Math.max(0, 100 - (atRiskPct * 3));
  return {
    score:       Math.round(score),
    total,
    expiring,
    atRisk,
    renewalRate: renewal,
    label:       `${total} members · ${expiring} expiring · ${atRisk} at risk`,
    note:        atRisk > 5 ? `${atRisk} members at risk of lapsing` : null,
  };
}

function scoreFinance(obs) {
  const overdue  = obs?.finance?.overdueInvoices ?? 1;
  const lowBal   = obs?.finance?.lowBalance ?? false;
  const score    = Math.max(0, 100 - (overdue * 15) - (lowBal ? 30 : 0));
  return {
    score:   Math.round(score),
    overdue,
    lowBalance: lowBal,
    label:   `${overdue} overdue invoices`,
    note:    overdue > 1 ? `${overdue} overdue invoices` : null,
  };
}

function scoreGovernance(obs) {
  const pending  = obs?.approvals?.pending ?? 3;
  const overdue  = obs?.approvals?.overdue ?? 1;
  const score    = Math.max(0, 100 - (overdue * 20) - (pending * 5));
  return {
    score:   Math.round(score),
    pending,
    overdue,
    label:   `${pending} pending approvals · ${overdue} overdue`,
    note:    overdue > 0 ? `${overdue} overdue committee approvals` : null,
  };
}

function scoreVolunteerDepth(obs) {
  const open   = obs?.volunteers?.openRoles ?? 3;
  const total  = (obs?.volunteers?.totalVolunteers ?? 10) + open;
  const score  = Math.max(0, Math.round((1 - open / Math.max(1, total)) * 100));
  return {
    score,
    openRoles: open,
    total,
    label:     `${total - open}/${total} roles filled`,
    note:      open > 0 ? `${open} open volunteer roles` : null,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function buildClubHealthScore(teams, observations, date = new Date()) {
  const phase     = detectCurrentPhase(date);
  const phaseMeta = getPhaseMeta(phase);

  const teamScores  = (teams ?? []).map(t => buildTeamHealthScore(t, observations, date));
  const teamAvg     = teamScores.length
    ? Math.round(teamScores.reduce((s, t) => s + t.overall, 0) / teamScores.length)
    : 70;

  const clubDimensions = {
    teamAverage:   { score: teamAvg,                      label: `Team avg: ${teamAvg}` },
    membership:    scoreMembership(observations),
    finance:       scoreFinance(observations),
    governance:    scoreGovernance(observations),
    volunteerDepth:scoreVolunteerDepth(observations),
  };

  const overall = Object.entries(CLUB_WEIGHTS).reduce((sum, [key, weight]) => {
    return sum + (clubDimensions[key]?.score ?? 60) * weight;
  }, 0);

  const allNotes = Object.values(clubDimensions)
    .map(d => d.note)
    .filter(Boolean);

  const weakDimensions = Object.entries(clubDimensions)
    .filter(([, d]) => d.score < 65)
    .map(([key, d]) => ({ dimension: key, score: d.score, note: d.note }));

  // Trend: compare to a mock baseline for now
  const trend = overall >= 75 ? 'improving' : overall >= 65 ? 'stable' : 'declining';

  return {
    season:     '2025/26',
    phase,
    phaseLabel: phaseMeta.label,
    overall:    Math.round(overall),
    grade:      grade(overall),
    status:     status(overall),
    trend,
    clubDimensions,
    teamSummary: {
      count:   teamScores.length,
      average: teamAvg,
      best:    teamScores.length ? teamScores.slice().sort((a,b) => b.overall - a.overall)[0] : null,
      worst:   teamScores.length ? teamScores.slice().sort((a,b) => a.overall - b.overall)[0] : null,
      teams:   teamScores,
    },
    notes:          allNotes,
    weakDimensions,
    calculatedAt:   new Date().toISOString(),
  };
}

export function getClubHealthDelta(score1, score2) {
  return {
    overall:    score2.overall - score1.overall,
    trend:      score2.overall > score1.overall ? 'improving' : score2.overall < score1.overall ? 'declining' : 'stable',
    daysBetween: Math.round((new Date(score2.calculatedAt) - new Date(score1.calculatedAt)) / 86400000),
  };
}
