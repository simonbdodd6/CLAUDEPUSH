// CoachEasier Performance — programme domain tests (SC4).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBlock, createExercisePrescription, createPhase, createProgramme,
  createProgrammeVersion, createSession, createSetPrescription,
  createTrainingDay, createWeek, reorderSiblings, sortedByOrder,
  validateProgramme, validateProgrammeVersion,
} from '../domain/programme.js';
import { EXERCISES } from '../services/exercise-catalogue.js';
import { COLLECTIONS } from '../services/exercise-collections-catalogue.js';

const NOW = '2026-08-04T10:00:00.000Z';
const REFS = { catalogue: EXERCISES, collections: COLLECTIONS };

/** Build a small but complete, valid programme tree. */
export function buildSampleProgramme() {
  const prog = createProgramme({
    slug: 'preseason-strength', title: 'Pre-season Strength Foundation',
    description: 'Sample structure for tests.', goal: 'preseason_prep', season: 'pre_season',
    ownerType: 'club', ownerClub: 'demo-club', ownerCoach: null, author: 'coach-1', now: NOW,
  });
  const v1 = createProgrammeVersion(prog, { versionNumber: 1, createdBy: 'coach-1', now: NOW });
  const phase = createPhase(v1.id, { phaseType: 'pre_season', order: 1, objective: 'General prep', now: NOW });
  const week = createWeek(phase.id, { weekNumber: 1, objective: 'Introduce main lifts', now: NOW });
  const day = createTrainingDay(week.id, { day: 'Mon', order: 1, priority: 'primary', rugbyRelation: 'none', now: NOW });
  const session = createSession(day.id, { title: 'Lower Strength A', order: 1, purpose: 'strength', estimatedMinutes: 60, now: NOW });

  const warmup = createBlock(session.id, { blockType: 'warmup', order: 1, collectionRefs: ['col-rugby-gym-warmup'], now: NOW });
  const main = createBlock(session.id, { blockType: 'main_strength', order: 2, coachNotes: 'Leave one rep in reserve.', now: NOW });

  const squat = createExercisePrescription(main.id, { exerciseId: 'ex-back-squat', order: 1, coachingNotes: 'Pause first rep of each set.', now: NOW });
  squat.sets.push(createSetPrescription(squat.id, { order: 1, fields: { sets: 3, reps: 5, rpe: 7, restSec: 180 }, now: NOW }));
  squat.sets.push(createSetPrescription(squat.id, { order: 2, fields: { sets: 1, reps: '3-5', percentage: 80, tempo: '3-1-X-0' }, now: NOW }));

  const bike = createExercisePrescription(main.id, { exerciseId: 'ex-bike-intervals', order: 2, substitutionPolicy: 'coach_only', now: NOW });
  bike.sets.push(createSetPrescription(bike.id, { order: 1, fields: { rounds: 6, durationSec: 30, workRest: '1:3' }, now: NOW }));

  main.prescriptions.push(squat, bike);
  session.blocks.push(warmup, main);
  day.sessions.push(session);
  week.days.push(day);
  phase.weeks.push(week);
  v1.phases.push(phase);
  prog.versions.push(v1);
  return prog;
}

// ── Hierarchy & happy path ──────────────────────────────────────────────────

test('a complete sample tree validates cleanly', () => {
  const prog = buildSampleProgramme();
  const v = validateProgramme(prog, REFS);
  assert.deepEqual(v.errors, []);
  assert.ok(v.ok);
});

test('hierarchy: every node carries the common spine', () => {
  const prog = buildSampleProgramme();
  const version = prog.versions[0];
  const nodes = [
    version,
    version.phases[0],
    version.phases[0].weeks[0],
    version.phases[0].weeks[0].days[0],
    version.phases[0].weeks[0].days[0].sessions[0],
    version.phases[0].weeks[0].days[0].sessions[0].blocks[0],
    version.phases[0].weeks[0].days[0].sessions[0].blocks[1].prescriptions[0],
    version.phases[0].weeks[0].days[0].sessions[0].blocks[1].prescriptions[0].sets[0],
  ];
  const kinds = nodes.map((n) => n.kind);
  assert.deepEqual(kinds, ['programme_version', 'phase', 'week', 'training_day', 'session', 'block', 'exercise_prescription', 'set_prescription']);
  for (const n of nodes) {
    assert.ok(typeof n.id === 'string' && n.id.length > 0, 'id');
    assert.equal(n.schemaVersion, 1);
    assert.ok('status' in n && 'order' in n && 'meta' in n && Array.isArray(n.audit), n.kind + ' spine complete');
  }
});

