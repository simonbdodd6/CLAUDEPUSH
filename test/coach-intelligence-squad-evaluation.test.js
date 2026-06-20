/**
 * M121 — Squad Evaluation Engine tests
 *
 * Deterministic tests for the pure, dormant squad ranker: empty squad, single eligible/
 * ineligible, multiple ranked by score desc, tie-break by playerId asc, limit, ineligible
 * sorted by playerId, groupByPosition false/true, duplicate-id / invalid-candidate /
 * invalid-options rejection, no mutation, determinism, deep-frozen output, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { evaluateSquad } from '../packages/coach-intelligence/index.js'

const candidate = (playerId, over = {}) => ({ playerId, position: 'openside', availability: true, confidence: 0.5, ...over })

const pipelineResult = {
  memories: [], synthesis: {}, signals: {}, profile: { dominantSignals: [] }, explanation: { matchedSignals: [] },
  alignment: { alignmentScore: 0.8, alignmentTier: 'good' }, challenge: { challenged: false },
}
const recommendation = {
  recommend: true, action: 'present', confidence: 0.8, alignmentTier: 'good', requiresCoachReview: false,
  evidence: { memoryCount: 0, dominantSignals: ['selection-preference'], matchedSignals: ['selection-preference'], challenged: false },
  metadata: { deterministic: true, explainable: true, llmGenerated: false },
}
// score = 0.8*0.4 + candidate.confidence*0.3 + 0.8*0.3 = 0.56 + 0.3*confidence

// ── empty ────────────────────────────────────────────────────────────────────────────

test('empty squad', () => {
  const r = evaluateSquad([], pipelineResult, recommendation)
  assert.deepEqual(r.ranked, [])
  assert.deepEqual(r.ineligible, [])
  assert.deepEqual(r.metadata, { candidateCount: 0, eligibleCount: 0, ineligibleCount: 0, limit: 15, deterministic: true, explainable: true, llmGenerated: false })
  assert.ok(!('byPosition' in r))
})

// ── single ───────────────────────────────────────────────────────────────────────────

test('single eligible candidate', () => {
  const r = evaluateSquad([candidate('p1', { confidence: 0.6 })], pipelineResult, recommendation)
  assert.equal(r.ranked.length, 1)
  assert.equal(r.ranked[0].playerId, 'p1')
  assert.equal(r.ranked[0].recommendationAction, 'present')
  assert.equal(r.ineligible.length, 0)
  assert.equal(r.metadata.eligibleCount, 1)
})

test('single ineligible candidate', () => {
  const r = evaluateSquad([candidate('p1', { availability: false })], pipelineResult, recommendation)
  assert.equal(r.ranked.length, 0)
  assert.equal(r.ineligible.length, 1)
  assert.equal(r.ineligible[0].playerId, 'p1')
  assert.equal(r.metadata.ineligibleCount, 1)
})

// ── ranking ──────────────────────────────────────────────────────────────────────────

test('multiple candidates ranked by score descending', () => {
  const r = evaluateSquad([
    candidate('low', { confidence: 0.2 }),
    candidate('high', { confidence: 0.9 }),
    candidate('mid', { confidence: 0.5 }),
  ], pipelineResult, recommendation)
  assert.deepEqual(r.ranked.map(x => x.playerId), ['high', 'mid', 'low'])
})

test('tie-break by playerId ascending', () => {
  const r = evaluateSquad([
    candidate('z', { confidence: 0.6 }),
    candidate('a', { confidence: 0.6 }),
    candidate('m', { confidence: 0.6 }),
  ], pipelineResult, recommendation)
  assert.deepEqual(r.ranked.map(x => x.playerId), ['a', 'm', 'z'])   // equal score → playerId asc
})

test('limit caps ranked but eligibleCount counts all eligible', () => {
  const r = evaluateSquad([
    candidate('a', { confidence: 0.9 }),
    candidate('b', { confidence: 0.7 }),
    candidate('c', { confidence: 0.5 }),
  ], pipelineResult, recommendation, { limit: 2 })
  assert.deepEqual(r.ranked.map(x => x.playerId), ['a', 'b'])
  assert.equal(r.metadata.limit, 2)
  assert.equal(r.metadata.eligibleCount, 3)
})

test('ineligible sorted by playerId ascending', () => {
  const r = evaluateSquad([
    candidate('z', { availability: false }),
    candidate('a', { availability: false }),
    candidate('m', { availability: false }),
  ], pipelineResult, recommendation)
  assert.deepEqual(r.ineligible.map(x => x.playerId), ['a', 'm', 'z'])
})

// ── groupByPosition ──────────────────────────────────────────────────────────────────

test('groupByPosition false (default) → no byPosition key', () => {
  const r = evaluateSquad([candidate('p1')], pipelineResult, recommendation)
  assert.ok(!('byPosition' in r))
  const r2 = evaluateSquad([candidate('p1')], pipelineResult, recommendation, { groupByPosition: false })
  assert.ok(!('byPosition' in r2))
})

test('groupByPosition true → ranked grouped by position', () => {
  const r = evaluateSquad([
    candidate('a', { position: 'openside', confidence: 0.9 }),
    candidate('b', { position: 'fullback', confidence: 0.8 }),
    candidate('c', { position: 'openside', confidence: 0.7 }),
  ], pipelineResult, recommendation, { groupByPosition: true })
  assert.ok('byPosition' in r)
  assert.deepEqual(r.byPosition.openside.map(x => x.playerId), ['a', 'c'])   // ranked order within position
  assert.deepEqual(r.byPosition.fullback.map(x => x.playerId), ['b'])
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('non-array candidates → TypeError', () => {
  assert.throws(() => evaluateSquad(null, pipelineResult, recommendation), TypeError)
  assert.throws(() => evaluateSquad({}, pipelineResult, recommendation), TypeError)
})

test('duplicate playerId → TypeError', () => {
  assert.throws(() => evaluateSquad([candidate('dup'), candidate('dup')], pipelineResult, recommendation), TypeError)
})

test('invalid candidate → TypeError', () => {
  assert.throws(() => evaluateSquad([candidate('p1'), { playerId: 'p2' }], pipelineResult, recommendation), TypeError)
  assert.throws(() => evaluateSquad([candidate('p1', { availability: 'yes' })], pipelineResult, recommendation), TypeError)
})

test('invalid pipelineResult / recommendation → TypeError', () => {
  assert.throws(() => evaluateSquad([], null, recommendation), TypeError)
  assert.throws(() => evaluateSquad([], pipelineResult, null), TypeError)
})

test('invalid options → TypeError', () => {
  const c = [candidate('p1')]
  assert.throws(() => evaluateSquad(c, pipelineResult, recommendation, null), TypeError)
  assert.throws(() => evaluateSquad(c, pipelineResult, recommendation, { limit: 0 }), TypeError)
  assert.throws(() => evaluateSquad(c, pipelineResult, recommendation, { limit: 101 }), TypeError)
  assert.throws(() => evaluateSquad(c, pipelineResult, recommendation, { limit: 'ten' }), TypeError)
  assert.throws(() => evaluateSquad(c, pipelineResult, recommendation, { groupByPosition: 'yes' }), TypeError)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate inputs', () => {
  const candidates = [candidate('b', { confidence: 0.5 }), candidate('a', { confidence: 0.9 })]
  const before = [JSON.stringify(candidates), JSON.stringify(pipelineResult), JSON.stringify(recommendation)]
  evaluateSquad(candidates, pipelineResult, recommendation)
  assert.deepEqual([JSON.stringify(candidates), JSON.stringify(pipelineResult), JSON.stringify(recommendation)], before)
  assert.deepEqual(candidates.map(c => c.playerId), ['b', 'a'])   // input order preserved
})

test('deterministic — identical inputs → identical result', () => {
  const candidates = [candidate('a', { confidence: 0.7 }), candidate('b', { confidence: 0.5 })]
  assert.deepEqual(
    evaluateSquad(candidates, pipelineResult, recommendation, { groupByPosition: true }),
    evaluateSquad(candidates, pipelineResult, recommendation, { groupByPosition: true }),
  )
})

test('output is deeply frozen', () => {
  const r = evaluateSquad([candidate('a'), candidate('b', { availability: false })], pipelineResult, recommendation, { groupByPosition: true })
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.ranked) && Object.isFrozen(r.ineligible) &&
    Object.isFrozen(r.metadata) && Object.isFrozen(r.byPosition) && Object.isFrozen(r.ranked[0]))
  assert.throws(() => r.ranked.push({}))
  assert.throws(() => { r.metadata.limit = 1 })
})

// ── exports ──────────────────────────────────────────────────────────────────────────

test('exports', () => {
  assert.equal(typeof evaluateSquad, 'function')
})
