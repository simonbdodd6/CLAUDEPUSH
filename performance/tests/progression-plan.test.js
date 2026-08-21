// CoachEasier Performance — progression plan, scenarios & versioning (SC6).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildProgressionPlan, applyPlanToProgrammeDraft } from '../domain/progression-plan.js';
import { makeCoachOverride } from '../domain/progression-rules.js';
import { makeLoad } from '../domain/load-model.js';
import { getExerciseBySlug } from '../services/exercise-catalogue.js';
import { publishProgrammeVersion, iteratePrescriptions } from '../domain/programme-versioning.js';
import { buildSampleProgramme } from './programme.test.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASOF = '2026-08-10T10:00:00.000Z';

const ok = (date, { top = true, easy = false } = {}) =>
  ({ date, outcome: 'successful', failedSets: 0, technicalFailures: 0, painStop: false, topOfRange: top, effortBelowTarget: easy, effortAboveTarget: false });
const fail = (date) => ({ ...ok(date), outcome: 'failed', failedSets: 2, topOfRange: false });
const rEntry = (date, avg) => ({ date, scores: { sleep: avg, fatigue: avg, soreness: avg } });

const item = (over = {}) => ({
  ids: { athleteRef: 'u1', programmeRef: 'p', programmeVersionRef: 'p@v1', exerciseId: over.exercise?.id || 'ex-back-squat' },
  exercise: getExerciseBySlug('back-squat'),
  prescription: { sets: 3, repRange: [6, 8], load: makeLoad('kg', 100), rpeTarget: 7 },
  equipmentKind: 'barbell',
  history: [ok('2026-08-03'), ok('2026-08-06'), ok('2026-08-08')],
  readiness: [], match: {}, restrictions: {}, overrides: [],
  athlete: { context: 'adult', experience: 'intermediate', techConfidence: 'medium', supervisionAvailable: true },
  ...over,
});

// ── Scenario A: U16 beginner, two successful weeks ──────────────────────────

test('Scenario A: U16 beginner — conservative, reps/quality before aggressive load', () => {
  const goblet = getExerciseBySlug('goblet-squat');
  const plan = buildProgressionPlan([item({
    exercise: goblet, equipmentKind: 'dumbbells',
    prescription: { sets: 3, repRange: [6, 8], load: makeLoad('kg', 12), rpeTarget: 6 },
    history: [ok('2026-07-29', { top: false }), ok('2026-08-01', { top: false }), ok('2026-08-05', { top: false }), ok('2026-08-08', { top: false })],
    athlete: { context: 'youth_u16', experience: 'beginner', techConfidence: 'medium', supervisionAvailable: true },
  })], { volumeCategory: 'moderate', context: 'youth_u16', asOf: ASOF });
  const d = plan.decisions[0];
  assert.equal(d.outcome, 'progress_reps', 'quality/reps before load for U16');
  assert.equal(d.proposedPrescription.load.value, 12, 'load untouched');
});

// ── Scenario B: U18 prop, MD-2 exposure ─────────────────────────────────────

test('Scenario B: U18 tighthead at MD-2 — match proximity holds despite success', () => {
  const plan = buildProgressionPlan([item({
    match: { md: 'MD-2' },
    athlete: { context: 'youth_u18', experience: 'intermediate', techConfidence: 'medium', supervisionAvailable: true },
  })], { volumeCategory: 'low', context: 'youth_u18', asOf: ASOF });
  const d = plan.decisions[0];
  assert.equal(d.outcome, 'maintain');
  assert.equal(d.matchContext, 'MD-2');
  assert.ok(d.reasons.some((r) => r.code === 'match_hold'));
});

// ── Scenario C: senior advanced bench, easy top-range work ──────────────────

test('Scenario C: advanced senior bench — bounded load progression', () => {
  const plan = buildProgressionPlan([item({
    exercise: getExerciseBySlug('bench-press'),
    ids: { exerciseId: 'ex-bench-press' },
    prescription: { sets: 4, repRange: [6, 8], load: makeLoad('kg', 110), rpeTarget: 8 },
    history: [ok('2026-08-01', { easy: true }), ok('2026-08-04', { easy: true }), ok('2026-08-08', { easy: true })],
    athlete: { context: 'adult', experience: 'advanced', techConfidence: 'high', supervisionAvailable: true },
  })], { volumeCategory: 'moderate', context: 'adult', asOf: ASOF });
  const d = plan.decisions[0];
  assert.equal(d.outcome, 'progress_load');
  const jump = d.proposedPrescription.load.value - 110;
  assert.ok(jump > 0 && jump <= Math.min(5, 110 * 0.025 + 0.01), 'advanced bound: 2.5% relative cap binds');
});