test('ids are hierarchical and unique across the tree', () => {
  const prog = buildSampleProgramme();
  const version = prog.versions[0];
  assert.equal(version.id, 'prog-preseason-strength@v1');
  const squat = version.phases[0].weeks[0].days[0].sessions[0].blocks[1].prescriptions[0];
  assert.ok(squat.id.startsWith(version.id), 'child ids nest under the version');
  assert.ok(squat.sets[0].id.startsWith(squat.id));
});

// ── Reference rules ─────────────────────────────────────────────────────────

test('prescriptions reference exercises only — definitions never duplicated', () => {
  const prog = buildSampleProgramme();
  const p = prog.versions[0].phases[0].weeks[0].days[0].sessions[0].blocks[1].prescriptions[0];
  for (const banned of ['name', 'classification', 'coaching', 'safety', 'media']) {
    assert.ok(!(banned in p), `no ${banned} on prescription`);
  }
  // A leaked definition is caught by validation.
  const leaked = { ...p, name: 'Back Squat' };
  const version = structuredClone(prog.versions[0]);
  version.phases[0].weeks[0].days[0].sessions[0].blocks[1].prescriptions[0] = leaked;
  const v = validateProgrammeVersion(version, REFS);
  assert.ok(v.errors.some((e) => e.startsWith('definition_duplicated:')), v.errors.join(','));
});

test('unknown, draft, club, private and archived exercises are rejected', () => {
  const prog = buildSampleProgramme();
  const version = structuredClone(prog.versions[0]);
  const p = version.phases[0].weeks[0].days[0].sessions[0].blocks[1].prescriptions[0];
  for (const [exerciseId, expected] of [
    ['ex-nope', 'unknown_exercise:ex-nope'],
    ['ex-sled-push-relay', 'exercise_not_engine_eligible:ex-sled-push-relay'],
    ['ex-club-prowler-gauntlet', 'exercise_not_engine_eligible:ex-club-prowler-gauntlet'],
    ['ex-coach-private-primer', 'exercise_not_engine_eligible:ex-coach-private-primer'],
    ['ex-yates-row', 'exercise_not_engine_eligible:ex-yates-row'],
  ]) {
    p.exerciseId = exerciseId;
    const v = validateProgrammeVersion(version, REFS);
    assert.ok(v.errors.includes(expected), `${exerciseId} → ${expected}`);
  }
});

test('collection references must resolve; unknown collections are rejected', () => {
  const prog = buildSampleProgramme();
  const version = structuredClone(prog.versions[0]);
  version.phases[0].weeks[0].days[0].sessions[0].blocks[0].collectionRefs = [{ collectionId: 'col-nope', collectionsVersion: null }];
  const v = validateProgrammeVersion(version, REFS);
  assert.ok(v.errors.includes('unknown_collection:col-nope'));
});

// ── Set prescriptions ───────────────────────────────────────────────────────

test('set fields must be declared by the referenced exercise', () => {
  const prog = buildSampleProgramme();
  const version = structuredClone(prog.versions[0]);
  const bike = version.phases[0].weeks[0].days[0].sessions[0].blocks[1].prescriptions[1];
  bike.sets[0].fields.load = 100; // bike-intervals declares no 'load' prescription
  const v = validateProgrammeVersion(version, REFS);
  assert.ok(v.errors.some((e) => e.startsWith('field_not_declared_by_exercise:') && e.endsWith(':load')));
});

test('set values are type-checked; unknown fields rejected; nothing calculated', () => {
  const prog = buildSampleProgramme();
  const version = structuredClone(prog.versions[0]);
  const squat = version.phases[0].weeks[0].days[0].sessions[0].blocks[1].prescriptions[0];
  squat.sets[0].fields.sets = -2;
  squat.sets[0].fields.mystery = 1;
  const v = validateProgrammeVersion(version, REFS);
  assert.ok(v.errors.some((e) => e.startsWith('bad_set_value:') && e.endsWith(':sets')));
  assert.ok(v.errors.some((e) => e.startsWith('unknown_set_field:') && e.endsWith(':mystery')));
});

test('createSetPrescription strips unknown fields and stores values verbatim', () => {
  const set = createSetPrescription('p1', { order: 1, fields: { reps: '6-8', percentage: 75, calculatedLoad: 123 } });
  assert.deepEqual(set.fields, { reps: '6-8', percentage: 75 }, 'unknown/derived fields dropped');
});

test('reps ranges accept "5-8" style strings only', () => {
  const prog = buildSampleProgramme();
  const version = structuredClone(prog.versions[0]);
  const squat = version.phases[0].weeks[0].days[0].sessions[0].blocks[1].prescriptions[0];
  squat.sets[0].fields.reps = 'about five';
  const v = validateProgrammeVersion(version, REFS);
  assert.ok(v.errors.some((e) => e.startsWith('bad_set_value:') && e.endsWith(':reps')));
});

// ── Ordering & duplicates ───────────────────────────────────────────────────

