/**
 * AI Brain — Season Fixture Engine (M28)
 *
 * Analyses the remaining run-in: per-fixture difficulty (opponent strength +
 * venue) and the overall difficulty of what's left. Deterministic.
 */

import { clamp, round, mean } from './season-state.js'

const IMPORTANCE_DIFF = { low: 40, normal: 50, high: 65, cup_final: 75 }

/** Difficulty 0–100 of a single upcoming fixture. */
function fixtureDifficulty(f, context) {
  const ratings = context.opponentRatings ?? {}
  let base = null
  if (typeof ratings[f.opponentId] === 'number') base = ratings[f.opponentId]
  else if (f.opponentRating != null) base = f.opponentRating
  else if (f.importance) base = IMPORTANCE_DIFF[f.importance] ?? 50
  else base = 50
  const venueAdj = f.venue === 'away' ? 6 : f.venue === 'home' ? -4 : 0
  return clamp(round(base + venueAdj), 0, 100)
}

export function buildFixtureAnalysis(state, context = {}) {
  const remaining = state.upcoming.map(f => ({
    fixtureId: f.fixtureId, round: f.round ?? null, opponentId: f.opponentId ?? null,
    venue: f.venue ?? null, difficulty: fixtureDifficulty(f, context),
  }))
  const diffs = remaining.map(r => r.difficulty)
  const avgDifficulty = remaining.length ? round(mean(diffs)) : null
  const hardest = remaining.slice().sort((a, b) => b.difficulty - a.difficulty).slice(0, 3)
  const easiest = remaining.slice().sort((a, b) => a.difficulty - b.difficulty).slice(0, 3)

  return {
    remaining,
    count: remaining.length,
    avgDifficulty,
    hardestRun: hardest,
    easiestRun: easiest,
    summary: avgDifficulty == null ? 'No remaining fixtures'
      : `${remaining.length} games left, avg difficulty ${avgDifficulty}/100`,
    confidence: remaining.length ? 0.65 : 0.4,
    fallback: 'Assume average-difficulty run-in',
  }
}
