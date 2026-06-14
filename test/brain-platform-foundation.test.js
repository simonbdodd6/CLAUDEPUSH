/**
 * M31.0 — AI Brain Platform Foundation tests
 *
 * Proves the new (dormant) platform packages are:
 *   1. internally self-consistent,
 *   2. in EXACT PARITY with the live engine constants they mirror (so the
 *      manifest/versions can never silently diverge from real behaviour), and
 *   3. structurally clean — they import nothing from the engines or Coach's Eye
 *      Core, and no engine/Core imports them (zero runtime behaviour change).
 *
 * Everything is read via RELATIVE paths (no npm install needed).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'

// ── platform packages under test ───────────────────────────────────────────────
import { TIER, REASON, CAPABILITY, FLAG, VISIBILITY, SEVERITY, GLOBAL_KILL_FLAG, CONTRACT_VERSION } from '../packages/brain-contracts/index.js'
import { COACHES_EYE_MANIFEST, getManifest, resolveCapability, tierIncludes, listFlags, listNamespaces } from '../packages/brain-products/index.js'
import { VERSION_CONTRACTS, negotiate, isSupported } from '../packages/brain-versioning/index.js'

// ── live engine constants (the source of truth we must match) ──────────────────
import { TIER as ITIER, CAPABILITY as ICAP, REASON as IREASON, GLOBAL_AI_FLAG, INTEGRATION_VERSION } from '../ai-brain/integration/integration-types.js'
import { TIER_CAPABILITIES } from '../ai-brain/integration/subscription.js'
import { DNA_TIERS, DNA_FLAG, DNA_VERSION } from '../ai-brain/coach-dna/coach-dna-types.js'
import { OPPONENT_TIERS, OPPONENT_FLAG, PROFILE_VERSION } from '../ai-brain/opponent/opponent-types.js'
import { DESIGNER_TIERS, DESIGNER_FLAG, DESIGNER_VERSION } from '../ai-brain/training-designer/training-types.js'
import { STRATEGY_TIERS, STRATEGY_FLAG, STRATEGY_VERSION } from '../ai-brain/match-strategy/strategy-types.js'
import { LIVE_TIERS, LIVE_FLAG, LIVE_VERSION } from '../ai-brain/live-match/match-state.js'
import { SEASON_TIERS, SEASON_FLAG, SEASON_VERSION } from '../ai-brain/season/season-state.js'

const sorted = (a) => [...a].sort()
const capTiers = (key) => COACHES_EYE_MANIFEST.capabilities.find(c => c.key === key)?.tiers ?? []

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — self-consistency
// ─────────────────────────────────────────────────────────────────────────────

test('contracts — enums frozen + version present', () => {
  assert.equal(CONTRACT_VERSION, '1.0')
  for (const e of [TIER, REASON, CAPABILITY, FLAG, VISIBILITY, SEVERITY]) assert.ok(Object.isFrozen(e))
  assert.equal(GLOBAL_KILL_FLAG, 'ai.enabled')
})

test('manifest — frozen, well-formed, registry resolves it', () => {
  assert.ok(Object.isFrozen(COACHES_EYE_MANIFEST))
  assert.equal(getManifest('coaches-eye'), COACHES_EYE_MANIFEST)
  assert.equal(getManifest('nope'), null)
  assert.equal(COACHES_EYE_MANIFEST.productId, 'coaches-eye')
  // every capability/plugin key is a known CAPABILITY value
  const caps = new Set(Object.values(CAPABILITY))
  for (const c of COACHES_EYE_MANIFEST.capabilities) assert.ok(caps.has(c.key), `unknown capability ${c.key}`)
  for (const p of COACHES_EYE_MANIFEST.plugins) assert.ok(caps.has(p.slot), `unknown plugin slot ${p.slot}`)
  // every flag/plugin-flag is a known FLAG value
  const flags = new Set(Object.values(FLAG))
  for (const f of COACHES_EYE_MANIFEST.flags) assert.ok(flags.has(f.key), `unknown flag ${f.key}`)
  for (const p of COACHES_EYE_MANIFEST.plugins) if (p.flag) assert.ok(flags.has(p.flag))
})

test('registry — resolveCapability honours tier set + global kill-switch', () => {
  const m = COACHES_EYE_MANIFEST
  assert.equal(resolveCapability(m, CAPABILITY.WEEKLY_BRIEF, TIER.STARTER), true)
  assert.equal(resolveCapability(m, CAPABILITY.WEEKLY_BRIEF, TIER.FREE), false)
  assert.equal(resolveCapability(m, CAPABILITY.COACH_DNA, TIER.PERFORMANCE), false)   // DNA starts at professional
  assert.equal(resolveCapability(m, CAPABILITY.COACH_DNA, TIER.PROFESSIONAL), true)
  // kill switch off ⇒ nothing available
  assert.equal(resolveCapability(m, CAPABILITY.MATCH_READINESS, TIER.PROFESSIONAL, { 'ai.enabled': false }), false)
  assert.equal(tierIncludes(m, CAPABILITY.CLUB_SNAPSHOT, TIER.CLUB), true)
})

test('versioning — negotiate is deterministic', () => {
  assert.equal(negotiate('coach.matchReadiness'), '2.0')           // default '*' → current
  assert.equal(negotiate('coach.matchReadiness', '2.0'), '2.0')    // pinned supported
  assert.equal(negotiate('coach.matchReadiness', '9.9'), null)     // unsupported
  assert.equal(negotiate('does.not.exist'), null)
  assert.equal(isSupported({ supports: ['1.0'] }, '1.0'), true)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — PARITY with live engine constants (the critical guarantee)
// ─────────────────────────────────────────────────────────────────────────────

test('parity — TIER + REASON values match integration types exactly', () => {
  assert.deepEqual(sorted(Object.values(TIER)), sorted(Object.values(ITIER)))
  assert.deepEqual(sorted(Object.values(REASON)), sorted(Object.values(IREASON)))
  assert.equal(GLOBAL_KILL_FLAG, GLOBAL_AI_FLAG)
})

test('parity — original 5 capability tier-sets match M17 TIER_CAPABILITIES', () => {
  // manifest capability key → live CAPABILITY key in the subscription matrix
  const map = {
    [CAPABILITY.DASHBOARD]:       ICAP.DASHBOARD,
    [CAPABILITY.WEEKLY_BRIEF]:    ICAP.WEEKLY_BRIEF,
    [CAPABILITY.MATCH_READINESS]: ICAP.MATCH_READINESS,
    [CAPABILITY.PLAYER_CARD]:     ICAP.PLAYER_CARD,
    [CAPABILITY.CLUB_SNAPSHOT]:   ICAP.CLUB_SNAPSHOT,
  }
  for (const [manifestKey, liveKey] of Object.entries(map)) {
    const liveTiers = Object.values(ITIER).filter(t => TIER_CAPABILITIES[t]?.[liveKey] === true)
    assert.deepEqual(sorted(capTiers(manifestKey)), sorted(liveTiers), `${manifestKey} tier-set drift`)
  }
})

test('parity — new engine tier-sets match each engine *_TIERS', () => {
  const cases = [
    [CAPABILITY.COACH_DNA,             DNA_TIERS],
    [CAPABILITY.OPPONENT_INTELLIGENCE, OPPONENT_TIERS],
    [CAPABILITY.TRAINING_DESIGNER,     DESIGNER_TIERS],
    [CAPABILITY.MATCH_STRATEGY,        STRATEGY_TIERS],
    [CAPABILITY.LIVE_MATCH,            LIVE_TIERS],
    [CAPABILITY.SEASON_INTELLIGENCE,   SEASON_TIERS],
  ]
  for (const [key, tiersSet] of cases) {
    assert.deepEqual(sorted(capTiers(key)), sorted([...tiersSet]), `${key} tier-set drift`)
  }
})

test('parity — feature flags match the live engine flag constants', () => {
  const declared = new Set(listFlags(COACHES_EYE_MANIFEST))
  for (const f of [GLOBAL_AI_FLAG, DNA_FLAG, OPPONENT_FLAG, DESIGNER_FLAG, STRATEGY_FLAG, LIVE_FLAG, SEASON_FLAG]) {
    assert.ok(declared.has(f), `manifest missing live flag ${f}`)
  }
})

test('parity — version contracts match the live *_VERSION constants', () => {
  const v = Object.fromEntries(VERSION_CONTRACTS.map(c => [c.capability, c.outputVersion]))
  assert.equal(v['integration'], INTEGRATION_VERSION)
  assert.equal(v['coach.coachDna'], DNA_VERSION)
  assert.equal(v['coach.opponentIntelligence'], PROFILE_VERSION)
  assert.equal(v['coach.trainingDesigner'], DESIGNER_VERSION)
  assert.equal(v['coach.matchStrategy'], STRATEGY_VERSION)
  assert.equal(v['coach.liveMatch'], LIVE_VERSION)
  assert.equal(v['coach.seasonIntelligence'], SEASON_VERSION)
})

test('parity — Core works with AI disabled: free tier exposes no capabilities', () => {
  for (const cap of COACHES_EYE_MANIFEST.capabilities) {
    assert.equal(cap.tiers.includes(TIER.FREE), false, `${cap.key} must not be in free tier`)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — structural dependency rules (zero coupling to engines / Core)
// ─────────────────────────────────────────────────────────────────────────────

test('structural — platform packages import nothing from engines or Core', () => {
  const dir = new URL('../packages/', import.meta.url)
  const pkgs = ['brain-contracts', 'brain-products', 'brain-versioning']
  const forbidden = ['ai-brain', 'coach-products', '/app/', '/api/', '/src/', 'index.html', 'auth', 'match-centre', 'messaging']
  for (const pkg of pkgs) {
    const pkgDir = new URL(`${pkg}/`, dir)
    for (const f of readdirSync(pkgDir).filter(n => n.endsWith('.js'))) {
      const src = readFileSync(new URL(f, pkgDir), 'utf8')
      for (const bad of forbidden) assert.ok(!src.includes(bad), `${pkg}/${f} must not reference ${bad}`)
      // imports must stay within packages/ (relative, no bare engine specifiers)
      for (const imp of [...src.matchAll(/from\s+'([^']+)'/g)].map(m => m[1])) {
        assert.ok(imp.startsWith('./') || imp.startsWith('../brain-'), `${pkg}/${f} illegal import: ${imp}`)
      }
    }
  }
})

test('structural — no engine or Core file imports the platform packages (still dormant)', () => {
  // Spot-check the engine entrypoints + the AI namespace: none reference @brain/* or packages/.
  const roots = ['../ai-brain/index.js', '../ai-brain/integration/index.js']
  for (const r of roots) {
    const src = readFileSync(new URL(r, import.meta.url), 'utf8')
    assert.ok(!src.includes('@brain/'), `${r} should not import @brain/* in M31.0`)
    assert.ok(!src.includes('packages/'), `${r} should not import packages/ in M31.0`)
  }
})
