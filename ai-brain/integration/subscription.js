/**
 * AI Brain — Subscription Resolver (M17)
 *
 * Defines which capabilities are available per subscription tier,
 * resolves a user object to a canonical tier, and provides the
 * human-readable limitations list shown in upgrade prompts.
 *
 * No Brain calls. Pure data and logic.
 */

import { TIER, CAPABILITY } from './integration-types.js'
import { PRODUCT_ID } from '../products/index.js'

// ── Tier capability matrix ─────────────────────────────────────────────────────
//
// Each tier row maps every CAPABILITY to a boolean.
// Read vertically to see which tiers enable each capability.
// Read horizontally to see what a tier can access.

export const TIER_CAPABILITIES = Object.freeze({
  [TIER.FREE]: {
    [CAPABILITY.DASHBOARD]:       false,
    [CAPABILITY.WEEKLY_BRIEF]:    false,
    [CAPABILITY.MATCH_READINESS]: false,
    [CAPABILITY.PLAYER_CARD]:     false,
    [CAPABILITY.CLUB_SNAPSHOT]:   false,
  },
  [TIER.STARTER]: {
    [CAPABILITY.DASHBOARD]:       true,
    [CAPABILITY.WEEKLY_BRIEF]:    true,
    [CAPABILITY.MATCH_READINESS]: false,
    [CAPABILITY.PLAYER_CARD]:     false,
    [CAPABILITY.CLUB_SNAPSHOT]:   false,
  },
  [TIER.PERFORMANCE]: {
    [CAPABILITY.DASHBOARD]:       true,
    [CAPABILITY.WEEKLY_BRIEF]:    true,
    [CAPABILITY.MATCH_READINESS]: true,
    [CAPABILITY.PLAYER_CARD]:     true,
    [CAPABILITY.CLUB_SNAPSHOT]:   false,
  },
  [TIER.PROFESSIONAL]: {
    [CAPABILITY.DASHBOARD]:       true,
    [CAPABILITY.WEEKLY_BRIEF]:    true,
    [CAPABILITY.MATCH_READINESS]: true,
    [CAPABILITY.PLAYER_CARD]:     true,
    [CAPABILITY.CLUB_SNAPSHOT]:   true,
  },
  [TIER.CLUB]: {
    [CAPABILITY.DASHBOARD]:       true,
    [CAPABILITY.WEEKLY_BRIEF]:    false,  // club tier is org-focused, not per-coach brief
    [CAPABILITY.MATCH_READINESS]: true,
    [CAPABILITY.PLAYER_CARD]:     false,  // player cards are per-coach, not club-admin
    [CAPABILITY.CLUB_SNAPSHOT]:   true,
  },
  [TIER.ENTERPRISE]: {
    [CAPABILITY.DASHBOARD]:       true,
    [CAPABILITY.WEEKLY_BRIEF]:    true,
    [CAPABILITY.MATCH_READINESS]: true,
    [CAPABILITY.PLAYER_CARD]:     true,
    [CAPABILITY.CLUB_SNAPSHOT]:   true,
  },
})

// ── Upgrade limitations — surfaced to Core for upgrade prompts ─────────────────

const TIER_LIMITATIONS = Object.freeze({
  [TIER.FREE]: [
    'Upgrade to Starter to unlock the Weekly Coach Brief and AI dashboard',
  ],
  [TIER.STARTER]: [
    'Upgrade to Performance to unlock Match Readiness reports',
    'Upgrade to Performance to unlock Player Development Cards',
  ],
  [TIER.PERFORMANCE]: [
    'Upgrade to Professional to unlock the Club Health Snapshot',
  ],
  [TIER.PROFESSIONAL]: [],
  [TIER.CLUB]: [
    'Player Development Cards are available on the Performance tier or above',
    'Weekly Coach Brief is available on the Performance tier or above',
  ],
  [TIER.ENTERPRISE]: [],
})

// ── Canonical product list per tier ───────────────────────────────────────────

const CAPABILITY_TO_PRODUCT = {
  [CAPABILITY.WEEKLY_BRIEF]:    PRODUCT_ID.WEEKLY_BRIEF,
  [CAPABILITY.MATCH_READINESS]: PRODUCT_ID.MATCH_READINESS,
  [CAPABILITY.PLAYER_CARD]:     PRODUCT_ID.PLAYER_CARD,
  [CAPABILITY.CLUB_SNAPSHOT]:   PRODUCT_ID.CLUB_SNAPSHOT,
}

// ── Public helpers ─────────────────────────────────────────────────────────────

/** Canonical tier order for UI display (ascending). */
export const TIER_ORDER = [
  TIER.FREE, TIER.STARTER, TIER.PERFORMANCE,
  TIER.PROFESSIONAL, TIER.CLUB, TIER.ENTERPRISE,
]

/**
 * Normalize a user object to a canonical tier string.
 * Unknown or missing tiers default to FREE.
 *
 * @param {object} user - { tier?: string }
 * @returns {string}    - one of TIER.*
 */
export function resolveTier(user) {
  const raw = String(user?.tier ?? '').toLowerCase().trim()
  return Object.values(TIER).includes(raw) ? raw : TIER.FREE
}

/**
 * Return true when the given tier has the given capability.
 *
 * @param {string} tier
 * @param {string} capability
 * @returns {boolean}
 */
export function hasCapability(tier, capability) {
  return TIER_CAPABILITIES[tier]?.[capability] ?? false
}

/**
 * Return the list of product IDs available at a given tier.
 * DASHBOARD is not a product ID — it maps to WEEKLY_BRIEF.
 *
 * @param {string} tier
 * @returns {string[]}
 */
export function getAvailableProducts(tier) {
  const caps = TIER_CAPABILITIES[tier] ?? {}
  return Object.entries(CAPABILITY_TO_PRODUCT)
    .filter(([capability]) => caps[capability] === true)
    .map(([, productId]) => productId)
}

/**
 * Return upgrade limitation strings for a given tier.
 * Empty array when the tier has no limitations.
 *
 * @param {string} tier
 * @returns {string[]}
 */
export function getLimitations(tier) {
  return [...(TIER_LIMITATIONS[tier] ?? [])]
}

/**
 * Return true when the tier has any Intelligence capability enabled.
 *
 * @param {string} tier
 * @returns {boolean}
 */
export function isAnyCapabilityEnabled(tier) {
  const caps = TIER_CAPABILITIES[tier] ?? {}
  return Object.values(caps).some(Boolean)
}
