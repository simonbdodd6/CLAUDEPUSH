/**
 * Team Health Score
 *
 * 8-dimension weighted health model per team.
 *
 * Weights:
 *   Availability         20%
 *   Attendance           15%
 *   Injury Burden        20%
 *   Squad Continuity     10%
 *   Workload Balance     15%
 *   Communication Health 10%
 *   Volunteer Support     5%
 *   Committee Health      5%
 *
 * Each dimension: 0–100. Overall = weighted sum. Grade A–F.
 */

import { detectCurrentPhase, getPhaseMeta } from './season-phases.js';
import { getPrescription } from './phase-prescriptions.js';

const WEIGHTS = {
  availability:          0.20,
  attendance:            0.15,
  injuryBurden:          0.20,
  squadContinuity:       0.10,
  workloadBalance:       0.15,
  communicationHealth:   0.10,
  volunteerSupport:      0.05,
  committeeHealth:       0.05,
};

function grade(score) {
  if (score >= 90) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'C+';
  if (score >= 65) return 'C';
  if (score >= 55) return 'D';
  return 'F';
}

function status(score) {
  if (score >= 80) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 60) return 'fair';
  if (score >= 50) return 'concerning';
  return 'critical';
}

// ── Dimension scorers ──────────────────────────────────────────────────────────

function scoreAvailability(team, phase) {
  const prescription = getPrescription(phase);
  const available    = team?.availability ?? team?.players?.available ?? null;
  const total        = team?.playerCount  ?? team?.players?.total     ?? 20;
  const rate         = available != null ? Math.round((available / total) * 100) : 72;
  const target       = phase === 'PLAYOFF_PREP' || phase === 'FINALS' ? 90 : 80;
  const score        = Math.min(100, Math.round((rate / target) * 100));
  return {
    score:       Math.max(0, score),
    raw:         rate,
    target,
    label:       `${rate}% available`,
    note:        rate < 70 ? 'Below minimum threshold — investigate absences' : null,
  };
}

function scoreAttendance(team, phase) {
  const prescription = getPrescription(phase);
  const rate         = team?.attendance?.rate ?? team?.attendanceRate ?? 68;
  const target       = prescription.attendanceExpectation.target;
  const minimum      = prescription.attendanceExpectation.minimum;
  const score        = Math.min(100, Math.round((rate / target) * 100));
  return {
    score:   Math.max(0, score),
    raw:     rate,
    target,
    minimum,
    trend:   team?.attendance?.trend ?? null,
    label:   `${rate}% attendance`,
    note:    rate < minimum ? prescription.attendanceExpectation.note : null,
  };
}

function scoreInjuryBurden(team, phase) {
  const injuries    = team?.injuries ?? team?.players?.injuries ?? [];
  const total       = Array.isArray(injuries) ? injuries.length : (typeof injuries === 'number' ? injuries : 0);
  const playerCount = team?.playerCount ?? 20;
  const rate        = Math.round((total / playerCount) * 100);
  // Invert: 0 injuries = 100, 30% injured = 0
  const score       = Math.max(0, 100 - (rate * 3));
  const burden      = total >= 5 ? 'HEAVY' : total >= 3 ? 'MODERATE' : total >= 1 ? 'LIGHT' : 'NONE';
  return {
    score:       Math.round(score),
    raw:         total,
    burden,
    rate,
    label:       `${total} injuries (${rate}% of squad)`,
    note:        total >= 3 ? `${total} injuries is above threshold for this phase` : null,
  };
}

function scoreSquadContinuity(team, phase) {
  // Based on: how consistent has the lineup been? More consistent = higher score
  const continuity = team?.squadContinuity ?? team?.continuity ?? 72;
  return {
    score:   Math.min(100, continuity),
    raw:     continuity,
    label:   `${continuity}% continuity`,
    note:    continuity < 60 ? 'High turnover affecting team cohesion' : null,
  };
}

