/**
 * M45 — @brain/evidence-gateway skeleton tests
 *
 * Deterministic tests for the dormant Evidence Gateway:
 *   1. canonical, frozen stage ORDER (registry + each run), repeatable;
 *   2. tenant validation happens FIRST (bad tenant halts at `validate`, before
 *      `normalize`); valid runs all eight in order;
 *   3. NO stage performs storage — a spy store injected into the gateway gets zero
 *      calls during submit;
 *   4. NO I/O / no randomness — package source imports only the evidence layer and
 *      uses no fs/net/db, no Date/Math.random;
 *   5. dormant — imported by nobody yet (repo-wide scan).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import {
  createEvidenceGateway, createGatewayContext, isGatewayContext,
  EVIDENCE_GATEWAY_STAGES, EVIDENCE_GATEWAY_STAGE_NAMES, STAGE_BY_NAME,
} from '@brain/evidence-gateway'
import { STORE_ERROR } from '@brain/evidence-store'

const REPO = join(fileURLToPath(new URL('..', import.meta.url)))
const TEST_FILE = fileURLToPath(import.meta.url)
const PKG_DIR = join(REPO, 'packages', 'brain-evidence-gateway')

const ORDER = ['receive', 'validate', 'normalize', 'deduplicate', 'prepareConfidenceUpdate', 'prepareMemoryLink', 'prepareAudit', 'prepareEngineExposure']
const TENANT = Object.freeze({ clubId: 'club-1', teamId: 'team-1', seasonId: null })
const SUBMISSION = Object.freeze({ sourceType: 'manual.matchNote', raw: { note: 'x' } })
const ctx = () => createGatewayContext({ ingestRunId: 'run-1', tenant: TENANT, submission: SUBMISSION })

const isCode = (code) => (e) => e?.code === code

// ── 1. stage order ────────────────────────────────────────────────────────────

test('canonical stage registry — frozen, ordered, { name, run } shape', () => {
  assert.deepEqual([...EVIDENCE_GATEWAY_STAGE_NAMES], ORDER)
  assert.ok(Object.isFrozen(EVIDENCE_GATEWAY_STAGES))
  assert.ok(Object.isFrozen(EVIDENCE_GATEWAY_STAGE_NAMES))
  assert.equal(EVIDENCE_GATEWAY_STAGES.length, ORDER.length)
  for (const s of EVIDENCE_GATEWAY_STAGES) {
    assert.equal(typeof s.name, 'string')
    assert.equal(typeof s.run, 'function')
    assert.equal(STAGE_BY_NAME[s.name], s)
  }
})

test('submit runs the stages in canonical order, deterministically', async () => {
  const g = createEvidenceGateway()
  const a = await g.submit(ctx())
  const b = await g.submit(ctx())
  assert.deepEqual([...a.stages], ORDER)
  assert.deepEqual(a.results.map(r => r.stage), ORDER)
  assert.equal(a.results[0].status, 'ok')        // receive
  assert.equal(a.results[1].status, 'ok')        // validate
  assert.ok(a.results.slice(2).every(r => r.status === 'deferred'))   // the rest do no work
  assert.deepEqual(a, b)                          // same input → identical result
})

// ── 2. tenant validation first ─────────────────────────────────────────────────

test('tenant validation happens FIRST — bad tenant halts at validate, before normalize', async () => {
  const trace = []
  const g = createEvidenceGateway({ onStage: (n) => trace.push(n) })
  await assert.rejects(
    g.submit({ ingestRunId: 'run-1', tenant: {}, submission: SUBMISSION }),
    isCode(STORE_ERROR.INVALID_TENANT),
  )
  assert.deepEqual(trace, ['receive', 'validate'])   // normalize+ never reached
})

test('valid tenant runs all eight stages in order', async () => {
  const trace = []
  const g = createEvidenceGateway({ onStage: (n) => trace.push(n) })
  await g.submit(ctx())
  assert.deepEqual(trace, ORDER)
})

// ── 3. no stage performs storage ───────────────────────────────────────────────

test('no stage performs storage — an injected store gets ZERO calls', async () => {
  const calls = {}
  const spyMethod = (name) => (...args) => { calls[name] = (calls[name] ?? 0) + 1; return Promise.resolve(null) }
  const spyStore = {
    appendEvidence: spyMethod('appendEvidence'),
    getEvidenceById: spyMethod('getEvidenceById'),
    queryEvidence: spyMethod('queryEvidence'),
    listEvidenceForSubject: spyMethod('listEvidenceForSubject'),
    appendAuditEntry: spyMethod('appendAuditEntry'),
    resolveEvidenceCitation: spyMethod('resolveEvidenceCitation'),
  }
  const g = createEvidenceGateway({ store: spyStore })
  assert.equal(g.store, spyStore)                  // held for the future…
  await g.submit(ctx())
  assert.deepEqual(calls, {}, 'gateway must call no store persistence method in M45')
})

// ── 4. no I/O / no randomness in source ────────────────────────────────────────

test('no I/O — package source imports only the evidence layer; no fs/net/db; no clock/randomness', () => {
  const FORBIDDEN = /(?:from|import|require\(\s*)['"](?:node:)?(?:fs|fs\/promises|net|http|https|dns|dgram|tls|child_process|worker_threads|os|path|sqlite3|better-sqlite3|pg|mysql|mysql2|mongodb|redis|ioredis)['"]/
  const files = readdirSync(PKG_DIR).filter(f => /\.js$/.test(f)).map(f => join(PKG_DIR, f))
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    const rel = f.replace(REPO + '/', '')
    assert.ok(!FORBIDDEN.test(src), `${rel} must not import storage/file/network modules`)
    assert.ok(!/\b(Math\.random|Date\.now|new Date)\b/.test(src), `${rel} must be deterministic (no clock/randomness)`)
    for (const spec of [...src.matchAll(/from\s+'([^']+)'/g)].map(m => m[1])) {
      const ok = spec.startsWith('./') || spec === '@brain/evidence-contracts' || spec === '@brain/evidence-store' || spec === '@brain/evidence-normalization' || spec === '@brain/evidence-weighting'
      assert.ok(ok, `${rel} illegal import: ${spec}`)
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
const IMPORTS_PKG = /(?:from|import|require\(\s*)['"]@brain\/evidence-gateway['"]/

test('completely dormant — no runtime code imports @brain/evidence-gateway', () => {
  const files = collectJs(REPO)
  const offenders = files
    .filter(f => f !== TEST_FILE && !f.includes('/packages/brain-evidence-gateway/'))
    .filter(f => IMPORTS_PKG.test(readFileSync(f, 'utf8')))
    .map(f => f.replace(REPO + '/', ''))
  assert.deepEqual(offenders, [], `evidence-gateway must be imported by nobody yet; found: ${offenders.join(', ')}`)
  assert.ok(files.length > 50, 'sanity: the scan walked the source tree')
})

// ── context helper ─────────────────────────────────────────────────────────────

test('createGatewayContext / isGatewayContext are pure + deterministic', () => {
  const c = createGatewayContext({ ingestRunId: 'r', tenant: TENANT, submission: SUBMISSION })
  assert.ok(Object.isFrozen(c))
  assert.ok(isGatewayContext(c))
  assert.deepEqual(createGatewayContext({ ingestRunId: 'r', tenant: TENANT, submission: SUBMISSION }), c)
  // garbage in → null fields, never throws
  const empty = createGatewayContext({})
  assert.deepEqual(empty, { ingestRunId: null, tenant: null, submission: null, normalization: null })
})
