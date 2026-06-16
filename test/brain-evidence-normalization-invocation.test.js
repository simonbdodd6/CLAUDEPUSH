/**
 * M52 — @brain/evidence-normalization invocation contract unit tests
 *
 * Deterministic tests for the dormant invocation bridge (registry × record × context
 * → frozen envelope): successful invocation, unknown sourceType, invalid emitted
 * signals, non-array emission, malformed normalizer (defence-in-depth), context
 * passthrough, registry-not-mutated, deterministic shape — and purity + dormancy.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import {
  createNormalizerRegistry,
  invokeNormalizer, INVOCATION_STATUS,
  NormalizationError, NORMALIZATION_ERROR,
} from '@brain/evidence-normalization'
import { SOURCE_TYPE, SIGNAL_POLARITY } from '@brain/evidence-contracts'

const REPO = join(fileURLToPath(new URL('..', import.meta.url)))
const TEST_FILE = fileURLToPath(import.meta.url)
const PKG_DIR = join(REPO, 'packages', 'brain-evidence-normalization')

const isInvalidInput = (e) => e instanceof NormalizationError && e.code === NORMALIZATION_ERROR.INVALID_INPUT
const isInvalidContract = (e) => e instanceof NormalizationError && e.code === NORMALIZATION_ERROR.INVALID_CONTRACT

const CTX = Object.freeze({ now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' })
const RECORD = Object.freeze({ id: 'ev_1', sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, confidence: 0.8 })

const signal = (over = {}) => ({
  key: 'lineout.winRate', value: 0.82, unit: null,
  polarity: SIGNAL_POLARITY.STRENGTH, confidence: 0.7, evidenceId: 'ev_1', ...over,
})

// a normalizer emitting one valid signal
const goodNormalizer = Object.freeze({
  sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS,
  version: '1.0',
  normalize: () => [signal()],
})
const registryWith = (n) => createNormalizerRegistry([n])

// ── successful invocation ───────────────────────────────────────────────────────────

test('successful invocation — status ok, signals returned, validation valid, frozen', () => {
  const r = invokeNormalizer(registryWith(goodNormalizer), RECORD, CTX)
  assert.equal(r.status, INVOCATION_STATUS.OK)
  assert.equal(r.ok, true)
  assert.equal(r.sourceType, SOURCE_TYPE.PROVIDER_FRAME_SPORTS)
  assert.equal(r.normalizerKey, 'provider.frameSports@1.0')
  assert.equal(r.signals.length, 1)
  assert.equal(r.validation.valid, true)
  assert.deepEqual(r.problems, [])
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.signals) && Object.isFrozen(r.problems))
})

// ── unknown sourceType (data, not crash) ────────────────────────────────────────────

test('unknown sourceType — structured problem as data, no throw', () => {
  const r = invokeNormalizer(createNormalizerRegistry(), RECORD, CTX)
  assert.equal(r.status, INVOCATION_STATUS.UNKNOWN_SOURCE)
  assert.equal(r.ok, false)
  assert.equal(r.normalizerKey, null)
  assert.deepEqual(r.signals, [])
  assert.equal(r.validation, null)
  assert.equal(r.problems.length, 1)
  assert.match(r.problems[0], /no normalizer registered/)
})

// ── invalid emitted signal ──────────────────────────────────────────────────────────

test('invalid emitted signal — status invalid_signals, problems describe it', () => {
  const bad = { ...goodNormalizer, normalize: () => [signal({ key: 'bad key' })] }
  const r = invokeNormalizer(registryWith(bad), RECORD, CTX)
  assert.equal(r.status, INVOCATION_STATUS.INVALID_SIGNALS)
  assert.equal(r.ok, false)
  assert.equal(r.validation.valid, false)
  assert.equal(r.signals.length, 1)                        // emission still surfaced
  assert.ok(r.problems.some(p => /^signal\[0\]:/.test(p)))
})

test('emitted confidence over the record ceiling is reported (M50 §2 via record)', () => {
  const over = { ...goodNormalizer, normalize: () => [signal({ confidence: 0.99 })] }  // record.confidence 0.8
  const r = invokeNormalizer(registryWith(over), RECORD, CTX)
  assert.equal(r.status, INVOCATION_STATUS.INVALID_SIGNALS)
  assert.ok(r.problems.some(p => /exceed the record/.test(p)))
})

test('non-array emission — reported as invalid_signals, never throws', () => {
  const weird = { ...goodNormalizer, normalize: () => null }
  const r = invokeNormalizer(registryWith(weird), RECORD, CTX)
  assert.equal(r.status, INVOCATION_STATUS.INVALID_SIGNALS)
  assert.equal(r.normalizerKey, 'provider.frameSports@1.0')
  assert.deepEqual(r.problems, ['normalizer emitted a non-array result'])
})

test('empty emission is a valid (ok) outcome', () => {
  const r = invokeNormalizer(registryWith(goodNormalizer), RECORD, CTX)  // ...wait, goodNormalizer emits one
  const none = { ...goodNormalizer, normalize: () => [] }
  const e = invokeNormalizer(registryWith(none), RECORD, CTX)
  assert.equal(e.status, INVOCATION_STATUS.OK)
  assert.equal(e.signals.length, 0)
  assert.ok(r)  // sanity
})

// ── malformed normalizer (defence-in-depth) + malformed input ───────────────────────

test('malformed resolved normalizer throws invalid_contract (defence-in-depth)', () => {
  // a registry-like object whose resolve() hands back a malformed normalizer
  const rogue = { resolve: () => ({ sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, version: '1.0' /* no normalize */ }) }
  assert.throws(() => invokeNormalizer(rogue, RECORD, CTX), isInvalidContract)
})

