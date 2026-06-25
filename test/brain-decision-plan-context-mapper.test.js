/**
 * brain-decision-planner — Decision / Plan Context Mapper tests
 *
 * Maps an M167 provider to { fixture, match, coachContext }: validator enforced, accessors called
 * once each, exact shape, frozen result, no mutation, determinism, error + validation propagation,
 * export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mapDecisionPlanContext } from '../packages/brain-decision-planner/index.js'

const FIXTURE = { fixtureId: 'fix_1', opponent: 'Leinster', competition: 'AIL', venue: 'Home', date: '2026-07-05' }
const MATCH = { category: 'selection-preference', confidence: 0.7, matchedSignals: ['form'] }
const IDENTITY = { coachId: 'coach-demo', clubId: 'boitsfort-rfc', tags: [] }

function makeProvider(over = {}) {
  const calls = { fixture: 0, identity: 0 }
  const provider = {
    getFixtureContext: () => { calls.fixture++; return { fixture: FIXTURE, match: MATCH } },
    getCoachIdentity: () => { calls.identity++; return IDENTITY },
    ...over,
  }
  return { provider, calls }
}

// ── shape / direct passthrough ───────────────────────────────────────────────────────

test('maps the provider to { fixture, match, coachContext }', () => {
  const out = mapDecisionPlanContext(makeProvider().provider)
  assert.deepEqual(Object.keys(out).sort(), ['coachContext', 'fixture', 'match'])
  assert.deepEqual(out.fixture, FIXTURE)
  assert.deepEqual(out.match, MATCH)
  assert.deepEqual(out.coachContext, IDENTITY)
})

// ── single accessor calls ────────────────────────────────────────────────────────────

test('calls each provider accessor exactly once', () => {
  const { provider, calls } = makeProvider()
  mapDecisionPlanContext(provider)
  assert.deepEqual(calls, { fixture: 1, identity: 1 })
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('validator runs — invalid providers are rejected', () => {
  assert.throws(() => mapDecisionPlanContext(null), TypeError)
  assert.throws(() => mapDecisionPlanContext({}), TypeError)
  assert.throws(() => mapDecisionPlanContext(makeProvider({ getFixtureContext: undefined }).provider), /getFixtureContext/)
  assert.throws(() => mapDecisionPlanContext(makeProvider({ getCoachIdentity: 5 }).provider), TypeError)
})

// ── error propagation ────────────────────────────────────────────────────────────────

test('an accessor error propagates', () => {
  const { provider } = makeProvider({ getFixtureContext: () => { throw new Error('context unavailable') } })
  assert.throws(() => mapDecisionPlanContext(provider), /context unavailable/)
})

// ── frozen / no mutation ─────────────────────────────────────────────────────────────

test('result is deeply frozen', () => {
  const out = mapDecisionPlanContext(makeProvider().provider)
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.fixture) && Object.isFrozen(out.match) && Object.isFrozen(out.coachContext))
  assert.throws(() => { out.fixture.opponent = 'x' })
  assert.throws(() => { out.coachContext = null })
})

test('does not mutate or freeze the provider data', () => {
  mapDecisionPlanContext(makeProvider().provider)
  assert.equal(Object.isFrozen(FIXTURE), false)     // deep-copied → provider data untouched
  assert.equal(Object.isFrozen(MATCH), false)
  assert.equal(Object.isFrozen(IDENTITY), false)
})

// ── determinism ──────────────────────────────────────────────────────────────────────

test('deterministic — identical provider → identical output', () => {
  assert.deepEqual(mapDecisionPlanContext(makeProvider().provider), mapDecisionPlanContext(makeProvider().provider))
})

test('repeated calls on the same provider are identical', () => {
  const { provider } = makeProvider()
  assert.deepEqual(mapDecisionPlanContext(provider), mapDecisionPlanContext(provider))
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof mapDecisionPlanContext, 'function')
})
