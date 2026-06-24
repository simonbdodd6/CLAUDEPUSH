/**
 * coach-core-adapter — Loader → Adapter Input Mapper tests
 *
 * Validates a provider (M164), calls its four accessors once each, and returns a frozen
 * { players, availability, memories, playerTags }: happy path, validation, single calls,
 * error propagation, determinism, frozen output, no mutation, repeatability, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loaderToSelectionInputs } from '../packages/coach-core-adapter/index.js'

const DATA = {
  players: [{ id: 'profile_p1', userId: 'p1', position: 'Hooker' }],
  availability: { p1: { response: 'available' } },
  memories: [{ id: 'm1', type: 'selection-preference' }],
  playerTags: { p1: { tags: ['reliable'] } },
}

function makeProvider(over = {}) {
  const calls = { players: 0, availability: 0, memories: 0, tags: 0 }
  const provider = {
    getActivePlayers: () => { calls.players++; return DATA.players },
    getAvailabilityResponses: () => { calls.availability++; return DATA.availability },
    getCoachMemories: () => { calls.memories++; return DATA.memories },
    getPlayerTags: () => { calls.tags++; return DATA.playerTags },
    ...over,
  }
  return { provider, calls }
}

// ── happy path ───────────────────────────────────────────────────────────────────────

test('happy path — maps loader accessors to the adapter input shape', () => {
  const out = loaderToSelectionInputs(makeProvider().provider)
  assert.deepEqual(out, DATA)
  assert.deepEqual(Object.keys(out).sort(), ['availability', 'memories', 'playerTags', 'players'])
})

// ── single accessor calls ────────────────────────────────────────────────────────────

test('calls each accessor exactly once', () => {
  const { provider, calls } = makeProvider()
  loaderToSelectionInputs(provider)
  assert.deepEqual(calls, { players: 1, availability: 1, memories: 1, tags: 1 })
})

// ── validation / error propagation ───────────────────────────────────────────────────

test('rejects a provider missing a required accessor (M164 validation)', () => {
  assert.throws(() => loaderToSelectionInputs(makeProvider({ getPlayerTags: undefined }).provider), TypeError)
  assert.throws(() => loaderToSelectionInputs(null), TypeError)
  assert.throws(() => loaderToSelectionInputs({}), TypeError)
})

test('propagates an accessor error', () => {
  const { provider } = makeProvider({ getCoachMemories: () => { throw new Error('store unavailable') } })
  assert.throws(() => loaderToSelectionInputs(provider), /store unavailable/)
})

// ── frozen / no mutation ─────────────────────────────────────────────────────────────

test('output is deeply frozen', () => {
  const out = loaderToSelectionInputs(makeProvider().provider)
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.players) && Object.isFrozen(out.availability) &&
    Object.isFrozen(out.memories) && Object.isFrozen(out.playerTags) && Object.isFrozen(out.players[0]))
  assert.throws(() => out.players.push({}))
})

test('does not mutate or freeze the provider data', () => {
  const { provider } = makeProvider()
  loaderToSelectionInputs(provider)
  assert.equal(Object.isFrozen(DATA.players), false)        // deep-copied, not referenced+frozen
  assert.equal(Object.isFrozen(DATA.playerTags), false)
})

// ── determinism / repeatability ──────────────────────────────────────────────────────

test('deterministic — identical provider → identical output', () => {
  assert.deepEqual(loaderToSelectionInputs(makeProvider().provider), loaderToSelectionInputs(makeProvider().provider))
})

test('repeated calls on the same provider are identical', () => {
  const { provider } = makeProvider()
  assert.deepEqual(loaderToSelectionInputs(provider), loaderToSelectionInputs(provider))
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof loaderToSelectionInputs, 'function')
})
