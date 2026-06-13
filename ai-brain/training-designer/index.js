/**
 * AI Brain — Autonomous Training Designer (M25)
 *
 * Public barrel. Consumed by the AI namespace (ai-brain/index.js):
 *
 *   AI.designTrainingSession(context, opts)
 *   AI.trainingDesigner.design(context, opts)
 *
 * Consumes upstream products (Coach DNA, Weekly Brief, Match Readiness,
 * Opponent Intelligence, squad/welfare/load, Learning) passed in the context,
 * and outputs complete, deterministic, evidence-backed rugby training sessions.
 * No LLM, no Core dependency, no UI, no new infrastructure.
 */

export { designSession } from './recommendation-engine.js'
export { resolveConstraints } from './constraint-engine.js'
export { buildObjectives, OBJECTIVE_DEFS } from './objective-builder.js'
export { allocateTime, buildPhases } from './session-builder.js'
export { selectPhaseDrills, toActivity, isEligible } from './drill-selector.js'
export { progressDrill } from './progression-engine.js'
export { activityWorkload, workloadCap, classifyWorkload } from './workload-engine.js'
export { activityWelfareImpact, contactScaleFactor, buildWelfareNotes } from './welfare-engine.js'
export { buildReview, buildCoachMessages } from './review-engine.js'
export { validateSession } from './session-validator.js'

export {
  DESIGNER_VERSION, DESIGNER_FLAG, DESIGNER_TIERS,
  GRADE_META, GRADE_ORDER, FORMAT, PHASE, PHASE_ORDER, TAG, DRILL_LIBRARY, DRILL_BY_ID,
} from './training-types.js'
