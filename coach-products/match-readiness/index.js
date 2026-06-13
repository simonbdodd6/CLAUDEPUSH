/**
 * Coach Products — Match Readiness Intelligence (M21)
 *
 * Public API for Coach's Eye Core.
 *
 * Core usage:
 *   import { getMatchReadiness } from 'coach-products/match-readiness/index.js'
 *   const r = await getMatchReadiness({ user, team, fixtureId, generatedAt })
 */

export { getMatchReadiness } from './match-readiness.js'
export {
  MR_ID, MR_VERSION, MATCH_READINESS_FLAG, PERSONALISATION_FLAG,
  SELECTION_RISK, LOAD_STATUS, SEVERITY, VERDICT, MR_FIELD, MIN_PROFILE_OBSERVATIONS,
} from './match-readiness-types.js'
export {
  personalise, emptyPersonalisation, buildSignalsUsed, buildExplanation,
  reorderConcerns, reorderTrainingFocus, reorderActions, reorderCriticalPlayers,
} from './personaliser.js'
