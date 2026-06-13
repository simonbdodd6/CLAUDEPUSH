/**
 * AI Brain — Live Momentum Engine (M27)
 *
 * Momentum score (−100..+100, + = us) from a recency-weighted window of recent
 * events. Deterministic — recency is measured by event-minute distance to the
 * clock, never wall-clock. Every momentum read carries its evidence chain.
 */

import { SCORE_POINTS, ZONE, EVENT, clamp, round, isNum } from './match-state.js'

const MOMENTUM_WINDOW = 10

function eventValue(e) {
  switch (e.type) {
    case EVENT.SCORE: {
      const pts = isNum(e.data?.points) ? e.data.points : (SCORE_POINTS[e.data?.kind] ?? 0)
      return (e.team === 'us' ? 1 : -1) * pts * 3
    }
    case EVENT.TURNOVER: return e.team === 'us' ? 6 : -6
    case EVENT.PENALTY:  return e.team === 'them' ? 5 : -5    // team = offender
    case EVENT.CARD:     return e.team === 'them' ? 18 : -18  // team = carded
    case EVENT.SCRUM:
    case EVENT.LINEOUT:  return e.data?.won ? (e.team === 'us' ? 2 : -2) : 0
    case EVENT.TERRITORY:
      if (e.zone === ZONE.OPP_22) return e.team === 'us' ? 4 : 0
      if (e.zone === ZONE.OWN_22) return e.team === 'them' ? -4 : 0
      return 0
    default: return 0
  }
}

export function buildMomentum(state, events) {
  const clock = state.clock
  const recent = events.filter(e => e.minute >= clock - MOMENTUM_WINDOW)
  let raw = 0
  const evidence = []
  for (const e of recent) {
    const recency = 1 - Math.min(1, (clock - e.minute) / MOMENTUM_WINDOW)
    const v = eventValue(e) * (0.4 + 0.6 * recency)
    raw += v
    if (Math.abs(v) >= 6 && e.eventId) evidence.push(e.eventId)
  }
  const score = clamp(round(raw), -100, 100)
  const side = score > 15 ? 'us' : score < -15 ? 'them' : 'balanced'
  return {
    score, side, window: MOMENTUM_WINDOW,
    summary: side === 'us' ? 'Momentum is with us' : side === 'them' ? 'Momentum is against us' : 'Momentum is balanced',
    evidence: evidence.slice(-8),
    confidence: recent.length >= 4 ? 0.75 : recent.length >= 1 ? 0.5 : 0,
    fallback: 'Assume balanced momentum until more events arrive',
  }
}
