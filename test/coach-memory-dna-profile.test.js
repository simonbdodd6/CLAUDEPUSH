/**
 * M114 — Coach DNA profile tests
 *
 * Deterministic tests for the pure, dormant profile builder over M113 signals: empty/single/
 * multiple, dominant ordering (top 5 by strength), diversity score, confidence (average
 * strength), validation (accepts M113 object or array; rejects malformed), determinism,
 * deep-frozen output, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaProfile,
  extractCoachDnaSignals,
  normalizeCoachMemoryEntry,
} from '../packages/coach-memory/index.js'

const close = (a, b) => Math.abs(a - b) < 1e-9

// a minimal valid M113 signal
const sig = (category, strength, over = {}) => ({
  category, occurrences: 1, averageConfidence: 0.5, averageWeight: 0.5, strength, supportingMemoryIds: [], ...over,
})

// ── empty / single ───────────────────────────────────────────────────────────────────

test('empty profile', () => {
  const p = buildCoachDnaProfile([])
  assert.equal(p.profileVersion, '1.0')
  assert.deepEqual(p.generatedFrom, { signalCount: 0, generatedDeterministically: true })
  assert.deepEqual(p.dominantSignals, [])
  assert.deepEqual(p.balance, { strongestCategory: null, weakestCategory: null, diversityScore: 0 })
  assert.equal(p.confidence, 0)
  assert.deepEqual(p.metadata, { explainable: true, llmGenerated: false, deterministic: true })
})

test('single signal', () => {
  const p = buildCoachDnaProfile([sig('philosophy', 0.8)])
  assert.equal(p.generatedFrom.signalCount, 1)
  assert.equal(p.dominantSignals.length, 1)
  assert.equal(p.dominantSignals[0].category, 'philosophy')
  assert.equal(p.balance.strongestCategory, 'philosophy')
  assert.equal(p.balance.weakestCategory, 'philosophy')
  assert.ok(close(p.balance.diversityScore, 1 / 8))
  assert.ok(close(p.confidence, 0.8))
})

// ── multiple / dominant ordering ─────────────────────────────────────────────────────

test('dominant ordering — top 5 by strength descending', () => {
  const signals = [
    sig('philosophy', 0.4),
    sig('risk-warning', 0.9),
    sig('selection-preference', 0.8),
    sig('training-preference', 0.7),
    sig('tactical-preference', 0.6),
    sig('player-management', 0.5),
  ]
  const p = buildCoachDnaProfile(signals)
  assert.equal(p.generatedFrom.signalCount, 6)
  assert.equal(p.dominantSignals.length, 5)   // capped at 5
  assert.deepEqual(p.dominantSignals.map(s => s.strength), [0.9, 0.8, 0.7, 0.6, 0.5])
  assert.equal(p.balance.strongestCategory, 'risk-warning')      // strength 0.9
  assert.equal(p.balance.weakestCategory, 'philosophy')          // strength 0.4
})

test('equal strength → category ascending tie-break in dominant order', () => {
  const p = buildCoachDnaProfile([sig('risk-warning', 0.5), sig('philosophy', 0.5)])
  assert.deepEqual(p.dominantSignals.map(s => s.category), ['philosophy', 'risk-warning'])
})

// ── diversity / confidence ───────────────────────────────────────────────────────────

test('diversity score = signalCount / 8 (clamped)', () => {
  assert.ok(close(buildCoachDnaProfile([sig('a', 0.5), sig('b', 0.5), sig('c', 0.5)]).balance.diversityScore, 3 / 8))
  // capped at 1 if more categories than possible types
  const many = Array.from({ length: 10 }, (_, i) => sig(`c${i}`, 0.5))
  assert.equal(buildCoachDnaProfile(many).balance.diversityScore, 1)
})

test('confidence = average strength of all signals', () => {
  assert.ok(close(buildCoachDnaProfile([sig('a', 0.9), sig('b', 0.3)]).confidence, 0.6))
})

// ── input shapes / validation ────────────────────────────────────────────────────────

test('accepts the M113 output object { signals } as well as a raw array', () => {
  const m113 = { signals: [sig('philosophy', 0.7)], summary: { strongestCategory: 'philosophy', totalSignals: 1, strongestStrength: 0.7 } }
  const fromObject = buildCoachDnaProfile(m113)
  const fromArray = buildCoachDnaProfile(m113.signals)
  assert.deepEqual(fromObject, fromArray)
})

test('consumes a real M113 output end-to-end', () => {
  const mem = (over) => normalizeCoachMemoryEntry({
    id: 'm', coachId: 'c', clubId: 'club', type: 'philosophy', statement: 's', source: 'manual',
    confidence: 0.6, weight: 0.6, tags: [], ontologyLinks: [], evidenceRefs: [], createdAt: '2026-01-01T00:00:00.000Z', ...over,
  })
  const signals = extractCoachDnaSignals([mem({ id: '1', type: 'philosophy' }), mem({ id: '2', type: 'risk-warning' })])
  const p = buildCoachDnaProfile(signals)
  assert.equal(p.generatedFrom.signalCount, signals.signals.length)
  assert.ok(close(p.confidence, signals.signals.reduce((s, x) => s + x.strength, 0) / signals.signals.length))
})

test('validation — malformed input → TypeError', () => {
  assert.throws(() => buildCoachDnaProfile(null), TypeError)
  assert.throws(() => buildCoachDnaProfile('nope'), TypeError)
  assert.throws(() => buildCoachDnaProfile({}), TypeError)                                   // no signals array
  assert.throws(() => buildCoachDnaProfile([{ category: 'x' }]), TypeError)                  // malformed signal
  assert.throws(() => buildCoachDnaProfile([sig('a', 0.5), { category: 'b', strength: 0.5 }]), TypeError)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate the input', () => {
  const signals = [sig('b', 0.4, { supportingMemoryIds: ['m1'] }), sig('a', 0.9)]
  const before = JSON.stringify(signals)
  buildCoachDnaProfile(signals)
  assert.equal(JSON.stringify(signals), before)
})

test('deterministic — identical input → identical profile', () => {
  const signals = [sig('philosophy', 0.7), sig('risk-warning', 0.5)]
  assert.deepEqual(buildCoachDnaProfile(signals), buildCoachDnaProfile(signals))
})

test('output is deeply frozen', () => {
  const p = buildCoachDnaProfile([sig('philosophy', 0.7, { supportingMemoryIds: ['m1'] })])
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.generatedFrom) && Object.isFrozen(p.dominantSignals) &&
    Object.isFrozen(p.balance) && Object.isFrozen(p.metadata) && Object.isFrozen(p.dominantSignals[0]) &&
    Object.isFrozen(p.dominantSignals[0].supportingMemoryIds))
  assert.throws(() => { p.confidence = 1 })
  assert.throws(() => p.dominantSignals.push({}))
})

// ── exports ──────────────────────────────────────────────────────────────────────────

test('exports', () => {
  assert.equal(typeof buildCoachDnaProfile, 'function')
})
