/**
 * AI Brain — Opponent Kick Profile (M24)
 *
 * Derives the kicking game from kick_event observations: kick mix and
 * reclaim/effectiveness. Pure + deterministic.
 */

import { OPP_EVENT, DIMENSION, DIMENSION_META } from './opponent-types.js'
import { buildEntry, round2 } from './trend-engine.js'

const metaOf = (key) => ({ higherIsBetter: DIMENSION_META[key].higherIsBetter, descriptive: DIMENSION_META[key].descriptive })

/** kickProfile — kick mix + reclaim effectiveness. */
export function deriveKickProfile(sorted, total) {
  const key = DIMENSION.KICK_PROFILE
  const rel = sorted.filter(o => o.eventType === OPP_EVENT.KICK_EVENT)
  const n = rel.length
  const rate = (type) => (n ? rel.filter(o => o.eventData?.type === type).length / n : 0)
  const box = rate('box')
  const contestable = rate('contestable')
  const territorial = rate('territorial')
  const clearance = rate('clearance')
  const cross = rate('cross')
  const reclaimed = rel.filter(o => o.eventData?.reclaimed === true).length
  const reclaimRate = n ? reclaimed / n : 0
  const score = reclaimRate * 100
  const dominantType = [['box', box], ['contestable', contestable], ['territorial', territorial], ['clearance', clearance], ['cross', cross]]
    .sort((a, b) => b[1] - a[1])[0]
  const summary = n
    ? `${dominantType && dominantType[1] > 0 ? dominantType[0] + '-kick led' : 'mixed'} game, ${reclaimRate >= 0.4 ? 'reclaims well' : 'low reclaim'} (${round2(reclaimRate * 100)}%)`
    : ''
  return buildEntry({
    key, label: DIMENSION_META[key].label, score,
    metrics: { boxRate: round2(box), contestableRate: round2(contestable), territorialRate: round2(territorial), clearanceRate: round2(clearance), crossRate: round2(cross), reclaimRate: round2(reclaimRate) },
    summary, relevant: rel, valueOf: o => (o.eventData?.reclaimed ? 1 : 0), totalObs: total, meta: metaOf(key),
  })
}
