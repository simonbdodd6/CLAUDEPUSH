/**
 * AI Brain — Season Confidence Engine (M28)
 *
 * Overall season-intelligence confidence from how much of the season has been
 * played and how many input streams are present. Deterministic.
 */

import { clamp, round2 } from './season-state.js'

export function scoreSeasonConfidence(state, context = {}) {
  const progress = clamp(state.seasonProgress, 0, 1)
  let inputs = 0
  if (Array.isArray(context.trainingHistory) && context.trainingHistory.length) inputs++
  if (Array.isArray(context.playerDevelopment) && context.playerDevelopment.length) inputs++
  if (Array.isArray(context.selectionHistory) && context.selectionHistory.length) inputs++
  if (Array.isArray(context.goals) && context.goals.length) inputs++
  if (context.coachDNA) inputs++
  const inputFactor = clamp(inputs / 5, 0, 1)
  return round2(clamp(0.3 + progress * 0.4 + inputFactor * 0.25, 0.3, 0.95))
}
