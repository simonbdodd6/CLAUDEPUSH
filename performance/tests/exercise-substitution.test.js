// CoachEasier Performance — substitution rule tests (SC3).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import { equipmentGap } from '../domain/exercise.js';
import {
  painReportRouting, relatedExercises, substitutionCandidates, substitutionCompatibility,
} from '../domain/exercise-substitution.js';
import { EXERCISES, getExerciseBySlug } from '../services/exercise-catalogue.js';

const backSquat = getExerciseBySlug('back-squat');
const goblet = getExerciseBySlug('goblet-squat');
const benchPress = getExerciseBySlug('bench-press');

test('relatedExercises resolves declared relationships', () => {
  const regressions = relatedExercises(backSquat, EXERCISES, 'regression');
  assert.ok(regressions.some((e) => e.slug === 'goblet-squat'));
  assert.deepEqual(relatedExercises(backSquat, EXERCISES, 'prerequisite'), []);
});

test('compatibility: same pattern + shared quality + shared prescription', () => {
  assert.equal(substitutionCompatibility(backSquat, goblet).compatible, true);
  const incompatible = substitutionCompatibility(backSquat, benchPress);
  assert.equal(incompatible.compatible, false);
  assert.ok(incompatible.reasons.includes('different_pattern'));
  assert.equal(substitutionCompatibility(backSquat, backSquat).compatible, false, 'self is invalid');
});

test('equipment constraint: home athlete gets barbell-free squat options', () => {
  const home = { locations: ['home_gym'], items: ['dumbbells', 'bands'] };
  const candidates = substitutionCandidates(backSquat, EXERCISES, {
    athleteEquipment: home, equipmentGapFn: equipmentGap,
  });
  assert.ok(candidates.length > 0);
  for (const c of candidates) {
    assert.deepEqual(equipmentGap(c.exercise, home).missing, [], c.exercise.slug + ' fits home kit');
  }
  assert.ok(candidates.some((c) => c.exercise.slug === 'goblet-squat'));
  assert.ok(!candidates.some((c) => c.exercise.slug === 'front-squat'), 'barbell lifts excluded');
});

test('bodyweight-only constraint returns bodyweight substitutes', () => {
  const candidates = substitutionCandidates(backSquat, EXERCISES, { bodyweightOnly: true });
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((c) => c.exercise.equipment.bodyweightOnly));
});

test('technical level caps candidate difficulty', () => {
  const candidates = substitutionCandidates(getExerciseBySlug('kb-rdl'), EXERCISES, { techLevel: 'beginner' });
  assert.ok(candidates.every((c) => c.exercise.classification.difficulty === 'beginner'));
});

test('impact tolerance caps candidate impact', () => {
  const cmj = getExerciseBySlug('cmj');
  const candidates = substitutionCandidates(cmj, EXERCISES, { impactTolerance: 'moderate' });
  assert.ok(candidates.every((c) => c.exercise.classification.impact !== 'high'));
});

test('restriction tags exclude tagged candidates — and nothing more', () => {
  const neck = getExerciseBySlug('neck-iso-4way');
  const partner = getExerciseBySlug('partner-neck-iso');
  const without = substitutionCandidates(neck, EXERCISES, {});
  assert.ok(without.some((c) => c.exercise.id === partner.id));
  const withTag = substitutionCandidates(neck, EXERCISES, { restrictionTags: ['recent_concussion_protocol'] });
  assert.ok(!withTag.some((c) => c.exercise.id === partner.id), 'tagged candidates excluded');
});

test('unreviewed and hidden content never appears in candidates', () => {
  const hill = getExerciseBySlug('hill-sprint');
  const player = { role: 'player', userId: 'p1', clubId: 'other-club' };
  const candidates = substitutionCandidates(hill, EXERCISES, { viewer: player });
  assert.ok(!candidates.some((c) => c.exercise.status !== 'approved'), 'no drafts/archived');
  assert.ok(!candidates.some((c) => c.exercise.tier === 'private'), 'no private leakage');
  assert.ok(!candidates.some((c) => c.exercise.tier === 'club'), 'no other-club leakage');
});

test('declared relationships rank first', () => {
  const candidates = substitutionCandidates(backSquat, EXERCISES, {});
  assert.ok(candidates.length >= 2);
  assert.equal(candidates[0].declared, true, 'declared alternatives lead the list');
});

test('pain reports route to stop-and-review — never to a substitute', () => {
  const routing = painReportRouting();
  assert.equal(routing.action, 'stop_and_review');
  assert.equal(routing.substitute, null);
  assert.match(routing.message, /stop/i);
  assert.match(routing.message, /review/i);
  assert.ok(!/instead|swap|alternative|therapeutic/i.test(routing.message), 'no substitution language');
});
