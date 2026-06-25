/**
 * coach-intelligence — Decision Intelligence Diff Engine (M192) tests
 *
 * Compares two already-completed decision states and reports what changed as deterministic codes.
 * It selects/scores/ranks nothing and recomputes no explanations. Hand-built decision states exercise
 * each change type.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { diffDecisions } from '../packages/coach-intelligence/index.js'

const starter = (playerId, codes = ['FORMATION_REQUIREMENT', 'POSITION_MATCH']) => ({ playerId, codes })
const benchP = (playerId, codes = ['BENCH_COVER']) => ({ playerId, codes })

const state = (over = {}) => ({
  starters: [starter('p1'), starter('p2')],
  bench: [benchP('b1')],
  captain: 'p1',
  viceCaptain: 'p2',
  riskCount: 1,
  coverage: 1,
  ...over,
})

// ── identical ──────────────────────────────────────────────────────────────────────────

test('identical decisions → no changes', () => {
  const out = diffDecisions(state(), state())
  assert.equal(out.summary.changed, false)
  assert.deepEqual(out.summary.codes, [])
  assert.deepEqual(out.playerChanges, [])
  assert.deepEqual(out.captainChanges, [])
  assert.deepEqual(out.explanationChanges, [])
  assert.equal(out.riskChanges.code, null)
  assert.equal(out.coverageChanges.code, null)
  assert.deepEqual(out.benchChanges, { beforeCount: 1, afterCount: 1, delta: 0, entered: [], left: [] })
})

// ── player role changes ──────────────────────────────────────────────────────────────

test('starter promoted (bench → starter)', () => {
  const after = state({ starters: [starter('p1'), starter('p2'), starter('b1')], bench: [] })
  const out = diffDecisions(state(), after)
  assert.deepEqual(out.playerChanges, [{ playerId: 'b1', code: 'PLAYER_PROMOTED' }])
  assert.deepEqual(out.benchChanges.left, ['b1'])
  assert.ok(out.summary.codes.includes('PLAYER_PROMOTED'))
})

test('starter demoted (starter → bench)', () => {
  const after = state({ starters: [starter('p1')], bench: [benchP('b1'), benchP('p2', ['BENCH_COVER'])], viceCaptain: null })
  const out = diffDecisions(state(), after)
  assert.deepEqual(out.playerChanges, [{ playerId: 'p2', code: 'PLAYER_DEMOTED' }])
  assert.ok(out.benchChanges.entered.includes('p2'))
})

test('player added', () => {
  const after = state({ starters: [starter('p1'), starter('p2'), starter('p3')] })
  const out = diffDecisions(state(), after)
  assert.deepEqual(out.playerChanges, [{ playerId: 'p3', code: 'PLAYER_ADDED' }])
})

test('player removed', () => {
  const after = state({ starters: [starter('p1')], viceCaptain: null })
  const out = diffDecisions(state(), after)
  assert.deepEqual(out.playerChanges, [{ playerId: 'p2', code: 'PLAYER_REMOVED' }])
})

// ── captain / vice ───────────────────────────────────────────────────────────────────

test('captain changed', () => {
  const out = diffDecisions(state(), state({ captain: 'p2' }))
  assert.deepEqual(out.captainChanges, [{ code: 'CAPTAIN_CHANGED', from: 'p1', to: 'p2' }])
  assert.ok(out.summary.codes.includes('CAPTAIN_CHANGED'))
})

test('vice-captain changed', () => {
  const out = diffDecisions(state(), state({ viceCaptain: 'p1' }))
  assert.deepEqual(out.captainChanges, [{ code: 'VICE_CAPTAIN_CHANGED', from: 'p2', to: 'p1' }])
})

// ── risk ───────────────────────────────────────────────────────────────────────────────

test('risk increased / decreased', () => {
  const inc = diffDecisions(state(), state({ riskCount: 3 }))
  assert.deepEqual(inc.riskChanges, { before: 1, after: 3, delta: 2, code: 'RISK_INCREASED' })
  const dec = diffDecisions(state(), state({ riskCount: 0 }))
  assert.deepEqual(dec.riskChanges, { before: 1, after: 0, delta: -1, code: 'RISK_DECREASED' })
})

// ── explanation codes ──────────────────────────────────────────────────────────────────

test('explanation gained', () => {
  const after = state({ starters: [starter('p1', ['FORMATION_REQUIREMENT', 'POSITION_MATCH', 'HIGH_ALIGNMENT']), starter('p2')] })
  const out = diffDecisions(state(), after)
  assert.deepEqual(out.explanationChanges, [{ playerId: 'p1', gained: ['HIGH_ALIGNMENT'], lost: [] }])
  assert.ok(out.summary.codes.includes('EXPLANATION_GAINED'))
})

test('explanation lost', () => {
  const after = state({ starters: [starter('p1', ['FORMATION_REQUIREMENT']), starter('p2')] })
  const out = diffDecisions(state(), after)
  assert.deepEqual(out.explanationChanges, [{ playerId: 'p1', gained: [], lost: ['POSITION_MATCH'] }])
  assert.ok(out.summary.codes.includes('EXPLANATION_LOST'))
})

// ── coverage ───────────────────────────────────────────────────────────────────────────

test('coverage increased / decreased / incomparable', () => {
  const inc = diffDecisions(state({ coverage: 0.8 }), state({ coverage: 1 }))
  assert.deepEqual(inc.coverageChanges, { before: 0.8, after: 1, delta: 0.2, code: 'COVERAGE_INCREASED' })
  const dec = diffDecisions(state({ coverage: 1 }), state({ coverage: 0.8 }))
  assert.equal(dec.coverageChanges.code, 'COVERAGE_DECREASED')
  const incomparable = diffDecisions(state({ coverage: null }), state({ coverage: 1 }))
  assert.deepEqual(incomparable.coverageChanges, { before: null, after: 1, delta: null, code: null })
})

// ── multiple simultaneous changes ───────────────────────────────────────────────────────

test('multiple simultaneous changes are all reported', () => {
  const before = state({ coverage: 0.8 })
  const after = state({
    starters: [starter('p1', ['FORMATION_REQUIREMENT', 'POSITION_MATCH', 'CAPTAIN_SELECTION']), starter('b1')],   // p2 removed, b1 promoted, p1 gained code
    bench: [],
    captain: 'b1',
    viceCaptain: null,
    riskCount: 3,
    coverage: 1,
  })
  const out = diffDecisions(before, after)
  assert.deepEqual(out.summary.codes, ['CAPTAIN_CHANGED', 'COVERAGE_INCREASED', 'EXPLANATION_GAINED', 'PLAYER_PROMOTED', 'PLAYER_REMOVED', 'RISK_INCREASED', 'VICE_CAPTAIN_CHANGED'])
  assert.equal(out.summary.changed, true)
  assert.deepEqual(out.playerChanges, [{ playerId: 'b1', code: 'PLAYER_PROMOTED' }, { playerId: 'p2', code: 'PLAYER_REMOVED' }])
})

// ── validation / determinism / frozen / mutation / export ───────────────────────────────

test('malformed input rejected clearly', () => {
  assert.throws(() => diffDecisions(null, state()), TypeError)
  assert.throws(() => diffDecisions(state(), null), TypeError)
  assert.throws(() => diffDecisions({ bench: [] }, state()), TypeError)                       // no starters
  assert.throws(() => diffDecisions(state(), { starters: [], bench: 'x' }), TypeError)         // bench not array
  assert.throws(() => diffDecisions(state(), { starters: [{ codes: [] }], bench: [] }), TypeError)   // starter without playerId
  assert.throws(() => diffDecisions({ starters: [starter('p1'), starter('p1')], bench: [] }, state()), TypeError)   // duplicate
})

test('deterministic — repeated runs are identical', () => {
  const before = state({ coverage: 0.8 })
  const after = state({ captain: 'p2', riskCount: 2 })
  assert.deepEqual(diffDecisions(before, after), diffDecisions(before, after))
})

test('output is deeply frozen', () => {
  const out = diffDecisions(state(), state({ captain: 'p2' }))
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.summary) && Object.isFrozen(out.playerChanges) &&
    Object.isFrozen(out.captainChanges) && Object.isFrozen(out.benchChanges) && Object.isFrozen(out.riskChanges) &&
    Object.isFrozen(out.explanationChanges) && Object.isFrozen(out.coverageChanges))
  assert.throws(() => out.playerChanges.push({}))
})

test('does not mutate the input decision states', () => {
  const before = state({ coverage: 0.8 })
  const after = state({ captain: 'p2' })
  const snap = JSON.stringify({ before, after })
  diffDecisions(before, after)
  assert.equal(JSON.stringify({ before, after }), snap)
})

test('export exists', () => {
  assert.equal(typeof diffDecisions, 'function')
})
