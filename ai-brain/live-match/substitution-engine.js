/**
 * AI Brain — Live Substitution Engine (M27)
 *
 * Live bench recommendations and replacement timing from fatigue, injuries,
 * game state and the pre-match Match Strategy bench plan. Deterministic.
 */

import { rec } from './match-state.js'

export function buildBenchRecommendations(state, fatigue, injury, context = {}) {
  const recs = []
  const strategy = context.matchStrategy ?? null
  const stratEvidence = (strategy?.benchPlan?.recommendations ?? []).flatMap(r => r.evidence ?? [])

  if (injury.count) {
    recs.push(rec('bench-injury', 'Make the injury-forced change now and keep shape',
      `${injury.count} live injury concern(s)`, injury.injuries.map(i => i.eventId),
      { priority: 'high', confidence: 0.7, fallback: 'Replace the injured player like-for-like' }))
  }
  if (fatigue.us >= 75) {
    recs.push(rec('bench-fatigue', 'Inject bench energy — front row and back row first',
      `Our fatigue index ${fatigue.us}/100`, [],
      { priority: 'high', confidence: 0.7, fallback: 'Use the bench to refresh tiring units' }))
  }
  if (state.phase === 'closing' && state.score.margin >= 0) {
    recs.push(rec('bench-closeout', 'Bring on game-closers (set-piece + game management) to protect the result',
      'Closing phase with a lead/level — secure the win', stratEvidence,
      { priority: 'medium', confidence: 0.65, fallback: 'Trust experienced heads to close the game' }))
  } else if (state.phase === 'closing' && state.score.margin < 0) {
    recs.push(rec('bench-chase', 'Bring on impact finishers to chase the game',
      'Closing phase behind — maximise attacking threat', stratEvidence,
      { priority: 'high', confidence: 0.7, fallback: 'Throw on your most dangerous attackers' }))
  }
  if (!recs.length) {
    recs.push(rec('bench-hold', 'Hold the bench — no trigger yet; keep impact players for the closing phase',
      'No fatigue/injury/closing trigger', [],
      { priority: 'low', confidence: 0.55, fallback: 'Save replacements until needed' }))
  }
  return { recommendations: recs, summary: recs[0].recommendation, confidence: 0.65, fallback: 'Default energy-management substitutions' }
}

export function buildReplacementTiming(state, fatigue, context = {}) {
  const recs = []
  const fullTime = state.fullTime
  const remaining = state.minutesRemaining
  const strategy = context.matchStrategy ?? null
  const planned = strategy?.replacementTiming?.recommendations ?? []

  // Surface the pre-planned windows still ahead of the clock, with evidence.
  for (const p of planned) {
    const m = String(p.recommendation).match(/around\s+(\d+)/)
    const minute = m ? Number(m[1]) : null
    if (minute != null && minute >= state.clock - 2) {
      recs.push(rec(`time-${p.id}`, `${p.recommendation} (in ~${Math.max(0, minute - state.clock)}')`,
        p.why ?? 'Pre-planned replacement window', p.evidence ?? [],
        { priority: p.priority ?? 'medium', confidence: 0.6, fallback: 'Use standard energy-management windows' }))
    }
  }
  if (fatigue.us >= 80 && remaining > 5) {
    recs.push(rec('time-now', 'Make the tactical change now rather than waiting for the window',
      `Fatigue index ${fatigue.us}/100 with ${remaining}' left`, [],
      { priority: 'high', confidence: 0.7, fallback: 'Replace tiring players early' }))
  }
  if (!recs.length) {
    recs.push(rec('time-window', `Next standard window around ${Math.round(fullTime * 0.62)}'`,
      'No live trigger — follow the energy-management plan', [],
      { priority: 'low', confidence: 0.55, fallback: 'Standard replacement windows' }))
  }
  return { recommendations: recs, summary: recs[0].recommendation, confidence: 0.6, fallback: 'Standard replacement windows' }
}
