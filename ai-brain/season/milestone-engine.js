/**
 * AI Brain — Season Milestone Engine (M28)
 *
 * Detects season milestones and alerts: halfway point, win milestones, playoff
 * qualification status, mathematical safety, title race. Deterministic.
 */

import { rec } from './season-state.js'

export function buildMilestones(state, projection) {
  const alerts = []
  const add = (id, text, why, priority = 'medium', evidence = []) =>
    alerts.push(rec(id, text, why, evidence, { priority, confidence: 0.7, fallback: 'Track milestone as the season progresses' }))

  // Halfway point.
  if (state.totalGames && state.gamesPlayed === Math.floor(state.totalGames / 2)) {
    add('ms-halfway', `Halfway point reached — ${state.points} points from ${state.gamesPlayed} games`, 'Season midpoint is a natural review marker', 'low')
  }

  // Win milestones.
  for (const m of [5, 10, 15, 20]) {
    if (state.record.wins === m) add(`ms-wins-${m}`, `${m} wins reached`, `${m}th win of the season`, 'low')
  }

  // Playoff race.
  if (projection.probabilities.playoff.value >= 80) add('ms-playoff-likely', 'Playoffs within reach — qualification looking likely', `Playoff probability ${projection.probabilities.playoff.value}%`, 'medium')
  if (projection.probabilities.championship.value >= 50) add('ms-title-race', 'In the title race', `Championship probability ${projection.probabilities.championship.value}%`, 'high')

  // Relegation danger / safety.
  if (projection.probabilities.relegation.value >= 60) add('ms-releg-danger', 'Relegation danger — every point matters now', `Relegation probability ${projection.probabilities.relegation.value}%`, 'high')
  else if (projection.probabilities.relegation.value <= 5 && state.seasonProgress >= 0.6) add('ms-safe', 'All but mathematically safe from relegation', `Relegation probability ${projection.probabilities.relegation.value}%`, 'low')

  return {
    alerts,
    count: alerts.length,
    summary: alerts.length ? `${alerts.length} milestone alert(s)` : 'No milestones this update',
    confidence: 0.7,
    fallback: 'Milestones populate as the season progresses',
  }
}
