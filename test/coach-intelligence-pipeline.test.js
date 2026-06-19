/**
 * M118 — Coach Intelligence pipeline tests
 *
 * Deterministic tests for the pure, dormant orchestration: happy path (real M110–M117
 * services), stage ordering, service injection, malformed service rejection, malformed stage
 * output rejection, determinism, deep-frozen result, exports. The pipeline imports none of
 * the intelligence — all capabilities are injected.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runCoachIntelligencePipeline } from '../packages/coach-intelligence/index.js'

import {
  normalizeCoachMemoryEntry,
  createCoachMemoryQueryPlan,
  retrieveCoachMemories,
  synthesizeCoachMemories,
  extractCoachDnaSignals,
  buildCoachDnaProfile,
  buildDecisionExplanation,
  scoreDecisionAlignment,
  buildDecisionChallenge,
} from '../packages/coach-memory/index.js'

// ── real services (M110–M117) for the happy path ─────────────────────────────────────

const mem = (over = {}) => normalizeCoachMemoryEntry({
  id: 'm', coachId: 'c', clubId: 'club', type: 'selection-preference', statement: 's', source: 'manual',
  confidence: 0.8, weight: 0.7, tags: [], ontologyLinks: [], evidenceRefs: ['e1'], createdAt: '2026-01-01T00:00:00.000Z', ...over,
})

const realServices = (memories) => ({
  memoryProvider: { searchCoachMemory: () => memories },
  retrieveCoachMemories,
  synthesizeCoachMemories,
  extractCoachDnaSignals,
  buildCoachDnaProfile,
  buildDecisionExplanation,
  scoreDecisionAlignment,
  buildDecisionChallenge,
})

const realInput = () => ({
  plan: createCoachMemoryQueryPlan({ sort: 'score', limit: 10 }),   // no type filter → all memories flow through
  decision: { category: 'selection-preference', confidence: 0.8, supportingMemoryIds: ['m1', 'm2'], matchedSignals: ['selection-preference'] },
})

// ── happy path ───────────────────────────────────────────────────────────────────────

test('happy path — returns all seven stages from real M110–M117 services', () => {
  const memories = [mem({ id: 'm1', type: 'selection-preference' }), mem({ id: 'm2', type: 'risk-warning' })]
  const result = runCoachIntelligencePipeline(realInput(), realServices(memories))

  assert.deepEqual(Object.keys(result).sort(), ['alignment', 'challenge', 'explanation', 'memories', 'profile', 'signals', 'synthesis'])
  assert.ok(Array.isArray(result.memories) && result.memories.length === 2)
  assert.equal(typeof result.synthesis.summary, 'string')          // M112
  assert.ok(Array.isArray(result.signals.signals))                 // M113
  assert.equal(result.profile.profileVersion, '1.0')               // M114
  assert.equal(result.explanation.explainable, true)               // M115
  assert.equal(typeof result.alignment.alignmentTier, 'string')    // M116
  assert.equal(typeof result.challenge.challenged, 'boolean')      // M117
})

// ── stub-driven: ordering, injection, validation ─────────────────────────────────────

const stubServices = (calls, overrides = {}) => ({
  memoryProvider: { searchCoachMemory: () => [] },
  retrieveCoachMemories: () => { calls.push('retrieve'); return [] },
  synthesizeCoachMemories: () => { calls.push('synthesize'); return { synthesis: true } },
  extractCoachDnaSignals: () => { calls.push('signals'); return { signals: [] } },
  buildCoachDnaProfile: () => { calls.push('profile'); return { profile: true } },
  buildDecisionExplanation: () => { calls.push('explanation'); return { explanation: true } },
  scoreDecisionAlignment: () => { calls.push('alignment'); return { alignment: true } },
  buildDecisionChallenge: () => { calls.push('challenge'); return { challenge: true } },
  ...overrides,
})

const stubInput = () => ({ plan: { p: 1 }, decision: { d: 1 } })

test('stage ordering — strictly retrieve → synthesize → signals → profile → explanation → alignment → challenge', () => {
  const calls = []
  runCoachIntelligencePipeline(stubInput(), stubServices(calls))
  assert.deepEqual(calls, ['retrieve', 'synthesize', 'signals', 'profile', 'explanation', 'alignment', 'challenge'])
})

test('service injection — pipeline calls the injected services and returns their outputs', () => {
  const calls = []
  const result = runCoachIntelligencePipeline(stubInput(), stubServices(calls))
  assert.deepEqual(result.synthesis, { synthesis: true })
  assert.deepEqual(result.challenge, { challenge: true })
})

test('retrieve receives the plan and the injected memoryProvider', () => {
  let seenPlan, seenProvider
  const provider = { searchCoachMemory: () => [] }
  const services = stubServices([], {
    memoryProvider: provider,
    retrieveCoachMemories: (plan, prov) => { seenPlan = plan; seenProvider = prov; return [] },
  })
  const input = stubInput()
  runCoachIntelligencePipeline(input, services)
  assert.equal(seenPlan, input.plan)
  assert.equal(seenProvider, provider)
})

test('malformed service → TypeError', () => {
  assert.throws(() => runCoachIntelligencePipeline(stubInput(), null), TypeError)
  assert.throws(() => runCoachIntelligencePipeline(stubInput(), {}), TypeError)                                   // missing functions
  const incomplete = stubServices([]); delete incomplete.buildDecisionChallenge
  assert.throws(() => runCoachIntelligencePipeline(stubInput(), incomplete), TypeError)
  const noProvider = stubServices([]); delete noProvider.memoryProvider
  assert.throws(() => runCoachIntelligencePipeline(stubInput(), noProvider), TypeError)
})

test('malformed input → TypeError', () => {
  const s = stubServices([])
  assert.throws(() => runCoachIntelligencePipeline(null, s), TypeError)
  assert.throws(() => runCoachIntelligencePipeline({}, s), TypeError)                       // no plan/decision
  assert.throws(() => runCoachIntelligencePipeline({ plan: {} }, s), TypeError)             // no decision
})

test('malformed stage output → TypeError', () => {
  // memories must be an array
  assert.throws(() => runCoachIntelligencePipeline(stubInput(), stubServices([], { retrieveCoachMemories: () => ({}) })), TypeError)
  // synthesis must be an object
  assert.throws(() => runCoachIntelligencePipeline(stubInput(), stubServices([], { synthesizeCoachMemories: () => null })), TypeError)
  // profile must be an object (not array)
  assert.throws(() => runCoachIntelligencePipeline(stubInput(), stubServices([], { buildCoachDnaProfile: () => [] })), TypeError)
})

// ── determinism / immutability ───────────────────────────────────────────────────────

test('deterministic — identical inputs/services → identical result', () => {
  const memories = [mem({ id: 'm1' }), mem({ id: 'm2', type: 'risk-warning' })]
  assert.deepEqual(
    runCoachIntelligencePipeline(realInput(), realServices(memories)),
    runCoachIntelligencePipeline(realInput(), realServices(memories)),
  )
})

test('result is deeply frozen', () => {
  const result = runCoachIntelligencePipeline(stubInput(), stubServices([]))
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.synthesis) && Object.isFrozen(result.challenge))
  assert.throws(() => { result.memories = [] })
})

test('does not mutate input or services', () => {
  const input = stubInput()
  const calls = []
  const services = stubServices(calls)
  const beforeInput = JSON.stringify(input)
  runCoachIntelligencePipeline(input, services)
  assert.equal(JSON.stringify(input), beforeInput)
  assert.equal(typeof services.retrieveCoachMemories, 'function')   // services intact
})

// ── exports ──────────────────────────────────────────────────────────────────────────

test('exports', () => {
  assert.equal(typeof runCoachIntelligencePipeline, 'function')
})
