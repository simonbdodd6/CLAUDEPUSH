/**
 * M31.4 — Coach's Eye façade LIVE WIRING tests (coach.matchReadiness only)
 *
 * Proves that one capability can be invoked live through an injected runtime
 * port while every guarantee holds:
 *   1. GOLDEN PARITY — invoke(...).data deepEquals the real match-readiness
 *      engine's direct output for the same inputs.
 *   2. The gate runs first: disabled/denied/invalid requests NEVER call the port.
 *   3. Every other capability stays dormant through invoke (and matchReadiness
 *      with no port is dormant — Core's default).
 *   4. A throwing port degrades to brain_unavailable (never throws).
 *   5. The envelope shape is preserved (frozen, exactly 5 keys).
 *   6. WIRED_CAPABILITIES contains ONLY coach.matchReadiness.
 *   7. The façade still imports NO engine/Core (only @brain/* + relative).
 *
 * The engine is imported HERE (the test) to build the port + parity baseline —
 * never by the façade.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { invoke, request, isWired, WIRED_CAPABILITIES } from '@brain/product-coaches-eye'
import { getMatchReadiness } from '../coach-products/match-readiness/index.js'   // the real engine (test-side only)

// ── deterministic engine fixture (mirrors the M21 match-readiness test mock) ──
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

/** The injected runtime port wraps the engine — exactly what the host would do. */
const runtimePort = { getMatchReadiness: (payload) => getMatchReadiness(payload.context, payload.coachAI) }
const liveContext = { tier: 'professional', payload: { context: ENGINE_CONTEXT, coachAI: mockCoachAI } }

