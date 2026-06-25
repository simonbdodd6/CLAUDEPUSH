/**
 * brain-decision-planner — Decision Diff Severity Filter (M202) tests
 *
 * Pure query over an M196 matrix result: surfaces pairs at/above a severity band.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { filterDiffMatrixBySeverity } from '../packages/brain-decision-planner/index.js'

const okPair = (id, severity) => ({ id, ok: true, diff: { summary: { changed: severity !== 'NONE', codes: [] } }, diffView: { changed: severity !== 'NONE', changeCount: 0, codes: [] }, severity, error: null })
const failPair = (id) => ({ id, ok: false, diff: null, diffView: null, severity: null, error: 'boom' })
const matrix = (pairs) => ({ total: pairs.length, passed: pairs.filter((p) => p.ok).length, failed: pairs.filter((p) => !p.ok).length, pairs, rollup: { changeCodeCounts: {}, severityCounts: {}, changedPairCount: 0, unchangedPairCount: 0 } })

const M = matrix([okPair('none', 'NONE'), okPair('minor', 'MINOR'), okPair('major', 'MAJOR'), okPair('critical', 'CRITICAL'), failPair('bad')])

// ── threshold filtering ────────────────────────────────────────────────────────────────

test('filters pairs at or above the band', () => {
  const out = filterDiffMatrixBySeverity(M, 'MAJOR')
  assert.equal(out.minSeverity, 'MAJOR')
  assert.equal(out.total, 5)
  assert.equal(out.matched, 2)
  assert.deepEqual(out.pairs.map((p) => p.id), ['major', 'critical'])
  assert.deepEqual(out.severityCounts, { CRITICAL: 1, MAJOR: 1 })
})

test('MINOR threshold includes everything scored above NONE', () => {
  const out = filterDiffMatrixBySeverity(M, 'MINOR')
  assert.deepEqual(out.pairs.map((p) => p.id), ['minor', 'major', 'critical'])
  assert.equal(out.matched, 3)
})

test('NONE threshold includes all scored pairs (failed/unscored excluded)', () => {
  const out = filterDiffMatrixBySeverity(M, 'NONE')
  assert.deepEqual(out.pairs.map((p) => p.id), ['none', 'minor', 'major', 'critical'])
  assert.equal(out.matched, 4)   // 'bad' (null severity) excluded
})

test('CRITICAL threshold narrows to the top band', () => {
  const out = filterDiffMatrixBySeverity(M, 'CRITICAL')
  assert.deepEqual(out.pairs.map((p) => p.id), ['critical'])
  assert.deepEqual(out.severityCounts, { CRITICAL: 1 })
})

test('no matches → empty pairs, empty counts', () => {
  const out = filterDiffMatrixBySeverity(matrix([okPair('a', 'MINOR'), failPair('b')]), 'MAJOR')
  assert.equal(out.matched, 0)
  assert.deepEqual(out.pairs, [])
  assert.deepEqual(out.severityCounts, {})
})

// ── order / determinism / frozen / mutation / validation / export ───────────────────────

test('preserves matrix order in the matched pairs', () => {
  const out = filterDiffMatrixBySeverity(matrix([okPair('z', 'MAJOR'), okPair('a', 'CRITICAL')]), 'MAJOR')
  assert.deepEqual(out.pairs.map((p) => p.id), ['z', 'a'])   // input order, not re-sorted
})

test('deterministic — repeated calls are identical', () => {
  assert.deepEqual(filterDiffMatrixBySeverity(M, 'MINOR'), filterDiffMatrixBySeverity(M, 'MINOR'))
})

test('output is deeply frozen', () => {
  const out = filterDiffMatrixBySeverity(M, 'MAJOR')
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.pairs) && Object.isFrozen(out.pairs[0]) && Object.isFrozen(out.severityCounts))
  assert.throws(() => out.pairs.push({}))
})

test('does not mutate the input matrix', () => {
  const before = JSON.stringify(M)
  filterDiffMatrixBySeverity(M, 'MAJOR')
  assert.equal(JSON.stringify(M), before)
})

test('malformed input rejected clearly', () => {
  assert.throws(() => filterDiffMatrixBySeverity(M, 'HUGE'), TypeError)        // bad band
  assert.throws(() => filterDiffMatrixBySeverity(M, 5), TypeError)
  assert.throws(() => filterDiffMatrixBySeverity(null, 'MAJOR'), TypeError)
  assert.throws(() => filterDiffMatrixBySeverity({}, 'MAJOR'), TypeError)       // no pairs
})

test('export exists', () => {
  assert.equal(typeof filterDiffMatrixBySeverity, 'function')
})
