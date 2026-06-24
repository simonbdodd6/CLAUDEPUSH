/**
 * coach-core-adapter — DNA-Influenced Selection Harness (DORMANT PROOF)
 *
 * Proves the full pipeline can use availability confidence (M145) + player DNA signals (M153)
 * + DNA influence (M152) to deterministically alter ranking order, end-to-end through the real
 * intelligence + selection engines:
 *
 *   players
 *   → M145 baseline confidence  ┐
 *   → M153 derivePlayerDnaSignals├─ composed into a DNA-influenced confidence provider
 *   → M152 applyPlayerDnaInfluence┘
 *   → M134 buildSelectionContext
 *   → M140 completeIntelligenceInput → M138 assembleIntelligenceServices
 *   → M137 runPipelineBridge → real M118 → M119 → M131
 *
 * Two ScrumHalves share an identical availability baseline (0.6); DNA tags break the tie: a
 * "reliable" player aligns with the coach's selection-preference (boost), a "reckless" player
 * conflicts with risk-warning (penalty) — flipping who starts jersey 9. Test/proof only: no
 * Core, Redis, network, filesystem, clock or randomness.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildSelectionContext, completeIntelligenceInput, assembleIntelligenceServices, inMemoryCoachMemoryAdapter,
  runPipelineBridge, createBaselineConfidenceProvider, derivePlayerDnaSignals, applyPlayerDnaInfluence,
} from '../packages/coach-core-adapter/index.js'
import { buildDecisionPlanContext } from '../packages/coach-core-adapter/index.js'
import {
  runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline,
} from '../packages/coach-intelligence/index.js'

const player = (userId, position) => ({ id: `profile_${userId}`, userId, displayName: userId, position })
const ALL3 = ['available', 'available', 'available']                                   // base 1.0
const DEPTH = ['available', 'unavailable']                                             // base 0.5
const SH = ['available', 'available', 'available', 'unavailable', 'unavailable']       // base 0.6

function makeData() {
  const starters = [
    player('lh1', 'LH'), player('hk1', 'Hooker'), player('th1', 'TH'), player('lk1', 'Lock'), player('lk2', 'Lock'),
    player('bs1', 'Blindside'), player('os1', 'Openside'), player('n81', 'Number8'), player('fh1', 'FlyHalf'),
    player('lw1', 'LeftWing'), player('ic1', 'InsideCentre'), player('oc1', 'OutsideCentre'), player('rw1', 'RightWing'), player('fb1', 'Fullback'),
  ]
  const depth = [player('lh2', 'LH'), player('hk2', 'Hooker'), player('th2', 'TH'), player('lk3', 'Lock'),
    player('n82', 'Number8'), player('fh2', 'FlyHalf'), player('fb2', 'Fullback'), player('lw2', 'LeftWing')]
  const scrumHalves = [player('sh_a', 'ScrumHalf'), player('sh_b', 'ScrumHalf')]   // sh_a reckless, sh_b reliable
  const players = [...starters, ...depth, ...scrumHalves]   // 24, all available below

  const availabilityResponses = {}
  const historyByPlayer = {}
  for (const p of starters) { availabilityResponses[p.userId] = { response: 'available' }; historyByPlayer[p.userId] = ALL3 }
  for (const p of depth) { availabilityResponses[p.userId] = { response: 'available' }; historyByPlayer[p.userId] = DEPTH }
  for (const p of scrumHalves) { availabilityResponses[p.userId] = { response: 'available' }; historyByPlayer[p.userId] = SH }

  const dnaProfiles = { sh_b: { tags: ['reliable'] }, sh_a: { tags: ['reckless'] } }
  const mappings = { tags: { reliable: { category: 'selection-preference', weight: 1 }, reckless: { category: 'risk-warning', weight: -1 } } }
  // hand-authored coach DNA profile (in a wired flow this is the M114 profile from the memories)
  const coachDnaProfile = {
    profileVersion: '1.0',
    dominantSignals: [{ category: 'selection-preference', strength: 0.9 }, { category: 'risk-warning', strength: 0.8 }],
    balance: {}, confidence: 0.5, metadata: {},
  }

  const memory = (id, type, createdAt) => ({ id, coachId: 'coach-demo', clubId: 'boitsfort-rfc', type, statement: `insight ${id}`, source: 'manual', confidence: 0.75, weight: 0.65, tags: [], ontologyLinks: [], evidenceRefs: [], createdAt })
  const memories = [
    memory('m1', 'selection-preference', '2026-06-01T00:00:00.000Z'), memory('m2', 'tactical-preference', '2026-06-02T00:00:00.000Z'),
    memory('m3', 'learned-pattern', '2026-06-03T00:00:00.000Z'), memory('m4', 'risk-warning', '2026-06-04T00:00:00.000Z'),
  ]
  const fixture = { fixtureId: 'fix_1', opponent: 'Leinster', competition: 'AIL', venue: 'Home', date: '2026-07-05' }
  const match = { category: 'selection-preference', confidence: 0.7, matchedSignals: ['selection-preference'] }
  const coachContext = { coachId: 'coach-demo', clubId: 'boitsfort-rfc', tags: [] }

  return { players, availabilityResponses, historyByPlayer, dnaProfiles, mappings, coachDnaProfile, memories, fixture, match, coachContext }
}

// M145 + M153 + M152 composed into one confidence provider
function dnaConfidenceProvider(data, enabled) {
  const baseline = createBaselineConfidenceProvider(data.historyByPlayer)   // M145
  return {
    getConfidence(p) {
      const base = baseline.getConfidence(p)
      const profile = { playerId: p.userId, ...(data.dnaProfiles[p.userId] || {}) }
      const { dnaSignals } = derivePlayerDnaSignals(profile, { mappings: data.mappings })   // M153
      return applyPlayerDnaInfluence({ playerId: p.userId, confidence: base, dnaSignals }, data.coachDnaProfile, { enabled }).finalConfidence   // M152
    },
  }
}

function runChain(data, enabled) {
  const selectionContext = buildSelectionContext({ players: data.players, availabilityResponses: data.availabilityResponses, confidenceProvider: dnaConfidenceProvider(data, enabled) })
  const completed = completeIntelligenceInput(buildDecisionPlanContext({ fixture: data.fixture, match: data.match, coachContext: data.coachContext }), { supportingMemoryIds: data.memories.map((m) => m.id) })
  const memoryProvider = inMemoryCoachMemoryAdapter(data.memories)
  const bridge = runPipelineBridge({
    candidates: selectionContext.candidates, formation: selectionContext.formation, positionGroups: {},
    plan: completed.plan, decision: completed.decision, memoryProvider, intelligenceServices: assembleIntelligenceServices(memoryProvider),
    squadOptions: { limit: 30 },
  }, { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline })
  return { selectionContext, squad: bridge.result }
}

const confOf = (ctx, id) => ctx.candidates.find((c) => c.playerId === id).confidence
const jersey9 = (squad) => squad.startingXV.find((s) => s.jersey === '9').player.playerId

// ── DNA direction (assertions 1 & 2) ─────────────────────────────────────────────────

test('DNA positively influences matching players and negatively influences conflicting ones', () => {
  const data = makeData()
  const on = runChain(data, true).selectionContext
  const off = runChain(data, false).selectionContext
  assert.equal(confOf(off, 'sh_a'), 0.6)              // disabled → pure availability baseline
  assert.equal(confOf(off, 'sh_b'), 0.6)
  assert.ok(confOf(on, 'sh_b') > 0.6)                 // reliable boosted (selection-preference aligns)
  assert.ok(confOf(on, 'sh_a') < 0.6)                 // reckless penalised (risk-warning conflicts)
})

// ── ranking change (assertions 3 & 4) ────────────────────────────────────────────────

test('ranking order changes with DNA enabled and is unchanged when disabled', () => {
  const data = makeData()
  const on = runChain(data, true).squad
  const off = runChain(data, false).squad
  assert.equal(jersey9(off), 'sh_a')                  // disabled: tie (0.6) → playerId asc
  assert.equal(jersey9(on), 'sh_b')                   // enabled: reliable (0.78) outranks reckless (0.44)
  assert.notEqual(jersey9(on), jersey9(off))          // DNA altered the selection
})

// ── squad still complete (assertions 5 & 6) ──────────────────────────────────────────

test('a complete XV plus bench and reserves are still produced', () => {
  for (const enabled of [true, false]) {
    const squad = runChain(makeData(), enabled).squad
    assert.equal(squad.startingXV.length, 15)
    assert.equal(squad.startingXV.filter((s) => s.status === 'filled').length, 15)
    assert.ok(squad.bench.length >= 1)
    assert.ok(squad.reserves.length >= 1)
  }
})

// ── determinism / no mutation (assertions 7 & 8) ─────────────────────────────────────

test('repeated runs are deterministic', () => {
  const data = makeData()
  assert.deepEqual(runChain(data, true).squad, runChain(data, true).squad)
})

test('does not mutate the input data', () => {
  const data = makeData()
  const before = JSON.stringify({ players: data.players, availabilityResponses: data.availabilityResponses, historyByPlayer: data.historyByPlayer, dnaProfiles: data.dnaProfiles, coachDnaProfile: data.coachDnaProfile, memories: data.memories })
  runChain(data, true)
  const after = JSON.stringify({ players: data.players, availabilityResponses: data.availabilityResponses, historyByPlayer: data.historyByPlayer, dnaProfiles: data.dnaProfiles, coachDnaProfile: data.coachDnaProfile, memories: data.memories })
  assert.equal(after, before)
})