function scoreWorkloadBalance(team, phase) {
  const prescription = getPrescription(phase);
  const target       = prescription.workload.sessionsPerWeek.target;
  const actual       = team?.sessionsPerWeek ?? target;
  const overloaded   = team?.workload?.overloadedPlayers ?? 0;
  const underloaded  = team?.workload?.underloadedPlayers ?? 0;
  const playerCount  = team?.playerCount ?? 20;
  const imbalance    = Math.round(((overloaded + underloaded) / playerCount) * 100);
  const score        = Math.max(0, 100 - (imbalance * 2));
  return {
    score:       Math.round(score),
    raw:         actual,
    target,
    overloaded,
    underloaded,
    label:       `${overloaded} overloaded · ${underloaded} underloaded`,
    note:        overloaded > 2 ? `${overloaded} players showing overload signs` : null,
  };
}

function scoreCommunicationHealth(obs) {
  const days    = obs?.communications?.lastNewsletterDays ?? 14;
  const unread  = obs?.communications?.unreadMessages ?? 5;
  const penalty = Math.min(50, days * 2.5) + Math.min(20, unread * 2);
  const score   = Math.max(0, 100 - penalty);
  return {
    score:   Math.round(score),
    raw:     days,
    unread,
    label:   `Newsletter: ${days}d ago · ${unread} unread`,
    note:    days > 14 ? `No newsletter in ${days} days` : null,
  };
}

function scoreVolunteerSupport(obs) {
  const open    = obs?.volunteers?.openRoles ?? 2;
  const total   = (obs?.volunteers?.totalVolunteers ?? 10) + open;
  const fillRate= Math.round(((total - open) / Math.max(1, total)) * 100);
  const score   = Math.min(100, fillRate);
  return {
    score,
    raw:     fillRate,
    openRoles: open,
    label:   `${fillRate}% roles filled`,
    note:    open > 0 ? `${open} volunteer roles unfilled` : null,
  };
}

function scoreCommitteeHealth(obs) {
  const pending = obs?.approvals?.pending ?? 2;
  const overdue = obs?.approvals?.overdue ?? 1;
  const penalty = (overdue * 15) + (pending * 5);
  const score   = Math.max(0, 100 - penalty);
  return {
    score:   Math.round(score),
    pending,
    overdue,
    label:   `${pending} pending · ${overdue} overdue`,
    note:    overdue > 0 ? `${overdue} overdue approvals` : null,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function buildTeamHealthScore(team, observations, date = new Date()) {
  const phase     = detectCurrentPhase(date);
  const phaseMeta = getPhaseMeta(phase);

  const dimensions = {
    availability:        scoreAvailability(team, phase),
    attendance:          scoreAttendance(team, phase),
    injuryBurden:        scoreInjuryBurden(team, phase),
    squadContinuity:     scoreSquadContinuity(team, phase),
    workloadBalance:     scoreWorkloadBalance(team, phase),
    communicationHealth: scoreCommunicationHealth(observations),
    volunteerSupport:    scoreVolunteerSupport(observations),
    committeeHealth:     scoreCommitteeHealth(observations),
  };

  const overall = Object.entries(WEIGHTS).reduce((sum, [key, weight]) => {
    return sum + (dimensions[key]?.score ?? 50) * weight;
  }, 0);

  const notes = Object.values(dimensions)
    .map(d => d.note)
    .filter(Boolean);

  const weakDimensions = Object.entries(dimensions)
    .filter(([, d]) => d.score < 65)
    .map(([key, d]) => ({ dimension: key, score: d.score, note: d.note }));

  return {
    teamId:     team?.id ?? 'club',
    teamName:   team?.name ?? 'Club',
    phase,
    phaseLabel: phaseMeta.label,
    overall:    Math.round(overall),
    grade:      grade(overall),
    status:     status(overall),
    dimensions,
    weights:    WEIGHTS,
    notes,
    weakDimensions,
    calculatedAt: new Date().toISOString(),
  };
}

export function buildMultiTeamSummary(teams, observations, date = new Date()) {
  const scores = teams.map(t => buildTeamHealthScore(t, observations, date));
  const avg    = Math.round(scores.reduce((s, t) => s + t.overall, 0) / Math.max(1, scores.length));
  const worst  = scores.slice().sort((a, b) => a.overall - b.overall)[0];
  const best   = scores.slice().sort((a, b) => b.overall - a.overall)[0];
  return { teams: scores, average: avg, worst, best };
}

export { WEIGHTS, grade, status };
