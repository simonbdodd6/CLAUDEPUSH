// CoachEasier Performance — workout session domain tests (SC7).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import * as W from '../services/workout-runtime.js';
import { EXERCISES, getExerciseBySlug } from '../services/exercise-catalogue.js';
import { validateSessionStatuses } from '../domain/workout-session.js';

const NOW = '2026-08-20T17:00:00.000Z';
const later = (m) => `2026-08-20T17:${String(m).padStart(2, '0')}:00.000Z`;

function freshSession() {
  const demo = W.getDemoAssignment();
  return W.createWorkoutSession({
    athleteId: 'u1', programme: demo.programme, sessionNode: demo.sessionNode,
    catalogue: EXERCISES, meta: demo.meta, now: NOW,
  });
}

// ── Creation (Parts 2/3/26) ─────────────────────────────────────────────────

test('session is built from a real SC4 session node with frozen exercise snapshots', () => {
  const s = freshSession();
  assert.equal(s.kind, 'workout_session');
  assert.equal(s.schemaVersion, 1);
  assert.equal(s.sourceSessionSnapshot.title, 'Lower Body Strength — Week 3, Day 1');
  assert.equal(s.programmeVersionId, 'prog-demo-preseason@v1');
  assert.equal(s.exerciseLogs.length, 4);
  const squat = s.exerciseLogs[0];
  assert.equal(squat.exerciseId, 'ex-back-squat');
  assert.equal(squat.exerciseVersion, 1, 'exercise version pinned');
  assert.ok(Object.isFrozen(squat.exerciseSnapshot), 'SC3 snapshot frozen');
  assert.ok(squat.exerciseSnapshot.painStop, 'safety text preserved for history');
  assert.deepEqual(squat.sets[0].prescribed, { sets: 3, reps: 5, load: 100, rpe: 7, restSec: 180 });
  assert.equal(squat.restSec, 180, 'prescribed rest surfaced');
  assert.equal(s.status, 'not_started');
  const ids = new Set(s.exerciseLogs.map((l) => l.logId));
  assert.equal(ids.size, 4, 'unique log ids');
});

test('creation rejects unknown exercises and non-session nodes', () => {
  const demo = W.getDemoAssignment();
  assert.throws(() => W.createWorkoutSession({ sessionNode: { kind: 'block' }, catalogue: EXERCISES, now: NOW }), /not_a_session_node/);
  assert.throws(() => W.createWorkoutSession({ sessionNode: demo.sessionNode, catalogue: [], now: NOW }), /unknown_exercise/);
});

// ── Lifecycle ───────────────────────────────────────────────────────────────

test('lifecycle: start → pause → resume with audit; statuses validate', () => {
  let s = freshSession();
  s = W.startWorkout(s, later(1));
  assert.equal(s.status, 'in_progress');
  s = W.pauseWorkout(s, later(5));
  assert.equal(s.status, 'paused');
  s = W.resumeWorkout(s, later(7));
  assert.equal(s.status, 'in_progress');
  assert.deepEqual(s.audit.map((a) => a.action), ['workout_started', 'workout_paused', 'workout_resumed']);
  assert.ok(validateSessionStatuses(s).ok);
});

// ── Set logging (Parts 4/27) ────────────────────────────────────────────────

test('logging records ACTUAL beside the untouched SOURCE prescription', () => {
  let s = W.startWorkout(freshSession(), later(1));
  const sourceBefore = JSON.stringify(s.exerciseLogs[0].sourcePrescription);
  s = W.logSet(s, 0, 0, { reps: 4, load: W.makeLoad('kg', 95), rpe: 8.5, status: 'completed', note: 'moved well' }, later(4));
  const set = s.exerciseLogs[0].sets[0];
  assert.equal(set.actual.reps, 4);
  assert.equal(set.actual.load.value, 95);
  assert.equal(set.actual.rpe, 8.5);
  assert.equal(set.note, 'moved well');
  assert.deepEqual(set.prescribed, { sets: 3, reps: 5, load: 100, rpe: 7, restSec: 180 }, 'prescribed untouched');
  assert.equal(JSON.stringify(s.exerciseLogs[0].sourcePrescription), sourceBefore, 'source prescription immutable to logging');
});

test('every set status logs correctly; exercise status derives from set states', () => {
  let s = W.startWorkout(freshSession(), later(1));
  for (const status of ['completed', 'partial', 'failed_effort', 'failed_technical', 'aborted', 'skipped']) {
    s = W.logSet(s, 1, 0, { status }, later(10));
    assert.equal(s.exerciseLogs[1].sets[0].status, status);
  }
  // squat: complete → exercise stays in_progress until all its sets resolve
  s = W.logSet(s, 0, 0, { status: 'completed', reps: 5 }, later(11));
  assert.equal(s.exerciseLogs[0].status, 'completed', 'single-set exercise completes');
  assert.ok(s.audit.some((a) => a.action === 'set_completed'));
  assert.ok(s.audit.some((a) => a.action === 'set_failed'));
});

