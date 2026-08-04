// CoachEasier Performance — exercise collections tests (SC3).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import { COLLECTION_KINDS, makeCollection, resolveCollection, validateCollection } from '../domain/exercise-collections.js';
import { COLLECTIONS, getCollections, getCollectionsMeta } from '../services/exercise-collections-catalogue.js';
import { EXERCISES } from '../services/exercise-catalogue.js';

test('every curated collection validates against the catalogue', () => {
  for (const c of COLLECTIONS) {
    const v = validateCollection(c, EXERCISES);
    assert.deepEqual(v.errors, [], `${c.slug}: ${v.errors.join(', ')}`);
  }
  assert.ok(getCollections().length >= 5);
  assert.equal(getCollectionsMeta().count, COLLECTIONS.length);
});

test('collections preserve exercise order', () => {
  const sprint = COLLECTIONS.find((c) => c.slug === 'sprint-prep');
  const resolved = resolveCollection(sprint, EXERCISES);
  assert.deepEqual(resolved.map((r) => r.exercise.id), sprint.items.map((i) => i.exerciseId), 'order preserved');
  assert.equal(resolved[0].exercise.slug, 'inchworm');
});

test('collections may reference only approved, engine-eligible validated exercises', () => {
  const withDraft = makeCollection({ slug: 'x', name: 'X', kind: 'warmup', items: ['ex-sled-push-relay'] });
  assert.ok(validateCollection(withDraft, EXERCISES).errors.some((e) => e.startsWith('not_engine_eligible')));
  const withClub = makeCollection({ slug: 'y', name: 'Y', kind: 'warmup', items: ['ex-club-prowler-gauntlet'] });
  assert.ok(validateCollection(withClub, EXERCISES).errors.some((e) => e.startsWith('not_engine_eligible')));
  const withArchived = makeCollection({ slug: 'z', name: 'Z', kind: 'warmup', items: ['ex-yates-row'] });
  assert.ok(validateCollection(withArchived, EXERCISES).errors.some((e) => e.startsWith('not_engine_eligible')));
});

test('broken references, duplicates and empties are rejected', () => {
  const broken = makeCollection({ slug: 'b', name: 'B', kind: 'mobility', items: ['ex-nope'] });
  assert.ok(validateCollection(broken, EXERCISES).errors.includes('unknown_exercise:ex-nope'));
  const dup = makeCollection({ slug: 'd', name: 'D', kind: 'mobility', items: ['ex-inchworm', 'ex-inchworm'] });
  assert.ok(validateCollection(dup, EXERCISES).errors.includes('duplicate_exercise:ex-inchworm'));
  const empty = makeCollection({ slug: 'e', name: 'E', kind: 'mobility', items: [] });
  assert.ok(validateCollection(empty, EXERCISES).errors.includes('empty_collection'));
  assert.ok(validateCollection({ id: 'x', name: 'X', kind: 'lifting_plan', items: [{ exerciseId: 'ex-inchworm' }] }, EXERCISES).errors.includes('bad_kind'));
});

test('collections must never carry prescription data', () => {
  const smuggled = {
    id: 'col-s', name: 'S', kind: 'warmup',
    items: [{ exerciseId: 'ex-inchworm', sets: 3, reps: 10, load: 100 }],
  };
  const v = validateCollection(smuggled, EXERCISES);
  assert.ok(v.errors.includes('prescription_data_forbidden:sets'));
  assert.ok(v.errors.includes('prescription_data_forbidden:reps'));
  assert.ok(v.errors.includes('prescription_data_forbidden:load'));
});

test('resolveCollection drops unresolvable refs instead of crashing', () => {
  const c = makeCollection({ slug: 'r', name: 'R', kind: 'warmup', items: ['ex-inchworm', 'ex-gone'] });
  const resolved = resolveCollection(c, EXERCISES);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].exercise.slug, 'inchworm');
});

test('kinds cover the briefed block types', () => {
  const ids = COLLECTION_KINDS.map((k) => k.id);
  for (const needed of ['warmup', 'activation', 'mobility', 'sprint_prep', 'recovery']) {
    assert.ok(ids.includes(needed), needed);
  }
});
