/**
 * M46 — @brain/evidence-store in-memory driver tests
 *
 * Deterministic tests for the in-memory EvidenceDriver behind the store:
 *   - appendEvidence / getEvidenceById / queryEvidence / listEvidenceForSubject /
 *     appendAuditEntry / resolveEvidenceCitation;
 *   - strict tenant isolation; append-only behaviour; insertion order; never
 *     mutates caller input; returns deeply-frozen data; caller supplies ids +
 *     timestamps (no auto-generation, no clock, no randomness);
 *   - default store (no driver) stays dormant;
 *   - dormant package — no runtime importers.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { createEvidenceStore, createInMemoryEvidenceDriver, STORE_ERROR } from '@brain/evidence-store'
import { SOURCE_TYPE, SOURCE_FAMILY, SUBJECT_TYPE, AUDIT_ACTION } from '@brain/evidence-contracts'

const REPO = join(fileURLToPath(new URL('..', import.meta.url)))
const TEST_FILE = fileURLToPath(import.meta.url)
const PKG_DIR = join(REPO, 'packages', 'brain-evidence-store')

const TENANT_A = Object.freeze({ clubId: 'club-A', teamId: 'team-1', seasonId: null })
const TENANT_B = Object.freeze({ clubId: 'club-B', teamId: 'team-1', seasonId: null })

function record(id, { tenant = TENANT_A, subjectId = 'player-1', subjectType = SUBJECT_TYPE.PLAYER, confidence = 0.5, observedAt = '2026-06-15T10:00:00Z', signals = [] } = {}) {
  return {
    id, schemaVersion: '1.0', tenant,
    sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE, sourceFamily: SOURCE_FAMILY.MANUAL,
    subjectType, subjectId,
    confidence, observedAt, recordedAt: '2026-06-15T10:00:01Z', validFrom: null, validTo: null,
    author: { kind: 'coach', id: 'coach-1', name: null },
    raw: { note: id }, signals,
    provenance: { derivedFrom: [], supersedes: null, ingestRunId: 'run-1', normalizer: 'match-note@1.0' },
    audit: [], sensitivity: { level: 'club', piiSubjectIds: [], consentRef: null },
  }
}
const AUDIT = (action = AUDIT_ACTION.VALIDATED, at = '2026-06-15T11:00:00Z') => ({ at, actor: 'coach-1', action, note: null })
const store = () => createEvidenceStore({ driver: createInMemoryEvidenceDriver() })
const isCode = (code) => (e) => e?.code === code

// ── appendEvidence ────────────────────────────────────────────────────────────

test('appendEvidence — stores the record and returns the caller-supplied id', async () => {
  const s = store()
  const r = await s.appendEvidence(record('ev-1'))
  assert.deepEqual(r, { id: 'ev-1' })                 // returns the id the caller supplied — no auto-gen
  const got = await s.getEvidenceById(TENANT_A, 'ev-1')
  assert.equal(got.id, 'ev-1')
  assert.equal(got.raw.note, 'ev-1')
})

test('appendEvidence — never mutates caller input; stores an independent copy', async () => {
  const s = store()
  const input = record('ev-1')
  input.signals.push({ key: 'pre-existing' })          // sanity: input is mutable here
  await s.appendEvidence(input)
  input.raw.note = 'MUTATED AFTER APPEND'              // mutate caller object after storing
  input.signals.push({ key: 'added-after' })
  const got = await s.getEvidenceById(TENANT_A, 'ev-1')
  assert.equal(got.raw.note, 'ev-1')                   // store copy unaffected
  assert.equal(got.signals.length, 1)                  // only the pre-append signal
})

// ── getEvidenceById ───────────────────────────────────────────────────────────

test('getEvidenceById — returns a deeply-frozen record, or null when absent', async () => {
  const s = store()
  await s.appendEvidence(record('ev-1'))
  const got = await s.getEvidenceById(TENANT_A, 'ev-1')
  assert.ok(Object.isFrozen(got))
  assert.ok(Object.isFrozen(got.signals) && Object.isFrozen(got.author) && Object.isFrozen(got.tenant))
  assert.equal(await s.getEvidenceById(TENANT_A, 'missing'), null)
})

// ── queryEvidence ─────────────────────────────────────────────────────────────

test('queryEvidence — filters within a tenant, preserving insertion order', async () => {
  const s = store()
  await s.appendEvidence(record('e1', { subjectId: 'p1', confidence: 0.4 }))
  await s.appendEvidence(record('e2', { subjectId: 'p2', confidence: 0.9, observedAt: '2026-06-16T10:00:00Z' }))
  await s.appendEvidence(record('e3', { subjectId: 'p1', confidence: 0.6 }))
  assert.deepEqual((await s.queryEvidence(TENANT_A, {})).map(r => r.id), ['e1', 'e2', 'e3'])           // insertion order
  assert.deepEqual((await s.queryEvidence(TENANT_A, { subjectId: 'p1' })).map(r => r.id), ['e1', 'e3'])
  assert.deepEqual((await s.queryEvidence(TENANT_A, { minConfidence: 0.6 })).map(r => r.id), ['e2', 'e3'])
  assert.deepEqual((await s.queryEvidence(TENANT_A, { since: '2026-06-16T00:00:00Z' })).map(r => r.id), ['e2'])
  assert.deepEqual((await s.queryEvidence(TENANT_A, { limit: 2 })).map(r => r.id), ['e1', 'e2'])
})

// ── listEvidenceForSubject ─────────────────────────────────────────────────────

test('listEvidenceForSubject — only that subject, in insertion order', async () => {
  const s = store()
  await s.appendEvidence(record('e1', { subjectId: 'p1' }))
  await s.appendEvidence(record('e2', { subjectId: 'p2' }))
  await s.appendEvidence(record('e3', { subjectId: 'p1' }))
  assert.deepEqual((await s.listEvidenceForSubject(TENANT_A, { subjectType: SUBJECT_TYPE.PLAYER, subjectId: 'p1' })).map(r => r.id), ['e1', 'e3'])
})

// ── appendAuditEntry ──────────────────────────────────────────────────────────

test('appendAuditEntry — append-only; accumulates in order; merged into reads', async () => {
  const s = store()
  await s.appendEvidence(record('ev-1'))
  await s.appendAuditEntry(TENANT_A, 'ev-1', AUDIT(AUDIT_ACTION.RECEIVED, '2026-06-15T10:00:05Z'))
  await s.appendAuditEntry(TENANT_A, 'ev-1', AUDIT(AUDIT_ACTION.VALIDATED, '2026-06-15T10:00:06Z'))
  const got = await s.getEvidenceById(TENANT_A, 'ev-1')
  assert.deepEqual(got.audit.map(a => a.action), ['received', 'validated'])   // append order preserved
  assert.ok(Object.isFrozen(got.audit))
})

test('appendAuditEntry — missing record / wrong tenant → not_found; caller entry not mutated', async () => {
  const s = store()
  await s.appendEvidence(record('ev-1'))
  await assert.rejects(s.appendAuditEntry(TENANT_A, 'nope', AUDIT()), isCode(STORE_ERROR.NOT_FOUND))
  await assert.rejects(s.appendAuditEntry(TENANT_B, 'ev-1', AUDIT()), isCode(STORE_ERROR.NOT_FOUND))   // isolation
  const entry = AUDIT()
  await s.appendAuditEntry(TENANT_A, 'ev-1', entry)
  entry.actor = 'MUTATED'
  assert.equal((await s.getEvidenceById(TENANT_A, 'ev-1')).audit[0].actor, 'coach-1')   // stored copy independent
})

// ── resolveEvidenceCitation ────────────────────────────────────────────────────

test('resolveEvidenceCitation — citation order, skips unresolved, tenant-scoped', async () => {
  const s = store()
  await s.appendEvidence(record('e1'))
  await s.appendEvidence(record('e2'))
  assert.deepEqual((await s.resolveEvidenceCitation(TENANT_A, ['e2', 'e1', 'missing'])).map(r => r.id), ['e2', 'e1'])
  assert.deepEqual((await s.resolveEvidenceCitation(TENANT_B, ['e1', 'e2'])).map(r => r.id), [])   // other tenant sees nothing
})

// ── tenant isolation ───────────────────────────────────────────────────────────

test('tenant isolation — records under one tenant never leak to another', async () => {
  const s = store()
  await s.appendEvidence(record('e1', { tenant: TENANT_A }))
  await s.appendEvidence(record('e2', { tenant: TENANT_B }))
  assert.equal(await s.getEvidenceById(TENANT_B, 'e1'), null)
  assert.deepEqual((await s.queryEvidence(TENANT_A, {})).map(r => r.id), ['e1'])
  assert.deepEqual((await s.queryEvidence(TENANT_B, {})).map(r => r.id), ['e2'])
  assert.deepEqual((await s.listEvidenceForSubject(TENANT_A, { subjectType: SUBJECT_TYPE.PLAYER, subjectId: 'player-1' })).map(r => r.id), ['e1'])
})

// ── append-only ────────────────────────────────────────────────────────────────

test('append-only — re-appending an id conflicts; the original is never overwritten', async () => {
  const s = store()
  await s.appendEvidence(record('ev-1', { confidence: 0.5 }))
  await assert.rejects(s.appendEvidence(record('ev-1', { confidence: 0.9, subjectId: 'other' })), isCode(STORE_ERROR.CONFLICT))
  const got = await s.getEvidenceById(TENANT_A, 'ev-1')
  assert.equal(got.confidence, 0.5)            // unchanged
  assert.equal(got.subjectId, 'player-1')      // unchanged
})

// ── default store dormant ──────────────────────────────────────────────────────

test('default store (no driver) stays dormant — not_implemented for every well-formed call', async () => {
  const s = createEvidenceStore()              // NO driver
  await assert.rejects(s.appendEvidence(record('ev-1')), isCode(STORE_ERROR.NOT_IMPLEMENTED))
  await assert.rejects(s.getEvidenceById(TENANT_A, 'ev-1'), isCode(STORE_ERROR.NOT_IMPLEMENTED))
  await assert.rejects(s.queryEvidence(TENANT_A, {}), isCode(STORE_ERROR.NOT_IMPLEMENTED))
  await assert.rejects(s.resolveEvidenceCitation(TENANT_A, ['ev-1']), isCode(STORE_ERROR.NOT_IMPLEMENTED))
})

// ── determinism / no clock-randomness-autoid ───────────────────────────────────

test('determinism — same operations → identical state; driver source has no Date/Math.random/id-gen', async () => {
  const build = async () => {
    const s = store()
    await s.appendEvidence(record('e1'))
    await s.appendEvidence(record('e2', { subjectId: 'p2' }))
    await s.appendAuditEntry(TENANT_A, 'e1', AUDIT())
    return { all: (await s.queryEvidence(TENANT_A, {})), e1: await s.getEvidenceById(TENANT_A, 'e1') }
  }
  assert.deepEqual(await build(), await build())
  for (const f of ['in-memory-driver.js', 'clone.js']) {
    // strip comments first so prose like "no Math.random" is not a false positive
    const code = readFileSync(join(PKG_DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    assert.ok(!/\b(Date\.now|new Date|Math\.random)\b/.test(code), `${f} must use no clock/randomness`)
    assert.ok(!/randomUUID|nanoid|ulid|generateId/i.test(code), `${f} must not auto-generate ids`)
  }
})

// ── dormancy ───────────────────────────────────────────────────────────────────

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
const IMPORTS_PKG = /(?:from|import|require\(\s*)['"]@brain\/evidence-store['"]/

test('no runtime importers — only tests + the intra-evidence layer import @brain/evidence-store', () => {
  const files = collectJs(REPO)
  const offenders = files
    .filter(f => f !== TEST_FILE && !f.includes('/packages/brain-evidence-'))   // exclude tests-under-question + the evidence packages themselves
    .filter(f => !f.includes('/test/'))
    .filter(f => IMPORTS_PKG.test(readFileSync(f, 'utf8')))
    .map(f => f.replace(REPO + '/', ''))
  assert.deepEqual(offenders, [], `@brain/evidence-store must have no runtime importers; found: ${offenders.join(', ')}`)
  assert.ok(files.length > 50, 'sanity: the scan walked the source tree')
})
