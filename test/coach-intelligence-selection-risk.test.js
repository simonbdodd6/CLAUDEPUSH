/**
 * M124 — Selection Risk Engine tests
 *
 * Deterministic tests for the pure, dormant risk analyzer over an M123 Starting XV result:
 * no risks, vacant jersey, review-required, unavailable position, thin depth,
 * duplicate-position-strength, multiple risks, severity ordering, determinism, deep-frozen
 * output, no mutation, invalid input rejection, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { evaluateSelectionRisk } from '../packages/coach-intelligence/index.js'

const player = (playerId, position, over = {}) => ({
  playerId, position, score: 0.7, recommendationAction: 'present', requiresCoachReview: false, evidence: {}, ...over,
})
const filled = (jersey, position, p) => ({ jersey, position, player: p, status: 'filled' })
const vacant = (jersey, position) => ({ jersey, position, player: null, status: 'vacant' })

const result = ({ startingXV = [], benchCandidates = [], unavailable = [], metadata } = {}) => Object.freeze({
  startingXV: Object.freeze(startingXV),
  benchCandidates: Object.freeze(benchCandidates),
  unavailable: Object.freeze(unavailable),
  metadata: Object.freeze(metadata || {
    filled: startingXV.filter((s) => s.status === 'filled').length,
    vacant: startingXV.filter((s) => s.status === 'vacant').length,
    benchCount: benchCandidates.length,
    unavailableCount: unavailable.reduce((s, u) => s + u.ineligibleCount, 0),
    deterministic: true, explainable: true, llm: false,
  }),
})

// ── no risks ─────────────────────────────────────────────────────────────────────────

test('no risks — filled, depth present, no review/unavailable/duplicates', () => {
  const r = evaluateSelectionRisk(result({
    startingXV: [filled('1', 'A', player('a1', 'A'))],
    benchCandidates: [player('a2', 'A')],   // position A has 2 eligible → no thin-depth
  }))
  assert.deepEqual(r.risks, [])
  assert.equal(r.overallRisk, 'NONE')
  assert.deepEqual(r.metadata, { totalRisks: 0, highestSeverity: 'NONE', deterministic: true, explainable: true, llm: false })
})

// ── vacant ───────────────────────────────────────────────────────────────────────────

test('vacant jersey → CRITICAL vacant-position', () => {
  const r = evaluateSelectionRisk(result({ startingXV: [vacant('1', 'LH')] }))
  const v = r.risks.find((x) => x.type === 'vacant-position')
  assert.equal(v.severity, 'CRITICAL')
  assert.equal(v.jersey, '1')
  assert.equal(v.position, 'LH')
  assert.equal(v.playerId, null)
  assert.equal(r.overallRisk, 'CRITICAL')
})

// ── review-required ──────────────────────────────────────────────────────────────────

test('selected player requiresCoachReview → MEDIUM review-required', () => {
  const r = evaluateSelectionRisk(result({
    startingXV: [filled('1', 'A', player('a1', 'A', { requiresCoachReview: true }))],
    benchCandidates: [player('a2', 'A')],
  }))
  const rr = r.risks.find((x) => x.type === 'review-required')
  assert.equal(rr.severity, 'MEDIUM')
  assert.equal(rr.playerId, 'a1')
  assert.equal(rr.jersey, '1')
})

// ── unavailable position ─────────────────────────────────────────────────────────────

test('only unavailable players exist for a position → CRITICAL unavailable-position', () => {
  const r = evaluateSelectionRisk(result({
    startingXV: [filled('1', 'A', player('a1', 'A'))],
    benchCandidates: [player('a2', 'A')],
    unavailable: [{ position: 'B', ineligibleCount: 2 }],   // position B has no eligible
  }))
  const u = r.risks.find((x) => x.type === 'unavailable-position')
  assert.equal(u.severity, 'CRITICAL')
  assert.equal(u.position, 'B')
})

test('unavailable position that still has eligible players → no unavailable-position risk', () => {
  const r = evaluateSelectionRisk(result({
    startingXV: [filled('1', 'A', player('a1', 'A'))],
    benchCandidates: [player('a2', 'A')],
    unavailable: [{ position: 'A', ineligibleCount: 1 }],   // A also has eligible → not "only unavailable"
  }))
  assert.ok(!r.risks.some((x) => x.type === 'unavailable-position'))
})

// ── thin depth ───────────────────────────────────────────────────────────────────────

test('only one eligible player for a position → HIGH thin-depth', () => {
  const r = evaluateSelectionRisk(result({ startingXV: [filled('7', 'Openside', player('os', 'Openside'))] }))
  const t = r.risks.find((x) => x.type === 'thin-depth')
  assert.equal(t.severity, 'HIGH')
  assert.equal(t.position, 'Openside')
  assert.equal(t.jersey, '7')
  assert.equal(t.playerId, 'os')
})

// ── duplicate-position-strength ──────────────────────────────────────────────────────

test('a position filling two jerseys → LOW duplicate-position-strength', () => {
  const r = evaluateSelectionRisk(result({
    startingXV: [filled('4', 'Lock', player('l1', 'Lock')), filled('5', 'Lock', player('l2', 'Lock'))],
    benchCandidates: [player('l3', 'Lock'), player('l4', 'Lock')],   // 4 eligible Locks → no thin-depth
  }))
  const d = r.risks.find((x) => x.type === 'duplicate-position-strength')
  assert.equal(d.severity, 'LOW')
  assert.equal(d.position, 'Lock')
})

// ── multiple risks + ordering ────────────────────────────────────────────────────────

test('multiple risks ordered by severity descending', () => {
  const r = evaluateSelectionRisk(result({
    startingXV: [
      vacant('1', 'LH'),                                                  // CRITICAL
      filled('7', 'Openside', player('os', 'Openside')),                  // thin-depth HIGH (only 1)
      filled('9', 'ScrumHalf', player('sh', 'ScrumHalf', { requiresCoachReview: true })),  // MEDIUM + thin HIGH
      filled('4', 'Lock', player('l1', 'Lock')), filled('5', 'Lock', player('l2', 'Lock')),  // LOW duplicate
    ],
    benchCandidates: [],
    unavailable: [{ position: 'B', ineligibleCount: 1 }],                 // CRITICAL unavailable-position
  }))
  const severities = r.risks.map((x) => x.severity)
  const rank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
  const ranks = severities.map((s) => rank[s])
  assert.deepEqual(ranks, [...ranks].sort((a, b) => b - a))   // non-increasing
  assert.equal(r.overallRisk, 'CRITICAL')
  assert.equal(r.metadata.totalRisks, r.risks.length)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid Starting XV → TypeError', () => {
  assert.throws(() => evaluateSelectionRisk(null), TypeError)
  assert.throws(() => evaluateSelectionRisk({}), TypeError)
  assert.throws(() => evaluateSelectionRisk({ startingXV: [], benchCandidates: [], unavailable: [], metadata: {} }), TypeError)   // invalid metadata
})

test('duplicate jerseys → TypeError', () => {
  assert.throws(() => evaluateSelectionRisk(result({ startingXV: [filled('1', 'A', player('a', 'A')), vacant('1', 'B')] })), TypeError)
})

test('duplicate players → TypeError', () => {
  assert.throws(() => evaluateSelectionRisk(result({
    startingXV: [filled('1', 'A', player('dup', 'A'))], benchCandidates: [player('dup', 'A')],
  })), TypeError)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate the input', () => {
  const r = result({ startingXV: [vacant('1', 'LH'), filled('7', 'Openside', player('os', 'Openside'))] })
  const before = JSON.stringify(r)
  evaluateSelectionRisk(r)
  assert.equal(JSON.stringify(r), before)
})

test('deterministic — identical input → identical risk report', () => {
  const r = result({ startingXV: [vacant('1', 'LH'), filled('7', 'Openside', player('os', 'Openside'))] })
  assert.deepEqual(evaluateSelectionRisk(r), evaluateSelectionRisk(r))
})

test('output is deeply frozen', () => {
  const r = evaluateSelectionRisk(result({ startingXV: [vacant('1', 'LH')] }))
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.risks) && Object.isFrozen(r.metadata) && Object.isFrozen(r.risks[0]))
  assert.throws(() => r.risks.push({}))
  assert.throws(() => { r.metadata.totalRisks = 9 })
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('exports', () => {
  assert.equal(typeof evaluateSelectionRisk, 'function')
})
