/**
 * brain-decision-planner — Boundary → Squad Capstone Harness tests
 *
 * Proves two validated read-only providers compose, via the read boundaries (M170) and the proven
 * pipeline bridge, into a complete match-day squad. Real coach-intelligence engines are injected.
 * Test/proof only: deterministic in-memory fixtures, no networking/persistence/AI/runtime wiring.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runBoundarySquadCapstone } from '../packages/brain-decision-planner/index.js'
import { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline } from '../packages/coach-intelligence/index.js'

const ENGINES = { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline }

const corePlayer = (userId, position) => ({ id: `profile_${userId}`, userId, displayName: userId, position })
const memory = (id, type) => ({ id, coachId: 'coach-demo', clubId: 'boitsfort-rfc', type, statement: `insight ${id}`, source: 'manual', confidence: 0.8, weight: 0.7, tags: [], ontologyLinks: [], evidenceRefs: [], createdAt: `2026-06-0${id.slice(1)}T00:00:00.000Z` })

// 24 players covering every jersey (one starter each, Lock x2) plus depth for bench/reserves
const STARTERS = [
  corePlayer('u_lh', 'Loosehead Prop'), corePlayer('u_hk', 'Hooker'), corePlayer('u_th', 'Tighthead Prop'), corePlayer('u_lk1', 'Lock'), corePlayer('u_lk2', 'Lock'),
  corePlayer('u_bs', 'Blindside Flanker'), corePlayer('u_os', 'Openside Flanker'), corePlayer('u_n8', 'Number 8'), corePlayer('u_sh', 'Scrum-half'), corePlayer('u_fh', 'Fly-half'),
  corePlayer('u_lw', 'Left Wing'), corePlayer('u_ic', 'Inside Centre'), corePlayer('u_oc', 'Outside Centre'), corePlayer('u_rw', 'Right Wing'), corePlayer('u_fb', 'Fullback'),
]
const DEPTH = [corePlayer('d_lh', 'Loosehead Prop'), corePlayer('d_hk', 'Hooker'), corePlayer('d_th', 'Tighthead Prop'), corePlayer('d_lk', 'Lock'), corePlayer('d_n8', 'Number 8'), corePlayer('d_sh', 'Scrum-half'), corePlayer('d_fh', 'Fly-half'), corePlayer('d_fb', 'Fullback'), corePlayer('d_lw', 'Left Wing')]
const PLAYERS = [...STARTERS, ...DEPTH]   // 24
const AVAILABILITY = Object.fromEntries(PLAYERS.map((p) => [p.userId, { response: 'available' }]))
const MEMORIES = [memory('m1', 'selection-preference'), memory('m2', 'selection-preference'), memory('m3', 'selection-preference'), memory('m4', 'tactical-preference')]
const TAGS = { u_sh: { tags: ['reliable'] } }
const FIXTURE = { fixtureId: 'fix_1', opponent: 'Leinster', competition: 'AIL', venue: 'Home', date: '2026-07-05' }
const MATCH = { category: 'selection-preference', confidence: 0.7, matchedSignals: ['form'] }
const IDENTITY = { coachId: 'coach-demo', clubId: 'boitsfort-rfc', tags: [] }

const makeSquadLoader = (over = {}) => ({ getActivePlayers: () => PLAYERS, getAvailabilityResponses: () => AVAILABILITY, getCoachMemories: () => MEMORIES, getPlayerTags: () => TAGS, ...over })
const makeDecisionSource = (over = {}) => ({ getFixtureContext: () => ({ fixture: FIXTURE, match: MATCH }), getCoachIdentity: () => IDENTITY, ...over })
const makeInput = (over = {}) => ({ squadLoader: makeSquadLoader(), decisionPlanSource: makeDecisionSource(), ...over })
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
  const input = makeInput({
    squadLoader: makeSquadLoader({ getActivePlayers: () => { order.push('squad'); return PLAYERS } }),
    decisionPlanSource: makeDecisionSource({ getFixtureContext: () => { order.push('decision'); return { fixture: FIXTURE, match: MATCH } } }),
  })
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
  const before = JSON.stringify({ PLAYERS, AVAILABILITY, MEMORIES, TAGS, FIXTURE, MATCH, IDENTITY })
  run()
  assert.equal(JSON.stringify({ PLAYERS, AVAILABILITY, MEMORIES, TAGS, FIXTURE, MATCH, IDENTITY }), before)
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof runBoundarySquadCapstone, 'function')
})
