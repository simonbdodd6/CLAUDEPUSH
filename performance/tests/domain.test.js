// CoachEasier Performance — domain rules unit tests (SC1).
// Run: node --test performance/tests/

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adherenceBand,
  filterExercises,
  isValidProgrammeStatus,
  isValidTrainingStatus,
  isValidWorkoutStatus,
  programmeProgress,
  readinessBand,
  workoutCompletion,
} from '../domain/index.js';
import { getSampleAthletes, getSampleExercises, getSampleProgrammes, getSampleTodayWorkout } from '../services/performance-data.js';

test('programmeProgress: week 3 of 8 means 2 full weeks done (25%)', () => {
  assert.equal(programmeProgress({ weeks: 8, currentWeek: 3 }), 25);
});

test('programmeProgress clamps to 0–100 and survives bad input', () => {
  assert.equal(programmeProgress({ weeks: 6, currentWeek: 99 }), 100);
  assert.equal(programmeProgress({ weeks: 6, currentWeek: 0 }), 0);
  assert.equal(programmeProgress({ weeks: 0, currentWeek: 3 }), 0);
  assert.equal(programmeProgress(null), 0);
});

test('readinessBand thresholds', () => {
  assert.equal(readinessBand(90), 'high');
  assert.equal(readinessBand(80), 'high');
  assert.equal(readinessBand(79), 'moderate');
  assert.equal(readinessBand(60), 'moderate');
  assert.equal(readinessBand(59), 'low');
  assert.equal(readinessBand(undefined), 'low');
});

test('adherenceBand thresholds', () => {
  assert.equal(adherenceBand(92), 'on_track');
  assert.equal(adherenceBand(85), 'on_track');
  assert.equal(adherenceBand(70), 'watch');
  assert.equal(adherenceBand(50), 'behind');
});

test('workoutCompletion: caps done at total and computes pct', () => {
  assert.deepEqual(workoutCompletion({ assignedCount: 18, completedCount: 5 }), { done: 5, total: 18, pct: 28 });
  assert.deepEqual(workoutCompletion({ assignedCount: 0, completedCount: 3 }), { done: 0, total: 0, pct: 0 });
  assert.deepEqual(workoutCompletion({ assignedCount: 10, completedCount: 12 }), { done: 10, total: 10, pct: 100 });
});

test('status validators accept the documented enums only', () => {
  assert.ok(isValidProgrammeStatus('active'));
  assert.ok(!isValidProgrammeStatus('paused'));
  assert.ok(isValidWorkoutStatus('in_progress'));
  assert.ok(!isValidWorkoutStatus('done'));
  assert.ok(isValidTrainingStatus('modified'));
  assert.ok(!isValidTrainingStatus('injured'));
});

test('filterExercises: search, category and favourites compose', () => {
  const all = getSampleExercises();
  assert.equal(filterExercises(all).length, all.length);
  const strength = filterExercises(all, { category: 'strength' });
  assert.ok(strength.length > 0 && strength.every((e) => e.category === 'strength'));
  const favs = filterExercises(all, { favouritesOnly: true });
  assert.ok(favs.length > 0 && favs.every((e) => e.favourite));
  const squat = filterExercises(all, { query: 'squat' });
  assert.ok(squat.some((e) => e.name === 'Back Squat'));
  const none = filterExercises(all, { query: 'zzz-not-real' });
  assert.equal(none.length, 0);
  const combined = filterExercises(all, { query: 'sled', category: 'speed', favouritesOnly: true });
  assert.deepEqual(combined.map((e) => e.name), ['Resisted Sled Sprint']);
});

test('sample data is internally consistent', () => {
  const athletes = getSampleAthletes();
  const programmes = getSampleProgrammes();
  const progIds = new Set(programmes.map((p) => p.id));
  for (const a of athletes) {
    assert.ok(isValidTrainingStatus(a.trainingStatus), `${a.name} has valid trainingStatus`);
    assert.ok(a.adherence >= 0 && a.adherence <= 100);
    assert.ok(a.readiness >= 0 && a.readiness <= 100);
    if (a.programmeId) assert.ok(progIds.has(a.programmeId), `${a.name} enrolled in known programme`);
  }
  for (const p of programmes) assert.ok(isValidProgrammeStatus(p.status));
  const today = getSampleTodayWorkout();
  assert.ok(isValidWorkoutStatus(today.status));
  assert.ok(progIds.has(today.programmeId));
});
