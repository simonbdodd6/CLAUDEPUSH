/**
 * AI Brain — Capability Resolver (M17)
 *
 * Resolves the full capability set for a user, combining their subscription
 * tier with any explicit feature flag overrides.
 *
 * Result is consumed by:
 *   - CoachAI.getCapabilities(user) — direct read
 *   - Internal gating in every CoachAI method
 *
 * No Brain calls. Pure deterministic resolution.
 */

import { CAPABILITY, REASON, GLOBAL_AI_FLAG, INTEGRATION_VERSION } from './integration-types.js'
import {
  resolveTier, hasCapability, getAvailableProducts,
  getLimitations, isAnyCapabilityEnabled, TIER_CAPABILITIES,
} from './subscription.js'

// ── Internal helpers ──────────────────────────────────────────────────────────

function isGloballyEnabled(flags = {}) {
  if (GLOBAL_AI_FLAG in flags) return Boolean(flags[GLOBAL_AI_FLAG])
  return true
}

function applyFlagOverrides(baseFeatures, flags = {}) {
  const out = { ...baseFeatures }
  for (const [key, value] of Object.entries(flags)) {
    // Map 'ai.product.*' flags to capability keys
    if (key === 'ai.product.weeklyBrief')    out[CAPABILITY.WEEKLY_BRIEF]    = Boolean(value)
    if (key === 'ai.product.matchReadiness') out[CAPABILITY.MATCH_READINESS] = Boolean(value)
    if (key === 'ai.product.playerCard')     out[CAPABILITY.PLAYER_CARD]     = Boolean(value)
    if (key === 'ai.product.clubSnapshot')   out[CAPABILITY.CLUB_SNAPSHOT]   = Boolean(value)
    if (key === 'ai.dashboard')              out[CAPABILITY.DASHBOARD]       = Boolean(value)
  }
  return out
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve the complete capability set for a user.
 *
 * @param {object} user  - { tier?, flags?, userId?, coachId?, clubId? }
 * @returns {CapabilityResult}
 *
 * CapabilityResult:
 * {
 *   integrationVersion: '1.0',
 *   tier:               string,
 *   isEnabled:          boolean,     — any AI capability available
 *   features: {
 *     dashboard:       boolean,
 *     weeklyBrief:     boolean,
 *     matchReadiness:  boolean,
 *     playerCard:      boolean,
 *     clubSnapshot:    boolean,
 *   },
 *   availableProducts:  string[],   — PRODUCT_ID values
 *   upgradeAvailable:   boolean,
 *   limitations:        string[],   — human-readable, for upgrade prompts
 *   reason:             string|null — REASON.* if disabled
 * }
 */
export function resolveCapabilities(user) {
  const tier  = resolveTier(user)
  const flags = user?.flags ?? {}

  // Global kill-switch — returns disabled capability set
  if (!isGloballyEnabled(flags)) {
    const none = Object.fromEntries(Object.values(CAPABILITY).map(c => [c, false]))
    return {
      integrationVersion: INTEGRATION_VERSION,
      tier,
      isEnabled:          false,
      features:           none,
      availableProducts:  [],
      upgradeAvailable:   false,
      limitations:        ['AI features are currently disabled'],
      reason:             REASON.AI_NOT_ENABLED,
    }
  }

  // Base features from tier
  const base    = { ...(TIER_CAPABILITIES[tier] ?? {}) }
  const features = applyFlagOverrides(base, flags)

  const isEnabled        = Object.values(features).some(Boolean)
  const availableProducts = getAvailableProducts(tier)
    .filter(pid => {
      // Cross-check against flag overrides
      const cap = Object.entries({
        [CAPABILITY.WEEKLY_BRIEF]:    'weekly-brief',
        [CAPABILITY.MATCH_READINESS]: 'match-readiness',
        [CAPABILITY.PLAYER_CARD]:     'player-card',
        [CAPABILITY.CLUB_SNAPSHOT]:   'club-snapshot',
      }).find(([, id]) => id === pid)?.[0]
      return cap ? features[cap] !== false : true
    })

  return {
    integrationVersion: INTEGRATION_VERSION,
    tier,
    isEnabled,
    features,
    availableProducts,
    upgradeAvailable:  !isAnyCapabilityEnabled(tier) || getLimitations(tier).length > 0,
    limitations:       getLimitations(tier),
    reason:            isEnabled ? null : REASON.INSUFFICIENT_TIER,
  }
}

/**
 * Convenience: return true when a user has a specific capability.
 * Applies flag overrides the same way as resolveCapabilities.
 *
 * @param {object} user
 * @param {string} capability - CAPABILITY.*
 * @returns {boolean}
 */
export function userCan(user, capability) {
  if (!isGloballyEnabled(user?.flags ?? {})) return false
  const tier = resolveTier(user)
  const base = hasCapability(tier, capability)
  // Apply flag overrides on top
  const caps = applyFlagOverrides({ [capability]: base }, user?.flags ?? {})
  return caps[capability] === true
}