test('players cannot alter safety/prescription surfaces through logging APIs', () => {
  let s = W.startWorkout(freshSession(), later(1));
  const snapBefore = JSON.stringify(s.exerciseLogs[0].exerciseSnapshot);
  const srcBefore = JSON.stringify(s.exerciseLogs[0].sourcePrescription);
  s = W.logSet(s, 0, 0, { status: 'completed', reps: 3, load: W.makeLoad('kg', 60), rpe: 9, note: 'x' }, later(3));
  s = W.setExerciseNote(s, 0, 'note');
  s = W.setSessionNote(s, 'session note');
  assert.equal(JSON.stringify(s.exerciseLogs[0].exerciseSnapshot), snapBefore, 'no logging API touches the exercise definition');
  assert.equal(JSON.stringify(s.exerciseLogs[0].sourcePrescription), srcBefore, 'no logging API touches the source prescription');
  const done = W.completeWorkout(s, { now: later(30) });
  assert.ok(Object.isFrozen(done) && Object.isFrozen(done.exerciseLogs[0].sets[0]), 'completed history deep-frozen');
});

// ── Substitution (Part 14) ──────────────────────────────────────────────────

test('substitution: SC3-eligible alternatives only; original + substitute preserved', () => {
  let s = W.startWorkout(freshSession(), later(1));
  const alts = W.eligibleSubstitutes(s, 0, EXERCISES, { athleteEquipment: { locations: ['commercial_gym'], items: [] } });
  assert.ok(alts.length > 0);
  assert.ok(alts.every((a) => a.exercise.status === 'approved' && a.exercise.tier === 'validated'), 'no draft/private/club leakage');
  const sub = alts[0].exercise;
  s = W.substituteExercise(s, 0, sub, 'equipment_unavailable', later(2));
  const log = s.exerciseLogs[0];
  assert.equal(log.exerciseId, sub.id);
  assert.equal(log.substitution.originalExerciseId, 'ex-back-squat', 'original preserved');
  assert.equal(log.substitution.reason, 'equipment_unavailable');
  assert.ok(s.audit.some((a) => a.action === 'exercise_substituted'));
  assert.throws(() => W.substituteExercise(s, 0, sub, 'felt_pain', later(3)), /bad_substitution_reason/, 'pain is not a substitution reason');
});

test('substitution respects equipment: bodyweight athlete sees kit-free alternatives only', () => {
  const s = freshSession();
  const alts = W.eligibleSubstitutes(s, 0, EXERCISES, { athleteEquipment: { locations: ['bodyweight_only'], items: [] } });
  assert.ok(alts.every((a) => !a.exercise.equipment.required.some((r) => ['barbell', 'rack', 'dumbbells', 'machines', 'trap_bar'].includes(r))));
});

// ── Pain / stop (Part 15) ───────────────────────────────────────────────────

test('pain-stop: hard stop, review flag, remaining sets pain_stop, no substitution path', () => {
  let s = W.startWorkout(freshSession(), later(1));
  s = W.logSet(s, 0, 0, { status: 'completed', reps: 5 }, later(3));
  s = W.painStopExercise(s, 1, later(5));
  const log = s.exerciseLogs[1];
  assert.equal(log.status, 'pain_stopped');
  assert.ok(log.sets.every((x) => x.status === 'pain_stop'));
  assert.ok(log.painStop.guidance.includes('Do not train through pain'));
  assert.ok(!log.painStop.guidance.toLowerCase().includes('instead'), 'no therapeutic alternative suggested');
  assert.ok(s.reviewFlags.includes('pain_stop_review'));
  assert.equal(s.status, 'in_progress', 'unrelated exercises may continue');
  assert.throws(() => W.substituteExercise(s, 1, getExerciseBySlug('goblet-squat'), 'preference', later(6)), /pain_requires_review_not_substitution/);
});

// ── Progress helpers ────────────────────────────────────────────────────────

test('session progress and next-pending-set track correctly', () => {
  let s = W.startWorkout(freshSession(), later(1));
  assert.equal(W.sessionProgress(s).pct, 0);
  assert.equal(W.nextPendingSet(s, 0), 0);
  s = W.logSet(s, 0, 0, { status: 'completed', reps: 5 }, later(3));
  assert.equal(W.nextPendingSet(s, 0), null, 'single-set exercise exhausted');
  assert.equal(W.sessionProgress(s).setsDone, 1);
});

test('determinism: identical operations produce byte-equivalent sessions', () => {
  const run = () => {
    let s = freshSession();
    s = W.startWorkout(s, later(1));
    s = W.logSet(s, 0, 0, { reps: 5, load: W.makeLoad('kg', 100), rpe: 7, status: 'completed' }, later(4));
    return JSON.stringify(s);
  };
  assert.equal(run(), run());
});
