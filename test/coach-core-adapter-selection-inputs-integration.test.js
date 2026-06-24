/**
 * coach-core-adapter — Selection Inputs Integration Harness (DORMANT PROOF, test-only)
 *
 * Proves the complete adapter chain assembles a populated SelectionInputs DTO from realistic
 * Core-shaped data, by wiring the REAL adapters as the M160 producer thunks:
 *
 *   players + availability + candidateRecords → M132 assembleCandidates        → candidates
 *   candidates                                → M133 resolveFormationFromCandidates → formation
 *   coachMemories                             → M157 coachDnaProfileFromMemories  → coach DNA profile
 *   players + tags                            → M153 derivePlayerDnaSignals       → player DNA profiles
 *   → assembleSelectionInputs (M160) → createSelectionInputs (M159) DTO
 *
 * No pipeline execution, no recommendation, no AI, no Core changes, no runPipelineBridge.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  assembleSelectionInputs, createSelectionInputs, assembleCandidates, resolveFormationFromCandidates,
  coachDnaProfileFromMemories, derivePlayerDnaSignals, constantConfidenceProvider,
} from '../packages/coach-core-adapter/index.js'
import { extractCoachDnaSignals, buildCoachDnaProfile } from '../packages/coach-memory/index.js'

const ENGINES = { extractCoachDnaSignals, buildCoachDnaProfile }
const DNA_MAPPINGS = { tags: { reliable: { category: 'selection-preference', weight: 1 } } }

const corePlayer = (userId, position) => ({ id: `profile_${userId}`, userId, displayName: userId, position })
const memory = (id, type) => ({ id, coachId: 'coach-demo', clubId: 'boitsfort-rfc', type, statement: `insight ${id}`, source: 'manual', confidence: 0.8, weight: 0.7, tags: [], ontologyLinks: [], evidenceRefs: [], createdAt: `2026-06-0${id.slice(1)}T00:00:00.000Z` })

function makeInput() {
  const players = [
    corePlayer('u1', 'Loosehead Prop'), corePlayer('u2', 'Hooker'), corePlayer('u3', 'Lock'),
    corePlayer('u4', 'Scrum-half'), corePlayer('u5', 'Fly-half'), corePlayer('u6', 'Fullback'),
  ]
  const availability = {}
  for (const p of players) availability[p.userId] = { response: 'available' }
  return {
    players,
    availability,
    coachMemories: [memory('m1', 'selection-preference'), memory('m2', 'selection-preference'), memory('m3', 'selection-preference'), memory('m4', 'tactical-preference')],
    candidateRecords: players.map((p) => ({ player: { userId: p.userId, position: p.position }, availabilityResponse: availability[p.userId] })),
    confidenceProvider: constantConfidenceProvider(0.6),
    playerDnaTags: { u1: { tags: ['reliable'] }, u4: { tags: ['reliable'] } },
    dnaMappings: DNA_MAPPINGS,
  }
}

// the real adapters, wired as M160 producer thunks
const SERVICES = {
  buildCandidates: (i) => assembleCandidates(i.candidateRecords, i.confidenceProvider),                                   // M132
  buildFormation: (i, candidates) => resolveFormationFromCandidates(candidates).formation,                                // M133
  buildCoachDnaProfile: (i) => coachDnaProfileFromMemories(i.coachMemories, ENGINES),                                     // M157
  buildPlayerDnaProfiles: (i) => Object.fromEntries(i.players.map((p) => [p.userId, derivePlayerDnaSignals({ playerId: p.userId, ...(i.playerDnaTags[p.userId] || {}) }, { mappings: i.dnaMappings }).dnaSignals])),   // M153
}

const assemble = () => assembleSelectionInputs(makeInput(), SERVICES)

// ── populated DTO ────────────────────────────────────────────────────────────────────

test('assembles a fully-populated SelectionInputs DTO from Core-shaped data', () => {
  const dto = assemble()

  assert.equal(dto.players.length, 6)                                            // players present
  assert.deepEqual(Object.keys(dto.availability).sort(), ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'])   // availability present
  assert.equal(dto.coachMemories.length, 4)

  // candidates (M132) — Core positions normalized to Brain tokens
  assert.equal(dto.candidates.length, 6)
  assert.deepEqual(dto.candidates.map((c) => c.position).sort(), ['FlyHalf', 'Fullback', 'Hooker', 'LH', 'Lock', 'ScrumHalf'])
  assert.ok(dto.candidates.every((c) => c.confidence === 0.6 && c.availability === true))

  // formation (M133)
  assert.equal(dto.formation['2'], 'Hooker')
  assert.equal(Object.keys(dto.formation).length, 15)

  // coach DNA (M157) — selection-preference is the strongest signal from the memories
  assert.equal(dto.coachDnaProfile.dominantSignals[0].category, 'selection-preference')

  // player DNA (M153) — only tagged players carry signals
  assert.deepEqual(dto.playerDnaProfiles.u1, [{ category: 'selection-preference', weight: 1 }])
  assert.deepEqual(dto.playerDnaProfiles.u2, [])

  // M159 DTO metadata
  assert.equal(dto.metadata.candidateCount, 6)
  assert.equal(dto.metadata.hasCoachDnaProfile, true)
})

// ── determinism / repeatability ──────────────────────────────────────────────────────

test('deterministic and repeatable', () => {
  assert.deepEqual(assemble(), assemble())
})

// ── frozen / no mutation ─────────────────────────────────────────────────────────────

test('output is deeply frozen', () => {
  const dto = assemble()
  assert.ok(Object.isFrozen(dto) && Object.isFrozen(dto.candidates) && Object.isFrozen(dto.coachDnaProfile) &&
    Object.isFrozen(dto.playerDnaProfiles) && Object.isFrozen(dto.formation) && Object.isFrozen(dto.metadata))
  assert.ok(Object.isFrozen(dto.candidates[0]))
  assert.throws(() => dto.candidates.push({}))
})

test('does not mutate the Core-shaped input', () => {
  const input = makeInput()
  const before = JSON.stringify({ players: input.players, availability: input.availability, coachMemories: input.coachMemories, playerDnaTags: input.playerDnaTags })
  assembleSelectionInputs(input, SERVICES)
  const after = JSON.stringify({ players: input.players, availability: input.availability, coachMemories: input.coachMemories, playerDnaTags: input.playerDnaTags })
  assert.equal(after, before)
  assert.equal(Object.isFrozen(input.players), false)
})

// ── export compatibility (M159 / M160) ───────────────────────────────────────────────

test('export compatibility — M160 output equals M159 packaging of the same fields', () => {
  assert.equal(typeof assembleSelectionInputs, 'function')
  assert.equal(typeof createSelectionInputs, 'function')
  const input = makeInput()
  const candidates = SERVICES.buildCandidates(input)
  const expected = createSelectionInputs({
    players: input.players,
    availability: input.availability,
    coachMemories: input.coachMemories,
    coachDnaProfile: SERVICES.buildCoachDnaProfile(input),
    playerDnaProfiles: SERVICES.buildPlayerDnaProfiles(input),
    candidates,
    formation: SERVICES.buildFormation(input, candidates),
  })
  assert.deepEqual(assembleSelectionInputs(input, SERVICES), expected)
})
