// CoachEasier Performance — athlete profile domain tests (SC2).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ageBandFromDOB,
  appendWellness,
  createEmptyProfile,
  detectScheduleConflicts,
  displayWeight,
  equipmentCapability,
  getByPath,
  isAnswered,
  isStale,
  isStepComplete,
  isYouthBand,
  latestWellness,
  makeGoal,
  makeStrengthResult,
  makeWellnessEntry,
  missingRequiredFields,
  onboardingProgress,
  profileCompletion,
  REQUIRED_PATHS,
  requiredPathsForStep,
  restrictionNeedsReview,
  restrictionStatus,
  shouldRequestClearanceReview,
  staleSections,
  strengthBaselineBlocksOnboarding,
  strengthResultConfidence,
  toCm,
  toKg,
  validateGoal,
  wellnessIsStale,
} from '../domain/athlete-profile.js';
import { UNKNOWN, WELLNESS_LOG_MAX } from '../types/athlete-profile.js';

const NOW = new Date('2026-08-03T12:00:00');

function minimalCompleteProfile() {
  const p = createEmptyProfile({ userId: 'u1', teamId: 't1', clubId: 'c1', now: '2026-08-01T10:00:00' });
  p.personal.ageBand = '21_29';
  p.rugby.primaryPosition = 'openside_flanker';
  p.rugby.playingLevel = 'amateur_club';
  p.rugby.seasonPhase = 'pre_season';
  p.training.experience = 'intermediate';
  p.training.preferredSessionMinutes = 60;
  p.schedule.availableDays = ['Mon', 'Wed', 'Fri'];
  p.equipment.locations = ['team_gym'];
  p.goals = [makeGoal({ type: 'max_strength', now: '2026-08-01T10:00:00' })];
  p.sharing.consentAcceptedAt = '2026-08-01T10:00:00';
  return p;
}

// ── Answered / unknown semantics ────────────────────────────────────────────

test('isAnswered: null/empty are unanswered; UNKNOWN and values are answered', () => {
  assert.equal(isAnswered(null), false);
  assert.equal(isAnswered(undefined), false);
  assert.equal(isAnswered(''), false);
  assert.equal(isAnswered([]), false);
  assert.equal(isAnswered(UNKNOWN), true);
  assert.equal(isAnswered(0), true);
  assert.equal(isAnswered(false), true);
  assert.equal(isAnswered(['Mon']), true);
});

// ── Profile creation & references ───────────────────────────────────────────

test('createEmptyProfile references identities instead of duplicating them', () => {
  const p = createEmptyProfile({ userId: 'user-9', teamId: 'team-3', clubId: 'club-1' });
  assert.equal(p.userRef, 'user-9');
  assert.equal(p.teamRef, 'team-3');
  assert.equal(p.clubRef, 'club-1');
  assert.equal(p.id, 'perf-profile-user-9');
  assert.ok(!('name' in p), 'no duplicated display name');
  assert.ok(!('email' in p), 'no duplicated contact details');
});

// ── Completion & required fields ────────────────────────────────────────────

test('completion: empty profile is 0% and lists every required path', () => {
  const c = profileCompletion(createEmptyProfile({ userId: 'u1' }));
  assert.equal(c.pct, 0);
  assert.equal(c.requiredComplete, false);
  assert.deepEqual(c.missingRequired, REQUIRED_PATHS);
});

test('completion: minimal profile completes required (70%) without optional data', () => {
  const c = profileCompletion(minimalCompleteProfile());
  assert.equal(c.requiredComplete, true);
  assert.deepEqual(c.missingRequired, []);
  assert.equal(c.pct, 70, 'required-only completion is 70%');
});

test('completion: optional richness lifts toward 100 but never blocks', () => {
  const p = minimalCompleteProfile();
  p.body.heightCm = 185; p.body.weightKg = 98;
  p.strength.results = [makeStrengthResult({ testId: 'squat', status: 'estimated', value: 140, unit: 'kg', measurementType: 'estimated_1rm' })];
  p.pain.present = false;
  p.rugby.secondaryPosition = 'blindside_flanker';
  p.schedule.rugbyDays = [{ day: 'Tue', kind: 'training' }];
  p.goals[0].targetDate = '2026-10-01';
  const c = profileCompletion(p);
  assert.equal(c.pct, 100);
});

