/**
 * AI Brain — Season Projection Engine (M28)
 *
 * Closed-form, deterministic projections: expected points total, expected
 * end-of-season position, and championship / playoff / relegation probabilities.
 * Early in the season, probabilities regress toward a neutral baseline; as games
 * accumulate they converge on the position implied by the projected points.
 */

import { clamp, round, round2 } from './season-state.js'

/** Expected points: current + remaining games × difficulty-adjusted pace. */
export function buildExpectedPoints(state, fixtureAnalysis) {
  const maxPerGame = state.league.pointsForWin + 2
  const ppg = state.pointsPerGame
  const avgDiff = fixtureAnalysis?.avgDifficulty ?? 50
  // Harder run-in (diff > 50) lowers the pace; easier raises it.
  const difficultyFactor = clamp(1 - (avgDiff - 50) / 100, 0.6, 1.4)
  const projPpg = clamp(ppg * difficultyFactor, 0, maxPerGame)
  const remainingPoints = round(state.gamesRemaining * projPpg)
  const expected = state.points + remainingPoints
  return {
    value: expected,
    current: state.points, projectedRemaining: remainingPoints,
    projectedPpg: round2(projPpg),
    summary: `Projected to finish on ~${expected} points (${state.points} now + ~${remainingPoints} from ${state.gamesRemaining} games)`,
    confidence: state.gamesPlayed >= 3 ? 0.65 : 0.4,
    fallback: 'Project current pace across remaining games',
  }
}

/** Expected position from projected points (or supplied standings). */
export function buildExpectedPosition(state, expectedPoints) {
  const teams = state.league.teams
  const standings = Array.isArray(state.league.standings) ? state.league.standings : null
  let position
  if (standings && standings.length) {
    const better = standings.filter(s => (s.projectedPoints ?? s.points ?? 0) > expectedPoints.value).length
    position = clamp(better + 1, 1, teams)
  } else {
    const expPpg = state.totalGames ? expectedPoints.value / state.totalGames : 0
    // ~1 pt/game ⇒ bottom, ~3.6 pt/game ⇒ top.
    const posFrac = clamp(1 - (expPpg - 1) / 2.6, 0, 1)
    position = clamp(round(1 + posFrac * (teams - 1)), 1, teams)
  }
  return {
    value: position, of: teams,
    summary: `Projected to finish ~${position}${ordinal(position)} of ${teams}`,
    confidence: state.gamesPlayed >= 4 ? 0.6 : 0.4,
    fallback: 'Estimate position from projected points pace',
  }
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

/** Championship / playoff / relegation probabilities (0–100 for us). */
export function buildProbabilities(state, expectedPosition) {
  const { teams, playoffSpots, relegationSpots } = state.league
  const pos = expectedPosition.value
  const certainty = clamp(state.totalGames ? state.gamesPlayed / state.totalGames : 0, 0, 1)

  const champBase = pos === 1 ? 70 : pos === 2 ? 28 : pos === 3 ? 12 : Math.max(0, 6 - (pos - 3) * 2)
  const playoffBase = pos <= playoffSpots ? clamp(92 - (pos - 1) * 12, 30, 95) : clamp(40 - (pos - playoffSpots) * 14, 0, 40)
  const relegLine = teams - relegationSpots
  const relegBase = pos > relegLine ? clamp(60 + (pos - relegLine) * 15, 40, 95) : clamp(22 - (relegLine - pos) * 7, 0, 22)

  const neutralChamp = 100 / teams
  const neutralPlayoff = (100 * playoffSpots) / teams
  const neutralReleg = (100 * relegationSpots) / teams

  const blend = (base, neutral) => round(clamp(base * certainty + neutral * (1 - certainty), 0, 100))

  return {
    championship: { value: blend(champBase, neutralChamp), summary: `~${blend(champBase, neutralChamp)}% to win the league`, confidence: round2(0.4 + certainty * 0.4), fallback: 'Baseline title odds for league size' },
    playoff: { value: blend(playoffBase, neutralPlayoff), summary: `~${blend(playoffBase, neutralPlayoff)}% to make the playoffs`, confidence: round2(0.4 + certainty * 0.4), fallback: 'Baseline playoff odds for league size' },
    relegation: { value: blend(relegBase, neutralReleg), summary: `~${blend(relegBase, neutralReleg)}% relegation risk`, confidence: round2(0.4 + certainty * 0.4), fallback: 'Baseline relegation odds for league size' },
  }
}
