// CoachEasier Performance — SC7 end-to-end scenarios A–J + scope guards.
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import * as W from '../services/workout-runtime.js';
import { EXERCISES, getExerciseBySlug } from '../services/exercise-catalogue.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NOW = '2026-08-20T17:00:00.000Z';
const t = (m) => `2026-08-20T${17 + Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:00.000Z`;

function fresh() {
  const demo = W.getDemoAssignment();
  return W.createWorkoutSession({ athleteId: 'u1', programme: demo.programme, sessionNode: demo.sessionNode, catalogue: EXERCISES, meta: demo.meta, now: NOW });
}
const okExp = (date) => ({ date, outcome: 'successful', failedSets: 0, technicalFailures: 0, painStop: false, topOfRange: true, effortBelowTarget: false, effortAboveTarget: false });

// ── Scenario A: normal workout ──────────────────────────────────────────────

test('A: senior intermediate completes 3×5 squat work at target RPE, finishes normally', () => {
  let s = W.startWorkout(fresh(), t(1));
  for (const [i, m] of [[0, 5], [1, 12], [2, 20], [3, 28]]) {
    s = W.logSet(s, i, 0, { reps: 5, load: W.makeLoad('kg', 100), rpe: 7, status: 'completed' }, t(m));
  }
  const done = W.completeWorkout(s, { now: t(40) });
  assert.equal(done.status, 'completed');
  assert.equal(done.summary.setsCompleted, 4);
  const exp = W.exposuresFromWorkout(done);
  assert.ok(exp.every((e) => e.eligible && e.classified.outcome === 'successful'));
});

// ── Scenario B: dumbbell pair semantics through history ─────────────────────

test('B: 20 kg-each dumbbell work preserves per-implement semantics end to end', () => {
  let s = W.startWorkout(fresh(), t(1));
  s = W.logSet(s, 2, 0, { reps: 10, load: W.makeLoad('kg', 20, { implements: 2 }), rpe: 6, status: 'completed' }, t(10));
  const done = W.completeWorkout(s, { now: t(30) });
  const logged = done.exerciseLogs[2].sets[0].actual.load;
  assert.equal(logged.value, 20);
  assert.equal(logged.implements, 2);
  assert.equal(W.formatLoad(logged), '20 kg each', 'display never ambiguous');
  assert.equal(W.totalExternalLoad(logged), 40, 'total derivable, not stored ambiguously');
});

// ── Scenario C: coarse increment → SC6 preview recommends reps/hold ─────────

test('C: next dumbbell too large — SC6 preview says progress reps, never an unsafe jump', () => {
  let s = W.startWorkout(fresh(), t(1));
  s = W.logSet(s, 2, 0, { reps: 12, load: W.makeLoad('kg', 20, { implements: 2 }), rpe: 6, status: 'completed' }, t(10));
  const done = W.completeWorkout(s, { now: t(30) });
  const preview = W.progressionPreviewForExercise(done, 2, {
    exercise: getExerciseBySlug('db-bench'),
    priorHistory: [okExp('2026-08-13'), okExp('2026-08-16')],
    prescription: { sets: 3, repRange: [8, 12], load: W.makeLoad('kg', 20, { implements: 2 }), rpeTarget: 7 },
    equipmentKind: 'dumbbells',
    athlete: { context: 'adult', experience: 'beginner' },
  });
  assert.equal(preview.outcome, 'progress_reps');
  assert.ok(preview.flags.some((f) => f.id === 'equipment_increment_too_large'));
  assert.equal(preview.proposedPrescription.load.value, 20, 'load held');
});

// ── Scenario D: substitution preserved ──────────────────────────────────────

