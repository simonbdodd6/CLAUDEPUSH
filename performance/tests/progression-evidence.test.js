// CoachEasier Performance — evidence & exposure model tests (SC6).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import { analyseHistory, analyseReadiness, classifyExposure, recordPersonalRecord } from '../domain/progression-evidence.js';

const ASOF = '2026-08-10T10:00:00.000Z';
const ok = (date, reps = 8) => ({ date, outcome: 'successful', failedSets: 0, technicalFailures: 0, painStop: false, topOfRange: reps >= 8, effortBelowTarget: false, effortAboveTarget: false });
const fail = (date) => ({ ...ok(date), outcome: 'failed', failedSets: 3, topOfRange: false });
const miss = (date) => ({ ...ok(date), outcome: 'missed' });

// ── Session classification ──────────────────────────────────────────────────

test('classifyExposure: completed, partial, failed, missed, pain-stop', () => {
  const done = classifyExposure({ date: 'd', sets: [{ result: 'completed', repsDone: 8 }, { result: 'completed', repsDone: 8 }] }, { repRangeTop: 8 });
  assert.equal(done.outcome, 'successful');
  assert.equal(done.topOfRange, true);

  const partial = classifyExposure({ date: 'd', sets: [{ result: 'completed' }, { result: 'missed_target' }] });
  assert.equal(partial.outcome, 'partial');
  assert.equal(partial.failedSets, 1);

  const technical = classifyExposure({ date: 'd', sets: [{ result: 'technical_failure' }, { result: 'technical_failure' }] });
  assert.equal(technical.outcome, 'failed');
  assert.equal(technical.technicalFailures, 2);

  assert.equal(classifyExposure({ date: 'd', missed: true }).outcome, 'missed');

  const pain = classifyExposure({ date: 'd', sets: [{ result: 'completed' }, { result: 'pain_stop' }] });
  assert.equal(pain.outcome, 'pain_stop');
  assert.equal(pain.painStop, true);
});

test('classifyExposure: effort vs target from achieved RPE/RIR', () => {
  const easy = classifyExposure({ date: 'd', sets: [{ result: 'completed', achievedRpe: 5.5 }, { result: 'completed', achievedRpe: 6 }] }, { rpeTarget: 7 });
  assert.equal(easy.effortBelowTarget, true);
  const hard = classifyExposure({ date: 'd', sets: [{ result: 'completed', achievedRpe: 9 }] }, { rpeTarget: 7 });
  assert.equal(hard.effortAboveTarget, true);
  const rir = classifyExposure({ date: 'd', sets: [{ result: 'completed', achievedRir: 4 }] }, { rirTarget: 2 });
  assert.equal(rir.effortBelowTarget, true, 'more reps in reserve than asked = easier than intended');
});

// ── History analysis ────────────────────────────────────────────────────────

test('consecutive successes count from the tail; failures break the streak; misses pause it', () => {
  const h1 = analyseHistory([ok('2026-08-01'), fail('2026-08-03'), ok('2026-08-05'), ok('2026-08-08')], { asOf: ASOF });
  assert.equal(h1.consecutiveSuccesses, 2);
  const h2 = analyseHistory([ok('2026-08-01'), ok('2026-08-03'), miss('2026-08-05'), ok('2026-08-08')], { asOf: ASOF });
  assert.equal(h2.consecutiveSuccesses, 3, 'a miss pauses, does not reset, the streak');
  assert.equal(h2.trailingMisses, 0);
});

test('breaks: missed week and prolonged break derive from dates, not a clock', () => {
  const fresh = analyseHistory([ok('2026-08-08')], { asOf: ASOF });
  assert.equal(fresh.missedWeek, false);
  const week = analyseHistory([ok('2026-08-01')], { asOf: ASOF });
  assert.equal(week.missedWeek, true);
  const long = analyseHistory([ok('2026-07-01')], { asOf: ASOF });
  assert.equal(long.prolongedBreak, true);
  assert.equal(long.daysSinceLast, 40);
});

test('pain-stop anywhere in history is surfaced', () => {
  const h = analyseHistory([ok('2026-08-01'), { ...ok('2026-08-05'), outcome: 'pain_stop', painStop: true }], { asOf: ASOF });
  assert.equal(h.painStop, true);
});

// ── Readiness (Parts 13–14) ─────────────────────────────────────────────────

const entry = (date, avg) => ({ date, scores: { sleep: avg, fatigue: avg, soreness: avg } });

test('readiness: no data is never treated as poor readiness', () => {
  assert.equal(analyseReadiness([]).status, 'no_data');
});

test('readiness: one low day is one_low; ordinary scores are normal', () => {
  assert.equal(analyseReadiness([entry('d1', 4), entry('d2', 4), entry('d3', 2)]).status, 'one_low');
  assert.equal(analyseReadiness([entry('d1', 3), entry('d2', 4)]).status, 'normal');
  assert.equal(analyseReadiness([entry('d1', 2), entry('d2', 4), entry('d3', 4)]).status, 'normal', 'an old low day with recovery since is not a trend');
});

test('readiness: sustained low requires repeated low entries in the window', () => {
  const r = analyseReadiness([entry('d1', 2), entry('d2', 1.5), entry('d3', 4), entry('d4', 2)]);
  assert.equal(r.status, 'sustained_low');
  assert.equal(r.lowCount, 3);
});

// ── Personal records (Part 19) ──────────────────────────────────────────────

test('a PR is an achievement record and evidence only — never a command', () => {
  const pr = recordPersonalRecord({ exerciseId: 'ex-back-squat', kind: 'load', value: 150, unit: 'kg', date: '2026-08-08' });
  assert.equal(pr.kind, 'personal_record');
  assert.equal(pr.triggersProgression, false, 'explicit contract: no automatic increase');
});
