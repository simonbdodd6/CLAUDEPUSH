// CoachEasier Performance — workout session domain (SC7).
//
// Creates and mutates ACTIVE workout sessions from SC4-compatible session
// snapshots. The source prescription is captured once and never edited by
// logging: players record ACTUAL performance beside it. Completion freezes
// history (workout-completion.js). Pure module: no DOM, no fetch, no clock
// (every mutation takes `now`), no randomness.

import { snapshotForAssignment } from './exercise-visibility.js';
import { substitutionCandidates } from './exercise-substitution.js';
import { equipmentGap } from './exercise.js';
import {
  DEFAULT_REST_SEC, EXERCISE_LOG_STATUSES, PAIN_STOP_GUIDANCE,
  SESSION_STATUSES, SET_LOG_STATUSES, SUBSTITUTION_REQUEST_REASONS,
  WORKOUT_AUDIT_MAX, WORKOUT_SCHEMA_VERSION,
} from '../types/workout.js';

// ── Audit ───────────────────────────────────────────────────────────────────

export function appendWorkoutAudit(log, { action, at, detail = '' }) {
  const next = [...(log || []), { action, at, detail: String(detail).slice(0, 160) }];
  return next.length > WORKOUT_AUDIT_MAX ? next.slice(next.length - WORKOUT_AUDIT_MAX) : next;
}

// ── Session creation (Part 2/26) ────────────────────────────────────────────

/**
 * Build an executable workout session from an SC4 session node. Captures a
 * frozen source snapshot (session structure + SC3 exercise snapshots) so
 * later programme/exercise edits can never change what was executed.
 *
 * @param {object} args
 * @param {string} args.athleteId
 * @param {object} args.programme      SC4 programme (for refs/title)
 * @param {object} args.sessionNode    SC4 session node (blocks → prescriptions → sets)
 * @param {Array}  args.catalogue      SC3 catalogue for exercise snapshots
 * @param {object} [args.meta]         {programmeVersionId, assignmentId, phase, week, matchContext, developmentContext}
 * @param {string} args.now
 */
export function createWorkoutSession({ athleteId, programme = null, sessionNode, catalogue = [], meta = {}, now }) {
  if (!sessionNode || sessionNode.kind !== 'session') throw new Error('not_a_session_node');
  const byId = new Map(catalogue.map((e) => [e.id, e]));

  const exerciseLogs = [];
  for (const block of sessionNode.blocks || []) {
    for (const p of block.prescriptions || []) {
      const ex = byId.get(p.exerciseId);
      if (!ex) throw new Error(`unknown_exercise:${p.exerciseId}`);
      const exerciseSnapshot = snapshotForAssignment(ex, now);
      const prescribedSets = (p.sets || []).map((s, i) => ({
        setNumber: i + 1,
        prescribed: structuredClone(s.fields || {}),
        isWarmup: false,
        actual: { reps: null, load: null, rpe: null, rir: null, durationSec: null, distanceM: null },
        status: 'pending',
        techniqueStatus: null,
        note: '',
        completedAt: null,
      }));
      exerciseLogs.push({
        logId: `wl:${p.id}`,
        blockType: block.blockType,
        exerciseId: p.exerciseId,
        exerciseVersion: ex.version,
        exerciseSnapshot,
        sourcePrescriptionId: p.id,
        sourcePrescription: structuredClone(p),
        coachingNotes: p.coachingNotes || '',
        substitution: null, // {originalExerciseId, substituteSnapshot, reason, at, source}
        status: 'pending',
        painStop: null,     // {at, guidance}
        sets: prescribedSets,
        restSec: firstDefined((p.sets || []).map((s) => s.fields?.restSec)) ?? DEFAULT_REST_SEC,
        exerciseNote: '',
        startedAt: null,
        finishedAt: null,
      });
    }
  }
  if (!exerciseLogs.length) throw new Error('empty_session');

  return {
    kind: 'workout_session',
    schemaVersion: WORKOUT_SCHEMA_VERSION,
    workoutSessionId: `ws:${sessionNode.id}:${now}`,
    athleteId: athleteId || null,
    programmeId: programme?.id || null,
    programmeTitle: programme?.title || null,
    programmeVersionId: meta.programmeVersionId || null,
    programmeAssignmentId: meta.assignmentId || null,
    sourceSessionId: sessionNode.id,
    sourceSessionSnapshot: structuredClone({
      id: sessionNode.id, title: sessionNode.title, purpose: sessionNode.purpose,
      estimatedMinutes: sessionNode.estimatedMinutes, objective: sessionNode.objective,
      phase: meta.phase || null, week: meta.week || null,
    }),
    developmentContext: meta.developmentContext || 'unknown',
    matchContext: meta.matchContext || null,
    readiness: null,          // optional pre-workout snapshot
    readinessAdjustment: null,
    status: 'not_started',
    startedAt: null,
    completedAt: null,
    pausedAt: null,
    currentExerciseIndex: 0,
    exerciseLogs,
    sessionNote: '',
    reviewFlags: [],
    timer: { endsAt: null, running: false },
    audit: [],
  };
}

