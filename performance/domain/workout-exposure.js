// CoachEasier Performance — workout → SC6 exposure records (SC7).
//
// Translates completed workouts into the exposure evidence SC6 consumes.
// SC7 never calculates progression itself — SC6 remains authoritative.
// Only eligible work counts as positive evidence: pain-stops, skips,
// warm-ups, technical failures and non-comparable substitutions are
// excluded or flagged. Pure module: no DOM, no fetch, no clock,
// no randomness.

import { classifyExposure } from './progression-evidence.js';
import { decideProgression } from './progression-rules.js';
import { SET_STATUS_TO_SC6 } from '../types/workout.js';

// ── Exposure generation (Part 22) ───────────────────────────────────────────

/**
 * Build one SC6-compatible exposure record per exercise log of a COMPLETED
 * workout. Substituted exercises produce an exposure for the SUBSTITUTE
 * (that is what was performed), flagged non-comparable to the original.
 *
 * @returns {Array<{exerciseId, exerciseVersion, date, classified, session,
 *                  eligible, excludedReason, substitution, sourceWorkoutId,
 *                  programmeId, programmeVersionId, prescription, actualSets}>}
 */
export function exposuresFromWorkout(workout) {
  if (!workout || workout.kind !== 'workout_session' || !workout.completedAt) return [];
  const out = [];
  for (const log of workout.exerciseLogs) {
    const workSets = log.sets.filter((s) => !s.isWarmup); // warm-ups never count
    const sc6Sets = workSets
      .filter((s) => s.status !== 'skipped' || workSets.every((x) => x.status === 'skipped'))
      .map((s) => ({
        result: SET_STATUS_TO_SC6[s.status] || 'missed_target',
        repsDone: s.actual.reps ?? undefined,
        repsTarget: repTarget(s.prescribed),
        achievedRpe: s.actual.rpe ?? undefined,
        achievedRir: s.actual.rir ?? undefined,
      }));

    const fullySkipped = workSets.every((s) => s.status === 'skipped');
    const session = fullySkipped
      ? { date: workout.completedAt, missed: true }
      : { date: workout.completedAt, sets: sc6Sets };
    const classified = classifyExposure(session, {
      rpeTarget: firstNumber(workSets.map((s) => s.prescribed?.rpe)),
      repRangeTop: repRangeTop(workSets[0]?.prescribed),
    });

    let eligible = true;
    let excludedReason = null;
    if (log.painStop) { eligible = false; excludedReason = 'pain_stop'; }
    else if (fullySkipped) { eligible = false; excludedReason = 'skipped'; }
    else if (classified.technicalFailures > 0 && classified.outcome !== 'successful') { eligible = false; excludedReason = 'technical_failure'; }

    out.push({
      exerciseId: log.exerciseId,
      exerciseVersion: log.exerciseVersion,
      date: workout.completedAt,
      classified,
      eligible,
      excludedReason,
      substitution: log.substitution
        ? { originalExerciseId: log.substitution.originalExerciseId, reason: log.substitution.reason, comparableToOriginal: false }
        : null,
      sourceWorkoutId: workout.workoutSessionId,
      programmeId: workout.programmeId,
      programmeVersionId: workout.programmeVersionId,
      prescription: structuredClone(log.sourcePrescription),
      actualSets: workSets.map((s) => ({ status: s.status, actual: structuredClone(s.actual), techniqueStatus: s.techniqueStatus })),
    });
  }
  return out;
}

function firstNumber(list) {
  return list.find((v) => Number.isFinite(v)) ?? null;
}

function repTarget(prescribed) {
  if (!prescribed) return undefined;
  if (Number.isInteger(prescribed.reps)) return prescribed.reps;
  const top = repRangeTop(prescribed);
  return top ?? undefined;
}

function repRangeTop(prescribed) {
  if (!prescribed) return null;
  if (typeof prescribed.reps === 'string' && /^\d+\s*[-–]\s*\d+$/.test(prescribed.reps)) {
    return Number(prescribed.reps.split(/[-–]/)[1]);
  }
  if (Number.isInteger(prescribed.reps)) return prescribed.reps;
  return null;
}

// ── Progression preview (Part 23) — SC6 remains authoritative ───────────────

/**
 * Preview SC6's decision for one exercise after this workout, appending
 * the fresh exposure to the provided prior history. Never mutates any
 * programme and never publishes — display only.
 */
export function progressionPreviewForExercise(workout, logIndex, {
  exercise, priorHistory = [], prescription, equipmentKind = 'barbell',
  athlete = {}, match = {}, readinessEntries = [], overrides = [], asOf,
}) {
  const exposures = exposuresFromWorkout(workout);
  const mine = exposures[logIndex];
  if (!mine) return null;
  const history = [...priorHistory, mine.classified];
  return decideProgression({
    ids: {
      athleteRef: workout.athleteId, programmeRef: workout.programmeId,
      programmeVersionRef: workout.programmeVersionId, exerciseId: mine.exerciseId,
      exerciseVersion: mine.exerciseVersion,
    },
    exercise, prescription, equipmentKind, history,
    readiness: readinessEntries, match, athlete, overrides,
    restrictions: { painReported: !!workout.exerciseLogs[logIndex].painStop },
    asOf: asOf || workout.completedAt,
  });
}