test('unknown values satisfy required fields', () => {
  const p = minimalCompleteProfile();
  p.personal.ageBand = UNKNOWN;
  p.rugby.seasonPhase = UNKNOWN;
  const c = profileCompletion(p);
  assert.equal(c.requiredComplete, true, 'unknown is a valid answer');
});

test('missing 1RM data never appears in required fields', () => {
  assert.ok(!REQUIRED_PATHS.some((p) => p.includes('strength')), 'no strength path is required');
  assert.equal(strengthBaselineBlocksOnboarding(), false);
});

// ── Onboarding steps ────────────────────────────────────────────────────────

test('step completion follows required paths; optional steps always complete', () => {
  const empty = createEmptyProfile({ userId: 'u1' });
  assert.equal(isStepComplete(empty, 'rugby'), false);
  assert.equal(isStepComplete(empty, 'strength'), true, 'strength step optional');
  assert.equal(isStepComplete(empty, 'readiness'), true, 'readiness step optional');
  const p = minimalCompleteProfile();
  for (const step of ['rugby', 'training', 'schedule', 'equipment', 'goals', 'privacy']) {
    assert.equal(isStepComplete(p, step), true, step + ' complete on minimal profile');
  }
});

test('onboardingProgress: canSubmit only when all required steps done', () => {
  const empty = createEmptyProfile({ userId: 'u1' });
  const before = onboardingProgress(empty);
  assert.equal(before.canSubmit, false);
  assert.ok(before.remainingRequired.includes('rugby'));
  const after = onboardingProgress(minimalCompleteProfile());
  assert.equal(after.canSubmit, true);
  assert.deepEqual(after.remainingRequired, []);
  assert.equal(after.pct, 100);
});

test('requiredPathsForStep returns copies and empty for unknown ids', () => {
  const a = requiredPathsForStep('rugby');
  a.push('mutated');
  assert.ok(!requiredPathsForStep('rugby').includes('mutated'));
  assert.deepEqual(requiredPathsForStep('nope'), []);
});

// ── Age bands ───────────────────────────────────────────────────────────────

test('ageBandFromDOB maps to bands and handles bad input', () => {
  assert.equal(ageBandFromDOB('2012-01-01', NOW), 'under_16');
  assert.equal(ageBandFromDOB('2009-06-01', NOW), '16_17');
  assert.equal(ageBandFromDOB('2007-09-01', NOW), '18_20', 'birthday not yet reached');
  assert.equal(ageBandFromDOB('2000-01-01', NOW), '21_29');
  assert.equal(ageBandFromDOB('1993-05-10', NOW), '30_34');
  assert.equal(ageBandFromDOB('1980-01-01', NOW), '35_plus');
  assert.equal(ageBandFromDOB('not-a-date', NOW), null);
  assert.equal(ageBandFromDOB(null, NOW), null);
});

test('isYouthBand flags under-18 bands', () => {
  assert.equal(isYouthBand('under_16'), true);
  assert.equal(isYouthBand('16_17'), true);
  assert.equal(isYouthBand('21_29'), false);
  assert.equal(isYouthBand('nonsense'), false);
});

// ── Units ───────────────────────────────────────────────────────────────────

test('unit normalisation: lb→kg, in→cm, and display round-trip', () => {
  assert.equal(toKg(100, 'kg'), 100);
  assert.equal(toKg(220.5, 'lb'), 100);
  assert.equal(toCm(180, 'cm'), 180);
  assert.equal(toCm(70.9, 'in'), 180.1);
  assert.equal(toKg('abc', 'kg'), null);
  assert.equal(toKg(-5, 'kg'), null);
  assert.deepEqual(displayWeight(100, 'lb'), { value: 220.5, unit: 'lb' });
  assert.deepEqual(displayWeight(100, 'kg'), { value: 100, unit: 'kg' });
});

// ── Goals ───────────────────────────────────────────────────────────────────

