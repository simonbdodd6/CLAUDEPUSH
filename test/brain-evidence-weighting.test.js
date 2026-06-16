/**
 * M47 — @brain/evidence-weighting unit tests
 *
 * Comprehensive deterministic tests for the pure confidence-weighting maths:
 * determinism, recency, corroboration, conflict, volume saturation, source-trust
 * resolution, aggregation, edge cases, immutability, invalid input — and dormancy.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import {
  DEFAULT_WEIGHTS,
  applyRecencyWeight, applyCorroborationBoost, applyConflictPenalty, applyVolumeSaturation,
  calculateEvidenceConfidence, combineEvidenceConfidence,
  WeightingError, WEIGHTING_ERROR,
} from '@brain/evidence-weighting'

const REPO = join(fileURLToPath(new URL('..', import.meta.url)))
const TEST_FILE = fileURLToPath(import.meta.url)
const PKG_DIR = join(REPO, 'packages', 'brain-evidence-weighting')

const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`)
const isInvalid = (e) => e instanceof WeightingError && e.code === WEIGHTING_ERROR.INVALID_INPUT

// ── determinism ───────────────────────────────────────────────────────────────

test('identical input → identical output (all functions)', () => {
  approx(applyRecencyWeight(0.8, 17), applyRecencyWeight(0.8, 17))
  approx(applyCorroborationBoost(0.5, 3), applyCorroborationBoost(0.5, 3))
  assert.deepEqual(applyConflictPenalty(0.8, 2), applyConflictPenalty(0.8, 2))
  approx(applyVolumeSaturation(7), applyVolumeSaturation(7))
  approx(calculateEvidenceConfidence({ sourceTrust: 'manualVerified', ageDays: 12 }), calculateEvidenceConfidence({ sourceTrust: 'manualVerified', ageDays: 12 }))
  const items = [{ confidence: 0.6 }, { confidence: 0.4, stance: 'conflict' }]
  assert.deepEqual(combineEvidenceConfidence(items), combineEvidenceConfidence(items))
})

// ── recency ───────────────────────────────────────────────────────────────────

test('recency — unchanged at age 0, halves at half-life, floored when very old, no decay for future', () => {
  const { halfLifeDays, floor } = DEFAULT_WEIGHTS.recency
  approx(applyRecencyWeight(0.8, 0), 0.8)
  approx(applyRecencyWeight(0.8, halfLifeDays), 0.4)
  approx(applyRecencyWeight(0.8, 2 * halfLifeDays), 0.2)
  approx(applyRecencyWeight(0.8, 100000), 0.8 * floor)        // multiplier floored
  approx(applyRecencyWeight(0.8, -50), 0.8)                   // future-dated → no decay
  approx(applyRecencyWeight(0, 10), 0)                        // zero stays zero
})

// ── corroboration ─────────────────────────────────────────────────────────────

test('corroboration — more independent sources raise confidence, capped, never lowered', () => {
  const { perIndependentSource, cap } = DEFAULT_WEIGHTS.corroboration
  approx(applyCorroborationBoost(0.5, 0), 0.5)
  approx(applyCorroborationBoost(0.5, 1), 0.5 + perIndependentSource)
  approx(applyCorroborationBoost(0.5, 2), 0.5 + 2 * perIndependentSource)
  approx(applyCorroborationBoost(0.5, 1000), cap)            // capped
  assert.ok(applyCorroborationBoost(0.6, 5) >= 0.6)          // monotonic non-decreasing
  approx(applyCorroborationBoost(0.98, 5), 0.98)             // already above cap → unchanged (cap never lowers)
})

// ── conflict ───────────────────────────────────────────────────────────────────

test('conflict — penalty compounds + raises disputed; none → unchanged', () => {
  const { penalty, flag } = DEFAULT_WEIGHTS.conflict
  assert.deepEqual(applyConflictPenalty(0.8, 0), { confidence: 0.8, disputed: false, flag: null })
  const one = applyConflictPenalty(0.8, 1)
  approx(one.confidence, 0.8 * (1 - penalty)); assert.equal(one.disputed, true); assert.equal(one.flag, flag)
  const two = applyConflictPenalty(0.8, 2)
  approx(two.confidence, 0.8 * (1 - penalty) ** 2)
  assert.ok(two.confidence < one.confidence)                // more conflict → lower
})

// ── volume saturation ──────────────────────────────────────────────────────────

test('volume saturation — 0 at 0, 0.5 at K, monotonic, asymptotes to (but never reaches) 1', () => {
  const k = DEFAULT_WEIGHTS.volume.saturationK
  approx(applyVolumeSaturation(0), 0)
  approx(applyVolumeSaturation(k), 0.5)
  approx(applyVolumeSaturation(3 * k), 0.75)
  assert.ok(applyVolumeSaturation(5) < applyVolumeSaturation(50))   // monotonic
  assert.ok(applyVolumeSaturation(1e9) < 1 && applyVolumeSaturation(1e9) > 0.999)
})

// ── source-trust resolution / single-evidence confidence ───────────────────────

test('calculateEvidenceConfidence — trust ceiling (key or number) decayed by recency', () => {
  approx(calculateEvidenceConfidence({ sourceTrust: 'providerVerified', ageDays: 0 }), 1)
  approx(calculateEvidenceConfidence({ sourceTrust: 'manualVerified', ageDays: DEFAULT_WEIGHTS.recency.halfLifeDays }), 0.35)
  approx(calculateEvidenceConfidence({ sourceTrust: 0.6, ageDays: 0 }), 0.6)
  assert.throws(() => calculateEvidenceConfidence({ sourceTrust: 'nope' }), isInvalid)
})

// ── aggregation ────────────────────────────────────────────────────────────────

test('combineEvidenceConfidence — corroboration up, conflict down + disputed, volume weight, empty → 0', () => {
  const agree = combineEvidenceConfidence([{ confidence: 0.6 }, { confidence: 0.5 }])
  approx(agree.confidence, 0.6 + DEFAULT_WEIGHTS.corroboration.perIndependentSource)
  assert.equal(agree.disputed, false)
  assert.equal(agree.supporting, 2); assert.equal(agree.conflicting, 0)
  approx(agree.volumeWeight, applyVolumeSaturation(2))

  const conflicted = combineEvidenceConfidence([{ confidence: 0.6 }, { confidence: 0.5 }, { confidence: 0.4, stance: 'conflict' }])
  assert.equal(conflicted.disputed, true)
  assert.ok(conflicted.confidence < agree.confidence)

  assert.deepEqual(combineEvidenceConfidence([]), { confidence: 0, disputed: false, supporting: 0, conflicting: 0, volumeWeight: 0 })

  // dependent (non-independent) supporters do not corroborate
  const dependent = combineEvidenceConfidence([{ confidence: 0.6 }, { confidence: 0.6, independent: false }])
  approx(dependent.confidence, 0.6)
})

// ── edge cases + clamping ───────────────────────────────────────────────────────

test('edge cases — confidence clamped to 0..1; counts truncated/floored', () => {
  approx(applyRecencyWeight(1.5, 0), 1)              // clamped down
  approx(applyRecencyWeight(-0.2, 0), 0)             // clamped up
  approx(applyCorroborationBoost(0.5, 2.9), 0.5 + 2 * DEFAULT_WEIGHTS.corroboration.perIndependentSource)  // trunc
  approx(applyVolumeSaturation(-3), 0)               // negative count → 0
})

// ── immutability ────────────────────────────────────────────────────────────────

test('immutability — object results frozen; inputs never mutated', () => {
  assert.ok(Object.isFrozen(applyConflictPenalty(0.8, 1)))
  assert.ok(Object.isFrozen(combineEvidenceConfidence([{ confidence: 0.5 }])))
  const items = Object.freeze([Object.freeze({ confidence: 0.6, stance: 'agree' })])
  const snapshot = JSON.parse(JSON.stringify(items))
  combineEvidenceConfidence(items)                  // must not throw on frozen input nor mutate it
  assert.deepEqual(items, snapshot)
})

// ── invalid input ────────────────────────────────────────────────────────────────

test('invalid input — non-finite numbers / wrong types throw invalid_input', () => {
  assert.throws(() => applyRecencyWeight('x', 0), isInvalid)
  assert.throws(() => applyRecencyWeight(0.5, NaN), isInvalid)
  assert.throws(() => applyCorroborationBoost(0.5, Infinity), isInvalid)
  assert.throws(() => applyVolumeSaturation('lots'), isInvalid)
  assert.throws(() => combineEvidenceConfidence('not-an-array'), isInvalid)
  assert.throws(() => combineEvidenceConfidence([{ confidence: 'high' }]), isInvalid)
  assert.throws(() => combineEvidenceConfidence([null]), isInvalid)
})

// ── source hygiene + dormancy ────────────────────────────────────────────────────

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
const IMPORTS_PKG = /(?:from|import|require\(\s*)['"]@brain\/evidence-weighting['"]/

test('completely dormant — no runtime code imports @brain/evidence-weighting', () => {
  const files = collectJs(REPO)
  const offenders = files
    .filter(f => f !== TEST_FILE && !f.includes('/packages/brain-evidence-weighting/') && !f.includes('/packages/brain-evidence-gateway/'))
    .filter(f => IMPORTS_PKG.test(readFileSync(f, 'utf8')))
    .map(f => f.replace(REPO + '/', ''))
  assert.deepEqual(offenders, [], `evidence-weighting may be imported only by the dormant gateway (M59); no runtime/browser/Core importer allowed; found: ${offenders.join(', ')}`)
  assert.ok(files.length > 50, 'sanity: the scan walked the source tree')
})
