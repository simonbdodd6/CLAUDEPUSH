/**
 * AI Brain — Opponent Discipline Profile (M24)
 *
 * Derives discipline from penalty_event observations: card rate, where and when
 * they offend, and their most common penalty reason. A HIGH score means clean /
 * disciplined; a LOW score is a clear opportunity (penalty-prone).
 *
 * Pure + deterministic.
 */

import { OPP_EVENT, DIMENSION, DIMENSION_META } from './opponent-types.js'
import { buildEntry, round2, clamp, num } from './trend-engine.js'

const metaOf = (key) => ({ higherIsBetter: DIMENSION_META[key].higherIsBetter, descriptive: DIMENSION_META[key].descriptive })

function topReason(rel) {
  const counts = {}
  for (const o of rel) {
    const r = o.eventData?.reason
    if (r) counts[r] = (counts[r] ?? 0) + 1
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  return entries.length ? entries[0][0] : null
}

export function deriveDisciplineProfile(sorted, total) {
  const key = DIMENSION.DISCIPLINE_PROFILE
  const rel = sorted.filter(o => o.eventType === OPP_EVENT.PENALTY_EVENT)
  const n = rel.length
  if (!n) {
    return buildEntry({ key, label: DIMENSION_META[key].label, score: null, relevant: [], totalObs: total, meta: metaOf(key) })
  }
  const cards = rel.filter(o => o.eventData?.card === 'yellow' || o.eventData?.card === 'red').length
  const cardRate = cards / n
  const ownHalf = rel.filter(o => ['own22', 'own_half'].includes(o.eventData?.area)).length
  const ownHalfRate = ownHalf / n
  const secondHalf = rel.filter(o => num(o.eventData?.half) === 2).length
  const secondHalfRate = secondHalf / n
  const matchIds = new Set(rel.map(o => o.matchId ?? o.eventData?.matchId).filter(Boolean))
  const penaltiesPerMatch = matchIds.size ? round2(n / matchIds.size) : null

  // Higher = more disciplined. Penalised by cards and own-half (kickable) penalties.
  const score = clamp(100 - cardRate * 70 - ownHalfRate * 50, 0, 100)
  const summary = `${score >= 65 ? 'disciplined' : score <= 40 ? 'penalty-prone' : 'occasionally loose'}; mostly "${topReason(rel)}"${penaltiesPerMatch != null ? `, ~${penaltiesPerMatch}/match` : ''}`
  return buildEntry({
    key, label: DIMENSION_META[key].label, score,
    metrics: { penaltyCount: n, penaltiesPerMatch, cardRate: round2(cardRate), ownHalfRate: round2(ownHalfRate), secondHalfRate: round2(secondHalfRate), topReason: topReason(rel) },
    summary, relevant: rel, valueOf: o => (o.eventData?.card ? 0 : 1), totalObs: total, meta: metaOf(key),
  })
}
