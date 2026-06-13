/**
 * AI Brain — Match Attack Engine (M26)
 *
 * Builds the attack strategy from the opponent's defensive picture, our coach's
 * attacking DNA, and the posture. Every recommendation explains WHY and cites
 * the opponent evidence that drove it. Pure + deterministic.
 */

import { rec, block } from './game-model.js'
import { INTENT, POSTURE, WEAK_DIM, STRONG_DIM } from './strategy-types.js'

export function buildAttackStrategy(model) {
  const recs = []
  const defence = model.dim('defensiveTendencies')
  const breakdown = model.dim('breakdownSpeed')
  const counterRisk = model.dim('counterattackFrequency')
  const attackBias = model.dna('attackVsDefenceBias')

  // Coach philosophy sets the base intent.
  let intent = attackBias >= 60 ? INTENT.BALL_IN_HAND : attackBias <= 40 ? INTENT.TERRITORIAL : INTENT.STRUCTURED
  if (model.posture === POSTURE.UNDERDOG) intent = INTENT.STRUCTURED   // limit error risk
  if (model.posture === POSTURE.FAVOURITE && attackBias >= 50) intent = INTENT.BALL_IN_HAND

  // Opponent defence is leaky → attack wide.
  if (defence != null && defence <= WEAK_DIM) {
    recs.push(rec('atk-wide', 'Attack the wide channels with width and tempo, especially second phase',
      `Opponent defence rated weak (${defence}/100) — overload the edges`, model.dimEvidence('defensiveTendencies'),
      { priority: 'high', confidence: 0.8 }))
  } else if (defence != null && defence >= STRONG_DIM) {
    recs.push(rec('atk-direct', 'Go through the middle first to commit defenders before going wide',
      `Opponent defence rated strong (${defence}/100) — earn the edge with directness`, model.dimEvidence('defensiveTendencies'),
      { priority: 'medium', confidence: 0.7 }))
  }

  // Their breakdown is slow → quick ball / tempo.
  if (breakdown != null && breakdown <= WEAK_DIM) {
    recs.push(rec('atk-tempo', 'Play at high tempo and keep the ball alive — they are slow at the breakdown',
      `Opponent breakdown speed weak (${breakdown}/100)`, model.dimEvidence('breakdownSpeed'),
      { priority: 'high', confidence: 0.75 }))
  }

  // They counter often → mind ball security in our own half.
  if (counterRisk != null && counterRisk >= STRONG_DIM) {
    recs.push(rec('atk-security', 'Prioritise ball security in our own half — they punish turnovers on the counter',
      `Opponent counter-attack threat high (${counterRisk}/100)`, model.dimEvidence('counterattackFrequency'),
      { priority: 'medium', confidence: 0.7 }))
  }

  // Posture-driven baseline.
  if (model.posture === POSTURE.FAVOURITE) {
    recs.push(rec('atk-control', 'Build scoreboard pressure early; take the points on offer',
      'Favourite posture — convert dominance into a lead', [], { priority: 'medium', confidence: 0.7 }))
  } else if (model.posture === POSTURE.UNDERDOG) {
    recs.push(rec('atk-territory', 'Play in their half — low-risk attack, force errors, keep it tight',
      'Underdog posture — minimise error risk and stay in the contest', [], { priority: 'high', confidence: 0.7 }))
  }

  if (!recs.length) {
    recs.push(rec('atk-base', 'Play a balanced, accurate game — go through the phases and finish your chances',
      'Limited opponent data — default to fundamentals', [], { priority: 'medium', confidence: 0.5 }))
  }

  const summary = `${intent.replace('_', ' ')} attack` +
    (defence != null ? `, targeting a ${defence <= WEAK_DIM ? 'weak' : defence >= STRONG_DIM ? 'strong' : 'balanced'} defence` : '')
  return block(summary, intent, recs, model.confidence)
}
