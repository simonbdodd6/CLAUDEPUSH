/**
 * AI Brain — Live Prediction Engine (M27)
 *
 * Deterministic win probability and expected next phase. Win probability is a
 * closed-form function of score margin, time remaining, momentum, numerical
 * advantage and pre-match strength — no randomness, no model files.
 */

import { EVENT, ZONE, clamp, round, isNum } from './match-state.js'

/**
 * Win probability (0–100 for us).
 * @param {object} model { momentumScore, strengthIndex }
 */
export function buildWinProbability(state, model = {}) {
  const fullTime = state.fullTime || 80
  const timeLeftFrac = clamp(state.minutesRemaining / fullTime, 0, 1)
  const margin = state.score.margin

  // Each point is worth more as time runs out.
  const marginEffect = clamp(margin * (1.4 + (1 - timeLeftFrac) * 3.5), -45, 45)
  const momentumEffect = clamp((model.momentumScore ?? 0) * 0.1, -10, 10)
  // Pre-match strength matters early, fades as the scoreboard takes over.
  const strengthEffect = clamp((model.strengthIndex ?? 0) * 0.25, -12, 12) * timeLeftFrac
  const playerEffect = clamp(state.numericalAdvantage * 6, -18, 18)

  const value = clamp(round(50 + marginEffect + momentumEffect + strengthEffect + playerEffect), 1, 99)
  return {
    value,
    summary: value >= 65 ? 'We are favoured to win' : value <= 35 ? 'We are against the odds' : 'The game is in the balance',
    drivers: { marginEffect: round(marginEffect), momentumEffect: round(momentumEffect), strengthEffect: round(strengthEffect), playerEffect: round(playerEffect) },
    confidence: state.eventCount >= 5 ? 0.7 : 0.45,
    fallback: 'With limited data, treat the game as a coin-flip and play the percentages',
  }
}

const NEXT_PHASE = {
  [EVENT.SCORE]: { phase: 'restart', why: 'A score is followed by a restart' },
  [EVENT.PENALTY]: { phase: 'shot at goal or attacking lineout', why: 'A penalty offers points or territory' },
  [EVENT.TURNOVER]: { phase: 'transition — counter-attack or exit', why: 'Turnover ball invites quick transition' },
  [EVENT.SCRUM]: { phase: 'backline strike or pick-and-go', why: 'Scrum sets an attacking platform' },
  [EVENT.LINEOUT]: { phase: 'maul or first-phase strike', why: 'Lineout launches the next attack' },
  [EVENT.KICK]: { phase: 'aerial contest / kick return', why: 'A kick contests possession in the air' },
  [EVENT.CARD]: { phase: 'numerical-advantage attack', why: 'A card changes the numbers on the field' },
  [EVENT.KICKOFF]: { phase: 'receipt and exit', why: 'Kick-off receipt sets the opening exit' },
}

export function buildExpectedNextPhase(state) {
  const last = state.lastEvent
  const map = last ? NEXT_PHASE[last.type] : null
  if (!last || !map) {
    return { phase: 'open phase play', why: 'No strong signal from the last event', evidence: [], confidence: 0.4, fallback: 'Expect open phase play' }
  }
  return { phase: map.phase, why: map.why, evidence: last.eventId ? [last.eventId] : [], confidence: 0.6, fallback: 'Expect open phase play' }
}
