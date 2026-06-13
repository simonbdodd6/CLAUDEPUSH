/**
 * AI Brain — Match Risk Engine (M26)
 *
 * Produces risk warnings, weather adjustments and referee adjustments. Pure +
 * deterministic. Risk warnings draw on opponent strengths, our coverage gaps,
 * posture and welfare; adjustments translate conditions/referee into concrete
 * tweaks. Every item references its evidence where available.
 */

import { rec, block } from './game-model.js'
import {
  POSTURE, WEATHER, REFEREE_TENDENCY, SEVERITY, STRONG_DIM, WEAK_DIM,
} from './strategy-types.js'

export function buildRiskWarnings(model, context = {}) {
  const recs = []
  const push = (id, text, why, evidence, severity) =>
    recs.push(rec(id, text, why, evidence, { priority: severity, confidence: 0.7 }))

  // Opponent set-piece strength against our exposed coverage.
  if (model.frontRowStatus === 'exposed') {
    push('risk-frontrow', 'Front-row cover is exposed — an early injury risks uncontested scrums',
      'Selection Assistant flagged exposed front-row coverage', [], SEVERITY.HIGH)
  }
  const oppScrum = model.dim('scrumProfile')
  if (oppScrum != null && oppScrum >= STRONG_DIM) {
    push('risk-scrum', 'Their scrum can win penalties in our half — discipline and low scrum count',
      `Opponent scrum strong (${oppScrum}/100)`, model.dimEvidence('scrumProfile'), SEVERITY.MEDIUM)
  }
  const oppCounter = model.dim('counterattackFrequency')
  if (oppCounter != null && oppCounter >= STRONG_DIM) {
    push('risk-counter', 'Turnovers and loose kicks will be punished on the counter',
      `Opponent counter-attack threat high (${oppCounter}/100)`, model.dimEvidence('counterattackFrequency'), SEVERITY.HIGH)
  }
  if (model.posture === POSTURE.UNDERDOG) {
    push('risk-pressure', 'Expect long periods without the ball — discipline and scramble are decisive',
      'Underdog posture', [], SEVERITY.MEDIUM)
  }
  // Welfare risk.
  const injured = Array.isArray(context.squad) ? context.squad.filter(p => ['injured', 'doubtful'].includes(p?.status)).length : 0
  if (injured > 0) {
    push('risk-welfare', `${injured} player(s) carrying injury/doubt — have clear contingency cover`,
      'Availability/welfare risk to the match-day 23', [], SEVERITY.MEDIUM)
  }
  if (!recs.length) {
    push('risk-none', 'No major structural risks flagged — execute the plan and stay disciplined',
      'Limited risk signals from inputs', [], SEVERITY.LOW)
  }
  return block('Risk warnings', null, recs, model.confidence)
}

export function buildWeatherAdjustments(model) {
  const recs = []
  const w = model.weather
  if (w === WEATHER.WET) {
    recs.push(rec('wx-wet-handling', 'Reduce wide ball-in-hand; simplify to forward carries and territory',
      'Wet ball raises handling-error risk', [], { priority: 'high', confidence: 0.75 }))
    recs.push(rec('wx-wet-setpiece', 'Set-piece and box-kick pressure become higher value in the wet',
      'Conditions favour a tight, pressure game', [], { priority: 'medium', confidence: 0.7 }))
  } else if (w === WEATHER.WINDY) {
    recs.push(rec('wx-wind', 'Play with the wind in the first/last available end; kick long with it',
      'Wind dictates territorial value by end', [], { priority: 'high', confidence: 0.7 }))
  } else if (w === WEATHER.HOT) {
    recs.push(rec('wx-hot', 'Plan extra hydration windows and earlier rotations; manage tempo',
      'Heat accelerates fatigue', [], { priority: 'medium', confidence: 0.65 }))
  } else if (w === WEATHER.COLD) {
    recs.push(rec('wx-cold', 'Extend the warm-up and keep replacements active on the touchline',
      'Cold raises soft-tissue injury risk', [], { priority: 'low', confidence: 0.6 }))
  } else {
    recs.push(rec('wx-dry', 'Dry conditions — back the full game plan, ball-in-hand viable',
      'No weather constraint', [], { priority: 'low', confidence: 0.6 }))
  }
  return block(`Weather adjustments (${w})`, null, recs, model.confidence)
}

export function buildRefereeAdjustments(model) {
  const recs = []
  const tendencies = model.referee
  for (const t of tendencies) {
    if (t === REFEREE_TENDENCY.STRICT_BREAKDOWN) {
      recs.push(rec('ref-breakdown', 'Stay on your feet and roll away — referee is strict at the breakdown',
        'Referee tendency: strict breakdown', [], { priority: 'high', confidence: 0.7 }))
    } else if (t === REFEREE_TENDENCY.STRICT_SCRUM) {
      recs.push(rec('ref-scrum', 'Prioritise a square, legal scrum setup — referee penalises scrum technique',
        'Referee tendency: strict scrum', [], { priority: 'medium', confidence: 0.65 }))
    } else if (t === REFEREE_TENDENCY.STRICT_OFFSIDE) {
      recs.push(rec('ref-offside', 'Hold the defensive line — referee is strict on offside',
        'Referee tendency: strict offside', [], { priority: 'medium', confidence: 0.65 }))
    } else if (t === REFEREE_TENDENCY.LETS_PLAY) {
      recs.push(rec('ref-play', 'Referee lets the game flow — speed up the breakdown and play with tempo',
        'Referee tendency: lets play', [], { priority: 'medium', confidence: 0.6 }))
    }
  }
  if (!recs.length) {
    recs.push(rec('ref-default', 'No referee data — brief the standard breakdown and offside discipline',
      'No referee tendencies supplied', [], { priority: 'low', confidence: 0.5 }))
  }
  return block('Referee adjustments', null, recs, model.confidence)
}
