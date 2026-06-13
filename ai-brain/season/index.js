/**
 * AI Brain — Season Intelligence Engine (M28)
 *
 * Public barrel. Consumed by the AI namespace (ai-brain/index.js):
 *
 *   AI.getSeasonIntelligence(context, opts)
 *   AI.seasonIntelligence.build(context, opts)
 *
 * Understands an entire season: synthesises the fixture list, results, training,
 * development, selection history and the upstream Brain products into a complete,
 * deterministic, evidence-backed season profile. No LLM, no Core dependency,
 * no UI, no external APIs.
 */

export { buildSeasonProfile } from './season-profile.js'
export { deriveSeasonState, SEASON_VERSION, SEASON_FLAG, SEASON_TIERS, GRADE, FORMAT, LEAGUE_DEFAULTS, TRAJECTORY, HEALTH } from './season-state.js'
export { buildFixtureAnalysis } from './fixture-engine.js'
export { buildTrajectory, buildLeagueTrend } from './trend-engine.js'
export { buildExpectedPoints, buildExpectedPosition, buildProbabilities } from './projection-engine.js'
export { buildFatigueCurves } from './fatigue-tracker.js'
export { buildDevelopment } from './development-engine.js'
export { buildPerformance } from './performance-engine.js'
export { buildCoachImpact } from './coach-impact.js'
export { buildRotationHealth } from './rotation-engine.js'
export { buildInjuryForecast } from './injury-forecast.js'
export { buildTargetAchievement } from './goal-engine.js'
export { buildMilestones } from './milestone-engine.js'
export { buildSeasonRisks } from './risk-engine.js'
export { buildPriorityRecommendations } from './recommendation-engine.js'
export { buildSeasonTimeline } from './timeline-engine.js'
export { scoreSeasonConfidence } from './confidence-engine.js'
