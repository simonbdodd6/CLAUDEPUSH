// ─────────────────────────────────────────────────────────────────────────────
// Opponent Intelligence mapper (Experience Adapter, M37)
//
// Maps the façade envelope's `data` (the opponent profile from
// AI.getOpponentProfile) into the presentation-only `opponent` slice of a
// VisualModel. PURE field selection guarded against malformed input — it picks
// values the engine already derived; it performs NO calculation, ranking,
// reasoning or recommendations.
//
// The profile shape (read-only reference, ai-brain/opponent):
//   { opponentName, maturity (0..1), summary,
//     strengths:[{key,label,score (0..100),confidence (0..1)}],
//     weaknesses:[{key,label,score,confidence}],
//     threats:[{label,severity}], opportunities:[{label}] }
// ─────────────────────────────────────────────────────────────────────────────

import { isObj, num, str, arr, oneOf } from '../shape-guards.js'

const SEVERITIES = ['high', 'medium', 'low']

function mapTrait(t, i) {
  const o = isObj(t) ? t : {}
  return {
    key: str(o.key, `t${i}`),
    label: str(o.label, str(o.key, `t${i}`)),
    score: num(o.score, 0, 0, 100),
    confidence: num(o.confidence, 0, 0, 1),
  }
}

/**
 * @param {any} data       façade envelope.data (opponent profile)
 * @param {object} fallback the placeholder opponent slice (defaults)
 * @returns {object}        a 'live' opponent slice, view-safe
 */
export function mapOpponent(data, fallback) {
  const fb = isObj(fallback) ? fallback : {}
  if (!isObj(data)) return { ...fb }

  const strengths = arr(data.strengths).map(mapTrait)
  const weaknesses = arr(data.weaknesses).map(mapTrait)
  const threats = arr(data.threats)
    .map(t => ({ label: str(isObj(t) ? t.label : '', ''), severity: oneOf(isObj(t) ? t.severity : null, SEVERITIES, undefined) }))
    .filter(t => t.label)
  const opportunities = arr(data.opportunities)
    .map(o => ({ label: str(isObj(o) ? o.label : '', '') }))
    .filter(o => o.label)

  return {
    state: 'live',
    name: str(data.opponentName, str(fb.name, '')),
    summary: str(data.summary, str(fb.summary, '')),
    maturity: num(data.maturity, num(fb.maturity, 0, 0, 1), 0, 1),
    strengths: strengths.length ? strengths : arr(fb.strengths),
    weaknesses: weaknesses.length ? weaknesses : arr(fb.weaknesses),
    threats: threats.length ? threats : arr(fb.threats),
    opportunities: opportunities.length ? opportunities : arr(fb.opportunities),
  }
}
