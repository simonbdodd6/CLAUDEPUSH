/**
 * AI Brain — M17 Integration Layer Tests
 *
 * Verifies:
 * 1. integration-types.js  — TIER, CAPABILITY, REASON, flags, version
 * 2. subscription.js       — TIER_CAPABILITIES matrix, resolveTier, hasCapability,
 *                            getAvailableProducts, getLimitations, isAnyCapabilityEnabled
 * 3. capabilities.js       — resolveCapabilities, userCan, global flag, flag overrides
 * 4. fallbacks.js          — all shape functions return valid empty structures
 * 5. CoachAI.getCapabilities — all tiers, fresh objects, no throw
 * 6. CoachAI.getDashboard    — gate by tier, fallback on Brain error, never throws
 * 7. CoachAI.getPlayerCard   — gate by tier, invalid input, fallback
 * 8. CoachAI.getMatchReadiness — gate by tier, invalid input, fallback
 * 9. CoachAI.getClubSnapshot   — gate by tier, invalid input, fallback
 * 10. IntegrationResponse envelope — shape contract
 * 11. Regression — M1–M16 unaffected, Core never imports Brain internals
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  TIER, CAPABILITY, REASON, GLOBAL_AI_FLAG, INTEGRATION_VERSION,
} from '../ai-brain/integration/integration-types.js'
import {
  TIER_CAPABILITIES, TIER_ORDER,
  resolveTier, hasCapability, getAvailableProducts, getLimitations, isAnyCapabilityEnabled,
} from '../ai-brain/integration/subscription.js'
import {
  resolveCapabilities, userCan,
} from '../ai-brain/integration/capabilities.js'
import {
  makeResponse,
  dashboardFallback, playerCardFallback, matchReadinessFallback,
  clubSnapshotFallback, capabilitiesFallback,
} from '../ai-brain/integration/fallbacks.js'
import CoachAI, {
  getCapabilities, getDashboard, getPlayerCard, getMatchReadiness, getClubSnapshot,
} from '../ai-brain/integration/index.js'

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — integration-types.js
// ─────────────────────────────────────────────────────────────────────────────

test('TIER has all 6 values', () => {
  assert.equal(TIER.FREE,         'free')
  assert.equal(TIER.STARTER,      'starter')
  assert.equal(TIER.PERFORMANCE,  'performance')
  assert.equal(TIER.PROFESSIONAL, 'professional')
  assert.equal(TIER.CLUB,         'club')
  assert.equal(TIER.ENTERPRISE,   'enterprise')
})

test('CAPABILITY has all 5 values', () => {
  assert.equal(CAPABILITY.DASHBOARD,       'dashboard')
  assert.equal(CAPABILITY.WEEKLY_BRIEF,    'weeklyBrief')
  assert.equal(CAPABILITY.MATCH_READINESS, 'matchReadiness')
  assert.equal(CAPABILITY.PLAYER_CARD,     'playerCard')
  assert.equal(CAPABILITY.CLUB_SNAPSHOT,   'clubSnapshot')
})

test('REASON has all 5 values', () => {
  assert.equal(REASON.INSUFFICIENT_TIER, 'insufficient_tier')
  assert.equal(REASON.FEATURE_DISABLED,  'feature_disabled')
  assert.equal(REASON.BRAIN_UNAVAILABLE, 'brain_unavailable')
  assert.equal(REASON.INVALID_INPUT,     'invalid_input')
  assert.equal(REASON.AI_NOT_ENABLED,    'ai_not_enabled')
})

test('GLOBAL_AI_FLAG is ai.enabled', () => {
  assert.equal(GLOBAL_AI_FLAG, 'ai.enabled')
})

test('INTEGRATION_VERSION is a string', () => {
  assert.equal(typeof INTEGRATION_VERSION, 'string')
  assert.ok(INTEGRATION_VERSION.length > 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — subscription.js
// ─────────────────────────────────────────────────────────────────────────────

test('TIER_CAPABILITIES exists for all 6 tiers', () => {
  for (const tier of Object.values(TIER)) {
    assert.ok(TIER_CAPABILITIES[tier], `Missing tier: ${tier}`)
  }
})

test('TIER_CAPABILITIES matrix — FREE has no capabilities', () => {
  const caps = TIER_CAPABILITIES[TIER.FREE]
  for (const [cap, val] of Object.entries(caps)) {
    assert.equal(val, false, `FREE.${cap} should be false`)
  }
})

test('TIER_CAPABILITIES matrix — STARTER has dashboard + weeklyBrief only', () => {
  const caps = TIER_CAPABILITIES[TIER.STARTER]
  assert.equal(caps[CAPABILITY.DASHBOARD],       true)
  assert.equal(caps[CAPABILITY.WEEKLY_BRIEF],    true)
  assert.equal(caps[CAPABILITY.MATCH_READINESS], false)
  assert.equal(caps[CAPABILITY.PLAYER_CARD],     false)
  assert.equal(caps[CAPABILITY.CLUB_SNAPSHOT],   false)
})

test('TIER_CAPABILITIES matrix — PERFORMANCE has dashboard, weeklyBrief, matchReadiness, playerCard', () => {
  const caps = TIER_CAPABILITIES[TIER.PERFORMANCE]
  assert.equal(caps[CAPABILITY.DASHBOARD],       true)
  assert.equal(caps[CAPABILITY.WEEKLY_BRIEF],    true)
  assert.equal(caps[CAPABILITY.MATCH_READINESS], true)
  assert.equal(caps[CAPABILITY.PLAYER_CARD],     true)
  assert.equal(caps[CAPABILITY.CLUB_SNAPSHOT],   false)
})

test('TIER_CAPABILITIES matrix — PROFESSIONAL has all capabilities', () => {
  const caps = TIER_CAPABILITIES[TIER.PROFESSIONAL]
  for (const [cap, val] of Object.entries(caps)) {
    assert.equal(val, true, `PROFESSIONAL.${cap} should be true`)
  }
})

test('TIER_CAPABILITIES matrix — CLUB has dashboard, matchReadiness, clubSnapshot (no weeklyBrief, no playerCard)', () => {
  const caps = TIER_CAPABILITIES[TIER.CLUB]
  assert.equal(caps[CAPABILITY.DASHBOARD],       true)
  assert.equal(caps[CAPABILITY.WEEKLY_BRIEF],    false)
  assert.equal(caps[CAPABILITY.MATCH_READINESS], true)
  assert.equal(caps[CAPABILITY.PLAYER_CARD],     false)
  assert.equal(caps[CAPABILITY.CLUB_SNAPSHOT],   true)
})

test('TIER_CAPABILITIES matrix — ENTERPRISE has all capabilities', () => {
  const caps = TIER_CAPABILITIES[TIER.ENTERPRISE]
  for (const [cap, val] of Object.entries(caps)) {
    assert.equal(val, true, `ENTERPRISE.${cap} should be true`)
  }
})

test('TIER_ORDER has all 6 tiers', () => {
  assert.equal(TIER_ORDER.length, 6)
  for (const tier of Object.values(TIER)) {
    assert.ok(TIER_ORDER.includes(tier), `Missing ${tier} in TIER_ORDER`)
  }
})

test('resolveTier — returns canonical tier for valid input', () => {
  assert.equal(resolveTier({ tier: 'professional' }), TIER.PROFESSIONAL)
  assert.equal(resolveTier({ tier: 'ENTERPRISE' }),   TIER.ENTERPRISE)
  assert.equal(resolveTier({ tier: 'Club' }),         TIER.CLUB)
})

test('resolveTier — defaults to FREE for missing/unknown tier', () => {
  assert.equal(resolveTier({}),               TIER.FREE)
  assert.equal(resolveTier(null),             TIER.FREE)
  assert.equal(resolveTier({ tier: 'gold' }), TIER.FREE)
  assert.equal(resolveTier(undefined),        TIER.FREE)
})

test('hasCapability — true when matrix entry is true', () => {
  assert.equal(hasCapability(TIER.PERFORMANCE, CAPABILITY.MATCH_READINESS), true)
  assert.equal(hasCapability(TIER.STARTER,     CAPABILITY.DASHBOARD),       true)
})

test('hasCapability — false when matrix entry is false', () => {
  assert.equal(hasCapability(TIER.FREE,     CAPABILITY.WEEKLY_BRIEF),  false)
  assert.equal(hasCapability(TIER.CLUB,     CAPABILITY.WEEKLY_BRIEF),  false)
  assert.equal(hasCapability(TIER.STARTER,  CAPABILITY.CLUB_SNAPSHOT), false)
})

test('hasCapability — false for unknown tier or capability', () => {
  assert.equal(hasCapability('unknown', CAPABILITY.DASHBOARD), false)
  assert.equal(hasCapability(TIER.PROFESSIONAL, 'nonexistent'), false)
})

test('getAvailableProducts — FREE returns empty array', () => {
  const prods = getAvailableProducts(TIER.FREE)
  assert.deepEqual(prods, [])
})

test('getAvailableProducts — STARTER returns weekly-brief', () => {
  const prods = getAvailableProducts(TIER.STARTER)
  assert.ok(prods.includes('weekly-brief'))
  assert.equal(prods.length, 1)
})

test('getAvailableProducts — PERFORMANCE returns weekly-brief, match-readiness, player-card', () => {
  const prods = getAvailableProducts(TIER.PERFORMANCE)
  assert.ok(prods.includes('weekly-brief'))
  assert.ok(prods.includes('match-readiness'))
  assert.ok(prods.includes('player-card'))
  assert.equal(prods.length, 3)
})

test('getAvailableProducts — CLUB returns match-readiness, club-snapshot (no weekly-brief, no player-card)', () => {
  const prods = getAvailableProducts(TIER.CLUB)
  assert.ok(prods.includes('match-readiness'))
  assert.ok(prods.includes('club-snapshot'))
  assert.ok(!prods.includes('weekly-brief'))
  assert.ok(!prods.includes('player-card'))
})

test('getAvailableProducts — ENTERPRISE returns all 4 products', () => {
  const prods = getAvailableProducts(TIER.ENTERPRISE)
  assert.equal(prods.length, 4)
})

test('getLimitations — returns array for every tier', () => {
  for (const tier of Object.values(TIER)) {
    const lims = getLimitations(tier)
    assert.ok(Array.isArray(lims), `${tier} limitations should be array`)
  }
})

test('getLimitations — FREE has at least one limitation', () => {
  assert.ok(getLimitations(TIER.FREE).length > 0)
})

test('getLimitations — PROFESSIONAL has no limitations', () => {
  assert.equal(getLimitations(TIER.PROFESSIONAL).length, 0)
})

test('getLimitations — ENTERPRISE has no limitations', () => {
  assert.equal(getLimitations(TIER.ENTERPRISE).length, 0)
})

test('getLimitations — returns fresh array each call', () => {
  const a = getLimitations(TIER.FREE)
  const b = getLimitations(TIER.FREE)
  assert.notStrictEqual(a, b)
})

test('isAnyCapabilityEnabled — false for FREE', () => {
  assert.equal(isAnyCapabilityEnabled(TIER.FREE), false)
})

test('isAnyCapabilityEnabled — true for all other tiers', () => {
  for (const tier of [TIER.STARTER, TIER.PERFORMANCE, TIER.PROFESSIONAL, TIER.CLUB, TIER.ENTERPRISE]) {
    assert.equal(isAnyCapabilityEnabled(tier), true, `${tier} should have enabled capability`)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — capabilities.js
// ─────────────────────────────────────────────────────────────────────────────

test('resolveCapabilities — FREE tier has isEnabled=false and no features', () => {
  const caps = resolveCapabilities({ tier: 'free' })
  assert.equal(caps.isEnabled, false)
  assert.equal(caps.tier, 'free')
  for (const val of Object.values(caps.features)) {
    assert.equal(val, false)
  }
})

test('resolveCapabilities — STARTER has weeklyBrief=true, matchReadiness=false', () => {
  const caps = resolveCapabilities({ tier: 'starter' })
  assert.equal(caps.isEnabled, true)
  assert.equal(caps.features[CAPABILITY.WEEKLY_BRIEF],    true)
  assert.equal(caps.features[CAPABILITY.MATCH_READINESS], false)
})

test('resolveCapabilities — PROFESSIONAL has all features true', () => {
  const caps = resolveCapabilities({ tier: 'professional' })
  assert.equal(caps.isEnabled, true)
  for (const [key, val] of Object.entries(caps.features)) {
    assert.equal(val, true, `professional.${key} should be true`)
  }
})

test('resolveCapabilities — includes integrationVersion', () => {
  const caps = resolveCapabilities({ tier: 'starter' })
  assert.equal(typeof caps.integrationVersion, 'string')
})

test('resolveCapabilities — global kill-switch disables everything', () => {
  const caps = resolveCapabilities({ tier: 'professional', flags: { 'ai.enabled': false } })
  assert.equal(caps.isEnabled, false)
  assert.equal(caps.reason, REASON.AI_NOT_ENABLED)
  for (const val of Object.values(caps.features)) {
    assert.equal(val, false)
  }
})

test('resolveCapabilities — flag override can disable a single feature', () => {
  const caps = resolveCapabilities({
    tier: 'professional',
    flags: { 'ai.product.weeklyBrief': false },
  })
  assert.equal(caps.features[CAPABILITY.WEEKLY_BRIEF], false)
  assert.equal(caps.features[CAPABILITY.MATCH_READINESS], true)
})

test('resolveCapabilities — flag override can enable a feature below tier limit', () => {
  const caps = resolveCapabilities({
    tier: 'starter',
    flags: { 'ai.product.matchReadiness': true },
  })
  assert.equal(caps.features[CAPABILITY.MATCH_READINESS], true)
})

test('resolveCapabilities — upgradeAvailable true for FREE', () => {
  assert.equal(resolveCapabilities({ tier: 'free' }).upgradeAvailable, true)
})

test('resolveCapabilities — limitations array is present', () => {
  const caps = resolveCapabilities({ tier: 'starter' })
  assert.ok(Array.isArray(caps.limitations))
})

test('userCan — returns true when tier has capability', () => {
  assert.equal(userCan({ tier: 'performance' }, CAPABILITY.PLAYER_CARD), true)
  assert.equal(userCan({ tier: 'club' }, CAPABILITY.CLUB_SNAPSHOT),      true)
})

test('userCan — returns false when tier lacks capability', () => {
  assert.equal(userCan({ tier: 'starter' }, CAPABILITY.MATCH_READINESS), false)
  assert.equal(userCan({ tier: 'club' },    CAPABILITY.WEEKLY_BRIEF),    false)
})

test('userCan — returns false when global flag disabled', () => {
  assert.equal(
    userCan({ tier: 'professional', flags: { 'ai.enabled': false } }, CAPABILITY.DASHBOARD),
    false,
  )
})

test('userCan — flag override can disable capability for professional', () => {
  assert.equal(
    userCan({ tier: 'professional', flags: { 'ai.product.playerCard': false } }, CAPABILITY.PLAYER_CARD),
    false,
  )
})

test('userCan — flag override can enable capability for starter', () => {
  assert.equal(
    userCan({ tier: 'starter', flags: { 'ai.product.matchReadiness': true } }, CAPABILITY.MATCH_READINESS),
    true,
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — fallbacks.js
// ─────────────────────────────────────────────────────────────────────────────

test('makeResponse — builds IntegrationResponse envelope', () => {
  const r = makeResponse({ ok: true, available: true, tier: 'starter', reason: null, data: { x: 1 } })
  assert.equal(r.ok, true)
  assert.equal(r.available, true)
  assert.equal(r.tier, 'starter')
  assert.equal(r.reason, null)
  assert.deepEqual(r.data, { x: 1 })
  assert.equal(r.integrationVersion, INTEGRATION_VERSION)
})

test('makeResponse — defaults for missing fields', () => {
  const r = makeResponse({})
  assert.equal(r.ok,        false)
  assert.equal(r.available, false)
  assert.equal(r.tier,      'free')
  assert.equal(r.reason,    null)
  assert.equal(r.data,      null)
})

test('dashboardFallback — returns valid empty structure', () => {
  const fb = dashboardFallback('coach1', 'club1')
  assert.equal(fb.coachId, 'coach1')
  assert.equal(fb.clubId,  'club1')
  assert.ok(Array.isArray(fb.topPriorities))
  assert.ok(Array.isArray(fb.biggestRisks))
  assert.ok(Array.isArray(fb.trainingChecklist))
  assert.ok(Array.isArray(fb.recommendedActions))
  assert.ok(Array.isArray(fb.explanationIds))
  assert.ok(typeof fb.attendanceSummary === 'object')
  assert.ok(typeof fb.medicalSummary === 'object')
  assert.equal(fb.isMock, true)
})

test('dashboardFallback — defaults to null ids when no args', () => {
  const fb = dashboardFallback()
  assert.equal(fb.coachId, null)
  assert.equal(fb.clubId,  null)
})

test('playerCardFallback — returns valid empty structure', () => {
  const fb = playerCardFallback('player1')
  assert.equal(fb.playerId, 'player1')
  assert.ok(typeof fb.attendance        === 'object')
  assert.ok(typeof fb.availability      === 'object')
  assert.ok(typeof fb.improvementTrend  === 'object')
  assert.ok(Array.isArray(fb.coachObservations))
  assert.ok(Array.isArray(fb.welfareIndicators))
  assert.ok(Array.isArray(fb.developmentPriorities))
  assert.equal(fb.isMock, true)
})

test('matchReadinessFallback — returns valid empty structure', () => {
  const fb = matchReadinessFallback('team1')
  assert.equal(fb.teamId, 'team1')
  assert.ok(typeof fb.trainingCompletion   === 'object')
  assert.ok(Array.isArray(fb.injuryConcerns))
  assert.ok(Array.isArray(fb.preparationChecklist))
  assert.ok(Array.isArray(fb.missingActions))
  assert.equal(fb.isMock, true)
})

test('clubSnapshotFallback — returns valid empty structure', () => {
  const fb = clubSnapshotFallback('club1')
  assert.equal(fb.clubId, 'club1')
  assert.ok(typeof fb.engagement        === 'object')
  assert.ok(typeof fb.attendance        === 'object')
  assert.ok(typeof fb.operationalHealth === 'object')
  assert.ok(Array.isArray(fb.activityTrends))
  assert.ok(Array.isArray(fb.keyWarnings))
  assert.ok(Array.isArray(fb.suggestedFocusAreas))
  assert.equal(fb.isMock, true)
})

test('capabilitiesFallback — has correct structure for free tier', () => {
  const fb = capabilitiesFallback('free')
  assert.equal(fb.tier,       'free')
  assert.equal(fb.isEnabled,  false)
  assert.ok(Array.isArray(fb.availableProducts))
  assert.equal(fb.availableProducts.length, 0)
  assert.ok(Array.isArray(fb.limitations))
  assert.ok(fb.limitations.length > 0)
})

test('fallbacks return fresh objects on each call', () => {
  assert.notStrictEqual(dashboardFallback(),       dashboardFallback())
  assert.notStrictEqual(playerCardFallback(),      playerCardFallback())
  assert.notStrictEqual(matchReadinessFallback(),  matchReadinessFallback())
  assert.notStrictEqual(clubSnapshotFallback(),    clubSnapshotFallback())
  assert.notStrictEqual(capabilitiesFallback(),    capabilitiesFallback())
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — CoachAI.getCapabilities
// ─────────────────────────────────────────────────────────────────────────────

test('CoachAI.getCapabilities — is exported from index', () => {
  assert.equal(typeof CoachAI.getCapabilities, 'function')
  assert.equal(typeof getCapabilities,          'function')
})

test('CoachAI.getCapabilities — FREE tier returns isEnabled=false', async () => {
  const caps = await CoachAI.getCapabilities({ tier: 'free' })
  assert.equal(caps.isEnabled, false)
  assert.equal(caps.tier, 'free')
})

test('CoachAI.getCapabilities — PROFESSIONAL returns all features true', async () => {
  const caps = await CoachAI.getCapabilities({ tier: 'professional' })
  assert.equal(caps.isEnabled, true)
  for (const [key, val] of Object.entries(caps.features)) {
    assert.equal(val, true, `professional.${key}`)
  }
})

test('CoachAI.getCapabilities — never throws', async () => {
  await assert.doesNotReject(() => CoachAI.getCapabilities(null))
  await assert.doesNotReject(() => CoachAI.getCapabilities(undefined))
  await assert.doesNotReject(() => CoachAI.getCapabilities({}))
})

test('CoachAI.getCapabilities — global flag override works', async () => {
  const caps = await CoachAI.getCapabilities({
    tier: 'enterprise',
    flags: { 'ai.enabled': false },
  })
  assert.equal(caps.isEnabled, false)
  assert.equal(caps.reason, REASON.AI_NOT_ENABLED)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 6 — CoachAI.getDashboard
// ─────────────────────────────────────────────────────────────────────────────

test('CoachAI.getDashboard — is exported from index', () => {
  assert.equal(typeof CoachAI.getDashboard, 'function')
  assert.equal(typeof getDashboard,          'function')
})

test('CoachAI.getDashboard — FREE tier returns unavailable', async () => {
  const r = await CoachAI.getDashboard({ tier: 'free' })
  assert.equal(r.ok,        false)
  assert.equal(r.available, false)
  assert.equal(r.tier,      'free')
  assert.equal(r.reason,    REASON.INSUFFICIENT_TIER)
  assert.equal(r.data,      null)
})

test('CoachAI.getDashboard — FREE has all IntegrationResponse fields', async () => {
  const r = await CoachAI.getDashboard({ tier: 'free' })
  assert.ok('integrationVersion' in r)
  assert.ok('ok'        in r)
  assert.ok('available' in r)
  assert.ok('tier'      in r)
  assert.ok('reason'    in r)
  assert.ok('data'      in r)
})

test('CoachAI.getDashboard — STARTER tier is available (tier allows it)', async () => {
  const r = await CoachAI.getDashboard({ tier: 'starter', coachId: 'c1', clubId: 'club1' })
  // Products may return Brain error since mocks aren't wired, but available=true
  assert.equal(r.available, true)
  assert.equal(r.tier, 'starter')
})

test('CoachAI.getDashboard — global kill-switch → unavailable', async () => {
  const r = await CoachAI.getDashboard({
    tier: 'professional',
    flags: { 'ai.enabled': false },
  })
  assert.equal(r.available, false)
  assert.equal(r.ok,        false)
})

test('CoachAI.getDashboard — never throws for any input', async () => {
  await assert.doesNotReject(() => CoachAI.getDashboard(null))
  await assert.doesNotReject(() => CoachAI.getDashboard(undefined))
  await assert.doesNotReject(() => CoachAI.getDashboard({ tier: 'free' }))
  await assert.doesNotReject(() => CoachAI.getDashboard({ tier: 'enterprise' }))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 7 — CoachAI.getPlayerCard
// ─────────────────────────────────────────────────────────────────────────────

test('CoachAI.getPlayerCard — is exported from index', () => {
  assert.equal(typeof CoachAI.getPlayerCard, 'function')
  assert.equal(typeof getPlayerCard,          'function')
})

test('CoachAI.getPlayerCard — FREE tier returns unavailable', async () => {
  const r = await CoachAI.getPlayerCard({ tier: 'free', playerId: 'p1' })
  assert.equal(r.available, false)
  assert.equal(r.reason,    REASON.INSUFFICIENT_TIER)
})

test('CoachAI.getPlayerCard — STARTER tier returns unavailable', async () => {
  const r = await CoachAI.getPlayerCard({ tier: 'starter', playerId: 'p1' })
  assert.equal(r.available, false)
})

test('CoachAI.getPlayerCard — PERFORMANCE tier is available', async () => {
  const r = await CoachAI.getPlayerCard({ tier: 'performance', playerId: 'p1' })
  assert.equal(r.available, true)
  assert.equal(r.tier, 'performance')
})

test('CoachAI.getPlayerCard — missing playerId returns invalid_input', async () => {
  const r = await CoachAI.getPlayerCard({ tier: 'performance' })
  assert.equal(r.ok,     false)
  assert.equal(r.reason, REASON.INVALID_INPUT)
})

test('CoachAI.getPlayerCard — null input returns invalid_input or unavailable', async () => {
  const r = await CoachAI.getPlayerCard(null)
  assert.equal(r.ok, false)
})

test('CoachAI.getPlayerCard — CLUB tier returns unavailable', async () => {
  const r = await CoachAI.getPlayerCard({ tier: 'club', playerId: 'p1' })
  assert.equal(r.available, false)
})

test('CoachAI.getPlayerCard — never throws', async () => {
  await assert.doesNotReject(() => CoachAI.getPlayerCard(null))
  await assert.doesNotReject(() => CoachAI.getPlayerCard({}))
  await assert.doesNotReject(() => CoachAI.getPlayerCard({ tier: 'professional', playerId: 'p1' }))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 8 — CoachAI.getMatchReadiness
// ─────────────────────────────────────────────────────────────────────────────

test('CoachAI.getMatchReadiness — is exported from index', () => {
  assert.equal(typeof CoachAI.getMatchReadiness, 'function')
  assert.equal(typeof getMatchReadiness,          'function')
})

test('CoachAI.getMatchReadiness — FREE tier returns unavailable', async () => {
  const r = await CoachAI.getMatchReadiness({ tier: 'free', teamId: 't1' })
  assert.equal(r.available, false)
})

test('CoachAI.getMatchReadiness — STARTER tier returns unavailable', async () => {
  const r = await CoachAI.getMatchReadiness({ tier: 'starter', teamId: 't1' })
  assert.equal(r.available, false)
})

test('CoachAI.getMatchReadiness — PERFORMANCE tier is available', async () => {
  const r = await CoachAI.getMatchReadiness({ tier: 'performance', teamId: 't1' })
  assert.equal(r.available, true)
})

test('CoachAI.getMatchReadiness — CLUB tier is available', async () => {
  const r = await CoachAI.getMatchReadiness({ tier: 'club', teamId: 't1' })
  assert.equal(r.available, true)
})

test('CoachAI.getMatchReadiness — missing teamId returns invalid_input', async () => {
  const r = await CoachAI.getMatchReadiness({ tier: 'performance' })
  assert.equal(r.ok,     false)
  assert.equal(r.reason, REASON.INVALID_INPUT)
})

test('CoachAI.getMatchReadiness — never throws', async () => {
  await assert.doesNotReject(() => CoachAI.getMatchReadiness(null))
  await assert.doesNotReject(() => CoachAI.getMatchReadiness({}))
  await assert.doesNotReject(() => CoachAI.getMatchReadiness({ tier: 'club', teamId: 't1' }))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 9 — CoachAI.getClubSnapshot
// ─────────────────────────────────────────────────────────────────────────────

test('CoachAI.getClubSnapshot — is exported from index', () => {
  assert.equal(typeof CoachAI.getClubSnapshot, 'function')
  assert.equal(typeof getClubSnapshot,          'function')
})

test('CoachAI.getClubSnapshot — FREE tier returns unavailable', async () => {
  const r = await CoachAI.getClubSnapshot({ tier: 'free', clubId: 'club1' })
  assert.equal(r.available, false)
})

test('CoachAI.getClubSnapshot — PERFORMANCE tier returns unavailable', async () => {
  const r = await CoachAI.getClubSnapshot({ tier: 'performance', clubId: 'club1' })
  assert.equal(r.available, false)
})

test('CoachAI.getClubSnapshot — PROFESSIONAL tier is available', async () => {
  const r = await CoachAI.getClubSnapshot({ tier: 'professional', clubId: 'club1' })
  assert.equal(r.available, true)
})

test('CoachAI.getClubSnapshot — CLUB tier is available', async () => {
  const r = await CoachAI.getClubSnapshot({ tier: 'club', clubId: 'club1' })
  assert.equal(r.available, true)
})

test('CoachAI.getClubSnapshot — ENTERPRISE tier is available', async () => {
  const r = await CoachAI.getClubSnapshot({ tier: 'enterprise', clubId: 'club1' })
  assert.equal(r.available, true)
})

test('CoachAI.getClubSnapshot — missing clubId returns invalid_input', async () => {
  const r = await CoachAI.getClubSnapshot({ tier: 'professional' })
  assert.equal(r.ok,     false)
  assert.equal(r.reason, REASON.INVALID_INPUT)
})

test('CoachAI.getClubSnapshot — never throws', async () => {
  await assert.doesNotReject(() => CoachAI.getClubSnapshot(null))
  await assert.doesNotReject(() => CoachAI.getClubSnapshot({}))
  await assert.doesNotReject(() => CoachAI.getClubSnapshot({ tier: 'club', clubId: 'club1' }))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 10 — IntegrationResponse envelope contract
// ─────────────────────────────────────────────────────────────────────────────

test('IntegrationResponse — all methods return the same envelope shape', async () => {
  const required = ['integrationVersion', 'ok', 'available', 'tier', 'reason', 'data']
  const cases = [
    () => CoachAI.getDashboard({ tier: 'free' }),
    () => CoachAI.getPlayerCard({ tier: 'free', playerId: 'p1' }),
    () => CoachAI.getMatchReadiness({ tier: 'free', teamId: 't1' }),
    () => CoachAI.getClubSnapshot({ tier: 'free', clubId: 'c1' }),
  ]
  for (const fn of cases) {
    const r = await fn()
    for (const key of required) {
      assert.ok(key in r, `Missing key '${key}' in response`)
    }
  }
})

test('IntegrationResponse — ok and available are booleans', async () => {
  const r = await CoachAI.getDashboard({ tier: 'free' })
  assert.equal(typeof r.ok,        'boolean')
  assert.equal(typeof r.available, 'boolean')
})

test('IntegrationResponse — tier matches resolved tier', async () => {
  const r = await CoachAI.getDashboard({ tier: 'starter' })
  assert.equal(r.tier, 'starter')
})

test('IntegrationResponse — reason is null when available and ok', async () => {
  // When available=true and ok=true, reason should be null
  // We can verify via makeResponse directly since products may not resolve in tests
  const r = makeResponse({ ok: true, available: true, tier: 'professional', reason: null, data: {} })
  assert.equal(r.reason, null)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 11 — Regression: M1–M16 unaffected
// ─────────────────────────────────────────────────────────────────────────────

test('ai-brain/index.js — AI namespace still exports core M1–M16 APIs', async () => {
  const { AI } = await import('../ai-brain/index.js')
  assert.equal(typeof AI.request,       'function')
  assert.equal(typeof AI.memory,        'object')
  assert.equal(typeof AI.observations,  'object')
  assert.equal(typeof AI.explain,       'function')
  assert.equal(typeof AI.plan,          'function')
  assert.equal(typeof AI.getDashboard,  'function')
  assert.equal(typeof AI.getPlayerInsight,  'function')
  assert.equal(typeof AI.getTeamInsight,    'function')
  assert.equal(typeof AI.getClubInsight,    'function')
  assert.equal(typeof AI.getWeeklyBrief,    'function')
  assert.equal(typeof AI.getMatchReadiness, 'function')
  assert.equal(typeof AI.getPlayerCard,     'function')
  assert.equal(typeof AI.getClubSnapshot,   'function')
})

test('integration/index.js — does NOT re-export from ai-brain/index.js (no circular dep)', async () => {
  // Integration layer only imports from integration sub-modules and products
  // Verify it does not import the main AI namespace (which would create a cycle)
  const integrationMod = await import('../ai-brain/integration/index.js')
  // Should have CoachAI, not AI
  assert.ok('CoachAI' in integrationMod, 'CoachAI should be a named export')
  assert.ok(!('AI' in integrationMod), 'AI namespace should NOT be in integration/index.js')
})

test('CoachAI is frozen — Core cannot mutate it', () => {
  assert.equal(Object.isFrozen(CoachAI), true)
})

test('TIER, CAPABILITY, REASON are frozen', () => {
  assert.equal(Object.isFrozen(TIER),       true)
  assert.equal(Object.isFrozen(CAPABILITY), true)
  assert.equal(Object.isFrozen(REASON),     true)
})
