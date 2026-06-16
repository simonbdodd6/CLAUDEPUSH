/**
 * M54 — @brain/evidence-normalization plan application contract unit tests
 *
 * Deterministic tests for the dormant application bridge (BatchNormalizationPlan →
 * frozen ApplicationPlan): empty plan, all accepted, mixed accepted/unknown/invalid,
 * forwarded signals, aggregate counts, order preservation, immutability,
 * deterministic shape — and purity + dormancy. Writes nothing.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import {
  createNormalizerRegistry,
  planBatchNormalization,
  planNormalizationApplication,
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

// frame normalizer → two valid signals; badNote → one invalid signal
const frame = Object.freeze({
  sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, version: '1.0',
  normalize: (rec) => [signal(rec.id), signal(rec.id, { key: 'lineout.lossRate', value: 0.18 })],
})
const badNote = Object.freeze({
  sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE, version: '1.0',
  normalize: (rec) => [signal(rec.id, { key: 'bad key' })],
})
const REG = createNormalizerRegistry([frame, badNote])

const apply = (records) => planNormalizationApplication(planBatchNormalization(REG, records, CTX))

// ── empty plan ──────────────────────────────────────────────────────────────────────

test('empty application plan — nothing to apply, frozen', () => {
  const plan = apply([])
  assert.equal(plan.total, 0)
  assert.equal(plan.willApply, false)
  assert.deepEqual(plan.counts, { total: 0, accepted: 0, unknown_source: 0, invalid_signals: 0, signals: 0 })
  assert.deepEqual(plan.accepted, [])
  assert.deepEqual(plan.unknownSource, [])
  assert.deepEqual(plan.invalidSignals, [])
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.counts) && Object.isFrozen(plan.accepted))
})

// ── all accepted ────────────────────────────────────────────────────────────────────

test('all accepted — every record forwards its validated signals', () => {
  const plan = apply([record('ev_1'), record('ev_2')])
  assert.equal(plan.willApply, true)
  assert.deepEqual(plan.counts, { total: 2, accepted: 2, unknown_source: 0, invalid_signals: 0, signals: 4 })
  assert.deepEqual(plan.accepted.map(a => a.recordId), ['ev_1', 'ev_2'])
  assert.equal(plan.accepted[0].normalizerKey, 'provider.frameSports@1.0')
  assert.equal(plan.accepted[0].signals.length, 2)
  // forwarded signals back-reference the owning record
  assert.ok(plan.accepted[0].signals.every(s => s.evidenceId === 'ev_1'))
})

// ── mixed ───────────────────────────────────────────────────────────────────────────

test('mixed accepted / unknown_source / invalid_signals — partitioned correctly', () => {
  const records = [
    record('ev_ok'),                                            // accepted (2 signals)
    record('ev_unknown', SOURCE_TYPE.MANUAL_SCOUTING_NOTE),     // unknown_source
    record('ev_bad', SOURCE_TYPE.MANUAL_MATCH_NOTE),            // invalid_signals
    record('ev_ok2'),                                           // accepted (2 signals)
  ]
  const plan = apply(records)
  assert.deepEqual(plan.counts, { total: 4, accepted: 2, unknown_source: 1, invalid_signals: 1, signals: 4 })
  assert.deepEqual(plan.accepted.map(a => a.recordId), ['ev_ok', 'ev_ok2'])
  assert.deepEqual(plan.unknownSource, [{ index: 1, recordId: 'ev_unknown', sourceType: SOURCE_TYPE.MANUAL_SCOUTING_NOTE }])
  assert.equal(plan.invalidSignals.length, 1)
  assert.equal(plan.invalidSignals[0].recordId, 'ev_bad')
  assert.ok(plan.invalidSignals[0].problems.some(p => /^signal\[0\]:/.test(p)))
})

// ── ordering preserved ──────────────────────────────────────────────────────────────

test('deterministic ordering — original batch index preserved within partitions', () => {
  const records = [
    record('a'), record('b', SOURCE_TYPE.MANUAL_SCOUTING_NOTE), record('c'),
    record('d', SOURCE_TYPE.MANUAL_SCOUTING_NOTE),
  ]
  const plan = apply(records)
  assert.deepEqual(plan.accepted.map(a => a.index), [0, 2])
  assert.deepEqual(plan.unknownSource.map(u => u.index), [1, 3])
})

// ── immutability + determinism ──────────────────────────────────────────────────────

test('result is deeply frozen', () => {
  const plan = apply([record('ev_1'), record('ev_bad', SOURCE_TYPE.MANUAL_MATCH_NOTE)])
  assert.ok(Object.isFrozen(plan))
  assert.ok(plan.accepted.every(a => Object.isFrozen(a) && Object.isFrozen(a.signals)))
  assert.ok(plan.invalidSignals.every(p => Object.isFrozen(p)))
  assert.throws(() => plan.accepted.push({}))
})

test('does not mutate the source batch plan', () => {
  const batch = planBatchNormalization(REG, [record('ev_1')], CTX)
  const snapshot = JSON.stringify(batch)
  planNormalizationApplication(batch)
  assert.equal(JSON.stringify(batch), snapshot)
})

test('deterministic — identical batch → identical application plan', () => {
  const batch = planBatchNormalization(REG, [record('ev_1'), record('ev_x', SOURCE_TYPE.MANUAL_SCOUTING_NOTE)], CTX)
  assert.deepEqual(planNormalizationApplication(batch), planNormalizationApplication(batch))
})

// ── malformed input ─────────────────────────────────────────────────────────────────

test('throws invalid_input for a non-batch-plan input', () => {
  for (const bad of [null, {}, 'nope', { results: 'x' }, 42]) {
    assert.throws(() => planNormalizationApplication(bad), isInvalidInput, JSON.stringify(bad))
  }
  // malformed result entry (no invocation)
  assert.throws(() => planNormalizationApplication({ results: [{ index: 0, recordId: 'a' }] }), isInvalidInput)
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
    .filter(f => !f.includes('/packages/brain-evidence-normalization/') && !f.includes('/packages/brain-evidence-gateway/'))
    .filter(f => IMPORTS_PKG.test(readFileSync(f, 'utf8')))
    .map(f => f.replace(REPO + '/', ''))
  assert.deepEqual(offenders, [], `evidence-normalization may be imported only by the dormant gateway (M55); no runtime/browser/Core importer allowed; found: ${offenders.join(', ')}`)
  assert.ok(files.length > 50, 'sanity: the scan walked the source tree')
})
