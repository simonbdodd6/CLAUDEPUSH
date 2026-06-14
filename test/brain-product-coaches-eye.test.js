/**
 * M31.3 — Coach's Eye product façade tests
 *
 * Proves the dormant façade is:
 *   1. functionally correct — its capability gate mirrors the platform manifest
 *      (tiers, flags, kill-switch, version), deterministically; and
 *   2. dormant + boundary-safe — it imports ONLY the three platform packages
 *      (no engine, no Core, no LLM), the platform packages do not import it back,
 *      and NO source file anywhere in the repo imports it yet (Core included).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { PRODUCT_ID, gateCapability, getCapabilities, getManifest, request } from '@brain/product-coaches-eye'
import { COACHES_EYE_MANIFEST } from '@brain/products'

const TEST_FILE = fileURLToPath(import.meta.url)
const REPO = join(TEST_FILE, '..', '..')
const FACADE_SPECIFIER = '@brain/product-coaches-eye'
const FACADE_DIR = join(REPO, 'packages', 'product-coaches-eye')

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — functional correctness (gate mirrors the manifest, deterministically)
// ─────────────────────────────────────────────────────────────────────────────

test('façade — identity + capability coverage', () => {
  assert.equal(PRODUCT_ID, 'coaches-eye')
  assert.equal(getManifest(), COACHES_EYE_MANIFEST)
  assert.equal(getCapabilities().length, COACHES_EYE_MANIFEST.capabilities.length)
})

test('gate — tier resolution matches the manifest (incl. the M17 non-linearities)', () => {
  assert.equal(gateCapability('coach.weeklyBrief', { tier: 'starter' }).available, true)
  assert.equal(gateCapability('coach.weeklyBrief', { tier: 'free' }).reason, 'insufficient_tier')
  assert.equal(gateCapability('coach.weeklyBrief', { tier: 'club' }).available, false)        // Club has no weeklyBrief
  assert.equal(gateCapability('coach.coachDna', { tier: 'performance' }).available, false)    // DNA starts at professional
  assert.equal(gateCapability('coach.coachDna', { tier: 'professional' }).available, true)
  assert.equal(gateCapability('coach.clubSnapshot', { tier: 'club' }).available, true)
})

test('gate — flags: global kill-switch and per-capability flag', () => {
  assert.equal(gateCapability('coach.matchReadiness', { tier: 'professional', flags: { 'ai.enabled': false } }).reason, 'ai_not_enabled')
  assert.equal(gateCapability('coach.matchReadiness', { tier: 'professional', flags: { 'ai.matchReadiness': false } }).reason, 'feature_disabled')
  // absent flag ⇒ enabled (opt-out)
  assert.equal(gateCapability('coach.matchReadiness', { tier: 'professional', flags: {} }).available, true)
})

test('gate — carries the negotiated output version', () => {
  assert.equal(gateCapability('coach.weeklyBrief', { tier: 'starter' }).version, '2.0')
  assert.equal(gateCapability('coach.matchReadiness', { tier: 'professional' }).version, '2.0')
  assert.equal(gateCapability('coach.coachDna', { tier: 'professional' }).version, '1.0')
})

test('gate — every tier×capability decision is reproducible (deterministic)', () => {
  const tiers = ['free', 'starter', 'performance', 'club', 'professional', 'enterprise']
  const snap = () => tiers.flatMap(t => COACHES_EYE_MANIFEST.capabilities.map(c => gateCapability(c.key, { tier: t }).available))
  assert.deepEqual(snap(), snap())
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — DORMANT request envelope (stable shape, no engine call)
// ─────────────────────────────────────────────────────────────────────────────

test('request — allowed capability returns a dormant envelope (data null, ok false)', () => {
  const r = request('coach.matchReadiness', { tier: 'professional' })
  assert.deepEqual(r, { available: true, ok: false, reason: null, data: null, version: '2.0' })
})

test('request — denied capability returns the production-shaped envelope', () => {
  assert.deepEqual(request('coach.coachDna', { tier: 'performance' }),
    { available: false, ok: false, reason: 'insufficient_tier', data: null, version: '1.0' })
  assert.deepEqual(request('coach.matchReadiness', { tier: 'professional', flags: { 'ai.enabled': false } }),
    { available: false, ok: false, reason: 'ai_not_enabled', data: null, version: '2.0' })
})

test('request — NEVER produces data while dormant (across all capabilities/tiers)', () => {
  for (const c of COACHES_EYE_MANIFEST.capabilities) {
    for (const tier of ['free', 'starter', 'performance', 'club', 'professional', 'enterprise']) {
      const r = request(c.key, { tier })
      assert.equal(r.data, null, `${c.key}@${tier} produced data while dormant`)
      assert.equal(r.ok, false, `${c.key}@${tier} reported ok while dormant`)
    }
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — boundary safety: façade imports only the platform packages
// ─────────────────────────────────────────────────────────────────────────────

test('façade imports ONLY @brain/contracts|products|versioning (no engine, Core, or LLM)', () => {
  const allowedBare = new Set(['@brain/contracts', '@brain/products', '@brain/versioning'])
  const forbidden = ['ai-brain', 'coach-products', '/app/', '/api/', '/src/', 'index.html', 'openai', 'anthropic', 'llm']
  for (const f of readdirSync(FACADE_DIR).filter(n => n.endsWith('.js'))) {
    const src = readFileSync(join(FACADE_DIR, f), 'utf8')
    for (const bad of forbidden) assert.ok(!src.includes(bad), `${f} must not reference ${bad}`)
    for (const imp of [...src.matchAll(/from\s+'([^']+)'/g)].map(m => m[1])) {
      assert.ok(imp.startsWith('./') || allowedBare.has(imp), `${f} illegal import: ${imp}`)
    }
  }
})

test('reverse-dep — platform packages do NOT import the façade', () => {
  for (const pkg of ['brain-contracts', 'brain-products', 'brain-versioning']) {
    const dir = join(REPO, 'packages', pkg)
    for (const f of readdirSync(dir).filter(n => n.endsWith('.js'))) {
      assert.ok(!readFileSync(join(dir, f), 'utf8').includes('product-coaches-eye'), `${pkg}/${f} must not import the façade`)
    }
  }
})

test('engines stay dormant — AI namespace + integration do not import the façade', () => {
  for (const rel of ['ai-brain/index.js', 'ai-brain/integration/index.js']) {
    const src = readFileSync(join(REPO, rel), 'utf8')
    assert.ok(!src.includes('product-coaches-eye'), `${rel} must not import the façade in M31.3`)
    assert.ok(!src.includes('@brain/product'), `${rel} must not import a product façade in M31.3`)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — fully dormant: nothing in the repo imports the façade (Core included)
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

test('façade is fully dormant — NO source file imports it yet (Core, app, engines, packages)', () => {
  const roots = ['ai-brain', 'coach-products', 'api', 'src', 'app', 'packages']
  const files = roots.flatMap(r => collectJs(join(REPO, r)))
  const offenders = files.filter(f => {
    if (f.startsWith(FACADE_DIR)) return false   // the façade itself
    if (f === TEST_FILE) return false            // this test
    return readFileSync(f, 'utf8').includes(FACADE_SPECIFIER)
  }).map(f => f.replace(REPO + '/', ''))
  assert.deepEqual(offenders, [], `façade must be imported by nobody yet; found: ${offenders.join(', ')}`)
  assert.ok(files.length > 50, 'sanity: the dormancy scan actually walked the source tree')
})
