/**
 * coach-intelligence — Decision Intelligence Diff Presenter (M193) tests
 *
 * Pure presenter over an M192 decision diff: object/text/json formats, default, change count, empty
 * diff, determinism, frozen, malformed, export. Diffs are produced by diffDecisions (the presenter
 * itself never calls it).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { diffDecisions, summarizeDecisionDiff } from '../packages/coach-intelligence/index.js'

const starter = (playerId, codes = ['FORMATION_REQUIREMENT', 'POSITION_MATCH']) => ({ playerId, codes })
const benchP = (playerId, codes = ['BENCH_COVER']) => ({ playerId, codes })
const state = (over = {}) => ({ starters: [starter('p1'), starter('p2')], bench: [benchP('b1')], captain: 'p1', viceCaptain: 'p2', riskCount: 1, coverage: 1, ...over })

// a multi-change diff (mirrors the M192 multi-change scenario)
const multiDiff = () => diffDecisions(state({ coverage: 0.8 }), state({
  starters: [starter('p1', ['FORMATION_REQUIREMENT', 'POSITION_MATCH', 'CAPTAIN_SELECTION']), starter('b1')],
  bench: [], captain: 'b1', viceCaptain: null, riskCount: 3, coverage: 1,
}))

// ── object format ──────────────────────────────────────────────────────────────────────

test('object format returns the normalized diff with a change count', () => {
  const out = summarizeDecisionDiff(multiDiff(), 'object')
  assert.equal(out.changed, true)
  assert.equal(out.changeCount, 7)   // 2 player + 2 captain + 1 explanation + 1 risk + 1 coverage
  assert.deepEqual(out.codes, ['CAPTAIN_CHANGED', 'COVERAGE_INCREASED', 'EXPLANATION_GAINED', 'PLAYER_PROMOTED', 'PLAYER_REMOVED', 'RISK_INCREASED', 'VICE_CAPTAIN_CHANGED'])
  assert.deepEqual(out.playerChanges, [{ playerId: 'b1', code: 'PLAYER_PROMOTED' }, { playerId: 'p2', code: 'PLAYER_REMOVED' }])
  assert.deepEqual(out.captainChanges, [{ code: 'CAPTAIN_CHANGED', from: 'p1', to: 'b1' }, { code: 'VICE_CAPTAIN_CHANGED', from: 'p2', to: null }])
  assert.deepEqual(out.riskChanges, { before: 1, after: 3, delta: 2, code: 'RISK_INCREASED' })
  assert.deepEqual(out.coverageChanges, { before: 0.8, after: 1, delta: 0.2, code: 'COVERAGE_INCREASED' })
  assert.deepEqual(out.explanationChanges, [{ playerId: 'p1', gained: ['CAPTAIN_SELECTION'], lost: [] }])
  assert.deepEqual(out.benchChanges, { beforeCount: 1, afterCount: 0, delta: -1, entered: [], left: ['b1'] })
})

// ── text format ──────────────────────────────────────────────────────────────────────

test('text format renders deterministic lines', () => {
  const lines = summarizeDecisionDiff(multiDiff(), 'text').split('\n')
  assert.equal(lines[0], 'DecisionDiff changed=true changes=7 codes=CAPTAIN_CHANGED,COVERAGE_INCREASED,EXPLANATION_GAINED,PLAYER_PROMOTED,PLAYER_REMOVED,RISK_INCREASED,VICE_CAPTAIN_CHANGED')
  assert.equal(lines[1], 'player b1 PLAYER_PROMOTED')
  assert.equal(lines[2], 'player p2 PLAYER_REMOVED')
  assert.equal(lines[3], 'captain CAPTAIN_CHANGED from=p1 to=b1')
  assert.equal(lines[4], 'captain VICE_CAPTAIN_CHANGED from=p2 to=null')
  assert.equal(lines[5], 'risk before=1 after=3 RISK_INCREASED')
  assert.equal(lines[6], 'coverage before=0.8 after=1 COVERAGE_INCREASED')
  assert.equal(lines[7], 'explanation p1 gained=CAPTAIN_SELECTION lost=')
  assert.equal(lines[8], 'bench delta=-1 entered= left=b1')
})

// ── json format ──────────────────────────────────────────────────────────────────────

test('json format is deterministic and parses back to the object form', () => {
  const json = summarizeDecisionDiff(multiDiff(), 'json')
  assert.equal(typeof json, 'string')
  assert.deepEqual(JSON.parse(json), summarizeDecisionDiff(multiDiff(), 'object'))
})

// ── default / empty ─────────────────────────────────────────────────────────────────────

test('default format (omitted) is the object form', () => {
  assert.deepEqual(summarizeDecisionDiff(multiDiff()), summarizeDecisionDiff(multiDiff(), 'object'))
})

test('identical diff → changed=false, no changes, minimal text', () => {
  const diff = diffDecisions(state(), state())
  const out = summarizeDecisionDiff(diff, 'object')
  assert.equal(out.changed, false)
  assert.equal(out.changeCount, 0)
  assert.deepEqual(out.codes, [])
  assert.equal(summarizeDecisionDiff(diff, 'text'), 'DecisionDiff changed=false changes=0 codes=')
})

// ── determinism / frozen / mutation ──────────────────────────────────────────────────

test('deterministic — repeated calls are identical', () => {
  const diff = multiDiff()
  assert.deepEqual(summarizeDecisionDiff(diff, 'object'), summarizeDecisionDiff(diff, 'object'))
  assert.equal(summarizeDecisionDiff(diff, 'text'), summarizeDecisionDiff(diff, 'text'))
  assert.equal(summarizeDecisionDiff(diff, 'json'), summarizeDecisionDiff(diff, 'json'))
})

test('object output is deeply frozen', () => {
  const out = summarizeDecisionDiff(multiDiff(), 'object')
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.playerChanges) && Object.isFrozen(out.playerChanges[0]) &&
    Object.isFrozen(out.benchChanges) && Object.isFrozen(out.codes))
  assert.throws(() => { out.changeCount = 0 })
})

test('does not mutate the input diff', () => {
  const diff = multiDiff()
  const before = JSON.stringify(diff)
  summarizeDecisionDiff(diff, 'object')
  assert.equal(JSON.stringify(diff), before)
})

// ── validation / export ────────────────────────────────────────────────────────────────

test('malformed input is rejected clearly', () => {
  assert.throws(() => summarizeDecisionDiff(null), TypeError)
  assert.throws(() => summarizeDecisionDiff([]), TypeError)
  assert.throws(() => summarizeDecisionDiff({}), TypeError)                                  // missing sections
  assert.throws(() => summarizeDecisionDiff({ summary: {}, playerChanges: [], captainChanges: [], benchChanges: {}, riskChanges: {}, explanationChanges: [] }), TypeError)   // no coverageChanges
  assert.throws(() => summarizeDecisionDiff(multiDiff(), 'yaml'), TypeError)
})

test('export exists', () => {
  assert.equal(typeof summarizeDecisionDiff, 'function')
})
