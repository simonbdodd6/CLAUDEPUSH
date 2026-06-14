/**
 * M31.3a — Coach's Eye façade CONTRACT hardening tests
 *
 * Locks down the dormant façade contract before any live wiring:
 *   1. request() envelope schema (exact keys + types) — always
 *   2. invalid capability handling → invalid_input (never throws)
 *   3. context normalisation for missing/unknown tier and missing/bad flags
 *   4. immutability + determinism (frozen results, manifest never mutated)
 *   5. no-throw robustness across junk inputs
 *
 * All assertions hold while the façade is DORMANT: data === null, ok === false.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { gateCapability, getCapabilities, request } from '@brain/product-coaches-eye'
import { COACHES_EYE_MANIFEST } from '@brain/products'

const CAP_KEYS = COACHES_EYE_MANIFEST.capabilities.map(c => c.key)
const TIERS = ['free', 'starter', 'performance', 'club', 'professional', 'enterprise']
const ENVELOPE_KEYS = ['available', 'data', 'ok', 'reason', 'version']

/** Assert an object satisfies the dormant request() envelope contract. */
function assertDormantEnvelope(r, label = '') {
  assert.ok(r && typeof r === 'object', `${label}: not an object`)
  assert.deepEqual(Object.keys(r).sort(), ENVELOPE_KEYS, `${label}: unexpected keys`)
  assert.equal(typeof r.available, 'boolean', `${label}: available not boolean`)
  assert.equal(r.ok, false, `${label}: ok must be false while dormant`)
  assert.ok(r.reason === null || typeof r.reason === 'string', `${label}: reason type`)
  assert.equal(r.data, null, `${label}: data must be null while dormant`)
  assert.ok(r.version === null || typeof r.version === 'string', `${label}: version type`)
  assert.ok(Object.isFrozen(r), `${label}: envelope must be frozen`)
  // available ⇔ reason null
  assert.equal(r.available, r.reason === null, `${label}: available/reason mismatch`)
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — envelope schema across the full matrix
// ─────────────────────────────────────────────────────────────────────────────

test('request — envelope schema holds for every capability × tier', () => {
  for (const key of CAP_KEYS) {
    for (const tier of TIERS) {
      assertDormantEnvelope(request(key, { tier }), `${key}@${tier}`)
    }
  }
})

test('request — envelope schema holds with assorted flag combinations', () => {
  const flagSets = [{}, { 'ai.enabled': false }, { 'ai.matchReadiness': false }, { 'ai.enabled': true }]
  for (const flags of flagSets) {
    assertDormantEnvelope(request('coach.matchReadiness', { tier: 'professional', flags }), JSON.stringify(flags))
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — invalid capability handling
// ─────────────────────────────────────────────────────────────────────────────

test('invalid capability → invalid_input (never throws)', () => {
  for (const bad of ['bogus', '', 'coach.unknown', 'COACH.MATCHREADINESS', 'matchReadiness']) {
    const r = request(bad, { tier: 'professional' })
    assertDormantEnvelope(r, `request(${bad})`)
    assert.equal(r.available, false)
    assert.equal(r.reason, 'invalid_input')
    assert.equal(r.version, null)
    const g = gateCapability(bad, { tier: 'professional' })
    assert.equal(g.reason, 'invalid_input')
    assert.equal(g.available, false)
  }
})

test('invalid capability — non-string keys handled gracefully', () => {
  for (const bad of [undefined, null, 123, {}, [], true]) {
    const r = request(bad, { tier: 'professional' })
    assertDormantEnvelope(r, `request(${String(bad)})`)
    assert.equal(r.reason, 'invalid_input')
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — context normalisation
// ─────────────────────────────────────────────────────────────────────────────

test('context — missing/unknown tier normalises to free (AI-off baseline)', () => {
  // matchReadiness requires performance+; with free baseline it is insufficient_tier
  for (const ctx of [undefined, {}, { tier: 'platinum' }, { tier: '' }, { flags: {} }, null, [1, 2]]) {
    const r = request('coach.matchReadiness', ctx)
    assertDormantEnvelope(r, `ctx=${JSON.stringify(ctx)}`)
    assert.equal(r.available, false, `ctx=${JSON.stringify(ctx)} should be unavailable at free`)
    assert.equal(r.reason, 'insufficient_tier')
  }
  // a starter-tier capability also unavailable at the free baseline
  assert.equal(gateCapability('coach.dashboard').available, false)        // no context ⇒ free
  assert.equal(gateCapability('coach.dashboard').reason, 'insufficient_tier')
})

test('context — missing/bad flags treated as empty (opt-out enabled)', () => {
  for (const flags of [undefined, null, {}, [1, 2], 'nope', 42]) {
    const r = request('coach.matchReadiness', { tier: 'professional', flags })
    assert.equal(r.available, true, `flags=${JSON.stringify(flags)} should be available (absent ⇒ enabled)`)
    assert.equal(r.reason, null)
  }
})

test('context — explicit flags still gate correctly after normalisation', () => {
  assert.equal(request('coach.matchReadiness', { tier: 'professional', flags: { 'ai.enabled': false } }).reason, 'ai_not_enabled')
  assert.equal(request('coach.matchReadiness', { tier: 'professional', flags: { 'ai.matchReadiness': false } }).reason, 'feature_disabled')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — immutability + determinism
// ─────────────────────────────────────────────────────────────────────────────

test('immutability — gate + request results are frozen and cannot be mutated', () => {
  const g = gateCapability('coach.matchReadiness', { tier: 'professional' })
  const r = request('coach.matchReadiness', { tier: 'professional' })
  assert.ok(Object.isFrozen(g) && Object.isFrozen(r))
  assert.throws(() => { r.ok = true }, TypeError)
  assert.throws(() => { r.data = { hacked: true } }, TypeError)
  assert.throws(() => { g.available = false }, TypeError)
})

test('determinism — same input → deeply-equal but independent objects', () => {
  const a = request('coach.coachDna', { tier: 'professional' })
  const b = request('coach.coachDna', { tier: 'professional' })
  assert.deepEqual(a, b)
  assert.notEqual(a, b)               // fresh object each call (no shared mutable state)
  const g1 = getCapabilities({ tier: 'professional' })
  const g2 = getCapabilities({ tier: 'professional' })
  assert.deepEqual(g1, g2)
  assert.notEqual(g1, g2)             // fresh array each call
})

test('immutability — the manifest is never mutated by façade calls', () => {
  const before = JSON.parse(JSON.stringify(COACHES_EYE_MANIFEST))
  for (const key of [...CAP_KEYS, 'bogus']) {
    for (const tier of [...TIERS, 'platinum']) {
      gateCapability(key, { tier, flags: { 'ai.enabled': false } })
      request(key, { tier })
    }
  }
  assert.deepEqual(JSON.parse(JSON.stringify(COACHES_EYE_MANIFEST)), before)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — no-throw robustness
// ─────────────────────────────────────────────────────────────────────────────

test('robustness — never throws for arbitrary junk inputs', () => {
  const junkKeys = [undefined, null, 123, '', {}, [], true, Symbol('x')]
  const junkCtx = [undefined, null, 123, '', {}, [], true, { tier: 99 }, { flags: 7 }]
  for (const k of junkKeys) {
    for (const c of junkCtx) {
      assert.doesNotThrow(() => request(k, c), `request(${String(k)}, ${String(c)}) threw`)
      assert.doesNotThrow(() => gateCapability(k, c), `gateCapability threw`)
    }
  }
})
