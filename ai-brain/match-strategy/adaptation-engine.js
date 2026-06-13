/**
 * AI Brain — Match Adaptation Engine (M26)
 *
 * Produces momentum triggers: pre-planned in-game adaptations keyed to game
 * state ("if X happens, do Y"). Deterministic — derived from posture, opponent
 * fitness/discipline and our plan. Pure.
 */

import { rec, block } from './game-model.js'
import { POSTURE, WEAK_DIM, STRONG_DIM } from './strategy-types.js'

export function buildMomentumTriggers(model) {
  const recs = []
  const oppFitness = model.dim('fitnessTrends')
  const oppDiscipline = model.dim('disciplineProfile')

  recs.push(rec('mom-lead', 'IF we lead by 10+ → tighten up: territory, set-piece, kill the tempo',
    'Protect a lead by removing opponent ball', [], { priority: 'high', confidence: 0.7 }))
  recs.push(rec('mom-behind', 'IF behind entering the last 20 → raise tempo and go to the bench finishers',
    'Chase the game with fresh legs and width', [], { priority: 'high', confidence: 0.7 }))
  recs.push(rec('mom-yellow', 'IF up a player (yellow card) → attack the short side and force quick play',
    'Exploit numerical advantage immediately', [], { priority: 'medium', confidence: 0.65 }))

  if (oppFitness != null && oppFitness <= WEAK_DIM) {
    recs.push(rec('mom-fade', 'IF the game is level at 60\' → strike now, they fade late',
      `Opponent fades late (fitness ${oppFitness}/100)`, model.dimEvidence('fitnessTrends'),
      { priority: 'high', confidence: 0.75 }))
  }
  if (oppDiscipline != null && oppDiscipline <= WEAK_DIM) {
    recs.push(rec('mom-penalties', 'IF they concede repeated penalties → take the 3 points and apply scoreboard pressure',
      `Opponent penalty-prone (discipline ${oppDiscipline}/100)`, model.dimEvidence('disciplineProfile'),
      { priority: 'medium', confidence: 0.7 }))
  }
  if (model.posture === POSTURE.FAVOURITE) {
    recs.push(rec('mom-early', 'IF we start fast → bury them early and stay ruthless for 30\'',
      'Favourite posture — assert dominance before they settle', [], { priority: 'medium', confidence: 0.65 }))
  }
  return block('Momentum triggers (in-game adaptations)', null, recs, model.confidence)
}
