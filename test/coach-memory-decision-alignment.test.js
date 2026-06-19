/**
 * M116 — Coach decision alignment engine tests
 *
 * Deterministic tests for the pure, dormant alignment scorer: perfect alignment, no-dominant-
 * match, tier thresholds (excellent/good/neutral/weak/poor), confidence influence, matched-
 * signal influence, signalStrength, reasons, invalid profile/decision, determinism, no
 * mutation, deep-frozen output, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaProfile,
  scoreDecisionAlignment,
} from '../packages/coach-memory/index.js'

const close = (a, b) => Math.abs(a - b) < 1e-9

const sig = (category, strength) => ({
  category, occurrences: 1, averageConfidence: 0.5, averageWeight: 0.5, strength, supportingMemoryIds: [],
})

// profile with one dominant signal of a given category/strength
const profileWith = (category, strength) => buildCoachDnaProfile([sig(category, strength)])

const decision = (over = {}) => ({ category: 'selection-preference', confidence: 0.8, matchedSignals: [], ...over })
const fiveSignals = ['a', 'b', 'c', 'd', 'e']

// ── perfect / no match ───────────────────────────────────────────────────────────────

test('perfect alignment → score 1.0, excellent', () => {
  const p = profileWith('selection-preference', 1.0)
  const r = scoreDecisionAlignment(p, decision({ confidence: 1, matchedSignals: fiveSignals }))
  // 1.0*0.5 + 1*0.3 + 1*0.2 = 1.0
  assert.ok(close(r.alignmentScore, 1.0))
  assert.equal(r.alignmentTier, 'excellent')
  assert.equal(r.matchedDominantSignal, true)
  assert.ok(close(r.signalStrength, 1.0))
  assert.deepEqual(r.reasons, [
    'Decision matches dominant coaching category.',
    'Decision confidence contributes positively.',
    'Matched coaching signals.',
  ])
  assert.deepEqual(r.metadata, { deterministic: true, explainable: true, llmGenerated: false })
})

test('no dominant match → matchedDominantSignal false, signalStrength 0, no-match reason', () => {
  const p = profileWith('selection-preference', 0.9)
  const r = scoreDecisionAlignment(p, decision({ category: 'philosophy', confidence: 1, matchedSignals: fiveSignals }))
  assert.equal(r.matchedDominantSignal, false)
  assert.equal(r.signalStrength, 0)
  // 0 + 1*0.3 + 1*0.2 = 0.5
  assert.ok(close(r.alignmentScore, 0.5))
  assert.equal(r.reasons[0], 'Decision does not match dominant coaching category.')
})

// ── tier thresholds ──────────────────────────────────────────────────────────────────

test('tier thresholds', () => {
  // excellent: perfect = 1.0
  assert.equal(scoreDecisionAlignment(profileWith('selection-preference', 1.0), decision({ confidence: 1, matchedSignals: fiveSignals })).alignmentTier, 'excellent')
  // good: 0.5*0.5 + 1*0.3 + 1*0.2 = 0.75
  assert.equal(scoreDecisionAlignment(profileWith('selection-preference', 0.5), decision({ confidence: 1, matchedSignals: fiveSignals })).alignmentTier, 'good')
  // neutral: 0.5*0.5 + 1*0.3 + 0 = 0.55
  assert.equal(scoreDecisionAlignment(profileWith('selection-preference', 0.5), decision({ confidence: 1, matchedSignals: [] })).alignmentTier, 'neutral')
  // weak: no match + 1*0.3 + 0 = 0.30
  assert.equal(scoreDecisionAlignment(profileWith('philosophy', 0.9), decision({ category: 'risk-warning', confidence: 1, matchedSignals: [] })).alignmentTier, 'weak')
  // poor: no match + 0.5*0.3 + 0 = 0.15
  assert.equal(scoreDecisionAlignment(profileWith('philosophy', 0.9), decision({ category: 'risk-warning', confidence: 0.5, matchedSignals: [] })).alignmentTier, 'poor')
})

// ── influences ───────────────────────────────────────────────────────────────────────

test('confidence influence — higher confidence raises the score', () => {
  const p = profileWith('selection-preference', 0.6)
  const lo = scoreDecisionAlignment(p, decision({ confidence: 0.2, matchedSignals: [] }))
  const hi = scoreDecisionAlignment(p, decision({ confidence: 0.9, matchedSignals: [] }))
  assert.ok(hi.alignmentScore > lo.alignmentScore)
  assert.ok(close(hi.alignmentScore - lo.alignmentScore, (0.9 - 0.2) * 0.3))
})

test('matched signal influence — more matched signals raises the score (capped at 5)', () => {
  const p = profileWith('selection-preference', 0.6)
  const few = scoreDecisionAlignment(p, decision({ confidence: 0.5, matchedSignals: ['a'] }))
  const more = scoreDecisionAlignment(p, decision({ confidence: 0.5, matchedSignals: ['a', 'b', 'c'] }))
  assert.ok(more.alignmentScore > few.alignmentScore)
  // cap at 5: 5 vs 7 matched signals → identical contribution
  const five = scoreDecisionAlignment(p, decision({ confidence: 0.5, matchedSignals: fiveSignals }))
  const seven = scoreDecisionAlignment(p, decision({ confidence: 0.5, matchedSignals: [...fiveSignals, 'f', 'g'] }))
  assert.ok(close(five.alignmentScore, seven.alignmentScore))
})

test('signalStrength reflects the matching dominant signal strength', () => {
  const r = scoreDecisionAlignment(profileWith('selection-preference', 0.42), decision({ confidence: 0.5 }))
  assert.ok(close(r.signalStrength, 0.42))
})

test('reasons omit confidence/matched lines when zero/empty', () => {
  const r = scoreDecisionAlignment(profileWith('selection-preference', 0.5), decision({ confidence: 0, matchedSignals: [] }))
  assert.deepEqual(r.reasons, ['Decision matches dominant coaching category.'])
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid profile → TypeError', () => {
  assert.throws(() => scoreDecisionAlignment(null, decision()), TypeError)
  assert.throws(() => scoreDecisionAlignment({}, decision()), TypeError)
  assert.throws(() => scoreDecisionAlignment({ profileVersion: '1.0' }, decision()), TypeError)
})

test('invalid decision → TypeError', () => {
  const p = profileWith('selection-preference', 0.5)
  assert.throws(() => scoreDecisionAlignment(p, null), TypeError)
  assert.throws(() => scoreDecisionAlignment(p, {}), TypeError)
  assert.throws(() => scoreDecisionAlignment(p, decision({ category: 5 })), TypeError)
  assert.throws(() => scoreDecisionAlignment(p, decision({ confidence: 'high' })), TypeError)
  assert.throws(() => scoreDecisionAlignment(p, decision({ matchedSignals: 'x' })), TypeError)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate inputs', () => {
  const p = profileWith('selection-preference', 0.7)
  const d = decision({ matchedSignals: ['a', 'b'] })
  const beforeP = JSON.stringify(p)
  const beforeD = JSON.stringify(d)
  scoreDecisionAlignment(p, d)
  assert.equal(JSON.stringify(p), beforeP)
  assert.equal(JSON.stringify(d), beforeD)
})

test('deterministic — identical inputs → identical result', () => {
  const p = profileWith('selection-preference', 0.7)
  const d = decision({ confidence: 0.6, matchedSignals: ['a', 'b'] })
  assert.deepEqual(scoreDecisionAlignment(p, d), scoreDecisionAlignment(p, d))
})

test('output is deeply frozen', () => {
  const r = scoreDecisionAlignment(profileWith('selection-preference', 0.7), decision({ matchedSignals: ['a'] }))
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.reasons) && Object.isFrozen(r.metadata))
  assert.throws(() => { r.alignmentScore = 1 })
  assert.throws(() => r.reasons.push('x'))
})

// ── exports ──────────────────────────────────────────────────────────────────────────

test('exports', () => {
  assert.equal(typeof scoreDecisionAlignment, 'function')
})
