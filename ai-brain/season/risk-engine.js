/**
 * AI Brain — Season Risk Engine (M28)
 *
 * Synthesises season-level risks from trajectory, projections, rotation, fatigue
 * and injury forecast. Each risk carries WHY + evidence + confidence + fallback.
 * Deterministic.
 */

import { TRAJECTORY, HEALTH, SEVERITY, rec } from './season-state.js'

export function buildSeasonRisks(bundle) {
  const { trajectory, projection, rotation, fatigue, injuryForecast } = bundle
  const risks = []

  if (projection.probabilities.relegation.value >= 50) {
    risks.push(rec('risk-relegation', 'Relegation is a live threat — prioritise points immediately',
      `Relegation probability ${projection.probabilities.relegation.value}%`, [],
      { priority: SEVERITY.HIGH, confidence: 0.7, fallback: 'Target winnable fixtures and secure bonus points' }))
  }
  if (trajectory.trajectory === TRAJECTORY.DECLINING) {
    risks.push(rec('risk-form', 'Form is declining — diagnose and intervene before it costs the season',
      `Pts/game fell from ${trajectory.earlyPpg} to ${trajectory.recentPpg}`, trajectory.evidence ?? [],
      { priority: SEVERITY.HIGH, confidence: 0.7, fallback: 'Review recent performances and refocus training' }))
  }
  if (rotation.status === HEALTH.AT_RISK || rotation.status === HEALTH.STRAINED) {
    risks.push(rec('risk-rotation', 'Squad rotation is strained — burnout/injury risk to over-used players',
      rotation.summary, [],
      { priority: rotation.status === HEALTH.AT_RISK ? SEVERITY.HIGH : SEVERITY.MEDIUM, confidence: 0.65, fallback: 'Build planned rest into the schedule' }))
  }
  for (const a of (fatigue.alerts ?? [])) risks.push({ ...a, id: `risk-${a.id}` })
  if (injuryForecast.level === 'high') {
    risks.push(rec('risk-injury', 'Injury risk is high for the coming block — manage load',
      injuryForecast.summary, [],
      { priority: SEVERITY.HIGH, confidence: 0.6, fallback: 'Apply recovery protocols and rotate load' }))
  }

  if (!risks.length) {
    risks.push(rec('risk-none', 'No major season risks flagged — stay the course',
      'Trajectory, projections, rotation and fatigue are within safe ranges', [],
      { priority: SEVERITY.LOW, confidence: 0.6, fallback: 'Maintain current approach' }))
  }
  return {
    risks,
    highCount: risks.filter(r => r.priority === SEVERITY.HIGH).length,
    summary: `${risks.filter(r => r.priority === SEVERITY.HIGH).length} high-priority season risk(s)`,
    confidence: 0.65,
    fallback: 'Monitor the season indicators',
  }
}