function firstDefined(list) {
  return list.find((v) => v !== null && v !== undefined);
}

// ── Lifecycle (Parts 2/16) — all pure: session in, new session out ──────────

export function startWorkout(session, now) {
  if (session.status !== 'not_started') return session;
  const s = structuredClone(session);
  s.status = 'in_progress';
  s.startedAt = now;
  s.audit = appendWorkoutAudit(s.audit, { action: 'workout_started', at: now });
  return s;
}

export function pauseWorkout(session, now) {
  if (session.status !== 'in_progress') return session;
  const s = structuredClone(session);
  s.status = 'paused';
  s.pausedAt = now;
  s.audit = appendWorkoutAudit(s.audit, { action: 'workout_paused', at: now });
  return s;
}

export function resumeWorkout(session, now) {
  if (session.status !== 'paused' && session.status !== 'in_progress') return session;
  const s = structuredClone(session);
  s.status = 'in_progress';
  s.pausedAt = null;
  s.audit = appendWorkoutAudit(s.audit, { action: 'workout_resumed', at: now });
  return s;
}

export function abandonWorkout(session, now) {
  const s = structuredClone(session);
  s.status = 'abandoned';
  s.completedAt = now;
  s.audit = appendWorkoutAudit(s.audit, { action: 'session_abandoned', at: now });
  return s;
}

export function recordReadiness(session, { scores, adjustmentText = null }, now) {
  const s = structuredClone(session);
  s.readiness = { date: now, scores: structuredClone(scores) };
  s.readinessAdjustment = adjustmentText;
  s.audit = appendWorkoutAudit(s.audit, { action: 'readiness_recorded', at: now });
  return s;
}

// ── Set logging (Parts 4/9) ─────────────────────────────────────────────────

/**
 * Record a set. The SOURCE prescription is never modified — only `actual`.
 * @param {object} patch {reps?, load?, rpe?, rir?, durationSec?, distanceM?, status, techniqueStatus?, note?}
 */
export function logSet(session, exerciseIndex, setIndex, patch, now) {
  const s = structuredClone(session);
  const log = s.exerciseLogs[exerciseIndex];
  if (!log) throw new Error('bad_exercise_index');
  const set = log.sets[setIndex];
  if (!set) throw new Error('bad_set_index');
  const status = SET_LOG_STATUSES.includes(patch.status) ? patch.status : 'completed';

  set.actual = {
    reps: patch.reps ?? set.actual.reps,
    load: patch.load !== undefined ? structuredClone(patch.load) : set.actual.load,
    rpe: patch.rpe ?? set.actual.rpe,
    rir: patch.rir ?? set.actual.rir,
    durationSec: patch.durationSec ?? set.actual.durationSec,
    distanceM: patch.distanceM ?? set.actual.distanceM,
  };
  set.status = status;
  set.techniqueStatus = patch.techniqueStatus ?? set.techniqueStatus;
  if (patch.note !== undefined) set.note = String(patch.note).slice(0, 200);
  set.completedAt = now;

  if (log.status === 'pending') { log.status = 'in_progress'; log.startedAt = log.startedAt || now; }
  const action = status === 'completed' ? 'set_completed' : status === 'skipped' ? 'set_skipped' : 'set_failed';
  s.audit = appendWorkoutAudit(s.audit, { action, at: now, detail: `${log.exerciseSnapshot.name} set ${set.setNumber}: ${status}` });

  if (log.sets.every((x) => x.status !== 'pending')) {
    log.status = log.sets.every((x) => x.status === 'skipped') ? 'skipped'
      : log.sets.some((x) => x.status !== 'completed') ? 'partial' : 'completed';
    log.finishedAt = now;
  }
  return s;
}

export function skipSet(session, exerciseIndex, setIndex, now) {
  return logSet(session, exerciseIndex, setIndex, { status: 'skipped' }, now);
}

export function setSessionNote(session, note) {
  const s = structuredClone(session);
  s.sessionNote = String(note || '').slice(0, 500);
  return s;
}

