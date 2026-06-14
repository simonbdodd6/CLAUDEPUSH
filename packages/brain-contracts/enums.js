/**
 * @brain/contracts — Canonical enums (M31.0)
 *
 * The single source-of-truth value sets for the shared AI Brain platform.
 * Pure, frozen constants. No logic, no I/O, no LLM, no randomness.
 *
 * These mirror the values the existing engines already emit (M17 integration
 * types, M18–M28 flags/tiers). They are DORMANT in M31.0 — nothing imports them
 * yet, so there is no runtime behaviour change. A parity test asserts they match
 * the live engine constants so the two can never silently diverge.
 */

export const CONTRACT_VERSION = '1.0'

/** Subscription tiers (value set identical to M17 integration TIER). */
export const TIER = Object.freeze({
  FREE:         'free',
  STARTER:      'starter',
  PERFORMANCE:  'performance',
  CLUB:         'club',
  PROFESSIONAL: 'professional',
  ENTERPRISE:   'enterprise',
})

/** Record visibility within a memory scope. */
export const VISIBILITY = Object.freeze({ PRIVATE: 'private', SHARED: 'shared' })

/** Severity used by recommendations, risks and approvals. */
export const SEVERITY = Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low' })

/** Envelope reasons (identical to M17 integration REASON). */
export const REASON = Object.freeze({
  INSUFFICIENT_TIER: 'insufficient_tier',
  FEATURE_DISABLED:  'feature_disabled',
  BRAIN_UNAVAILABLE: 'brain_unavailable',
  INVALID_INPUT:     'invalid_input',
  AI_NOT_ENABLED:    'ai_not_enabled',
})

/** Platform-namespaced capability keys for the coaches-eye product. */
export const CAPABILITY = Object.freeze({
  DASHBOARD:            'coach.dashboard',
  WEEKLY_BRIEF:         'coach.weeklyBrief',
  MATCH_READINESS:      'coach.matchReadiness',
  PLAYER_CARD:          'coach.playerCard',
  CLUB_SNAPSHOT:        'coach.clubSnapshot',
  SELECTION_ASSISTANT:  'coach.selectionAssistant',
  COACH_DNA:            'coach.coachDna',
  OPPONENT_INTELLIGENCE:'coach.opponentIntelligence',
  TRAINING_DESIGNER:    'coach.trainingDesigner',
  MATCH_STRATEGY:       'coach.matchStrategy',
  LIVE_MATCH:           'coach.liveMatch',
  SEASON_INTELLIGENCE:  'coach.seasonIntelligence',
  LEARNING:             'coach.learning',
})

/** Feature-flag keys (identical strings to the live engine flags). */
export const FLAG = Object.freeze({
  ENABLED:              'ai.enabled',          // global kill-switch (M17 GLOBAL_AI_FLAG)
  LEARNING:             'ai.learning',         // M19
  COACH_PROFILE:        'ai.coachProfile',     // M19
  PERSONALISATION:      'ai.personalisation',  // M20
  MATCH_READINESS:      'ai.matchReadiness',   // M21
  SELECTION_ASSISTANT:  'ai.selectionAssistant', // M22
  COACH_DNA:            'ai.coachDNA',         // M23
  OPPONENT_INTELLIGENCE:'ai.opponentIntelligence', // M24
  TRAINING_DESIGNER:    'ai.trainingDesigner', // M25
  MATCH_STRATEGY:       'ai.matchStrategy',    // M26
  LIVE_MATCH:           'ai.liveMatch',        // M27
  SEASON_INTELLIGENCE:  'ai.seasonIntelligence', // M28
})

/** The global AI kill-switch flag (Core works fully when this is off). */
export const GLOBAL_KILL_FLAG = FLAG.ENABLED