// ── Scenario D: beginner senior, coarse dumbbells ───────────────────────────

test('Scenario D: dumbbell jump too large — reps progress, no forced jump', () => {
  const plan = buildProgressionPlan([item({
    exercise: getExerciseBySlug('db-bench'), equipmentKind: 'dumbbells',
    ids: { exerciseId: 'ex-db-bench' },
    prescription: { sets: 3, repRange: [8, 12], load: makeLoad('kg', 20), rpeTarget: 7 },
    history: [ok('2026-08-01'), ok('2026-08-04'), ok('2026-08-08')],
    athlete: { context: 'adult', experience: 'beginner', techConfidence: 'medium', supervisionAvailable: true },
  })], { volumeCategory: 'moderate', context: 'adult', asOf: ASOF });
  const d = plan.decisions[0];
  assert.equal(d.outcome, 'progress_reps');
  assert.equal(d.proposedPrescription.load.value, 20, 'load held');
  assert.ok(d.flags.some((f) => f.id === 'equipment_increment_too_large'));
});

// ── Scenario E: repeated failed attempts ────────────────────────────────────

test('Scenario E: repeated failures — modest hold/regress, no dramatic rewrite', () => {
  const plan = buildProgressionPlan([item({
    history: [ok('2026-08-01'), fail('2026-08-04'), fail('2026-08-08')],
  })], { volumeCategory: 'moderate', context: 'adult', asOf: ASOF });
  const d = plan.decisions[0];
  assert.equal(d.outcome, 'regress_load');
  assert.equal(d.proposedPrescription.load.value, 97.5, 'one increment only');
  assert.equal(d.proposedPrescription.sets, 3, 'volume untouched — not a rewrite');
  assert.equal(d.requiresReview, true);
});

// ── Scenario F: readiness — one poor entry vs a sustained trend ─────────────

test('Scenario F: one poor readiness entry → no change; sustained trend → conservative modifier', () => {
  const one = buildProgressionPlan([item({ readiness: [rEntry('d1', 4), rEntry('d2', 2)] })], { volumeCategory: 'moderate', context: 'adult', asOf: ASOF });
  assert.equal(one.decisions[0].outcome, 'progress_load', 'single entry changes nothing');
  const sustained = buildProgressionPlan([item({ readiness: [rEntry('d1', 2), rEntry('d2', 2), rEntry('d3', 1.5)] })], { volumeCategory: 'moderate', context: 'adult', asOf: ASOF });
  assert.equal(sustained.decisions[0].outcome, 'regress_sets');
  assert.equal(sustained.decisions[0].proposedPrescription.sets, 2, 'one set removed, nothing more');
});

// ── Scenario G: pain stop ───────────────────────────────────────────────────

test('Scenario G: pain stop — blocked, review routed, no substitution', () => {
  const plan = buildProgressionPlan([item({
    history: [ok('2026-08-03'), { ...ok('2026-08-08'), outcome: 'pain_stop', painStop: true }],
  })], { volumeCategory: 'moderate', context: 'adult', asOf: ASOF });
  const d = plan.decisions[0];
  assert.equal(d.outcome, 'blocked');
  assert.equal(d.proposedPrescription, null);
  assert.equal(plan.blocked, true);
  assert.equal(plan.coachApprovalRequired, true);
  assert.throws(() => applyPlanToProgrammeDraft(buildSampleProgramme(), plan, {}), /plan_blocked/);
});

// ── Scenario H: PR ──────────────────────────────────────────────────────────

test('Scenario H: a new PR is evidence only — no automatic next-session increase', () => {
  const plan = buildProgressionPlan([item({
    history: [ok('2026-08-08')], // one exposure, plus a shiny PR
    personalRecords: [{ kind: 'personal_record', exerciseId: 'ex-back-squat', prKind: 'load', value: 150, triggersProgression: false }],
  })], { volumeCategory: 'moderate', context: 'adult', asOf: ASOF });
  const d = plan.decisions[0];
  assert.equal(d.outcome, 'repeat_exposure', 'PR does not progress anything');
  assert.ok(d.reasons.some((r) => r.code === 'pr_maintain'));
});

// ── Plan semantics (Part 24) ────────────────────────────────────────────────