test('duplicate sibling order values are rejected', () => {
  const prog = buildSampleProgramme();
  const version = structuredClone(prog.versions[0]);
  version.phases[0].weeks[0].days[0].sessions[0].blocks[1].order = 1; // clashes with warmup
  const v = validateProgrammeVersion(version, REFS);
  assert.ok(v.errors.some((e) => e.startsWith('duplicate_order:blocks:')));
});

test('duplicate node ids anywhere in the tree are rejected', () => {
  const prog = buildSampleProgramme();
  const version = structuredClone(prog.versions[0]);
  const b = version.phases[0].weeks[0].days[0].sessions[0].blocks;
  b[1] = { ...b[1], id: b[0].id, order: 2 };
  const v = validateProgrammeVersion(version, REFS);
  assert.ok(v.errors.some((e) => e.startsWith('duplicate_id:')));
});

test('weeks must be sequential within a phase', () => {
  const prog = buildSampleProgramme();
  const version = structuredClone(prog.versions[0]);
  const phase = version.phases[0];
  const w2 = createWeek(phase.id, { weekNumber: 1, now: NOW }); // repeats week 1
  w2.order = 2;
  w2.id = `${phase.id}:week-dup`;
  phase.weeks.push(w2);
  const v = validateProgrammeVersion(version, REFS);
  assert.ok(v.errors.some((e) => e.startsWith('week_out_of_sequence:')));
});

test('sortedByOrder and reorderSiblings keep order coherent (pure)', () => {
  const list = [{ id: 'a', order: 2 }, { id: 'b', order: 1 }, { id: 'c', order: 3 }];
  assert.deepEqual(sortedByOrder(list).map((n) => n.id), ['b', 'a', 'c']);
  const moved = reorderSiblings(list, 'c', 0);
  assert.deepEqual(moved.map((n) => n.id), ['c', 'b', 'a']);
  assert.deepEqual(moved.map((n) => n.order), [1, 2, 3], 'renumbered contiguously');
  assert.deepEqual(list.map((n) => n.order), [2, 1, 3], 'input untouched');
});

// ── Taxonomy enforcement ────────────────────────────────────────────────────

test('phase, day, session and block vocabularies are enforced; no rehab phase exists', () => {
  const prog = buildSampleProgramme();
  const version = structuredClone(prog.versions[0]);
  version.phases[0].phaseType = 'rehabilitation';
  version.phases[0].weeks[0].days[0].day = 'Funday';
  version.phases[0].weeks[0].days[0].priority = 'critical';
  version.phases[0].weeks[0].days[0].sessions[0].purpose = 'party';
  version.phases[0].weeks[0].days[0].sessions[0].blocks[0].blockType = 'rehab';
  const v = validateProgrammeVersion(version, REFS);
  for (const e of ['bad_phase_type:rehabilitation', 'bad_block_type:rehab']) assert.ok(v.errors.includes(e), e);
  assert.ok(v.errors.some((x) => x.startsWith('bad_day:')));
  assert.ok(v.errors.some((x) => x.startsWith('bad_priority:')));
  assert.ok(v.errors.some((x) => x.startsWith('bad_purpose:')));
});

test('week planned volume/intensity are placeholders (strings), never numbers to compute with', () => {
  const prog = buildSampleProgramme();
  const version = structuredClone(prog.versions[0]);
  version.phases[0].weeks[0].plannedVolume = 42;
  const v = validateProgrammeVersion(version, REFS);
  assert.ok(v.errors.some((e) => e.startsWith('planned_volume_not_placeholder:')));
  version.phases[0].weeks[0].plannedVolume = 'moderate';
  version.phases[0].weeks[0].plannedIntensity = 'building';
  assert.ok(validateProgrammeVersion(version, REFS).ok);
});

// ── Programme root ──────────────────────────────────────────────────────────

test('programme root validation: identity, vocab, ownership consistency, flags', () => {
  const bad = createProgramme({ slug: 'x', title: 'X', goal: 'get_huge', season: 'silly_season', ownerType: 'club', ownerClub: null, author: 'c1', now: NOW });
  bad.sport = 'chess';
  const v = validateProgramme(bad, REFS);
  for (const e of ['bad_sport', 'bad_goal', 'bad_season', 'club_owner_missing_club']) assert.ok(v.errors.includes(e), e);
  const good = buildSampleProgramme();
  assert.equal(typeof good.template, 'boolean');
  assert.equal(typeof good.archived, 'boolean');
});

test('duplicate version numbers on a programme are rejected', () => {
  const prog = buildSampleProgramme();
  prog.versions.push(structuredClone(prog.versions[0]));
  const v = validateProgramme(prog, REFS);
  assert.ok(v.errors.includes('duplicate_version:1'));
});
