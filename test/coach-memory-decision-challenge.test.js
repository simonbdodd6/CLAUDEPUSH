/**
 * M117 — Coach decision challenge engine tests
 *
 * Deterministic tests for the pure, dormant challenge analyzer: excellent/good (no challenge),
 * weak/poor (challenged), severity mapping across all tiers, divergence generation,
 * reasons/metadata, invalid inputs, determinism, no mutation, deep-frozen output, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaProfile,
  scoreDecisionAlignment,
  buildDecisionChallenge,
} from '../packages/coach-memory/index.js'

const sig = (category, strength) => ({
  category, occurrences: 1, averageConfidence: 0.5, averageWeight: 0.5, strength, supportingMemoryIds: [],
})
const profileWith = (...sigs) => buildCoachDnaProfile(sigs.map(([c, s]) => sig(c, s)))
const decision = (over = {}) => ({ category: 'selection-preference', confidence: 0.8, matchedSignals: [], ...over })

// a valid M116-shaped alignment object (constructed directly for tier control)
const alignment = (over = {}) => ({
  alignmentScore: 0.8, alignmentTier: 'good', matchedDominantSignal: true, signalStrength: 0.5,
  reasons: [], metadata: { deterministic: true, explainable: true, llmGenerated: false }, ...over,
})

const profile = () => profileWith(['selection-preference', 0.9], ['risk-warning', 0.5])

// ── not challenged ───────────────────────────────────────────────────────────────────

test('excellent alignment → not challenged, severity none, aligns reason', () => {
  const r = buildDecisionChallenge(profile(), decision(), alignment({ alignmentTier: 'excellent', matchedDominantSignal: true }))
  assert.equal(r.challenged, false)
  assert.equal(r.severity, 'none')
  assert.deepEqual(r.divergences, [])
  assert.deepEqual(r.reasons, ['Decision aligns with established Coach DNA.'])
  assert.equal(r.metadata.requiresCoachReview, false)
})

test('good alignment → not challenged, severity low', () => {
  const r = buildDecisionChallenge(profile(), decision(), alignment({ alignmentTier: 'good', matchedDominantSignal: true }))
  assert.equal(r.challenged, false)
  assert.equal(r.severity, 'low')
})

// ── challenged ───────────────────────────────────────────────────────────────────────

test('weak alignment → challenged, severity medium, low-alignment reason', () => {
  const r = buildDecisionChallenge(profile(), decision({ category: 'philosophy', confidence: 0.4 }),
    alignment({ alignmentTier: 'weak', matchedDominantSignal: false }))
  assert.equal(r.challenged, true)
  assert.equal(r.severity, 'medium')
  assert.equal(r.metadata.requiresCoachReview, true)
  assert.ok(r.reasons.includes('Decision differs from dominant coaching category.'))
  assert.ok(r.reasons.includes('Low alignment score.'))
})

test('poor alignment with high confidence → challenged, severity high, conflict reason', () => {
  const r = buildDecisionChallenge(profile(), decision({ category: 'philosophy', confidence: 0.9 }),
    alignment({ alignmentTier: 'poor', matchedDominantSignal: false }))
  assert.equal(r.challenged, true)
  assert.equal(r.severity, 'high')
  assert.deepEqual(r.reasons, [
    'Decision differs from dominant coaching category.',
    'Low alignment score.',
    'High-confidence recommendation conflicts with Coach DNA.',
  ])
})

test('challenged but low confidence → no high-confidence conflict reason', () => {
  const r = buildDecisionChallenge(profile(), decision({ category: 'philosophy', confidence: 0.5 }),
    alignment({ alignmentTier: 'weak', matchedDominantSignal: false }))
  assert.ok(!r.reasons.includes('High-confidence recommendation conflicts with Coach DNA.'))
})

// ── severity mapping ─────────────────────────────────────────────────────────────────

test('severity mapping across all tiers', () => {
  const map = { excellent: 'none', good: 'low', neutral: 'low', weak: 'medium', poor: 'high' }
  for (const [tier, severity] of Object.entries(map)) {
    const r = buildDecisionChallenge(profile(), decision(), alignment({ alignmentTier: tier, matchedDominantSignal: tier !== 'poor' && tier !== 'weak' }))
    assert.equal(r.severity, severity, `tier ${tier}`)
    assert.equal(r.challenged, tier === 'weak' || tier === 'poor')
  }
})

// ── divergence generation ────────────────────────────────────────────────────────────

test('divergence generation — one per expected category when not matched', () => {
  const p = profileWith(['selection-preference', 0.9], ['risk-warning', 0.5])   // dominant order: sel-pref, risk-warning
  const r = buildDecisionChallenge(p, decision({ category: 'philosophy' }), alignment({ alignmentTier: 'weak', matchedDominantSignal: false }))
  assert.deepEqual(r.expectedCategories, ['selection-preference', 'risk-warning'])
  assert.equal(r.observedCategory, 'philosophy')
  assert.deepEqual(r.divergences, [
    { expected: 'selection-preference', observed: 'philosophy' },
    { expected: 'risk-warning', observed: 'philosophy' },
  ])
})

test('no divergences when category matches a dominant signal', () => {
  const r = buildDecisionChallenge(profile(), decision({ category: 'selection-preference' }), alignment({ matchedDominantSignal: true }))
  assert.deepEqual(r.divergences, [])
})

// ── end-to-end with a real M116 alignment ────────────────────────────────────────────

test('works end-to-end with a real M116 alignment + confidence passthrough', () => {
  const p = profileWith(['selection-preference', 0.9])
  const d = decision({ category: 'philosophy', confidence: 0.95, matchedSignals: [] })
  const a = scoreDecisionAlignment(p, d)   // no match, conf 0.95 → score 0.285 → poor
  const r = buildDecisionChallenge(p, d, a)
  assert.equal(r.challenged, true)
  assert.equal(r.confidence, 0.95)         // passed through from the decision
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid inputs → TypeError', () => {
  const p = profile(); const d = decision(); const a = alignment()
  assert.throws(() => buildDecisionChallenge(null, d, a), TypeError)
  assert.throws(() => buildDecisionChallenge({}, d, a), TypeError)
  assert.throws(() => buildDecisionChallenge(p, null, a), TypeError)
  assert.throws(() => buildDecisionChallenge(p, decision({ confidence: 'x' }), a), TypeError)
  assert.throws(() => buildDecisionChallenge(p, d, null), TypeError)
  assert.throws(() => buildDecisionChallenge(p, d, alignment({ alignmentTier: 'meh' })), TypeError)         // invalid tier
  assert.throws(() => buildDecisionChallenge(p, d, alignment({ matchedDominantSignal: 'yes' })), TypeError) // non-boolean
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate inputs', () => {
  const p = profile(); const d = decision({ category: 'philosophy' }); const a = alignment({ alignmentTier: 'poor', matchedDominantSignal: false })
  const before = [JSON.stringify(p), JSON.stringify(d), JSON.stringify(a)]
  buildDecisionChallenge(p, d, a)
  assert.deepEqual([JSON.stringify(p), JSON.stringify(d), JSON.stringify(a)], before)
})

test('deterministic — identical inputs → identical challenge', () => {
  const p = profile(); const d = decision({ category: 'philosophy', confidence: 0.9 }); const a = alignment({ alignmentTier: 'poor', matchedDominantSignal: false })
  assert.deepEqual(buildDecisionChallenge(p, d, a), buildDecisionChallenge(p, d, a))
})

test('output is deeply frozen', () => {
  const r = buildDecisionChallenge(profile(), decision({ category: 'philosophy' }), alignment({ alignmentTier: 'poor', matchedDominantSignal: false }))
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.divergences) && Object.isFrozen(r.expectedCategories) &&
    Object.isFrozen(r.reasons) && Object.isFrozen(r.metadata) && Object.isFrozen(r.divergences[0]))
  assert.throws(() => { r.challenged = false })
  assert.throws(() => r.reasons.push('x'))
})

// ── exports ──────────────────────────────────────────────────────────────────────────

test('exports', () => {
  assert.equal(typeof buildDecisionChallenge, 'function')
})