test('D: equipment-unavailable substitution keeps original + replacement in history', () => {
  let s = W.startWorkout(fresh(), t(1));
  const alts = W.eligibleSubstitutes(s, 0, EXERCISES, { athleteEquipment: { locations: ['home_gym'], items: ['dumbbells'] } });
  assert.ok(alts.length > 0, 'kit-appropriate alternatives offered');
  s = W.substituteExercise(s, 0, alts[0].exercise, 'equipment_unavailable', t(2));
  s = W.logSet(s, 0, 0, { reps: 8, status: 'completed' }, t(8));
  const done = W.completeWorkout(s, { now: t(30) });
  const log = done.exerciseLogs[0];
  assert.equal(log.substitution.originalExerciseId, 'ex-back-squat');
  assert.equal(log.exerciseId, alts[0].exercise.id);
  const exp = W.exposuresFromWorkout(done)[0];
  assert.equal(exp.substitution.comparableToOriginal, false, 'flagged non-comparable for SC6');
});

// ── Scenario E: pain stop ───────────────────────────────────────────────────

test('E: pain stop — no substitution, no positive exposure, review visible', () => {
  let s = W.startWorkout(fresh(), t(1));
  s = W.logSet(s, 0, 0, { reps: 5, status: 'completed' }, t(5));
  s = W.painStopExercise(s, 1, t(8));
  const done = W.completeWorkout(s, { now: t(30) });
  assert.equal(done.status, 'stopped_for_review');
  const exp = W.exposuresFromWorkout(done);
  assert.equal(exp[1].eligible, false);
  assert.equal(exp[1].excludedReason, 'pain_stop');
  assert.equal(exp[1].classified.outcome, 'pain_stop');
  const preview = W.progressionPreviewForExercise(done, 1, {
    exercise: getExerciseBySlug('barbell-rdl'),
    prescription: { sets: 3, repRange: [6, 8], load: W.makeLoad('kg', 80), rpeTarget: 7 },
    athlete: { context: 'adult', experience: 'intermediate' },
  });
  assert.equal(preview.outcome, 'blocked', 'SC6 blocks; nothing proposed');
  assert.equal(preview.proposedPrescription, null);
});

// ── Scenario F: interruption & recovery ─────────────────────────────────────

test('F: two sets logged, state persisted, reload restores exact position and data', () => {
  let s = W.startWorkout(fresh(), t(1));
  s = W.logSet(s, 0, 0, { reps: 5, load: W.makeLoad('kg', 100), rpe: 7, status: 'completed' }, t(5));
  s = W.logSet(s, 1, 0, { reps: 8, load: W.makeLoad('kg', 80), rpe: 7, status: 'completed' }, t(12));
  s = W.setCurrentExercise(s, 2);
  const persisted = W.saveActiveSession(W.createInitialWorkoutState(), s);
  // simulate app reload: JSON round-trip through the fail-safe normaliser
  const restoredState = W.normalizeWorkoutState(JSON.parse(JSON.stringify(persisted)));
  const r = restoredState.active;
  assert.equal(r.currentExerciseIndex, 2, 'resumes on the correct exercise');
  assert.equal(r.exerciseLogs[0].sets[0].actual.reps, 5, 'entered values intact');
  assert.equal(r.exerciseLogs[1].sets[0].actual.load.value, 80);
  assert.equal(W.nextPendingSet(r, 2), 0, 'next set correct after recovery');
  assert.equal(r.status, 'in_progress');
});

// ── Scenario G: poor connection honesty ─────────────────────────────────────

test('G: completed workout is saved-on-device with sync pending — never falsely synced', () => {
  let s = W.startWorkout(fresh(), t(1));
  s = W.logSet(s, 0, 0, { reps: 5, status: 'completed' }, t(5));
  const done = W.completeWorkout(s, { now: t(30) });
  const state = W.archiveCompletedWorkout(W.createInitialWorkoutState(), done);
  assert.equal(state.syncStatus, 'pending');
  assert.ok(state.syncQueue.includes(done.workoutSessionId));
  assert.notEqual(state.syncStatus, 'synced', 'no production sync exists — honesty enforced');
});

// ── Scenario H: historical immutability ─────────────────────────────────────

