// CoachEasier Performance — progression rules tests (SC6).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activeOverrides, applyProgressionBudget, decideProgression,
  makeCoachOverride, resolveBaselinePrescription, selectProgressionMethod,
} from '../domain/progression-rules.js';
import { makeLoad } from '../domain/load-model.js';
import { getExerciseBySlug } from '../services/exercise-catalogue.js';

const ASOF = '2026-08-10T10:00:00.000Z';
const squat = getExerciseBySlug('back-squat');
const plank = getExerciseBySlug('front-plank');
const bike = getExerciseBySlug('bike-intervals');
const dbBench = getExerciseBySlug('db-bench');

const ok = (date, { top = true, easy = false, hard = false } = {}) =>
  ({ date, outcome: 'successful', failedSets: 0, technicalFailures: 0, painStop: false, topOfRange: top, effortBelowTarget: easy, effortAboveTarget: hard });
const fail = (date, technical = false) =>
  ({ date, outcome: 'failed', failedSets: 3, technicalFailures: technical ? 1 : 0, painStop: false, topOfRange: false, effortBelowTarget: false, effortAboveTarget: false });
const miss = (date) => ({ date, outcome: 'missed', failedSets: 0, technicalFailures: 0, painStop: false, topOfRange: false, effortBelowTarget: false, effortAboveTarget: false });

function base(over = {}) {
  return {
    ids: { athleteRef: 'u1', programmeRef: 'prog-x', programmeVersionRef: 'prog-x@v1', exerciseId: squat.id, exerciseVersion: 1 },
    exercise: squat,
    prescription: { sets: 3, repRange: [6, 8], load: makeLoad('kg', 100), rpeTarget: 7 },
    equipmentKind: 'barbell',
    history: [ok('2026-08-03'), ok('2026-08-06'), ok('2026-08-08')],
    readiness: [],
    match: {},
    athlete: { context: 'adult', experience: 'intermediate', techConfidence: 'medium', supervisionAvailable: true },
    restrictions: {},
    overrides: [],
    asOf: ASOF,
    ...over,
  };
}

// ── Determinism ─────────────────────────────────────────────────────────────

test('determinism: identical inputs produce byte-equivalent decisions', () => {
  const input = base();
  assert.equal(JSON.stringify(decideProgression(structuredClone(input))), JSON.stringify(decideProgression(structuredClone(input))));
});

// ── Baseline resolution (Part 4) ────────────────────────────────────────────

test('baseline: categories become bounded structure; youth ceilings bind', () => {
  const adult = resolveBaselinePrescription({ volumeCategory: 'high', intensityCategory: 'high', exercise: squat, experience: 'advanced', context: 'adult' });
  assert.equal(adult.prescription.sets, 4);
  assert.deepEqual(adult.prescription.repRange, [3, 6]);
  assert.equal(adult.prescription.rpeTarget, 8);
  const u16 = resolveBaselinePrescription({ volumeCategory: 'high', intensityCategory: 'high', exercise: squat, experience: 'advanced', context: 'youth_u16' });
  assert.equal(u16.prescription.sets, 3, 'youth set ceiling');
  assert.equal(u16.prescription.rpeTarget, 7, 'youth effort ceiling');
  const hold = resolveBaselinePrescription({ volumeCategory: 'low', intensityCategory: 'moderate', exercise: plank, experience: 'beginner', context: 'adult' });
  assert.ok(hold.prescription.durationSec > 0, 'hold-based exercises get duration, not reps');
});

// ── Method selection ────────────────────────────────────────────────────────

test('method selection follows SC3 prescription capabilities', () => {
  assert.equal(selectProgressionMethod(squat, { load: makeLoad('kg', 100), repRange: [6, 8] }), 'double_progression');
  assert.equal(selectProgressionMethod(squat, { load: makeLoad('percentage', 75, { of: 'e1rm:epley_v1' }), repRange: [5, 5] }), 'percentage');
  assert.equal(selectProgressionMethod(plank, { durationSec: 30 }), 'duration');
  assert.equal(selectProgressionMethod(bike, { durationSec: 30, densityMin: null }), 'duration');
  assert.equal(selectProgressionMethod(getExerciseBySlug('push-up'), { repRange: [8, 12] }), 'fixed_load_reps');
});

