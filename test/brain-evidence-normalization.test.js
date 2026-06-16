/**
 * M50 — @brain/evidence-normalization unit tests
 *
 * Comprehensive deterministic tests for the dormant normalization contracts: the
 * signal-key grammar, the NormalizerContract + NormalizationContext assertions, pure
 * signal validation (shape, back-reference, confidence ceiling), immutability,
 * invalid input, error codes — and purity + dormancy.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import {
  NORMALIZATION_CONTRACT_VERSION,
  isIsoTimestamp,
  isNormalizerContract, assertNormalizerContract, normalizerKey,
  assertNormalizationContext,
  validateSignal, validateSignals,
  SIGNAL_KEY_MAX_LENGTH, SIGNAL_KEY_MAX_SEGMENTS,
  isValidSignalKey, assertSignalKey, signalKeyNamespace, signalKeySegments,
  NormalizationError, NORMALIZATION_ERROR,
} from '@brain/evidence-normalization'
import { SOURCE_TYPE, SIGNAL_POLARITY } from '@brain/evidence-contracts'

const REPO = join(fileURLToPath(new URL('..', import.meta.url)))
const TEST_FILE = fileURLToPath(import.meta.url)
const PKG_DIR = join(REPO, 'packages', 'brain-evidence-normalization')

const isInvalidInput = (e) => e instanceof NormalizationError && e.code === NORMALIZATION_ERROR.INVALID_INPUT
const isInvalidContract = (e) => e instanceof NormalizationError && e.code === NORMALIZATION_ERROR.INVALID_CONTRACT

const goodNormalizer = Object.freeze({
  sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS,
  version: '1.0',
  normalize: () => [],
})
const goodSignal = Object.freeze({
  key: 'lineout.winRate', value: 0.82, unit: null,
  polarity: SIGNAL_POLARITY.STRENGTH, confidence: 0.7, evidenceId: 'ev_1',
})
const goodCtx = Object.freeze({ now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' })

// ── version ─────────────────────────────────────────────────────────────────────

test('exposes a contract version', () => {
  assert.equal(NORMALIZATION_CONTRACT_VERSION, '1.0')
})

// ── signal-key grammar ────────────────────────────────────────────────────────────

test('valid keys — bounded dot-joined lowerCamelCase segments (namespace + leaf)', () => {
  for (const k of ['lineout.winRate', 'availability.status', 'set.piece.success', 'a.b']) {
    assert.equal(isValidSignalKey(k), true, k)
  }
})

test('invalid keys — too few/many segments, bad chars, bad shape, over length', () => {
  const tooMany = Array(SIGNAL_KEY_MAX_SEGMENTS + 1).fill('a').join('.')
  const tooLong = 'a.' + 'b'.repeat(SIGNAL_KEY_MAX_LENGTH)
  for (const k of ['lineout', '', 'Lineout.winRate', '1lineout.x', 'a..b', 'a.b.', 'a.b ', 'a-b.c', tooMany, tooLong, null, 5, {}]) {
    assert.equal(isValidSignalKey(k), false, JSON.stringify(k))
  }
})

test('key helpers — segments + namespace; assertSignalKey throws invalid_input on junk', () => {
  assert.deepEqual([...signalKeySegments('set.piece.success')], ['set', 'piece', 'success'])
  assert.equal(signalKeyNamespace('lineout.winRate'), 'lineout')
  assert.equal(assertSignalKey('a.b'), 'a.b')
  assert.throws(() => assertSignalKey('nope'), isInvalidInput)
  assert.throws(() => signalKeyNamespace('nope'), isInvalidInput)
  assert.ok(Object.isFrozen(signalKeySegments('a.b')))
})

// ── ISO timestamp (no Date) ────────────────────────────────────────────────────────

test('isIsoTimestamp — accepts ISO instants, rejects junk', () => {
  for (const s of ['2026-06-16T09:30:00.000Z', '2026-06-16T09:30:00Z']) assert.equal(isIsoTimestamp(s), true, s)
  for (const s of ['2026-06-16', '2026-06-16 09:30:00', 'not-a-date', '', 0, null]) assert.equal(isIsoTimestamp(s), false, String(s))
})

// ── normalizer contract ────────────────────────────────────────────────────────────

test('valid normalizer — describes to { sourceType, sourceFamily, version, key }', () => {
  assert.equal(isNormalizerContract(goodNormalizer), true)
  const d = assertNormalizerContract(goodNormalizer)
  assert.deepEqual(d, {
    sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS,
    sourceFamily: 'provider',
    version: '1.0',
    key: 'provider.frameSports@1.0',
  })
  assert.ok(Object.isFrozen(d))
  assert.equal(normalizerKey(goodNormalizer), 'provider.frameSports@1.0')
})

test('manual normalizer resolves the manual family', () => {
  const d = assertNormalizerContract({ sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE, version: '2', normalize() {} })
  assert.equal(d.sourceFamily, 'manual')
})

test('bad normalizer — throws invalid_contract; never throws invalid_input', () => {
  for (const n of [
    null, {}, { version: '1', normalize() {} },                    // missing/!known sourceType
    { sourceType: 'provider.unknownThing', version: '1', normalize() {} },
    { sourceType: SOURCE_TYPE.PROVIDER_VIDEO, version: '', normalize() {} },  // empty version
    { sourceType: SOURCE_TYPE.PROVIDER_VIDEO, version: '1' },      // missing normalize
    { sourceType: SOURCE_TYPE.PROVIDER_VIDEO, version: '1', normalize: 'x' },
  ]) {
    assert.equal(isNormalizerContract(n), false, JSON.stringify(n))
    assert.throws(() => assertNormalizerContract(n), isInvalidContract, JSON.stringify(n))
  }
})

// ── normalization context ──────────────────────────────────────────────────────────

test('context — requires passed-in ISO now + ingestRunId; returns frozen', () => {
  const c = assertNormalizationContext(goodCtx)
  assert.deepEqual(c, { now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' })
  assert.ok(Object.isFrozen(c))
  for (const bad of [null, {}, { now: 'today', ingestRunId: 'r' }, { now: goodCtx.now }, { now: goodCtx.now, ingestRunId: '' }]) {
    assert.throws(() => assertNormalizationContext(bad), isInvalidInput, JSON.stringify(bad))
  }
})

// ── signal validation (reports, never throws) ───────────────────────────────────────

test('valid signal — reports valid with no problems', () => {
  const r = validateSignal(goodSignal)
  assert.deepEqual(r, { valid: true, problems: [] })
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.problems))
})

test('signal value may be number | string | boolean | null', () => {
  for (const value of [1, 'x', true, false, null]) {
    assert.equal(validateSignal({ ...goodSignal, value }).valid, true, String(value))
  }
  for (const value of [{}, [], undefined]) {
    assert.equal(validateSignal({ ...goodSignal, value }).valid, false, String(value))
  }
})

test('signal — reports every shape problem, never throws', () => {
  const r = validateSignal({ key: 'bad key', value: {}, unit: 7, polarity: 'sideways', confidence: 2, evidenceId: '' })
  assert.equal(r.valid, false)
  assert.equal(r.problems.length, 6)
  assert.equal(validateSignal(null).valid, false)
  assert.equal(validateSignal('nope').valid, false)
})

test('signal vs owning record — back-reference + confidence ceiling (M42 §2)', () => {
  const record = { id: 'ev_1', confidence: 0.6 }
  assert.equal(validateSignal({ ...goodSignal, confidence: 0.5 }, { record }).valid, true)
  const wrongRef = validateSignal({ ...goodSignal, evidenceId: 'ev_OTHER', confidence: 0.5 }, { record })
  assert.equal(wrongRef.valid, false)
  assert.ok(wrongRef.problems.some(p => /back-reference/.test(p)))
  const overConf = validateSignal({ ...goodSignal, confidence: 0.9 }, { record })
  assert.equal(overConf.valid, false)
  assert.ok(overConf.problems.some(p => /exceed the record/.test(p)))
})

test('validateSignals — empty array valid; aggregates per-index problems; non-array throws', () => {
  assert.deepEqual(validateSignals([]), { valid: true, count: 0, problems: [] })
  const ok = validateSignals([goodSignal, { ...goodSignal, value: 'tackle' }])
  assert.deepEqual(ok, { valid: true, count: 2, problems: [] })
  const mixed = validateSignals([goodSignal, { ...goodSignal, key: 'bad key' }])
  assert.equal(mixed.valid, false)
  assert.equal(mixed.count, 2)
  assert.deepEqual(mixed.problems.map(p => p.index), [1])
  assert.ok(Object.isFrozen(mixed) && Object.isFrozen(mixed.problems))
  assert.throws(() => validateSignals('nope'), isInvalidInput)
  assert.throws(() => validateSignals({}), isInvalidInput)
})

// ── determinism + no mutation ───────────────────────────────────────────────────────

test('deterministic — identical input → identical output', () => {
  assert.deepEqual(validateSignal(goodSignal), validateSignal(goodSignal))
  assert.deepEqual(assertNormalizerContract(goodNormalizer), assertNormalizerContract(goodNormalizer))
  assert.deepEqual(validateSignals([goodSignal]), validateSignals([goodSignal]))
})

test('never mutates caller input', () => {
  const signal = { ...goodSignal }
  const snapshot = JSON.stringify(signal)
  validateSignal(signal, { record: { id: 'ev_1', confidence: 0.6 } })
  assert.equal(JSON.stringify(signal), snapshot)
  const arr = [goodSignal]
  validateSignals(arr)
  assert.equal(arr.length, 1)
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
    .filter(f => f !== TEST_FILE && !f.includes('/packages/brain-evidence-normalization/') && !f.includes('/packages/brain-evidence-gateway/'))
    .filter(f => IMPORTS_PKG.test(readFileSync(f, 'utf8')))
    .map(f => f.replace(REPO + '/', ''))
  assert.deepEqual(offenders, [], `evidence-normalization may be imported only by the dormant gateway (M55); no runtime/browser/Core importer allowed; found: ${offenders.join(', ')}`)
  assert.ok(files.length > 50, 'sanity: the scan walked the source tree')
})
