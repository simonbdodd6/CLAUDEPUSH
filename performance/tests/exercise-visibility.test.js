// CoachEasier Performance — exercise tiers, approval & visibility tests (SC3).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canApproveRecord, canPerformAction, canViewExercise, isAssignableByCoach,
  isEngineEligible, nextVersionOnEdit, snapshotForAssignment, visibleExercises,
} from '../domain/exercise-visibility.js';
import { EXERCISES, getExerciseBySlug } from '../services/exercise-catalogue.js';

const validated = getExerciseBySlug('back-squat');
const draft = getExerciseBySlug('sled-push-relay');
const club = getExerciseBySlug('club-prowler-gauntlet');
const priv = getExerciseBySlug('coach-private-primer');
const archived = getExerciseBySlug('yates-row');

const player = { role: 'player', userId: 'p1', clubId: 'demo-club' };
const coach = { role: 'snc_coach', userId: 'coach-1', clubId: 'demo-club' };
const owner = { role: 'snc_coach', userId: 'coach-demo-99', clubId: 'demo-club' };
const otherClubCoach = { role: 'snc_coach', userId: 'coach-2', clubId: 'other-club' };
const admin = { role: 'club_admin', userId: 'admin-1', clubId: 'demo-club' };

test('players see approved validated content only', () => {
  assert.equal(canViewExercise(validated, player), true);
  assert.equal(canViewExercise(draft, player), false, 'drafts hidden from players');
  assert.equal(canViewExercise(priv, player), false, 'private content hidden');
  assert.equal(canViewExercise(archived, player), false, 'archived hidden from players');
});

test('club content is scoped to the club', () => {
  assert.equal(canViewExercise(club, player), true, 'same-club player sees approved club exercise');
  assert.equal(canViewExercise(club, otherClubCoach), false, 'other clubs never see it');
  assert.equal(canViewExercise(club, coach), true);
});

test('private content is visible only to its author (or explicit share)', () => {
  assert.equal(canViewExercise(priv, owner), true);
  assert.equal(canViewExercise(priv, coach), false, 'another coach in the same club cannot see it');
  const shared = { ...priv, ownership: { ...priv.ownership, sharedWith: ['coach-1'] } };
  assert.equal(canViewExercise(shared, coach), true, 'explicit share works');
});

test('visibleExercises never leaks hidden records', () => {
  const forPlayer = visibleExercises(EXERCISES, player);
  assert.ok(!forPlayer.some((e) => e.tier === 'draft' || e.tier === 'private' || e.status === 'archived'));
  const forOtherClub = visibleExercises(EXERCISES, otherClubCoach);
  assert.ok(!forOtherClub.some((e) => e.tier === 'club'), 'club content stays in its club');
});

test('action matrix: platform tiers are platform-owned', () => {
  for (const action of ['create', 'edit', 'approve', 'publish', 'archive']) {
    assert.equal(canPerformAction(action, 'validated', coach), false, `coach cannot ${action} validated`);
    assert.equal(canPerformAction(action, 'validated', admin), false, `club admin cannot ${action} validated`);
    assert.equal(canPerformAction(action, 'validated', { role: 'system_admin' }), true);
  }
});

test('action matrix: club tier — coaches author, admins approve', () => {
  assert.equal(canPerformAction('create', 'club', coach), true);
  assert.equal(canPerformAction('edit', 'club', coach), true);
  assert.equal(canPerformAction('approve', 'club', coach), false, 'authoring coach cannot approve club content');
  assert.equal(canPerformAction('approve', 'club', admin), true);
  assert.equal(canPerformAction('archive', 'club', admin), true);
  assert.equal(canPerformAction('restore', 'club', admin), true);
  assert.equal(canPerformAction('create', 'club', player), false);
});

test('approval requires an independent reviewer', () => {
  const clubDraft = { ...club, status: 'in_review', ownership: { ...club.ownership, author: 'admin-1' } };
  assert.equal(canApproveRecord(clubDraft, admin), false, 'author cannot approve their own record');
  assert.equal(canApproveRecord({ ...clubDraft, ownership: { ...clubDraft.ownership, author: 'coach-1' } }, admin), true);
});

test('engine eligibility: only approved CoachEasier-validated content', () => {
  assert.equal(isEngineEligible(validated), true);
  assert.equal(isEngineEligible(draft), false, 'drafts never engine-eligible');
  assert.equal(isEngineEligible(club), false, 'club content never auto-selected');
  assert.equal(isEngineEligible(priv), false, 'private content never auto-selected');
  assert.equal(isEngineEligible(archived), false, 'archived never engine-eligible');
});

test('coach assignment: explicit assignment wider than engine, but never drafts/archived', () => {
  assert.equal(isAssignableByCoach(validated, coach), true);
  assert.equal(isAssignableByCoach(club, coach), true, 'approved club content assignable in club');
  assert.equal(isAssignableByCoach(priv, owner), true, 'author may assign their private exercise');
  assert.equal(isAssignableByCoach(priv, coach), false);
  assert.equal(isAssignableByCoach(draft, coach), false, 'drafts never assignable');
  assert.equal(isAssignableByCoach(archived, coach), false);
});

test('snapshots freeze what a historical workout needs', () => {
  const snap = snapshotForAssignment(validated, '2026-08-04T10:00:00Z');
  assert.equal(snap.exerciseId, validated.id);
  assert.equal(snap.version, validated.version);
  assert.ok(snap.prescription.length > 0);
  assert.ok(snap.safetyNotes.length > 0);
  assert.ok(Object.isFrozen(snap), 'snapshot is frozen');
  assert.throws(() => { 'use strict'; snap.name = 'changed'; }, 'immutable');
});

test('editing an assigned exercise bumps its version; unassigned does not', () => {
  assert.equal(nextVersionOnEdit(validated, { hasBeenAssigned: true }), validated.version + 1);
  assert.equal(nextVersionOnEdit(validated, { hasBeenAssigned: false }), validated.version);
});
