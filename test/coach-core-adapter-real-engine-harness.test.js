/**
 * coach-core-adapter — End-to-End Real-Engine Harness (DORMANT PROOF)
 *
 * Proves the full adapter + intelligence chain runs on REAL implementations (not stubs):
 *
 *   Core-shaped input
 *   → buildSelectionContext (M134)       → candidates + formation
 *   → buildDecisionPlanContext (M135)    → plan (request) + decision
 *   → createCoachMemoryQueryPlan (M109)  → normalized plan for M118/M110
 *   → inMemoryCoachMemoryAdapter (M132)  → memoryProvider
 *   → assembleIntelligenceServices (M138)→ real M110–M117 bundle
 *   → runPipelineBridge (M137)           → real M118 → M119 → M131
 *   → match-day squad
 *
 * This is a proof/wiring test only: no Core, Redis, network, filesystem, clock or randomness.
 *
 * Two real integration gaps are bridged INLINE here (no new helper added — see report):
 *   (1) M118's M115 stage needs decision.supportingMemoryIds, which M135 does not emit.
 *   (2) M133 positionGroups (coverage, many-to-many) are incompatible with M122 (assignment,
 *       one-to-one), so the pipeline is given specific positions + empty positionGroups.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildSelectionContext, buildDecisionPlanContext, runPipelineBridge,
  assembleIntelligenceServices, inMemoryCoachMemoryAdapter, fieldConfidenceProvider,
} from '../packages/coach-core-adapter/index.js'
import { createCoachMemoryQueryPlan } from '../packages/coach-memory/index.js'
import {
  runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline,
} from '../packages/coach-intelligence/index.js'

// ── small realistic dataset (built fresh each call to avoid shared mutation) ───────────

const player = (userId, corePosition, form) => ({ id: `profile_${userId}`, userId, displayName: userId, position: corePosition, form })

function makeData() {
  const players = [
    player('u01', 'Loosehead Prop', 0.90), player('u02', 'Hooker', 0.88), player('u03', 'Tighthead Prop', 0.86),
    player('u04', 'Lock', 0.85), player('u05', 'Lock', 0.80), player('u06', 'Blindside Flanker', 0.83),
    player('u07', 'Openside Flanker', 0.84), player('u08', 'Number 8', 0.82), player('u09', 'Scrum-half', 0.89),
    player('u10', 'Fly-half', 0.91), player('u11', 'Left Wing', 0.78), player('u12', 'Inside Centre', 0.79),
    player('u13', 'Outside Centre', 0.77), player('u14', 'Right Wing', 0.76), player('u15', 'Fullback', 0.81),
    // bench-depth (available)
    player('u16', 'Loosehead Prop', 0.60), player('u17', 'Lock', 0.62), player('u18', 'Scrum-half', 0.55), player('u19', 'Hooker', 0.58),
    // unavailable / maybe
    player('u20', 'Fly-half', 0.70), player('u21', 'Fullback', 0.68), player('u22', 'Outside Centre', 0.66),
  ]

  const availabilityResponses = {}
  for (const p of players) availabilityResponses[p.userId] = { response: 'available' }
  availabilityResponses.u20 = { response: 'unavailable' }
  availabilityResponses.u21 = { response: 'maybe' }      // → unavailable (default policy)
  availabilityResponses.u22 = { response: 'unavailable' }

  const memory = (id, type, createdAt) => ({
    id, coachId: 'coach-demo', clubId: 'boitsfort-rfc', type, statement: `insight ${id}`, source: 'manual',
    confidence: 0.75, weight: 0.65, tags: [], ontologyLinks: [], evidenceRefs: [], createdAt,
  })
  const memories = [
    memory('m1', 'selection-preference', '2026-06-01T00:00:00.000Z'),
    memory('m2', 'tactical-preference', '2026-06-02T00:00:00.000Z'),
    memory('m3', 'learned-pattern', '2026-06-03T00:00:00.000Z'),
    memory('m4', 'risk-warning', '2026-06-04T00:00:00.000Z'),
  ]

  const fixture = { fixtureId: 'fix_1', opponent: 'Leinster', competition: 'AIL', venue: 'Home', date: '2026-07-05' }
  const match = { category: 'selection-preference', confidence: 0.7, matchedSignals: ['selection-preference'] }
  const coachContext = { coachId: 'coach-demo', clubId: 'boitsfort-rfc', tags: [] }

  return { players, availabilityResponses, memories, fixture, match, coachContext }
}

// ── the full real-engine chain ────────────────────────────────────────────────────────

function runChain(data) {
  const confidenceProvider = fieldConfidenceProvider('form', 0.5)

  // selection side (M134) + intelligence side (M135)
  const selectionContext = buildSelectionContext({ players: data.players, availabilityResponses: data.availabilityResponses, confidenceProvider })
  const decisionPlanContext = buildDecisionPlanContext({ fixture: data.fixture, match: data.match, coachContext: data.coachContext })

  // (1) normalize the M135 request plan into the M109 plan M118/M110 consume
  const plan = createCoachMemoryQueryPlan(decisionPlanContext.plan)
  // (1b) complete the decision for M118's M115 stage (needs supportingMemoryIds)
  const decision = { ...decisionPlanContext.decision, supportingMemoryIds: data.memories.map((m) => m.id) }

  // real memory provider + real M110–M117 services
  const memoryProvider = inMemoryCoachMemoryAdapter(data.memories)
  const intelligenceServices = assembleIntelligenceServices(memoryProvider)

  const pipelineInput = {
    candidates: selectionContext.candidates,
    formation: selectionContext.formation,
    positionGroups: {},   // (2) M122 wants one-to-one groups; adapter coverage groups are incompatible
    plan,
    decision,
    memoryProvider,
    intelligenceServices,
  }

  // real M118 → M119 → M131 via the bridge
  const bridge = runPipelineBridge(pipelineInput, { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline })

  return { selectionContext, decisionPlanContext, bridge }
}

// ── proof ─────────────────────────────────────────────────────────────────────────────

test('Core-shaped input flows through the REAL engines to a match-day squad', () => {
  const { selectionContext, decisionPlanContext, bridge } = runChain(makeData())

  // adapter outputs
  assert.ok(selectionContext.candidates.length >= 20)
  assert.ok(decisionPlanContext.plan && Array.isArray(decisionPlanContext.plan.types))
  assert.ok(decisionPlanContext.decision && typeof decisionPlanContext.decision.category === 'string')

  // intelligence outputs (real M118 + M119)
  assert.ok(bridge.pipelineResult && typeof bridge.pipelineResult.alignment.alignmentScore === 'number')
  assert.equal(bridge.pipelineResult.memories.length, 4)              // all four memories retrieved
  assert.ok(bridge.recommendation && typeof bridge.recommendation.action === 'string')

  // final selection output (real M131 → M130 squad)
  const squad = bridge.result
  assert.ok(squad && typeof squad === 'object')
  assert.equal(squad.startingXV.length, 15)
  assert.equal(squad.startingXV.filter((s) => s.status === 'filled').length, 15)   // complete XV
  // bench/reserves are exposed (arrays). They are empty here because M121's default limit (15)
  // caps the ranked pool to exactly the XV, and the M137 bridge does not forward squadOptions.
  assert.ok(Array.isArray(squad.bench))
  assert.ok(Array.isArray(squad.reserves))
  assert.ok('captain' in squad && 'viceCaptain' in squad && 'signOff' in squad && 'risk' in squad)
})

test('the chain mutates none of its Core-shaped inputs', () => {
  const data = makeData()
  const before = JSON.stringify({ players: data.players, availabilityResponses: data.availabilityResponses, memories: data.memories, fixture: data.fixture, match: data.match, coachContext: data.coachContext })
  runChain(data)
  const after = JSON.stringify({ players: data.players, availabilityResponses: data.availabilityResponses, memories: data.memories, fixture: data.fixture, match: data.match, coachContext: data.coachContext })
  assert.equal(after, before)
})

test('repeated runs are deterministic (no clock / randomness / external state)', () => {
  const a = runChain(makeData())
  const b = runChain(makeData())
  assert.deepEqual(a.bridge.result, b.bridge.result)
  assert.deepEqual(a.bridge.pipelineResult, b.bridge.pipelineResult)
  assert.deepEqual(a.bridge.recommendation, b.bridge.recommendation)
})