test('H: history is byte-identical after later programme and exercise changes', () => {
  let s = W.startWorkout(fresh(), t(1));
  s = W.logSet(s, 0, 0, { reps: 5, load: W.makeLoad('kg', 100), status: 'completed' }, t(5));
  const done = W.completeWorkout(s, { now: t(30) });
  const state = W.archiveCompletedWorkout(W.createInitialWorkoutState(), done);
  const before = JSON.stringify(state.history[0]);

  // Simulate later changes: mutated catalogue copy + a new demo programme edit.
  const mutatedCatalogue = structuredClone(EXERCISES);
  mutatedCatalogue.find((e) => e.id === 'ex-back-squat').name = 'Renamed Squat 2027';
  const demo2 = W.getDemoAssignment();
  demo2.programme.title = 'Edited Programme';

  assert.equal(JSON.stringify(state.history[0]), before, 'stored history unaffected');
  assert.equal(state.history[0].exerciseLogs[0].exerciseSnapshot.name, 'Back Squat', 'historical display uses the stored snapshot, not the current record');
});

// ── Scenario I: youth ceiling in preview ────────────────────────────────────

test('I: U18 successful workout — SC6 preview cannot exceed the youth ceiling', () => {
  let s = W.startWorkout(fresh(), t(1));
  s = W.logSet(s, 0, 0, { reps: 5, load: W.makeLoad('kg', 100), rpe: 7, status: 'completed' }, t(5));
  const done = W.completeWorkout(s, { now: t(30) });
  const preview = W.progressionPreviewForExercise(done, 0, {
    exercise: getExerciseBySlug('back-squat'),
    priorHistory: [okExp('2026-08-13'), okExp('2026-08-16')],
    prescription: { sets: 3, repRange: [5, 5], load: W.makeLoad('kg', 100), rpeTarget: 7 },
    athlete: { context: 'youth_u18', experience: 'advanced', supervisionAvailable: true },
  });
  if (preview.outcome === 'progress_load') {
    assert.ok(preview.proposedPrescription.load.value - 100 <= 2.5, 'U18 step ceiling binds in the preview');
  }
  assert.ok(!['progress_sets'].includes(preview.outcome));
});

// ── Scenario J: match proximity in preview ──────────────────────────────────

test('J: successful workout near MD-2 — preview obeys SC6 match constraints', () => {
  let s = W.startWorkout(fresh(), t(1));
  s = W.logSet(s, 0, 0, { reps: 5, load: W.makeLoad('kg', 100), rpe: 7, status: 'completed' }, t(5));
  const done = W.completeWorkout(s, { now: t(30) });
  const preview = W.progressionPreviewForExercise(done, 0, {
    exercise: getExerciseBySlug('back-squat'),
    priorHistory: [okExp('2026-08-13'), okExp('2026-08-16')],
    prescription: { sets: 3, repRange: [5, 5], load: W.makeLoad('kg', 100), rpeTarget: 7 },
    athlete: { context: 'adult', experience: 'advanced' },
    match: { md: 'MD-2' },
  });
  assert.equal(preview.outcome, 'maintain');
  assert.ok(preview.reasons.some((r) => r.code === 'match_hold'));
});

// ── Exposure eligibility details (Part 22) ──────────────────────────────────

test('exposures: warm-ups excluded, technical failures flagged, source refs preserved', () => {
  let s = W.startWorkout(fresh(), t(1));
  // Mark squat set as a warm-up (structural flag) and log a technical failure on RDL.
  s.exerciseLogs[0].sets[0].isWarmup = true;
  s = W.logSet(s, 0, 0, { reps: 5, status: 'completed' }, t(4));
  s = W.logSet(s, 1, 0, { reps: 4, status: 'failed_technical' }, t(10));
  const done = W.completeWorkout(s, { now: t(30) });
  const exp = W.exposuresFromWorkout(done);
  assert.equal(exp[0].classified.outcome, 'missed', 'warm-up-only work is no exposure');
  assert.equal(exp[1].eligible, false);
  assert.equal(exp[1].excludedReason, 'technical_failure');
  assert.equal(exp[0].programmeVersionId, 'prog-demo-preseason@v1', 'source programme version preserved');
  assert.ok(exp[0].sourceWorkoutId.startsWith('ws:'));
});

