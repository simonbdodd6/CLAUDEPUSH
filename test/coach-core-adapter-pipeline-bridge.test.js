/**
 * coach-core-adapter — Pipeline Bridge tests
 *
 * Composes M118 → M119 → M131 via injected implementations: happy path, M118→M119 wiring,
 * M119→M131 wiring, single calls, validation, exception propagation, no mutation, determinism,
 * deep freeze, exports. No engine is implemented here — all are spied stubs.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runPipelineBridge } from '../packages/coach-core-adapter/index.js'

const pipelineInput = (over = {}) => ({
  candidates: [{ playerId: 'u1', position: 'Hooker', availability: true, confidence: 0.6 }],
  formation: { 2: 'Hooker' },
  positionGroups: { Blindside: ['Blindside', 'Flanker'] },
  plan: { types: ['selection-preference'], ontologyTargets: [], tags: [], minimumScore: 0, limit: 25, sort: 'score' },
  decision: { category: 'selection-preference', confidence: 0.5, matchedSignals: [] },
  memoryProvider: { searchCoachMemory: () => [] },
  intelligenceServices: { scoreDecisionAlignment: () => ({}) },
  ...over,
})

// spied stubs for the three injected engines
function makeServices(over = {}) {
  const calls = { m118: [], m119: [], m131: [] }
  const services = {
    runCoachIntelligencePipeline: (input, svc) => { calls.m118.push({ input, svc }); return { alignment: { alignmentScore: 0.7 }, _tag: 'm118' } },
    buildCoachRecommendation: (pr) => { calls.m119.push(pr); return { action: 'present', confidence: pr.alignment.alignmentScore, _tag: 'm119' } },
    runSelectionPipeline: (si) => { calls.m131.push(si); return { squad: 'composed', _tag: 'm131' } },
    ...over,
  }
  return { services, calls }
}

// ── happy path ───────────────────────────────────────────────────────────────────────

test('happy path — returns all five sections', () => {
  const { services } = makeServices()
  const r = runPipelineBridge(pipelineInput(), services)
  for (const k of ['pipelineResult', 'recommendation', 'selectionInput', 'result', 'metadata']) assert.ok(k in r, `missing ${k}`)
  assert.equal(r.pipelineResult._tag, 'm118')
  assert.equal(r.recommendation._tag, 'm119')
  assert.equal(r.result._tag, 'm131')
  assert.deepEqual(r.metadata, { deterministic: true, adapterLayer: true, bridge: true })
})

// ── wiring ───────────────────────────────────────────────────────────────────────────

test('M118 receives { plan, decision } and a services object carrying memoryProvider', () => {
  const { services, calls } = makeServices()
  const pi = pipelineInput()
  runPipelineBridge(pi, services)
  assert.deepEqual(calls.m118[0].input, { plan: pi.plan, decision: pi.decision })
  assert.equal(calls.m118[0].svc.memoryProvider, pi.memoryProvider)              // merged in
  assert.equal(calls.m118[0].svc.scoreDecisionAlignment, pi.intelligenceServices.scoreDecisionAlignment)
})

test('M118 output is passed to M119', () => {
  const { services, calls } = makeServices()
  const r = runPipelineBridge(pipelineInput(), services)
  assert.equal(calls.m119[0], r.pipelineResult)
})

test('M119 output (and M118 output) are passed to M131', () => {
  const { services, calls } = makeServices()
  const pi = pipelineInput()
  const r = runPipelineBridge(pi, services)
  const si = calls.m131[0]
  assert.equal(si, r.selectionInput)
  assert.equal(si.pipelineResult, r.pipelineResult)
  assert.equal(si.recommendation, r.recommendation)
  assert.equal(si.candidates, pi.candidates)
  assert.equal(si.formation, pi.formation)
  assert.equal(si.positionGroups, pi.positionGroups)
  assert.deepEqual(si.squadOptions, {})   // default when omitted
  assert.deepEqual(Object.keys(si).sort(), ['candidates', 'formation', 'pipelineResult', 'positionGroups', 'recommendation', 'squadOptions'])
})

// ── squadOptions passthrough (M141) ──────────────────────────────────────────────────

test('squadOptions are passed through from pipelineInput to selectionInput', () => {
  const { services, calls } = makeServices()
  const squadOptions = { limit: 23 }
  runPipelineBridge(pipelineInput({ squadOptions }), services)
  assert.equal(calls.m131[0].squadOptions, squadOptions)   // same reference, threaded to M131
})

test('omitted squadOptions default to {} and an invalid squadOptions throws', () => {
  const { services, calls } = makeServices()
  runPipelineBridge(pipelineInput(), services)
  assert.deepEqual(calls.m131[0].squadOptions, {})
  assert.throws(() => runPipelineBridge(pipelineInput({ squadOptions: 5 }), services), TypeError)
})

// ── single calls ─────────────────────────────────────────────────────────────────────

test('each injected service is called exactly once', () => {
  const { services, calls } = makeServices()
  runPipelineBridge(pipelineInput(), services)
  assert.equal(calls.m118.length, 1)
  assert.equal(calls.m119.length, 1)
  assert.equal(calls.m131.length, 1)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid pipelineInput → TypeError', () => {
  const { services } = makeServices()
  assert.throws(() => runPipelineBridge(null, services), TypeError)
  assert.throws(() => runPipelineBridge(pipelineInput({ candidates: 'nope' }), services), TypeError)
  assert.throws(() => runPipelineBridge(pipelineInput({ plan: 1 }), services), TypeError)
  assert.throws(() => runPipelineBridge(pipelineInput({ memoryProvider: undefined }), services), TypeError)
})

test('invalid services → TypeError', () => {
  assert.throws(() => runPipelineBridge(pipelineInput(), null), TypeError)
  assert.throws(() => runPipelineBridge(pipelineInput(), makeServices({ runCoachIntelligencePipeline: undefined }).services), TypeError)
  assert.throws(() => runPipelineBridge(pipelineInput(), makeServices({ buildCoachRecommendation: 5 }).services), TypeError)
  assert.throws(() => runPipelineBridge(pipelineInput(), makeServices({ runSelectionPipeline: {} }).services), TypeError)
})

// ── exception propagation ────────────────────────────────────────────────────────────

test('an engine exception propagates and later engines are not called', () => {
  const { services, calls } = makeServices({ runCoachIntelligencePipeline: () => { throw new Error('m118 boom') } })
  assert.throws(() => runPipelineBridge(pipelineInput(), services), /m118 boom/)
  assert.equal(calls.m119.length, 0)
  assert.equal(calls.m131.length, 0)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate pipelineInput or injected services', () => {
  const { services } = makeServices()
  const pi = pipelineInput()
  const before = JSON.stringify(pi)
  runPipelineBridge(pi, services)
  assert.equal(JSON.stringify(pi), before)
  assert.equal(Object.isFrozen(pi.intelligenceServices), false)
  assert.equal(Object.isFrozen(pi.memoryProvider), false)
})

test('deterministic — identical input → identical output', () => {
  const { services } = makeServices()
  const pi = pipelineInput()
  assert.deepEqual(runPipelineBridge(pi, services), runPipelineBridge(pi, services))
})

test('output is deeply frozen (adapter-produced structure)', () => {
  const r = runPipelineBridge(pipelineInput(), makeServices().services)
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.selectionInput) && Object.isFrozen(r.metadata))
  assert.throws(() => { r.result = null })
  assert.throws(() => { r.selectionInput.candidates = [] })
  assert.throws(() => { r.metadata.bridge = false })
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof runPipelineBridge, 'function')
})
