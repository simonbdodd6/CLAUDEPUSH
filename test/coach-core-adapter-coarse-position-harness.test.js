/**
 * coach-core-adapter — Coarse-Position End-to-End Harness (DORMANT PROOF)
 *
 * Proves the full adapter + intelligence stack starts from COARSE Core positions ("Flanker",
 * "Wing", "Centre") and still produces a complete match-day squad — validating M142 end-to-end:
 *
 *   Core-shaped players (coarse positions)
 *   → buildSelectionContext (M134)        → candidates (coarse tokens retained)
 *   → resolvePositionAssignments (M142)   → coarse split into specific positions
 *   → buildDecisionPlanContext (M135) → completeIntelligenceInput (M140)  → normalized plan + decision
 *   → inMemoryCoachMemoryAdapter (M132)   → memoryProvider
 *   → assembleIntelligenceServices (M138) → real M110–M117
 *   → runPipelineBridge (M137)            → real M118 → M119 → M131
 *   → match-day squad
 *
 * Test-only proof: no Core, Redis, network, filesystem, clock or randomness. The "specific
 * positions" workaround from the M139 harness is gone — the dataset uses coarse Core positions.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildSelectionContext, resolvePositionAssignments, buildDecisionPlanContext, completeIntelligenceInput,
  assembleIntelligenceServices, inMemoryCoachMemoryAdapter, fieldConfidenceProvider, runPipelineBridge,
} from '../packages/coach-core-adapter/index.js'
import {
  runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline,
} from '../packages/coach-intelligence/index.js'

const player = (userId, corePosition, form) => ({ id: `profile_${userId}`, userId, displayName: userId, position: corePosition, form })

function makeData() {
  const players = [
    // coarse Core positions (exactly two each → fills both family slots, no leftovers)
    player('fl1', 'Flanker', 0.85), player('fl2', 'Flanker', 0.83),
    player('wg1', 'Wing', 0.82), player('wg2', 'Wing', 0.80),
    player('ce1', 'Centre', 0.81), player('ce2', 'Centre', 0.79),
    // specific positions + depth
    player('lh1', 'Loosehead Prop', 0.88), player('lh2', 'Loosehead Prop', 0.62), player('lh3', 'Loosehead Prop', 0.55),
    player('hk1', 'Hooker', 0.86), player('hk2', 'Hooker', 0.58),
    player('th1', 'Tighthead Prop', 0.84), player('th2', 'Tighthead Prop', 0.57),
    player('lk1', 'Lock', 0.83), player('lk2', 'Lock', 0.80), player('lk3', 'Lock', 0.60), player('lk4', 'Lock', 0.54),
    player('n81', 'Number 8', 0.82), player('n82', 'Number 8', 0.56),
    player('sh1', 'Scrum-half', 0.87), player('sh2', 'Scrum-half', 0.55),
    player('fh1', 'Fly-half', 0.89), player('fh2', 'Fly-half', 0.59),
    player('fb1', 'Fullback', 0.81), player('fb2', 'Fullback', 0.58),
  ]   // 25 players

  const availabilityResponses = {}
  for (const p of players) availabilityResponses[p.userId] = { response: 'available' }
  availabilityResponses.lk4 = { response: 'unavailable' }   // 24 eligible → XV + bench + reserves

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

function runChain(data) {
  const confidenceProvider = fieldConfidenceProvider('form', 0.5)

  // selection side: coarse candidates → M142 assignment to specific positions
  const selectionContext = buildSelectionContext({ players: data.players, availabilityResponses: data.availabilityResponses, confidenceProvider })
  const resolved = resolvePositionAssignments(selectionContext.candidates, selectionContext.formation)

  // intelligence side: M135 → M140 (normalized plan + completed decision)
  const decisionPlanContext = buildDecisionPlanContext({ fixture: data.fixture, match: data.match, coachContext: data.coachContext })
  const completed = completeIntelligenceInput(decisionPlanContext, { supportingMemoryIds: data.memories.map((m) => m.id) })

  const memoryProvider = inMemoryCoachMemoryAdapter(data.memories)
  const intelligenceServices = assembleIntelligenceServices(memoryProvider)

  const pipelineInput = {
    candidates: resolved.assignments,                 // assigned (specific) candidates from M142
    formation: selectionContext.formation,
    positionGroups: {},                               // no coverage groups needed — positions are specific now
    plan: completed.plan,
    decision: completed.decision,
    memoryProvider,
    intelligenceServices,
    squadOptions: { limit: 30 },
  }

  const bridge = runPipelineBridge(pipelineInput, { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline })

  return { selectionContext, resolved, completed, bridge }
}

// ── proof ─────────────────────────────────────────────────────────────────────────────

test('coarse Core positions are assigned to specific positions and build a full squad', () => {
  const { resolved, bridge } = runChain(makeData())

  // M142: no coarse positions remain, nothing unresolved (exactly two of each family)
  const coarse = new Set(['Flanker', 'Wing', 'Centre'])
  assert.ok(resolved.assignments.every((a) => !coarse.has(a.position)))
  assert.equal(resolved.unresolved.length, 0)
  const posOf = (id) => resolved.assignments.find((a) => a.playerId === id).position
  assert.deepEqual([posOf('fl1'), posOf('fl2')], ['Blindside', 'Openside'])
  assert.deepEqual([posOf('wg1'), posOf('wg2')], ['LeftWing', 'RightWing'])
  assert.deepEqual([posOf('ce1'), posOf('ce2')], ['InsideCentre', 'OutsideCentre'])

  // real intelligence + selection outputs
  assert.ok(bridge.pipelineResult && typeof bridge.pipelineResult.alignment.alignmentScore === 'number')
  assert.ok(bridge.recommendation && typeof bridge.recommendation.action === 'string')

  const squad = bridge.result
  assert.ok(squad && typeof squad === 'object')
  assert.equal(squad.startingXV.length, 15)
  assert.equal(squad.startingXV.filter((s) => s.status === 'filled').length, 15)   // complete XV from coarse data
  assert.ok(Array.isArray(squad.bench) && squad.bench.length >= 1)
  assert.ok(Array.isArray(squad.reserves) && squad.reserves.length >= 1)
})

test('does not mutate the original Core-shaped input', () => {
  const data = makeData()
  const before = JSON.stringify({ players: data.players, availabilityResponses: data.availabilityResponses, memories: data.memories, fixture: data.fixture, match: data.match, coachContext: data.coachContext })
  runChain(data)
  const after = JSON.stringify({ players: data.players, availabilityResponses: data.availabilityResponses, memories: data.memories, fixture: data.fixture, match: data.match, coachContext: data.coachContext })
  assert.equal(after, before)
})

test('repeated runs are deterministic (no clock / randomness / external state)', () => {
  const a = runChain(makeData())
  const b = runChain(makeData())
  assert.deepEqual(a.resolved, b.resolved)
  assert.deepEqual(a.bridge.result, b.bridge.result)
  assert.deepEqual(a.bridge.pipelineResult, b.bridge.pipelineResult)
})
