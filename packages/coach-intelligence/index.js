/**
 * @coach-intelligence (M118) — Coach Intelligence orchestration, DORMANT.
 *
 * Composes the dormant Coach Memory / Coach DNA capabilities (M110–M117) into a single
 * deterministic pipeline via dependency-injected services. Pure composition: no new
 * intelligence, no LLM, no storage, no orchestration framework. Imported by nobody yet
 * except its tests.
 */

export { runCoachIntelligencePipeline } from './pipeline.js'

export { buildCoachRecommendation } from './recommendation.js'

export { evaluateSelectionCandidate } from './selection-engine.js'

export { evaluateSquad } from './squad-evaluation.js'

export { buildDepthChart } from './depth-chart.js'

export { recommendStartingXV, DEFAULT_FORMATION } from './recommend-starting-xv.js'

export { evaluateSelectionRisk } from './selection-risk.js'

export { summarizeSelectionRisk } from './summarize-selection-risk.js'

export { evaluateTeamSignOff } from './team-signoff.js'
