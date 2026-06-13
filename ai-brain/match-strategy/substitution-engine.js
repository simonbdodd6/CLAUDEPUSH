/**
 * AI Brain — Match Substitution Engine (M26)
 *
 * Produces deterministic replacement windows (minute targets) by unit, tuned to
 * format (match length), opponent fitness and our welfare/load picture.
 * Pure + deterministic.
 */

import { rec, block } from './game-model.js'
import { FORMAT, GRADE, WEAK_DIM, clamp, round } from './strategy-types.js'

export function buildReplacementTiming(model, context = {}) {
  const recs = []
  const sevens = model.format === FORMAT.SEVENS
  const fullTime = sevens ? 14 : (model.grade === GRADE.YOUTH ? 60 : 80)
  const oppFitness = model.dim('fitnessTrends')
  const earlier = oppFitness != null && oppFitness <= WEAK_DIM   // they fade → go earlier to press

  // Base windows as fractions of full time, by unit.
  const base = sevens
    ? { 'front-row': 0.5, 'back-row': 0.6, 'half-back': 0.65, back: 0.7 }
    : { 'front-row': 0.6, lock: 0.62, 'back-row': 0.65, 'half-back': 0.68, back: 0.72 }

  for (const [unit, frac] of Object.entries(base)) {
    let minute = round(fullTime * frac)
    if (earlier) minute = clamp(minute - round(fullTime * 0.05), 1, fullTime)
    recs.push(rec(`sub-${unit}`, `Plan the ${unit} replacement around ${minute}'`,
      earlier ? `Earlier change to press a fading opponent (fitness ${oppFitness}/100)` : 'Standard energy-management window',
      earlier ? model.dimEvidence('fitnessTrends') : [], { priority: unit === 'front-row' ? 'high' : 'medium', confidence: 0.65 }))
  }

  // High-load players from context → flag for earlier hooks.
  const highLoad = Array.isArray(context.welfare)
    ? context.welfare.filter(w => typeof w.load === 'number' && w.load >= 85).map(w => w.playerId)
    : []
  if (highLoad.length) {
    recs.push(rec('sub-load', `Pre-plan early replacements for high-load players: ${highLoad.join(', ')}`,
      'Welfare/load management reduces late-game injury risk', [], { priority: 'high', confidence: 0.7 }))
  }

  recs.push(rec('sub-flex', 'Keep one tactical change in reserve for the closing 10\'',
    'Retain flexibility to react to game state', [], { priority: 'low', confidence: 0.6 }))

  return block(`Replacement timing (full time ${fullTime}\')`, null, recs, model.confidence)
}
