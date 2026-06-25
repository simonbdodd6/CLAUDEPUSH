/**
 * brain-decision-planner — Intelligence Boundary Harness tests
 *
 * Proves provider → M168 → M135 → M140 composes end-to-end: real-path output, validator/mapper/
 * builder/complete failures propagate, correct call order, each stage once, frozen output,
 * determinism, no mutation, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { completeDecisionPlanningInput } from '../packages/brain-decision-planner/index.js'

const FIXTURE = { fixtureId: 'fix_1', opponent: 'Leinster', competition: 'AIL', venue: 'Home', date: '2026-07-05' }
const MATCH = { category: 'selection-preference', confidence: 0.7, matchedSignals: ['form'] }
const IDENTITY = { coachId: 'coach-demo', clubId: 'boitsfort-rfc', tags: [] }

function makeProvider(over = {}) {
  return { getFixtureContext: () => ({ fixture: FIXTURE, match: MATCH }), getCoachIdentity: () => IDENTITY, ...over }
}

// ── real pipeline (default stages: M168 → M135 → M140) ───────────────────────────────

test('valid provider → completed intelligence input (normalized plan + decision)', () => {
  const out = completeDecisionPlanningInput(makeProvider())
  assert.ok(out.plan.filters && out.plan.retrieval)                                  // M140 normalized M109 plan
  assert.equal(out.decision.category, 'selection-preference')                        // from match
  assert.equal(out.decision.confidence, 0.7)
  assert.deepEqual(out.decision.matchedSignals, ['form'])
  assert.ok(Array.isArray(out.decision.supportingMemoryIds))                         // M140 completion (default [])
  assert.ok(Object.isFrozen(out))                                                    // M140 freezes
})

test('validator failure propagates (invalid provider)', () => {
  assert.throws(() => completeDecisionPlanningInput(null), TypeError)
  assert.throws(() => completeDecisionPlanningInput({}), TypeError)
  assert.throws(() => completeDecisionPlanningInput(makeProvider({ getCoachIdentity: undefined })), /getCoachIdentity/)
})

test('deterministic — identical provider → identical output', () => {
  assert.deepEqual(completeDecisionPlanningInput(makeProvider()), completeDecisionPlanningInput(makeProvider()))
})

test('does not mutate the provider data', () => {
  const before = JSON.stringify({ FIXTURE, MATCH, IDENTITY })
  completeDecisionPlanningInput(makeProvider())
  assert.equal(JSON.stringify({ FIXTURE, MATCH, IDENTITY }), before)
})

// ── orchestration (injected stages: order / call-once / stage failures) ──────────────

function makeStages(over = {}) {
  const order = []; const calls = { map: 0, build: 0, complete: 0 }
  const stages = {
    mapDecisionPlanContext: (p) => { order.push('map'); calls.map++; return { fixture: {}, match: {}, coachContext: {} } },
    buildDecisionPlanContext: (ctx) => { order.push('build'); calls.build++; return { plan: {}, decision: {}, metadata: {} } },
    completeIntelligenceInput: (dp) => { order.push('complete'); calls.complete++; return Object.freeze({ done: true }) },
    ...over,
  }
  return { stages, order, calls }
}

test('stages run in order map → build → complete, each exactly once', () => {
  const { stages, order, calls } = makeStages()
  const out = completeDecisionPlanningInput(makeProvider(), stages)
  assert.deepEqual(order, ['map', 'build', 'complete'])
  assert.deepEqual(calls, { map: 1, build: 1, complete: 1 })
  assert.deepEqual(out, { done: true })
})

test('a mapper failure propagates (build/complete not reached)', () => {
  const { stages, calls } = makeStages({ mapDecisionPlanContext: () => { throw new Error('map boom') } })
  assert.throws(() => completeDecisionPlanningInput(makeProvider(), stages), /map boom/)
  assert.deepEqual(calls, { map: 0, build: 0, complete: 0 })
})

test('a builder failure propagates (complete not reached)', () => {
  const { stages, calls } = makeStages({ buildDecisionPlanContext: () => { throw new Error('build boom') } })
  assert.throws(() => completeDecisionPlanningInput(makeProvider(), stages), /build boom/)
  assert.equal(calls.complete, 0)
})

test('a completeIntelligenceInput failure propagates', () => {
  const { stages } = makeStages({ completeIntelligenceInput: () => { throw new Error('complete boom') } })
  assert.throws(() => completeDecisionPlanningInput(makeProvider(), stages), /complete boom/)
})

test('malformed stages → TypeError', () => {
  assert.throws(() => completeDecisionPlanningInput(makeProvider(), {}), TypeError)
  assert.throws(() => completeDecisionPlanningInput(makeProvider(), makeStages({ buildDecisionPlanContext: 5 }).stages), TypeError)
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof completeDecisionPlanningInput, 'function')
})
