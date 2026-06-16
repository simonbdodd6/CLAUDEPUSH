/**
 * M44 — @brain/evidence-store skeleton tests
 *
 * Deterministic tests for the dormant Evidence Store contract:
 *   1. API shape — the six methods, frozen, EVIDENCE_STORE_METHODS matches;
 *   2. strict tenant scoping — every call rejects `invalid_tenant` before anything;
 *   3. argument/record shape validation (against @brain/evidence-contracts);
 *   4. NO persistence / NO I/O — a well-formed call rejects `not_implemented`, and
 *      the package source imports no fs/net/db, only @brain/evidence-contracts;
 *   5. dormant — imported by nobody yet (repo-wide scan).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import {
  createEvidenceStore, EVIDENCE_STORE_METHODS,
  EvidenceStoreError, STORE_ERROR, assertTenant, sameTenant,
} from '@brain/evidence-store'
import { SOURCE_TYPE, SOURCE_FAMILY, SUBJECT_TYPE, AUDIT_ACTION } from '@brain/evidence-contracts'

const REPO = join(fileURLToPath(new URL('..', import.meta.url)))
const TEST_FILE = fileURLToPath(import.meta.url)
const PKG_DIR = join(REPO, 'packages', 'brain-evidence-store')

const TENANT = Object.freeze({ clubId: 'club-1', teamId: 'team-1', seasonId: null })
const RECORD = Object.freeze({
  id: 'ev-1', schemaVersion: '1.0', tenant: TENANT,
  sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE, sourceFamily: SOURCE_FAMILY.MANUAL,
  subjectType: SUBJECT_TYPE.PLAYER, subjectId: 'player-1',
  confidence: 0.5, observedAt: '2026-06-15T10:00:00Z', recordedAt: '2026-06-15T10:00:01Z',
  validFrom: null, validTo: null,
  author: { kind: 'coach', id: 'coach-1', name: null },
  raw: { note: 'good first half' }, signals: [],
  provenance: { derivedFrom: [], supersedes: null, ingestRunId: 'run-1', normalizer: 'match-note@1.0' },
  audit: [], sensitivity: { level: 'club', piiSubjectIds: [], consentRef: null },
})
const AUDIT = Object.freeze({ at: '2026-06-15T10:00:02Z', actor: 'coach-1', action: AUDIT_ACTION.VALIDATED, note: null })
const SUBJECT = Object.freeze({ subjectType: SUBJECT_TYPE.PLAYER, subjectId: 'player-1' })

const isCode = (code) => (e) => e instanceof EvidenceStoreError && e.code === code

// ── 1. API shape ──────────────────────────────────────────────────────────────

test('API shape — six frozen methods matching EVIDENCE_STORE_METHODS', () => {
  const store = createEvidenceStore()
  assert.ok(Object.isFrozen(store))
  assert.deepEqual(Object.keys(store).sort(), [...EVIDENCE_STORE_METHODS].sort())
  assert.deepEqual([...EVIDENCE_STORE_METHODS].sort(),
    ['appendAuditEntry', 'appendEvidence', 'getEvidenceById', 'listEvidenceForSubject', 'queryEvidence', 'resolveEvidenceCitation'])
  for (const m of EVIDENCE_STORE_METHODS) assert.equal(typeof store[m], 'function')
})

// ── 2. tenant scoping ─────────────────────────────────────────────────────────

test('tenant scoping — every method rejects invalid_tenant before anything else', async () => {
  const store = createEvidenceStore()
  const bad = [null, undefined, {}, { teamId: 'x' }, { clubId: '' }, { clubId: 5 }, 'club-1', { clubId: 'c', teamId: 9 }]
  for (const t of bad) {
    await assert.rejects(store.getEvidenceById(t, 'ev-1'), isCode(STORE_ERROR.INVALID_TENANT))
    await assert.rejects(store.queryEvidence(t, {}), isCode(STORE_ERROR.INVALID_TENANT))
    await assert.rejects(store.listEvidenceForSubject(t, SUBJECT), isCode(STORE_ERROR.INVALID_TENANT))
    await assert.rejects(store.appendAuditEntry(t, 'ev-1', AUDIT), isCode(STORE_ERROR.INVALID_TENANT))
    await assert.rejects(store.resolveEvidenceCitation(t, ['ev-1']), isCode(STORE_ERROR.INVALID_TENANT))
    await assert.rejects(store.appendEvidence({ ...RECORD, tenant: t }), isCode(STORE_ERROR.INVALID_TENANT))
  }
})

test('assertTenant / sameTenant primitives', () => {
  assert.equal(assertTenant(TENANT), TENANT)
  assert.throws(() => assertTenant({}), isCode(STORE_ERROR.INVALID_TENANT))
  assert.equal(sameTenant(TENANT, { clubId: 'club-1', teamId: 'team-1', seasonId: null }), true)
  assert.equal(sameTenant(TENANT, { clubId: 'club-2', teamId: 'team-1' }), false)   // different club
  assert.equal(sameTenant(TENANT, { clubId: 'club-1', teamId: 'team-2' }), false)   // different team
})

// ── 3. argument / record validation ───────────────────────────────────────────

test('argument validation — malformed args reject invalid_argument', async () => {
  const store = createEvidenceStore()
  await assert.rejects(store.getEvidenceById(TENANT, ''), isCode(STORE_ERROR.INVALID_ARGUMENT))
  await assert.rejects(store.queryEvidence(TENANT, 'not-an-object'), isCode(STORE_ERROR.INVALID_ARGUMENT))
  await assert.rejects(store.listEvidenceForSubject(TENANT, { subjectType: 'bogus', subjectId: 'p' }), isCode(STORE_ERROR.INVALID_ARGUMENT))
  await assert.rejects(store.appendAuditEntry(TENANT, 'ev-1', { ...AUDIT, action: 'bogus' }), isCode(STORE_ERROR.INVALID_ARGUMENT))
  await assert.rejects(store.resolveEvidenceCitation(TENANT, 'not-an-array'), isCode(STORE_ERROR.INVALID_ARGUMENT))
})

test('record validation — bad EvidenceRecord rejects invalid_record', async () => {
  const store = createEvidenceStore()
  await assert.rejects(store.appendEvidence('x'), isCode(STORE_ERROR.INVALID_RECORD))
  await assert.rejects(store.appendEvidence({ ...RECORD, sourceType: 'bogus' }), isCode(STORE_ERROR.INVALID_RECORD))
  await assert.rejects(store.appendEvidence({ ...RECORD, subjectType: 'bogus' }), isCode(STORE_ERROR.INVALID_RECORD))
  await assert.rejects(store.appendEvidence({ ...RECORD, confidence: 2 }), isCode(STORE_ERROR.INVALID_RECORD))
  await assert.rejects(store.appendEvidence({ ...RECORD, signals: 'nope' }), isCode(STORE_ERROR.INVALID_RECORD))
})

// ── 4. no persistence / dormant behaviour ──────────────────────────────────────

test('no persistence — well-formed calls reject not_implemented (nothing stored), deterministically', async () => {
  const store = createEvidenceStore()
  const calls = [
    () => store.appendEvidence(RECORD),
    () => store.getEvidenceById(TENANT, 'ev-1'),
    () => store.queryEvidence(TENANT, { subjectType: SUBJECT_TYPE.PLAYER }),
    () => store.listEvidenceForSubject(TENANT, SUBJECT),
    () => store.appendAuditEntry(TENANT, 'ev-1', AUDIT),
    () => store.resolveEvidenceCitation(TENANT, ['ev-1', 'ev-2']),
  ]
  for (const call of calls) {
    await assert.rejects(call(), isCode(STORE_ERROR.NOT_IMPLEMENTED))
    await assert.rejects(call(), isCode(STORE_ERROR.NOT_IMPLEMENTED))   // same outcome twice — deterministic, stateless
  }
})

test('no I/O — package source imports only @brain/evidence-contracts (no fs/net/db)', () => {
  const FORBIDDEN = /(?:from|import|require\(\s*)['"](?:node:)?(?:fs|fs\/promises|net|http|https|dns|dgram|tls|child_process|worker_threads|os|path|sqlite3|better-sqlite3|pg|mysql|mysql2|mongodb|redis|ioredis)['"]/
  const files = readdirSync(PKG_DIR).filter(f => /\.js$/.test(f)).map(f => join(PKG_DIR, f))
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    assert.ok(!FORBIDDEN.test(src), `${f.replace(REPO + '/', '')} must not import storage/file/network modules`)
    for (const spec of [...src.matchAll(/from\s+'([^']+)'/g)].map(m => m[1])) {
      const ok = spec.startsWith('./') || spec === '@brain/evidence-contracts'
      assert.ok(ok, `${f.replace(REPO + '/', '')} illegal import: ${spec}`)
    }
  }
})

// ── 5. dormancy ────────────────────────────────────────────────────────────────

const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.vite', 'coverage', 'data', '.next', '.cache'])
function collectJs(absDir, out = []) {
  let entries
  try { entries = readdirSync(absDir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (e.isDirectory()) { if (!EXCLUDE_DIRS.has(e.name)) collectJs(join(absDir, e.name), out) }
    else if (/\.(js|mjs|cjs|jsx)$/.test(e.name)) out.push(join(absDir, e.name))
  }
  return out
}
const IMPORTS_PKG = /(?:from|import|require\(\s*)['"]@brain\/evidence-store['"]/

test('completely dormant — no runtime code imports @brain/evidence-store', () => {
  const files = collectJs(REPO)
  const offenders = files
    .filter(f => f !== TEST_FILE && !f.includes('/packages/brain-evidence-store/'))
    .filter(f => IMPORTS_PKG.test(readFileSync(f, 'utf8')))
    .map(f => f.replace(REPO + '/', ''))
  assert.deepEqual(offenders, [], `evidence-store must be imported by nobody yet; found: ${offenders.join(', ')}`)
  assert.ok(files.length > 50, 'sanity: the scan walked the source tree')
})
