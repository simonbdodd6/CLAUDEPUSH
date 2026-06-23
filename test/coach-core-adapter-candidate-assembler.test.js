/**
 * coach-core-adapter — Candidate Assembler tests
 *
 * Transforms Core player records into exact M120/M121 candidates: shape, position source +
 * override, playerId resolution, availability mapping, confidence, unknown/coarse positions,
 * validation, batch + skip, no mutation, determinism, frozen output, end-to-end into M121, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  assembleCandidate, assembleCandidates, constantConfidenceProvider, fieldConfidenceProvider,
} from '../packages/coach-core-adapter/index.js'
import { evaluateSquad } from '../packages/coach-intelligence/index.js'

// a Core-shaped player profile (per the audit of api/_identityStore.js)
const corePlayer = (over = {}) => ({
  id: 'profile_1', userId: 'user_1', teamId: 'boitsfort-rfc', displayName: 'Cian Murphy',
  position: 'Loosehead Prop', email: 'cian@example.ie', createdAt: '2026-01-01T00:00:00.000Z', ...over,
})

const CONF = constantConfidenceProvider(0.7)

// ── exact candidate shape ────────────────────────────────────────────────────────────

test('assembles the exact M121 candidate shape from a Core record', () => {
  const c = assembleCandidate({ player: corePlayer(), availabilityResponse: 'available' }, CONF)
  assert.deepEqual(c, { playerId: 'user_1', position: 'LH', availability: true, confidence: 0.7 })
})

// ── position source / override ───────────────────────────────────────────────────────

test('position defaults to player.position, normalized', () => {
  const c = assembleCandidate({ player: corePlayer({ position: 'Scrum-half' }), availabilityResponse: 'available' }, CONF)
  assert.equal(c.position, 'ScrumHalf')
})

test('explicit position overrides the player record', () => {
  const c = assembleCandidate({ player: corePlayer({ position: 'TBC' }), position: 'Fly-half', availabilityResponse: 'available' }, CONF)
  assert.equal(c.position, 'FlyHalf')
})

test('coarse Core positions still produce valid candidates', () => {
  const c = assembleCandidate({ player: corePlayer({ position: 'Flanker' }), availabilityResponse: 'available' }, CONF)
  assert.equal(c.position, 'Flanker')
})

// ── playerId resolution ──────────────────────────────────────────────────────────────

test('playerId comes from userId, falls back to id, or a custom field', () => {
  assert.equal(assembleCandidate({ player: corePlayer({ userId: 'user_9' }), availabilityResponse: 'available' }, CONF).playerId, 'user_9')
  const noUser = corePlayer(); delete noUser.userId
  assert.equal(assembleCandidate({ player: noUser, availabilityResponse: 'available' }, CONF).playerId, 'profile_1')
  assert.equal(assembleCandidate({ player: corePlayer({ legacyPlayerId: 'inv-XYZ' }), availabilityResponse: 'available' }, CONF, { playerIdField: 'legacyPlayerId' }).playerId, 'inv-XYZ')
})

test('throws when no usable id exists', () => {
  const anon = corePlayer(); delete anon.userId; delete anon.id
  assert.throws(() => assembleCandidate({ player: anon, availabilityResponse: 'available' }, CONF), TypeError)
})

// ── availability ─────────────────────────────────────────────────────────────────────

test('availability maps from the Core response, honouring options', () => {
  assert.equal(assembleCandidate({ player: corePlayer(), availabilityResponse: 'unavailable' }, CONF).availability, false)
  assert.equal(assembleCandidate({ player: corePlayer(), availabilityResponse: { response: 'maybe' } }, CONF).availability, false)
  assert.equal(assembleCandidate({ player: corePlayer(), availabilityResponse: { response: 'maybe' } }, CONF, { maybeAvailable: true }).availability, true)
  assert.equal(assembleCandidate({ player: corePlayer() }, CONF).availability, false)   // no response → unavailable
})

// ── confidence ───────────────────────────────────────────────────────────────────────

test('confidence comes from the provider (reading the player)', () => {
  const c = assembleCandidate({ player: corePlayer({ formScore: 0.85 }), availabilityResponse: 'available' }, fieldConfidenceProvider('formScore', 0.4))
  assert.equal(c.confidence, 0.85)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('unknown position throws', () => {
  assert.throws(() => assembleCandidate({ player: corePlayer({ position: 'TBC' }), availabilityResponse: 'available' }, CONF), TypeError)
})

test('invalid input / player / provider → TypeError', () => {
  assert.throws(() => assembleCandidate(null, CONF), TypeError)
  assert.throws(() => assembleCandidate({}, CONF), TypeError)                                   // no player
  assert.throws(() => assembleCandidate({ player: corePlayer() }, {}), TypeError)               // provider lacks getConfidence
  assert.throws(() => assembleCandidate({ player: corePlayer() }, CONF, []), TypeError)         // bad options
})

// ── batch ────────────────────────────────────────────────────────────────────────────

test('assembleCandidates maps an array', () => {
  const out = assembleCandidates([
    { player: corePlayer({ userId: 'u1', position: 'Hooker' }), availabilityResponse: 'available' },
    { player: corePlayer({ userId: 'u2', position: 'Lock' }), availabilityResponse: 'unavailable' },
  ], CONF)
  assert.deepEqual(out.map((c) => [c.playerId, c.position, c.availability]), [['u1', 'Hooker', true], ['u2', 'Lock', false]])
})

test('skipUnknownPosition drops TBC players but still throws on malformed records', () => {
  const out = assembleCandidates([
    { player: corePlayer({ userId: 'u1', position: 'Hooker' }), availabilityResponse: 'available' },
    { player: corePlayer({ userId: 'u2', position: 'TBC' }), availabilityResponse: 'available' },
  ], CONF, { skipUnknownPosition: true })
  assert.deepEqual(out.map((c) => c.playerId), ['u1'])
  assert.throws(() => assembleCandidates([null], CONF, { skipUnknownPosition: true }), TypeError)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate the Core player and returns a frozen candidate', () => {
  const player = corePlayer()
  const before = JSON.stringify(player)
  const c = assembleCandidate({ player, availabilityResponse: 'available' }, CONF)
  assert.equal(JSON.stringify(player), before)
  assert.ok(Object.isFrozen(c))
})

test('deterministic — identical inputs → identical candidate', () => {
  const input = { player: corePlayer(), availabilityResponse: 'available' }
  assert.deepEqual(assembleCandidate(input, CONF), assembleCandidate(input, CONF))
})

// ── end-to-end: assembled candidates are accepted by M121 ────────────────────────────

test('assembled candidates pass straight into M121 evaluateSquad', () => {
  const PIPELINE_RESULT = { alignment: { alignmentScore: 0.8 } }
  const RECOMMENDATION = { confidence: 0.8, action: 'present', requiresCoachReview: false, alignmentTier: 'good', evidence: { challenged: false, dominantSignals: [], matchedSignals: [] } }
  const candidates = assembleCandidates([
    { player: corePlayer({ userId: 'u1', position: 'Loosehead Prop' }), availabilityResponse: 'available' },
    { player: corePlayer({ userId: 'u2', position: 'Hooker' }), availabilityResponse: { response: 'maybe' } },   // → unavailable
  ], CONF)
  const squad = evaluateSquad(candidates, PIPELINE_RESULT, RECOMMENDATION, {})
  assert.deepEqual(squad.ranked.map((r) => r.playerId), ['u1'])           // available, eligible
  assert.deepEqual(squad.ineligible.map((r) => r.playerId), ['u2'])       // maybe → unavailable
})

test('exports exist', () => {
  assert.equal(typeof assembleCandidate, 'function')
  assert.equal(typeof assembleCandidates, 'function')
})