// ── Scope guards ────────────────────────────────────────────────────────────

test('scope guard: SC7 modules contain no AI/analytics/diagnosis/clock/randomness', async () => {
  const files = [
    '../types/workout.js', '../domain/workout-session.js', '../domain/workout-completion.js',
    '../domain/workout-exposure.js', '../domain/plate-calculator.js',
    '../services/workout-store.js', '../services/workout-runtime.js', '../services/demo-assignment.js',
  ];
  for (const f of files) {
    const src = await readFile(join(__dirname, f), 'utf8');
    for (const banned of ['Math.random', 'Date.now', 'fetch(', 'openai', 'anthropic', 'diagnos', 'rehabilitat', 'cleared to play', 'renderChart', 'stripe']) {
      assert.ok(!src.includes(banned), `${f} contains ${banned}`);
    }
  }
});

test('scope guard: pain guidance is non-diagnostic and offers no substitution', () => {
  assert.ok(W.PAIN_STOP_GUIDANCE.includes('not something the app can assess'));
  assert.ok(!/instead|alternative|swap|replace/i.test(W.PAIN_STOP_GUIDANCE));
});

// ═══ SC7 final safety-review additions (K–O + duration + mapping) ═══════════

function quickCompleted(now = '2026-08-20T18:00:00.000Z') {
  const demo = W.getDemoAssignment();
  let s = W.createWorkoutSession({ athleteId: 'u1', programme: demo.programme, sessionNode: demo.sessionNode, catalogue: EXERCISES, meta: demo.meta, now: NOW });
  s = W.startWorkout(s, t(1));
  s = W.logSet(s, 0, 0, { reps: 5, load: W.makeLoad('kg', 100), status: 'completed' }, t(5));
  return { session: s, done: W.completeWorkout(s, { now }) };
}

test('K: double Finish — exactly one historical workout (idempotent archive)', () => {
  const { done } = quickCompleted();
  let state = W.archiveCompletedWorkout(W.createInitialWorkoutState(), done);
  state = W.archiveCompletedWorkout(state, done); // second Finish tap / retry
  assert.equal(state.history.length, 1, 'same workout id never archived twice');
  assert.equal(state.syncQueue.filter((x) => x === done.workoutSessionId).length, 1, 'sync queue deduped');
});

test('L: interruption between archive and cleanup — no duplicate, no lost work', () => {
  const { session, done } = quickCompleted();
  // Simulate the crash window: history written, active clear lost, page reloads.
  const crashed = { ...W.archiveCompletedWorkout(W.createInitialWorkoutState(), done), active: JSON.parse(JSON.stringify(session)) };
  const recovered = W.normalizeWorkoutState(JSON.parse(JSON.stringify(crashed)));
  assert.equal(recovered.active, null, 'stale active copy of an archived workout never resumes');
  assert.equal(recovered.history.length, 1, 'completed workout preserved exactly once');
  // Retrying completion on the stale copy is also safe:
  const retried = W.archiveCompletedWorkout(crashed, done);
  assert.equal(retried.history.length, 1);
  assert.equal(retried.active, null);
});

test('O: completed session still in recovery state — refuse duplicate resume', () => {
  const { session, done } = quickCompleted();
  const state = W.saveActiveSession(W.archiveCompletedWorkout(W.createInitialWorkoutState(), done), session);
  assert.equal(W.normalizeWorkoutState(state).active, null, 'archived id blocks the stale active copy at read time');
});

