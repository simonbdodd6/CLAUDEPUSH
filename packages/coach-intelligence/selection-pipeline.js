/**
 * @coach-intelligence — Selection Pipeline Facade (M131, DORMANT)
 *
 * A single deterministic entry point that runs the complete selection pipeline by invoking the
 * existing engines in order — ORCHESTRATION ONLY. It introduces no scoring, alters no ranking,
 * generates no language, and duplicates no logic. It returns exactly the M130 match-day squad,
 * with no extra fields or transformations.
 *
 *   M121 evaluateSquad → M122 buildDepthChart → M123 recommendStartingXV → M124 evaluateSelectionRisk
 *   → M126 evaluateTeamSignOff → M128 recommendCaptain → M129 recommendBench → M130 composeMatchDaySquad
 *
 * Top-level input shape is validated here; all downstream validation is delegated to each engine.
 * Pure and side-effect free: no persistence, APIs, filesystem, network, randomness or clock.
 */

import { evaluateSquad } from './squad-evaluation.js'
import { buildDepthChart } from './depth-chart.js'
import { recommendStartingXV } from './recommend-starting-xv.js'
import { evaluateSelectionRisk } from './selection-risk.js'
import { evaluateTeamSignOff } from './team-signoff.js'
import { recommendCaptain } from './captain-recommendation.js'
import { recommendBench } from './bench-recommendation.js'
import { composeMatchDaySquad } from './match-day-squad.js'

const isObj = (v) => v !== null && typeof v === 'object'

/**
 * Run the complete selection pipeline and return the M130 match-day squad.
 *
 * @param {{
 *   candidates: Array<object>, pipelineResult: object, recommendation: object,
 *   squadOptions?: object, positionGroups?: object, formation?: object,
 *   captainOptions?: object, benchOptions?: object,
 * }} input
 * @returns {object}  the deeply-frozen M130 match-day squad (verbatim)
 */
export function runSelectionPipeline(input) {
  if (!isObj(input) || Array.isArray(input)) throw new TypeError('runSelectionPipeline requires an input object')
  const {
    candidates, pipelineResult, recommendation,
    squadOptions = {}, positionGroups = {}, formation = {}, captainOptions = {}, benchOptions = {},
  } = input

  // invoke the existing engines in order — each validates its own inputs and freezes its output
  const squadEvaluation = evaluateSquad(candidates, pipelineResult, recommendation, squadOptions)   // M121
  const depthChart = buildDepthChart(squadEvaluation, positionGroups)                                 // M122
  const startingXV = recommendStartingXV(depthChart, formation)                                       // M123
  const selectionRisk = evaluateSelectionRisk(startingXV)                                             // M124
  const signOff = evaluateTeamSignOff(startingXV, selectionRisk)                                      // M126
  const captainRecommendation = recommendCaptain(startingXV, captainOptions)                          // M128
  const benchRecommendation = recommendBench(startingXV, squadEvaluation, benchOptions)               // M129

  return composeMatchDaySquad({ startingXV, captainRecommendation, benchRecommendation, selectionRisk, signOff })   // M130
}
