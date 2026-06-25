/**
 * coach-core-adapter — Loader → SelectionInputs Integration Harness (DORMANT PROOF, test-only)
 *
 * Proves the read-only Core boundary feeds the proven adapter chain to a populated DTO:
 *
 *   M164-shaped provider
 *   → loaderToSelectionInputs (M165)   → { players, availability, memories, playerTags }
 *   → assembleSelectionInputs (M160)    → createSelectionInputs DTO (M159)
 *
 * Uses the real adapter producer thunks (M132 candidates, M133 formation, M157 coach DNA, M153
 * player DNA). The M165 `memories` field is bridged to M160's `coachMemories` passthrough. No Core
 * edits, no runtime change, no pipeline execution, no AI, no networking, no storage.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  loaderToSelectionInputs, assembleSelectionInputs, assembleCandidates, resolveFormationFromCandidates,
  coachDnaProfileFromMemories, derivePlayerDnaSignals, constantConfidenceProvider,
} from '../packages/coach-core-adapter/index.js'
import { extractCoachDnaSignals, buildCoachDnaProfile } from '../packages/coach-memory/index.js'

const ENGINES = { extractCoachDnaSignals, buildCoachDnaProfile }
const DNA_MAPPINGS = { tags: { reliable: { category: 'selection-preference', weight: 1 } } }

const corePlayer = (userId, position) => ({ id: `profile_${userId}`, userId, displayName: userId, position })
const memory = (id, type) => ({ id, coachId: 'coach-demo', clubId: 'boitsfort-rfc', type, statement: `insight ${id}`, source: 'manual', confidence: 0.8, weight: 0.7, tags: [], ontologyLinks: [], evidenceRefs: [], createdAt: `2026-06-0${id.slice(1)}T00:00:00.000Z` })

// realistic in-memory Core-shaped data behind an M164-shaped provider
function makeData() {
  const players = [corePlayer('u1', 'Loosehead Prop'), corePlayer('u2', 'Hooker'), corePlayer('u3', 'Lock'), corePlayer('u4', 'Scrum-half'), corePlayer('u5', 'Fly-half'), corePlayer('u6', 'Fullback')]
  const availability = {}
  for (const p of players) availability[p.userId] = { response: 'available' }
  return {
    players, availability,
    memories: [memory('m1', 'selection-preference'), memory('m2', 'selection-preference'), memory('m3', 'selection-preference'), memory('m4', 'tactical-preference')],
    playerTags: { u1: { tags: ['reliable'] }, u4: { tags: ['reliable'] } },
  }
}

function makeProvider(data) {
  return {
    getActivePlayers: () => data.players,
    getAvailabilityResponses: () => data.availability,
    getCoachMemories: () => data.memories,
    getPlayerTags: () => data.playerTags,
  }
}

const SERVICES = {
  buildCandidates: (i) => assembleCandidates(i.candidateRecords, i.confidenceProvider),                                   // M132
  buildFormation: (i, candidates) => resolveFormationFromCandidates(candidates).formation,                                // M133
  buildCoachDnaProfile: (i) => coachDnaProfileFromMemories(i.coachMemories, ENGINES),                                     // M157
  buildPlayerDnaProfiles: (i) => Object.fromEntries(i.players.map((p) => [p.userId, derivePlayerDnaSignals({ playerId: p.userId, ...(i.playerTags[p.userId] || {}) }, { mappings: i.dnaMappings }).dnaSignals])),   // M153
}

// provider → M165 → M160 DTO
function assembleViaLoader(data) {
  const mapped = loaderToSelectionInputs(makeProvider(data))   // M165
  const input = {
    players: mapped.players,
    availability: mapped.availability,
    coachMemories: mapped.memories,                            // bridge: M165 `memories` → M160 `coachMemories`
    candidateRecords: mapped.players.map((p) => ({ player: { userId: p.userId, position: p.position }, availabilityResponse: mapped.availability[p.userId] })),
    confidenceProvider: constantConfidenceProvider(0.6),
    playerTags: mapped.playerTags,
    dnaMappings: DNA_MAPPINGS,
  }
  return { mapped, dto: assembleSelectionInputs(input, SERVICES) }   // M160
}

// ── provider → M165 ──────────────────────────────────────────────────────────────────

test('the provider feeds M165 correctly', () => {
  const data = makeData()
  const mapped = loaderToSelectionInputs(makeProvider(data))
  assert.deepEqual(Object.keys(mapped).sort(), ['availability', 'memories', 'playerTags', 'players'])
  assert.deepEqual(mapped.players, data.players)
  assert.deepEqual(mapped.memories, data.memories)
  assert.deepEqual(mapped.playerTags, data.playerTags)
})

// ── M165 → M160 → populated DTO ──────────────────────────────────────────────────────

test('M165 output feeds M160 into a fully-populated SelectionInputs DTO', () => {
  const { dto } = assembleViaLoader(makeData())

  // every DTO field present and populated
  assert.equal(dto.players.length, 6)                                                          // players
  assert.deepEqual(Object.keys(dto.availability).sort(), ['u1', 'u2', 'u3', 'u4', 'u5', 'u6']) // availability
  assert.equal(dto.coachMemories.length, 4)                                                    // memories (bridged)
  assert.equal(dto.candidates.length, 6)                                                       // candidates
  assert.deepEqual(dto.candidates.map((c) => c.position).sort(), ['FlyHalf', 'Fullback', 'Hooker', 'LH', 'Lock', 'ScrumHalf'])   // normalized positions
  assert.ok(dto.candidates.every((c) => c.confidence === 0.6 && c.availability === true))
  assert.equal(Object.keys(dto.formation).length, 15)                                          // formation
  assert.equal(dto.coachDnaProfile.dominantSignals[0].category, 'selection-preference')        // coach DNA reflects memories
  assert.deepEqual(dto.playerDnaProfiles.u1, [{ category: 'selection-preference', weight: 1 }]) // player DNA from tags
  assert.deepEqual(dto.playerDnaProfiles.u2, [])
  assert.equal(dto.metadata.candidateCount, 6)
})

// ── frozen / deterministic / no mutation ─────────────────────────────────────────────

test('the DTO and mapped output are frozen', () => {
  const { mapped, dto } = assembleViaLoader(makeData())
  assert.ok(Object.isFrozen(mapped) && Object.isFrozen(mapped.players))
  assert.ok(Object.isFrozen(dto) && Object.isFrozen(dto.candidates) && Object.isFrozen(dto.coachDnaProfile) &&
    Object.isFrozen(dto.playerDnaProfiles) && Object.isFrozen(dto.formation) && Object.isFrozen(dto.metadata))
  assert.throws(() => dto.candidates.push({}))
})

test('deterministic — repeated runs are identical', () => {
  assert.deepEqual(assembleViaLoader(makeData()).dto, assembleViaLoader(makeData()).dto)
})

test('does not mutate or freeze the provider data', () => {
  const data = makeData()
  const before = JSON.stringify(data)
  assembleViaLoader(data)
  assert.equal(JSON.stringify(data), before)
  assert.equal(Object.isFrozen(data.players), false)     // M165 deep-copies → provider data untouched
  assert.equal(Object.isFrozen(data.memories), false)
})
