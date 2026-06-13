/**
 * AI Brain — Season Coach Impact (M28)
 *
 * Estimates the coach's measurable impact this season from results trajectory,
 * player development gains and training engagement (attendance). Deterministic,
 * evidence-backed.
 */

import { clamp, round, round2, mean, isNum } from './season-state.js'

export function buildCoachImpact(state, trajectory, development, context = {}) {
  const drivers = {}
  const evidence = []

  // 1. Results trajectory (improvement in pts/game across the season).
  const trajComponent = clamp((trajectory.delta ?? 0) * 20, -30, 30)   // ±1.5 ppg ⇒ ±30
  drivers.trajectory = round(trajComponent)
  if (trajectory.evidence) evidence.push(...trajectory.evidence)

  // 2. Player development gains.
  const curves = development.curves ?? []
  const devGain = curves.length ? mean(curves.map(c => c.delta)) : 0
  const devComponent = clamp(devGain * 6, -20, 20)
  drivers.development = round(devComponent)
  for (const c of curves) evidence.push(...(c.evidence ?? []))

  // 3. Engagement (training attendance).
  const history = Array.isArray(context.trainingHistory) ? context.trainingHistory : []
  const att = history.map(w => w.attendancePct).filter(isNum)
  const attMean = att.length ? mean(att) : null
  const engComponent = attMean != null ? clamp((attMean - 75) / 2.5, -15, 15) : 0
  drivers.engagement = round(engComponent)

  const score = clamp(round(50 + trajComponent + devComponent + engComponent), 0, 100)
  const band = score >= 65 ? 'high' : score <= 40 ? 'low' : 'moderate'

  return {
    score, band, drivers,
    attendanceMean: attMean != null ? round2(attMean) : null,
    summary: `Coach impact: ${band} (${score}/100) — ${trajectory.trajectory} results${attMean != null ? `, ${round(attMean)}% attendance` : ''}`,
    evidence: evidence.filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 10),
    confidence: state.gamesPlayed >= 4 ? 0.6 : 0.4,
    fallback: 'Impact assessed qualitatively until more data accrues',
  }
}