// ── Progression is earned (Parts 8–9, 19) ───────────────────────────────────

test('one successful exposure does not progress', () => {
  const d = decideProgression(base({ history: [ok('2026-08-08')] }));
  assert.equal(d.outcome, 'repeat_exposure');
  assert.ok(d.flags.some((f) => f.id === 'insufficient_exposure_history'));
  assert.ok(d.reasons.some((r) => r.code === 'insufficient_exposures'));
});

test('a PR never bypasses the evidence gate', () => {
  const d = decideProgression(base({
    history: [ok('2026-08-08')],
    personalRecords: [{ kind: 'personal_record', exerciseId: squat.id, triggersProgression: false }],
  }));
  assert.equal(d.outcome, 'repeat_exposure');
  assert.ok(d.reasons.some((r) => r.code === 'pr_maintain'), 'PR acknowledged as evidence only');
});

test('repeated successful top-of-range exposures earn a bounded load increase', () => {
  const d = decideProgression(base());
  assert.equal(d.outcome, 'progress_load');
  assert.equal(d.proposedPrescription.load.value, 105, 'largest increment multiple inside the adult-intermediate 5%/5kg bound');
  assert.ok(d.proposedPrescription.load.value - 100 <= 5, 'never an arbitrary jump');
  assert.ok(d.reasons.some((r) => r.code === 'progress_load'));
  assert.ok(d.constraints.boundsApplied.length > 0, 'bounds recorded for audit');
});

test('below top of range → reps progress before load (double progression)', () => {
  const d = decideProgression(base({ history: [ok('2026-08-03', { top: false }), ok('2026-08-06', { top: false }), ok('2026-08-08', { top: false })] }));
  assert.equal(d.outcome, 'progress_reps');
});

test('achieved effort above target holds progression', () => {
  const d = decideProgression(base({ history: [ok('2026-08-03'), ok('2026-08-06'), ok('2026-08-08', { hard: true })] }));
  assert.equal(d.outcome, 'maintain');
  assert.ok(d.reasons.some((r) => r.code === 'effort_excessive'));
});

test('duration, distance and density progress by bounded percentages', () => {
  const dur = decideProgression(base({ exercise: plank, prescription: { sets: 3, durationSec: 40 }, equipmentKind: 'bodyweight' }));
  assert.equal(dur.outcome, 'progress_duration');
  assert.equal(dur.proposedPrescription.durationSec, 44, '+10% bound');
  const dist = decideProgression(base({ exercise: getExerciseBySlug('tempo-runs'), prescription: { sets: 1, distanceM: 100 }, equipmentKind: 'bodyweight' }));
  assert.equal(dist.outcome, 'progress_distance');
  assert.equal(dist.proposedPrescription.distanceM, 110);
});

// ── Equipment increments (Part 12) ──────────────────────────────────────────

test('dumbbell jump larger than the bound → reps progress instead of a forced jump', () => {
  const d = decideProgression(base({
    exercise: dbBench, equipmentKind: 'dumbbells',
    prescription: { sets: 3, repRange: [8, 12], load: makeLoad('kg', 22), rpeTarget: 7 },
    athlete: { context: 'adult', experience: 'beginner', techConfidence: 'medium', supervisionAvailable: true },
    history: [ok('2026-08-01'), ok('2026-08-04'), ok('2026-08-08')],
  }));
  // beginner bound = min(5% of 22 = 1.1, 5kg) = 1.1 < dumbbell increment 2
  assert.equal(d.outcome, 'progress_reps');
  assert.ok(d.flags.some((f) => f.id === 'equipment_increment_too_large'));
  assert.ok(d.reasons.some((r) => r.code === 'reps_before_load_increment'));
});

