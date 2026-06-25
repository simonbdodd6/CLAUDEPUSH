/**
 * brain-decision-planner — Brain Dry Run Matrix Presenter tests
 *
 * Pure presenter over a hand-built M179 matrix result (we do NOT call runBrainDryRunMatrix):
 * object/text/json formats, default, passRate, error rendering, safe defaults, explanation counts
 * (M187, read from M186's dryRun.explanationView), determinism, frozen object, malformed, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { summarizeBrainDryRunMatrix } from '../packages/brain-decision-planner/index.js'

const verification = (over = {}) => ({ hasSquadInput: true, hasDecisionInput: true, hasSquad: true, startingCount: 15, benchCount: 8, reserveCount: 1, warningCount: 0, ...over })
// minimal M186-shaped dry-run carrying the M185 explanationView.counts (read-only by the presenter)
const dryRunWith = (counts) => ({ explanationView: { counts } })
const okScenario = (id, v = verification(), dryRun = undefined) => ({ id, ok: true, dryRun, verification: v, error: null })
const failScenario = (id, error) => ({ id, ok: false, dryRun: null, verification: null, error })
const makeMatrix = (scenarios) => ({ total: scenarios.length, passed: scenarios.filter((s) => s.ok).length, failed: scenarios.filter((s) => !s.ok).length, scenarios })

const MATRIX = makeMatrix([
  okScenario('full-squad', verification(), dryRunWith({ starters: 15, bench: 8, risks: 0, alternatives: 1, confidenceNotes: 23 })),
  okScenario('injury-thinned', verification({ startingCount: 14, reserveCount: 0, warningCount: 1 }), dryRunWith({ starters: 14, bench: 8, risks: 1, alternatives: 0, confidenceNotes: 22 })),
  failScenario('invalid-provider', 'loaderToSelectionInputs: provider must implement getActivePlayers'),
])

// ── object format (incl. explanation counts) ──────────────────────────────────────────

test('object format returns the normalized summary with explanation counts', () => {
  const out = summarizeBrainDryRunMatrix(MATRIX, 'object')
  assert.equal(out.total, 3)
  assert.equal(out.passed, 2)
  assert.equal(out.failed, 1)
  assert.equal(out.passRate, 0.67)
  assert.deepEqual(out.scenarios[0], { id: 'full-squad', ok: true, startingCount: 15, benchCount: 8, reserveCount: 1, warningCount: 0, explanationStarterCount: 15, explanationBenchCount: 8, explanationRiskCount: 0, error: null })
  assert.deepEqual(out.scenarios[1], { id: 'injury-thinned', ok: true, startingCount: 14, benchCount: 8, reserveCount: 0, warningCount: 1, explanationStarterCount: 14, explanationBenchCount: 8, explanationRiskCount: 1, error: null })
  // failed scenario: explanation counts safely null
  assert.deepEqual(out.scenarios[2], { id: 'invalid-provider', ok: false, startingCount: 0, benchCount: 0, reserveCount: 0, warningCount: 0, explanationStarterCount: null, explanationBenchCount: null, explanationRiskCount: null, error: 'loaderToSelectionInputs: provider must implement getActivePlayers' })
})

// ── text format (incl. explanation counts on success lines) ───────────────────────────

test('text format renders explanation counts on success lines', () => {
  const lines = summarizeBrainDryRunMatrix(MATRIX, 'text').split('\n')
  assert.equal(lines[0], 'BrainDryRunMatrix total=3 passed=2 failed=1 passRate=0.67')
  assert.equal(lines[1], 'full-squad ok=true starting=15 bench=8 reserves=1 warnings=0 explanationStarters=15 explanationBench=8 explanationRisks=0')
  assert.equal(lines[2], 'injury-thinned ok=true starting=14 bench=8 reserves=0 warnings=1 explanationStarters=14 explanationBench=8 explanationRisks=1')
  assert.equal(lines[3], 'invalid-provider ok=false error="loaderToSelectionInputs: provider must implement getActivePlayers"')
})

// ── json format (incl. explanation counts) ─────────────────────────────────────────────

test('json format is deterministic, parses back to object, and carries explanation counts', () => {
  const json = summarizeBrainDryRunMatrix(MATRIX, 'json')
  assert.equal(typeof json, 'string')
  const parsed = JSON.parse(json)
  assert.deepEqual(parsed, summarizeBrainDryRunMatrix(MATRIX, 'object'))
  assert.equal(parsed.scenarios[0].explanationStarterCount, 15)
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

// ── failed / missing explanation default safely ────────────────────────────────────────

test('failed scenario renders its error, zeroed verification counts, null explanation counts', () => {
  const out = summarizeBrainDryRunMatrix(makeMatrix([failScenario('boom', 'kaboom')]), 'object')
  assert.deepEqual(out.scenarios[0], { id: 'boom', ok: false, startingCount: 0, benchCount: 0, reserveCount: 0, warningCount: 0, explanationStarterCount: null, explanationBenchCount: null, explanationRiskCount: null, error: 'kaboom' })
})

test('success scenario without explanation on dryRun → null explanation counts, no text segment', () => {
  const noExpl = okScenario('no-expl', verification(), {})   // dryRun present but no explanationView
  const out = summarizeBrainDryRunMatrix(makeMatrix([noExpl]), 'object')
  assert.equal(out.scenarios[0].explanationStarterCount, null)
  const line = summarizeBrainDryRunMatrix(makeMatrix([noExpl]), 'text').split('\n')[1]
  assert.equal(line, 'no-expl ok=true starting=15 bench=8 reserves=1 warnings=0')   // no explanation segment
})

test('explanation counts fall back to explanation section lengths when explanationView absent', () => {
  const withExpl = okScenario('fb', verification(), { explanation: { starters: [1, 2, 3], bench: [1, 2], risks: [1] } })
  const out = summarizeBrainDryRunMatrix(makeMatrix([withExpl]), 'object')
  assert.equal(out.scenarios[0].explanationStarterCount, 3)
  assert.equal(out.scenarios[0].explanationBenchCount, 2)
  assert.equal(out.scenarios[0].explanationRiskCount, 1)
})

test('missing verification fields default safely to 0', () => {
  const partial = { id: 'p', ok: true, dryRun: {}, verification: { startingCount: 12 }, error: null }
  const out = summarizeBrainDryRunMatrix(makeMatrix([partial]), 'object')
  assert.deepEqual(out.scenarios[0], { id: 'p', ok: true, startingCount: 12, benchCount: 0, reserveCount: 0, warningCount: 0, explanationStarterCount: null, explanationBenchCount: null, explanationRiskCount: null, error: null })
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

test('does not mutate the input matrix', () => {
  const before = JSON.stringify(MATRIX)
  summarizeBrainDryRunMatrix(MATRIX, 'object')
  assert.equal(JSON.stringify(MATRIX), before)
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
