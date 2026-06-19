/**
 * M120 — Selection Recommendation Engine tests
 *
 * Deterministic tests for the pure, dormant per-candidate evaluator: available/unavailable
 * (eligibility), exact score formula, passthrough of action/requiresCoachReview, evidence
 * mapping, malformed candidate/recommendation/pipeline rejection, determinism, deep-frozen
 * output, no mutation, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { evaluateSelectionCandidate } from '../packages/coach-intelligence/index.js'

const close = (a, b) => Math.abs(a - b) < 1e-9

const candidate = (over = {}) => ({ playerId: 'p1', position: 'openside', availability: true, confidence: 0.6, ...over })

const pipelineResult = (over = {}) => ({
  memories: [], synthesis: {}, signals: {}, profile: { dominantSignals: [] }, explanation: { matchedSignals: [] },
  alignment: { alignmentScore: over.alignmentScore ?? 0.8, alignmentTier: over.alignmentTier || 'good' },
  challenge: { challenged: over.challenged ?? false },
})

const recommendation = (over = {}) => ({
  recommend: over.recommend ?? true,
  action: over.action || 'present',
  confidence: over.confidence ?? 0.8,
  alignmentTier: over.alignmentTier || 'good',
  requiresCoachReview: over.requiresCoachReview ?? false,
  evidence: {
    memoryCount: 2,
    dominantSignals: over.dominantSignals || ['selection-preference'],
    matchedSignals: over.matchedSignals || ['selection-preference'],
    challenged: over.challenged ?? false,
  },
  metadata: { deterministic: true, explainable: true, llmGenerated: false },
})

// ── eligibility ──────────────────────────────────────────────────────────────────────

test('available player → eligible true', () => {
  const r = evaluateSelectionCandidate(candidate({ availability: true }), pipelineResult(), recommendation())
  assert.equal(r.eligible, true)
})

test('unavailable player → eligible false', () => {
  const r = evaluateSelectionCandidate(candidate({ availability: false }), pipelineResult(), recommendation())
  assert.equal(r.eligible, false)
})

// ── score formula ────────────────────────────────────────────────────────────────────

test('score formula exact', () => {
  // rec.confidence 0.8, candidate.confidence 0.6, alignment 0.8
  // 0.8*0.4 + 0.6*0.3 + 0.8*0.3 = 0.32 + 0.18 + 0.24 = 0.74
  const r = evaluateSelectionCandidate(candidate({ confidence: 0.6 }), pipelineResult({ alignmentScore: 0.8 }), recommendation({ confidence: 0.8 }))
  assert.ok(close(r.score, 0.74))
})

test('score clamps to [0,1]', () => {
  const r = evaluateSelectionCandidate(candidate({ confidence: 1 }), pipelineResult({ alignmentScore: 1 }), recommendation({ confidence: 1 }))
  assert.equal(r.score, 1)   // 0.4 + 0.3 + 0.3 = 1.0
})

// ── passthrough / evidence ───────────────────────────────────────────────────────────

test('passthrough of action + requiresCoachReview, plus evidence mapping', () => {
  const r = evaluateSelectionCandidate(
    candidate(),
    pipelineResult({ alignmentTier: 'weak' }),
    recommendation({ action: 'review', requiresCoachReview: true, alignmentTier: 'weak', challenged: true, dominantSignals: ['philosophy'], matchedSignals: ['philosophy', 'risk-warning'] }),
  )
  assert.equal(r.recommendationAction, 'review')
  assert.equal(r.requiresCoachReview, true)
  assert.deepEqual(r.evidence, {
    alignmentTier: 'weak',
    challenged: true,
    dominantSignals: ['philosophy'],
    matchedSignals: ['philosophy', 'risk-warning'],
  })
  assert.deepEqual(r.metadata, { deterministic: true, explainable: true, llmGenerated: false })
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('malformed candidate → TypeError', () => {
  assert.throws(() => evaluateSelectionCandidate(null, pipelineResult(), recommendation()), TypeError)
  assert.throws(() => evaluateSelectionCandidate({}, pipelineResult(), recommendation()), TypeError)
  assert.throws(() => evaluateSelectionCandidate(candidate({ availability: 'yes' }), pipelineResult(), recommendation()), TypeError)
  assert.throws(() => evaluateSelectionCandidate(candidate({ confidence: 1.5 }), pipelineResult(), recommendation()), TypeError)
  assert.throws(() => evaluateSelectionCandidate(candidate({ playerId: '' }), pipelineResult(), recommendation()), TypeError)
})

test('malformed recommendation → TypeError', () => {
  const c = candidate(); const p = pipelineResult()
  assert.throws(() => evaluateSelectionCandidate(c, p, null), TypeError)
  assert.throws(() => evaluateSelectionCandidate(c, p, {}), TypeError)
  assert.throws(() => evaluateSelectionCandidate(c, p, recommendation({ action: 5 })), TypeError)
  const noEvidence = recommendation(); delete noEvidence.evidence
  assert.throws(() => evaluateSelectionCandidate(c, p, noEvidence), TypeError)
})

test('malformed pipeline → TypeError', () => {
  const c = candidate(); const rec = recommendation()
  assert.throws(() => evaluateSelectionCandidate(c, null, rec), TypeError)
  assert.throws(() => evaluateSelectionCandidate(c, {}, rec), TypeError)
  const noScore = pipelineResult(); noScore.alignment = { alignmentTier: 'good' }
  assert.throws(() => evaluateSelectionCandidate(c, noScore, rec), TypeError)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate inputs', () => {
  const c = candidate(); const p = pipelineResult(); const rec = recommendation({ matchedSignals: ['a', 'b'] })
  const before = [JSON.stringify(c), JSON.stringify(p), JSON.stringify(rec)]
  evaluateSelectionCandidate(c, p, rec)
  assert.deepEqual([JSON.stringify(c), JSON.stringify(p), JSON.stringify(rec)], before)
})

test('deterministic — identical inputs → identical evaluation', () => {
  const c = candidate(); const p = pipelineResult(); const rec = recommendation()
  assert.deepEqual(evaluateSelectionCandidate(c, p, rec), evaluateSelectionCandidate(c, p, rec))
})

test('output is deeply frozen', () => {
  const r = evaluateSelectionCandidate(candidate(), pipelineResult(), recommendation())
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.evidence) && Object.isFrozen(r.evidence.dominantSignals) &&
    Object.isFrozen(r.evidence.matchedSignals) && Object.isFrozen(r.metadata))
  assert.throws(() => { r.score = 1 })
  assert.throws(() => r.evidence.matchedSignals.push('x'))
})

// ── exports ──────────────────────────────────────────────────────────────────────────

test('exports', () => {
  assert.equal(typeof evaluateSelectionCandidate, 'function')
})
