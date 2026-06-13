/**
 * AI Brain — Match Defence Engine (M26)
 *
 * Builds the defensive strategy from the opponent's attacking picture and our
 * defensive DNA. Pure + deterministic, every rec evidence-backed.
 */

import { rec, block } from './game-model.js'
import { INTENT, POSTURE, WEAK_DIM, STRONG_DIM } from './strategy-types.js'

export function buildDefensiveStrategy(model) {
  const recs = []
  const attack = model.dim('attackTendencies')
  const breakdown = model.dim('breakdownSpeed')
  const counter = model.dim('counterattackFrequency')
  const territory = model.dim('territoryPreference')

  let intent = INTENT.STRUCTURED
  if (attack != null && attack >= STRONG_DIM) intent = INTENT.HIGH_TEMPO   // fast line speed to disrupt

  if (attack != null && attack >= STRONG_DIM) {
    recs.push(rec('def-linespeed', 'Bring aggressive line speed to deny their attack time and space',
      `Opponent attack rated strong (${attack}/100) — shut down time on the ball`, model.dimEvidence('attackTendencies'),
      { priority: 'high', confidence: 0.8 }))
    recs.push(rec('def-edge', 'Hold width and trust the edge defenders — they will look to go wide',
      `Strong wide attack (${attack}/100) — protect the 13/15 channel`, model.dimEvidence('attackTendencies'),
      { priority: 'medium', confidence: 0.7 }))
  }

  if (breakdown != null && breakdown >= STRONG_DIM) {
    recs.push(rec('def-jackal', 'Commit a dedicated jackal early to slow their ruck ball',
      `Opponent breakdown speed high (${breakdown}/100)`, model.dimEvidence('breakdownSpeed'),
      { priority: 'high', confidence: 0.75 }))
  } else if (breakdown != null && breakdown <= WEAK_DIM) {
    recs.push(rec('def-fan', 'Fan the defence and fold quickly — their slow ruck lets us reset',
      `Opponent breakdown speed low (${breakdown}/100)`, model.dimEvidence('breakdownSpeed'),
      { priority: 'medium', confidence: 0.65 }))
  }

  if (counter != null && counter >= STRONG_DIM) {
    recs.push(rec('def-kickchase', 'Only kick with an organised chase; avoid loose, unchased kicks',
      `Opponent counter-attack threat high (${counter}/100)`, model.dimEvidence('counterattackFrequency'),
      { priority: 'high', confidence: 0.7 }))
  }

  if (model.posture === POSTURE.UNDERDOG) {
    recs.push(rec('def-scramble', 'Drill scramble defence and goal-line sets — expect sustained pressure',
      'Underdog posture — resilience under pressure is decisive', [], { priority: 'high', confidence: 0.7 }))
  }

  if (!recs.length) {
    recs.push(rec('def-base', 'Connected line, dominant tackle, quick reload — defend in pairs',
      'Limited opponent data — default to defensive fundamentals', [], { priority: 'medium', confidence: 0.5 }))
  }

  const summary = `${intent === INTENT.HIGH_TEMPO ? 'Aggressive line-speed' : 'Structured'} defence` +
    (attack != null ? `, vs a ${attack >= STRONG_DIM ? 'dangerous' : attack <= WEAK_DIM ? 'blunt' : 'balanced'} attack` : '')
  return block(summary, intent, recs, model.confidence)
}
