// CoachEasier Performance — workout completion, store & utils tests (SC7).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import * as W from '../services/workout-runtime.js';
import { EXERCISES } from '../services/exercise-catalogue.js';

const NOW = '2026-08-20T17:00:00.000Z';
const later = (m) => `2026-08-20T${17 + Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:00.000Z`;

function completedWorkout({ painStop = false } = {}) {
  const demo = W.getDemoAssignment();
  let s = W.createWorkoutSession({ athleteId: 'u1', programme: demo.programme, sessionNode: demo.sessionNode, catalogue: EXERCISES, meta: demo.meta, now: NOW });
  s = W.startWorkout(s, later(1));
  s = W.logSet(s, 0, 0, { reps: 5, load: W.makeLoad('kg', 100), rpe: 7, status: 'completed' }, later(5));
  s = W.logSet(s, 1, 0, { reps: 8, load: W.makeLoad('kg', 80), rpe: 7, status: 'completed' }, later(12));
  s = W.logSet(s, 2, 0, { reps: 10, load: W.makeLoad('kg', 20, { implements: 2 }), rpe: 6, status: 'completed' }, later(20));
  if (painStop) s = W.painStopExercise(s, 3, later(25));
  else s = W.logSet(s, 3, 0, { durationSec: 40, status: 'completed' }, later(25));
  return W.completeWorkout(s, { now: later(45) });
}

// ── Completion validation (Part 19) ─────────────────────────────────────────

test('completion validation: optional skips fine; significant unfinished work needs confirmation', () => {
  const demo = W.getDemoAssignment();
  let s = W.createWorkoutSession({ athleteId: 'u1', programme: demo.programme, sessionNode: demo.sessionNode, catalogue: EXERCISES, meta: demo.meta, now: NOW });
  s = W.startWorkout(s, later(1));
  const fresh = W.validateCompletion(s);
  assert.equal(fresh.needsConfirmation, true, '100% unfinished needs explicit confirmation');
  s = W.logSet(s, 0, 0, { status: 'completed', reps: 5 }, later(5));
  s = W.logSet(s, 1, 0, { status: 'completed', reps: 8 }, later(10));
  s = W.logSet(s, 2, 0, { status: 'completed', reps: 10 }, later(15));
  const oneLeft = W.validateCompletion(s);
  assert.equal(oneLeft.needsConfirmation, false, 'one optional set remaining (25%) completes without ceremony');
  assert.equal(oneLeft.unresolved.length, 1);
});

test('completion freezes history and summarises honestly', () => {
  const done = completedWorkout();
  assert.equal(done.status, 'completed');
  assert.ok(Object.isFrozen(done));
  assert.equal(done.summary.setsCompleted, 4);
  assert.equal(done.summary.exercisesCompleted, 4);
  assert.equal(done.summary.durationMin, 44);
  assert.equal(done.summary.avgRpe, 6.7);
  assert.deepEqual(done.summary.skippedExercises, []);
});

test('pain-stop completion becomes stopped_for_review with flags in the summary', () => {
  const done = completedWorkout({ painStop: true });
  assert.equal(done.status, 'stopped_for_review');
  assert.deepEqual(done.summary.painStops, ['Front Plank']);
  assert.ok(done.summary.reviewFlags.includes('pain_stop_review'));
});

// ── PRs (Part 20) ───────────────────────────────────────────────────────────

test('PRs detected against previous bests are achievements, never commands', () => {
  const done = completedWorkout();
  const prs = W.detectPersonalRecords(done, { 'ex-back-squat|x1': 95 });
  assert.equal(prs.length, 1);
  assert.equal(prs[0].value, 100);
  assert.equal(prs[0].implements, 1);
  assert.equal(prs[0].triggersProgression, false);
  assert.deepEqual(W.detectPersonalRecords(done, { 'ex-back-squat|x1': 110 }), [], 'no PR when below previous best');
  assert.deepEqual(W.detectPersonalRecords(done, {}), [], 'no invented PRs without history');
});

// ── Store (Parts 17/18/21) ──────────────────────────────────────────────────

test('store: history written before active cleared; sync status stays honest', () => {
  let state = W.createInitialWorkoutState();
  const demo = W.getDemoAssignment();
  let s = W.createWorkoutSession({ athleteId: 'u1', programme: demo.programme, sessionNode: demo.sessionNode, catalogue: EXERCISES, meta: demo.meta, now: NOW });
  state = W.saveActiveSession(state, s);
  assert.ok(state.active, 'active session recoverable');
  const done = completedWorkout();
  state = W.archiveCompletedWorkout(state, done);
  assert.equal(state.history.length, 1, 'history written');
  assert.equal(state.active, null, 'active cleared only after archive');
  assert.equal(state.syncStatus, 'pending', 'never falsely synced');
  assert.deepEqual(state.syncQueue, [done.workoutSessionId]);
  assert.throws(() => W.archiveCompletedWorkout(state, { kind: 'workout_session' }), /not_completed/);
});