export function setExerciseNote(session, exerciseIndex, note) {
  const s = structuredClone(session);
  if (s.exerciseLogs[exerciseIndex]) s.exerciseLogs[exerciseIndex].exerciseNote = String(note || '').slice(0, 300);
  return s;
}

export function setCurrentExercise(session, index) {
  const s = structuredClone(session);
  s.currentExerciseIndex = Math.max(0, Math.min(index, s.exerciseLogs.length - 1));
  return s;
}

// ── Substitution (Part 14) — SC3 rules; never for pain ─────────────────────

export function eligibleSubstitutes(session, exerciseIndex, catalogue, { athleteEquipment = null, techLevel = null, viewer = null } = {}) {
  const log = session.exerciseLogs[exerciseIndex];
  if (!log) return [];
  const original = catalogue.find((e) => e.id === log.exerciseId);
  if (!original) return [];
  return substitutionCandidates(original, catalogue, {
    athleteEquipment, techLevel, viewer, equipmentGapFn: equipmentGap,
  }).slice(0, 6);
}

export function substituteExercise(session, exerciseIndex, substitute, reasonId, now, source = 'player_request') {
  if (!SUBSTITUTION_REQUEST_REASONS.some((r) => r.id === reasonId)) throw new Error(`bad_substitution_reason:${reasonId}`);
  const s = structuredClone(session);
  const log = s.exerciseLogs[exerciseIndex];
  if (!log) throw new Error('bad_exercise_index');
  if (log.painStop) throw new Error('pain_requires_review_not_substitution');
  log.substitution = {
    originalExerciseId: log.exerciseId,
    originalExerciseName: log.exerciseSnapshot.name,
    substituteExerciseId: substitute.id,
    substituteSnapshot: snapshotForAssignment(substitute, now),
    reason: reasonId,
    at: now,
    source,
  };
  log.exerciseId = substitute.id;
  log.exerciseVersion = substitute.version;
  log.exerciseSnapshot = log.substitution.substituteSnapshot;
  log.status = log.status === 'pending' ? 'pending' : log.status;
  s.audit = appendWorkoutAudit(s.audit, { action: 'exercise_substituted', at: now, detail: `${log.substitution.originalExerciseName} → ${substitute.name} (${reasonId})` });
  return s;
}

// ── Pain / stop (Part 15) — safety-critical ─────────────────────────────────

/**
 * Stop an exercise for reported pain. Remaining sets become pain_stop, the
 * exercise is excluded from positive progression evidence, a review flag is
 * raised, and NO alternative is suggested. Unrelated exercises may continue.
 */
export function painStopExercise(session, exerciseIndex, now) {
  const s = structuredClone(session);
  const log = s.exerciseLogs[exerciseIndex];
  if (!log) throw new Error('bad_exercise_index');
  log.painStop = { at: now, guidance: PAIN_STOP_GUIDANCE };
  log.status = 'pain_stopped';
  log.finishedAt = now;
  for (const set of log.sets) {
    if (set.status === 'pending') { set.status = 'pain_stop'; set.completedAt = now; }
  }
  if (!s.reviewFlags.includes('pain_stop_review')) s.reviewFlags.push('pain_stop_review');
  s.audit = appendWorkoutAudit(s.audit, { action: 'exercise_stopped_pain', at: now, detail: log.exerciseSnapshot.name });
  return s;
}

// ── Progress helpers ────────────────────────────────────────────────────────

export function sessionProgress(session) {
  const all = session.exerciseLogs.flatMap((l) => l.sets);
  const done = all.filter((x) => x.status !== 'pending').length;
  const exercisesDone = session.exerciseLogs.filter((l) => l.status !== 'pending' && l.status !== 'in_progress').length;
  return {
    setsDone: done, setsTotal: all.length,
    exercisesDone, exercisesTotal: session.exerciseLogs.length,
    pct: all.length ? Math.round((done / all.length) * 100) : 0,
  };
}

export function nextPendingSet(session, exerciseIndex) {
  const log = session.exerciseLogs[exerciseIndex];
  if (!log) return null;
  const i = log.sets.findIndex((x) => x.status === 'pending');
  return i === -1 ? null : i;
}

export function validateSessionStatuses(session) {
  const errors = [];
  if (!SESSION_STATUSES.includes(session.status)) errors.push('bad_status');
  for (const log of session.exerciseLogs || []) {
    if (!EXERCISE_LOG_STATUSES.includes(log.status)) errors.push(`bad_log_status:${log.logId}`);
    for (const set of log.sets || []) {
      if (!SET_LOG_STATUSES.includes(set.status)) errors.push(`bad_set_status:${log.logId}:${set.setNumber}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