test('N: PR comparability — lb, machine, pair-vs-single and substituted work never make false PRs', () => {
  const demo = W.getDemoAssignment();
  let s = W.createWorkoutSession({ athleteId: 'u1', programme: demo.programme, sessionNode: demo.sessionNode, catalogue: EXERCISES, meta: demo.meta, now: NOW });
  s = W.startWorkout(s, t(1));
  s = W.logSet(s, 0, 0, { reps: 5, load: W.makeLoad('lb', 150), status: 'completed' }, t(5));
  s = W.logSet(s, 2, 0, { reps: 10, load: W.makeLoad('kg', 40, { implements: 1 }), status: 'completed' }, t(10));
  const done = W.completeWorkout(s, { now: t(30) });
  const bests = { 'ex-back-squat|x1': 100, 'ex-db-bench|x2': 20 };
  const prs = W.detectPersonalRecords(done, bests);
  assert.ok(!prs.some((p) => p.exerciseId === 'ex-back-squat'), '150 lb never beats a 100 kg best');
  assert.ok(!prs.some((p) => p.exerciseId === 'ex-db-bench'), 'a 40 kg single never beats a 20-kg-each pair best');
});

test('M: previous performance — bests exclude substituted-in work', () => {
  const demo = W.getDemoAssignment();
  let s = W.createWorkoutSession({ athleteId: 'u1', programme: demo.programme, sessionNode: demo.sessionNode, catalogue: EXERCISES, meta: demo.meta, now: NOW });
  s = W.startWorkout(s, t(1));
  const alts = W.eligibleSubstitutes(s, 0, EXERCISES, { athleteEquipment: { locations: ['commercial_gym'], items: [] } });
  s = W.substituteExercise(s, 0, alts[0].exercise, 'equipment_unavailable', t(2));
  s = W.logSet(s, 0, 0, { reps: 8, load: W.makeLoad('kg', 200), status: 'completed' }, t(8));
  const done = W.completeWorkout(s, { now: t(30) });
  const state = W.archiveCompletedWorkout(W.createInitialWorkoutState(), done);
  const bests = W.previousBestsFromHistory(state);
  assert.equal(bests[`${alts[0].exercise.id}|x1`], undefined, 'substituted-in performance is not comparable history');
});

test('duration: corrupted or absurd timestamps report unknown, never fabricated', () => {
  const demo = W.getDemoAssignment();
  let s = W.createWorkoutSession({ athleteId: 'u1', programme: demo.programme, sessionNode: demo.sessionNode, catalogue: EXERCISES, meta: demo.meta, now: NOW });
  s = W.startWorkout(s, '2026-08-20T19:00:00.000Z'); // starts AFTER completion below
  assert.equal(W.completeWorkout(s, { now: '2026-08-20T18:00:00.000Z' }).summary.durationMin, null, 'negative span → unknown');
  let s2 = W.startWorkout(W.createWorkoutSession({ athleteId: 'u1', programme: demo.programme, sessionNode: demo.sessionNode, catalogue: EXERCISES, meta: demo.meta, now: NOW }), '2026-08-18T10:00:00.000Z');
  assert.equal(W.completeWorkout(s2, { now: '2026-08-20T18:00:00.000Z' }).summary.durationMin, null, 'multi-day recovered span → unknown');
});

test('explicit set-status → SC6 exposure mapping table', async () => {
  const { SET_STATUS_TO_SC6 } = await import('../types/workout.js');
  assert.deepEqual(SET_STATUS_TO_SC6, {
    completed: 'completed', partial: 'partial', failed_effort: 'effort_failure',
    failed_technical: 'technical_failure', aborted: 'aborted',
    pain_stop: 'pain_stop', skipped: 'missed_target',
  });
  // Behavioural spot-checks: partial and aborted never classify successful.
  const demo = W.getDemoAssignment();
  let s = W.createWorkoutSession({ athleteId: 'u1', programme: demo.programme, sessionNode: demo.sessionNode, catalogue: EXERCISES, meta: demo.meta, now: NOW });
  s = W.startWorkout(s, t(1));
  s = W.logSet(s, 0, 0, { reps: 3, status: 'partial' }, t(5));
  s = W.logSet(s, 1, 0, { status: 'aborted' }, t(8));
  const exp = W.exposuresFromWorkout(W.completeWorkout(s, { now: t(30) }));
  assert.notEqual(exp[0].classified.outcome, 'successful', 'partial is never clean success');
  assert.notEqual(exp[1].classified.outcome, 'successful', 'aborted is never success');
});
