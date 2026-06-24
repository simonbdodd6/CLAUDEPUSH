/**
 * coach-core-adapter — DTO → Squad End-to-End Harness (DORMANT PROOF, test-only)
 *
 * Proves realistic Core-shaped data travels the entire chain to a complete match-day squad:
 *
 *   Core players + availability + coach memories + player DNA
 *   → coachDnaProfileFromMemories (M157) + createDnaConfidenceProvider (M155)   [DNA confidence path]
 *   → assembleSelectionInputs (M160)  → SelectionInputs DTO (candidates + formation + DNA profiles)
 *   → runPipelineBridge (M137) → real M118 → M119 → M131  → match-day squad
 *
 * Two ScrumHalves share a 0.6 availability baseline; the coach's memory-derived DNA boosts the
 * "reliable" one and penalises the "reckless" one, flipping who starts jersey 9 — proving the
 * DNA-influenced confidence survives into selection. Test/proof only: no runtime change, no Core
 * change, no Brain-engine change, no AI generation, no networking, no storage.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  assembleSelectionInputs, assembleCandidates, resolveFormationFromCandidates, coachDnaProfileFromMemories,
  derivePlayerDnaSignals, createDnaConfidenceProvider, buildDecisionPlanContext, completeIntelligenceInput,
  assembleIntelligenceServices, inMemoryCoachMemoryAdapter, runPipelineBridge,
} from '../packages/coach-core-adapter/index.js'
import { extractCoachDnaSignals, buildCoachDnaProfile } from '../packages/coach-memory/index.js'
import { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline } from '../packages/coach-intelligence/index.js'

const ENGINES = { extractCoachDnaSignals, buildCoachDnaProfile }
const ALL3 = ['available', 'available', 'available']                                   // baseline 1.0
const DEPTH = ['available', 'unavailable']                                             // baseline 0.5
const SH = ['available', 'available', 'available', 'unavailable', 'unavailable']       // baseline 0.6
const MAPPINGS = { tags: { reliable: { category: 'selection-preference', weight: 1 }, reckless: { category: 'risk-warning', weight: -1 } } }

const player = (userId, position) => ({ id: `profile_${userId}`, userId, displayName: userId, position })
const memory = (id, type, createdAt) => ({ id, coachId: 'coach-demo', clubId: 'boitsfort-rfc', type, statement: `insight ${id}`, source: 'manual', confidence: 0.8, weight: 0.7, tags: [], ontologyLinks: [], evidenceRefs: [], createdAt })

function makeData() {
  const starters = [
    player('u_lh', 'Loosehead Prop'), player('u_hk', 'Hooker'), player('u_th', 'Tighthead Prop'), player('u_lk1', 'Lock'), player('u_lk2', 'Lock'),
    player('u_bs', 'Blindside Flanker'), player('u_os', 'Openside Flanker'), player('u_n8', 'Number 8'), player('u_fh', 'Fly-half'),
    player('u_lw', 'Left Wing'), player('u_ic', 'Inside Centre'), player('u_oc', 'Outside Centre'), player('u_rw', 'Right Wing'), player('u_fb', 'Fullback'),
  ]
  const depth = [player('d_lh', 'Loosehead Prop'), player('d_hk', 'Hooker'), player('d_th', 'Tighthead Prop'), player('d_lk', 'Lock'),
    player('d_n8', 'Number 8'), player('d_fh', 'Fly-half'), player('d_fb', 'Fullback'), player('d_lw', 'Left Wing')]
  const scrumHalves = [player('sh_a', 'Scrum-half'), player('sh_b', 'Scrum-half')]   // sh_a reckless, sh_b reliable
  const players = [...starters, ...depth, ...scrumHalves]   // 24

  const availability = {}; const historyByPlayer = {}
  for (const p of starters) { availability[p.userId] = { response: 'available' }; historyByPlayer[p.userId] = ALL3 }
  for (const p of depth) { availability[p.userId] = { response: 'available' }; historyByPlayer[p.userId] = DEPTH }
  for (const p of scrumHalves) { availability[p.userId] = { response: 'available' }; historyByPlayer[p.userId] = SH }

  return {
    players, availability, historyByPlayer,
    dnaProfiles: { sh_b: { tags: ['reliable'] }, sh_a: { tags: ['reckless'] } },
    mappings: MAPPINGS,
    memories: [memory('m1', 'selection-preference', '2026-06-01T00:00:00.000Z'), memory('m2', 'selection-preference', '2026-06-02T00:00:00.000Z'), memory('m3', 'selection-preference', '2026-06-03T00:00:00.000Z'), memory('m4', 'risk-warning', '2026-06-04T00:00:00.000Z')],
    fixture: { fixtureId: 'fix_1', opponent: 'Leinster', competition: 'AIL', venue: 'Home', date: '2026-07-05' },
    match: { category: 'selection-preference', confidence: 0.7, matchedSignals: ['selection-preference'] },
    coachContext: { coachId: 'coach-demo', clubId: 'boitsfort-rfc', tags: [] },
  }
}

function runChain(data, enabled) {
  const coachDnaProfile = coachDnaProfileFromMemories(data.memories, ENGINES)   // M157
  const confidenceProvider = createDnaConfidenceProvider({ historyByPlayer: data.historyByPlayer, dnaProfiles: data.dnaProfiles, mappings: data.mappings, coachDnaProfile, enabled })   // M155

  const input = {
    players: data.players, availability: data.availability, coachMemories: data.memories,
    candidateRecords: data.players.map((p) => ({ player: { userId: p.userId, position: p.position }, availabilityResponse: data.availability[p.userId] })),
    confidenceProvider, dnaProfiles: data.dnaProfiles, mappings: data.mappings,
  }
  const services = {
    buildCandidates: (i) => assembleCandidates(i.candidateRecords, i.confidenceProvider),                                   // M132 (DNA-influenced confidence)
    buildFormation: (i, candidates) => resolveFormationFromCandidates(candidates).formation,                                // M133
    buildCoachDnaProfile: (i) => coachDnaProfileFromMemories(i.coachMemories, ENGINES),                                     // M157
    buildPlayerDnaProfiles: (i) => Object.fromEntries(data.players.map((p) => [p.userId, derivePlayerDnaSignals({ playerId: p.userId, ...(i.dnaProfiles[p.userId] || {}) }, { mappings: i.mappings }).dnaSignals])),   // M153
  }
  const dto = assembleSelectionInputs(input, services)   // M160

  const completed = completeIntelligenceInput(buildDecisionPlanContext({ fixture: data.fixture, match: data.match, coachContext: data.coachContext }), { supportingMemoryIds: data.memories.map((m) => m.id) })
  const memoryProvider = inMemoryCoachMemoryAdapter(data.memories)
  const bridge = runPipelineBridge({
    candidates: dto.candidates, formation: dto.formation, positionGroups: {},
    plan: completed.plan, decision: completed.decision, memoryProvider, intelligenceServices: assembleIntelligenceServices(memoryProvider),
    squadOptions: { limit: 30 },
  }, { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline })

  return { dto, squad: bridge.result }
}

const confOf = (dto, id) => dto.candidates.find((c) => c.playerId === id).confidence
const jersey9 = (squad) => squad.startingXV.find((s) => s.jersey === '9').player.playerId

// ── complete squad + DNA-influenced confidence ───────────────────────────────────────

test('Core data → DTO → bridge produces a complete match-day squad with DNA-influenced candidates', () => {
  const { dto, squad } = runChain(makeData(), true)

  // DTO populated
  assert.equal(dto.candidates.length, 24)
  assert.equal(Object.keys(dto.formation).length, 15)
  assert.equal(dto.coachDnaProfile.dominantSignals[0].category, 'selection-preference')
  assert.deepEqual(dto.playerDnaProfiles.sh_b, [{ category: 'selection-preference', weight: 1 }])

  // DNA-influenced confidence carried into the candidates (M155 → M152)
  assert.ok(confOf(dto, 'sh_b') > 0.6)   // reliable boosted
  assert.ok(confOf(dto, 'sh_a') < 0.6)   // reckless penalised

  // complete squad
  assert.equal(squad.startingXV.length, 15)
  assert.equal(squad.startingXV.filter((s) => s.status === 'filled').length, 15)
  assert.ok(squad.bench.length >= 1 && squad.reserves.length >= 1)
})

// ── DNA survives into selection ──────────────────────────────────────────────────────

test('the DNA-influenced confidence flips who starts jersey 9', () => {
  const data = makeData()
  assert.equal(jersey9(runChain(data, false).squad), 'sh_a')   // DNA off: tie (0.6) → playerId asc
  assert.equal(jersey9(runChain(data, true).squad), 'sh_b')    // DNA on: reliable outranks reckless
})

// ── determinism / repeatability ──────────────────────────────────────────────────────

test('deterministic and identical across repeated runs', () => {
  assert.deepEqual(runChain(makeData(), true).squad, runChain(makeData(), true).squad)
})

// ── no mutation / frozen ─────────────────────────────────────────────────────────────

test('does not mutate the Core-shaped input', () => {
  const data = makeData()
  const before = JSON.stringify({ players: data.players, availability: data.availability, historyByPlayer: data.historyByPlayer, dnaProfiles: data.dnaProfiles, memories: data.memories })
  runChain(data, true)
  const after = JSON.stringify({ players: data.players, availability: data.availability, historyByPlayer: data.historyByPlayer, dnaProfiles: data.dnaProfiles, memories: data.memories })
  assert.equal(after, before)
})

test('the DTO and the squad are frozen', () => {
  const { dto, squad } = runChain(makeData(), true)
  assert.ok(Object.isFrozen(dto) && Object.isFrozen(dto.candidates) && Object.isFrozen(dto.formation))
  assert.ok(Object.isFrozen(squad) && Object.isFrozen(squad.startingXV) && Object.isFrozen(squad.metadata))
})
