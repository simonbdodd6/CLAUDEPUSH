// CoachEasier Performance — programme versioning & snapshot tests (SC4).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendProgrammeAudit, beginEdit, canApproveProgramme,
  canPerformProgrammeAction, canViewProgramme, deepFreeze,
  iteratePrescriptions, PROGRAMME_AUDIT_MAX, publishProgrammeVersion,
  snapshotForProgrammeAssignment,
} from '../domain/programme-versioning.js';
import { validateProgramme } from '../domain/programme.js';
import { EXERCISES, getCatalogueMeta } from '../services/exercise-catalogue.js';
import { COLLECTIONS, getCollectionsMeta } from '../services/exercise-collections-catalogue.js';
import { buildSampleProgramme } from './programme.test.js';

const NOW = '2026-08-04T10:00:00.000Z';
const LATER = '2026-09-01T10:00:00.000Z';
const REFS = { catalogue: EXERCISES, collections: COLLECTIONS };

// ── Publishing & immutability ───────────────────────────────────────────────

test('publishing freezes the training content — deep mutation attempts throw', () => {
  const prog = buildSampleProgramme();
  const published = publishProgrammeVersion(prog, 1, { actor: 'admin-1', now: NOW });
  assert.equal(published.versionStatus, 'published');
  assert.equal(published.publishedAt, NOW);
  assert.ok(Object.isFrozen(published.phases), 'phases tree frozen');
  assert.throws(() => { 'use strict'; published.phases[0].weeks[0].objective = 'changed'; }, 'deep frozen');
  assert.throws(() => { 'use strict'; published.phases.push({}); }, 'arrays frozen');
  assert.throws(() => { 'use strict'; published.phases[0].weeks[0].days[0].sessions[0].blocks[1].prescriptions[0].sets[0].fields.rpe = 10; }, 'set fields frozen');
});

test('only drafts can be published; unknown versions throw', () => {
  const prog = buildSampleProgramme();
  publishProgrammeVersion(prog, 1, { now: NOW });
  assert.throws(() => publishProgrammeVersion(prog, 1, { now: NOW }), /not_a_draft/);
  assert.throws(() => publishProgrammeVersion(prog, 9, { now: NOW }), /unknown_version/);
});

// ── Edit-creates-new-version ────────────────────────────────────────────────

test('editing after publish creates a new draft version; the old one never changes', () => {
  const prog = buildSampleProgramme();
  publishProgrammeVersion(prog, 1, { actor: 'admin-1', now: NOW });
  const before = JSON.stringify(prog.versions[0]);

  const draft = beginEdit(prog, { actor: 'coach-1', now: LATER });
  assert.equal(draft.versionNumber, 2);
  assert.equal(draft.versionStatus, 'draft');
  assert.equal(draft.id, 'prog-preseason-strength@v2');
  assert.equal(prog.versions.length, 2);

  // The draft is a deep copy with fully renamed ids — editable without risk.
  draft.phases[0].weeks[0].objective = 'Heavier week';
  assert.equal(JSON.stringify(prog.versions[0]), before, 'published v1 byte-identical after editing v2');
  assert.ok(draft.phases[0].id.startsWith('prog-preseason-strength@v2'), 'child ids renamed to the new version');

  const v = validateProgramme(prog, REFS);
  assert.deepEqual(v.errors, [], 'programme with two versions still validates');
});

test('beginEdit returns the existing draft instead of stacking versions', () => {
  const prog = buildSampleProgramme();
  const d1 = beginEdit(prog, { now: NOW });
  const d2 = beginEdit(prog, { now: NOW });
  assert.equal(d1, d2);
  assert.equal(prog.versions.length, 1);
});

test('publishing v2 marks v1 superseded; v1 content stays frozen', () => {
  const prog = buildSampleProgramme();
  publishProgrammeVersion(prog, 1, { now: NOW });
  beginEdit(prog, { actor: 'coach-1', now: LATER });
  publishProgrammeVersion(prog, 2, { now: LATER });
  assert.equal(prog.versions[0].versionStatus, 'superseded');
  assert.equal(prog.versions[1].versionStatus, 'published');
  assert.ok(Object.isFrozen(prog.versions[0].phases), 'superseded content stays frozen');
  assert.ok(prog.versions[0].audit.some(a => a.action === 'superseded'), 'supersession audited');
});

// ── Assignment snapshots ────────────────────────────────────────────────────

test('assignment snapshot captures programme version, exercise versions, collections version and prescriptions — frozen', () => {
  const prog = buildSampleProgramme();
  publishProgrammeVersion(prog, 1, { now: NOW });
  const snap = snapshotForProgrammeAssignment(prog, 1, {
    catalogue: EXERCISES, collectionsMeta: getCollectionsMeta(), now: NOW,
  });
  assert.equal(snap.programmeVersionId, 'prog-preseason-strength@v1');
  assert.equal(snap.versionNumber, 1);
  assert.equal(snap.versionCreatedBy, 'coach-1', 'version author preserved');
  assert.equal(snap.versionPublishedAt, NOW, 'publication time preserved');
  assert.equal(snap.collectionsVersion, getCollectionsMeta().version);
  assert.deepEqual(snap.collectionIds, ['col-rugby-gym-warmup']);
  assert.ok(snap.exerciseSnapshots['ex-back-squat'], 'exercise snapshot captured');
  assert.equal(snap.exerciseSnapshots['ex-back-squat'].version, 1, 'exercise version pinned');
  assert.ok(snap.exerciseSnapshots['ex-back-squat'].painStop, 'safety text preserved');
  assert.ok(Object.isFrozen(snap));
  assert.throws(() => { 'use strict'; snap.prescriptionTree[0].weeks[0].objective = 'x'; }, 'tree frozen');
});

