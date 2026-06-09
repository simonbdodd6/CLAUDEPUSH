/**
 * Fixture Timeline
 *
 * Generates the automated preparation timeline for every fixture.
 * Each fixture produces a checklist of time-triggered tasks based on
 * how many days remain until kickoff.
 *
 * Timeline stages:
 *   14+ days  — season planning / scheduling
 *   7 days    — squad review
 *   5 days    — injury & availability analysis
 *   3 days    — volunteer confirmation
 *   2 days    — attendance confirmation & pre-match brief
 *   1 day     — generate match pack
 *   Matchday  — lock squad / pre-match checklist
 *   Post +0   — request coach review
 *   Post +1   — generate player reports
 *   Post +3   — update Digital Twin
 */

import { daysToKickoff, PREP_STAGE } from './fixture-schema.js';

// ── Task definitions ──────────────────────────────────────────────────────────

const TASK_TYPES = {
  SQUAD_REVIEW:        'squad_review',
  INJURY_ANALYSIS:     'injury_analysis',
  VOLUNTEER_CHECK:     'volunteer_check',
  ATTENDANCE_CONFIRM:  'attendance_confirm',
  MATCH_PACK:          'match_pack',
  SQUAD_LOCK:          'squad_lock',
  COACH_REVIEW:        'coach_review',
  PLAYER_REPORTS:      'player_reports',
  TWIN_UPDATE:         'twin_update',
  TRANSPORT_ARRANGE:   'transport_arrange',
  OPPOSITION_RESEARCH: 'opposition_research',
  VENUE_CONFIRM:       'venue_confirm',
  MEDICAL_BRIEF:       'medical_brief',
  PRE_MATCH_BRIEF:     'pre_match_brief',
};

export const TASK_STATUS = {
  PENDING:    'pending',
  IN_PROGRESS:'in_progress',
  DONE:       'done',
  SKIPPED:    'skipped',
  OVERDUE:    'overdue',
};

/**
 * Generate the full preparation timeline for a fixture.
 * Returns an array of tasks, each with a dueAt timestamp.
 */
export function generateTimeline(fixture) {
  if (!fixture.kickoff) return [];

  const ko    = new Date(fixture.kickoff);
  const tasks = [];

  // Helper: due date relative to kickoff
  const due = (offsetDays) => new Date(ko.getTime() + offsetDays * 86400_000).toISOString();

  // ── 14 days before: opposition research ─────────────────────────────────
  tasks.push(task(
    TASK_TYPES.OPPOSITION_RESEARCH,
    PREP_STAGE.EARLY,
    due(-14),
    `Research ${fixture.opponent} — look up recent form, key players, typical lineup.`,
    'DoR or Head Coach',
    { priority: 'medium' },
  ));

  // ── 7 days before: squad review ─────────────────────────────────────────
  tasks.push(task(
    TASK_TYPES.SQUAD_REVIEW,
    PREP_STAGE.EARLY,
    due(-7),
    `Review full squad availability for ${fixture.opponent} (${dateLabel(fixture.kickoff)}).`,
    'Head Coach',
    { priority: 'high', autoAction: 'prepareFixture' },
  ));

  // ── 5 days before: injury & availability analysis ───────────────────────
  tasks.push(task(
    TASK_TYPES.INJURY_ANALYSIS,
    PREP_STAGE.MID,
    due(-5),
    `Analyse injuries and uncertain players. Update availability for ${fixture.teamName} vs ${fixture.opponent}.`,
    'Head Coach / Physio',
    { priority: 'high' },
  ));

  // ── 4 days before: venue confirmation ───────────────────────────────────
  tasks.push(task(
    TASK_TYPES.VENUE_CONFIRM,
    PREP_STAGE.MID,
    due(-4),
    `Confirm ${fixture.isHome ? 'home pitch' : `away venue: ${fixture.venue}`} and referee details.`,
    'Club Secretary',
    { priority: 'medium' },
  ));

  // ── 3 days before: volunteer confirmation ───────────────────────────────
  tasks.push(task(
    TASK_TYPES.VOLUNTEER_CHECK,
    PREP_STAGE.MID,
    due(-3),
    `Confirm all volunteer roles for ${fixture.teamName} vs ${fixture.opponent}. Missing: first aider, linesman, timekeeper.`,
    'Team Manager',
    { priority: 'high', autoAction: 'checkVolunteers' },
  ));

  // ── Away transport ───────────────────────────────────────────────────────
  if (fixture.isHome === false) {
    tasks.push(task(
      TASK_TYPES.TRANSPORT_ARRANGE,
      PREP_STAGE.MID,
      due(-4),
      `Arrange transport to ${fixture.venue} for away fixture.`,
      'Team Manager',
      { priority: 'high' },
    ));
  }

  // ── 2 days before: attendance confirmation + pre-match brief ────────────
  tasks.push(task(
    TASK_TYPES.ATTENDANCE_CONFIRM,
    PREP_STAGE.FINAL,
    due(-2),
    `Confirm player attendance. Send "Are you available Saturday?" to full squad.`,
    'Head Coach',
    { priority: 'high' },
  ));

  tasks.push(task(
    TASK_TYPES.MEDICAL_BRIEF,
    PREP_STAGE.FINAL,
    due(-2),
    `Medical brief: review all injury statuses and match-day medical requirements.`,
    'Physio / First Aider',
    { priority: 'medium' },
  ));

  // ── 1 day before: match pack ─────────────────────────────────────────────
  tasks.push(task(
    TASK_TYPES.MATCH_PACK,
    PREP_STAGE.FINAL,
    due(-1),
    `Generate full match pack for ${fixture.opponent} — squad, opposition, session plan, volunteer sheet.`,
    'Head Coach',
    { priority: 'critical', autoAction: 'generateMatchPack' },
  ));

  tasks.push(task(
    TASK_TYPES.PRE_MATCH_BRIEF,
    PREP_STAGE.FINAL,
    due(-1),
    `Send pre-match brief to players, parents and volunteers.`,
    'Team Manager',
    { priority: 'high' },
  ));

  // ── Matchday: squad lock ─────────────────────────────────────────────────
  tasks.push(task(
    TASK_TYPES.SQUAD_LOCK,
    PREP_STAGE.MATCHDAY,
    due(0),
    `Lock final squad selection for ${fixture.teamName} vs ${fixture.opponent}. No further changes.`,
    'Head Coach',
    { priority: 'critical', autoAction: 'lockSquad' },
  ));

  // ── Post-match: coach review ─────────────────────────────────────────────
  tasks.push(task(
    TASK_TYPES.COACH_REVIEW,
    PREP_STAGE.POST,
    due(0),
    `Submit post-match notes. Result, standout performances, areas to improve.`,
    'Head Coach',
    { priority: 'high', autoAction: 'requestCoachReview' },
  ));

  // ── Post +1: player reports ──────────────────────────────────────────────
  tasks.push(task(
    TASK_TYPES.PLAYER_REPORTS,
    PREP_STAGE.POST,
    due(1),
    `Generate individual player performance notes from match observations.`,
    'Head Coach',
    { priority: 'medium', autoAction: 'generatePlayerReports' },
  ));

  // ── Post +3: Digital Twin update ─────────────────────────────────────────
  tasks.push(task(
    TASK_TYPES.TWIN_UPDATE,
    PREP_STAGE.POST,
    due(3),
    `Update Club Digital Twin with match result, attendance, and injury changes.`,
    'System (auto)',
    { priority: 'medium', autoAction: 'updateDigitalTwin' },
  ));

  return tasks;
}

