/**
 * coach-core-adapter — Core Selection Context Builder tests
 *
 * Pure composition of M132 (assembleCandidates) + M133 (resolveFormationFromCandidates):
 * happy path, empty input, malformed player/availability/provider, custom formation/groups,
 * unresolved positions, determinism, deep freeze, no mutation, and exact reuse of M132/M133.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildSelectionContext, assembleCandidates, resolveFormationFromCandidates,
  constantConfidenceProvider, fieldConfidenceProvider,
} from '../packages/coach-core-adapter/index.js'

const corePlayer = (userId, position, over = {}) => ({ id: `profile_${userId}`, userId, displayName: userId, position, ...over })
const RESPONSES = { u1: { response: 'available' }, u2: { response: 'unavailable' }, u3: { response: 'maybe' } }
const PROVIDER = constantConfidenceProvider(0.6)

const base = (over = {}) => ({
  players: [corePlayer('u1', 'Hooker'), corePlayer('u2', 'Flanker'), corePlayer('u3', 'Wing')],
  availabilityResponses: RESPONSES,
  confidenceProvider: PROVIDER,
  ...over,
})

// ── happy path ───────────────────────────────────────────────────────────────────────

test('happy path — assembles candidates + formation coverage', () => {
  const ctx = buildSelectionContext(base())
  assert.deepEqual(ctx.candidates.map((c) => [c.playerId, c.position, c.availability]), [
    ['u1', 'Hooker', true], ['u2', 'Flanker', false], ['u3', 'Wing', false],
  ])
  // Flanker covers jerseys 6 & 7; Wing covers 11 & 14
  assert.deepEqual(ctx.coverage.find((c) => c.jersey === '6').candidateIds, ['u2'])
  assert.deepEqual(ctx.coverage.find((c) => c.jersey === '11').candidateIds, ['u3'])
  // covered jerseys: 2 (Hooker), 6 & 7 (Flanker), 11 & 14 (Wing) = 5 → 10 unresolved
  assert.deepEqual(ctx.metadata, {
    playerCount: 3, candidateCount: 3, formationSize: 15, unresolvedCount: 10,
    deterministic: true, adapterLayer: true,
  })
})

// ── empty ────────────────────────────────────────────────────────────────────────────

test('empty input — no candidates, all jerseys unresolved', () => {
  const ctx = buildSelectionContext({ players: [], availabilityResponses: {}, confidenceProvider: PROVIDER })
  assert.deepEqual(ctx.candidates, [])
  assert.equal(ctx.coverage.length, 0)
  assert.equal(ctx.unresolved.length, 15)
  assert.equal(ctx.metadata.playerCount, 0)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('malformed player → TypeError (delegated to M132)', () => {
  assert.throws(() => buildSelectionContext(base({ players: [corePlayer('u1', 'TBC')] })), TypeError)   // unknown position
  assert.throws(() => buildSelectionContext(base({ players: [null] })), TypeError)
  assert.throws(() => buildSelectionContext(base({ players: 'nope' })), TypeError)
})

test('malformed availabilityResponses → TypeError', () => {
  assert.throws(() => buildSelectionContext(base({ availabilityResponses: null })), TypeError)
  assert.throws(() => buildSelectionContext(base({ availabilityResponses: [] })), TypeError)
})

test('malformed confidence provider → TypeError', () => {
  assert.throws(() => buildSelectionContext(base({ confidenceProvider: {} })), TypeError)
  assert.throws(() => buildSelectionContext(base({ confidenceProvider: null })), TypeError)
})

test('malformed input / options → TypeError', () => {
  assert.throws(() => buildSelectionContext(null), TypeError)
  assert.throws(() => buildSelectionContext(base({ options: [] })), TypeError)
})

// ── custom formation / groups ────────────────────────────────────────────────────────

test('custom formation is honoured', () => {
  const ctx = buildSelectionContext(base({ options: { formation: { 1: 'Hooker', 2: 'Lock' } } }))
  assert.equal(ctx.metadata.formationSize, 2)
  assert.deepEqual(ctx.coverage.find((c) => c.jersey === '1').candidateIds, ['u1'])
  assert.equal(ctx.unresolved.find((u) => u.jersey === '2').position, 'Lock')
})

test('custom positionGroups are honoured', () => {
  // group a Wing into the Fullback jersey (tokens must survive normalization)
  const ctx = buildSelectionContext({
    players: [corePlayer('x', 'Wing')], availabilityResponses: { x: { response: 'available' } }, confidenceProvider: PROVIDER,
    options: { formation: { 15: 'Fullback' }, positionGroups: { Fullback: ['Fullback', 'Wing'] } },
  })
  assert.deepEqual(ctx.coverage.find((c) => c.jersey === '15').candidateIds, ['x'])
})

// ── unresolved positions ─────────────────────────────────────────────────────────────

test('positions with no candidate are unresolved', () => {
  const ctx = buildSelectionContext(base({ players: [corePlayer('u1', 'Hooker')] }))
  assert.equal(ctx.unresolved.length, 14)
  assert.ok(ctx.unresolved.every((u) => u.reason === 'no candidate coverage'))
})

// ── exact M132 / M133 reuse ──────────────────────────────────────────────────────────

test('candidates are exactly M132 assembleCandidates output', () => {
  const input = base()
  const records = input.players.map((p) => ({ player: p, availabilityResponse: RESPONSES[p.userId] }))
  assert.deepEqual(buildSelectionContext(input).candidates, assembleCandidates(records, PROVIDER))
})

test('coverage/formation/unresolved are exactly M133 output for those candidates', () => {
  const input = base()
  const records = input.players.map((p) => ({ player: p, availabilityResponse: RESPONSES[p.userId] }))
  const candidates = assembleCandidates(records, PROVIDER)
  const resolved = resolveFormationFromCandidates(candidates)
  const ctx = buildSelectionContext(input)
  assert.deepEqual(ctx.formation, resolved.formation)
  assert.deepEqual(ctx.positionGroups, resolved.positionGroups)
  assert.deepEqual(ctx.coverage, resolved.coverage)
  assert.deepEqual(ctx.unresolved, resolved.unresolved)
})

test('availability is sourced from a configurable key field', () => {
  const players = [corePlayer('u1', 'Hooker', { legacyPlayerId: 'inv-1' })]
  const ctx = buildSelectionContext({
    players, availabilityResponses: { 'inv-1': { response: 'available' } }, confidenceProvider: PROVIDER,
    options: { availabilityKeyField: 'legacyPlayerId' },
  })
  assert.equal(ctx.candidates[0].availability, true)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate inputs', () => {
  const input = base()
  const before = JSON.stringify({ players: input.players, availabilityResponses: input.availabilityResponses })
  buildSelectionContext(input)
  assert.equal(JSON.stringify({ players: input.players, availabilityResponses: input.availabilityResponses }), before)
})

test('deterministic — identical input → identical context', () => {
  assert.deepEqual(buildSelectionContext(base()), buildSelectionContext(base()))
})

test('output is deeply frozen', () => {
  const ctx = buildSelectionContext(base())
  assert.ok(Object.isFrozen(ctx) && Object.isFrozen(ctx.candidates) && Object.isFrozen(ctx.coverage) &&
    Object.isFrozen(ctx.unresolved) && Object.isFrozen(ctx.formation) && Object.isFrozen(ctx.positionGroups) && Object.isFrozen(ctx.metadata))
  assert.throws(() => ctx.candidates.push({}))
  assert.throws(() => { ctx.metadata.playerCount = 0 })
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof buildSelectionContext, 'function')
})
