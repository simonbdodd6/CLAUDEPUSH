/**
 * AI Brain — Live Discipline Engine (M27)
 *
 * Tracks our penalty count and cards, and rates the live risk of a sin-bin —
 * repeated penalties in a short window or in our own 22 escalate the risk.
 * Deterministic.
 */

import { EVENT, ZONE, rec } from './match-state.js'

const RISK_WINDOW = 10

export function buildDisciplineRisk(state, events) {
  const clock = state.clock
  const ourPenalties = events.filter(e => e.type === EVENT.PENALTY && e.team === 'us')
  const recent = ourPenalties.filter(e => e.minute >= clock - RISK_WINDOW)
  const ownHalf = recent.filter(e => e.zone === ZONE.OWN_22 || e.zone === ZONE.OWN_HALF)
  const yellow = state.cards.us.filter(c => c.cardType === 'yellow').length
  const red = state.cards.us.filter(c => c.cardType === 'red').length

  // Risk score from recent penalties (weighted in our half) + existing cards.
  const score = recent.length * 20 + ownHalf.length * 10 + yellow * 15 + red * 30
  const level = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low'
  const evidence = recent.map(e => e.eventId).filter(Boolean).slice(-8)

  const recs = []
  if (level === 'high') {
    recs.push(rec('disc-reset', 'Reset discipline immediately — concede no further breakdown/offside penalties',
      `${recent.length} penalty(ies) in the last ${RISK_WINDOW}'${ownHalf.length ? `, ${ownHalf.length} in our half` : ''} — a card is likely next`,
      evidence, { priority: 'high', confidence: 0.75, fallback: 'Brief the captain to talk to the referee and slow the penalty count' }))
  } else if (level === 'medium') {
    recs.push(rec('disc-watch', 'Tidy up at the breakdown — referee patience is running out',
      `${recent.length} recent penalty(ies)`, evidence,
      { priority: 'medium', confidence: 0.6, fallback: 'Keep the penalty count down' }))
  }

  return {
    level, score,
    recentPenalties: recent.length, ownHalfPenalties: ownHalf.length, yellowCards: yellow, redCards: red,
    summary: `Discipline risk: ${level}`,
    recommendations: recs,
    evidence,
    confidence: ourPenalties.length >= 1 ? 0.7 : 0.4,
    fallback: 'No penalty data — brief standard breakdown discipline',
  }
}