// ── Actionable tasks (due now or overdue) ─────────────────────────────────────

export function getActionableTasks(fixture) {
  const now  = new Date();
  return (fixture.preparationChecklist ?? []).filter(t => {
    if (t.status === TASK_STATUS.DONE || t.status === TASK_STATUS.SKIPPED) return false;
    const due = new Date(t.dueAt);
    return due <= now;
  }).map(t => ({
    ...t,
    status: new Date(t.dueAt) < now ? TASK_STATUS.OVERDUE : TASK_STATUS.PENDING,
  }));
}

export function getUpcomingTasks(fixture, withinDays = 7) {
  const now    = new Date();
  const cutoff = new Date(now.getTime() + withinDays * 86400_000);
  return (fixture.preparationChecklist ?? []).filter(t => {
    if (t.status === TASK_STATUS.DONE || t.status === TASK_STATUS.SKIPPED) return false;
    const d = new Date(t.dueAt);
    return d >= now && d <= cutoff;
  }).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
}

export function markTaskDone(fixture, taskType) {
  const t = fixture.preparationChecklist?.find(t => t.type === taskType);
  if (t) { t.status = TASK_STATUS.DONE; t.completedAt = new Date().toISOString(); }
  return fixture;
}

// ── Timeline progress ─────────────────────────────────────────────────────────

export function timelineProgress(fixture) {
  const tasks   = fixture.preparationChecklist ?? [];
  const total   = tasks.length;
  const done    = tasks.filter(t => t.status === TASK_STATUS.DONE || t.status === TASK_STATUS.SKIPPED).length;
  const overdue = tasks.filter(t => {
    if (t.status === TASK_STATUS.DONE || t.status === TASK_STATUS.SKIPPED) return false;
    return new Date(t.dueAt) < new Date();
  }).length;
  return {
    total,
    done,
    overdue,
    pending: total - done - overdue,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}

// ── Task factory ──────────────────────────────────────────────────────────────

let _taskSeq = 0;
function task(type, stage, dueAt, description, assignee, meta = {}) {
  return {
    id:          `task_${++_taskSeq}`,
    type,
    stage,
    dueAt,
    description,
    assignee,
    status:      TASK_STATUS.PENDING,
    priority:    meta.priority    ?? 'medium',
    autoAction:  meta.autoAction  ?? null,
    completedAt: null,
    notes:       null,
  };
}

// ── Utility ───────────────────────────────────────────────────────────────────

function dateLabel(isoDate) {
  if (!isoDate) return 'TBC';
  return new Date(isoDate).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
}

export { TASK_TYPES };
