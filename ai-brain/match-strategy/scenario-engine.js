/**
 * AI Brain — Match Scenario Engine (M26)
 *
 * Produces the pressure-zone plan (where on the field, and when in the game, to
 * apply or expect pressure) and scenario contingencies. Deterministic.
 */

import { rec, block } from './game-model.js'
import { GAME_PHASE, POSTURE, WEAK_DIM, STRONG_DIM } from './strategy-types.js'

export function buildPressureZones(model) {
  const recs = []
  const oppDiscipline = model.dim('disciplineProfile')
  const oppScrum = model.dim('scrumProfile')
  const oppLineout = model.dim('lineoutProfile')

  // Field zones to target.
  if (oppDiscipline != null && oppDiscipline <= WEAK_DIM) {
    recs.push(rec('pz-opp22', 'Target zone: opposition 22 — squeeze for penalties, they offend under pressure',
      `Opponent penalty-prone (${oppDiscipline}/100)`, model.dimEvidence('disciplineProfile'),
      { priority: 'high', confidence: 0.75 }))
  }
  if (oppLineout != null && oppLineout <= WEAK_DIM) {
    recs.push(rec('pz-their-lineout', 'Pressure zone: their lineout — contest and disrupt their primary launch',
      `Opponent lineout weak (${oppLineout}/100)`, model.dimEvidence('lineoutProfile'),
      { priority: 'medium', confidence: 0.7 }))
  }
  if (oppScrum != null && oppScrum >= STRONG_DIM) {
    recs.push(rec('pz-own-half', 'Danger zone: scrums in our half — minimise and exit; their scrum is strong',
      `Opponent scrum strong (${oppScrum}/100)`, model.dimEvidence('scrumProfile'),
      { priority: 'medium', confidence: 0.7 }))
  }

  // Game-phase pressure plan.
  recs.push(rec('pz-opening', `${GAME_PHASE.OPENING}: win the first 10\' collisions and set the tone`,
    'Early physical dominance shapes the contest', [], { priority: 'medium', confidence: 0.65 }))
  recs.push(rec('pz-closing', `${GAME_PHASE.CLOSING}: own the last 20\' — accuracy, fitness and bench impact`,
    'Matches are won in the closing phase', [], { priority: 'high', confidence: 0.7 }))

  if (model.posture === POSTURE.UNDERDOG) {
    recs.push(rec('pz-stay', 'Stay within one score to half-time — keep the scoreboard pressure on them',
      'Underdog posture — a close game maximises upset probability', [], { priority: 'high', confidence: 0.65 }))
  }
  return block('Pressure zones (field + game phase)', null, recs, model.confidence)
}