test('bodyweight exercises progress reps — never an invented load', () => {
  const d = decideProgression(base({
    exercise: getExerciseBySlug('push-up'), equipmentKind: 'bodyweight',
    prescription: { sets: 3, repRange: [8, 12], load: makeLoad('bodyweight') },
  }));
  assert.equal(d.outcome, 'progress_reps');
  assert.equal(d.proposedPrescription.load.type, 'bodyweight');
});

// ── Failures (Part 10) ──────────────────────────────────────────────────────

test('one failed set/session → repeat without overreaction', () => {
  const d = decideProgression(base({ history: [ok('2026-08-03'), ok('2026-08-06'), fail('2026-08-08')] }));
  assert.equal(d.outcome, 'repeat_exposure');
  assert.ok(d.reasons.some((r) => r.code === 'single_failure_hold'));
});

test('repeated failures regress modestly with review flag', () => {
  const d = decideProgression(base({ history: [ok('2026-08-01'), fail('2026-08-04'), fail('2026-08-08')] }));
  assert.equal(d.outcome, 'regress_load');
  assert.equal(d.proposedPrescription.load.value, 97.5, 'one increment down — modest, not dramatic');
  assert.ok(d.flags.some((f) => f.id === 'repeated_failure'));
  assert.equal(d.requiresReview, true);
});

test('technical failure holds and requests technique review — not treated as injury', () => {
  const d = decideProgression(base({ history: [ok('2026-08-03'), ok('2026-08-06'), fail('2026-08-08', true)] }));
  assert.equal(d.outcome, 'hold_due_to_uncertainty');
  assert.ok(d.flags.some((f) => f.id === 'technical_review_required'));
  assert.ok(!JSON.stringify(d.reasons).toLowerCase().includes('injur'), 'no injury language');
});

test('pain-stop blocks progression and routes to review — no substitution', () => {
  const d = decideProgression(base({ history: [ok('2026-08-03'), { ...ok('2026-08-08'), outcome: 'pain_stop', painStop: true }] }));
  assert.equal(d.outcome, 'blocked');
  assert.equal(d.proposedPrescription, null, 'nothing proposed for pain');
  assert.ok(d.flags.some((f) => f.id === 'pain_stop' && f.severity === 'blocking'));
});

// ── Readiness (Parts 13–14) ─────────────────────────────────────────────────

const rEntry = (date, avg) => ({ date, scores: { sleep: avg, fatigue: avg, soreness: avg } });

test('no readiness data → base prescription preserved', () => {
  const d = decideProgression(base({ readiness: [] }));
  assert.equal(d.outcome, 'progress_load', 'absence of check-ins never blocks');
  assert.ok(d.reasons.some((r) => r.code === 'readiness_no_data'));
});

test('one low readiness entry → little/no change', () => {
  const d = decideProgression(base({ readiness: [rEntry('d1', 4), rEntry('d2', 2)] }));
  assert.equal(d.outcome, 'progress_load', 'single entry never rewrites the programme');
  assert.ok(d.reasons.some((r) => r.code === 'readiness_single_low'));
});

test('ordinary soreness alone does not reduce training', () => {
  const d = decideProgression(base({ readiness: [rEntry('d1', 3), rEntry('d2', 3)] }));
  assert.equal(d.outcome, 'progress_load');
});

test('sustained low readiness → one set removed, review-visible, not a rewrite', () => {
  const d = decideProgression(base({ readiness: [rEntry('d1', 2), rEntry('d2', 1.5), rEntry('d3', 2)] }));
  assert.equal(d.outcome, 'regress_sets');
  assert.equal(d.proposedPrescription.sets, 2, 'exactly one set removed');
  assert.ok(d.flags.some((f) => f.id === 'sustained_low_readiness'));
});

// ── Match proximity (Part 15) ───────────────────────────────────────────────

test('MD-2 holds lower-body load progression despite successful history', () => {
  const d = decideProgression(base({ match: { md: 'MD-2' } }));
  assert.equal(d.outcome, 'maintain');
  assert.ok(d.reasons.some((r) => r.code === 'match_hold'));
});

