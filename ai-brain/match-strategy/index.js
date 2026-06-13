/**
 * AI Brain — Autonomous Match Strategy Engine (M26)
 *
 * Public barrel. Consumed by the AI namespace (ai-brain/index.js):
 *
 *   AI.buildMatchStrategy(context, opts)
 *   AI.matchStrategy.build(context, opts)
 *
 * Synthesises upstream products (Coach DNA, Opponent Intelligence, Selection
 * Assistant, Match Readiness, Training Designer, Weekly Brief, Availability)
 * passed in the context into a complete, deterministic, evidence-backed match
 * plan. No LLM, no Core dependency, no UI, no new infrastructure.
 */

export { buildMatchPlan } from './recommendation-engine.js'
export { buildGameModel, rec, block } from './game-model.js'
export { buildAttackStrategy } from './attack-engine.js'
export { buildDefensiveStrategy } from './defence-engine.js'
export { buildKickStrategy, buildTerritoryPlan, buildKickoffPlan, buildRestartPlan } from './territory-engine.js'
export { buildScrumStrategy, buildLineoutStrategy } from './setpiece-engine.js'
export { buildBenchPlan } from './bench-engine.js'
export { buildReplacementTiming } from './substitution-engine.js'
export { buildRiskWarnings, buildWeatherAdjustments, buildRefereeAdjustments } from './risk-engine.js'
export { buildMomentumTriggers } from './adaptation-engine.js'
export { buildPressureZones } from './scenario-engine.js'

export {
  STRATEGY_VERSION, STRATEGY_FLAG, STRATEGY_TIERS,
  GRADE, FORMAT, POSTURE, GAME_PHASE, WEATHER, REFEREE_TENDENCY, PLAN_FIELD,
} from './strategy-types.js'
