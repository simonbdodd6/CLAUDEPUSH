/**
 * coach-core-adapter — Intelligence Services Assembler tests
 *
 * Wires the real M110–M117 functions into the M118 services bundle: key set, real-function
 * identity, memoryProvider preservation, single/multiple overrides, validation, never-called
 * guarantees, no mutation, determinism, frozen wrapper, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { assembleIntelligenceServices } from '../packages/coach-core-adapter/index.js'
import {
  retrieveCoachMemories, synthesizeCoachMemories, extractCoachDnaSignals, buildCoachDnaProfile,
  buildDecisionExplanation, scoreDecisionAlignment, buildDecisionChallenge,
} from '../packages/coach-memory/index.js'

const SERVICE_KEYS = [
  'retrieveCoachMemories', 'synthesizeCoachMemories', 'extractCoachDnaSignals', 'buildCoachDnaProfile',
  'buildDecisionExplanation', 'scoreDecisionAlignment', 'buildDecisionChallenge',
]

const provider = () => ({ searchCoachMemory: () => [] })

// ── keys / wiring ────────────────────────────────────────────────────────────────────

test('returns all expected service keys plus memoryProvider', () => {
  const s = assembleIntelligenceServices(provider())
  assert.deepEqual(Object.keys(s).sort(), [...SERVICE_KEYS, 'memoryProvider'].sort())
})

test('wires the real coach-memory functions', () => {
  const s = assembleIntelligenceServices(provider())
  assert.equal(s.retrieveCoachMemories, retrieveCoachMemories)
  assert.equal(s.synthesizeCoachMemories, synthesizeCoachMemories)
  assert.equal(s.extractCoachDnaSignals, extractCoachDnaSignals)
  assert.equal(s.buildCoachDnaProfile, buildCoachDnaProfile)
  assert.equal(s.buildDecisionExplanation, buildDecisionExplanation)
  assert.equal(s.scoreDecisionAlignment, scoreDecisionAlignment)
  assert.equal(s.buildDecisionChallenge, buildDecisionChallenge)
})

test('preserves the memoryProvider reference', () => {
  const mp = provider()
  assert.equal(assembleIntelligenceServices(mp).memoryProvider, mp)
})

// ── overrides ────────────────────────────────────────────────────────────────────────

test('a single service can be overridden', () => {
  const myAlign = () => ({})
  const s = assembleIntelligenceServices(provider(), { scoreDecisionAlignment: myAlign })
  assert.equal(s.scoreDecisionAlignment, myAlign)
  assert.equal(s.retrieveCoachMemories, retrieveCoachMemories)   // others stay real
})

test('multiple services can be overridden', () => {
  const a = () => ({}); const b = () => ({})
  const s = assembleIntelligenceServices(provider(), { retrieveCoachMemories: a, buildDecisionChallenge: b })
  assert.equal(s.retrieveCoachMemories, a)
  assert.equal(s.buildDecisionChallenge, b)
  assert.equal(s.buildCoachDnaProfile, buildCoachDnaProfile)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid memoryProvider → TypeError', () => {
  assert.throws(() => assembleIntelligenceServices(null), TypeError)
  assert.throws(() => assembleIntelligenceServices([]), TypeError)
  assert.throws(() => assembleIntelligenceServices('x'), TypeError)
})

test('invalid overrides → TypeError', () => {
  assert.throws(() => assembleIntelligenceServices(provider(), null), TypeError)
  assert.throws(() => assembleIntelligenceServices(provider(), []), TypeError)
})

test('a non-function override → TypeError', () => {
  assert.throws(() => assembleIntelligenceServices(provider(), { scoreDecisionAlignment: 5 }), TypeError)
  assert.throws(() => assembleIntelligenceServices(provider(), { retrieveCoachMemories: {} }), TypeError)
})

// ── never-called guarantees ──────────────────────────────────────────────────────────

test('does not call any service or the memoryProvider', () => {
  let serviceCalled = false
  let providerCalled = false
  const spy = () => { serviceCalled = true }
  const overrides = Object.fromEntries(SERVICE_KEYS.map((k) => [k, spy]))
  const mp = { searchCoachMemory: () => { providerCalled = true; return [] } }
  assembleIntelligenceServices(mp, overrides)
  assert.equal(serviceCalled, false)
  assert.equal(providerCalled, false)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate inputs', () => {
  const mp = provider()
  const overrides = { scoreDecisionAlignment: () => ({}) }
  const beforeKeys = Object.keys(overrides).join(',')
  assembleIntelligenceServices(mp, overrides)
  assert.equal(Object.keys(overrides).join(','), beforeKeys)
  assert.equal(Object.isFrozen(mp), false)        // memoryProvider untouched
})

test('deterministic — same inputs → equal bundle', () => {
  const mp = provider()
  assert.deepEqual(assembleIntelligenceServices(mp), assembleIntelligenceServices(mp))
})

// ── frozen wrapper ───────────────────────────────────────────────────────────────────

test('the wrapper is frozen but memoryProvider is not', () => {
  const mp = provider()
  const s = assembleIntelligenceServices(mp)
  assert.ok(Object.isFrozen(s))
  assert.equal(Object.isFrozen(s.memoryProvider), false)
  assert.throws(() => { s.retrieveCoachMemories = null })
  assert.throws(() => { s.newKey = 1 })
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof assembleIntelligenceServices, 'function')
})