const ENVELOPE_KEYS = ['available', 'data', 'ok', 'reason', 'version']
function assertEnvelopeShape(r, label = '') {
  assert.ok(r && typeof r === 'object', `${label}: not an object`)
  assert.deepEqual(Object.keys(r).sort(), ENVELOPE_KEYS, `${label}: keys`)
  assert.equal(typeof r.available, 'boolean')
  assert.equal(typeof r.ok, 'boolean')
  assert.ok(r.reason === null || typeof r.reason === 'string')
  assert.ok(r.version === null || typeof r.version === 'string')
  assert.ok(Object.isFrozen(r), `${label}: must be frozen`)
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — golden parity
// ─────────────────────────────────────────────────────────────────────────────

test('golden parity — invoke(matchReadiness).data deepEquals the engine output', async () => {
  const engineOut = await getMatchReadiness(ENGINE_CONTEXT, mockCoachAI)
  const r = await invoke('coach.matchReadiness', liveContext, runtimePort)
  assertEnvelopeShape(r, 'live')
  assert.equal(r.available, true)
  assert.equal(r.ok, true)
  assert.equal(r.reason, null)
  assert.equal(r.version, '2.0')
  assert.deepEqual(r.data, engineOut)
})

test('golden parity — deterministic across repeated invocations', async () => {
  const a = await invoke('coach.matchReadiness', liveContext, runtimePort)
  const b = await invoke('coach.matchReadiness', liveContext, runtimePort)
  assert.deepEqual(a, b)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — the gate runs first: denied/disabled/invalid NEVER call the port
// ─────────────────────────────────────────────────────────────────────────────

test('denied/disabled/invalid requests never call the runtime port', async () => {
  let calls = 0
  const spy = { getMatchReadiness: async () => { calls++; return { spy: true } } }
  const denied = [
    { tier: 'free', payload: {} },                                          // insufficient_tier
    { tier: 'starter', payload: {} },                                       // insufficient_tier
    { tier: 'professional', flags: { 'ai.enabled': false }, payload: {} },  // ai_not_enabled
    { tier: 'professional', flags: { 'ai.matchReadiness': false }, payload: {} }, // feature_disabled
  ]
  for (const ctx of denied) {
    const r = await invoke('coach.matchReadiness', ctx, spy)
    assertEnvelopeShape(r)
    assert.equal(r.available, false)
    assert.equal(r.ok, false)
    assert.equal(r.data, null)
  }
  // invalid capability is also gated before the port
  const inv = await invoke('bogus', { tier: 'professional', payload: {} }, spy)
  assert.equal(inv.reason, 'invalid_input')
  assert.equal(calls, 0, 'the port must never be called for denied/disabled/invalid requests')

  // sanity: an allowed request DOES call the port exactly once
  const ok = await invoke('coach.matchReadiness', { tier: 'professional', payload: {} }, spy)
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.data, { spy: true })
  assert.equal(calls, 1)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — everything else stays dormant through invoke
// ─────────────────────────────────────────────────────────────────────────────

test('unwired capability stays dormant even when permitted and a port is supplied', async () => {
  let calls = 0
  const spy = { getMatchReadiness: async () => { calls++; return { spy: true } } }
  const r = await invoke('coach.trainingDesigner', { tier: 'professional', payload: {} }, spy)   // permitted, NOT wired
  assert.equal(r.available, true)
  assert.equal(r.ok, false)
  assert.equal(r.data, null)
  assert.equal(calls, 0, 'an unwired capability must not call the port')
})

test('coach.opponentIntelligence wires live through an injected port (M37)', async () => {
  const oppProfile = { profileVersion: '1.0', opponentName: 'Naas RFC', summary: 'Strong set-piece', strengths: [], weaknesses: [] }
  let calls = 0
  const port = { getOpponentIntelligence: async () => { calls++; return oppProfile } }
  const r = await invoke('coach.opponentIntelligence', { tier: 'professional', payload: { opponentId: 'o1' } }, port)
  assertEnvelopeShape(r, 'opponent live')
  assert.equal(r.available, true)
  assert.equal(r.ok, true)
  assert.deepEqual(r.data, oppProfile)
  assert.equal(calls, 1)
})

test('coach.seasonIntelligence wires live through an injected port (M36)', async () => {
  const seasonProfile = { seasonVersion: '1.0', seasonTrajectory: { series: [{ round: 1, points: 4 }] }, expectedPointsTotal: { value: 60 } }
  let calls = 0
  const port = { getSeasonIntelligence: async () => { calls++; return seasonProfile } }
  const r = await invoke('coach.seasonIntelligence', { tier: 'professional', payload: { fixtures: [] } }, port)
  assertEnvelopeShape(r, 'season live')
  assert.equal(r.available, true)
  assert.equal(r.ok, true)
  assert.deepEqual(r.data, seasonProfile)
  assert.equal(calls, 1)
})

test('coach.coachDna wires live through an injected port (M35)', async () => {
  const dnaProduct = { dnaVersion: '1.0', maturity: 0.42, style: { summary: 'Attack-minded' }, characteristics: {} }
  let calls = 0
  const port = { getCoachDna: async () => { calls++; return dnaProduct } }
  const r = await invoke('coach.coachDna', { tier: 'professional', payload: { coachId: 'c1' } }, port)
  assertEnvelopeShape(r, 'coachDna live')
  assert.equal(r.available, true)
  assert.equal(r.ok, true)
  assert.equal(r.reason, null)
  assert.deepEqual(r.data, dnaProduct)
  assert.equal(calls, 1)
  // gated off (performance tier excludes coach DNA) → never calls the port
  calls = 0
  const denied = await invoke('coach.coachDna', { tier: 'performance', payload: {} }, port)
  assert.equal(denied.available, false)
  assert.equal(denied.reason, 'insufficient_tier')
  assert.equal(calls, 0)
})

test('wired capability with NO port is dormant (Core default)', async () => {
  const r = await invoke('coach.matchReadiness', { tier: 'professional', payload: {} }, null)
  assert.equal(r.available, true)
  assert.equal(r.ok, false)
  assert.equal(r.data, null)
  // request() remains the sync dormant probe regardless
  assert.deepEqual(request('coach.matchReadiness', { tier: 'professional' }),
    { available: true, ok: false, reason: null, data: null, version: '2.0' })
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — a throwing port degrades gracefully
// ─────────────────────────────────────────────────────────────────────────────

test('a throwing port → brain_unavailable (never throws)', async () => {
  const boom = { getMatchReadiness: async () => { throw new Error('engine down') } }
  const r = await invoke('coach.matchReadiness', { tier: 'professional', payload: {} }, boom)
  assertEnvelopeShape(r)
  assert.equal(r.available, true)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'brain_unavailable')
  assert.equal(r.data, null)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — WIRED registry + isWired
// ─────────────────────────────────────────────────────────────────────────────

test('WIRED_CAPABILITIES contains matchReadiness + coachDna + season + opponent (M37)', () => {
  assert.deepEqual(Object.keys(WIRED_CAPABILITIES).sort(),
    ['coach.coachDna', 'coach.matchReadiness', 'coach.opponentIntelligence', 'coach.seasonIntelligence'])
  assert.equal(WIRED_CAPABILITIES['coach.matchReadiness'], 'getMatchReadiness')
  assert.equal(WIRED_CAPABILITIES['coach.coachDna'], 'getCoachDna')
  assert.equal(WIRED_CAPABILITIES['coach.seasonIntelligence'], 'getSeasonIntelligence')
  assert.equal(WIRED_CAPABILITIES['coach.opponentIntelligence'], 'getOpponentIntelligence')
  assert.ok(Object.isFrozen(WIRED_CAPABILITIES))
  assert.equal(isWired('coach.matchReadiness'), true)
  assert.equal(isWired('coach.coachDna'), true)
  assert.equal(isWired('coach.seasonIntelligence'), true)
  assert.equal(isWired('coach.opponentIntelligence'), true)
  for (const k of ['coach.liveMatch', 'coach.dashboard', 'coach.trainingDesigner', 'coach.matchStrategy']) {
    assert.equal(isWired(k), false, `${k} must remain unwired after M37`)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 6 — structural: façade imports NO engine/Core (port is injected only)
// ─────────────────────────────────────────────────────────────────────────────

test('façade source imports no engine/Core — the port is the only path to an engine', () => {
  const facade = join(fileURLToPath(new URL('..', import.meta.url)), 'packages', 'product-coaches-eye', 'facade.js')
  const src = readFileSync(facade, 'utf8')
  // no engine/Core/relative-outside imports
  for (const m of [...src.matchAll(/from\s+'([^']+)'/g)].map(x => x[1])) {
    assert.ok(m.startsWith('./') || m.startsWith('@brain/'), `illegal import in facade.js: ${m}`)
    assert.ok(!m.includes('coach-products') && !m.includes('match-readiness') && !m.includes('ai-brain'), `façade must not import an engine: ${m}`)
  }
  // 'getMatchReadiness' appears only as a string method name, never on an import line
  const importLines = src.split('\n').filter(l => /^\s*import\b/.test(l))
  assert.ok(!importLines.some(l => l.includes('getMatchReadiness')), 'getMatchReadiness must not be imported')
  assert.ok(src.includes("'getMatchReadiness'"), 'the wired port method name is a string literal')
})
