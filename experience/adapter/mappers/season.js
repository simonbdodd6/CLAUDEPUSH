// ─────────────────────────────────────────────────────────────────────────────
// Season Intelligence mapper (Experience Adapter, M36)
//
// Maps the façade envelope's `data` (the season profile from
// AI.getSeasonIntelligence) into the presentation-only `season` slice of a
// VisualModel. PURE field selection guarded against malformed input — it picks
// values the engine already computed; it performs NO calculation (no cumulative
// sums, no projection, no ranking), no reasoning, no recommendations.
//
// The profile shape (read-only reference, ai-brain/season):
//   { seasonTrajectory: { series: [{ round, points }] },
//     expectedPointsTotal: { value }, expectedEndPosition: { value },
//     championshipProbability: { value }, playoffProbability: { value },
//     relegationProbability: { value }, ... }
// ─────────────────────────────────────────────────────────────────────────────

import { isObj, num, arr } from '../shape-guards.js'

const valueOf = (o, fb) => num(isObj(o) ? o.value : undefined, fb)

/**
 * @param {any} data       façade envelope.data (season profile)
 * @param {object} fallback the placeholder season slice (defaults)
 * @returns {object}        a 'live' season slice, view-safe
 */
export function mapSeason(data, fallback) {
  const fb = isObj(fallback) ? fallback : {}
  if (!isObj(data)) return { ...fb }

  const series = isObj(data.seasonTrajectory) ? arr(data.seasonTrajectory.series) : []
  const trajectory = series.map((p, i) => ({
    round: num(isObj(p) ? p.round : undefined, i + 1),
    value: num(isObj(p) ? p.points : undefined, 0),
  }))

  const fbProj = isObj(fb.projection) ? fb.projection : {}
  const fbProb = isObj(fb.probabilities) ? fb.probabilities : {}

  return {
    state: 'live',
    trajectory: trajectory.length ? trajectory : arr(fb.trajectory),
    projection: {
      points: valueOf(data.expectedPointsTotal, num(fbProj.points, 0)),
      position: valueOf(data.expectedEndPosition, num(fbProj.position, 0)),
    },
    probabilities: {
      title: num(valueOf(data.championshipProbability, num(fbProb.title, 0)), 0, 0, 100),
      playoff: num(valueOf(data.playoffProbability, num(fbProb.playoff, 0)), 0, 0, 100),
      relegation: num(valueOf(data.relegationProbability, num(fbProb.relegation, 0)), 0, 0, 100),
    },
  }
}
