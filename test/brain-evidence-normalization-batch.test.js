/**
 * M53 — @brain/evidence-normalization batch normalization plan unit tests
 *
 * Deterministic tests for the dormant batch helper (registry × records × context →
 * one frozen plan): empty batch, all-ok, mixed statuses, aggregate counts, order
 * preservation, context passthrough to every invocation, registry + input
 * immutability, frozen result, deterministic shape — and purity + dormancy.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import {
  createNormalizerRegistry,
  planBatchNormalization, INVOCATION_STATUS,
  NormalizationError, NORMALIZATION_ERROR,
} from '@brain/evidence-normalization'
import { SOURCE_TYPE, SIGNAL_POLARITY } from '@brain/evidence-contracts'

const REPO = join(fileURLToPath(new URL('..', import.meta.url)))
const TEST_FILE = fileURLToPath(import.meta.url)
const PKG_DIR = join(REPO, 'packages', 'brain-evidence-normalization')

const isInvalidInput = (e) => e instanceof NormalizationError && e.code === NORMALIZATION_ERROR.INVALID_INPUT

const CTX = Object.freeze({ now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' })
const signal = (id, over = {}) => ({
  key: 'lineout.winRate', value: 0.82, unit: null,
  polarity: SIGNAL_POLARITY.STRENGTH, confidence: 0.7, evidenceId: id, ...over,
})
const record = (id, sourceType = SOURCE_TYPE.PROVIDER_FRAME_SPORTS) =>
  Object.freeze({ id, sourceType, confidence: 0.8 })

// normalizer that emits one valid signal back-referencing the record it is given
const frame = Object.freeze({
  sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS,
  version: '1.0',
  normalize: (rec) => [signal(rec.id)],
})
// a manual normalizer that emits an INVALID signal (bad key)
const badNote = Object.freeze({
  sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE,
  version: '1.0',
  normalize: (rec) => [signal(rec.id, { key: 'bad key' })],
})
const REG = createNormalizerRegistry([frame, badNote])

// ── empty batch ─────────────────────────────────────────────────────────────────────

test('empty batch — total 0, allOk true, empty results/problems, frozen', () => {
  const plan = planBatchNormalization(REG, [], CTX)
  assert.equal(plan.total, 0)
  assert.equal(plan.allOk, true)
  assert.deepEqual(plan.counts, { total: 0, ok: 0, unknown_source: 0, invalid_signals: 0 })
  assert.deepEqual(plan.results, [])
  assert.deepEqual(plan.problems, [])
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.results) && Object.isFrozen(plan.counts))
})

// ── all successful ──────────────────────────────────────────────────────────────────

test('all successful records — allOk, counts.ok = total, no problems', () => {
  const plan = planBatchNormalization(REG, [record('ev_1'), record('ev_2')], CTX)
  assert.equal(plan.total, 2)
  assert.equal(plan.allOk, true)
  assert.deepEqual(plan.counts, { total: 2, ok: 2, unknown_source: 0, invalid_signals: 0 })
  assert.deepEqual(plan.problems, [])
  assert.ok(plan.results.every(r => r.invocation.status === INVOCATION_STATUS.OK))
})

// ── mixed statuses + aggregate counts ───────────────────────────────────────────────

test('mixed ok / unknown_source / invalid_signals — counts + problems correct', () => {
  const records = [
    record('ev_ok'),                                            // ok
    record('ev_unknown', SOURCE_TYPE.MANUAL_SCOUTING_NOTE),     // no normalizer → unknown_source
    record('ev_bad', SOURCE_TYPE.MANUAL_MATCH_NOTE),            // badNote → invalid_signals
  ]
  const plan = planBatchNormalization(REG, records, CTX)
  assert.equal(plan.total, 3)
  assert.equal(plan.allOk, false)
  assert.deepEqual(plan.counts, { total: 3, ok: 1, unknown_source: 1, invalid_signals: 1 })

  assert.deepEqual(plan.results.map(r => r.invocation.status), [
    INVOCATION_STATUS.OK, INVOCATION_STATUS.UNKNOWN_SOURCE, INVOCATION_STATUS.INVALID_SIGNALS,
  ])
  // problems only for the two non-ok records, with index + recordId traceability
  assert.deepEqual(plan.problems.map(p => p.recordId), ['ev_unknown', 'ev_bad'])
  assert.deepEqual(plan.problems.map(p => p.index), [1, 2])
  assert.ok(plan.problems[0].problems.some(m => /no normalizer registered/.test(m)))
  assert.ok(plan.problems[1].problems.some(m => /^signal\[0\]:/.test(m)))
})

// ── ordering preserved ──────────────────────────────────────────────────────────────

test('per-record ordering preserved — results follow input order with correct index', () => {
  const ids = ['c', 'a', 'b', 'a2']
  const plan = planBatchNormalization(REG, ids.map(id => record(id)), CTX)
  assert.deepEqual(plan.results.map(r => r.recordId), ids)
  assert.deepEqual(plan.results.map(r => r.index), [0, 1, 2, 3])
})

// ── context passthrough ─────────────────────────────────────────────────────────────

test('context is passed through to every invocation (frozen, exact)', () => {
  const seen = []
  const spy = { sourceType: SOURCE_TYPE.PROVIDER_VIDEO, version: '1.0', normalize: (rec, ctx) => { seen.push(ctx); return [] } }
  const reg = createNormalizerRegistry([spy])
  planBatchNormalization(reg, [record('ev_1', SOURCE_TYPE.PROVIDER_VIDEO), record('ev_2', SOURCE_TYPE.PROVIDER_VIDEO)], CTX)
  assert.equal(seen.length, 2)
  for (const ctx of seen) {
    assert.deepEqual(ctx, { now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' })
    assert.ok(Object.isFrozen(ctx))
  }
})

// ── no mutation ─────────────────────────────────────────────────────────────────────

test('registry is not mutated by the batch', () => {
  const before = REG.keys()
  planBatchNormalization(REG, [record('ev_1')], CTX)
  assert.equal(REG.size, 2)
  assert.deepEqual(REG.keys(), before)
})

test('input records array + records are not mutated', () => {
  const records = [record('ev_1'), record('ev_2')]
  const snapshot = JSON.stringify(records)
  planBatchNormalization(REG, records, CTX)
  assert.equal(records.length, 2)
  assert.equal(JSON.stringify(records), snapshot)
})

// ── immutability + determinism ──────────────────────────────────────────────────────

test('result is deeply frozen', () => {
  const plan = planBatchNormalization(REG, [record('ev_1'), record('ev_bad', SOURCE_TYPE.MANUAL_MATCH_NOTE)], CTX)
  assert.ok(Object.isFrozen(plan))
  assert.ok(plan.results.every(r => Object.isFrozen(r)))
  assert.ok(plan.problems.every(p => Object.isFrozen(p)))
  assert.throws(() => plan.results.push({}))
})

test('deterministic — identical inputs → identical plan', () => {
  const records = [record('ev_1'), record('ev_unknown', SOURCE_TYPE.MANUAL_SCOUTING_NOTE)]
  assert.deepEqual(planBatchNormalization(REG, records, CTX), planBatchNormalization(REG, records, CTX))
})

// ── malformed programmer input throws (existing contracts) ───────────────────────────

test('throws invalid_input for malformed batch input', () => {
  assert.throws(() => planBatchNormalization(null, [], CTX), isInvalidInput)         // bad registry
  assert.throws(() => planBatchNormalization(REG, 'nope', CTX), isInvalidInput)      // records not array
  assert.throws(() => planBatchNormalization(REG, [], { now: 'x' }), isInvalidInput) // bad context (even empty batch)
  assert.throws(() => planBatchNormalization(REG, [{ sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS }], CTX), isInvalidInput) // record missing id
})

// ── purity + dormancy ───────────────────────────────────────────────────────────────

test('source uses no clock/randomness/side-effects; imports only @brain/evidence-contracts', () => {
  for (const f of readdirSync(PKG_DIR).filter(x => /\.js$/.test(x))) {
    const code = readFileSync(join(PKG_DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    assert.ok(!/\b(Date\.now|new Date|Math\.random)\b/.test(code), `${f}: no clock/randomness`)
    assert.ok(!/\b(require|process|globalThis|fetch)\b|node:fs|'fs'|writeFile/.test(code), `${f}: no side effects/IO`)
    for (const spec of [...code.matchAll(/from\s+'([^']+)'/g)].map(m => m[1])) {
      assert.ok(spec.startsWith('./') || spec === '@brain/evidence-contracts', `${f}: illegal import ${spec}`)
    }
  }
})

const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.vite', 'coverage', 'data'])
function collectJs(absDir, out = []) {
  let entries
  try { entries = readdirSync(absDir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (e.isDirectory()) { if (!EXCLUDE_DIRS.has(e.name)) collectJs(join(absDir, e.name), out) }
    else if (/\.(js|mjs|cjs|jsx)$/.test(e.name)) out.push(join(absDir, e.name))
  }
  return out
}
const IMPORTS_PKG = /(?:from|import|require\(\s*)['"]@brain\/evidence-normalization['"]/

test('completely dormant — no runtime code imports @brain/evidence-normalization', () => {
  const files = collectJs(REPO)
  const offenders = files
    .filter(f => !/brain-evidence-normalization.*\.test\.js$/.test(f) && f !== TEST_FILE)
    .filter(f => !f.includes('/packages/brain-evidence-normalization/'))
    .filter(f => IMPORTS_PKG.test(readFileSync(f, 'utf8')))
    .map(f => f.replace(REPO + '/', ''))
  assert.deepEqual(offenders, [], `evidence-normalization must be imported by nobody yet; found: ${offenders.join(', ')}`)
  assert.ok(files.length > 50, 'sanity: the scan walked the source tree')
})
