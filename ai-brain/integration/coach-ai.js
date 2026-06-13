/**
 * AI Brain — CoachAI Facade (M17)
 *
 * The only Brain module Core ever imports.
 * Every call resolves capabilities, checks the tier gate, and returns a safe
 * IntegrationResponse — never throws, never exposes internals.
 *
 * Core usage:
 *   import CoachAI from 'ai-brain/integration/index.js'
 *   const r = await CoachAI.getDashboard(user)
 *   if (r.available) render(r.data); else renderUpgradePrompt(r.reason)
 */

import { CAPABILITY, REASON } from './integration-types.js'
import { resolveCapabilities, userCan } from './capabilities.js'
import { resolveTier } from './subscription.js'
import {
  makeResponse,
  dashboardFallback,
  playerCardFallback,
  matchReadinessFallback,
  clubSnapshotFallback,
  capabilitiesFallback,
} from './fallbacks.js'

// ── Lazy loaders ─────────────────────────────────────────────────────────────

let _products = null
let _learning = null

async function loadProducts() {
  if (!_products) _products = await import('../products/index.js')
  return _products
}

async function loadLearning() {
  if (!_learning) _learning = await import('../learning/index.js')
  return _learning
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function tierOf(user) {
  return resolveTier(user)
}

/**
 * Wrap a successful product response into an IntegrationResponse.
 * If the product itself returned ok:false we still surface it but mark
 * available:true so Core knows the tier allows it (the Brain just failed).
 */
function fromProduct(productResponse, tier) {
  if (!productResponse || productResponse.ok === false) {
    return makeResponse({
      ok:        false,
      available: true,   // tier permits it — Brain had an error
      tier,
      reason:    REASON.BRAIN_UNAVAILABLE,
      data:      productResponse?.data ?? null,
    })
  }
  return makeResponse({
    ok:        true,
    available: true,
    tier,
    reason:    null,
    data:      productResponse.data,
  })
}

/** Build the unavailable (tier gate) response. */
function unavailable(tier, reason = REASON.INSUFFICIENT_TIER) {
  return makeResponse({ ok: false, available: false, tier, reason, data: null })
}

// ── CoachAI public interface ──────────────────────────────────────────────────

/**
 * Resolve all AI capabilities for a user.
 * Always succeeds — returns capability summary even for FREE tier.
 *
 * @param {object} user - { tier?, flags?, coachId?, clubId? }
 * @returns {CapabilityResult}  (not wrapped in IntegrationResponse)
 */
async function getCapabilities(user) {
  try {
    return resolveCapabilities(user)
  } catch {
    return capabilitiesFallback(tierOf(user))
  }
}

/**
 * Weekly Coach Brief — available from STARTER tier.
 * Includes top priorities, biggest risks, training checklist, and
 * a summarised attendance + medical view.
 *
 * @param {object} user - { tier?, flags?, coachId?, clubId? }
 * @returns {IntegrationResponse}
 */
async function getDashboard(user) {
  const tier = tierOf(user)
  if (!userCan(user, CAPABILITY.WEEKLY_BRIEF)) {
    return unavailable(tier)
  }
  try {
    const { getWeeklyBrief } = await loadProducts()
    const coachId = user?.coachId ?? user?.userId ?? null
    const clubId  = user?.clubId  ?? null
    const res = await getWeeklyBrief(coachId, clubId, { flags: user?.flags })
    return fromProduct(res, tier)
  } catch {
    return makeResponse({
      ok:        false,
      available: true,
      tier,
      reason:    REASON.BRAIN_UNAVAILABLE,
      data:      dashboardFallback(user?.coachId ?? null, user?.clubId ?? null),
    })
  }
}

/**
 * Player Development Card — available from PERFORMANCE tier.
 * Attendance trend, welfare indicators, improvement signals, and
 * development priorities for a single player.
 *
 * @param {object} player - { playerId, tier?, flags? }
 * @returns {IntegrationResponse}
 */
async function getPlayerCard(player) {
  const tier = tierOf(player)
  if (!userCan(player, CAPABILITY.PLAYER_CARD)) {
    return unavailable(tier)
  }
  const playerId = player?.playerId ?? null
  if (!playerId) {
    return makeResponse({
      ok:        false,
      available: true,
      tier,
      reason:    REASON.INVALID_INPUT,
      data:      null,
    })
  }
  try {
    const { getPlayerCard: _getPlayerCard } = await loadProducts()
    const res = await _getPlayerCard(playerId, { flags: player?.flags })
    return fromProduct(res, tier)
  } catch {
    return makeResponse({
      ok:        false,
      available: true,
      tier,
      reason:    REASON.BRAIN_UNAVAILABLE,
      data:      playerCardFallback(playerId),
    })
  }
}

/**
 * Match Readiness Report — available from PERFORMANCE tier.
 * Squad readiness percentage, availability, injury concerns, and
 * preparation checklist for a team ahead of a match.
 *
 * @param {object} team - { teamId, tier?, flags? }
 * @returns {IntegrationResponse}
 */
async function getMatchReadiness(team) {
  const tier = tierOf(team)
  if (!userCan(team, CAPABILITY.MATCH_READINESS)) {
    return unavailable(tier)
  }
  const teamId = team?.teamId ?? null
  if (!teamId) {
    return makeResponse({
      ok:        false,
      available: true,
      tier,
      reason:    REASON.INVALID_INPUT,
      data:      null,
    })
  }
  try {
    const { getMatchReadiness: _getMatchReadiness } = await loadProducts()
    const res = await _getMatchReadiness(teamId, { flags: team?.flags })
    return fromProduct(res, tier)
  } catch {
    return makeResponse({
      ok:        false,
      available: true,
      tier,
      reason:    REASON.BRAIN_UNAVAILABLE,
      data:      matchReadinessFallback(teamId),
    })
  }
}

/**
 * Club Health Snapshot — available from PROFESSIONAL, CLUB, and ENTERPRISE tiers.
 * Engagement grade, operational health, activity trends, and
 * suggested focus areas for a club.
 *
 * @param {object} club - { clubId, tier?, flags? }
 * @returns {IntegrationResponse}
 */
async function getClubSnapshot(club) {
  const tier = tierOf(club)
  if (!userCan(club, CAPABILITY.CLUB_SNAPSHOT)) {
    return unavailable(tier)
  }
  const clubId = club?.clubId ?? null
  if (!clubId) {
    return makeResponse({
      ok:        false,
      available: true,
      tier,
      reason:    REASON.INVALID_INPUT,
      data:      null,
    })
  }
  try {
    const { getClubSnapshot: _getClubSnapshot } = await loadProducts()
    const res = await _getClubSnapshot(clubId, { flags: club?.flags })
    return fromProduct(res, tier)
  } catch {
    return makeResponse({
      ok:        false,
      available: true,
      tier,
      reason:    REASON.BRAIN_UNAVAILABLE,
      data:      clubSnapshotFallback(clubId),
    })
  }
}

/**
 * Coach Learning Profile — read-only access to the CoachProfile.
 * Available to any caller regardless of subscription tier (it is a reading
 * convenience; the Learning Engine controls all writes).
 *
 * Returns IntegrationResponse where data = CoachProfile | null.
 * When coachId is absent: ok=false, reason=INVALID_INPUT.
 * When Brain is unavailable: ok=false, reason=BRAIN_UNAVAILABLE, data=null.
 *
 * @param {object} user - { coachId?, userId?, tier?, flags? }
 * @returns {IntegrationResponse}
 */
async function getProfile(user) {
  const coachId = user?.coachId ?? user?.userId ?? null
  const tier    = tierOf(user)
  if (!coachId) {
    return makeResponse({ ok: false, available: false, tier, reason: REASON.INVALID_INPUT, data: null })
  }
  try {
    const { getProfile: _getProfile } = await loadLearning()
    const profile = _getProfile(coachId)
    return makeResponse({ ok: true, available: true, tier, reason: null, data: profile ?? null })
  } catch {
    return makeResponse({ ok: false, available: true, tier, reason: REASON.BRAIN_UNAVAILABLE, data: null })
  }
}

// ── Namespace export ──────────────────────────────────────────────────────────

const CoachAI = Object.freeze({
  getCapabilities,
  getDashboard,
  getPlayerCard,
  getMatchReadiness,
  getClubSnapshot,
  getProfile,
})

export default CoachAI
export { getCapabilities, getDashboard, getPlayerCard, getMatchReadiness, getClubSnapshot, getProfile }
