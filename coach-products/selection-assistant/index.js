/**
 * Coach Products — AI Selection Assistant (M22)
 *
 * Public API for Coach's Eye Core.
 *
 * Core usage:
 *   import { getSelectionAssistant } from 'coach-products/selection-assistant/index.js'
 *   const r = await getSelectionAssistant({ user, team, squad, fixtureId, generatedAt })
 */

export { getSelectionAssistant } from './selection-assistant.js'
export {
  SA_ID, SA_VERSION, SELECTION_FLAG, PERSONALISATION_FLAG, MIN_PROFILE_OBSERVATIONS,
  POSITIONS, JERSEYS, GROUP, PLAYER_STATUS, COVERAGE, SEVERITY, SQUAD_SIZE, BENCH_SIZE,
} from './selection-assistant-types.js'
export {
  personalise, emptyPersonalisation, reorderChanges, reorderWarnings, reorderInjuryRisks,
  buildSignalsUsed, buildExplanation,
} from './personaliser.js'
