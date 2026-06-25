/**
 * brain-decision-planner — Decision Diff Matrix Presenter (M197) tests
 *
 * Pure presenter over a hand-built M196 matrix result (we do NOT call runBrainDryRunDiffMatrix):
 * object/text/json formats, default, rollup, failed-pair safe defaults, determinism, frozen,
 * malformed, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { summarizeBrainDryRunDiffMatrix } from '../packages/brain-decision-planner/index.js'

const okPair = (id, codes, severity = 'NONE') => ({ id, ok: true, diff: { summary: { changed: codes.length > 0, codes } }, diffView: { changed: codes.length > 0, changeCount: codes.length, codes }, severity, error: null })
const failPair = (id, error) => ({ id, ok: false, diff: null, diffView: null, severity: null, error })
const makeMatrix = (pairs, rollup) => ({ total: pairs.length, passed: pairs.filter((p) => p.ok).length, failed: pairs.filter((p) => !p.ok).length, pairs, rollup })

const MATRIX = makeMatrix(
  [okPair('captain', ['CAPTAIN_CHANGED', 'PLAYER_PROMOTED'], 'MAJOR'), okPair('same', [], 'NONE'), failPair('bad', 'diff boom')],
  { changeCodeCounts: { CAPTAIN_CHANGED: 1, PLAYER_PROMOTED: 1 }, severityCounts: { MAJOR: 1, NONE: 1 }, changedPairCount: 1, unchangedPairCount: 1 },
)

// ── object ───────────────────────────────────────────────────────────────────────────

test('object format returns the normalized summary', () => {
  const out = summarizeBrainDryRunDiffMatrix(MATRIX, 'object')
  assert.equal(out.total, 3)
  assert.equal(out.passed, 2)
  assert.equal(out.failed, 1)
  assert.deepEqual(out.pairs[0], { id: 'captain', ok: true, changed: true, changeCount: 2, codes: ['CAPTAIN_CHANGED', 'PLAYER_PROMOTED'], severity: 'MAJOR', error: null })
  assert.deepEqual(out.pairs[1], { id: 'same', ok: true, changed: false, changeCount: 0, codes: [], severity: 'NONE', error: null })
  assert.deepEqual(out.pairs[2], { id: 'bad', ok: false, changed: false, changeCount: 0, codes: [], severity: null, error: 'diff boom' })
  assert.deepEqual(out.rollup, { changeCodeCounts: { CAPTAIN_CHANGED: 1, PLAYER_PROMOTED: 1 }, severityCounts: { MAJOR: 1, NONE: 1 }, changedPairCount: 1, unchangedPairCount: 1 })
})

// ── text ───────────────────────────────────────────────────────────────────────────────

test('text format renders deterministic lines + rollup', () => {
  const lines = summarizeBrainDryRunDiffMatrix(MATRIX, 'text').split('\n')
  assert.equal(lines[0], 'BrainDryRunDiffMatrix total=3 passed=2 failed=1 changed=1 unchanged=1')
  assert.equal(lines[1], 'captain ok=true changed=true changes=2 codes=CAPTAIN_CHANGED,PLAYER_PROMOTED severity=MAJOR')
  assert.equal(lines[2], 'same ok=true changed=false changes=0 codes= severity=NONE')
  assert.equal(lines[3], 'bad ok=false error="diff boom"')
  assert.equal(lines[4], 'rollup CAPTAIN_CHANGED=1 PLAYER_PROMOTED=1')
  assert.equal(lines[5], 'severity MAJOR=1 NONE=1')
})

test('empty rollup renders bare "rollup" and "severity" lines', () => {
  const m = makeMatrix([okPair('a', [])], { changeCodeCounts: {}, severityCounts: {}, changedPairCount: 0, unchangedPairCount: 1 })
  const lines = summarizeBrainDryRunDiffMatrix(m, 'text').split('\n')
  assert.equal(lines.at(-2), 'rollup')
  assert.equal(lines.at(-1), 'severity')
})

// ── json ───────────────────────────────────────────────────────────────────────────────

test('json format is deterministic and parses back to the object form', () => {
  const json = summarizeBrainDryRunDiffMatrix(MATRIX, 'json')
  assert.equal(typeof json, 'string')
  assert.deepEqual(JSON.parse(json), summarizeBrainDryRunDiffMatrix(MATRIX, 'object'))
})

// ── default / rollup keys sorted / safe defaults ────────────────────────────────────────

test('default format (omitted) is the object form', () => {
  assert.deepEqual(summarizeBrainDryRunDiffMatrix(MATRIX), summarizeBrainDryRunDiffMatrix(MATRIX, 'object'))
})

test('rollup changeCodeCounts keys are sorted', () => {
  const m = makeMatrix([okPair('a', [])], { changeCodeCounts: { RISK_INCREASED: 1, CAPTAIN_CHANGED: 2 }, changedPairCount: 0, unchangedPairCount: 1 })
  assert.deepEqual(Object.keys(summarizeBrainDryRunDiffMatrix(m, 'object').rollup.changeCodeCounts), ['CAPTAIN_CHANGED', 'RISK_INCREASED'])
})

test('missing rollup fields and diffView default safely', () => {
  const m = { total: 1, passed: 1, failed: 0, pairs: [{ id: 'x', ok: true }], rollup: {} }   // no diffView/severity, empty rollup
  const out = summarizeBrainDryRunDiffMatrix(m, 'object')
  assert.deepEqual(out.pairs[0], { id: 'x', ok: true, changed: false, changeCount: 0, codes: [], severity: null, error: null })
  assert.deepEqual(out.rollup, { changeCodeCounts: {}, severityCounts: {}, changedPairCount: 0, unchangedPairCount: 0 })
})

// ── determinism / frozen / mutation ──────────────────────────────────────────────────

test('deterministic — repeated calls are identical', () => {
  assert.deepEqual(summarizeBrainDryRunDiffMatrix(MATRIX, 'object'), summarizeBrainDryRunDiffMatrix(MATRIX, 'object'))
  assert.equal(summarizeBrainDryRunDiffMatrix(MATRIX, 'text'), summarizeBrainDryRunDiffMatrix(MATRIX, 'text'))
  assert.equal(summarizeBrainDryRunDiffMatrix(MATRIX, 'json'), summarizeBrainDryRunDiffMatrix(MATRIX, 'json'))
})

test('object output is deeply frozen', () => {
  const out = summarizeBrainDryRunDiffMatrix(MATRIX, 'object')
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.pairs) && Object.isFrozen(out.pairs[0]) && Object.isFrozen(out.rollup) && Object.isFrozen(out.rollup.changeCodeCounts))
  assert.throws(() => { out.passed = 0 })
})

test('does not mutate the input matrix', () => {
  const before = JSON.stringify(MATRIX)
  summarizeBrainDryRunDiffMatrix(MATRIX, 'object')
  assert.equal(JSON.stringify(MATRIX), before)
})

// ── validation / export ────────────────────────────────────────────────────────────────

test('malformed input is rejected clearly', () => {
  assert.throws(() => summarizeBrainDryRunDiffMatrix(null), TypeError)
  assert.throws(() => summarizeBrainDryRunDiffMatrix([]), TypeError)
  assert.throws(() => summarizeBrainDryRunDiffMatrix({ total: 1, passed: 1, failed: 0, pairs: [] }), TypeError)   // no rollup
  assert.throws(() => summarizeBrainDryRunDiffMatrix({ total: 1, passed: 1, failed: 0, rollup: {} }), TypeError)  // no pairs
  assert.throws(() => summarizeBrainDryRunDiffMatrix(makeMatrix([{ ok: true }], {})), TypeError)                  // pair has no id
  assert.throws(() => summarizeBrainDryRunDiffMatrix(MATRIX, 'yaml'), TypeError)
})

test('export exists', () => {
  assert.equal(typeof summarizeBrainDryRunDiffMatrix, 'function')
})
