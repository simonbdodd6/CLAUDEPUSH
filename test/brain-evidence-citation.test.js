/**
 * M48 — @brain/evidence-citation unit tests
 *
 * Comprehensive deterministic tests for citation validation: valid citations,
 * missing/duplicate/cross-tenant evidence, empty sets, invalid ids/inputs,
 * deterministic ordering, immutability, identical-input-identical-output, the
 * provenance chain resolver — and dormancy.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { createEvidenceStore, createInMemoryEvidenceDriver } from '@brain/evidence-store'
import { SOURCE_TYPE, SOURCE_FAMILY, SUBJECT_TYPE } from '@brain/evidence-contracts'
import {
  validateEvidenceCitation, validateEvidenceSet, resolveCitationChain,
  citationCoverage, missingEvidence, duplicateEvidence,
  CitationError, CITATION_ERROR,
} from '@brain/evidence-citation'

const REPO = join(fileURLToPath(new URL('..', import.meta.url)))
const TEST_FILE = fileURLToPath(import.meta.url)
const PKG_DIR = join(REPO, 'packages', 'brain-evidence-citation')

const T = Object.freeze({ clubId: 'club-A', teamId: 'team-1', seasonId: null })
const T2 = Object.freeze({ clubId: 'club-B', teamId: 'team-1', seasonId: null })

function rec(id, { tenant = T, derivedFrom = [] } = {}) {
  return {
    id, schemaVersion: '1.0', tenant,
    sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE, sourceFamily: SOURCE_FAMILY.MANUAL,
    subjectType: SUBJECT_TYPE.PLAYER, subjectId: 'p1',
    confidence: 0.5, observedAt: '2026-06-15T10:00:00Z', recordedAt: '2026-06-15T10:00:01Z', validFrom: null, validTo: null,
    author: { kind: 'coach', id: 'c1', name: null },
    raw: {}, signals: [],
    provenance: { derivedFrom, supersedes: null, ingestRunId: 'r', normalizer: 'n@1' },
    audit: [], sensitivity: { level: 'club', piiSubjectIds: [], consentRef: null },
  }
}
async function seededStore() {
  const s = createEvidenceStore({ driver: createInMemoryEvidenceDriver() })
  await s.appendEvidence(rec('e0'))
  await s.appendEvidence(rec('e1', { derivedFrom: ['e0'] }))
  await s.appendEvidence(rec('e2'))
  return s
}
const isInvalid = (e) => e instanceof CitationError && e.code === CITATION_ERROR.INVALID_INPUT

// ── valid citations ─────────────────────────────────────────────────────────────

test('valid citation — all ids resolve, same tenant, no duplicates', async () => {
  const s = await seededStore()
  const r = await validateEvidenceCitation(['e1', 'e2'], { store: s, tenant: T })
  assert.equal(r.valid, true)
  assert.deepEqual(r.missing, []); assert.deepEqual(r.duplicates, []); assert.deepEqual(r.crossTenant, [])
  assert.deepEqual(r.resolved.map(x => x.id), ['e1', 'e2'])
  assert.deepEqual(r.coverage, { cited: 2, resolved: 2, missing: 0, coverage: 1 })
})

// ── missing evidence ─────────────────────────────────────────────────────────────

test('missing evidence — unresolved id → invalid + reported', async () => {
  const s = await seededStore()
  const r = await validateEvidenceCitation(['e1', 'eX'], { store: s, tenant: T })
  assert.equal(r.valid, false)
  assert.deepEqual(r.missing, ['eX'])
  assert.equal(r.coverage.coverage, 0.5)
  assert.deepEqual(missingEvidence(['e1', 'eX', 'eY', 'eX'], [{ id: 'e1' }]), ['eX', 'eY'])   // pure, citation order, deduped
})

// ── duplicate evidence ───────────────────────────────────────────────────────────

test('duplicate evidence — duplicates rejected + reported', async () => {
  const s = await seededStore()
  const r = await validateEvidenceCitation(['e1', 'e1', 'e2'], { store: s, tenant: T })
  assert.equal(r.valid, false)
  assert.deepEqual(r.duplicates, ['e1'])
  assert.deepEqual(duplicateEvidence(['a', 'b', 'a', 'c', 'b']), { duplicates: ['a', 'b'], hasDuplicates: true })
  assert.deepEqual(duplicateEvidence(['a', 'b']), { duplicates: [], hasDuplicates: false })
})

// ── cross-tenant evidence ────────────────────────────────────────────────────────

test('cross-tenant — invisible via a tenant-scoped store; flagged by validateEvidenceSet', async () => {
  const s = await seededStore()
  // store is tenant-scoped: tenant B cannot resolve A's record → reported as missing
  const r = await validateEvidenceCitation(['e1'], { store: s, tenant: T2 })
  assert.equal(r.valid, false)
  assert.deepEqual(r.missing, ['e1'])
  // a record set carrying a foreign-tenant record is explicitly flagged crossTenant
  const set = validateEvidenceSet([rec('e1', { tenant: T }), rec('e9', { tenant: T2 })], { tenant: T2 })
  assert.equal(set.valid, false)
  assert.deepEqual(set.crossTenant, ['e1'])
})

// ── empty evidence sets ──────────────────────────────────────────────────────────

test('empty evidence set — no evidence ⇒ no claim (invalid)', async () => {
  const s = await seededStore()
  assert.equal((await validateEvidenceCitation([], { store: s, tenant: T })).valid, false)
  assert.deepEqual(citationCoverage([], []), { cited: 0, resolved: 0, missing: 0, coverage: 0 })
  assert.equal(validateEvidenceSet([], { tenant: T }).valid, false)
})

// ── invalid ids / inputs ─────────────────────────────────────────────────────────

test('invalid ids / inputs reject — bad ids/store → invalid_input; bad tenant → invalid_tenant', async () => {
  const s = await seededStore()
  const hasCode = (code) => (e) => e?.code === code
  await assert.rejects(validateEvidenceCitation([123], { store: s, tenant: T }), isInvalid)
  await assert.rejects(validateEvidenceCitation([''], { store: s, tenant: T }), isInvalid)
  await assert.rejects(validateEvidenceCitation([null], { store: s, tenant: T }), isInvalid)
  await assert.rejects(validateEvidenceCitation(['e1'], { store: null, tenant: T }), isInvalid)        // missing store
  await assert.rejects(validateEvidenceCitation(['e1'], { store: s, tenant: {} }), hasCode('invalid_tenant'))  // bad tenant (store's assertTenant)
  assert.throws(() => duplicateEvidence('nope'), isInvalid)
  assert.throws(() => citationCoverage(['e1'], 'nope'), isInvalid)
  assert.throws(() => validateEvidenceSet('nope', { tenant: T }), isInvalid)
})

// ── deterministic ordering + identical output ────────────────────────────────────

test('deterministic ordering + identical input → identical output', async () => {
  const s = await seededStore()
  const a = await validateEvidenceCitation(['e2', 'e1'], { store: s, tenant: T })
  const b = await validateEvidenceCitation(['e2', 'e1'], { store: s, tenant: T })
  assert.deepEqual(a, b)
  assert.deepEqual(a.resolved.map(x => x.id), ['e2', 'e1'])     // citation order preserved
})

// ── immutability ──────────────────────────────────────────────────────────────────

test('immutability — frozen results; caller input never mutated', async () => {
  const s = await seededStore()
  const ids = Object.freeze(['e1', 'e2'])
  const snapshot = [...ids]
  const r = await validateEvidenceCitation(ids, { store: s, tenant: T })
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.missing) && Object.isFrozen(r.resolved))
  assert.deepEqual([...ids], snapshot)                          // input array untouched
  assert.ok(Object.isFrozen(duplicateEvidence(['a'])))
  assert.ok(Object.isFrozen(validateEvidenceSet([rec('e1')], { tenant: T })))
})

// ── provenance chain ───────────────────────────────────────────────────────────────

test('resolveCitationChain — follows derivedFrom, deterministic, cycle-safe, depth-bounded', async () => {
  const s = createEvidenceStore({ driver: createInMemoryEvidenceDriver() })
  await s.appendEvidence(rec('e0', { derivedFrom: ['e1'] }))     // cycle: e0 → e1 → e0
  await s.appendEvidence(rec('e1', { derivedFrom: ['e0'] }))
  const full = await resolveCitationChain(['e1'], { store: s, tenant: T })
  assert.deepEqual(full.order, ['e1', 'e0'])                     // cycle terminates
  assert.equal(full.truncated, false)
  const a = await resolveCitationChain(['e1'], { store: s, tenant: T })
  assert.deepEqual(a, full)                                      // deterministic
  const shallow = await resolveCitationChain(['e1'], { store: s, tenant: T, maxDepth: 0 })
  assert.deepEqual(shallow.order, ['e1'])
  assert.equal(shallow.truncated, true)
})

// ── source hygiene + dormancy ────────────────────────────────────────────────────

test('source — no clock/randomness/IO; imports only @brain/evidence-store', () => {
  for (const f of readdirSync(PKG_DIR).filter(x => /\.js$/.test(x))) {
    const code = readFileSync(join(PKG_DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    assert.ok(!/\b(Date\.now|new Date|Math\.random)\b/.test(code), `${f}: no clock/randomness`)
    assert.ok(!/\b(require|process|fetch)\b|node:fs|'fs'|writeFile/.test(code), `${f}: no side effects/IO`)
    for (const spec of [...code.matchAll(/from\s+'([^']+)'/g)].map(m => m[1])) {
      assert.ok(spec.startsWith('./') || spec === '@brain/evidence-store' || spec === '@brain/evidence-contracts', `${f}: illegal import ${spec}`)
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
const IMPORTS_PKG = /(?:from|import|require\(\s*)['"]@brain\/evidence-citation['"]/

test('completely dormant — no runtime code imports @brain/evidence-citation', () => {
  const files = collectJs(REPO)
  const offenders = files
    .filter(f => f !== TEST_FILE && !f.includes('/packages/brain-evidence-citation/'))
    .filter(f => IMPORTS_PKG.test(readFileSync(f, 'utf8')))
    .map(f => f.replace(REPO + '/', ''))
  assert.deepEqual(offenders, [], `evidence-citation must be imported by nobody yet; found: ${offenders.join(', ')}`)
  assert.ok(files.length > 50, 'sanity: the scan walked the source tree')
})
