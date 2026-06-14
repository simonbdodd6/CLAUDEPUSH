/**
 * M31.5 — Coach's Eye host adapter tests
 *
 * Proves the dormant host adapter:
 *   1. builds a runtime port whose output is GOLDEN-PARITY with the match-readiness
 *      engine's direct output (injected CoachAI);
 *   2. drives the façade end-to-end (invokeCoachesEye(...).data == engine output);
 *   3. runs the REAL integration layer end-to-end (default CoachAI) without error;
 *   4. exposes only `getMatchReadiness` — all other capabilities stay dormant;
 *   5. is imported by NOBODY yet — Core included (repo-wide scan); and
 *   6. is the host: it imports the façade + engine (never Core).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { createCoachesEyeRuntime, invokeCoachesEye, ADAPTER_WIRED_CAPABILITIES } from '../host-coaches-eye/index.js'
import { getMatchReadiness } from '../coach-products/match-readiness/index.js'   // engine, for the parity baseline

const REPO = join(fileURLToPath(new URL('..', import.meta.url)))
const TEST_FILE = fileURLToPath(import.meta.url)

// ── deterministic engine fixture (mirrors the M21 / M31.4 mock) ───────────────
const READ = {
  teamId: 'team-1', squadReadinessPct: 80, availabilityPct: 85, injuryConcerns: [],
  trainingCompletion: { total: 8, estimatedMinutes: 200 },
  preparationChecklist: [{ planId: 'p1', title: 'Walkthrough', status: 'done' }],
  missingActions: [], explanationIds: ['exp-r1'], confidence: 75, isMock: false,
}
const DASH = { topPriorities: [], biggestRisks: [], medicalSummary: { total: 0, concerns: [] }, recommendedActions: [], explanationIds: ['exp-d1'], confidence: 0.8, isMock: false }
const CAPS = { integrationVersion: '1.0', tier: 'professional', isEnabled: true, features: { dashboard: true, weeklyBrief: true, matchReadiness: true, playerCard: true, clubSnapshot: true }, availableProducts: [], upgradeAvailable: false, limitations: [], reason: null }
const mockCoachAI = {
  getCapabilities: async () => CAPS,
  getMatchReadiness: async () => ({ integrationVersion: '1.0', ok: true, available: true, tier: 'professional', reason: null, data: READ }),
  getDashboard: async () => ({ integrationVersion: '1.0', ok: true, available: true, tier: 'professional', reason: null, data: DASH }),
  getProfile: async () => ({ integrationVersion: '1.0', ok: true, available: true, tier: 'professional', reason: null, data: null }),
  getPlayerCard: async () => ({ ok: false, available: false, data: null }),
  getClubSnapshot: async () => ({ ok: false, available: false, data: null }),
}
const ENGINE_CONTEXT = { user: { tier: 'professional', coachId: 'c1' }, team: { teamId: 'team-1' }, fixtureId: 'fx-1', generatedAt: '2026-06-14T10:00:00Z' }

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — golden parity (adapter port + façade path) with an injected CoachAI
// ─────────────────────────────────────────────────────────────────────────────

test('parity — adapter port output deepEquals the engine direct output', async () => {
  const engineOut = await getMatchReadiness(ENGINE_CONTEXT, mockCoachAI)
  const runtime = createCoachesEyeRuntime({ coachAI: mockCoachAI })
  assert.ok(Object.isFrozen(runtime))
  const portOut = await runtime.getMatchReadiness(ENGINE_CONTEXT)
  assert.deepEqual(portOut, engineOut)
})

test('parity — invokeCoachesEye(matchReadiness).data deepEquals the engine output', async () => {
  const engineOut = await getMatchReadiness(ENGINE_CONTEXT, mockCoachAI)
  const r = await invokeCoachesEye('coach.matchReadiness', { tier: 'professional', payload: ENGINE_CONTEXT }, { coachAI: mockCoachAI })
  assert.equal(r.available, true)
  assert.equal(r.ok, true)
  assert.equal(r.reason, null)
  assert.equal(r.version, '2.0')
  assert.deepEqual(r.data, engineOut)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — the REAL integration layer is wired end-to-end (default CoachAI)
// ─────────────────────────────────────────────────────────────────────────────

test('real wiring — default runtime reaches the live integration layer without error', async () => {
  const runtime = createCoachesEyeRuntime()   // no injected CoachAI → real integration layer
  const out = await runtime.getMatchReadiness({ user: { tier: 'professional', coachId: 'c1' }, team: { teamId: 't1' }, generatedAt: '2026-06-14T10:00:00Z' })
  assert.ok(out && typeof out === 'object')
  assert.equal(out.productId, 'match-readiness')
  assert.ok('overallScore' in out, 'a real match-readiness response is produced')
  // also drives cleanly through the façade
  const r = await invokeCoachesEye('coach.matchReadiness', { tier: 'professional', payload: { user: { tier: 'professional', coachId: 'c1' }, team: { teamId: 't1' }, generatedAt: '2026-06-14T10:00:00Z' } })
  assert.equal(r.available, true)
  assert.equal(r.ok, true)
  assert.equal(r.data.productId, 'match-readiness')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — only matchReadiness is wired; everything else stays dormant
// ─────────────────────────────────────────────────────────────────────────────

test('runtime port exposes ONLY getMatchReadiness', () => {
  const runtime = createCoachesEyeRuntime({ coachAI: mockCoachAI })
  assert.deepEqual(Object.keys(runtime), ['getMatchReadiness'])
  assert.deepEqual(Object.keys(ADAPTER_WIRED_CAPABILITIES), ['coach.matchReadiness'])
})

test('other capabilities resolve dormant through the adapter', async () => {
  // permitted but not wired → dormant
  const dna = await invokeCoachesEye('coach.coachDna', { tier: 'professional', payload: ENGINE_CONTEXT }, { coachAI: mockCoachAI })
  assert.equal(dna.available, true)
  assert.equal(dna.ok, false)
  assert.equal(dna.data, null)
  // denied (free tier) → denied, and the engine is never reached
  let calls = 0
  const spyCoachAI = { ...mockCoachAI, getMatchReadiness: async () => { calls++; return { ok: true, data: READ } } }
  const denied = await invokeCoachesEye('coach.matchReadiness', { tier: 'free', payload: ENGINE_CONTEXT }, { coachAI: spyCoachAI })
  assert.equal(denied.available, false)
  assert.equal(denied.reason, 'insufficient_tier')
  assert.equal(calls, 0, 'denied request must not reach the engine via the adapter')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — dormancy + boundary
// ─────────────────────────────────────────────────────────────────────────────

const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.vite', 'coverage', 'data', '.next', '.cache'])
function collectJs(absDir, out = []) {
  let entries
  try { entries = readdirSync(absDir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (e.isDirectory()) { if (!EXCLUDE_DIRS.has(e.name)) collectJs(join(absDir, e.name), out) }
    else if (/\.(js|mjs|cjs)$/.test(e.name)) out.push(join(absDir, e.name))
  }
  return out
}

test('Core does NOT import the host adapter (repo-wide scan)', () => {
  const roots = ['app', 'api', 'src', 'ai-brain', 'coach-products', 'packages']
  const files = roots.flatMap(r => collectJs(join(REPO, r)))
  const offenders = files.filter(f => f !== TEST_FILE && readFileSync(f, 'utf8').includes('host-coaches-eye'))
    .map(f => f.replace(REPO + '/', ''))
  assert.deepEqual(offenders, [], `the host adapter must be imported by nobody yet; found: ${offenders.join(', ')}`)
  assert.ok(files.length > 50, 'sanity: the scan walked the source tree')
})

test('adapter is the host — it imports the façade + engine, never Core', () => {
  const src = readFileSync(join(REPO, 'host-coaches-eye', 'adapter.js'), 'utf8')
  assert.ok(src.includes("from '@brain/product-coaches-eye'"), 'adapter imports the façade')
  assert.ok(src.includes("coach-products/match-readiness"), 'adapter imports the engine')
  for (const imp of [...src.matchAll(/from\s+'([^']+)'/g)].map(m => m[1])) {
    assert.ok(!imp.includes('/app/') && !imp.startsWith('app/') && !imp.includes('/api/') && !imp.startsWith('api/') && !imp.includes('/src/'),
      `host adapter must not import Core: ${imp}`)
  }
})
