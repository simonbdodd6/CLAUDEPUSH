/**
 * brain-decision-planner — Decision / Plan Source Contract tests
 *
 * Contract-only (intelligence-side sibling of M164): the two required methods, guarantees, a
 * shape validator that never invokes the provider, frozen + deterministic output, no mutation,
 * export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createDecisionPlanSourceContract } from '../packages/brain-decision-planner/index.js'

const validProvider = (over = {}) => ({ getFixtureContext: () => ({}), getCoachIdentity: () => ({}), ...over })

// ── shape ────────────────────────────────────────────────────────────────────────────

test('returns a contract with methods, guarantees, and a validate function', () => {
  const c = createDecisionPlanSourceContract()
  assert.deepEqual(c.methods, ['getFixtureContext', 'getCoachIdentity'])
  assert.ok(Array.isArray(c.guarantees) && c.guarantees.length > 0 && c.guarantees.every((g) => typeof g === 'string'))
  assert.equal(typeof c.validate, 'function')
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('validate accepts a provider exposing both accessors', () => {
  assert.equal(createDecisionPlanSourceContract().validate(validProvider()), true)
})

test('validate rejects a non-object provider', () => {
  const { validate } = createDecisionPlanSourceContract()
  assert.throws(() => validate(null), TypeError)
  assert.throws(() => validate([]), TypeError)
  assert.throws(() => validate('x'), TypeError)
})

test('validate rejects a provider missing getFixtureContext (error names it)', () => {
  assert.throws(() => createDecisionPlanSourceContract().validate(validProvider({ getFixtureContext: undefined })), /getFixtureContext/)
})

test('validate rejects a provider missing getCoachIdentity (error names it)', () => {
  assert.throws(() => createDecisionPlanSourceContract().validate(validProvider({ getCoachIdentity: undefined })), /getCoachIdentity/)
})

test('validate rejects mistyped accessors', () => {
  const { validate } = createDecisionPlanSourceContract()
  assert.throws(() => validate(validProvider({ getFixtureContext: 5 })), TypeError)
  assert.throws(() => validate(validProvider({ getCoachIdentity: {} })), TypeError)
  assert.throws(() => validate({}), TypeError)
})

// ── no side effects / no mutation ────────────────────────────────────────────────────

test('validate never invokes the provider functions (no side effects)', () => {
  let called = false
  const spy = () => { called = true }
  createDecisionPlanSourceContract().validate(validProvider({ getFixtureContext: spy, getCoachIdentity: spy }))
  assert.equal(called, false)
})

test('validate does not mutate the provider', () => {
  const provider = validProvider()
  const keysBefore = Object.keys(provider).sort().join(',')
  createDecisionPlanSourceContract().validate(provider)
  assert.equal(Object.keys(provider).sort().join(','), keysBefore)
})

// ── frozen / deterministic ───────────────────────────────────────────────────────────

test('the contract is deeply frozen', () => {
  const c = createDecisionPlanSourceContract()
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.methods) && Object.isFrozen(c.guarantees))
  assert.throws(() => c.methods.push('x'))
  assert.throws(() => { c.validate = null })
})

test('deterministic — repeated calls produce an identical contract', () => {
  assert.deepEqual(createDecisionPlanSourceContract(), createDecisionPlanSourceContract())
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof createDecisionPlanSourceContract, 'function')
})