test('malformed input throws invalid_input — bad registry/record/context', () => {
  assert.throws(() => invokeNormalizer(null, RECORD, CTX), isInvalidInput)
  assert.throws(() => invokeNormalizer({}, RECORD, CTX), isInvalidInput)                 // no resolve()
  assert.throws(() => invokeNormalizer(registryWith(goodNormalizer), {}, CTX), isInvalidInput)
  assert.throws(() => invokeNormalizer(registryWith(goodNormalizer), RECORD, { now: 'x' }), isInvalidInput)
})

// ── context passthrough ─────────────────────────────────────────────────────────────

test('context is passed through to the normalizer (frozen, exact)', () => {
  let seen = null
  const spy = { ...goodNormalizer, normalize: (rec, ctx) => { seen = { rec, ctx }; return [signal()] } }
  invokeNormalizer(registryWith(spy), RECORD, CTX)
  assert.equal(seen.rec, RECORD)
  assert.deepEqual(seen.ctx, { now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' })
  assert.ok(Object.isFrozen(seen.ctx))
})

// ── registry not mutated + determinism ──────────────────────────────────────────────

test('registry is not mutated by invocation', () => {
  const reg = registryWith(goodNormalizer)
  const before = reg.keys()
  invokeNormalizer(reg, RECORD, CTX)
  assert.equal(reg.size, 1)
  assert.deepEqual(reg.keys(), before)
})

test('deterministic result shape — identical inputs → identical envelope', () => {
  const reg = registryWith(goodNormalizer)
  assert.deepEqual(invokeNormalizer(reg, RECORD, CTX), invokeNormalizer(reg, RECORD, CTX))
})

test('version pin — opts.version selects an exact normalizer', () => {
  const v1 = goodNormalizer
  const v2 = { ...goodNormalizer, version: '2.0', normalize: () => [signal({ value: 0.9 })] }
  const reg = createNormalizerRegistry([v1, v2])
  assert.equal(invokeNormalizer(reg, RECORD, CTX).normalizerKey, 'provider.frameSports@2.0')          // latest
  assert.equal(invokeNormalizer(reg, RECORD, CTX, { version: '1.0' }).normalizerKey, 'provider.frameSports@1.0')
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
