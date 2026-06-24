/**
 * coach-core-adapter — Player DNA Influence tests
 *
 * Adjusts candidate confidence by alignment with a Coach DNA profile: positive/negative/neutral
 * influence, empty DNA, high/low clamping, optionality, configurable weights, metadata, validation,
 * determinism, no mutation, deep freeze, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyPlayerDnaInfluence } from '../packages/coach-core-adapter/index.js'

const candidate = (playerId, confidence, dnaSignals) => ({ playerId, position: 'P', availability: true, confidence, ...(dnaSignals ? { dnaSignals } : {}) })
const aff = (category, weight) => ({ category, weight })
const profile = (dominantSignals) => ({ profileVersion: '1.0', dominantSignals, balance: {}, confidence: 0.5, metadata: {} })
const sig = (category, strength) => ({ category, strength })

// ── influence direction ──────────────────────────────────────────────────────────────

test('positive influence raises confidence', () => {
  const r = applyPlayerDnaInfluence(candidate('p1', 0.5, [aff('selection-preference', 1)]), profile([sig('selection-preference', 0.8)]))
  assert.equal(r.baseConfidence, 0.5)
  assert.equal(r.dnaAdjustment, 0.2 * 0.8)                      // adjustmentWeight * (weight*strength)
  assert.equal(r.finalConfidence, r.baseConfidence + r.dnaAdjustment)
  assert.ok(r.finalConfidence > r.baseConfidence)
  assert.equal(r.metadata.influenceApplied, true)
  assert.equal(r.metadata.matchedSignals[0].category, 'selection-preference')
})

test('negative influence lowers confidence', () => {
  const r = applyPlayerDnaInfluence(candidate('p1', 0.6, [aff('risk-warning', -1)]), profile([sig('risk-warning', 0.9)]))
  assert.ok(r.dnaAdjustment < 0)
  assert.ok(r.finalConfidence < r.baseConfidence)
  assert.equal(r.metadata.influenceApplied, true)
})

test('neutral influence — no matching signal → unchanged', () => {
  const r = applyPlayerDnaInfluence(candidate('p1', 0.5, [aff('philosophy', 1)]), profile([sig('selection-preference', 0.8)]))
  assert.equal(r.dnaAdjustment, 0)
  assert.equal(r.finalConfidence, r.baseConfidence)
  assert.equal(r.metadata.influenceApplied, false)
})

test('candidate with no dnaSignals is unaffected', () => {
  const r = applyPlayerDnaInfluence(candidate('p1', 0.7), profile([sig('selection-preference', 0.8)]))
  assert.equal(r.finalConfidence, 0.7)
  assert.equal(r.metadata.influenceApplied, false)
})

// ── empty DNA ────────────────────────────────────────────────────────────────────────

test('empty / absent DNA → no adjustment', () => {
  assert.equal(applyPlayerDnaInfluence(candidate('p1', 0.5, [aff('x', 1)]), profile([])).dnaAdjustment, 0)
  assert.equal(applyPlayerDnaInfluence(candidate('p1', 0.5, [aff('x', 1)]), null).dnaAdjustment, 0)
})

// ── clamping ─────────────────────────────────────────────────────────────────────────

test('clamps the final confidence high', () => {
  const r = applyPlayerDnaInfluence(candidate('p1', 0.95, [aff('x', 1)]), profile([sig('x', 1)]), { adjustmentWeight: 0.5 })
  assert.equal(r.dnaAdjustment, 0.5)
  assert.equal(r.finalConfidence, 1)
})

test('clamps the final confidence low', () => {
  const r = applyPlayerDnaInfluence(candidate('p1', 0.1, [aff('x', -1)]), profile([sig('x', 1)]), { adjustmentWeight: 0.5 })
  assert.equal(r.dnaAdjustment, -0.5)
  assert.equal(r.finalConfidence, 0)
})

test('adjustment magnitude is capped by maxAdjustment', () => {
  const r = applyPlayerDnaInfluence(candidate('p1', 0.5, [aff('x', 1)]), profile([sig('x', 1)]), { adjustmentWeight: 1, maxAdjustment: 0.1 })
  assert.equal(r.dnaAdjustment, 0.1)
})

// ── optionality / config ─────────────────────────────────────────────────────────────

test('DNA influence can be disabled', () => {
  const r = applyPlayerDnaInfluence(candidate('p1', 0.5, [aff('x', 1)]), profile([sig('x', 1)]), { enabled: false })
  assert.equal(r.dnaAdjustment, 0)
  assert.equal(r.finalConfidence, 0.5)
  assert.equal(r.metadata.influenceApplied, false)
})

test('adjustment weight is configurable', () => {
  const small = applyPlayerDnaInfluence(candidate('p1', 0.5, [aff('x', 1)]), profile([sig('x', 1)]), { adjustmentWeight: 0.1 })
  const big = applyPlayerDnaInfluence(candidate('p1', 0.5, [aff('x', 1)]), profile([sig('x', 1)]), { adjustmentWeight: 0.3 })
  assert.ok(big.dnaAdjustment > small.dnaAdjustment)
})

test('metadata explains the adjustment source', () => {
  const r = applyPlayerDnaInfluence(candidate('p1', 0.5, [aff('a', 1), aff('b', -1)]), profile([sig('a', 0.8), sig('b', 0.4)]))
  assert.deepEqual(r.metadata.matchedSignals.map((m) => m.category).sort(), ['a', 'b'])
  assert.equal(r.metadata.rawScore, 1 * 0.8 + -1 * 0.4)
  assert.equal(typeof r.metadata.adjustmentWeight, 'number')
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('malformed candidate / profile / options → TypeError', () => {
  assert.throws(() => applyPlayerDnaInfluence(null, null), TypeError)
  assert.throws(() => applyPlayerDnaInfluence({ playerId: 'p' }, null), TypeError)                       // no confidence
  assert.throws(() => applyPlayerDnaInfluence(candidate('p', 0.5, [{ category: 'x' }]), null), TypeError)   // dnaSignal missing weight
  assert.throws(() => applyPlayerDnaInfluence(candidate('p', 0.5), { dominantSignals: [{ category: 'x' }] }), TypeError)   // signal missing strength
  assert.throws(() => applyPlayerDnaInfluence(candidate('p', 0.5), profile([]), { adjustmentWeight: 'x' }), TypeError)
  assert.throws(() => applyPlayerDnaInfluence(candidate('p', 0.5), profile([]), { maxAdjustment: -1 }), TypeError)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('deterministic — identical input → identical output', () => {
  const c = candidate('p1', 0.5, [aff('x', 1)])
  const p = profile([sig('x', 0.8)])
  assert.deepEqual(applyPlayerDnaInfluence(c, p), applyPlayerDnaInfluence(c, p))
})

test('does not mutate inputs', () => {
  const c = candidate('p1', 0.5, [aff('x', 1)])
  const p = profile([sig('x', 0.8)])
  const before = [JSON.stringify(c), JSON.stringify(p)]
  applyPlayerDnaInfluence(c, p)
  assert.deepEqual([JSON.stringify(c), JSON.stringify(p)], before)
})

test('output is deeply frozen', () => {
  const r = applyPlayerDnaInfluence(candidate('p1', 0.5, [aff('x', 1)]), profile([sig('x', 0.8)]))
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.metadata) && Object.isFrozen(r.metadata.matchedSignals) && Object.isFrozen(r.metadata.matchedSignals[0]))
  assert.throws(() => { r.finalConfidence = 0 })
  assert.throws(() => r.metadata.matchedSignals.push({}))
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof applyPlayerDnaInfluence, 'function')
})
