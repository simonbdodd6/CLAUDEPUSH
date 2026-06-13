/**
 * AI Brain — Season Fatigue Tracker (M28)
 *
 * Builds workload graphs and fatigue curves across the season from the training
 * history (and match load), and flags weeks of accumulated fatigue. Deterministic.
 */

import { clamp, round, mean, isNum, SEVERITY, rec } from './season-state.js'

const HIGH_ROLLING_LOAD = 280   // 3-week rolling load that flags fatigue

export function buildFatigueCurves(state, context = {}) {
  const history = Array.isArray(context.trainingHistory) ? context.trainingHistory : []
  if (!history.length) {
    return {
      workload: [], curves: [], peakWeek: null, alerts: [],
      summary: 'No training history — fatigue not tracked',
      confidence: 0, fallback: 'Assume managed, periodised load',
    }
  }
  const weeks = history.slice().sort((a, b) => (a.week ?? 0) - (b.week ?? 0))
  const workload = weeks.map(w => ({ week: w.week ?? 0, load: isNum(w.loadUnits) ? w.loadUnits : 0, attendancePct: isNum(w.attendancePct) ? w.attendancePct : null }))

  // 3-week rolling load → fatigue index (0–100).
  const curves = workload.map((w, i) => {
    const window = workload.slice(Math.max(0, i - 2), i + 1).map(x => x.load)
    const rolling = window.reduce((a, b) => a + b, 0)
    const fatigueIndex = clamp(round((rolling / HIGH_ROLLING_LOAD) * 100), 0, 100)
    return { week: w.week, rollingLoad: rolling, fatigueIndex }
  })

  const peak = curves.slice().sort((a, b) => b.fatigueIndex - a.fatigueIndex)[0]
  const alerts = []
  const hotWeeks = curves.filter(c => c.fatigueIndex >= 85)
  if (hotWeeks.length) {
    alerts.push(rec('fat-load', `Accumulated load is high in week(s) ${hotWeeks.map(c => c.week).join(', ')} — schedule a deload`,
      `${hotWeeks.length} week(s) above the safe rolling-load threshold`, [],
      { priority: SEVERITY.HIGH, confidence: 0.7, fallback: 'Insert a recovery week to manage accumulated fatigue' }))
  }

  return {
    workload, curves, peakWeek: peak ? peak.week : null, alerts,
    summary: `Peak fatigue index ${peak ? peak.fatigueIndex : 0}/100 in week ${peak ? peak.week : '—'}`,
    confidence: weeks.length >= 4 ? 0.65 : 0.45,
    fallback: 'Assume managed, periodised load',
  }
}
