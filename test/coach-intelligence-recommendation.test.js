/**
 * M119 — Coach Recommendation Engine tests
 *
 * Deterministic tests for the pure, dormant recommendation engine over an M118 pipeline
 * result: present/review/hold actions, malformed pipeline/challenge/alignment rejection,
 * evidence mapping, confidence/tier passthrough, determinism, deep-frozen output, no
 * mutation, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCoachRecommendation } from '../packages/coach-intelligence/index.js'

// a valid M118-shaped pipeline result with controllable alignment/challenge
const pipelineResult = (over = {}) => ({
  memories: over.memories || [{ id: 'm1' }, { id: 'm2' }],
  synthesis: {},
  signals: { signals: [] },
  profile: {
    profileVersion: '1.0',
    dominantSignals: over.dominantSignals || [
      { category: 'selection-preference', strength: 0.9 },
      { category: 'risk-warning', strength: 0.5 },
    ],
  },
  explanation: { explainable: true, matchedSignals: over.matchedSignals || ['selection-preference'] },
  alignment: { alignmentScore: over.alignmentScore ?? 0.8, alignmentTier: over.alignmentTier || 'good', matchedDominantSignal: true, signalStrength: 0.9, reasons: [], metadata: {} },
  challenge: {
    challenged: over.challenged ?? false, severity: 'none', divergences: [], expectedCategories: [],
    observedCategory: 'selection-preference', confidence: 0.8, reasons: [],
    metadata: { deterministic: true, explainable: true, llmGenerated: false, requiresCoachReview: over.challenged ?? false },
  },
})

// ── action: present / review / hold ──────────────────────────────────────────────────

test('present — aligned and not challenged', () => {
  const r = buildCoachRecommendation(pipelineResult({ alignmentTier: 'good', challenged: false, alignmentScore: 0.8 }))
  assert.equal(r.action, 'present')
  assert.equal(r.recommend, true)
  assert.equal(r.confidence, 0.8)
  assert.equal(r.alignmentTier, 'good')
  assert.equal(r.requiresCoachReview, false)
})

test('review — challenged takes precedence (even over a poor tier)', () => {
  const r = buildCoachRecommendation(pipelineResult({ alignmentTier: 'weak', challenged: true }))
  assert.equal(r.action, 'review')
  assert.equal(r.recommend, false)
  assert.equal(r.requiresCoachReview, true)
  // challenged + poor tier still → review (challenged checked first)
  assert.equal(buildCoachRecommendation(pipelineResult({ alignmentTier: 'poor', challenged: true })).action, 'review')
})

test('hold — poor tier when not challenged', () => {
  const r = buildCoachRecommendation(pipelineResult({ alignmentTier: 'poor', challenged: false }))
  assert.equal(r.action, 'hold')
  assert.equal(r.recommend, false)
})

// ── evidence mapping ─────────────────────────────────────────────────────────────────

test('evidence mapping', () => {
  const r = buildCoachRecommendation(pipelineResult({
    memories: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    dominantSignals: [{ category: 'philosophy', strength: 0.9 }, { category: 'training-preference', strength: 0.4 }],
    matchedSignals: ['philosophy', 'training-preference'],
    challenged: false,
  }))
  assert.deepEqual(r.evidence, {
    memoryCount: 3,
    dominantSignals: ['philosophy', 'training-preference'],
    matchedSignals: ['philosophy', 'training-preference'],
    challenged: false,
  })
  assert.deepEqual(r.metadata, { deterministic: true, explainable: true, llmGenerated: false })
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('malformed pipeline → TypeError', () => {
  assert.throws(() => buildCoachRecommendation(null), TypeError)
  assert.throws(() => buildCoachRecommendation({}), TypeError)
  const noProfile = pipelineResult(); delete noProfile.profile
  assert.throws(() => buildCoachRecommendation(noProfile), TypeError)
  const noMemories = pipelineResult(); noMemories.memories = 'x'
  assert.throws(() => buildCoachRecommendation(noMemories), TypeError)
})

test('malformed challenge → TypeError', () => {
  const r = pipelineResult(); r.challenge = { severity: 'none' }   // no challenged boolean
  assert.throws(() => buildCoachRecommendation(r), TypeError)
})

test('malformed alignment → TypeError', () => {
  const noTier = pipelineResult(); noTier.alignment = { alignmentScore: 0.5 }
  assert.throws(() => buildCoachRecommendation(noTier), TypeError)
  const badTier = pipelineResult(); badTier.alignment = { alignmentTier: 'meh', alignmentScore: 0.5 }
  assert.throws(() => buildCoachRecommendation(badTier), TypeError)
  const noScore = pipelineResult(); noScore.alignment = { alignmentTier: 'good' }
  assert.throws(() => buildCoachRecommendation(noScore), TypeError)
})

// ── requiresCoachReview source ───────────────────────────────────────────────────────

test('requiresCoachReview read from challenge.metadata.requiresCoachReview', () => {
  const r = pipelineResult({ challenged: true })
  r.challenge.metadata.requiresCoachReview = true
  assert.equal(buildCoachRecommendation(r).requiresCoachReview, true)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate the input', () => {
  const r = pipelineResult({ alignmentTier: 'poor', challenged: false })
  const before = JSON.stringify(r)
  buildCoachRecommendation(r)
  assert.equal(JSON.stringify(r), before)
})

test('deterministic — identical input → identical recommendation', () => {
  const r = pipelineResult({ alignmentTier: 'weak', challenged: true })
  assert.deepEqual(buildCoachRecommendation(r), buildCoachRecommendation(r))
})

test('output is deeply frozen', () => {
  const r = buildCoachRecommendation(pipelineResult())
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.evidence) && Object.isFrozen(r.evidence.dominantSignals) &&
    Object.isFrozen(r.evidence.matchedSignals) && Object.isFrozen(r.metadata))
  assert.throws(() => { r.action = 'present' })
  assert.throws(() => r.evidence.matchedSignals.push('x'))
})

// ── exports ──────────────────────────────────────────────────────────────────────────

test('exports', () => {
  assert.equal(typeof buildCoachRecommendation, 'function')
})