test('MD-2 upper-body work may still progress', () => {
  const d = decideProgression(base({
    exercise: getExerciseBySlug('bench-press'), match: { md: 'MD-2' },
    prescription: { sets: 3, repRange: [6, 8], load: makeLoad('kg', 80), rpeTarget: 7 },
  }));
  assert.equal(d.outcome, 'progress_load');
});

test('MD-1 primer receives no volume/load progression; MD+1 never triggers strength progression', () => {
  const md1 = decideProgression(base({ match: { md: 'MD-1' } }));
  assert.equal(md1.outcome, 'maintain');
  assert.ok(md1.reasons.some((r) => r.code === 'md1_primer'));
  const post = decideProgression(base({ match: { md: 'MD+1' } }));
  assert.equal(post.outcome, 'maintain');
  assert.ok(post.reasons.some((r) => r.code === 'postmatch_no_progress'));
});

test('MD-5 and MD-3 leave progression free', () => {
  for (const md of ['MD-5', 'MD-3']) {
    assert.equal(decideProgression(base({ match: { md } })).outcome, 'progress_load', md);
  }
});

// ── Missed sessions (Part 16) ───────────────────────────────────────────────

test('one missed session → repeat, never cram', () => {
  const d = decideProgression(base({ history: [ok('2026-08-03'), ok('2026-08-06'), miss('2026-08-08')] }));
  assert.equal(d.outcome, 'repeat_exposure');
  assert.deepEqual(d.proposedPrescription.sets, 3, 'same prescription, no doubling');
  assert.ok(d.reasons.some((r) => r.code === 'missed_once_repeat'));
});

test('a missed week repeats with a modest dose reduction', () => {
  const d = decideProgression(base({ history: [ok('2026-07-28'), ok('2026-08-01')] }));
  assert.equal(d.outcome, 'repeat_exposure');
  assert.equal(d.proposedPrescription.sets, 2, 'one set trimmed for the return');
});

test('a prolonged break reduces the return dose and requires review', () => {
  const d = decideProgression(base({ history: [ok('2026-06-20'), ok('2026-07-01')] }));
  assert.equal(d.outcome, 'regress_sets');
  assert.ok(d.flags.some((f) => f.id === 'prolonged_training_break'));
  assert.equal(d.requiresReview, true);
});

// ── Deload (Part 17) ────────────────────────────────────────────────────────

test('planned deload reduces dose deterministically', () => {
  const d = decideProgression(base({ plannedDeload: true }));
  assert.equal(d.outcome, 'deload');
  assert.equal(d.proposedPrescription.sets, 2);
  assert.equal(d.proposedPrescription.rpeTarget, 6);
});

test('one difficult session never triggers a deload', () => {
  const d = decideProgression(base({ history: [ok('2026-08-03'), ok('2026-08-06'), fail('2026-08-08')] }));
  assert.notEqual(d.outcome, 'deload');
});

test('deload triggers only from multiple accumulated signals', () => {
  const one = decideProgression(base({ sinceDeloadExposures: 14 }));
  assert.notEqual(one.outcome, 'deload', 'accumulation alone is one signal');
  const two = decideProgression(base({
    sinceDeloadExposures: 14,
    readiness: [rEntry('d1', 2), rEntry('d2', 2), rEntry('d3', 1.5)],
  }));
  assert.equal(two.outcome, 'deload');
  assert.ok(two.flags.some((f) => f.id === 'deload_recommended'));
  assert.ok(two.reasons.some((r) => r.code === 'deload_triggered'));
});

// ── Plateau (Part 18) ───────────────────────────────────────────────────────

