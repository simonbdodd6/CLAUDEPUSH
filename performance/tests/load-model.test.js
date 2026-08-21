// CoachEasier Performance — load model tests (SC6).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  equipmentIncrement, estimateOneRepMax, loadUnit, makeLoad,
  resolveInitialLoad, roundToIncrement, validateLoad,
} from '../domain/load-model.js';

// ── Typed loads (Part 3) ────────────────────────────────────────────────────

test('every load carries a type — 60 never silently means kg', () => {
  const kg = makeLoad('kg', 60);
  const lb = makeLoad('lb', 60);
  assert.notDeepEqual(kg, lb);
  assert.equal(loadUnit(kg), 'kg');
  assert.equal(loadUnit(lb), 'lb');
  assert.throws(() => makeLoad('stones', 9), /bad_load_type/);
});

test('load validation: percentage needs a reference; negatives rejected', () => {
  assert.ok(validateLoad(makeLoad('kg', 100)).ok);
  assert.ok(validateLoad(makeLoad('bodyweight')).ok);
  assert.ok(validateLoad(makeLoad('machine_stack', 7)).ok);
  assert.ok(validateLoad(makeLoad('band_level', 3)).ok);
  assert.ok(!validateLoad({ type: 'percentage', value: 80, of: null }).ok, 'percentage without a reference rejected');
  assert.ok(validateLoad(makeLoad('percentage', 80, { of: 'e1rm:epley_v1' })).ok);
  assert.ok(!validateLoad({ type: 'kg', value: -5 }).ok);
});

// ── e1RM (Part 6) ───────────────────────────────────────────────────────────

test('e1RM: deterministic Epley, labelled estimated, never high confidence', () => {
  const a = estimateOneRepMax({ loadKg: 100, reps: 5 });
  const b = estimateOneRepMax({ loadKg: 100, reps: 5 });
  assert.deepEqual(a, b, 'deterministic');
  assert.equal(a.ok, true);
  assert.equal(a.value, 116.7);
  assert.equal(a.source, 'estimated', 'never labelled tested');
  assert.equal(a.formula, 'epley_v1', 'formula version preserved');
  assert.deepEqual(a.inputs, { loadKg: 100, reps: 5 }, 'inputs preserved');
  assert.equal(a.confidence, 'medium');
  assert.equal(estimateOneRepMax({ loadKg: 100, reps: 8 }).confidence, 'low');
});

test('e1RM rejects inappropriate rep ranges and bad loads', () => {
  assert.equal(estimateOneRepMax({ loadKg: 100, reps: 12 }).ok, false);
  assert.equal(estimateOneRepMax({ loadKg: 100, reps: 0 }).ok, false);
  assert.equal(estimateOneRepMax({ loadKg: -10, reps: 5 }).ok, false);
  assert.equal(estimateOneRepMax({ loadKg: 100, reps: 5, formula: 'magic' }).ok, false);
});

// ── Initial load (Part 5) — no 1RM ever required ────────────────────────────

test('known working load wins with high confidence', () => {
  const r = resolveInitialLoad([
    { source: 'training_history' },
    { source: 'recent_completed_set', load: makeLoad('kg', 80) },
  ]);
  assert.equal(r.strategy, 'known_load');
  assert.equal(r.load.value, 80);
  assert.equal(r.confidence, 'high');
  assert.deepEqual(r.flags, []);
});

test('coach-entered load ranks above athlete-reported; both usable', () => {
  const r = resolveInitialLoad([
    { source: 'athlete_reported_recent_load', load: makeLoad('kg', 90) },
    { source: 'coach_entered_working_load', load: makeLoad('kg', 85) },
  ]);
  assert.equal(r.load.value, 85, 'coach entry outranks athlete report');
});

test('e1RM evidence produces a percentage reference, flagged as uncertain', () => {
  const e1rm = estimateOneRepMax({ loadKg: 100, reps: 5 });
  const r = resolveInitialLoad([{ source: 'estimated_1rm', e1rm }]);
  assert.equal(r.strategy, 'e1rm_percentage');
  assert.equal(r.load.type, 'percentage');
  assert.equal(r.load.of, 'e1rm:epley_v1');
  assert.ok(r.flags.includes('load_confidence_low'));
});

test('weak evidence → effort-based targets; nothing → manual selection. Never a fabricated kg', () => {
  const effort = resolveInitialLoad([{ source: 'training_history' }]);
  assert.equal(effort.strategy, 'effort_based');
  assert.equal(effort.load, null, 'no invented number');
  const manual = resolveInitialLoad([{ source: 'unknown' }]);
  assert.equal(manual.strategy, 'manual_required');
  assert.equal(manual.load, null);
  assert.ok(manual.flags.includes('manual_load_selection_required'));
  const empty = resolveInitialLoad([]);
  assert.equal(empty.strategy, 'manual_required');
});

// ── Equipment increments (Part 12) ──────────────────────────────────────────

test('equipment increments: barbell fine, dumbbell coarse, bands ordinal', () => {
  assert.equal(equipmentIncrement('barbell'), 2.5);
  assert.equal(equipmentIncrement('dumbbells'), 2);
  assert.equal(equipmentIncrement('machines'), 5);
  assert.equal(equipmentIncrement('kettlebells'), 4);
  assert.equal(equipmentIncrement('bands'), null, 'ordinal, no kg');
  assert.equal(equipmentIncrement('bodyweight'), null);
});

test('roundToIncrement snaps onto the achievable grid', () => {
  assert.equal(roundToIncrement(101.3, 'barbell'), 100);
  assert.equal(roundToIncrement(101.3, 'machines'), 100);
  assert.equal(roundToIncrement(101.3, 'bands'), 101.3, 'ordinal passes through');
});
