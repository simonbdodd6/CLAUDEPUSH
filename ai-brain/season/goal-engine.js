/**
 * AI Brain — Season Goal Engine (M28)
 *
 * Target achievement: progress toward each season goal (points, position, wins,
 * development) versus the pace required. Deterministic, evidence-backed.
 */

import { clamp, round, round2, rec } from './season-state.js'

export function buildTargetAchievement(state, expectedPoints, expectedPosition, context = {}) {
  const goals = Array.isArray(context.goals) ? context.goals : []
  if (!goals.length) {
    return { targets: [], summary: 'No season goals set', confidence: 0.4, fallback: 'Set explicit season targets to track achievement' }
  }
  const targets = goals.map(g => {
    let status, detail, current, projected
    if (g.type === 'points') {
      current = state.points; projected = expectedPoints.value
      status = projected >= g.target ? 'on_track' : (projected >= g.target * 0.9 ? 'at_risk' : 'behind')
      detail = `On ${current} pts, projected ${projected} vs target ${g.target}`
    } else if (g.type === 'position') {
      current = state.position; projected = expectedPosition.value
      status = projected <= g.target ? 'on_track' : (projected <= g.target + 1 ? 'at_risk' : 'behind')
      detail = `Projected ${projected}${projected ? 'th' : ''} vs target top-${g.target}`
    } else if (g.type === 'wins') {
      current = state.record.wins
      const projWins = current + round(state.gamesRemaining * (state.record.wins / Math.max(1, state.gamesPlayed)))
      projected = projWins
      status = projWins >= g.target ? 'on_track' : (projWins >= g.target - 1 ? 'at_risk' : 'behind')
      detail = `${current} wins, projected ${projWins} vs target ${g.target}`
    } else {
      current = null; projected = null; status = 'tracking'; detail = g.label ?? 'Custom goal'
    }
    return {
      id: g.id ?? g.type, label: g.label ?? g.type, type: g.type, target: g.target,
      current, projected, status, detail,
      confidence: state.gamesPlayed >= 4 ? 0.6 : 0.4,
      fallback: 'Reassess as more results come in',
    }
  })

  const recs = targets.filter(t => t.status === 'behind').map(t =>
    rec(`goal-${t.id}`, `Season goal at risk: ${t.label} — adjust approach to get back on pace`, t.detail, [],
      { priority: 'high', confidence: 0.6, fallback: 'Review whether the target remains realistic' }))

  return {
    targets, recommendations: recs,
    summary: `${targets.filter(t => t.status === 'on_track').length}/${targets.length} goals on track`,
    confidence: 0.6, fallback: 'Set explicit season targets to track achievement',
  }
}
