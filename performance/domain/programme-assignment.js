// CoachEasier Performance — programme assignment lifecycle (SC8).
//
// The assignment is the contract between a coach's published programme and an
// athlete's daily work. This module owns the RULES; the server owns storage
// and authorisation, and the UI owns rendering. Nothing here reaches either.
//
// Pure module: no DOM, no fetch, no clock, no randomness. Every function that
// needs "now" is given it.

import {
  ASSIGNMENT_SCHEMA_VERSION, ASSIGNMENT_STATUSES, TERMINAL_ASSIGNMENT_STATUSES,
  OCCUPYING_ASSIGNMENT_STATUSES, ASSIGNMENT_SOURCES, ASSIGNMENT_AUDIT_MAX,
  PROGRESSION_REVIEW_STATUSES,
} from '../types/assignment.js';

const isIsoDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const dayMs = 86400000;

/** UTC-midnight parse of a YYYY-MM-DD date. Avoids local-timezone drift. */
export function parseDate(value) {
  if (!isIsoDate(value)) return null;
  const t = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(t) ? t : null;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). Null when unparseable. */
export function daysBetween(from, to) {
  const a = parseDate(from); const b = parseDate(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / dayMs);
}

export function appendAssignmentAudit(log, { action, actor = null, at = null, detail = '' }) {
  const entry = { action, actor: actor || null, at: at || null, detail: String(detail || '').slice(0, 200) };
  return [...(Array.isArray(log) ? log : []), entry].slice(-ASSIGNMENT_AUDIT_MAX);
}

// ── Creation ────────────────────────────────────────────────────────────────

/**
 * Build a new assignment record.
 *
 * `contextSnapshot` is captured HERE and never recomputed: the athlete's group,
 * team and development context as they were on the day the coach assigned. A
 * later group move must not rewrite history (SC8 Part 3).
 *
 * The caller supplies the frozen SC4 snapshot (snapshotForProgrammeAssignment)
 * — this module never reaches into a live programme.
 */
export function createAssignment({
  assignmentId, clubId, athleteUserId, athleteMemberId = null, athleteName = '',
  programmeId, programmeVersionId, versionNumber, snapshot,
  assignedBy, assignedAt, startDate, endDate = null,
  source = 'coach_authored', notes = '',
  groupId = '', groupName = '', teamId = '', teamName = '',
  developmentContext = 'unknown', developmentSource = 'none', youthSafeguards = true,
  entitlement = null, reviewFlags = [], requiresReview = false, reviewAcknowledgedBy = null,
  status = 'scheduled', now,
}) {
  if (!assignmentId) throw new Error('assignment_id_required');
  if (!clubId) throw new Error('club_required');
  if (!athleteUserId) throw new Error('athlete_required');
  if (!programmeVersionId) throw new Error('programme_version_required');
  if (!snapshot || snapshot.kind !== 'programme_assignment_snapshot') throw new Error('snapshot_required');
  if (!isIsoDate(startDate)) throw new Error('start_date_required');
  if (endDate !== null && !isIsoDate(endDate)) throw new Error('bad_end_date');
  if (endDate !== null && daysBetween(startDate, endDate) < 0) throw new Error('end_before_start');
  if (!ASSIGNMENT_SOURCES.includes(source)) throw new Error('bad_source');
  if (!ASSIGNMENT_STATUSES.includes(status)) throw new Error('bad_status');

  return {
    kind: 'programme_assignment',
    schemaVersion: ASSIGNMENT_SCHEMA_VERSION,
    assignmentId,
    clubId,
    // Context AT ASSIGNMENT TIME — deliberately denormalised, never re-derived.
    groupId: String(groupId || ''),
    groupName: String(groupName || ''),
    teamId: String(teamId || ''),
    teamName: String(teamName || ''),
    athleteUserId,
    athleteMemberId,
    athleteName: String(athleteName || ''),
    programmeId,
    programmeVersionId,
    versionNumber: versionNumber ?? null,
    snapshot,                                  // frozen SC4 assignment snapshot
    assignedBy,
    assignedAt,
    startDate,
    endDate,
    status,
    source,
    notes: String(notes || '').slice(0, 1000),
    developmentContextSnapshot: {
      context: developmentContext,
      source: developmentSource,
      youthSafeguards: youthSafeguards !== false,
    },
    entitlementSnapshot: entitlement,          // {plan, status} at assignment time
    reviewFlags: [...reviewFlags],
    requiresReview: !!requiresReview,
    reviewAcknowledgedBy: reviewAcknowledgedBy || null,
    progressionReview: null,                   // {status, suggestedAt, ...} — SC6 seam
    pausedAt: null,
    resumedAt: null,
    endedAt: null,
    replacedByAssignmentId: null,
    createdAt: now,
    updatedAt: now,
    audit: appendAssignmentAudit([], { action: 'assignment_created', actor: assignedBy, at: now, detail: `v${versionNumber ?? '?'}` }),
  };
}

