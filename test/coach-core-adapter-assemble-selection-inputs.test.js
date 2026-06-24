/**
 * coach-core-adapter — assembleSelectionInputs Builder tests
 *
 * Orchestrates injected producers into the M159 DTO: empty inputs, injected service calls,
 * per-field propagation, DTO returned, frozen output, determinism, repeatability, no mutation,
 * export, and a real-adapter integration.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  assembleSelectionInputs, assembleCandidates, resolveFormationFromCandidates,
  coachDnaProfileFromMemories, constantConfidenceProvider,
} from '../packages/coach-core-adapter/index.js'
import { extractCoachDnaSignals, buildCoachDnaProfile } from '../packages/coach-memory/index.js'

// ── empty ────────────────────────────────────────────────────────────────────────────

test('empty inputs → empty DTO', () => {
  const dto = assembleSelectionInputs({}, {})
  assert.deepEqual(dto.players, [])
  assert.equal(dto.coachDnaProfile, null)
  assert.equal(dto.metadata.candidateCount, 0)
})

test('no-argument call yields an empty DTO', () => {
  assert.equal(assembleSelectionInputs().metadata.playerCount, 0)
})

// ── injected service calls + propagation ─────────────────────────────────────────────

test('each injected producer is called and its output propagated', () => {
  const calls = { cand: 0, form: 0, coach: 0, pdna: 0 }
  const input = { players: [{ userId: 'p1' }], availability: { p1: { response: 'available' } }, coachMemories: [{ id: 'm1' }] }
  const services = {
    buildCandidates: (i) => { calls.cand++; assert.equal(i, input); return [{ playerId: 'p1', position: 'Hooker', availability: true, confidence: 0.6 }] },
    buildFormation: (i, candidates) => { calls.form++; assert.equal(i, input); assert.equal(candidates[0].playerId, 'p1'); return { 2: 'Hooker' } },
    buildCoachDnaProfile: (i) => { calls.coach++; return { profileVersion: '1.0', dominantSignals: [{ category: 'selection-preference', strength: 0.7 }] } },
    buildPlayerDnaProfiles: (i) => { calls.pdna++; return { p1: { tags: ['reliable'] } } },
  }
  const dto = assembleSelectionInputs(input, services)

  assert.deepEqual(calls, { cand: 1, form: 1, coach: 1, pdna: 1 })   // each called exactly once
  assert.deepEqual(dto.players, input.players)                        // players propagated
  assert.deepEqual(dto.availability, input.availability)              // availability propagated
  assert.deepEqual(dto.coachMemories, input.coachMemories)            // memories propagated
  assert.equal(dto.coachDnaProfile.dominantSignals[0].category, 'selection-preference')   // coach DNA propagated
  assert.deepEqual(dto.playerDnaProfiles, { p1: { tags: ['reliable'] } })                 // player DNA propagated
  assert.equal(dto.candidates[0].playerId, 'p1')                                          // candidates propagated
  assert.deepEqual(dto.formation, { 2: 'Hooker' })                                        // formation propagated
})

test('absent producers fall back to passthrough input fields', () => {
  const dto = assembleSelectionInputs({ candidates: [{ playerId: 'x', position: 'Lock', availability: true, confidence: 0.5 }], formation: { 4: 'Lock' }, coachDnaProfile: null }, {})
  assert.equal(dto.candidates[0].playerId, 'x')
  assert.deepEqual(dto.formation, { 4: 'Lock' })
})

// ── DTO shape / frozen ───────────────────────────────────────────────────────────────

test('returns the M159 DTO (frozen, with metadata)', () => {
  const dto = assembleSelectionInputs({ players: [{ userId: 'p1' }] }, {})
  assert.ok('metadata' in dto && dto.metadata.deterministic === true && dto.metadata.adapterLayer === true)
  assert.ok(Object.isFrozen(dto) && Object.isFrozen(dto.players) && Object.isFrozen(dto.metadata))
  assert.throws(() => dto.players.push({}))
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('validation → TypeError', () => {
  assert.throws(() => assembleSelectionInputs(null), TypeError)
  assert.throws(() => assembleSelectionInputs({}, null), TypeError)
  assert.throws(() => assembleSelectionInputs({}, { buildCandidates: 5 }), TypeError)
})

// ── determinism / repeatability / no mutation ────────────────────────────────────────

test('deterministic and repeatable', () => {
  const input = { players: [{ userId: 'p1' }], coachMemories: [{ id: 'm1' }] }
  const services = { buildCandidates: () => [{ playerId: 'p1', position: 'Hooker', availability: true, confidence: 0.6 }] }
  assert.deepEqual(assembleSelectionInputs(input, services), assembleSelectionInputs(input, services))
})

test('does not mutate inputs', () => {
  const input = { players: [{ userId: 'p1' }], availability: { p1: { response: 'available' } } }
  const before = JSON.stringify(input)
  assembleSelectionInputs(input, {})
  assert.equal(JSON.stringify(input), before)
  assert.equal(Object.isFrozen(input.players), false)   // M159 deep-copies → caller untouched
})

// ── real-adapter integration ─────────────────────────────────────────────────────────

test('composes the real adapters into a populated DTO', () => {
  const input = {
    players: [{ id: 'profile_p1', userId: 'p1', position: 'Hooker' }],
    availability: { p1: { response: 'available' } },
    coachMemories: [{ id: 'm1', coachId: 'c', clubId: 'b', type: 'selection-preference', statement: 's', source: 'manual', confidence: 0.8, weight: 0.7, tags: [], ontologyLinks: [], evidenceRefs: [], createdAt: '2026-06-01T00:00:00.000Z' }],
    candidateRecords: [{ player: { userId: 'p1', position: 'Hooker' }, availabilityResponse: 'available' }],
    confidenceProvider: constantConfidenceProvider(0.6),
  }
  const services = {
    buildCandidates: (i) => assembleCandidates(i.candidateRecords, i.confidenceProvider),                    // M132
    buildFormation: (i, candidates) => resolveFormationFromCandidates(candidates).formation,                 // M133
    buildCoachDnaProfile: (i) => coachDnaProfileFromMemories(i.coachMemories, { extractCoachDnaSignals, buildCoachDnaProfile }),   // M157
  }
  const dto = assembleSelectionInputs(input, services)
  assert.equal(dto.candidates[0].playerId, 'p1')
  assert.equal(dto.candidates[0].position, 'Hooker')
  assert.equal(dto.formation['2'], 'Hooker')
  assert.equal(dto.coachDnaProfile.dominantSignals[0].category, 'selection-preference')
  assert.equal(dto.metadata.candidateCount, 1)
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof assembleSelectionInputs, 'function')
})
