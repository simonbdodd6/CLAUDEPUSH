/**
 * brain-decision-planner — Unified Brain Inputs Facade tests
 *
 * Composes M165 (selection boundary) + M169 (decision boundary) into { squadInput, decisionInput }:
 * real-path output, boundary failure propagation, correct call order, each side once, frozen output,
 * determinism, no mutation, malformed input, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildBrainInputs } from '../packages/brain-decision-planner/index.js'

// ── real providers (M164-shaped squad loader + M167-shaped decision plan source) ──────

const PLAYERS = [{ id: 'profile_u1', userId: 'u1', position: 'Hooker' }]
const AVAIL = { u1: { response: 'available' } }
const MEMORIES = [{ id: 'm1', type: 'selection-preference' }]
const TAGS = { u1: { tags: ['reliable'] } }
const FIXTURE = { fixtureId: 'fix_1', opponent: 'Leinster' }
const MATCH = { category: 'selection-preference', confidence: 0.7, matchedSignals: ['form'] }
const IDENTITY = { coachId: 'coach-demo', clubId: 'boitsfort-rfc', tags: [] }

const makeSquadLoader = (over = {}) => ({ getActivePlayers: () => PLAYERS, getAvailabilityResponses: () => AVAIL, getCoachMemories: () => MEMORIES, getPlayerTags: () => TAGS, ...over })
const makeDecisionSource = (over = {}) => ({ getFixtureContext: () => ({ fixture: FIXTURE, match: MATCH }), getCoachIdentity: () => IDENTITY, ...over })
const makeInput = (over = {}) => ({ squadLoader: makeSquadLoader(), decisionPlanSource: makeDecisionSource(), ...over })

// ── real path ────────────────────────────────────────────────────────────────────────

test('valid providers produce { squadInput, decisionInput }', () => {
  const out = buildBrainInputs(makeInput())
  assert.deepEqual(Object.keys(out).sort(), ['decisionInput', 'squadInput'])
  // squadInput is the M165 mapping
  assert.deepEqual(out.squadInput, { players: PLAYERS, availability: AVAIL, memories: MEMORIES, playerTags: TAGS })
  // decisionInput is the completed M140 input
  assert.ok(out.decisionInput.plan.filters && out.decisionInput.plan.retrieval)
  assert.equal(out.decisionInput.decision.category, 'selection-preference')
  assert.ok(Array.isArray(out.decisionInput.decision.supportingMemoryIds))
})

// ── boundary failures ────────────────────────────────────────────────────────────────

test('squad boundary failure propagates (invalid squadLoader)', () => {
  assert.throws(() => buildBrainInputs(makeInput({ squadLoader: {} })), TypeError)
})

test('decision boundary failure propagates (invalid decisionPlanSource)', () => {
  assert.throws(() => buildBrainInputs(makeInput({ decisionPlanSource: { getFixtureContext: () => ({}) } })), /getCoachIdentity/)
})

// ── orchestration (injected boundaries) ──────────────────────────────────────────────

function makeBoundaries(over = {}) {
  const order = []; const calls = { squad: 0, decision: 0 }
  const boundaries = {
    loaderToSelectionInputs: (sl) => { order.push('squad'); calls.squad++; return Object.freeze({ players: [], availability: {}, memories: [], playerTags: {} }) },
    completeDecisionPlanningInput: (dps) => { order.push('decision'); calls.decision++; return Object.freeze({ plan: {}, decision: {}, metadata: {} }) },
    ...over,
  }
  return { boundaries, order, calls }
}

test('boundaries run squad → decision, each exactly once', () => {
  const { boundaries, order, calls } = makeBoundaries()
  buildBrainInputs(makeInput(), boundaries)
  assert.deepEqual(order, ['squad', 'decision'])
  assert.deepEqual(calls, { squad: 1, decision: 1 })
})

test('a squad-side failure stops before the decision side', () => {
  const { boundaries, calls } = makeBoundaries({ loaderToSelectionInputs: () => { throw new Error('squad boom') } })
  assert.throws(() => buildBrainInputs(makeInput(), boundaries), /squad boom/)
  assert.equal(calls.decision, 0)
})

// ── frozen / deterministic / no mutation ─────────────────────────────────────────────

test('output is deeply frozen', () => {
  const out = buildBrainInputs(makeInput())
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.squadInput) && Object.isFrozen(out.decisionInput))
  assert.throws(() => { out.squadInput = null })
})

test('deterministic — identical providers → identical output', () => {
  assert.deepEqual(buildBrainInputs(makeInput()), buildBrainInputs(makeInput()))
})

test('does not mutate the provider data', () => {
  const before = JSON.stringify({ PLAYERS, AVAIL, MEMORIES, TAGS, FIXTURE, MATCH, IDENTITY })
  buildBrainInputs(makeInput())
  assert.equal(JSON.stringify({ PLAYERS, AVAIL, MEMORIES, TAGS, FIXTURE, MATCH, IDENTITY }), before)
})

// ── validation / export ──────────────────────────────────────────────────────────────

test('malformed input / boundaries → TypeError', () => {
  assert.throws(() => buildBrainInputs(null), TypeError)
  assert.throws(() => buildBrainInputs([]), TypeError)
  assert.throws(() => buildBrainInputs(makeInput(), {}), TypeError)
  assert.throws(() => buildBrainInputs(makeInput(), { loaderToSelectionInputs: 5, completeDecisionPlanningInput: () => ({}) }), TypeError)
})

test('export exists', () => {
  assert.equal(typeof buildBrainInputs, 'function')
})