test('snapshots survive later catalogue/programme changes untouched', () => {
  const prog = buildSampleProgramme();
  publishProgrammeVersion(prog, 1, { now: NOW });
  const snap = snapshotForProgrammeAssignment(prog, 1, { catalogue: EXERCISES, collectionsMeta: getCollectionsMeta(), now: NOW });
  const before = JSON.stringify(snap);

  // Programme moves on: v2 drafted and edited.
  const draft = beginEdit(prog, { now: LATER });
  draft.phases[0].weeks[0].days[0].sessions[0].blocks[1].prescriptions[0].sets[0].fields.rpe = 9;
  // Catalogue moves on: a mutated copy simulating a later exercise edit.
  const mutated = structuredClone(EXERCISES);
  mutated.find((e) => e.id === 'ex-back-squat').name = 'Renamed Squat';

  assert.equal(JSON.stringify(snap), before, 'snapshot byte-identical after both changes');
  assert.equal(snap.exerciseSnapshots['ex-back-squat'].name, 'Back Squat', 'snapshot keeps original name');
});

test('drafts cannot be assigned; unknown exercises fail the snapshot loudly', () => {
  const prog = buildSampleProgramme();
  assert.throws(() => snapshotForProgrammeAssignment(prog, 1, { catalogue: EXERCISES }), /cannot_assign_draft/);
  publishProgrammeVersion(prog, 1, { now: NOW });
  assert.throws(() => snapshotForProgrammeAssignment(prog, 1, { catalogue: [] }), /unknown_exercise/);
});

test('iteratePrescriptions walks every prescription exactly once', () => {
  const prog = buildSampleProgramme();
  const ids = [...iteratePrescriptions(prog.versions[0])].map((p) => p.id);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
});

// ── Ownership & visibility ──────────────────────────────────────────────────

const clubCoach = { role: 'snc_coach', userId: 'coach-1', clubId: 'demo-club' };
const otherClubCoach = { role: 'snc_coach', userId: 'coach-9', clubId: 'other-club' };
const clubAdmin = { role: 'club_admin', userId: 'admin-1', clubId: 'demo-club' };
const player = { role: 'player', userId: 'p1', clubId: 'demo-club' };

test('club programmes stay in their club; approval gates player visibility', () => {
  const prog = buildSampleProgramme(); // club-owned, status draft
  assert.equal(canViewProgramme(prog, clubCoach), true);
  assert.equal(canViewProgramme(prog, clubAdmin), true);
  assert.equal(canViewProgramme(prog, otherClubCoach), false);
  assert.equal(canViewProgramme(prog, player), false, 'players cannot see drafts');
  prog.status = 'approved';
  assert.equal(canViewProgramme(prog, player), true);
});

test('coach-owned programmes are visible to their owner only', () => {
  const prog = buildSampleProgramme();
  prog.ownership = { ...prog.ownership, ownerType: 'coach', ownerCoach: 'coach-1', ownerClub: null };
  assert.equal(canViewProgramme(prog, clubCoach), true);
  assert.equal(canViewProgramme(prog, { ...clubCoach, userId: 'coach-2' }), false);
  assert.equal(canViewProgramme(prog, player), false);
});

test('archived programmes hide from players but remain for owning staff', () => {
  const prog = buildSampleProgramme();
  prog.status = 'approved';
  prog.archived = true;
  assert.equal(canViewProgramme(prog, player), false);
  assert.equal(canViewProgramme(prog, clubCoach), true);
  assert.equal(canViewProgramme(prog, otherClubCoach), false);
});

test('action matrix: platform programmes are platform-owned; club approval needs the admin', () => {
  const prog = buildSampleProgramme();
  assert.equal(canPerformProgrammeAction('edit', prog, clubCoach), true);
  assert.equal(canPerformProgrammeAction('publish_version', prog, clubCoach), true);
  assert.equal(canPerformProgrammeAction('approve', prog, clubCoach), false, 'coach cannot approve club programme');
  assert.equal(canPerformProgrammeAction('approve', prog, clubAdmin), true);
  assert.equal(canPerformProgrammeAction('edit', prog, otherClubCoach), false);
  const platform = { ...prog, ownership: { ...prog.ownership, ownerType: 'coacheasier', ownerClub: null } };
  assert.equal(canPerformProgrammeAction('edit', platform, clubAdmin), false);
  assert.equal(canPerformProgrammeAction('edit', platform, { role: 'system_admin' }), true);
});

test('approval always requires an independent reviewer', () => {
  const prog = buildSampleProgramme(); // author coach-1
  assert.equal(canApproveProgramme(prog, { ...clubAdmin, userId: 'coach-1' }), false, 'author cannot approve');
  assert.equal(canApproveProgramme(prog, clubAdmin), true);
});

// ── Audit ───────────────────────────────────────────────────────────────────

test('audit entries record lifecycle actions and the log is capped', () => {
  const prog = buildSampleProgramme();
  publishProgrammeVersion(prog, 1, { actor: 'admin-1', now: NOW });
  beginEdit(prog, { actor: 'coach-1', now: LATER });
  const actions = prog.audit.map((a) => a.action);
  assert.deepEqual(actions, ['created', 'version_published', 'draft_created']);
  let log = [];
  for (let i = 0; i < PROGRAMME_AUDIT_MAX + 20; i++) log = appendProgrammeAudit(log, { action: 'ping', at: NOW });
  assert.equal(log.length, PROGRAMME_AUDIT_MAX);
});

test('deepFreeze freezes nested structures and is idempotent', () => {
  const obj = deepFreeze({ a: { b: [1, { c: 2 }] } });
  assert.ok(Object.isFrozen(obj.a.b[1]));
  assert.equal(deepFreeze(obj), obj);
});