test('plans are deterministic and explicitly not workouts or published programmes', () => {
  const items = [item(), item({ ids: { exerciseId: 'ex-2' } })];
  const a = buildProgressionPlan(structuredClone(items), { volumeCategory: 'moderate', context: 'adult', asOf: ASOF });
  const b = buildProgressionPlan(structuredClone(items), { volumeCategory: 'moderate', context: 'adult', asOf: ASOF });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.kind, 'progression_plan');
  assert.equal(a.isCompletedWorkout, false);
  assert.equal(a.isPublishedProgramme, false);
  assert.equal(a.provisional, true);
  assert.ok(a.flags.some((f) => f.id === 'progression_rules_provisional'));
});

test('plan budget: only the allowed number of progressions survive per session', () => {
  const items = [1, 2, 3].map((i) => item({ ids: { exerciseId: `ex-${i}` } }));
  const plan = buildProgressionPlan(items, { volumeCategory: 'low', context: 'adult', asOf: ASOF });
  assert.equal(plan.budget.allowed, 1);
  assert.equal(plan.decisions.filter((d) => d.outcome.startsWith('progress_')).length, 1);
});

// ── SC4 versioning integration (Part 23) ────────────────────────────────────

test('approved plans write into an SC4 DRAFT; published history stays byte-identical', () => {
  const programme = buildSampleProgramme();
  publishProgrammeVersion(programme, 1, { actor: 'admin-1', now: '2026-08-01T00:00:00.000Z' });
  const publishedBefore = JSON.stringify(programme.versions[0]);

  const plan = buildProgressionPlan([item()], { volumeCategory: 'moderate', context: 'adult', asOf: ASOF });
  assert.equal(plan.decisions[0].outcome, 'progress_load');

  const { draft, applied } = applyPlanToProgrammeDraft(programme, plan, { actor: 'coach-1', now: ASOF });
  assert.equal(draft.versionNumber, 2, 'progression creates a NEW draft version');
  assert.equal(draft.versionStatus, 'draft');
  assert.equal(JSON.stringify(programme.versions[0]), publishedBefore, 'published v1 byte-identical');
  assert.ok(applied.some((a) => a.exerciseId === 'ex-back-squat'));

  const draftSquat = [...iteratePrescriptions(draft)].find((p) => p.exerciseId === 'ex-back-squat');
  assert.equal(draftSquat.sets[0].fields.load, 105, 'draft carries the progressed load');
  const publishedSquat = [...iteratePrescriptions(programme.versions[0])].find((p) => p.exerciseId === 'ex-back-squat');
  assert.notEqual(publishedSquat.sets[0].fields.load, 105, 'history untouched');
  assert.ok(draft.audit.some((a) => a.action === 'progression_applied'), 'audit reconstructable');
});

test('audit: decisions carry evidence, constraints, rule version and are reconstructable', () => {
  const plan = buildProgressionPlan([item()], { volumeCategory: 'moderate', context: 'adult', asOf: ASOF });
  const d = plan.decisions[0];
  for (const key of ['engineVersion', 'sourcePrescription', 'proposedPrescription', 'reasons', 'evidence', 'constraints', 'developmentContext', 'asOf', 'flags']) {
    assert.ok(key in d, key);
  }
  assert.equal(d.evidence.method, 'double_progression');
  assert.equal(d.evidence.requiredExposures, 2);
  assert.ok(d.id.startsWith('pd:'));
});

// ── Scope guards (Part 30) ──────────────────────────────────────────────────

test('scope guard: SC6 modules contain no execution/UI/analytics/AI/clock/randomness', async () => {
  const files = ['../types/progression.js', '../domain/load-model.js', '../domain/progression-evidence.js', '../domain/progression-rules.js', '../domain/progression-plan.js'];
  for (const f of files) {
    const src = await readFile(join(__dirname, f), 'utf8');
    for (const banned of ['Math.random', 'Date.now', 'document.', 'innerHTML', 'fetch(', 'openai', 'anthropic', 'logSet', 'executeWorkout', 'renderChart', 'diagnos', 'rehabilitat', 'cleared to play']) {
      assert.ok(!src.includes(banned), `${f} contains ${banned}`);
    }
  }
});

test('scope guard: index.html untouched by SC6 (no progression references)', async () => {
  const html = await readFile(join(__dirname, '../../index.html'), 'utf8');
  assert.ok(!html.includes('progression-rules'), 'no UI wiring in SC6');
  assert.ok(!html.includes('decideProgression'));
});

// ═══ SC6 final safety-review additions ══════════════════════════════════════

import { totalExternalLoad } from '../domain/load-model.js';
import { analyseHistory } from '../domain/progression-evidence.js';
import { decideProgression } from '../domain/progression-rules.js';

