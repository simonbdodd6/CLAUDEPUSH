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

export { composeTeamSheet } from './team-sheet.js'

export { recommendCaptain } from './captain-recommendation.js'

export { recommendBench } from './bench-recommendation.js'

export { composeMatchDaySquad } from './match-day-squad.js'

export { runSelectionPipeline } from './selection-pipeline.js'

export { buildSelectionExplanation } from './selection-explanation.js'

export { summarizeSelectionExplanation } from './selection-explanation-presenter.js'

export { diffDecisions } from './decision-intelligence-diff.js'

export { summarizeDecisionDiff } from './decision-intelligence-diff-presenter.js'

export { classifyDecisionDiff } from './decision-intelligence-diff-severity.js'

export { assessMatchReadiness } from './match-readiness.js'

export { explainPlayerReadiness } from './match-readiness-explanations.js'

export { assessSquadReadiness } from './match-readiness-summary.js'

export { analyzeSquadReadinessTrend } from './match-readiness-trend.js'

export { summarizeSquadReadiness } from './match-readiness-presenter.js'

export { gateReadinessReport } from './readiness-report-envelope.js'

export { buildReadinessEvidenceBundle } from './readiness-evidence-bundle.js'

export { summarizeReadinessBundle } from './readiness-evidence-bundle-presenter.js'

export { buildReadinessCoachView } from './readiness-coach-view.js'

export { buildReadinessCoachViewSample } from './readiness-coach-view-sample.js'

export { buildCoachDnaCoachView } from './coach-dna-coach-view.js'
