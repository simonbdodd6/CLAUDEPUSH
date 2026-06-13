/**
 * AI Brain — Live Injury Engine (M27)
 *
 * Tracks injury events and assesses their impact on our shape, drawing on the
 * Selection Assistant's coverage picture to flag positions now exposed.
 * Deterministic.
 */

import { rec } from './match-state.js'

export function buildInjuryImpact(state, context = {}) {
  const ourInjuries = state.injuries.filter(i => i.team === 'us')
  const sel = context.selection ?? null
  const recs = []

  for (const inj of ourInjuries) {
    recs.push(rec(`inj-${inj.eventId}`, `Assess ${inj.playerId ?? 'player'} (injured ${inj.minute}') — ready replacement or reshuffle`,
      'A live injury can force an unplanned change', [inj.eventId],
      { priority: 'high', confidence: 0.65, fallback: 'Have the next cover ready and check HIA protocol' }))
  }

  // Coverage-aware warning: front row exposed + an injury ⇒ uncontested-scrum risk.
  if (sel?.frontRowCoverage?.status === 'exposed' && ourInjuries.length) {
    recs.push(rec('inj-frontrow', 'Front-row cover is thin — protect against uncontested scrums',
      'Selection Assistant flagged exposed front-row coverage and we have an injury', [],
      { priority: 'high', confidence: 0.7, fallback: 'Prioritise a like-for-like front-row replacement' }))
  }

  return {
    injuries: ourInjuries,
    count: ourInjuries.length,
    recommendations: recs,
    summary: ourInjuries.length ? `${ourInjuries.length} injury concern(s) to manage` : 'No injuries reported',
    confidence: 0.6,
    fallback: 'Monitor for injuries and keep cover warmed up',
  }
}
