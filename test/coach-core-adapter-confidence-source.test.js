/**
 * coach-core-adapter — Confidence Source tests
 *
 * Availability-history baseline confidence + provider: averaging, weights, defaults, response
 * objects, validation, per-player provider lookup, integration with buildSelectionContext,
 * determinism, no mutation, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  deriveAvailabilityConfidence, createBaselineConfidenceProvider, buildSelectionContext,
} from '../packages/coach-core-adapter/index.js'

// ── deriveAvailabilityConfidence ─────────────────────────────────────────────────────

test('averages availability weights (available=1, maybe=0.5, unavailable=0)', () => {
  assert.equal(deriveAvailabilityConfidence(['available', 'available', 'available']), 1)
  assert.equal(deriveAvailabilityConfidence(['unavailable', 'unavailable']), 0)
  assert.equal(deriveAvailabilityConfidence(['available', 'unavailable']), 0.5)
  assert.equal(deriveAvailabilityConfidence(['maybe', 'maybe']), 0.5)
  assert.equal(deriveAvailabilityConfidence(['available', 'maybe', 'unavailable']), 0.5)
})

test('accepts Core response objects and is case/whitespace tolerant', () => {
  assert.equal(deriveAvailabilityConfidence([{ response: 'available' }, { response: 'maybe' }]), 0.75)
  assert.equal(deriveAvailabilityConfidence(['  AVAILABLE ', 'Unavailable']), 0.5)
})

test('empty history → default (configurable)', () => {
  assert.equal(deriveAvailabilityConfidence([]), 0.5)
  assert.equal(deriveAvailabilityConfidence([], { default: 0.3 }), 0.3)
})

test('unknown responses use unknownWeight; weights are overridable', () => {
  assert.equal(deriveAvailabilityConfidence(['no-reply']), 0)
  assert.equal(deriveAvailabilityConfidence(['no-reply'], { unknownWeight: 0.4 }), 0.4)
  assert.equal(deriveAvailabilityConfidence(['maybe'], { weights: { maybe: 1 } }), 1)
})

test('result is always clamped to [0,1]', () => {
  assert.equal(deriveAvailabilityConfidence(['available'], { weights: { available: 5 } }), 1)
  assert.equal(deriveAvailabilityConfidence([], { default: -2 }), 0)
})

test('deriveAvailabilityConfidence validation → TypeError', () => {
  assert.throws(() => deriveAvailabilityConfidence('nope'), TypeError)
  assert.throws(() => deriveAvailabilityConfidence([], []), TypeError)
  assert.throws(() => deriveAvailabilityConfidence([], { weights: 'x' }), TypeError)
  assert.throws(() => deriveAvailabilityConfidence([], { weights: { available: 'high' } }), TypeError)
  assert.throws(() => deriveAvailabilityConfidence([], { default: 'x' }), TypeError)
})

// ── createBaselineConfidenceProvider ─────────────────────────────────────────────────

test('provider derives each player confidence from their history', () => {
  const provider = createBaselineConfidenceProvider({ u1: ['available', 'available'], u2: ['unavailable'] })
  assert.equal(provider.getConfidence({ userId: 'u1' }), 1)
  assert.equal(provider.getConfidence({ userId: 'u2' }), 0)
  assert.equal(provider.getConfidence({ userId: 'u3' }), 0.5)   // no history → default
})

test('provider honours playerIdField and the userId→id fallback', () => {
  const byLegacy = createBaselineConfidenceProvider({ 'inv-1': ['available'] }, { playerIdField: 'legacyPlayerId' })
  assert.equal(byLegacy.getConfidence({ legacyPlayerId: 'inv-1' }), 1)
  const byId = createBaselineConfidenceProvider({ p1: ['unavailable'] })
  assert.equal(byId.getConfidence({ id: 'p1' }), 0)   // no userId → falls back to id
})

test('provider validation → TypeError', () => {
  assert.throws(() => createBaselineConfidenceProvider(null), TypeError)
  assert.throws(() => createBaselineConfidenceProvider([]), TypeError)
  assert.throws(() => createBaselineConfidenceProvider({}, { playerIdField: '' }), TypeError)
  assert.throws(() => createBaselineConfidenceProvider({}).getConfidence('not-an-object'), TypeError)   // via M132
})

// ── integration with buildSelectionContext (M134) ────────────────────────────────────

test('baseline provider drives candidate confidence through buildSelectionContext', () => {
  const provider = createBaselineConfidenceProvider({ u1: ['available', 'available', 'maybe'] })
  const ctx = buildSelectionContext({
    players: [{ id: 'profile_u1', userId: 'u1', displayName: 'u1', position: 'Hooker' }],
    availabilityResponses: { u1: { response: 'available' } },
    confidenceProvider: provider,
  })
  assert.equal(ctx.candidates[0].confidence, deriveAvailabilityConfidence(['available', 'available', 'maybe']))
})

// ── determinism / immutability ───────────────────────────────────────────────────────

test('deterministic and does not mutate the history', () => {
  const history = ['available', 'maybe', 'unavailable']
  const before = JSON.stringify(history)
  assert.equal(deriveAvailabilityConfidence(history), deriveAvailabilityConfidence(history))
  assert.equal(JSON.stringify(history), before)
})

test('provider does not mutate historyByPlayer', () => {
  const historyByPlayer = { u1: ['available'] }
  const before = JSON.stringify(historyByPlayer)
  createBaselineConfidenceProvider(historyByPlayer).getConfidence({ userId: 'u1' })
  assert.equal(JSON.stringify(historyByPlayer), before)
})

// ── exports ──────────────────────────────────────────────────────────────────────────

test('exports exist', () => {
  assert.equal(typeof deriveAvailabilityConfidence, 'function')
  assert.equal(typeof createBaselineConfidenceProvider, 'function')
})
