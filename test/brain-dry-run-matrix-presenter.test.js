/**
 * brain-decision-planner — Brain Dry Run Matrix Presenter tests
 *
 * Pure presenter over a hand-built M179 matrix result (we do NOT call runBrainDryRunMatrix):
 * object/text/json formats, default, passRate, error rendering, safe defaults, determinism,
 * frozen object, malformed input, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { summarizeBrainDryRunMatrix } from '../packages/brain-decision-planner/index.js'

const verification = (over = {}) => ({ hasSquadInput: true, hasDecisionInput: true, hasSquad: true, startingCount: 15, benchCount: 8, reserveCount: 1, warningCount: 0, ...over })
const okScenario = (id, v = verification()) => ({ id, ok: true, dryRun: {}, verification: v, error: null })
const failScenario = (id, error) => ({ id, ok: false, dryRun: null, verification: null, error })
const makeMatrix = (scenarios) => ({ total: scenarios.length, passed: scenarios.filter((s) => s.ok).length, failed: scenarios.filter((s) => !s.ok).length, scenarios })

const MATRIX = makeMatrix([
  okScenario('full-squad'),
  okScenario('injury-thinned', verification({ startingCount: 14, reserveCount: 0, warningCount: 1 })),
  failScenario('invalid-provider', 'loaderToSelectionInputs: provider must implement getActivePlayers'),
])

// ── object format ──────────────────────────────────────────────────────────────────────

test('object format returns the normalized summary', () => {
  const out = summarizeBrainDryRunMatrix(MATRIX, 'object')
  assert.equal(out.total, 3)
  assert.equal(out.passed, 2)
  assert.equal(out.failed, 1)
  assert.equal(out.passRate, 0.67)
  assert.deepEqual(out.scenarios[0], { id: 'full-squad', ok: true, startingCount: 15, benchCount: 8, reserveCount: 1, warningCount: 0, error: null })
  assert.deepEqual(out.scenarios[2], { id: 'invalid-provider', ok: false, startingCount: 0, benchCount: 0, reserveCount: 0, warningCount: 0, error: 'loaderToSelectionInputs: provider must implement getActivePlayers' })
})

// ── text format ──────────────────────────────────────────────────────────────────────

test('text format renders a deterministic multi-line string', () => {
  const out = summarizeBrainDryRunMatrix(MATRIX, 'text')
  const lines = out.split('\n')
  assert.equal(lines[0], 'BrainDryRunMatrix total=3 passed=2 failed=1 passRate=0.67')
  assert.equal(lines[1], 'full-squad ok=true starting=15 bench=8 reserves=1 warnings=0')
  assert.equal(lines[2], 'injury-thinned ok=true starting=14 bench=8 reserves=0 warnings=1')
  assert.equal(lines[3], 'invalid-provider ok=false error="loaderToSelectionInputs: provider must implement getActivePlayers"')
})

// ── json format ──────────────────────────────────────────────────────────────────────

test('json format is deterministic and parses back to the object summary', () => {
  const json = summarizeBrainDryRunMatrix(MATRIX, 'json')
  assert.equal(typeof json, 'string')
  assert.deepEqual(JSON.parse(json), summarizeBrainDryRunMatrix(MATRIX, 'object'))
})

// ── default / passRate ─────────────────────────────────────────────────────────────────

test('default format (omitted) is the object summary', () => {
  assert.deepEqual(summarizeBrainDryRunMatrix(MATRIX), summarizeBrainDryRunMatrix(MATRIX, 'object'))
})

test('passRate: all pass → 1, none → 0, empty → 0', () => {
  assert.equal(summarizeBrainDryRunMatrix(makeMatrix([okScenario('a'), okScenario('b')]), 'object').passRate, 1)
  assert.equal(summarizeBrainDryRunMatrix(makeMatrix([failScenario('a', 'x')]), 'object').passRate, 0)
  assert.equal(summarizeBrainDryRunMatrix(makeMatrix([]), 'object').passRate, 0)
})

// ── error rendering / safe defaults ────────────────────────────────────────────────────

test('failed scenario renders its error and zeroed counts', () => {
  const out = summarizeBrainDryRunMatrix(makeMatrix([failScenario('boom', 'kaboom')]), 'object')
  assert.deepEqual(out.scenarios[0], { id: 'boom', ok: false, startingCount: 0, benchCount: 0, reserveCount: 0, warningCount: 0, error: 'kaboom' })
})

test('missing verification fields default safely to 0', () => {
  const partial = { id: 'p', ok: true, dryRun: {}, verification: { startingCount: 12 }, error: null }   // no bench/reserve/warning
  const nullV = { id: 'n', ok: true, dryRun: {}, verification: null, error: null }
  const out = summarizeBrainDryRunMatrix(makeMatrix([partial, nullV]), 'object')
  assert.deepEqual(out.scenarios[0], { id: 'p', ok: true, startingCount: 12, benchCount: 0, reserveCount: 0, warningCount: 0, error: null })
  assert.deepEqual(out.scenarios[1], { id: 'n', ok: true, startingCount: 0, benchCount: 0, reserveCount: 0, warningCount: 0, error: null })
})

// ── determinism / frozen ───────────────────────────────────────────────────────────────

test('deterministic — repeated calls are identical', () => {
  assert.deepEqual(summarizeBrainDryRunMatrix(MATRIX, 'object'), summarizeBrainDryRunMatrix(MATRIX, 'object'))
  assert.equal(summarizeBrainDryRunMatrix(MATRIX, 'text'), summarizeBrainDryRunMatrix(MATRIX, 'text'))
  assert.equal(summarizeBrainDryRunMatrix(MATRIX, 'json'), summarizeBrainDryRunMatrix(MATRIX, 'json'))
})

test('object output is deeply frozen', () => {
  const out = summarizeBrainDryRunMatrix(MATRIX, 'object')
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.scenarios) && Object.isFrozen(out.scenarios[0]))
  assert.throws(() => { out.passed = 0 })
})

// ── validation / export ────────────────────────────────────────────────────────────────

test('malformed input is rejected clearly', () => {
  assert.throws(() => summarizeBrainDryRunMatrix(null), TypeError)
  assert.throws(() => summarizeBrainDryRunMatrix([]), TypeError)
  assert.throws(() => summarizeBrainDryRunMatrix({ total: 1, passed: 1, failed: 0 }), TypeError)          // no scenarios
  assert.throws(() => summarizeBrainDryRunMatrix(makeMatrix([{ ok: true }])), TypeError)                  // scenario has no id
  assert.throws(() => summarizeBrainDryRunMatrix(MATRIX, 'yaml'), TypeError)                              // bad format
})

test('export exists', () => {
  assert.equal(typeof summarizeBrainDryRunMatrix, 'function')
})
