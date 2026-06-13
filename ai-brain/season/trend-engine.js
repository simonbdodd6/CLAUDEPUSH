/**
 * AI Brain — Season Trend Engine (M28)
 *
 * Season trajectory (early-season form vs recent form) and league trend (points
 * pace vs a target / mid-table baseline). Deterministic.
 */

import { TRAJECTORY, leaguePoints, round2, mean, clamp } from './season-state.js'

export function buildTrajectory(state) {
  const played = state.played
  if (played.length < 4) {
    return { trajectory: TRAJECTORY.STEADY, earlyPpg: state.pointsPerGame, recentPpg: state.pointsPerGame, delta: 0,
      series: played.map((f, i) => ({ round: f.round ?? i + 1, points: leaguePoints(f, state.league) })),
      summary: 'Too few games to establish a trajectory', confidence: 0.4, fallback: 'Assume a steady trajectory' }
  }
  const half = Math.floor(played.length / 2)
  const early = played.slice(0, half)
  const recent = played.slice(half)
  const earlyPpg = round2(mean(early.map(f => leaguePoints(f, state.league))))
  const recentPpg = round2(mean(recent.map(f => leaguePoints(f, state.league))))
  const delta = round2(recentPpg - earlyPpg)
  const trajectory = delta >= 0.4 ? TRAJECTORY.IMPROVING : delta <= -0.4 ? TRAJECTORY.DECLINING : TRAJECTORY.STEADY

  return {
    trajectory, earlyPpg, recentPpg, delta,
    series: played.map((f, i) => ({ round: f.round ?? i + 1, points: leaguePoints(f, state.league) })),
    evidence: recent.map(f => f.fixtureId).filter(Boolean).slice(-5),
    summary: `Form is ${trajectory} (early ${earlyPpg} → recent ${recentPpg} pts/game)`,
    confidence: 0.7,
    fallback: 'Assume a steady trajectory',
  }
}

export function buildLeagueTrend(state, context = {}) {
  const target = context.goals?.find(g => g.type === 'points')?.target ?? null
  const targetPpg = target != null && state.totalGames ? target / state.totalGames : null
  const pace = state.pointsPerGame
  let status = 'on_track'
  if (targetPpg != null) status = pace >= targetPpg + 0.2 ? 'ahead' : pace <= targetPpg - 0.2 ? 'behind' : 'on_track'

  // Position movement, if a history of positions is supplied.
  const posHistory = Array.isArray(context.league?.positionHistory) ? context.league.positionHistory : null
  let positionTrend = null
  if (posHistory && posHistory.length >= 2) {
    const d = posHistory[posHistory.length - 1] - posHistory[0]   // lower position number = better
    positionTrend = d < 0 ? 'climbing' : d > 0 ? 'slipping' : 'stable'
  }

  return {
    pointsPerGame: pace, targetPpg: targetPpg != null ? round2(targetPpg) : null, status,
    positionTrend,
    summary: targetPpg != null ? `Points pace ${pace}/game is ${status} the target (${round2(targetPpg)}/game)` : `Points pace ${pace}/game`,
    confidence: state.gamesPlayed >= 3 ? 0.65 : 0.4,
    fallback: 'No target set — pace assessed against mid-table',
  }
}
