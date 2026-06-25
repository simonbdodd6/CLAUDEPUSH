/**
 * coach-intelligence — Decision Diff Severity Classifier (M199) tests
 *
 * Classifies the impact magnitude of an M192 diff as a deterministic severity band. Real diffs come
 * from diffDecisions; it recommends nothing.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { diffDecisions, classifyDecisionDiff } from '../packages/coach-intelligence/index.js'

const starter = (playerId, codes = ['FORMATION_REQUIREMENT', 'POSITION_MATCH']) => ({ playerId, codes })
const benchP = (playerId, codes = ['BENCH_COVER']) => ({ playerId, codes })
const state = (over = {}) => ({ starters: [starter('p1'), starter('p2')], bench: [benchP('b1')], captain: 'p1', viceCaptain: 'p2', riskCount: 1, coverage: 1, ...over })
const classify = (before, after) => classifyDecisionDiff(diffDecisions(before, after))

// ── bands ────────────────────────────────────────────────────────────────────────────

test('NONE — identical decisions', () => {
  const out = classify(state(), state())
  assert.equal(out.severity, 'NONE')
  assert.equal(out.score, 0)
  assert.equal(out.changed, false)
})

test('MINOR — a single starter change (score 1)', () => {
  const out = classify(state(), state({ starters: [starter('p1'), starter('p3')] }))   // p2 removed... and p3 added → 2 changes
  // p2 removed + p3 added = 2 player changes → MODERATE; use a single add instead:
  const single = classify(state(), state({ starters: [starter('p1'), starter('p2'), starter('p3')] }))
  assert.equal(single.severity, 'MINOR')
  assert.equal(single.score, 1)
  assert.equal(out.severity, 'MODERATE')   // two player changes
})

test('MODERATE — captain change alone (score 3)', () => {
  const out = classify(state(), state({ captain: 'p2' }))
  assert.equal(out.severity, 'MODERATE')
  assert.equal(out.score, 3)
  assert.deepEqual(out.factors, { playerChanges: 0, captainChanged: true, viceCaptainChanged: false, riskIncreased: false, coverageDecreased: false })
})

test('MAJOR — captain change + one starter add (score 4)', () => {
  const out = classify(state(), state({ captain: 'p2', starters: [starter('p1'), starter('p2'), starter('p3')] }))
  assert.equal(out.severity, 'MAJOR')
  assert.equal(out.score, 4)
})

test('CRITICAL — captain + vice + risk increase + 2 starter changes (score ≥ 6)', () => {
  const before = state()
  const after = state({ captain: 'p2', viceCaptain: 'p1', starters: [starter('p1'), starter('p2'), starter('p3'), starter('p4')], riskCount: 3 })
  const out = classify(before, after)
  assert.equal(out.severity, 'CRITICAL')
  assert.ok(out.score >= 6)
  assert.equal(out.factors.captainChanged, true)
  assert.equal(out.factors.riskIncreased, true)
})

// ── informational-only / improvements weigh 0 ───────────────────────────────────────────

test('improvements (risk down, coverage up) and explanation gains are low severity', () => {
  const riskDown = classify(state({ riskCount: 3 }), state({ riskCount: 1 }))   // RISK_DECREASED → weight 0
  assert.equal(riskDown.score, 0)
  assert.equal(riskDown.severity, 'MINOR')   // changed, but score 0
  assert.equal(riskDown.changed, true)

  const coverageDown = classify(state({ coverage: 1 }), state({ coverage: 0.8 }))   // COVERAGE_DECREASED → +1
  assert.equal(coverageDown.score, 1)
  assert.equal(coverageDown.severity, 'MINOR')
  assert.equal(coverageDown.factors.coverageDecreased, true)
})

// ── determinism / frozen / mutation / validation / export ───────────────────────────────

test('deterministic — repeated calls are identical', () => {
  const diff = diffDecisions(state(), state({ captain: 'p2', riskCount: 3 }))
  assert.deepEqual(classifyDecisionDiff(diff), classifyDecisionDiff(diff))
})

test('output is deeply frozen', () => {
  const out = classify(state(), state({ captain: 'p2' }))
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.factors))
  assert.throws(() => { out.score = 0 })
})

test('does not mutate the input diff', () => {
  const diff = diffDecisions(state(), state({ captain: 'p2' }))
  const before = JSON.stringify(diff)
  classifyDecisionDiff(diff)
  assert.equal(JSON.stringify(diff), before)
})

test('malformed input rejected clearly', () => {
  assert.throws(() => classifyDecisionDiff(null), TypeError)
  assert.throws(() => classifyDecisionDiff([]), TypeError)
  assert.throws(() => classifyDecisionDiff({}), TypeError)                                     // missing sections
  assert.throws(() => classifyDecisionDiff({ summary: {}, playerChanges: [], captainChanges: [], riskChanges: {} }), TypeError)   // no coverageChanges
})

test('export exists', () => {
  assert.equal(typeof classifyDecisionDiff, 'function')
})
