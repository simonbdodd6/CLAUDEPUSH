/**
 * AI Brain — Season Timeline Engine (M28)
 *
 * Chronological season timeline: results and milestone markers, in round order.
 * Deterministic.
 */

import { leaguePoints } from './season-state.js'

export function buildSeasonTimeline(state, milestones) {
  const entries = []
  for (const f of state.played) {
    entries.push({
      round: f.round ?? null,
      type: 'result',
      fixtureId: f.fixtureId,
      opponentId: f.opponentId ?? null,
      outcome: f.result?.outcome ?? f.result?.result ?? null,
      score: f.result ? `${f.result.pointsFor ?? 0}-${f.result.pointsAgainst ?? 0}` : null,
      leaguePoints: leaguePoints(f, state.league),
      evidence: f.fixtureId ? [f.fixtureId] : [],
    })
  }
  for (const m of (milestones.alerts ?? [])) {
    entries.push({ round: state.gamesPlayed, type: 'milestone', description: m.recommendation, evidence: m.evidence ?? [] })
  }
  entries.sort((a, b) => (a.round ?? 0) - (b.round ?? 0))
  return {
    entries,
    count: entries.length,
    summary: `${state.played.length} results, ${milestones.alerts?.length ?? 0} milestone(s)`,
    confidence: 0.8,
    fallback: 'Timeline builds as results are recorded',
  }
}
