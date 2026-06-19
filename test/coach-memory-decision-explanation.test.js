/**
 * M115 — Coach decision explanation engine tests
 *
 * Deterministic tests for the pure, dormant explanation assembler: valid explanation,
 * invalid profile, invalid decision, matchedSignals + supportingEvidence ordering,
 * dominant-signal alignment, deep-frozen output, determinism, no mutation, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaProfile,
  buildDecisionExplanation,
} from '../packages/coach-memory/index.js'

const sig = (category, strength) => ({
  category, occurrences: 1, averageConfidence: 0.5, averageWeight: 0.5, strength, supportingMemoryIds: [],
})

const profile = (over = {}) => buildCoachDnaProfile(
  over.signals || [sig('selection-preference', 0.9), sig('risk-warning', 0.5)],
)

const decision = (over = {}) => ({
  category: 'selection-preference',
  confidence: 0.8,
  supportingMemoryIds: ['m2', 'm1', 'm3'],
  matchedSignals: ['risk-warning', 'selection-preference', 'philosophy'],
  ...over,
})

// ── valid ────────────────────────────────────────────────────────────────────────────

test('valid explanation', () => {
  const e = buildDecisionExplanation(profile(), decision())
  assert.equal(e.explainable, true)
  assert.equal(e.confidence, 0.8)                                  // passed through
  assert.deepEqual(e.matchedSignals, ['philosophy', 'risk-warning', 'selection-preference'])   // alphabetical
  assert.deepEqual(e.supportingEvidence, ['m1', 'm2', 'm3'])       // id ascending
  assert.equal(e.alignment.matchedDominantSignal, true)            // category is a dominant signal
  assert.equal(e.alignment.profileVersion, '1.0')
  assert.deepEqual(e.metadata, { deterministic: true, llmGenerated: false, generatedFromEvidence: true })
})

test('matchedDominantSignal false when category not among dominant signals', () => {
  const e = buildDecisionExplanation(profile(), decision({ category: 'training-preference' }))
  assert.equal(e.alignment.matchedDominantSignal, false)
})

// ── ordering ─────────────────────────────────────────────────────────────────────────

test('ordering — matchedSignals alphabetical, supportingEvidence by id', () => {
  const e = buildDecisionExplanation(profile(), decision({
    matchedSignals: ['z', 'a', 'm'],
    supportingMemoryIds: ['z9', 'a1', 'm5'],
  }))
  assert.deepEqual(e.matchedSignals, ['a', 'm', 'z'])
  assert.deepEqual(e.supportingEvidence, ['a1', 'm5', 'z9'])
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid profile → TypeError', () => {
  assert.throws(() => buildDecisionExplanation(null, decision()), TypeError)
  assert.throws(() => buildDecisionExplanation({}, decision()), TypeError)                       // no dominantSignals/version
  assert.throws(() => buildDecisionExplanation({ profileVersion: '1.0' }, decision()), TypeError) // no dominantSignals
})

test('invalid decision → TypeError', () => {
  const p = profile()
  assert.throws(() => buildDecisionExplanation(p, null), TypeError)
  assert.throws(() => buildDecisionExplanation(p, {}), TypeError)
  assert.throws(() => buildDecisionExplanation(p, decision({ category: 5 })), TypeError)
  assert.throws(() => buildDecisionExplanation(p, decision({ confidence: 'high' })), TypeError)
  assert.throws(() => buildDecisionExplanation(p, decision({ supportingMemoryIds: [1, 2] })), TypeError)
  assert.throws(() => buildDecisionExplanation(p, decision({ matchedSignals: 'x' })), TypeError)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate inputs', () => {
  const p = profile()
  const d = decision()
  const beforeP = JSON.stringify(p)
  const beforeD = JSON.stringify(d)
  buildDecisionExplanation(p, d)
  assert.equal(JSON.stringify(p), beforeP)
  assert.equal(JSON.stringify(d), beforeD)
  assert.deepEqual(d.supportingMemoryIds, ['m2', 'm1', 'm3'])   // original order preserved
})

test('deterministic — identical inputs → identical explanation', () => {
  const p = profile()
  const d = decision()
  assert.deepEqual(buildDecisionExplanation(p, d), buildDecisionExplanation(p, d))
})

test('output is deeply frozen', () => {
  const e = buildDecisionExplanation(profile(), decision())
  assert.ok(Object.isFrozen(e) && Object.isFrozen(e.matchedSignals) && Object.isFrozen(e.supportingEvidence) &&
    Object.isFrozen(e.alignment) && Object.isFrozen(e.metadata))
  assert.throws(() => { e.confidence = 1 })
  assert.throws(() => e.matchedSignals.push('x'))
})

// ── exports ──────────────────────────────────────────────────────────────────────────

test('exports', () => {
  assert.equal(typeof buildDecisionExplanation, 'function')
})
