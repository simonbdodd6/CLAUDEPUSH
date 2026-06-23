/**
 * coach-core-adapter — Adapter → Selection Pipeline Dry Run tests
 *
 * Proves the dry-run harness composes M134 + M135 into the pipeline input contract and invokes
 * the injected pipeline exactly once: happy path, included contexts, pipelineInput shape, single
 * call, validation, exception propagation, no mutation, determinism, deep freeze, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  runSelectionDryRun, buildSelectionContext, buildDecisionPlanContext, constantConfidenceProvider,
} from '../packages/coach-core-adapter/index.js'

const corePlayer = (userId, position) => ({ id: `profile_${userId}`, userId, displayName: userId, position })

const input = (over = {}) => ({
  players: [corePlayer('u1', 'Hooker'), corePlayer('u2', 'Flanker')],
  availabilityResponses: { u1: { response: 'available' }, u2: { response: 'unavailable' } },
  confidenceProvider: constantConfidenceProvider(0.6),
  fixture: { fixtureId: 'fix_1', opponent: 'Leinster' },
  match: { category: 'selection-preference', confidence: 0.7, matchedSignals: ['form'] },
  coachContext: { tags: ['forwards'] },
  ...over,
})

// a spy pipeline service that records calls
function makeServices(over = {}) {
  const calls = []
  const services = {
    runSelectionPipeline: (pipelineInput) => { calls.push(pipelineInput); return { squad: 'composed', approved: true } },
    memoryProvider: { searchCoachMemory: () => [] },
    intelligenceServices: { scoreDecisionAlignment: () => ({}) },
    ...over,
  }
  return { services, calls }
}

// ── happy path ───────────────────────────────────────────────────────────────────────

test('happy path — returns all five output sections', () => {
  const { services } = makeServices()
  const r = runSelectionDryRun(input(), services)
  for (const k of ['selectionContext', 'decisionPlanContext', 'pipelineInput', 'result', 'metadata']) assert.ok(k in r, `missing ${k}`)
  assert.deepEqual(r.result, { squad: 'composed', approved: true })
  assert.deepEqual(r.metadata, {
    deterministic: true, adapterLayer: true, dryRun: true, playerCount: 2, candidateCount: 2, unresolvedCount: r.metadata.unresolvedCount,
  })
  assert.equal(typeof r.metadata.unresolvedCount, 'number')
})

// ── included context outputs ─────────────────────────────────────────────────────────

test('selectionContext equals buildSelectionContext output (M134)', () => {
  const { services } = makeServices()
  const i = input()
  const expected = buildSelectionContext({ players: i.players, availabilityResponses: i.availabilityResponses, confidenceProvider: i.confidenceProvider, options: i.selectionOptions })
  assert.deepEqual(runSelectionDryRun(i, services).selectionContext, expected)
})

test('decisionPlanContext equals buildDecisionPlanContext output (M135)', () => {
  const { services } = makeServices()
  const i = input()
  const expected = buildDecisionPlanContext({ fixture: i.fixture, match: i.match, coachContext: i.coachContext })
  assert.deepEqual(runSelectionDryRun(i, services).decisionPlanContext, expected)
})

// ── pipelineInput shape ──────────────────────────────────────────────────────────────

test('pipelineInput has the expected contract shape', () => {
  const { services } = makeServices()
  const r = runSelectionDryRun(input(), services)
  const pi = r.pipelineInput
  assert.deepEqual(Object.keys(pi).sort(), ['candidates', 'decision', 'formation', 'intelligenceServices', 'memoryProvider', 'plan', 'positionGroups'])
  assert.equal(pi.candidates, r.selectionContext.candidates)
  assert.equal(pi.formation, r.selectionContext.formation)
  assert.equal(pi.positionGroups, r.selectionContext.positionGroups)
  assert.equal(pi.plan, r.decisionPlanContext.plan)
  assert.equal(pi.decision, r.decisionPlanContext.decision)
  assert.equal(pi.memoryProvider, services.memoryProvider)
  assert.equal(pi.intelligenceServices, services.intelligenceServices)
})

// ── single call ──────────────────────────────────────────────────────────────────────

test('runSelectionPipeline is called exactly once, with pipelineInput', () => {
  const { services, calls } = makeServices()
  const r = runSelectionDryRun(input(), services)
  assert.equal(calls.length, 1)
  assert.equal(calls[0], r.pipelineInput)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid input → TypeError', () => {
  const { services } = makeServices()
  assert.throws(() => runSelectionDryRun(null, services), TypeError)
  assert.throws(() => runSelectionDryRun(input({ players: 'nope' }), services), TypeError)     // delegated to M134
  assert.throws(() => runSelectionDryRun(input({ availabilityResponses: null }), services), TypeError)
})

test('invalid services → TypeError', () => {
  assert.throws(() => runSelectionDryRun(input(), null), TypeError)
  assert.throws(() => runSelectionDryRun(input(), makeServices({ runSelectionPipeline: undefined }).services), TypeError)
  assert.throws(() => runSelectionDryRun(input(), makeServices({ memoryProvider: 'x' }).services), TypeError)
  assert.throws(() => runSelectionDryRun(input(), makeServices({ intelligenceServices: 5 }).services), TypeError)
})

// ── exception propagation ────────────────────────────────────────────────────────────

test('a pipeline exception propagates', () => {
  const { services } = makeServices({ runSelectionPipeline: () => { throw new Error('pipeline boom') } })
  assert.throws(() => runSelectionDryRun(input(), services), /pipeline boom/)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate input or injected services', () => {
  const { services } = makeServices()
  const i = input()
  const beforeInput = JSON.stringify({ players: i.players, availabilityResponses: i.availabilityResponses, fixture: i.fixture, match: i.match, coachContext: i.coachContext })
  runSelectionDryRun(i, services)
  assert.equal(JSON.stringify({ players: i.players, availabilityResponses: i.availabilityResponses, fixture: i.fixture, match: i.match, coachContext: i.coachContext }), beforeInput)
  assert.equal(Object.isFrozen(services.memoryProvider), false)        // injected services untouched
  assert.equal(Object.isFrozen(services.intelligenceServices), false)
})

test('deterministic — identical input → identical output', () => {
  const { services } = makeServices()   // same injected services so provider/service refs match
  assert.deepEqual(runSelectionDryRun(input(), services), runSelectionDryRun(input(), services))
})

test('output is deeply frozen (adapter-produced structure)', () => {
  const r = runSelectionDryRun(input(), makeServices().services)
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.pipelineInput) && Object.isFrozen(r.metadata) &&
    Object.isFrozen(r.selectionContext) && Object.isFrozen(r.decisionPlanContext))
  assert.throws(() => { r.result = null })
  assert.throws(() => { r.pipelineInput.candidates = [] })
  assert.throws(() => { r.metadata.dryRun = false })
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof runSelectionDryRun, 'function')
})