test('validateGoal accepts known types and rejects bad data', () => {
  assert.equal(validateGoal(makeGoal({ type: 'power' }), NOW).ok, true);
  assert.equal(validateGoal({ type: 'get_swole' }, NOW).ok, false);
  assert.deepEqual(validateGoal({ type: 'power', importance: 9 }, NOW).errors, ['invalid_importance']);
  assert.deepEqual(validateGoal({ type: 'power', targetDate: '2020-01-01' }, NOW).errors, ['target_date_in_past']);
  assert.equal(validateGoal({ type: 'power', targetDate: '2026-11-01', targetValue: 12 }, NOW).ok, true);
  assert.equal(validateGoal(null, NOW).ok, false);
});

// ── Schedule conflicts ──────────────────────────────────────────────────────

test('detectScheduleConflicts: match day, double sessions, preferred-not-available', () => {
  const conflicts = detectScheduleConflicts({
    availableDays: ['Mon', 'Tue', 'Sat'],
    preferredDays: ['Mon', 'Thu'],
    rugbyDays: [{ day: 'Tue', kind: 'training' }, { day: 'Sat', kind: 'match' }],
    matchDay: 'Sat',
  });
  const kinds = conflicts.map((c) => `${c.day}:${c.kind}`).sort();
  assert.deepEqual(kinds, ['Sat:match_day', 'Thu:preferred_not_available', 'Tue:double_session']);
  assert.deepEqual(detectScheduleConflicts(null), []);
  assert.deepEqual(detectScheduleConflicts({ availableDays: ['Mon'] }), []);
});

// ── Equipment ───────────────────────────────────────────────────────────────

test('equipmentCapability summarises access levels', () => {
  assert.equal(equipmentCapability({ locations: ['commercial_gym'], items: [] }).level, 'full');
  assert.equal(equipmentCapability({ locations: ['commercial_gym'], items: [] }).canBarbell, true);
  const home = equipmentCapability({ locations: ['home_gym'], items: ['dumbbells', 'bands'] });
  assert.equal(home.level, 'moderate');
  assert.equal(home.canBarbell, false);
  const minimal = equipmentCapability({ locations: ['home_gym'], items: ['bands'] });
  assert.equal(minimal.level, 'minimal');
  assert.equal(equipmentCapability({ locations: ['bodyweight_only'], items: [] }).level, 'bodyweight');
  const custom = equipmentCapability({ locations: ['home_gym'], items: ['bands', 'tractor tyre'] });
  assert.deepEqual(custom.unknownItems, ['tractor tyre']);
});

// ── Strength results ────────────────────────────────────────────────────────

test('strengthResultConfidence: unknown→none, grades by status/source/age', () => {
  assert.equal(strengthResultConfidence(makeStrengthResult({ testId: 'squat' }), NOW), 'none');
  assert.equal(strengthResultConfidence(makeStrengthResult({ testId: 'squat', status: 'actual', source: 'coach_measured', value: 150, date: '2026-07-20' }), NOW), 'high');
  assert.equal(strengthResultConfidence(makeStrengthResult({ testId: 'squat', status: 'actual', source: 'coach_measured', value: 150, date: '2025-09-01' }), NOW), 'medium');
  assert.equal(strengthResultConfidence(makeStrengthResult({ testId: 'squat', status: 'actual', source: 'self_reported', value: 150, date: '2026-07-20' }), NOW), 'medium');
  assert.equal(strengthResultConfidence(makeStrengthResult({ testId: 'squat', status: 'estimated', source: 'formula', value: 140, date: '2026-01-01' }), NOW), 'low');
});

test('makeStrengthResult coerces bad status to unknown', () => {
  assert.equal(makeStrengthResult({ testId: 'squat', status: 'guessed' }).status, UNKNOWN);
});

// ── Wellness ────────────────────────────────────────────────────────────────