test('plateau needs repeated evidence; insufficient history never plateaus; no auto-rotation', () => {
  const short = decideProgression(base({ exposuresSinceProgress: 2, progressionAttemptFailures: 1 }));
  assert.notEqual(short.outcome, 'coach_review');
  const plateau = decideProgression(base({ exposuresSinceProgress: 5, progressionAttemptFailures: 2 }));
  assert.equal(plateau.outcome, 'coach_review');
  assert.ok(plateau.flags.some((f) => f.id === 'plateau_review'));
  assert.equal(plateau.proposedPrescription.exerciseId, undefined, 'exercise not rotated automatically');
});

// ── Youth (Part 20) ─────────────────────────────────────────────────────────

test('U16 successful history: load increase capped tighter than adult', () => {
  const d = decideProgression(base({
    athlete: { context: 'youth_u16', experience: 'intermediate', techConfidence: 'medium', supervisionAvailable: true },
    prescription: { sets: 3, repRange: [6, 8], load: makeLoad('kg', 60), rpeTarget: 7 },
  }));
  // u16 intermediate maxKg 2.5, barbell inc 2.5 → exactly one plate step, never more
  if (d.outcome === 'progress_load') {
    assert.ok(d.proposedPrescription.load.value - 60 <= 2.5, 'youth ceiling binds');
    assert.ok(d.reasons.some((r) => r.code === 'youth_ceiling'));
    assert.ok(d.reasons.some((r) => r.code === 'youth_technique_bias'));
  } else assert.equal(d.outcome, 'progress_reps');
});

test('youth success cannot bypass ceilings: advanced U18 stays inside youth bounds', () => {
  const d = decideProgression(base({
    athlete: { context: 'youth_u18', experience: 'advanced', techConfidence: 'high', supervisionAvailable: true },
    history: [ok('2026-08-01'), ok('2026-08-03'), ok('2026-08-05'), ok('2026-08-08')],
  }));
  assert.equal(d.outcome, 'progress_load');
  assert.ok(d.proposedPrescription.load.value - 100 <= 2.5, 'U18 maxKg 2.5 despite advanced experience and long success streak');
});

test('complexity progression: gates must ALL be met; success alone never advances complexity', () => {
  const gated = decideProgression(base({
    allowComplexity: true, catalogue: [getExerciseBySlug('front-squat')],
    exercise: { ...squat, relationships: [{ kind: 'progression', target: 'ex-front-squat' }] },
    athlete: { context: 'adult', experience: 'advanced', techConfidence: 'medium', supervisionAvailable: true },
    history: [ok('2026-08-01'), ok('2026-08-03'), ok('2026-08-05'), ok('2026-08-08')],
  }));
  assert.equal(gated.outcome, 'maintain');
  assert.ok(gated.flags.some((f) => f.id === 'complexity_gate_not_met'), 'medium confidence blocks');
  const open = decideProgression(base({
    allowComplexity: true, catalogue: [getExerciseBySlug('front-squat')],
    exercise: { ...squat, relationships: [{ kind: 'progression', target: 'ex-front-squat' }] },
    athlete: { context: 'adult', experience: 'advanced', techConfidence: 'high', supervisionAvailable: true },
    history: [ok('2026-08-01'), ok('2026-08-02'), ok('2026-08-04'), ok('2026-08-06'), ok('2026-08-08')],
  }));
  assert.equal(open.outcome, 'progress_complexity');
  assert.equal(open.proposedPrescription.exerciseId, 'ex-front-squat', 'SC3 declared relationship only');
});

// ── Coach overrides (Part 21) ───────────────────────────────────────────────

test('coach overrides: creation requires author + reason; expiry honoured', () => {
  assert.throws(() => makeCoachOverride({ type: 'max_load', value: 100, author: null, reason: 'x', effectiveFrom: 'd' }), /author/);
  assert.throws(() => makeCoachOverride({ type: 'max_load', value: 100, author: 'c1', reason: '', effectiveFrom: 'd' }), /reason/);
  const o = makeCoachOverride({ type: 'max_load', value: 100, author: 'c1', reason: 'post-knock caution', effectiveFrom: '2026-08-01', effectiveTo: '2026-08-08', now: '2026-08-01' });
  assert.equal(o.audit[0].actor, 'c1', 'audit record present');
  assert.equal(activeOverrides([o], '2026-08-05').length, 1);
  assert.equal(activeOverrides([o], '2026-08-20').length, 0, 'expired override inactive');
});

