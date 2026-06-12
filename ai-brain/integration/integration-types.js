/**
 * AI Brain — Integration Layer Types (M17)
 *
 * Shared constants for the CoachAI integration layer.
 * Core imports only these constants — never any Brain internals.
 *
 * The integration layer sits above the Product Library (M16) and
 * is the single point of entry for Coach's Eye Core.
 */

/** Subscription tiers in ascending capability order. */
export const TIER = Object.freeze({
  FREE:         'free',
  STARTER:      'starter',
  PERFORMANCE:  'performance',
  PROFESSIONAL: 'professional',
  CLUB:         'club',
  ENTERPRISE:   'enterprise',
})

/** Logical capabilities controlled by tier. One flag per product surface. */
export const CAPABILITY = Object.freeze({
  DASHBOARD:      'dashboard',       // Coach summary / Weekly Brief
  WEEKLY_BRIEF:   'weeklyBrief',     // Full Weekly Coach Brief
  MATCH_READINESS:'matchReadiness',  // Pre-match readiness report
  PLAYER_CARD:    'playerCard',      // Per-player development card
  CLUB_SNAPSHOT:  'clubSnapshot',    // Club health snapshot
})

/** Reasons returned in IntegrationResponse.reason when ok=false or available=false. */
export const REASON = Object.freeze({
  INSUFFICIENT_TIER: 'insufficient_tier',   // user's tier doesn't include this feature
  FEATURE_DISABLED:  'feature_disabled',    // explicitly disabled via flag
  BRAIN_UNAVAILABLE: 'brain_unavailable',   // product call succeeded structurally but Brain errored
  INVALID_INPUT:     'invalid_input',       // required input missing
  AI_NOT_ENABLED:    'ai_not_enabled',      // global AI kill-switch is off
})

/**
 * Global kill-switch flag.
 * Set flags['ai.enabled'] = false to disable all Intelligence for a request,
 * regardless of subscription tier.
 * Default (flag absent or true): Intelligence is enabled per tier.
 */
export const GLOBAL_AI_FLAG = 'ai.enabled'

/** Integration response schema version. Bump on breaking envelope change. */
export const INTEGRATION_VERSION = '1.0'