test('wellness entries are validated, capped and never mutate the profile', () => {
  const entry = makeWellnessEntry({ date: '2026-08-03T07:00:00', scores: { sleep: 4, fatigue: 9, stress: 'x' }, note: 'ok' });
  assert.equal(entry.scores.sleep, 4);
  assert.equal(entry.scores.fatigue, null, 'out-of-scale becomes null');
  assert.equal(entry.scores.stress, null);

  let log = [];
  for (let i = 0; i < WELLNESS_LOG_MAX + 5; i++) {
    log = appendWellness(log, makeWellnessEntry({ date: `2026-07-${String((i % 28) + 1).padStart(2, '0')}` }));
  }
  assert.equal(log.length, WELLNESS_LOG_MAX, 'log capped');
  assert.equal(latestWellness([]), null);
  assert.equal(wellnessIsStale(makeWellnessEntry({ date: '2026-08-03T07:00:00' }), NOW), false);
  assert.equal(wellnessIsStale(makeWellnessEntry({ date: '2026-07-25T07:00:00' }), NOW), true);
  assert.equal(wellnessIsStale(null, NOW), true);
});

// ── Restrictions & clearance review ─────────────────────────────────────────

test('restrictionStatus over its lifecycle', () => {
  const base = { restriction: 'No contact', effectiveFrom: '2026-08-01', effectiveTo: '2026-08-10', reviewDate: '2026-08-05' };
  assert.equal(restrictionStatus(base, new Date('2026-07-30')), 'scheduled');
  assert.equal(restrictionStatus(base, new Date('2026-08-05')), 'active');
  assert.equal(restrictionStatus(base, new Date('2026-08-20')), 'expired');
  assert.equal(restrictionStatus({ ...base, overriddenAt: '2026-08-03' }, new Date('2026-08-05')), 'overridden');
  assert.equal(restrictionStatus({ restriction: 'open-ended' }, NOW), 'active', 'no dates → active');
});

test('restrictionNeedsReview only for active restrictions past review date', () => {
  const r = { restriction: 'Modified lower body', effectiveFrom: '2026-07-01', reviewDate: '2026-08-01' };
  assert.equal(restrictionNeedsReview(r, NOW), true);
  assert.equal(restrictionNeedsReview({ ...r, reviewDate: '2026-09-01' }, NOW), false);
  assert.equal(restrictionNeedsReview({ ...r, effectiveTo: '2026-07-15' }, NOW), false, 'expired needs no review');
});

test('shouldRequestClearanceReview routes without diagnosing', () => {
  const clean = minimalCompleteProfile();
  assert.deepEqual(shouldRequestClearanceReview(clean, NOW), { request: false, reasons: [] });

  const clearance = minimalCompleteProfile();
  clearance.health.medicalClearanceRequired = true;
  clearance.health.returnToTrainingStatus = 'modified';
  assert.ok(shouldRequestClearanceReview(clearance, NOW).reasons.includes('clearance_required'));

  const pain = minimalCompleteProfile();
  pain.pain = { ...pain.pain, present: true, trainingRestricted: true, severity: 2 };
  assert.ok(shouldRequestClearanceReview(pain, NOW).reasons.includes('player_reported_restriction'));

  const severe = minimalCompleteProfile();
  severe.pain = { ...severe.pain, present: true, severity: 5, trainingRestricted: false };
  assert.ok(shouldRequestClearanceReview(severe, NOW).reasons.includes('high_reported_severity'));

  const due = minimalCompleteProfile();
  due.coachRestrictions = [{ restriction: 'x', effectiveFrom: '2026-07-01', reviewDate: '2026-07-20' }];
  assert.ok(shouldRequestClearanceReview(due, NOW).reasons.includes('restriction_review_due'));
});

// ── Staleness ───────────────────────────────────────────────────────────────

test('isStale and staleSections flag out-of-date data', () => {
  assert.equal(isStale('2026-07-01', NOW, 180), false);
  assert.equal(isStale('2025-12-01', NOW, 180), true);
  assert.equal(isStale(null, NOW), true);

  const p = minimalCompleteProfile();
  p.body.measuredAt = '2025-09-01';
  p.strength.results = [makeStrengthResult({ testId: 'squat', status: 'actual', value: 150, date: '2026-07-01' })];
  const sections = staleSections(p, NOW).map((s) => s.section);
  assert.ok(sections.includes('body'));
  assert.ok(!sections.includes('strength'));
});

// ── getByPath ───────────────────────────────────────────────────────────────

test('getByPath walks nested paths safely', () => {
  const p = minimalCompleteProfile();
  assert.equal(getByPath(p, 'rugby.primaryPosition'), 'openside_flanker');
  assert.equal(getByPath(p, 'nope.deep.path'), undefined);
});
