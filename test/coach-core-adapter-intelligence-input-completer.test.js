/**
 * coach-core-adapter — Intelligence Input Completer tests
 *
 * Completes an M135 decisionPlanContext into the M118/M137 input: normalized plan, decision
 * with supportingMemoryIds, preserved fields/metadata, trim/dedupe, defaults, validation,
 * no mutation, determinism, deep freeze, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { completeIntelligenceInput } from '../packages/coach-core-adapter/index.js'
import { createCoachMemoryQueryPlan } from '../packages/coach-memory/index.js'

const ctx = (over = {}) => ({
  plan: { types: ['selection-preference'], ontologyTargets: [], tags: [], minimumScore: 0, limit: 25, sort: 'score' },
  decision: { category: 'selection-preference', confidence: 0.6, matchedSignals: ['selection-preference'] },
  metadata: { fixtureId: 'fix_1', opponent: 'Leinster', competition: null, venue: null, deterministic: true, adapterLayer: true },
  ...over,
})

// ── happy path ───────────────────────────────────────────────────────────────────────

test('happy path — normalized plan + completed decision + preserved metadata', () => {
  const r = completeIntelligenceInput(ctx(), { supportingMemoryIds: ['m1', 'm2'] })
  assert.ok(r.plan.filters && r.plan.retrieval)   // M109-normalized shape
  assert.deepEqual(r.decision, {
    category: 'selection-preference', confidence: 0.6, matchedSignals: ['selection-preference'], supportingMemoryIds: ['m1', 'm2'],
  })
  assert.deepEqual(r.metadata, ctx().metadata)
})

// ── plan normalization ───────────────────────────────────────────────────────────────

test('plan is normalized by M109', () => {
  const c = ctx()
  assert.deepEqual(completeIntelligenceInput(c).plan, createCoachMemoryQueryPlan(c.plan))
})

// ── decision ─────────────────────────────────────────────────────────────────────────

test('existing decision fields are preserved', () => {
  const r = completeIntelligenceInput(ctx({ decision: { category: 'tactical-preference', confidence: 0.83, matchedSignals: ['kick', 'lineout'] } }), { supportingMemoryIds: ['x'] })
  assert.equal(r.decision.category, 'tactical-preference')
  assert.equal(r.decision.confidence, 0.83)
  assert.deepEqual(r.decision.matchedSignals, ['kick', 'lineout'])
})

test('supportingMemoryIds are added', () => {
  assert.deepEqual(completeIntelligenceInput(ctx(), { supportingMemoryIds: ['a', 'b', 'c'] }).decision.supportingMemoryIds, ['a', 'b', 'c'])
})

test('supportingMemoryIds default to empty', () => {
  assert.deepEqual(completeIntelligenceInput(ctx()).decision.supportingMemoryIds, [])
})

test('supportingMemoryIds are trimmed and deduped (first-seen order)', () => {
  const r = completeIntelligenceInput(ctx(), { supportingMemoryIds: ['  m1 ', 'm1', 'm2', ' m2', 'm3'] })
  assert.deepEqual(r.decision.supportingMemoryIds, ['m1', 'm2', 'm3'])
})

// ── metadata ─────────────────────────────────────────────────────────────────────────

test('metadata is preserved', () => {
  const c = ctx()
  assert.deepEqual(completeIntelligenceInput(c).metadata, c.metadata)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('malformed decisionPlanContext → TypeError', () => {
  assert.throws(() => completeIntelligenceInput(null), TypeError)
  assert.throws(() => completeIntelligenceInput([]), TypeError)
  assert.throws(() => completeIntelligenceInput({}), TypeError)   // no plan
})

test('malformed plan → TypeError', () => {
  assert.throws(() => completeIntelligenceInput(ctx({ plan: 5 })), TypeError)
  assert.throws(() => completeIntelligenceInput(ctx({ plan: { types: ['selection-preference'], ontologyTargets: [], tags: [], minimumScore: 0, limit: 25, sort: 'bogus' } })), TypeError)   // invalid sort via M109
})

test('malformed decision → TypeError', () => {
  assert.throws(() => completeIntelligenceInput(ctx({ decision: {} })), TypeError)
  assert.throws(() => completeIntelligenceInput(ctx({ decision: { category: 'x', confidence: 'high', matchedSignals: [] } })), TypeError)
  assert.throws(() => completeIntelligenceInput(ctx({ decision: { category: 'x', confidence: 0.5, matchedSignals: 'no' } })), TypeError)
})

test('malformed options / supportingMemoryIds → TypeError', () => {
  assert.throws(() => completeIntelligenceInput(ctx(), []), TypeError)
  assert.throws(() => completeIntelligenceInput(ctx(), { supportingMemoryIds: 'x' }), TypeError)
  assert.throws(() => completeIntelligenceInput(ctx(), { supportingMemoryIds: [1, 2] }), TypeError)       // non-string
  assert.throws(() => completeIntelligenceInput(ctx(), { supportingMemoryIds: ['   '] }), TypeError)      // empty after trim
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate inputs', () => {
  const c = ctx()
  const options = { supportingMemoryIds: ['m1', 'm1'] }
  const before = [JSON.stringify(c), JSON.stringify(options)]
  completeIntelligenceInput(c, options)
  assert.deepEqual([JSON.stringify(c), JSON.stringify(options)], before)
  assert.equal(Object.isFrozen(c.metadata), false)         // caller metadata untouched
  assert.equal(Object.isFrozen(c.decision.matchedSignals), false)
})

test('deterministic — identical input → identical output', () => {
  const c = ctx()
  assert.deepEqual(completeIntelligenceInput(c, { supportingMemoryIds: ['m1'] }), completeIntelligenceInput(c, { supportingMemoryIds: ['m1'] }))
})

test('output is deeply frozen', () => {
  const r = completeIntelligenceInput(ctx(), { supportingMemoryIds: ['m1'] })
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.plan) && Object.isFrozen(r.decision) &&
    Object.isFrozen(r.decision.matchedSignals) && Object.isFrozen(r.decision.supportingMemoryIds) && Object.isFrozen(r.metadata))
  assert.throws(() => r.decision.supportingMemoryIds.push('x'))
  assert.throws(() => { r.decision.confidence = 1 })
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof completeIntelligenceInput, 'function')
})
