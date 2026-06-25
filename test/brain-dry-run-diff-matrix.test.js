/**
 * brain-decision-planner — Decision Diff Matrix (M196) tests
 *
 * Runs the M194 dry-run diff harness across before/after pairs and rolls up the change codes. Most
 * tests inject a fake diff for controlled codes; one drives the real diffBrainDryRuns end-to-end.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runBrainDryRunDiffMatrix } from '../packages/brain-decision-planner/index.js'

// fake M194 result with a controlled code set (matrix reads result.diff / result.diffView)
const fr = (codes) => ({ beforeSummary: {}, afterSummary: {}, diff: { summary: { changed: codes.length > 0, codes } }, diffView: { changed: codes.length > 0, changeCount: codes.length, codes } })
const fakeDeps = { diff: (before, after) => { if (after && after.fail) throw new Error('diff boom'); return fr((after && after.codes) || []) } }
const pair = (id, codes, extra = {}) => ({ id, before: {}, after: { codes }, ...extra })
const failPair = (id) => ({ id, before: {}, after: { fail: true } })

// ── happy path ───────────────────────────────────────────────────────────────────────

test('all pairs pass', () => {
  const out = runBrainDryRunDiffMatrix([pair('a', ['CAPTAIN_CHANGED']), pair('b', [])], {}, fakeDeps)
  assert.equal(out.total, 2)
  assert.equal(out.passed, 2)
  assert.equal(out.failed, 0)
  assert.ok(out.pairs.every((p) => p.ok && p.error === null && p.diff && p.diffView))
})

// ── failure isolation ──────────────────────────────────────────────────────────────────

test('one pair fails while later pairs still run', () => {
  const out = runBrainDryRunDiffMatrix([pair('a', ['CAPTAIN_CHANGED']), failPair('bad'), pair('c', ['PLAYER_PROMOTED'])], {}, fakeDeps)
  assert.equal(out.total, 3)
  assert.equal(out.passed, 2)
  assert.equal(out.failed, 1)
  const bad = out.pairs.find((p) => p.id === 'bad')
  assert.equal(bad.ok, false)
  assert.equal(bad.diff, null)
  assert.equal(bad.diffView, null)
  assert.equal(typeof bad.error, 'string')
  assert.equal(out.pairs.find((p) => p.id === 'c').ok, true)   // ran after the failure
})

test('order is preserved', () => {
  const out = runBrainDryRunDiffMatrix([pair('a', []), failPair('bad'), pair('c', [])], {}, fakeDeps)
  assert.deepEqual(out.pairs.map((p) => p.id), ['a', 'bad', 'c'])
})

// ── rollup ───────────────────────────────────────────────────────────────────────────

test('rollup counts change codes across successful pairs', () => {
  const out = runBrainDryRunDiffMatrix([
    pair('a', ['CAPTAIN_CHANGED', 'PLAYER_PROMOTED']),
    failPair('bad'),                 // excluded from rollup
    pair('b', ['PLAYER_PROMOTED']),
    pair('c', []),                   // unchanged
  ], {}, fakeDeps)
  assert.deepEqual(out.rollup.changeCodeCounts, { CAPTAIN_CHANGED: 1, PLAYER_PROMOTED: 2 })
  assert.equal(out.rollup.changedPairCount, 2)
  assert.equal(out.rollup.unchangedPairCount, 1)
})

test('changeCodeCounts keys are sorted deterministically', () => {
  const out = runBrainDryRunDiffMatrix([pair('a', ['RISK_INCREASED', 'CAPTAIN_CHANGED', 'PLAYER_ADDED'])], {}, fakeDeps)
  assert.deepEqual(Object.keys(out.rollup.changeCodeCounts), ['CAPTAIN_CHANGED', 'PLAYER_ADDED', 'RISK_INCREASED'])
})

// ── expected partial match ──────────────────────────────────────────────────────────────

test('expected is a partial match over diffView (mismatch fails without throwing)', () => {
  const ok = runBrainDryRunDiffMatrix([pair('a', ['CAPTAIN_CHANGED'], { expected: { changed: true } })], {}, fakeDeps)
  assert.equal(ok.passed, 1)
  const bad = runBrainDryRunDiffMatrix([pair('a', ['CAPTAIN_CHANGED'], { expected: { changed: false } })], {}, fakeDeps)
  assert.equal(bad.passed, 0)
  assert.equal(bad.failed, 1)
  assert.equal(bad.pairs[0].ok, false)
  assert.equal(bad.pairs[0].error, null)                  // it ran; it just didn't match
  assert.equal(bad.rollup.changeCodeCounts.CAPTAIN_CHANGED, 1)   // still counted in rollup
})

// ── real end-to-end (default deps = diffBrainDryRuns) ───────────────────────────────────

function dryRun(opts = {}) {
  const starters = opts.starters ?? [{ playerId: 'p1', explanationCodes: ['FORMATION_REQUIREMENT', 'POSITION_MATCH'] }, { playerId: 'p2', explanationCodes: ['FORMATION_REQUIREMENT'] }]
  const bench = opts.bench ?? [{ playerId: 'b1', explanationCodes: ['BENCH_COVER'] }]
  const risks = opts.risks ?? [{ type: 'review-required', severity: 'MEDIUM', playerId: 'p2' }]
  return {
    brainInputs: {}, summary: {},
    capstone: { squad: { captain: 'captain' in opts ? opts.captain : { playerId: 'p1' }, viceCaptain: { playerId: 'p2' } } },
    verification: { startingCount: starters.length },
    explanation: { summary: {}, starters, bench, risks, alternatives: [], confidenceNotes: [] },
    explanationView: { counts: { starters: starters.length } },
  }
}

test('real diffBrainDryRuns path rolls up a genuine change', () => {
  const out = runBrainDryRunDiffMatrix([
    { id: 'same', before: dryRun(), after: dryRun() },
    { id: 'captain', before: dryRun(), after: dryRun({ captain: { playerId: 'p2' } }) },
  ], {})
  assert.equal(out.total, 2)
  assert.equal(out.passed, 2)
  assert.equal(out.rollup.changeCodeCounts.CAPTAIN_CHANGED, 1)
  assert.equal(out.rollup.changedPairCount, 1)
  assert.equal(out.rollup.unchangedPairCount, 1)
})

// ── determinism / frozen / mutation / validation / export ───────────────────────────────

test('deterministic — repeated runs are identical', () => {
  const pairs = [pair('a', ['CAPTAIN_CHANGED']), failPair('bad'), pair('c', ['PLAYER_PROMOTED'])]
  assert.deepEqual(runBrainDryRunDiffMatrix(pairs, {}, fakeDeps), runBrainDryRunDiffMatrix(pairs, {}, fakeDeps))
})

test('output is deeply frozen', () => {
  const out = runBrainDryRunDiffMatrix([pair('a', ['CAPTAIN_CHANGED'])], {}, fakeDeps)
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.pairs) && Object.isFrozen(out.pairs[0]) && Object.isFrozen(out.rollup) && Object.isFrozen(out.rollup.changeCodeCounts))
  assert.throws(() => { out.passed = 0 })
  assert.throws(() => out.pairs.push({}))
})

test('does not mutate the input pairs', () => {
  const pairs = [pair('a', ['CAPTAIN_CHANGED']), pair('b', [])]
  const before = JSON.stringify(pairs)
  runBrainDryRunDiffMatrix(pairs, {}, fakeDeps)
  assert.equal(JSON.stringify(pairs), before)
  assert.equal(Object.isFrozen(pairs[0]), false)
})

test('malformed input rejected clearly', () => {
  assert.throws(() => runBrainDryRunDiffMatrix('nope'), TypeError)
  assert.throws(() => runBrainDryRunDiffMatrix([null], {}, fakeDeps), TypeError)
  assert.throws(() => runBrainDryRunDiffMatrix([{ before: {}, after: {} }], {}, fakeDeps), TypeError)   // no id
  assert.throws(() => runBrainDryRunDiffMatrix([pair('a', [], { expected: 'x' })], {}, fakeDeps), TypeError)
  assert.throws(() => runBrainDryRunDiffMatrix([pair('a', [])], 'x', fakeDeps), TypeError)
})

test('export exists', () => {
  assert.equal(typeof runBrainDryRunDiffMatrix, 'function')
})
