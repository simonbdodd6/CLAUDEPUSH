/**
 * Canonical Brain regression fixtures tests.
 *
 * Proves the shared fixtures are deterministic AND return fresh, independent objects every call,
 * and that the invalid-provider fixture stays structurally invalid.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createFullSquadScenario, createInjuryThinnedScenario, createInvalidProviderScenario } from './fixtures/brain-regression-fixtures.js'

// providers' observable data, as a stable string for comparison
const snapshot = (scenario) => JSON.stringify({
  id: scenario.id,
  expected: scenario.expected ?? null,
  players: typeof scenario.squadLoader.getActivePlayers === 'function' ? scenario.squadLoader.getActivePlayers() : null,
  availability: typeof scenario.squadLoader.getAvailabilityResponses === 'function' ? scenario.squadLoader.getAvailabilityResponses() : null,
  memories: typeof scenario.squadLoader.getCoachMemories === 'function' ? scenario.squadLoader.getCoachMemories() : null,
  tags: typeof scenario.squadLoader.getPlayerTags === 'function' ? scenario.squadLoader.getPlayerTags() : null,
  fixture: scenario.decisionPlanSource.getFixtureContext(),
  identity: scenario.decisionPlanSource.getCoachIdentity(),
})

const BUILDERS = [createFullSquadScenario, createInjuryThinnedScenario, createInvalidProviderScenario]

// ── fresh objects ──────────────────────────────────────────────────────────────────────

test('each builder returns fresh objects every call', () => {
  for (const build of BUILDERS) {
    const a = build()
    const b = build()
    assert.notEqual(a, b)
    assert.notEqual(a.squadLoader, b.squadLoader)
    assert.notEqual(a.decisionPlanSource, b.decisionPlanSource)
  }
  // distinct player array instances for the provider-backed fixtures
  assert.notEqual(createFullSquadScenario().squadLoader.getActivePlayers(), createFullSquadScenario().squadLoader.getActivePlayers())
})

// ── determinism ──────────────────────────────────────────────────────────────────────

test('each builder is deterministic across calls', () => {
  for (const build of BUILDERS) {
    assert.equal(snapshot(build()), snapshot(build()))
  }
})

test('fixture shapes are as proven in M179', () => {
  const full = createFullSquadScenario()
  assert.equal(full.id, 'full-squad')
  assert.equal(full.squadLoader.getActivePlayers().length, 24)
  assert.deepEqual(full.expected, { startingCount: 15, hasSquad: true })

  const thinned = createInjuryThinnedScenario()
  assert.equal(thinned.id, 'injury-thinned')
  assert.equal(thinned.squadLoader.getActivePlayers().length, 22)
  assert.equal(thinned.squadLoader.getActivePlayers().filter((p) => p.position === 'Fullback').length, 0)
  assert.deepEqual(thinned.expected, { startingCount: 14 })
})

// ── independence (no shared mutable references) ──────────────────────────────────────

test('mutating one fixture does not affect another', () => {
  const a = createFullSquadScenario()
  a.squadLoader.getActivePlayers()[0].position = 'MUTATED'
  a.squadLoader.getActivePlayers().length   // touch
  const b = createFullSquadScenario()
  assert.notEqual(b.squadLoader.getActivePlayers()[0].position, 'MUTATED')
  assert.equal(b.squadLoader.getActivePlayers()[0].position, 'Loosehead Prop')
})

// ── invalid stays invalid ──────────────────────────────────────────────────────────────

test('invalid-provider fixture remains invalid (no M164 accessors)', () => {
  const s = createInvalidProviderScenario()
  assert.equal(s.id, 'invalid-provider')
  assert.equal(typeof s.squadLoader.getActivePlayers, 'undefined')
  assert.deepEqual(s.squadLoader, {})
  assert.equal(s.expected, undefined)
  // its decision source is still valid (the failure is specifically the squad loader)
  assert.equal(typeof s.decisionPlanSource.getCoachIdentity, 'function')
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('exports exist', () => {
  assert.equal(typeof createFullSquadScenario, 'function')
  assert.equal(typeof createInjuryThinnedScenario, 'function')
  assert.equal(typeof createInvalidProviderScenario, 'function')
})
