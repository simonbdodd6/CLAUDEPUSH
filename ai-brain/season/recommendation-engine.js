/**
 * AI Brain — Season Priority Recommendations (M28)
 *
 * Synthesises the highest-leverage season actions from risks, goals, rotation,
 * development and the projection picture, ranked by priority. Deterministic.
 */

import { rec } from './season-state.js'

const RANK = { high: 0, medium: 1, low: 2 }

export function buildPriorityRecommendations(bundle) {
  const { risks, goals, rotation, development, projection, fatigue, injuryForecast } = bundle
  const pool = []

  // Risks first (already prioritised + evidence-backed; risks already fold in
  // fatigue alerts, so we do not re-add them here).
  for (const r of risks.risks) if (r.priority !== 'low') pool.push(r)
  // Goals behind pace.
  for (const r of (goals.recommendations ?? [])) pool.push(r)
  // Rotation / injury actions not already surfaced as risks.
  for (const r of (rotation.recommendations ?? [])) pool.push(r)
  for (const r of (injuryForecast.recommendations ?? [])) pool.push(r)
  // Development gaps.
  for (const r of (development.targets ?? []).filter(t => t.priority === 'high')) pool.push(r)

  // Opportunity: strong playoff/title position → push for it.
  if (projection.probabilities.championship.value >= 40) {
    pool.push(rec('rec-title', 'Push for the title — protect your best XV for the run-in and target bonus points',
      `Championship probability ${projection.probabilities.championship.value}%`, [],
      { priority: 'high', confidence: 0.65, fallback: 'Maximise points in winnable games' }))
  } else if (projection.probabilities.playoff.value >= 60) {
    pool.push(rec('rec-playoff', 'Secure a playoff spot — prioritise points and squad availability for key games',
      `Playoff probability ${projection.probabilities.playoff.value}%`, [],
      { priority: 'medium', confidence: 0.6, fallback: 'Focus on the games that decide the top four' }))
  }

  const seenId = new Set(), seenText = new Set()
  const recommendations = pool
    .filter(r => r && !seenId.has(r.id) && !seenText.has(r.recommendation) && (seenId.add(r.id), seenText.add(r.recommendation), true))
    .sort((a, b) => (RANK[a.priority] - RANK[b.priority]))
    .slice(0, 6)

  if (!recommendations.length) {
    recommendations.push(rec('rec-stay', 'Stay the course — consolidate strengths and keep developing the squad',
      'No urgent issues detected', [], { priority: 'low', confidence: 0.55, fallback: 'Maintain current approach' }))
  }

  return {
    recommendations,
    summary: recommendations[0].recommendation,
    confidence: 0.7,
    fallback: 'Follow the season plan',
  }
}
