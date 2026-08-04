// CoachEasier Performance — exercise schema & catalogue tests (SC3).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  equipmentGap, filterCatalogue, findBrokenRelationships, findRelationshipCycles,
  isReviewStale, matchesSearch, pendingReviewGates, validateCatalogue, validateExercise,
} from '../domain/exercise.js';
import { CATALOGUE_VERSION, EXERCISES, getCatalogue, getCatalogueMeta, getExerciseById, getExerciseBySlug } from '../services/exercise-catalogue.js';

test('catalogue size is within the SC3 brief (40–60) and versioned', () => {
  assert.ok(EXERCISES.length >= 40 && EXERCISES.length <= 60, `${EXERCISES.length} exercises`);
  assert.equal(getCatalogueMeta().version, CATALOGUE_VERSION);
  assert.equal(getCatalogueMeta().count, EXERCISES.length);
});

test('every record passes full schema validation; ids and slugs unique', () => {
  const v = validateCatalogue(EXERCISES);
  assert.deepEqual(v.errors, [], JSON.stringify(v.errors, null, 2));
  assert.ok(v.ok);
});

test('validateExercise rejects bad records with every problem listed', () => {
  const bad = validateExercise({ id: 'x', slug: 'Bad Slug!', name: 'X', shortDescription: 'x', status: 'live', tier: 'gold', version: 0 });
  assert.ok(!bad.ok);
  for (const expected of ['bad_slug', 'bad_status', 'bad_tier', 'bad_version', 'bad_category', 'missing_prescription']) {
    assert.ok(bad.errors.includes(expected), expected + ' reported: ' + bad.errors.join(','));
  }
  assert.equal(validateExercise(null).ok, false);
});

test('relationship integrity: no broken targets, no progression/regression cycles', () => {
  assert.deepEqual(findBrokenRelationships(EXERCISES), []);
  assert.deepEqual(findRelationshipCycles(EXERCISES, 'progression'), []);
  assert.deepEqual(findRelationshipCycles(EXERCISES, 'regression'), []);
});

test('cycle detector actually detects a planted cycle', () => {
  const loop = [
    { id: 'a', relationships: [{ kind: 'progression', target: 'b' }] },
    { id: 'b', relationships: [{ kind: 'progression', target: 'a' }] },
  ];
  assert.ok(findRelationshipCycles(loop, 'progression').length > 0);
});

test('catalogue breadth covers the required training areas', () => {
  const cats = new Set(EXERCISES.map((e) => e.classification.category));
  for (const needed of ['strength', 'power', 'plyometric', 'sprint', 'trunk', 'neck', 'contact_prep', 'conditioning', 'mobility', 'warmup']) {
    assert.ok(cats.has(needed), `category covered: ${needed}`);
  }
  const patterns = new Set(EXERCISES.map((e) => e.classification.pattern));
  for (const needed of ['squat', 'hinge', 'lunge', 'horizontal_push', 'vertical_pull', 'jump', 'acceleration', 'carry']) {
    assert.ok(patterns.has(needed), `pattern covered: ${needed}`);
  }
  const bodyweight = EXERCISES.filter((e) => e.equipment.bodyweightOnly && e.status === 'approved');
  assert.ok(bodyweight.length >= 8, 'bodyweight/home options exist: ' + bodyweight.length);
  for (const level of ['beginner', 'intermediate', 'advanced']) {
    assert.ok(EXERCISES.some((e) => e.classification.difficulty === level), level + ' options exist');
  }
});

test('every approved validated exercise has an alternative where sensible', () => {
  const core = EXERCISES.filter((e) => e.tier === 'validated' && e.status === 'approved');
  const withRels = core.filter((e) => (e.relationships || []).length > 0);
  assert.ok(withRels.length / core.length > 0.9, 'nearly all validated exercises declare relationships');
});

test('neck and contact-prep content is flagged for full human review', () => {
  const sensitive = EXERCISES.filter((e) => ['neck', 'contact_prep'].includes(e.classification.category));
  assert.ok(sensitive.length >= 3);
  for (const ex of sensitive) {
    assert.ok(ex.reviewRequired.includes('snc'), ex.slug + ' requires S&C review');
    assert.ok(ex.reviewRequired.includes('medical'), ex.slug + ' requires medical review');
    assert.ok(ex.reviewRequired.includes('safeguarding'), ex.slug + ' requires safeguarding review');
    assert.notEqual(ex.safety.youth, 'suitable', ex.slug + ' youth suitability needs review');
    assert.ok(pendingReviewGates(ex).length > 0, ex.slug + ' review gates still pending in beta');
  }
});

