/**
 * M49 — @brain/recommendation-validation unit tests
 *
 * Comprehensive deterministic tests: valid recommendation, missing/empty/cross-tenant
 * evidence, invalid tenant/confidence, duplicate recommendation ids, immutability,
 * caller-input-not-mutated, deterministic repeated validation, set validation,
 * invalid input — and dormancy.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { createEvidenceStore, createInMemoryEvidenceDriver } from '@brain/evidence-store'
import { SOURCE_TYPE, SOURCE_FAMILY, SUBJECT_TYPE } from '@brain/evidence-contracts'
import {
  validateRecommendation, validateRecommendationSet,
  recommendationEvidenceCoverage, missingRecommendationEvidence,
  duplicateRecommendations, recommendationConfidenceStatus,
  RecommendationValidationError, REC_VALIDATION_ERROR, REC_REASON, CONFIDENCE_STATUS,
} from '@brain/recommendation-validation'

const REPO = join(fileURLToPath(new URL('..', import.meta.url)))
const TEST_FILE = fileURLToPath(import.meta.url)
const PKG_DIR = join(REPO, 'packages', 'brain-recommendation-validation')

const T = Object.freeze({ clubId: 'club-A', teamId: 'team-1', seasonId: null })
const T2 = Object.freeze({ clubId: 'club-B', teamId: 'team-1', seasonId: null })

function evidence(id, tenant = T) {
  return {
    id, schemaVersion: '1.0', tenant,
    sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE, sourceFamily: SOURCE_FAMILY.MANUAL,
    subjectType: SUBJECT_TYPE.PLAYER, subjectId: 'p1',
    confidence: 0.6, observedAt: '2026-06-15T10:00:00Z', recordedAt: '2026-06-15T10:00:01Z', validFrom: null, validTo: null,
    author: { kind: 'coach', id: 'c1', name: null },
    raw: {}, signals: [],
    provenance: { derivedFrom: [], supersedes: null, ingestRunId: 'r', normalizer: 'n@1' },
    audit: [], sensitivity: { level: 'club', piiSubjectIds: [], consentRef: null },
  }
}
async function seededStore() {
  const s = createEvidenceStore({ driver: createInMemoryEvidenceDriver() })
  await s.appendEvidence(evidence('e1'))
  await s.appendEvidence(evidence('e2'))
  return s
}
const rec = (o = {}) => ({ id: 'rec-1', tenant: T, evidence: ['e1', 'e2'], confidence: 0.8, ...o })
const isInvalidInput = (e) => e instanceof RecommendationValidationError && e.code === REC_VALIDATION_ERROR.INVALID_INPUT

// ── valid ─────────────────────────────────────────────────────────────────────

test('valid recommendation — id + tenant + cited evidence + confidence all resolve', async () => {
  const s = await seededStore()
  const r = await validateRecommendation(rec(), { store: s })
  assert.equal(r.valid, true)
  assert.deepEqual(r.reasons, [])
  assert.equal(r.id, 'rec-1')
  assert.equal(r.confidence.status, CONFIDENCE_STATUS.HIGH)
  assert.equal(r.citation.valid, true)
  assert.equal(r.evidenceConfidence.supporting, 2)
})

// ── missing / empty / cross-tenant evidence ──────────────────────────────────────

test('missing evidence invalidates', async () => {
  const s = await seededStore()
  const r = await validateRecommendation(rec({ evidence: ['e1', 'eX'] }), { store: s })
  assert.equal(r.valid, false)
  assert.ok(r.reasons.includes(REC_REASON.MISSING_EVIDENCE))
})

test('empty evidence invalidates', async () => {
  const s = await seededStore()
  const r = await validateRecommendation(rec({ evidence: [] }), { store: s })
  assert.equal(r.valid, false)
  assert.ok(r.reasons.includes(REC_REASON.EMPTY_EVIDENCE))
})

test('cross-tenant evidence invalidates (store isolation → unresolved)', async () => {
  const s = await seededStore()                       // evidence stored under tenant A
  const r = await validateRecommendation(rec({ tenant: T2 }), { store: s })   // recommendation in tenant B
  assert.equal(r.valid, false)
  assert.ok(r.reasons.includes(REC_REASON.MISSING_EVIDENCE))   // B cannot see A's evidence
})

// ── invalid tenant / confidence ──────────────────────────────────────────────────

test('invalid tenant invalidates', async () => {
  const s = await seededStore()
  const r = await validateRecommendation(rec({ tenant: {} }), { store: s })
  assert.equal(r.valid, false)
  assert.ok(r.reasons.includes(REC_REASON.INVALID_TENANT))
})

test('invalid confidence invalidates; status bands are correct', async () => {
  const s = await seededStore()
  for (const bad of [2, -0.1, NaN, 'high', undefined]) {
    const r = await validateRecommendation(rec({ confidence: bad }), { store: s })
    assert.ok(r.reasons.includes(REC_REASON.INVALID_CONFIDENCE), `confidence ${bad}`)
  }
  assert.equal(recommendationConfidenceStatus(0.75).status, CONFIDENCE_STATUS.HIGH)
  assert.equal(recommendationConfidenceStatus(0.5).status, CONFIDENCE_STATUS.MEDIUM)
  assert.equal(recommendationConfidenceStatus(0.1).status, CONFIDENCE_STATUS.LOW)
  assert.equal(recommendationConfidenceStatus(0).status, CONFIDENCE_STATUS.INSUFFICIENT)
  assert.deepEqual(recommendationConfidenceStatus(5), { confidence: null, status: CONFIDENCE_STATUS.INVALID, valid: false })
})

test('invalid / missing id invalidates', async () => {
  const s = await seededStore()
  const r = await validateRecommendation(rec({ id: '' }), { store: s })
  assert.equal(r.valid, false)
  assert.ok(r.reasons.includes(REC_REASON.INVALID_ID))
})

// ── duplicate recommendation ids + set validation ────────────────────────────────

test('recommendation set — per-rec validity + cross-set duplicate ids', async () => {
  const s = await seededStore()
  const set = await validateRecommendationSet([rec({ id: 'a' }), rec({ id: 'a' }), rec({ id: 'b' })], { store: s })
  assert.equal(set.valid, false)
  assert.deepEqual(set.duplicateIds, ['a'])
  // both 'a' results carry the duplicate reason; 'b' is valid
  assert.equal(set.results.filter(r => r.reasons.includes(REC_REASON.DUPLICATE_RECOMMENDATION)).length, 2)
  assert.equal(set.results.find(r => r.id === 'b').valid, true)

  assert.deepEqual(duplicateRecommendations([{ id: 'x' }, { id: 'x' }, { id: 'y' }]), { duplicates: ['x'], hasDuplicates: true })

  const allGood = await validateRecommendationSet([rec({ id: 'a' }), rec({ id: 'b' })], { store: s })
  assert.equal(allGood.valid, true)
  assert.deepEqual(allGood.duplicateIds, [])
})

// ── coverage / missing helpers ───────────────────────────────────────────────────

test('coverage + missing helpers compose the citation gate', async () => {
  const s = await seededStore()
  assert.deepEqual(await recommendationEvidenceCoverage(rec(), { store: s }), { cited: 2, resolved: 2, missing: 0, coverage: 1 })
  assert.deepEqual(await missingRecommendationEvidence(rec({ evidence: ['e1', 'eX'] }), { store: s }), ['eX'])
})

// ── immutability + no mutation + determinism ─────────────────────────────────────

test('immutability — frozen results; deterministic repeated validation; caller input not mutated', async () => {
  const s = await seededStore()
  const input = Object.freeze({ id: 'rec-1', tenant: T, evidence: Object.freeze(['e1', 'e2']), confidence: 0.8 })
  const snapshot = JSON.parse(JSON.stringify(input))
  const a = await validateRecommendation(input, { store: s })
  const b = await validateRecommendation(input, { store: s })
  assert.deepEqual(a, b)                               // deterministic
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.reasons) && Object.isFrozen(a.confidence))
  assert.deepEqual(input, snapshot)                    // caller input untouched
})

// ── invalid input throws ─────────────────────────────────────────────────────────

test('invalid input — non-object rec / missing store / non-array set throw invalid_input', async () => {
  const s = await seededStore()
  await assert.rejects(validateRecommendation(null, { store: s }), isInvalidInput)
  await assert.rejects(validateRecommendation(rec(), { store: null }), isInvalidInput)
  await assert.rejects(validateRecommendationSet('nope', { store: s }), isInvalidInput)
  assert.throws(() => duplicateRecommendations('nope'), isInvalidInput)
})

// ── source hygiene + dormancy ────────────────────────────────────────────────────

test('source — no clock/randomness/IO; imports only the evidence layer', () => {
  const allowed = new Set(['@brain/evidence-store', '@brain/evidence-citation', '@brain/evidence-weighting', '@brain/evidence-contracts'])
  for (const f of readdirSync(PKG_DIR).filter(x => /\.js$/.test(x))) {
    const code = readFileSync(join(PKG_DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    assert.ok(!/\b(Date\.now|new Date|Math\.random)\b/.test(code), `${f}: no clock/randomness`)
    assert.ok(!/\b(require|process|fetch)\b|node:fs|'fs'|writeFile/.test(code), `${f}: no side effects/IO`)
    for (const spec of [...code.matchAll(/from\s+'([^']+)'/g)].map(m => m[1])) {
      assert.ok(spec.startsWith('./') || allowed.has(spec), `${f}: illegal import ${spec}`)
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
const IMPORTS_PKG = /(?:from|import|require\(\s*)['"]@brain\/recommendation-validation['"]/

test('completely dormant — no runtime code imports @brain/recommendation-validation', () => {
  const files = collectJs(REPO)
  const offenders = files
    .filter(f => f !== TEST_FILE && !f.includes('/packages/brain-recommendation-validation/'))
    .filter(f => IMPORTS_PKG.test(readFileSync(f, 'utf8')))
    .map(f => f.replace(REPO + '/', ''))
  assert.deepEqual(offenders, [], `recommendation-validation must be imported by nobody yet; found: ${offenders.join(', ')}`)
  assert.ok(files.length > 50, 'sanity: the scan walked the source tree')
})
