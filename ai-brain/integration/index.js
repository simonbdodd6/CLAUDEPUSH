/**
 * AI Brain — Integration Layer (M17)
 *
 * Single entry point for Coach's Eye Core.
 * Core imports CoachAI from this path and nothing else from ai-brain.
 *
 * Named exports allow tree-shaking and selective imports in Core.
 * Default export is the CoachAI namespace object for convenience.
 *
 * NOTE: This module is intentionally NOT re-exported from ai-brain/index.js
 * to prevent circular dependencies (integration → products → api → brain → index).
 */

export { default as CoachAI } from './coach-ai.js'
export { getCapabilities, getDashboard, getPlayerCard, getMatchReadiness, getClubSnapshot } from './coach-ai.js'

export { TIER, CAPABILITY, REASON, GLOBAL_AI_FLAG, INTEGRATION_VERSION } from './integration-types.js'
export { TIER_CAPABILITIES, TIER_ORDER, resolveTier, hasCapability, getAvailableProducts, getLimitations, isAnyCapabilityEnabled } from './subscription.js'
export { resolveCapabilities, userCan } from './capabilities.js'
export { makeResponse, dashboardFallback, playerCardFallback, matchReadinessFallback, clubSnapshotFallback, capabilitiesFallback } from './fallbacks.js'

import CoachAI from './coach-ai.js'
export default CoachAI
