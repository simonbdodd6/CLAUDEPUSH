/**
 * AI Brain — Opponent Set-Piece Engine (M24)
 *
 * Derives scrum, lineout and restart profiles. Pure + deterministic.
 */

import { OPP_EVENT, DIMENSION, DIMENSION_META } from './opponent-types.js'
import { buildEntry, round2, clamp } from './trend-engine.js'

const metaOf = (key) => ({ higherIsBetter: DIMENSION_META[key].higherIsBetter, descriptive: DIMENSION_META[key].descriptive })

/** scrumProfile — win rate, penalties won/conceded. */
export function deriveScrumProfile(sorted, total) {
  const key = DIMENSION.SCRUM_PROFILE
  const rel = sorted.filter(o => o.eventType === OPP_EVENT.SCRUM_EVENT)
  const n = rel.length
  const won = rel.filter(o => ['won', 'penalty_won'].includes(o.eventData?.outcome)).length
  const penWon = rel.filter(o => o.eventData?.outcome === 'penalty_won').length
  const penConc = rel.filter(o => o.eventData?.outcome === 'penalty_conceded').length
  const winRate = n ? won / n : 0
  const penWonRate = n ? penWon / n : 0
  const penConcRate = n ? penConc / n : 0
  const score = clamp(winRate * 100 + penWonRate * 20 - penConcRate * 40, 0, 100)
  const summary = n ? `${score >= 65 ? 'dominant' : score <= 40 ? 'vulnerable' : 'solid'} scrum (${round2(winRate * 100)}% won)` : ''
  return buildEntry({
    key, label: DIMENSION_META[key].label, score,
    metrics: { winRate: round2(winRate), penaltyWonRate: round2(penWonRate), penaltyConcededRate: round2(penConcRate) },
    summary, relevant: rel, valueOf: o => (['won', 'penalty_won'].includes(o.eventData?.outcome) ? 1 : 0), totalObs: total, meta: metaOf(key),
  })
}

/** lineoutProfile — own-throw security + steal & maul threat. */
export function deriveLineoutProfile(sorted, total) {
  const key = DIMENSION.LINEOUT_PROFILE
  const rel = sorted.filter(o => o.eventType === OPP_EVENT.LINEOUT_EVENT)
  const n = rel.length
  const ownThrows = rel.filter(o => o.eventData?.onOwnThrow === true)
  const ownWon = ownThrows.filter(o => ['won', 'maul_try'].includes(o.eventData?.outcome)).length
  const ownWinRate = ownThrows.length ? ownWon / ownThrows.length : 0
  const maulTries = rel.filter(o => o.eventData?.outcome === 'maul_try').length
  const stealsOnOppThrow = rel.filter(o => o.eventData?.onOwnThrow === false && o.eventData?.outcome === 'stolen').length
  const oppThrows = rel.filter(o => o.eventData?.onOwnThrow === false).length
  const stealThreatRate = oppThrows ? stealsOnOppThrow / oppThrows : 0
  const score = clamp(ownWinRate * 100 + (n ? maulTries / n : 0) * 15, 0, 100)
  const summary = n ? `${ownWinRate >= 0.85 ? 'secure' : ownWinRate <= 0.7 ? 'vulnerable' : 'solid'} own throw (${round2(ownWinRate * 100)}%)${maulTries ? ', maul threat' : ''}` : ''
  return buildEntry({
    key, label: DIMENSION_META[key].label, score,
    metrics: { ownThrowWinRate: round2(ownWinRate), stealThreatRate: round2(stealThreatRate), maulTries },
    summary, relevant: rel, valueOf: o => (['won', 'maul_try'].includes(o.eventData?.outcome) ? 1 : 0), totalObs: total, meta: metaOf(key),
  })
}

/** restartProfile — kickoff / drop-out retention. */
export function deriveRestartProfile(sorted, total) {
  const key = DIMENSION.RESTART_PROFILE
  const rel = sorted.filter(o => o.eventType === OPP_EVENT.RESTART_EVENT)
  const n = rel.length
  const retained = rel.filter(o => o.eventData?.retained === true).length
  const contested = rel.filter(o => o.eventData?.contested === true).length
  const retentionRate = n ? retained / n : 0
  const score = retentionRate * 100
  const summary = n ? `${retentionRate >= 0.6 ? 'retains restarts well' : 'loses own restarts'} (${round2(retentionRate * 100)}%)` : ''
  return buildEntry({
    key, label: DIMENSION_META[key].label, score,
    metrics: { retentionRate: round2(retentionRate), contestRate: round2(n ? contested / n : 0) },
    summary, relevant: rel, valueOf: o => (o.eventData?.retained ? 1 : 0), totalObs: total, meta: metaOf(key),
  })
}
