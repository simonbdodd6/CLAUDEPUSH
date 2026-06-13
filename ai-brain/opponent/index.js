/**
 * AI Brain — Opponent Intelligence Engine (M24)
 *
 * Public barrel. Consumed by the AI namespace (ai-brain/index.js), which exposes:
 *
 *   AI.getOpponentProfile(opponentId, opts)
 *   AI.getOpponentSummary(opponentId, opts)
 *   AI.getOpponentThreats(opponentId, opts)
 *   AI.getOpponentOpportunities(opponentId, opts)
 *   AI.compareOpponents([idA, idB], opts)
 *   AI.getOpponentEvolution(opponentId, opts)
 *   AI.opponent.record(opponentId, observations)   — append match observations
 *
 * The engine consumes ONLY observations. It never edits Core, has no Core
 * dependency, and contains no LLM.
 */

export {
  buildOpponentProfile, buildOpponentSummary, buildOpponentThreats,
  buildOpponentOpportunities, compareOpponentProfiles, buildOpponentEvolution,
  recordOpponentObservation, recordOpponentObservations, getOpponentObservations,
  resetOpponent, exportOpponentProfile, _clear,
} from './opponent-profile.js'

export { deriveStrengths } from './strength-engine.js'
export { deriveWeaknesses } from './weakness-engine.js'
export { buildThreats, buildOpportunities } from './recommendation-builder.js'
export {
  sortIndexed, scoreConfidence, computeTrend, buildEntry,
  deriveSubstitutionBehaviour, deriveFitnessTrends, deriveLateGameBehaviour,
} from './trend-engine.js'
export {
  deriveAttackTendencies, deriveDefensiveTendencies, derivePhaseCount,
  deriveBreakdownSpeed, deriveCounterattackFrequency, deriveTerritoryPreference,
} from './pattern-engine.js'
export { deriveScrumProfile, deriveLineoutProfile, deriveRestartProfile } from './set-piece-engine.js'
export { deriveKickProfile } from './kick-profile.js'
export { deriveDisciplineProfile } from './discipline-profile.js'

export {
  PROFILE_VERSION, OPPONENT_FLAG, OPPONENT_TIERS,
  OPP_EVENT, DIMENSION, DIMENSION_KEYS, DIMENSION_META,
  STRONG_THRESHOLD, WEAK_THRESHOLD, MIN_CONFIDENCE,
} from './opponent-types.js'