test('store normalisation fails safely on malformed state', () => {
  for (const bad of [null, 'junk', 7, [], { stateVersion: 'x' }, { stateVersion: 99 }, { stateVersion: 1, active: 'nope', history: 'nope' }]) {
    const s = W.normalizeWorkoutState(bad);
    assert.equal(s.stateVersion, 1);
    assert.equal(s.active, null);
    assert.deepEqual(s.history, []);
  }
  const roundTrip = W.normalizeWorkoutState(JSON.parse(JSON.stringify(W.archiveCompletedWorkout(W.createInitialWorkoutState(), completedWorkout()))));
  assert.equal(roundTrip.history.length, 1, 'valid history survives round-trip');
});

test('previous bests are per-implement, kg-only, and prior exposures derive from history', () => {
  const state = W.archiveCompletedWorkout(W.createInitialWorkoutState(), completedWorkout());
  const bests = W.previousBestsFromHistory(state);
  assert.equal(bests['ex-back-squat|x1'], 100);
  assert.equal(bests['ex-db-bench|x2'], 20, 'pair best stored per implement, keyed by implement count');
  assert.equal(bests['ex-db-bench|x1'], undefined, 'single-implement best is a separate record');
  const prior = W.priorExposuresForExercise(state, 'ex-back-squat', W.exposuresFromWorkout);
  assert.equal(prior.length, 1);
  assert.equal(prior[0].outcome, 'successful');
});

// ── Plate calculator & warm-ups (Parts 11/12) ───────────────────────────────

test('plate calculator: exact fills, never-invented plates, shortfall reported', () => {
  assert.deepEqual(W.platesPerSide(100, 20).perSide, [25, 15]);
  assert.deepEqual(W.platesPerSide(60, 20).perSide, [20]);
  const coarse = W.platesPerSide(101, 20, [25, 20, 15, 10, 5]);
  assert.equal(coarse.ok, false, 'cannot invent a 0.5 kg plate');
  assert.equal(coarse.achievedTotal, 100);
  assert.equal(coarse.shortfallKg, 1);
  assert.equal(W.platesPerSide(15, 20).ok, false, 'target below bar');
});

test('warm-up suggestions are conservative, labelled, and optional', () => {
  const w = W.warmupSuggestions(W.makeLoad('kg', 100));
  assert.equal(w.provisional, true);
  assert.ok(w.note.includes('Suggested warm-up only'));
  assert.deepEqual(w.suggestions.map((s) => s.loadKg), [40, 60, 80]);
  const light = W.warmupSuggestions(W.makeLoad('kg', 30));
  assert.deepEqual(light.suggestions, [], 'light work gets a note, not percentages');
  const bw = W.warmupSuggestions(W.makeLoad('bodyweight'));
  assert.deepEqual(bw.suggestions, [], 'no invented loads for bodyweight');
});

// ── Load display (Part 10) ──────────────────────────────────────────────────

test('formatLoad: every load type displays unambiguously', () => {
  assert.equal(W.formatLoad(W.makeLoad('kg', 100)), '100 kg');
  assert.equal(W.formatLoad(W.makeLoad('lb', 45)), '45 lb');
  assert.equal(W.formatLoad(W.makeLoad('kg', 20, { implements: 2 })), '20 kg each');
  assert.equal(W.formatLoad(W.makeLoad('kg', 24, { implements: 1 })), '24 kg');
  assert.equal(W.formatLoad(W.makeLoad('bodyweight')), 'Bodyweight');
  assert.equal(W.formatLoad(W.makeLoad('bodyweight_plus_kg', 10)), 'Bodyweight + 10 kg');
  assert.equal(W.formatLoad(W.makeLoad('machine_stack', 8)), 'Stack 8');
  assert.equal(W.formatLoad(W.makeLoad('band_level', 3)), 'Band level 3');
  assert.equal(W.formatLoad(W.makeLoad('percentage', 75, { of: 'e1rm:epley_v1' })), '75% of estimated 1RM (epley_v1)');
  assert.equal(W.formatLoad(W.makeLoad('unknown')), 'Choose load');
});
