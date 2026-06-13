/**
 * AI Brain — Season Performance Engine (M28)
 *
 * Player improvement (top movers from the development curves) and team
 * performance metrics (attack/defence trend across the season). Deterministic.
 */

import { round2, mean, leaguePoints } from './season-state.js'

export function buildPerformance(state, development) {
  const curves = development.curves ?? []
  const improvers = curves.filter(c => c.direction === 'improving')
    .sort((a, b) => b.delta - a.delta).slice(0, 5)
    .map(c => ({ playerId: c.playerId, name: c.name, delta: c.delta, latest: c.latest, evidence: c.evidence }))
  const decliners = curves.filter(c => c.direction === 'declining')
    .sort((a, b) => a.delta - b.delta).slice(0, 3)
    .map(c => ({ playerId: c.playerId, name: c.name, delta: c.delta, latest: c.latest, evidence: c.evidence }))

  // Team attack/defence trend: early vs recent points for/against.
  const played = state.played
  let attackTrend = null, defenceTrend = null
  if (played.length >= 4) {
    const half = Math.floor(played.length / 2)
    const ePF = mean(played.slice(0, half).map(f => f.result?.pointsFor ?? 0))
    const rPF = mean(played.slice(half).map(f => f.result?.pointsFor ?? 0))
    const ePA = mean(played.slice(0, half).map(f => f.result?.pointsAgainst ?? 0))
    const rPA = mean(played.slice(half).map(f => f.result?.pointsAgainst ?? 0))
    attackTrend = rPF - ePF >= 2 ? 'improving' : rPF - ePF <= -2 ? 'declining' : 'steady'
    defenceTrend = rPA - ePA <= -2 ? 'improving' : rPA - ePA >= 2 ? 'declining' : 'steady'
  }

  return {
    improvement: improvers,
    declining: decliners,
    teamMetrics: {
      pointsForPerGame: state.gamesPlayed ? round2(state.pointsFor / state.gamesPlayed) : null,
      pointsAgainstPerGame: state.gamesPlayed ? round2(state.pointsAgainst / state.gamesPlayed) : null,
      attackTrend, defenceTrend,
    },
    summary: improvers.length ? `Top improver: ${improvers[0].name ?? improvers[0].playerId} (+${improvers[0].delta})` : 'No standout improvement data',
    confidence: curves.length ? 0.6 : 0.4,
    fallback: 'Use coach assessment of player form',
  }
}