test('max_load ceiling: engine never exceeds it, never silently', () => {
  const o = makeCoachOverride({ type: 'max_load', value: 101, author: 'c1', reason: 'ceiling', effectiveFrom: '2026-08-01', now: '2026-08-01' });
  const d = decideProgression(base({ overrides: [o] }));
  assert.equal(d.proposedPrescription.load.value, 101, 'clamped to the coach ceiling');
  assert.ok(d.flags.some((f) => f.id === 'coach_ceiling_active'));
  const atCeil = decideProgression(base({ overrides: [o], prescription: { sets: 3, repRange: [6, 8], load: makeLoad('kg', 101), rpeTarget: 7 } }));
  assert.equal(atCeil.outcome, 'maintain');
  assert.ok(atCeil.reasons.some((r) => r.code === 'coach_ceiling'));
});

test('force_maintain and force_deload override everything below safety', () => {
  const fm = makeCoachOverride({ type: 'force_maintain', author: 'c1', reason: 'hold', effectiveFrom: '2026-08-01', now: '2026-08-01' });
  assert.equal(decideProgression(base({ overrides: [fm] })).outcome, 'maintain');
  const fd = makeCoachOverride({ type: 'force_deload', author: 'c1', reason: 'deload', effectiveFrom: '2026-08-01', now: '2026-08-01' });
  assert.equal(decideProgression(base({ overrides: [fd] })).outcome, 'deload');
});

test('manual_next_target applies the coach value verbatim with audit trail', () => {
  const o = makeCoachOverride({ type: 'manual_next_target', value: { load: { type: 'kg', value: 95 } }, author: 'c1', reason: 'reset', effectiveFrom: '2026-08-01', now: '2026-08-01' });
  const d = decideProgression(base({ overrides: [o] }));
  assert.equal(d.proposedPrescription.load.value, 95);
  assert.deepEqual(d.constraints.overridesApplied[0].type, 'manual_next_target');
});

test('pain-stop outranks even coach force overrides', () => {
  const fm = makeCoachOverride({ type: 'force_maintain', author: 'c1', reason: 'hold', effectiveFrom: '2026-08-01', now: '2026-08-01' });
  const d = decideProgression(base({ overrides: [fm], restrictions: { painReported: true } }));
  assert.equal(d.outcome, 'blocked');
});

// ── Programme-wide budget (Part 25) ─────────────────────────────────────────

test('progression budget prevents everything progressing at once', () => {
  const decisions = [1, 2, 3, 4].map((i) => decideProgression(base({
    ids: { exerciseId: `ex-${i}` },
    prescription: { sets: 3, repRange: [6, 8], load: makeLoad('kg', 100), rpeTarget: 7 },
  })));
  assert.ok(decisions.every((d) => d.outcome === 'progress_load'));
  const { decisions: capped, budget } = applyProgressionBudget(decisions, { volumeCategory: 'moderate', context: 'adult' });
  assert.equal(budget, 2);
  assert.equal(capped.filter((d) => d.outcome.startsWith('progress_')).length, 2, 'only budgeted progressions survive');
  const downgraded = capped[2];
  assert.equal(downgraded.outcome, 'maintain');
  assert.deepEqual(downgraded.proposedPrescription, downgraded.sourcePrescription, 'downgrade restores source');
  assert.ok(downgraded.reasons.some((r) => r.code === 'budget_exhausted'));
});

test('budget shrinks under congestion and youth caps', () => {
  const { budget: congested } = applyProgressionBudget([], { volumeCategory: 'high', rugbyLoad: 3, context: 'adult' });
  assert.equal(congested, 2);
  const { budget: youth } = applyProgressionBudget([], { volumeCategory: 'high', context: 'youth_u16' });
  assert.equal(youth, 2);
});
