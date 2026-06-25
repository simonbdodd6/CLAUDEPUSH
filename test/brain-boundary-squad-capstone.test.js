/**
 * brain-decision-planner — Boundary → Squad Capstone Harness tests
 *
 * Proves two validated read-only providers compose, via the read boundaries (M170) and the proven
 * pipeline bridge, into a complete match-day squad. Providers come from the shared canonical
 * regression fixtures; real coach-intelligence engines are injected. Test/proof only: deterministic
 * in-memory fixtures, no networking/persistence/AI/runtime wiring.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runBoundarySquadCapstone } from '../packages/brain-decision-planner/index.js'
import { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline } from '../packages/coach-intelligence/index.js'
import { createFullSquadScenario } from './fixtures/brain-regression-fixtures.js'

const ENGINES = { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline }

const baseInput = () => { const s = createFullSquadScenario(); return { squadLoader: s.squadLoader, decisionPlanSource: s.decisionPlanSource } }
const makeInput = (over = {}) => ({ ...baseInput(), ...over })
const run = (input = makeInput()) => runBoundarySquadCapstone(input, { pipelineServices: ENGINES })

// ── complete squad ───────────────────────────────────────────────────────────────────

test('valid providers produce a complete squad-style output', () => {
  const out = run()
  assert.equal(out.brainInputs.squadInput.players.length, 24)
  assert.equal(out.candidates.length, 24)
  assert.equal(Object.keys(out.formation).length, 15)
  const squad = out.squad
  assert.equal(squad.startingXV.length, 15)
  assert.equal(squad.startingXV.filter((s) => s.status === 'filled').length, 15)
  assert.ok(squad.bench.length >= 1 && squad.reserves.length >= 1)
  assert.ok('captain' in squad && 'signOff' in squad && 'risk' in squad)
})

// ── failures propagate ───────────────────────────────────────────────────────────────

test('buildBrainInputs failure propagates (malformed input)', () => {
  assert.throws(() => runBoundarySquadCapstone(null, { pipelineServices: ENGINES }), TypeError)
  assert.throws(() => runBoundarySquadCapstone({}, { pipelineServices: ENGINES }), TypeError)
})

test('squad-side failure propagates (invalid squadLoader)', () => {
  assert.throws(() => run(makeInput({ squadLoader: {} })), TypeError)
})

test('decision-side failure propagates (invalid decisionPlanSource)', () => {
  assert.throws(() => run(makeInput({ decisionPlanSource: { getFixtureContext: () => ({}) } })), /getCoachIdentity/)
})

test('missing pipelineServices is rejected', () => {
  assert.throws(() => runBoundarySquadCapstone(makeInput(), {}), TypeError)
  assert.throws(() => runBoundarySquadCapstone(makeInput(), []), TypeError)
})

// ── call order (boundary: squad before decision) ─────────────────────────────────────

test('the squad boundary is read before the decision boundary', () => {
  const order = []
  const s = createFullSquadScenario()
  const input = {
    squadLoader: { ...s.squadLoader, getActivePlayers: () => { order.push('squad'); return s.squadLoader.getActivePlayers() } },
    decisionPlanSource: { ...s.decisionPlanSource, getFixtureContext: () => { order.push('decision'); return s.decisionPlanSource.getFixtureContext() } },
  }
  runBoundarySquadCapstone(input, { pipelineServices: ENGINES })
  assert.ok(order.indexOf('squad') !== -1 && order.indexOf('squad') < order.indexOf('decision'))
})

// ── determinism / frozen / no mutation ───────────────────────────────────────────────

test('deterministic — repeated runs are identical', () => {
  assert.deepEqual(run().squad, run().squad)
})

test('output is deeply frozen', () => {
  const out = run()
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.brainInputs) && Object.isFrozen(out.candidates) &&
    Object.isFrozen(out.formation) && Object.isFrozen(out.squad))
  assert.throws(() => out.candidates.push({}))
})

test('does not mutate the provider data', () => {
  const s = createFullSquadScenario()
  const snapshot = () => JSON.stringify({
    players: s.squadLoader.getActivePlayers(),
    availability: s.squadLoader.getAvailabilityResponses(),
    memories: s.squadLoader.getCoachMemories(),
    tags: s.squadLoader.getPlayerTags(),
    fixture: s.decisionPlanSource.getFixtureContext(),
    identity: s.decisionPlanSource.getCoachIdentity(),
  })
  const before = snapshot()
  runBoundarySquadCapstone({ squadLoader: s.squadLoader, decisionPlanSource: s.decisionPlanSource }, { pipelineServices: ENGINES })
  assert.equal(snapshot(), before)
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof runBoundarySquadCapstone, 'function')
})