test('high-skill and high-load lifts are flagged and review-gated', () => {
  const powerClean = getExerciseBySlug('power-clean');
  assert.equal(powerClean.safety.highSkill, true);
  assert.equal(powerClean.safety.youth, 'technique_only');
  assert.ok(powerClean.reviewRequired.includes('snc'));
  const squat = getExerciseBySlug('back-squat');
  assert.equal(squat.safety.highLoad, true);
});

test('media: placeholders only, no external URLs, alt text everywhere', () => {
  for (const ex of EXERCISES) {
    assert.equal(ex.media.status, 'placeholder', ex.slug);
    assert.equal(ex.media.assets.length, 0, ex.slug + ' has no assets in beta');
    assert.ok(ex.media.altText.length > 0, ex.slug + ' has alt text');
  }
});

test('no diagnostic or rehabilitation claims in catalogue text', () => {
  const text = JSON.stringify(EXERCISES).toLowerCase();
  for (const banned of ['diagnos', 'rehabilitat', 'cures', 'treats injur', 'fixes injur', 'return-to-play clearance', 'cleared to play']) {
    assert.ok(!text.includes(banned), `catalogue must not contain "${banned}"`);
  }
  for (const ex of EXERCISES) {
    assert.ok(ex.safety.painStop.toLowerCase().includes('stop'), ex.slug + ' pain guidance routes to stop');
  }
});

test('search matches canonical name, display name and aliases', () => {
  const rdl = getExerciseBySlug('kb-rdl');
  assert.ok(matchesSearch(rdl, 'romanian'));
  assert.ok(matchesSearch(rdl, 'KB RDL'));
  assert.ok(matchesSearch(rdl, ''));
  assert.ok(!matchesSearch(rdl, 'bench'));
  const squat = getExerciseBySlug('back-squat');
  assert.ok(matchesSearch(squat, 'barbell squat'), 'alias matches');
});

test('filterCatalogue: category, pattern, difficulty, equipment, favourites, archived', () => {
  const all = getCatalogue();
  assert.ok(filterCatalogue(all, { category: 'strength' }).every((e) => e.classification.category === 'strength'));
  const hinges = filterCatalogue(all, { pattern: 'hinge' });
  assert.ok(hinges.some((e) => e.slug === 'trap-bar-deadlift'));
  assert.ok(filterCatalogue(all, { difficulty: 'beginner' }).every((e) => e.classification.difficulty === 'beginner'));

  const bwOnly = filterCatalogue(all, { equipment: ['none'] });
  assert.ok(bwOnly.every((e) => e.equipment.required.every((r) => r === 'none')), 'equipment filter respects requirements');
  const withDb = filterCatalogue(all, { equipment: ['dumbbells', 'bench'] });
  assert.ok(withDb.some((e) => e.slug === 'db-bench'));
  assert.ok(!withDb.some((e) => e.slug === 'back-squat'), 'barbell lifts excluded without barbell');

  const favs = filterCatalogue(all, { favouritesOnly: true, favourites: ['ex-back-squat'] });
  assert.deepEqual(favs.map((e) => e.slug), ['back-squat']);

  assert.ok(!filterCatalogue(all, {}).some((e) => e.status === 'archived'), 'archived hidden by default');
  assert.ok(filterCatalogue(all, { includeArchived: true }).some((e) => e.status === 'archived'));
});

test('empty result state is reachable and safe', () => {
  assert.deepEqual(filterCatalogue(getCatalogue(), { query: 'zzz-not-an-exercise' }), []);
});

test('equipmentGap maps requirements against SC2 athlete access', () => {
  const squat = getExerciseBySlug('back-squat');
  const gymAthlete = { locations: ['team_gym'], items: [] };
  assert.deepEqual(equipmentGap(squat, gymAthlete).missing, [], 'gym implies the standard kit');
  const homeAthlete = { locations: ['home_gym'], items: ['bands'] };
  assert.ok(equipmentGap(squat, homeAthlete).missing.includes('barbell'));
  const nordic = getExerciseBySlug('nordic-curl');
  assert.ok(equipmentGap(nordic, homeAthlete).unmapped.includes('partner'), 'partner reported as unmapped, not blocking');
});

test('review staleness and accessors', () => {
  const ex = getExerciseById('ex-back-squat');
  assert.equal(ex.slug, 'back-squat');
  assert.equal(getExerciseById('nope'), null);
  assert.equal(isReviewStale(ex, new Date('2026-09-01')), false);
  assert.equal(isReviewStale(ex, new Date('2028-01-01')), true);
  assert.equal(isReviewStale({ ownership: {} }), true);
});