// ── Part 2: hard-safety precedence — lower evidence never resurrects ────────

test('precedence: 10 perfect exposures + pain-stop = blocked', () => {
  const perfect = Array.from({ length: 10 }, (_, i) => ok(`2026-08-0${Math.min(i + 1, 9)}`));
  const d = decideProgression({ ...item(), history: [...perfect, { ...ok('2026-08-09'), outcome: 'pain_stop', painStop: true }], asOf: ASOF });
  assert.equal(d.outcome, 'blocked');
  assert.equal(d.proposedPrescription, null);
});

test('precedence: coach manual target + pain-stop = blocked', () => {
  const manual = makeCoachOverride({ type: 'manual_next_target', value: { load: { type: 'kg', value: 120 } }, author: 'c1', reason: 'x', effectiveFrom: '2026-08-01', now: '2026-08-01' });
  const d = decideProgression({ ...item({ overrides: [manual], restrictions: { painReported: true } }), asOf: ASOF });
  assert.equal(d.outcome, 'blocked');
});

test('precedence: a PR cannot bypass a match-proximity hold', () => {
  const d = decideProgression({ ...item({
    match: { md: 'MD-1' },
    personalRecords: [{ kind: 'personal_record', triggersProgression: false }],
  }), asOf: ASOF });
  assert.equal(d.outcome, 'maintain');
  assert.ok(d.reasons.some((r) => r.code === 'md1_primer'));
});

test('precedence: strong readiness cannot bypass an active restriction', () => {
  const d = decideProgression({ ...item({
    restrictions: { active: true },
    readiness: [rEntry('d1', 5), rEntry('d2', 5), rEntry('d3', 5)],
  }), asOf: ASOF });
  assert.equal(d.outcome, 'coach_review');
});

// ── Part 3 / Scenario J: manual targets clamped by every safety boundary ────

test('Scenario J: manual target above youth step ceiling is clamped, never applied verbatim', () => {
  const manual = makeCoachOverride({ type: 'manual_next_target', value: { load: { type: 'kg', value: 140 } }, author: 'c1', reason: 'ambitious', effectiveFrom: '2026-08-01', now: '2026-08-01' });
  const d = decideProgression({ ...item({
    overrides: [manual],
    athlete: { context: 'youth_u18', experience: 'advanced', techConfidence: 'high', supervisionAvailable: true },
  }), asOf: ASOF });
  assert.equal(d.proposedPrescription.load.value, 102.5, 'clamped to current + youth maxKg (100 + 2.5)');
  assert.ok(d.flags.some((f) => f.id === 'youth_progression_review'));
  assert.ok(d.reasons.some((r) => r.code === 'manual_clamped'));
  assert.ok(d.constraints.capsApplied.some((c) => c.type === 'youth_step_ceiling'));
});

test('manual target cannot exceed max_load or max_percentage safety ceilings', () => {
  const manual = makeCoachOverride({ type: 'manual_next_target', value: { load: { type: 'kg', value: 140 } }, author: 'c1', reason: 'x', effectiveFrom: '2026-08-01', now: '2026-08-01' });
  const cap = makeCoachOverride({ type: 'max_load', value: 105, author: 'c2', reason: 'ceiling', effectiveFrom: '2026-08-01', now: '2026-08-01' });
  const d = decideProgression({ ...item({ overrides: [manual, cap] }), asOf: ASOF });
  assert.equal(d.proposedPrescription.load.value, 105, 'safety ceiling wins over decision override');
  assert.ok(d.constraints.capsApplied.some((c) => c.type === 'max_load'));

  const manualPct = makeCoachOverride({ type: 'manual_next_target', value: { load: { type: 'percentage', value: 95, of: 'e1rm:epley_v1' } }, author: 'c1', reason: 'x', effectiveFrom: '2026-08-01', now: '2026-08-01' });
  const pctCap = makeCoachOverride({ type: 'max_percentage', value: 85, author: 'c2', reason: 'ceiling', effectiveFrom: '2026-08-01', now: '2026-08-01' });
  const dp = decideProgression({ ...item({ overrides: [manualPct, pctCap] }), asOf: ASOF });
  assert.equal(dp.proposedPrescription.load.value, 85);
});

// ── Part 4 / Scenario I: exposure continuity ────────────────────────────────

