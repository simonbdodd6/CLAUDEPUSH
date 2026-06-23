/**
 * coach-core-adapter — Player Confidence Provider tests
 *
 * Validated DI wrapper supplying the M120/M121 candidate confidence: resolver wrapping,
 * clamping, validation, constant + field providers, determinism, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createConfidenceProvider, constantConfidenceProvider, fieldConfidenceProvider,
} from '../packages/coach-core-adapter/index.js'

// ── createConfidenceProvider ─────────────────────────────────────────────────────────

test('wraps a resolver and returns its value', () => {
  const provider = createConfidenceProvider((p) => p.form)
  assert.equal(provider.getConfidence({ form: 0.72 }), 0.72)
})

test('clamps resolver output into [0,1]', () => {
  assert.equal(createConfidenceProvider(() => 1.5).getConfidence({}), 1)
  assert.equal(createConfidenceProvider(() => -0.3).getConfidence({}), 0)
})

test('throws when the resolver returns a non-finite number', () => {
  assert.throws(() => createConfidenceProvider(() => NaN).getConfidence({}), TypeError)
  assert.throws(() => createConfidenceProvider(() => 'high').getConfidence({}), TypeError)
  assert.throws(() => createConfidenceProvider(() => undefined).getConfidence({}), TypeError)
})

test('throws when given a non-object player or non-function resolver', () => {
  assert.throws(() => createConfidenceProvider((p) => p).getConfidence(null), TypeError)
  assert.throws(() => createConfidenceProvider((p) => p).getConfidence('p1'), TypeError)
  assert.throws(() => createConfidenceProvider('nope'), TypeError)
})

// ── constantConfidenceProvider ───────────────────────────────────────────────────────

test('constant provider returns the same value for any player', () => {
  const provider = constantConfidenceProvider(0.5)
  assert.equal(provider.getConfidence({ playerId: 'a' }), 0.5)
  assert.equal(provider.getConfidence({ playerId: 'b' }), 0.5)
})

test('constant provider rejects a non-finite value', () => {
  assert.throws(() => constantConfidenceProvider('x'), TypeError)
  assert.throws(() => constantConfidenceProvider(NaN), TypeError)
})

// ── fieldConfidenceProvider ──────────────────────────────────────────────────────────

test('field provider reads a numeric field, with a fallback', () => {
  const provider = fieldConfidenceProvider('formScore', 0.3)
  assert.equal(provider.getConfidence({ formScore: 0.81 }), 0.81)
  assert.equal(provider.getConfidence({ formScore: 'n/a' }), 0.3)   // fallback
  assert.equal(provider.getConfidence({}), 0.3)                      // missing → fallback
})

test('field provider validates its arguments', () => {
  assert.throws(() => fieldConfidenceProvider(''), TypeError)
  assert.throws(() => fieldConfidenceProvider('formScore', 'x'), TypeError)
})

// ── determinism / exports ────────────────────────────────────────────────────────────

test('deterministic — same player, same confidence', () => {
  const provider = fieldConfidenceProvider('formScore', 0.4)
  assert.equal(provider.getConfidence({ formScore: 0.6 }), provider.getConfidence({ formScore: 0.6 }))
})

test('exports exist', () => {
  assert.equal(typeof createConfidenceProvider, 'function')
  assert.equal(typeof constantConfidenceProvider, 'function')
  assert.equal(typeof fieldConfidenceProvider, 'function')
})
