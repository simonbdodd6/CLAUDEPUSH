/**
 * brain-decision-planner — Brain Inputs Summary tests
 *
 * Pure summary of M170 brainInputs: full summary, missing squad/decision, missing arrays→0,
 * missing decision fields→null, supportingMemoryIds count, determinism, frozen output, no
 * mutation, malformed input, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { summarizeBrainInputs } from '../packages/brain-decision-planner/index.js'

const fullInputs = () => ({
  squadInput: {
    players: [{ userId: 'u1' }, { userId: 'u2' }],
    availability: { u1: { response: 'available' }, u2: { response: 'available' }, u3: { response: 'maybe' } },
    memories: [{ id: 'm1' }],
    playerTags: { u1: { tags: ['reliable'] } },
  },
  decisionInput: {
    plan: { filters: {}, retrieval: {} },
    decision: { category: 'selection-preference', confidence: 0.7, matchedSignals: ['form'], supportingMemoryIds: ['m1', 'm2'] },
    metadata: {},
  },
})

// ── full summary ─────────────────────────────────────────────────────────────────────

test('full valid brainInputs → complete summary', () => {
  assert.deepEqual(summarizeBrainInputs(fullInputs()), {
    hasSquadInput: true, hasDecisionInput: true,
    playerCount: 2, availabilityCount: 3, memoryCount: 1, playerTagCount: 1,
    hasPlan: true, hasDecision: true,
    decisionCategory: 'selection-preference', confidence: 0.7, supportingMemoryCount: 2,
  })
})

// ── missing sides ────────────────────────────────────────────────────────────────────

test('missing squadInput → squad flags/counts zeroed', () => {
  const s = summarizeBrainInputs({ decisionInput: fullInputs().decisionInput })
  assert.equal(s.hasSquadInput, false)
  assert.equal(s.playerCount, 0)
  assert.equal(s.availabilityCount, 0)
  assert.equal(s.memoryCount, 0)
  assert.equal(s.playerTagCount, 0)
  assert.equal(s.hasDecisionInput, true)
})

test('missing decisionInput → decision flags false / fields null', () => {
  const s = summarizeBrainInputs({ squadInput: fullInputs().squadInput })
  assert.equal(s.hasDecisionInput, false)
  assert.equal(s.hasPlan, false)
  assert.equal(s.hasDecision, false)
  assert.equal(s.decisionCategory, null)
  assert.equal(s.confidence, null)
  assert.equal(s.supportingMemoryCount, 0)
  assert.equal(s.hasSquadInput, true)
})

// ── missing arrays / fields ──────────────────────────────────────────────────────────

test('missing arrays count as 0', () => {
  const s = summarizeBrainInputs({ squadInput: {}, decisionInput: { plan: {}, decision: {} } })
  assert.equal(s.playerCount, 0)
  assert.equal(s.availabilityCount, 0)
  assert.equal(s.memoryCount, 0)
  assert.equal(s.playerTagCount, 0)
  assert.equal(s.supportingMemoryCount, 0)
})

test('missing decision fields return null', () => {
  const s = summarizeBrainInputs({ decisionInput: { plan: {}, decision: {} } })
  assert.equal(s.hasPlan, true)
  assert.equal(s.hasDecision, true)
  assert.equal(s.decisionCategory, null)
  assert.equal(s.confidence, null)
})

test('supportingMemoryIds count', () => {
  const s = summarizeBrainInputs({ decisionInput: { decision: { supportingMemoryIds: ['a', 'b', 'c'] } } })
  assert.equal(s.supportingMemoryCount, 3)
})

// ── frozen / determinism / no mutation ───────────────────────────────────────────────

test('output is deeply frozen', () => {
  const s = summarizeBrainInputs(fullInputs())
  assert.ok(Object.isFrozen(s))
  assert.throws(() => { s.playerCount = 9 })
})

test('deterministic — identical input → identical summary', () => {
  assert.deepEqual(summarizeBrainInputs(fullInputs()), summarizeBrainInputs(fullInputs()))
})

test('does not mutate the input', () => {
  const input = fullInputs()
  const before = JSON.stringify(input)
  summarizeBrainInputs(input)
  assert.equal(JSON.stringify(input), before)
  assert.equal(Object.isFrozen(input.squadInput), false)   // read-only; caller untouched
})

// ── validation / export ──────────────────────────────────────────────────────────────

test('malformed input → TypeError', () => {
  assert.throws(() => summarizeBrainInputs(null), TypeError)
  assert.throws(() => summarizeBrainInputs([]), TypeError)
  assert.throws(() => summarizeBrainInputs('x'), TypeError)
})

test('export exists', () => {
  assert.equal(typeof summarizeBrainInputs, 'function')
})