test('Scenario I: stale streak — old successes + 21-day break + one return session must NOT progress', () => {
  const d = decideProgression({ ...item({
    history: [ok('2026-07-10'), ok('2026-07-13'), ok('2026-08-08')],
  }), asOf: ASOF });
  assert.equal(d.outcome, 'repeat_exposure', 'stale streak restarts from the return session');
  assert.ok(d.reasons.some((r) => r.code === 'stale_streak'));
  assert.ok(d.flags.some((f) => f.id === 'insufficient_exposure_history'));
});

test('continuity matrix: gaps ≤14d keep the streak; >14d break it; totals keep history', () => {
  const within = analyseHistory([ok('2026-07-28'), ok('2026-08-04'), ok('2026-08-08')], { asOf: ASOF });
  assert.equal(within.consecutiveSuccesses, 3, '7-day rhythm keeps the streak');
  assert.equal(within.streakBrokenByGap, false);

  const thirteen = analyseHistory([ok('2026-07-26'), ok('2026-08-08')], { asOf: ASOF });
  assert.equal(thirteen.consecutiveSuccesses, 2, '13-day gap still continuous (7–13d interruption)');

  const fifteen = analyseHistory([ok('2026-07-24'), ok('2026-08-08')], { asOf: ASOF });
  assert.equal(fifteen.consecutiveSuccesses, 1, '15-day gap breaks the streak (14–20d interruption)');
  assert.equal(fifteen.streakBrokenByGap, true);
  assert.equal(fifteen.total, 2, 'historical evidence is not erased');

  const long = analyseHistory([ok('2026-07-01'), ok('2026-07-04'), ok('2026-08-08')], { asOf: ASOF });
  assert.equal(long.consecutiveSuccesses, 1, '≥21-day gap: only the return session counts');
});

// ── Part 7 / Scenario K: implement semantics ────────────────────────────────

test('dumbbell pair semantics are unambiguous: per-implement value + derived total', () => {
  const pair = makeLoad('kg', 20, { implements: 2 });
  assert.equal(pair.value, 20, 'stored per implement — the number on the bell');
  assert.equal(pair.implements, 2);
  assert.equal(pair.per, 'implement');
  assert.equal(totalExternalLoad(pair), 40, 'total derived, never stored ambiguously');
  const singleKb = makeLoad('kg', 24, { implements: 1 });
  assert.equal(totalExternalLoad(singleKb), 24);
  const explicitTotal = makeLoad('kg', 40, { per: 'total', implements: 2 });
  assert.equal(totalExternalLoad(explicitTotal), 40, 'explicit total convention respected');
  assert.throws(() => makeLoad('kg', 20, { per: 'each' }), /bad_load_per/);
});

test('Scenario K: dumbbell pair — per-hand jump above bound → hold load, progress reps; no total-load maths', () => {
  const d = decideProgression({ ...item({
    exercise: getExerciseBySlug('db-bench'), equipmentKind: 'dumbbells',
    ids: { exerciseId: 'ex-db-bench' },
    prescription: { sets: 3, repRange: [8, 12], load: makeLoad('kg', 20, { implements: 2 }), rpeTarget: 7 },
    history: [ok('2026-08-01'), ok('2026-08-04'), ok('2026-08-08')],
    athlete: { context: 'adult', experience: 'beginner', techConfidence: 'medium', supervisionAvailable: true },
  }), asOf: ASOF });
  assert.equal(d.outcome, 'progress_reps');
  assert.equal(d.proposedPrescription.load.value, 20, 'per-implement load held');
  assert.equal(d.proposedPrescription.load.implements, 2, 'pair metadata preserved for SC7 display');
  assert.equal(totalExternalLoad(d.proposedPrescription.load), 40, 'natural gym value derivable');
  assert.ok(d.flags.some((f) => f.id === 'equipment_increment_too_large'));
});

// ── Part 16: attempted mutation of published content fails, byte-proven ─────

test('published version is byte-identical even across a failed (blocked) application attempt', () => {
  const programme = buildSampleProgramme();
  publishProgrammeVersion(programme, 1, { now: '2026-08-01T00:00:00.000Z' });
  const before = JSON.stringify(programme.versions[0]);
  const blockedPlan = buildProgressionPlan([item({
    history: [{ ...ok('2026-08-08'), outcome: 'pain_stop', painStop: true }],
  })], { volumeCategory: 'moderate', context: 'adult', asOf: ASOF });
  assert.throws(() => applyPlanToProgrammeDraft(programme, blockedPlan, {}), /plan_blocked/);
  assert.equal(JSON.stringify(programme.versions[0]), before, 'byte-identical after the refused attempt');
  assert.equal(programme.versions.length, 1, 'no draft created for a blocked plan');
});
