/**
 * AI Brain — Live Match Intelligence Engine (M27)
 *
 * Public barrel. Consumed by the AI namespace (ai-brain/index.js):
 *
 *   AI.getLiveMatchIntelligence(matchId|events, opts)
 *   AI.liveMatch.record(matchId, events) / .analyse(...) / .reset(matchId)
 *
 * Thinks DURING the game: ingests live events and synthesises real-time match
 * state and recommendations. No LLM, no Core dependency, no UI, no new infra.
 */

export { buildLiveIntelligence } from './recommendation-engine.js'
export { deriveMatchState, LIVE_VERSION, LIVE_FLAG, LIVE_TIERS, EVENT, ZONE, GRADE, FORMAT } from './match-state.js'
export { normaliseEvents, recordEvent, recordEvents, getEvents, resetMatch, _clear } from './event-store.js'
export { buildMomentum } from './momentum-engine.js'
export { buildTerritoryMap, buildDominantCollisionZone, buildPressureIndex } from './territory-engine.js'
export { buildWinProbability, buildExpectedNextPhase } from './prediction-engine.js'
export { buildDisciplineRisk } from './discipline-engine.js'
export { buildFatigue } from './fatigue-engine.js'
export { buildInjuryImpact } from './injury-engine.js'
export { buildBenchRecommendations, buildReplacementTiming } from './substitution-engine.js'
export { buildPatterns } from './pattern-engine.js'
export { buildOpportunities, buildDangers } from './scenario-engine.js'
export { buildCriticalMoments, buildTimeline } from './timeline-engine.js'
export { scoreOverallConfidence, withFallback } from './confidence-engine.js'
