/**
 * M51 — @brain/evidence-normalization normalizer registry unit tests
 *
 * Deterministic tests for the dormant, immutable normalizer registry: registration,
 * duplicate rejection, unknown lookup, version-aware lookup + latest resolution,
 * immutability, deterministic ordering, error codes — and purity + dormancy.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import {
  createNormalizerRegistry,
  compareVersions,
  NormalizationError, NORMALIZATION_ERROR,
} from '@brain/evidence-normalization'
import { SOURCE_TYPE } from '@brain/evidence-contracts'

const REPO = join(fileURLToPath(new URL('..', import.meta.url)))
const TEST_FILE = fileURLToPath(import.meta.url)
const PKG_DIR = join(REPO, 'packages', 'brain-evidence-normalization')

const isInvalidInput = (e) => e instanceof NormalizationError && e.code === NORMALIZATION_ERROR.INVALID_INPUT
const isInvalidContract = (e) => e instanceof NormalizationError && e.code === NORMALIZATION_ERROR.INVALID_CONTRACT
const isDuplicate = (e) => e instanceof NormalizationError && e.code === NORMALIZATION_ERROR.DUPLICATE_NORMALIZER

const norm = (sourceType, version) => Object.freeze({ sourceType, version, normalize: () => [] })
const FRAME_1 = norm(SOURCE_TYPE.PROVIDER_FRAME_SPORTS, '1.0')
const FRAME_2 = norm(SOURCE_TYPE.PROVIDER_FRAME_SPORTS, '2.0')
const NOTE_1 = norm(SOURCE_TYPE.MANUAL_MATCH_NOTE, '1.0')

// ── construction + successful registration ──────────────────────────────────────────

test('empty registry — size 0, lookups report null', () => {
  const r = createNormalizerRegistry()
  assert.equal(r.size, 0)
  assert.equal(r.has(SOURCE_TYPE.PROVIDER_FRAME_SPORTS), false)
  assert.equal(r.get(SOURCE_TYPE.PROVIDER_FRAME_SPORTS, '1.0'), null)
  assert.equal(r.resolve(SOURCE_TYPE.PROVIDER_FRAME_SPORTS), null)
  assert.deepEqual(r.list(), [])
  assert.deepEqual(r.keys(), [])
})

test('successful registration — from initial list and via register()', () => {
  const fromList = createNormalizerRegistry([FRAME_1, NOTE_1])
  assert.equal(fromList.size, 2)
  assert.equal(fromList.has(SOURCE_TYPE.PROVIDER_FRAME_SPORTS), true)
  assert.equal(fromList.get(SOURCE_TYPE.PROVIDER_FRAME_SPORTS, '1.0'), FRAME_1)

  const built = createNormalizerRegistry().register(FRAME_1).register(NOTE_1)
  assert.equal(built.size, 2)
  assert.deepEqual(built.keys(), fromList.keys())
})

// ── duplicate rejection ─────────────────────────────────────────────────────────────

test('duplicate registration rejected deterministically — same sourceType@version', () => {
  assert.throws(() => createNormalizerRegistry([FRAME_1, norm(SOURCE_TYPE.PROVIDER_FRAME_SPORTS, '1.0')]), isDuplicate)
  const r = createNormalizerRegistry([FRAME_1])
  assert.throws(() => r.register(FRAME_1), isDuplicate)
  // a different version of the same sourceType is NOT a duplicate
  assert.equal(r.register(FRAME_2).size, 2)
})

// ── unknown lookup (reported as data, never throws) ─────────────────────────────────

test('unknown sourceType lookup — null, no throw', () => {
  const r = createNormalizerRegistry([FRAME_1])
  assert.equal(r.get(SOURCE_TYPE.MANUAL_SCOUTING_NOTE, '1.0'), null)
  assert.equal(r.resolve(SOURCE_TYPE.MANUAL_SCOUTING_NOTE), null)
  assert.equal(r.get(SOURCE_TYPE.PROVIDER_FRAME_SPORTS, '9.9'), null)  // known source, unknown version
  assert.equal(r.has(SOURCE_TYPE.PROVIDER_FRAME_SPORTS, '9.9'), false)
  assert.equal(r.describe(SOURCE_TYPE.MANUAL_SCOUTING_NOTE, '1.0'), null)
})

// ── version-aware lookup ────────────────────────────────────────────────────────────

test('version-aware lookup — exact get; resolve() returns latest version', () => {
  const r = createNormalizerRegistry([FRAME_1, FRAME_2])
  assert.equal(r.get(SOURCE_TYPE.PROVIDER_FRAME_SPORTS, '1.0'), FRAME_1)
  assert.equal(r.get(SOURCE_TYPE.PROVIDER_FRAME_SPORTS, '2.0'), FRAME_2)
  assert.equal(r.resolve(SOURCE_TYPE.PROVIDER_FRAME_SPORTS), FRAME_2)              // latest
  assert.equal(r.resolve(SOURCE_TYPE.PROVIDER_FRAME_SPORTS, '1.0'), FRAME_1)       // pinned
  assert.equal(r.describe(SOURCE_TYPE.PROVIDER_FRAME_SPORTS, '2.0').key, 'provider.frameSports@2.0')
})

test('compareVersions — numeric segments, prefix length, mixed', () => {
  assert.equal(compareVersions('1.0', '2.0'), -1)
  assert.equal(compareVersions('1.10', '1.9'), 1)        // numeric, not lexicographic
  assert.equal(compareVersions('1', '1.0'), -1)          // shorter prefix sorts first
  assert.equal(compareVersions('2.0', '2.0'), 0)
  // resolve uses it: 1.9 vs 1.10 → 1.10 latest
  const r = createNormalizerRegistry([norm(SOURCE_TYPE.PROVIDER_VIDEO, '1.9'), norm(SOURCE_TYPE.PROVIDER_VIDEO, '1.10')])
  assert.equal(r.resolve(SOURCE_TYPE.PROVIDER_VIDEO).version, '1.10')
})

// ── immutability ────────────────────────────────────────────────────────────────────

test('registry immutability — register() returns a new registry, original unchanged', () => {
  const base = createNormalizerRegistry([FRAME_1])
  const next = base.register(NOTE_1)
  assert.equal(base.size, 1)                              // original untouched
  assert.equal(next.size, 2)
  assert.notEqual(base, next)
  assert.equal(base.has(SOURCE_TYPE.MANUAL_MATCH_NOTE), false)
  assert.equal(next.has(SOURCE_TYPE.MANUAL_MATCH_NOTE), true)
})

test('registry is frozen; list()/keys() results are frozen and do not leak state', () => {
  const r = createNormalizerRegistry([FRAME_1])
  assert.ok(Object.isFrozen(r))
  assert.throws(() => { r.size = 99 })                   // frozen: assignment throws in module strict mode
  const list = r.list()
  assert.ok(Object.isFrozen(list))
  assert.throws(() => list.push(NOTE_1))
  assert.equal(r.size, 1)                                // unaffected
})

// ── deterministic ordering ──────────────────────────────────────────────────────────

test('deterministic ordering — independent of insertion order', () => {
  const a = createNormalizerRegistry([FRAME_2, NOTE_1, FRAME_1])
  const b = createNormalizerRegistry([NOTE_1, FRAME_1, FRAME_2])
  const expected = ['manual.matchNote@1.0', 'provider.frameSports@1.0', 'provider.frameSports@2.0']
  assert.deepEqual(a.keys(), expected)
  assert.deepEqual(b.keys(), expected)
  assert.deepEqual(a.list().map(d => d.key), expected)
  assert.deepEqual(a.sourceTypes(), ['manual.matchNote', 'provider.frameSports'])
})

// ── malformed input / contract ──────────────────────────────────────────────────────

test('throws only for programmer errors — malformed input / malformed contract', () => {
  assert.throws(() => createNormalizerRegistry('nope'), isInvalidInput)
  assert.throws(() => createNormalizerRegistry({}), isInvalidInput)
  assert.throws(() => createNormalizerRegistry([{ version: '1', normalize() {} }]), isInvalidContract)
  assert.throws(() => createNormalizerRegistry().register(null), isInvalidContract)
})

// ── determinism + no mutation of inputs ─────────────────────────────────────────────

test('deterministic — identical construction → identical keys/list', () => {
  assert.deepEqual(createNormalizerRegistry([FRAME_1, FRAME_2]).keys(), createNormalizerRegistry([FRAME_1, FRAME_2]).keys())
})

test('never mutates the caller-supplied array', () => {
  const input = [FRAME_1, NOTE_1]
  const snapshot = [...input]
  createNormalizerRegistry(input)
  assert.deepEqual(input, snapshot)
  assert.equal(input.length, 2)
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
    .filter(f => !f.endsWith('brain-evidence-normalization.test.js') && f !== TEST_FILE)
    .filter(f => !f.includes('/packages/brain-evidence-normalization/') && !f.includes('/packages/brain-evidence-gateway/'))
    .filter(f => IMPORTS_PKG.test(readFileSync(f, 'utf8')))
    .map(f => f.replace(REPO + '/', ''))
  assert.deepEqual(offenders, [], `evidence-normalization may be imported only by the dormant gateway (M55); no runtime/browser/Core importer allowed; found: ${offenders.join(', ')}`)
  assert.ok(files.length > 50, 'sanity: the scan walked the source tree')
})