// ── Status transitions ──────────────────────────────────────────────────────
//
// Every transition is explicit and audited. Terminal states never reopen: a
// coach who wants an athlete back on a programme creates a NEW assignment, so
// the record of what actually happened stays intact.

const TRANSITIONS = {
  draft:     ['scheduled', 'cancelled'],
  scheduled: ['active', 'paused', 'cancelled', 'replaced'],
  active:    ['paused', 'completed', 'cancelled', 'replaced'],
  paused:    ['active', 'completed', 'cancelled', 'replaced'],
  completed: [],
  replaced:  [],
  cancelled: [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

function transition(assignment, to, { actor, at, action, detail = '', patch = {} }) {
  const from = assignment.status;
  if (!canTransition(from, to)) throw new Error(`bad_transition:${from}->${to}`);
  return {
    ...structuredClone(assignment),
    ...patch,
    status: to,
    updatedAt: at,
    audit: appendAssignmentAudit(assignment.audit, { action, actor, at, detail }),
  };
}

export function activateAssignment(a, { actor, at }) {
  return transition(a, 'active', { actor, at, action: 'assignment_activated' });
}

export function pauseAssignment(a, { actor, at, reason = '' }) {
  return transition(a, 'paused', { actor, at, action: 'assignment_paused', detail: reason, patch: { pausedAt: at } });
}

export function resumeAssignment(a, { actor, at }) {
  return transition(a, 'active', { actor, at, action: 'assignment_resumed', patch: { resumedAt: at } });
}

export function completeAssignment(a, { actor, at }) {
  return transition(a, 'completed', { actor, at, action: 'assignment_completed', patch: { endedAt: at } });
}

export function cancelAssignment(a, { actor, at, reason = '' }) {
  return transition(a, 'cancelled', { actor, at, action: 'assignment_cancelled', detail: reason, patch: { endedAt: at } });
}

/**
 * Mark an assignment replaced by another. The REPLACEMENT is created
 * separately; this only closes the outgoing one, so the athlete's history
 * shows both records and which one superseded which.
 */
export function markReplaced(a, { actor, at, replacementId }) {
  if (!replacementId) throw new Error('replacement_required');
  return transition(a, 'replaced', {
    actor, at, action: 'assignment_replaced', detail: replacementId,
    patch: { endedAt: at, replacedByAssignmentId: replacementId },
  });
}

// ── Derived state ───────────────────────────────────────────────────────────

/**
 * The status an assignment SHOULD present on a given date, without writing.
 * A scheduled assignment becomes active on its start date; an active one
 * completes after its end date. Storage catches up on the next write — reads
 * never mutate (the Core c79c07a8 rule).
 */
export function effectiveStatus(assignment, today) {
  const s = assignment.status;
  if (TERMINAL_ASSIGNMENT_STATUSES.includes(s) || s === 'paused' || s === 'draft') return s;
  const startDelta = daysBetween(assignment.startDate, today);
  if (startDelta === null) return s;
  if (startDelta < 0) return 'scheduled';
  if (assignment.endDate) {
    const endDelta = daysBetween(assignment.endDate, today);
    if (endDelta !== null && endDelta > 0) return 'completed';
  }
  return 'active';
}

/** Is this assignment the athlete's live programme today? */
export function isLiveToday(assignment, today) {
  return effectiveStatus(assignment, today) === 'active';
}

/**
 * Programme position on a date: which week, and which day-of-week index.
 * Week 1 starts on startDate. Returns null before the start date.
 */
export function programmePosition(assignment, today) {
  const delta = daysBetween(assignment.startDate, today);
  if (delta === null || delta < 0) return null;
  return {
    dayIndex: delta,
    week: Math.floor(delta / 7) + 1,
    dayOfWeek: ((parseDate(today) / dayMs) % 7 + 7) % 7,   // 0 = Thursday epoch-aligned; not used for matching
  };
}

/** Total weeks defined by the pinned snapshot's prescription tree. */
export function programmeWeekCount(assignment) {
  const phases = assignment?.snapshot?.prescriptionTree || [];
  return phases.reduce((n, p) => n + (p.weeks || []).length, 0);
}

/** Flatten the pinned tree into ordered weeks (phase-aware). */
export function orderedWeeks(assignment) {
  const out = [];
  for (const phase of assignment?.snapshot?.prescriptionTree || []) {
    for (const week of phase.weeks || []) out.push({ phase, week });
  }
  return out;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Calendar weekday label for a date, used to match SC4 training days. */
export function weekdayOf(dateStr) {
  const t = parseDate(dateStr);
  if (t === null) return null;
  return DAY_NAMES[new Date(t).getUTCDay()];
}

/**
 * Today's session from the PINNED snapshot — never from a live programme.
 *
 * Resolution is deliberately simple and deterministic (SC8 Part 15 defers the
 * adaptive scheduler): the programme week is derived from the start date, and
 * within that week the session is the one whose training day matches today's
 * weekday. No shifting, no catch-up, no silent substitution — an athlete who
 * misses Tuesday does not get Tuesday moved to Wednesday behind their back.
 *
 * @returns {{session, week, phase, weekNumber, dayNode}|null}
 */
export function sessionForDate(assignment, today) {
  if (!isLiveToday(assignment, today)) return null;
  const pos = programmePosition(assignment, today);
  if (!pos) return null;
  const weeks = orderedWeeks(assignment);
  if (!weeks.length) return null;
  const idx = pos.week - 1;
  if (idx >= weeks.length) return null;              // programme has run out
  const { phase, week } = weeks[idx];
  const wd = weekdayOf(today);
  for (const day of week.days || []) {
    if (day.day !== wd) continue;
    const session = (day.sessions || [])[0];
    if (session) return { session, week, phase, weekNumber: pos.week, dayNode: day };
  }
  return null;                                        // rest day — honest empty
}

/** Every session in the athlete's current programme week, for the plan view. */
export function weekPlan(assignment, today) {
  const pos = programmePosition(assignment, today);
  const weeks = orderedWeeks(assignment);
  if (!pos || !weeks.length) return [];
  const entry = weeks[pos.week - 1];
  if (!entry) return [];
  return (entry.week.days || []).flatMap((day) =>
    (day.sessions || []).map((session) => ({
      day: day.day, optional: !!day.optional, rugbyRelation: day.rugbyRelation || 'none',
      title: session.title, purpose: session.purpose, estimatedMinutes: session.estimatedMinutes ?? null,
      sessionId: session.id, isToday: day.day === weekdayOf(today),
    })));
}

/**
 * The exercise catalogue for THIS assignment — rebuilt from its pinned
 * snapshot, not from the live library.
 *
 * This is what makes historical fidelity real: a workout started from an
 * assignment uses the exercise definitions as they were when the coach
 * assigned it, so renaming, re-tiering or editing an exercise next month
 * cannot change what the athlete was actually asked to do. The shape is the
 * exact inverse of exercise-visibility.snapshotForAssignment().
 */
export function catalogueFromSnapshot(snapshot) {
  const snaps = snapshot?.exerciseSnapshots || {};
  return Object.values(snaps).map((e) => ({
    id: e.exerciseId,
    version: e.version,
    name: e.name,
    displayName: e.displayName || e.name,
    tier: e.tier,
    classification: e.classification || {},
    prescription: [...(e.prescription || [])],
    safety: { notes: [...(e.safetyNotes || [])], painStop: e.painStop || null },
  }));
}

// ── Conflicts ───────────────────────────────────────────────────────────────

/** Assignments occupying the athlete's primary slot right now. */
export function occupyingAssignments(assignments, athleteUserId) {
  return (assignments || []).filter((a) =>
    String(a.athleteUserId) === String(athleteUserId)
    && OCCUPYING_ASSIGNMENT_STATUSES.includes(a.status));
}

/**
 * Decide whether a new assignment may be created, and how.
 * Never silently overwrites: an existing occupant forces the caller to declare
 * `replace` or `schedule_after`, or the request is refused (SC8 Part 14).
 */
export function planAssignmentConflict(assignments, { athleteUserId, startDate, intent = 'assign' }) {
  const occupying = occupyingAssignments(assignments, athleteUserId);
  if (!occupying.length) return { ok: true, action: 'create', conflicts: [] };

  if (intent === 'replace') {
    return { ok: true, action: 'replace', conflicts: occupying };
  }
  if (intent === 'schedule_after') {
    const latestEnd = occupying
      .map((a) => a.endDate)
      .filter(Boolean)
      .sort()
      .pop() || null;
    if (latestEnd && daysBetween(latestEnd, startDate) <= 0) {
      return { ok: false, reason: 'starts_before_current_ends', conflicts: occupying, earliestStart: latestEnd };
    }
    return { ok: true, action: 'schedule_after', conflicts: occupying };
  }
  return { ok: false, reason: 'active_assignment_exists', conflicts: occupying };
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Everything that must be true before an assignment may be created. The server
 * re-checks scope and entitlement itself; this covers the domain rules so the
 * UI and the API cannot disagree about them.
 */
export function validateAssignmentRequest({
  version, snapshot, startDate, endDate = null, athleteEntitled = true,
  developmentContext = 'unknown', requiresReview = false, reviewAcknowledged = false,
}) {
  const errors = [];
  if (!version) errors.push('unknown_version');
  else if (version.versionStatus === 'draft') errors.push('cannot_assign_draft');
  else if (version.versionStatus === 'archived') errors.push('cannot_assign_archived');
  if (!snapshot || snapshot.kind !== 'programme_assignment_snapshot') errors.push('snapshot_required');
  if (!isIsoDate(startDate)) errors.push('start_date_required');
  if (endDate && !isIsoDate(endDate)) errors.push('bad_end_date');
  if (isIsoDate(startDate) && endDate && isIsoDate(endDate) && daysBetween(startDate, endDate) < 0) errors.push('end_before_start');
  if (!athleteEntitled) errors.push('athlete_not_entitled');
  // Provisional rule tables (SC5/SC6) mean a flagged programme needs a human
  // to say so explicitly. This is an acknowledgement of review, NOT medical
  // approval, and the wording everywhere says exactly that.
  if (requiresReview && !reviewAcknowledged) errors.push('coach_review_required');
  if (!developmentContext) errors.push('development_context_required');
  return { ok: errors.length === 0, errors };
}

// ── SC6 progression seam ────────────────────────────────────────────────────

/**
 * Attach an SC6 progression suggestion to an assignment as PENDING evidence.
 * It changes nothing: the pinned snapshot, the published version and the
 * athlete's Today session are all untouched until a coach acts on it.
 */
export function attachProgressionSuggestion(assignment, { suggestion, at, actor = null }) {
  return {
    ...structuredClone(assignment),
    progressionReview: {
      status: 'pending',
      suggestedAt: at,
      suggestion: structuredClone(suggestion),
      reviewedAt: null, reviewedBy: null, outcome: null,
    },
    updatedAt: at,
    audit: appendAssignmentAudit(assignment.audit, { action: 'progression_suggested', actor, at, detail: 'pending coach review' }),
  };
}

/** Record a coach's decision on a pending suggestion. Never publishes. */
export function reviewProgressionSuggestion(assignment, { outcome, actor, at, note = '' }) {
  if (!PROGRESSION_REVIEW_STATUSES.includes(outcome) || outcome === 'pending') throw new Error('bad_review_outcome');
  if (!assignment.progressionReview) throw new Error('no_pending_suggestion');
  return {
    ...structuredClone(assignment),
    progressionReview: {
      ...assignment.progressionReview,
      status: outcome, outcome, reviewedAt: at, reviewedBy: actor, note: String(note || '').slice(0, 500),
    },
    updatedAt: at,
    audit: appendAssignmentAudit(assignment.audit, { action: 'progression_reviewed', actor, at, detail: outcome }),
  };
}
