/**
 * coach-core-adapter — Selection Inputs Facade tests
 *
 * DTO that packages players / availability / coach memories / coach DNA profile / player DNA
 * profiles / candidates / formation: empty, full, validation, deep freeze, no mutation,
 * determinism, field preservation, export, repeatability.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createSelectionInputs } from '../packages/coach-core-adapter/index.js'

const fullInput = () => ({
  players: [{ id: 'profile_p1', userId: 'p1', position: 'Hooker' }],
  availability: { p1: { response: 'available' } },
  coachMemories: [{ id: 'm1', type: 'selection-preference' }],
  coachDnaProfile: { profileVersion: '1.0', dominantSignals: [{ category: 'selection-preference', strength: 0.8 }], confidence: 0.8, metadata: {} },
  playerDnaProfiles: { p1: { tags: ['reliable'] } },
  candidates: [{ playerId: 'p1', position: 'Hooker', availability: true, confidence: 0.6 }],
  formation: { 1: 'LH', 2: 'Hooker' },
})

// ── empty / full ─────────────────────────────────────────────────────────────────────

test('empty input → empty DTO with null coach profile', () => {
  const dto = createSelectionInputs({})
  assert.deepEqual(dto.players, [])
  assert.deepEqual(dto.availability, {})
  assert.deepEqual(dto.coachMemories, [])
  assert.equal(dto.coachDnaProfile, null)
  assert.deepEqual(dto.playerDnaProfiles, {})
  assert.deepEqual(dto.candidates, [])
  assert.deepEqual(dto.formation, {})
  assert.deepEqual(dto.metadata, {
    playerCount: 0, candidateCount: 0, coachMemoryCount: 0, playerDnaProfileCount: 0,
    hasCoachDnaProfile: false, formationSize: 0, deterministic: true, adapterLayer: true,
  })
})

test('no-argument call is allowed and yields an empty DTO', () => {
  assert.equal(createSelectionInputs().metadata.playerCount, 0)
})

test('full input packages every field with correct metadata', () => {
  const dto = createSelectionInputs(fullInput())
  assert.equal(dto.metadata.playerCount, 1)
  assert.equal(dto.metadata.candidateCount, 1)
  assert.equal(dto.metadata.coachMemoryCount, 1)
  assert.equal(dto.metadata.playerDnaProfileCount, 1)
  assert.equal(dto.metadata.hasCoachDnaProfile, true)
  assert.equal(dto.metadata.formationSize, 2)
})

// ── field preservation (7, 8, 9, 10) ─────────────────────────────────────────────────

test('coach DNA profile is preserved', () => {
  const input = fullInput()
  assert.deepEqual(createSelectionInputs(input).coachDnaProfile, input.coachDnaProfile)
})

test('player DNA profiles are preserved', () => {
  const input = fullInput()
  assert.deepEqual(createSelectionInputs(input).playerDnaProfiles, input.playerDnaProfiles)
})

test('candidates are preserved', () => {
  const input = fullInput()
  assert.deepEqual(createSelectionInputs(input).candidates, input.candidates)
})

test('formation is preserved', () => {
  const input = fullInput()
  assert.deepEqual(createSelectionInputs(input).formation, input.formation)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('validation → TypeError', () => {
  assert.throws(() => createSelectionInputs(null), TypeError)
  assert.throws(() => createSelectionInputs([]), TypeError)
  assert.throws(() => createSelectionInputs({ players: 'x' }), TypeError)
  assert.throws(() => createSelectionInputs({ availability: [] }), TypeError)
  assert.throws(() => createSelectionInputs({ coachMemories: {} }), TypeError)
  assert.throws(() => createSelectionInputs({ coachDnaProfile: 5 }), TypeError)
  assert.throws(() => createSelectionInputs({ playerDnaProfiles: [] }), TypeError)
  assert.throws(() => createSelectionInputs({ candidates: 'x' }), TypeError)
  assert.throws(() => createSelectionInputs({ formation: [] }), TypeError)
})

test('coachDnaProfile may be explicitly null', () => {
  assert.equal(createSelectionInputs({ coachDnaProfile: null }).coachDnaProfile, null)
})

// ── deep freeze / no mutation ────────────────────────────────────────────────────────

test('output is deeply frozen', () => {
  const dto = createSelectionInputs(fullInput())
  assert.ok(Object.isFrozen(dto) && Object.isFrozen(dto.players) && Object.isFrozen(dto.candidates) &&
    Object.isFrozen(dto.coachDnaProfile) && Object.isFrozen(dto.playerDnaProfiles) && Object.isFrozen(dto.formation) && Object.isFrozen(dto.metadata))
  assert.ok(Object.isFrozen(dto.candidates[0]) && Object.isFrozen(dto.coachDnaProfile.dominantSignals[0]))
  assert.throws(() => dto.candidates.push({}))
  assert.throws(() => { dto.metadata.playerCount = 9 })
})

test('does not mutate or freeze the caller input', () => {
  const input = fullInput()
  const before = JSON.stringify(input)
  createSelectionInputs(input)
  assert.equal(JSON.stringify(input), before)
  assert.equal(Object.isFrozen(input.candidates), false)        // deep-copied, not referenced+frozen
  assert.equal(Object.isFrozen(input.coachDnaProfile), false)
})

// ── determinism / repeatability ──────────────────────────────────────────────────────

test('deterministic — identical input → identical DTO', () => {
  assert.deepEqual(createSelectionInputs(fullInput()), createSelectionInputs(fullInput()))
})

test('repeatable — repeated calls on the same object are identical', () => {
  const input = fullInput()
  assert.deepEqual(createSelectionInputs(input), createSelectionInputs(input))
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof createSelectionInputs, 'function')
})
