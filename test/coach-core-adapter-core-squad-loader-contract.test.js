/**
 * coach-core-adapter — Core Squad Loader Contract tests
 *
 * Contract-only: the four required methods, guarantees, a shape validator that never invokes the
 * provider, frozen + deterministic output, no mutation, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCoreSquadLoaderContract } from '../packages/coach-core-adapter/index.js'

const validProvider = (over = {}) => ({
  getActivePlayers: () => [], getAvailabilityResponses: () => ({}), getCoachMemories: () => [], getPlayerTags: () => ({}), ...over,
})

// ── shape ────────────────────────────────────────────────────────────────────────────

test('returns a contract with methods, guarantees, and a validate function', () => {
  const c = createCoreSquadLoaderContract()
  assert.deepEqual(c.methods, ['getActivePlayers', 'getAvailabilityResponses', 'getCoachMemories', 'getPlayerTags'])
  assert.ok(Array.isArray(c.guarantees) && c.guarantees.length > 0 && c.guarantees.every((g) => typeof g === 'string'))
  assert.equal(typeof c.validate, 'function')
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('validate accepts a provider exposing all four accessors', () => {
  assert.equal(createCoreSquadLoaderContract().validate(validProvider()), true)
})

test('validate rejects a non-object provider', () => {
  const { validate } = createCoreSquadLoaderContract()
  assert.throws(() => validate(null), TypeError)
  assert.throws(() => validate([]), TypeError)
  assert.throws(() => validate('x'), TypeError)
})

test('validate rejects a provider missing or mistyping any accessor', () => {
  const { validate } = createCoreSquadLoaderContract()
  assert.throws(() => validate(validProvider({ getActivePlayers: undefined })), TypeError)
  assert.throws(() => validate(validProvider({ getCoachMemories: 5 })), TypeError)
  assert.throws(() => validate({}), TypeError)
  // the error names the missing functions
  assert.throws(() => validate(validProvider({ getPlayerTags: undefined })), /getPlayerTags/)
})

// ── no side effects ──────────────────────────────────────────────────────────────────

test('validate never invokes the provider functions (no side effects)', () => {
  let called = false
  const spy = () => { called = true }
  createCoreSquadLoaderContract().validate(validProvider({ getActivePlayers: spy, getAvailabilityResponses: spy, getCoachMemories: spy, getPlayerTags: spy }))
  assert.equal(called, false)
})

test('validate does not mutate the provider', () => {
  const provider = validProvider()
  const keysBefore = Object.keys(provider).sort().join(',')
  createCoreSquadLoaderContract().validate(provider)
  assert.equal(Object.keys(provider).sort().join(','), keysBefore)
})

// ── frozen / deterministic ───────────────────────────────────────────────────────────

test('the contract is deeply frozen', () => {
  const c = createCoreSquadLoaderContract()
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.methods) && Object.isFrozen(c.guarantees))
  assert.throws(() => c.methods.push('x'))
  assert.throws(() => { c.validate = null })
})

test('deterministic — repeated calls produce an identical contract', () => {
  assert.deepEqual(createCoreSquadLoaderContract(), createCoreSquadLoaderContract())
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof createCoreSquadLoaderContract, 'function')
})
