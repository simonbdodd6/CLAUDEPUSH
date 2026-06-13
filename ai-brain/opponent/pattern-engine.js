/**
 * AI Brain — Opponent Pattern Engine (M24)
 *
 * Derives the play-pattern dimensions from attack_sequence / defensive_set
 * observations: attack & defensive tendencies, phase count, breakdown speed,
 * counter-attack frequency, and territory preference.
 *
 * Pure + deterministic.
 */

import { OPP_EVENT, DIMENSION, DIMENSION_META } from './opponent-types.js'
import { buildEntry, mean, num, round2, clamp } from './trend-engine.js'

const metaOf = (key) => ({ higherIsBetter: DIMENSION_META[key].higherIsBetter, descriptive: DIMENSION_META[key].descriptive })
const seqOf = (sorted) => sorted.filter(o => o.eventType === OPP_EVENT.ATTACK_SEQUENCE)

/** attackTendencies — strike rate + channel bias from attack sequences. */
export function deriveAttackTendencies(sorted, total) {
  const key = DIMENSION.ATTACK_TENDENCIES
  const rel = seqOf(sorted)
  const n = rel.length
  const wide = rel.filter(o => o.eventData?.channel === 'wide').length
  const narrow = rel.filter(o => o.eventData?.channel === 'narrow').length
  const tries = rel.filter(o => o.eventData?.result === 'try').length
  const avgPhases = n ? mean(rel.map(o => num(o.eventData?.phases))) : 0
  const tryRate = n ? tries / n : 0
  const wideRate = n ? wide / n : 0
  const score = (tryRate * 0.6 + wideRate * 0.4) * 100
  const summary = n ? `${wideRate >= 0.5 ? 'wide-channel' : 'forward-oriented'} attack, ${tryRate >= 0.3 ? 'high' : 'moderate'} strike rate` : ''
  return buildEntry({
    key, label: DIMENSION_META[key].label, score,
    metrics: { tryRate: round2(tryRate), wideRate: round2(wideRate), narrowRate: round2(n ? narrow / n : 0), avgPhases: round2(avgPhases) },
    summary, relevant: rel, valueOf: o => (o.eventData?.result === 'try' ? 1 : 0), totalObs: total, meta: metaOf(key),
  })
}

/** defensiveTendencies — turnover + dominant-tackle rate, missed-tackle leak. */
export function deriveDefensiveTendencies(sorted, total) {
  const key = DIMENSION.DEFENSIVE_TENDENCIES
  const rel = sorted.filter(o => o.eventType === OPP_EVENT.DEFENSIVE_SET)
  const n = rel.length
  const turnovers = rel.filter(o => o.eventData?.turnoverWon === true).length
  const dominant = rel.filter(o => o.eventData?.dominantTackle === true).length
  const fastLine = rel.filter(o => o.eventData?.lineSpeed === 'fast').length
  const avgMissed = n ? mean(rel.map(o => num(o.eventData?.missedTackles))) : 0
  const base = n ? (turnovers / n) * 50 + (dominant / n) * 50 : 0
  const score = clamp(base - avgMissed * 5, 0, 100)
  const summary = n ? `${fastLine / n >= 0.5 ? 'fast line speed' : 'passive line'}, ${avgMissed <= 2 ? 'tight' : 'leaky'} (avg ${round2(avgMissed)} missed)` : ''
  return buildEntry({
    key, label: DIMENSION_META[key].label, score,
    metrics: { turnoverRate: round2(n ? turnovers / n : 0), dominantTackleRate: round2(n ? dominant / n : 0), avgMissedTackles: round2(avgMissed), fastLineSpeedRate: round2(n ? fastLine / n : 0) },
    summary, relevant: rel, valueOf: o => (o.eventData?.turnoverWon ? 1 : 0), totalObs: total, meta: metaOf(key),
  })
}

/** phaseCount — patience / multi-phase build (descriptive). */
export function derivePhaseCount(sorted, total) {
  const key = DIMENSION.PHASE_COUNT
  const rel = seqOf(sorted)
  const n = rel.length
  const phases = rel.map(o => num(o.eventData?.phases))
  const avgPhases = mean(phases)
  const score = clamp((avgPhases / 10) * 100, 0, 100)
  const summary = n ? `${avgPhases >= 6 ? 'patient multi-phase' : 'direct, few phases'} (avg ${round2(avgPhases)})` : ''
  return buildEntry({
    key, label: DIMENSION_META[key].label, score,
    metrics: { avgPhases: round2(avgPhases), maxPhases: phases.length ? Math.max(...phases) : 0 },
    summary, relevant: rel, valueOf: o => num(o.eventData?.phases) / 10, totalObs: total, meta: metaOf(key),
  })
}

/** breakdownSpeed — fast-ruck ratio. */
export function deriveBreakdownSpeed(sorted, total) {
  const key = DIMENSION.BREAKDOWN_SPEED
  const rel = seqOf(sorted).filter(o => o.eventData?.breakdownSpeed)
  const n = rel.length
  const fast = rel.filter(o => o.eventData?.breakdownSpeed === 'fast').length
  const fastRate = n ? fast / n : 0
  const score = fastRate * 100
  const summary = n ? `${fastRate >= 0.5 ? 'quick ruck ball' : 'slow at the breakdown'} (${round2(fastRate * 100)}% fast)` : ''
  return buildEntry({
    key, label: DIMENSION_META[key].label, score,
    metrics: { fastRuckRate: round2(fastRate) },
    summary, relevant: rel, valueOf: o => (o.eventData?.breakdownSpeed === 'fast' ? 1 : 0), totalObs: total, meta: metaOf(key),
  })
}

/** counterattackFrequency — how often they counter from broken play. */
export function deriveCounterattackFrequency(sorted, total) {
  const key = DIMENSION.COUNTERATTACK_FREQUENCY
  const rel = seqOf(sorted)
  const n = rel.length
  const counters = rel.filter(o => o.eventData?.counterAttack === true).length
  const rate = n ? counters / n : 0
  const score = rate * 100
  const summary = n ? `${rate >= 0.3 ? 'dangerous' : 'rare'} counter-attack (${round2(rate * 100)}%)` : ''
  return buildEntry({
    key, label: DIMENSION_META[key].label, score,
    metrics: { counterAttackRate: round2(rate) },
    summary, relevant: rel, valueOf: o => (o.eventData?.counterAttack ? 1 : 0), totalObs: total, meta: metaOf(key),
  })
}

/** territoryPreference — kick-territory vs ball-in-hand (descriptive). */
export function deriveTerritoryPreference(sorted, total) {
  const key = DIMENSION.TERRITORY_PREFERENCE
  const seq = seqOf(sorted)
  const kicks = sorted.filter(o => o.eventType === OPP_EVENT.KICK_EVENT)
  const rel = [...seq, ...kicks]
  const n = rel.length
  if (!n) return buildEntry({ key, label: DIMENSION_META[key].label, score: null, relevant: [], totalObs: total, meta: metaOf(key) })
  const kickShare = kicks.length / n
  const score = kickShare * 100
  const summary = `${kickShare >= 0.5 ? 'kick-territory dominant' : 'ball-in-hand'} (${round2(kickShare * 100)}% kicks)`
  return buildEntry({
    key, label: DIMENSION_META[key].label, score,
    metrics: { kickShare: round2(kickShare), ballInHandShare: round2(1 - kickShare) },
    summary, relevant: rel, valueOf: o => (o.eventType === OPP_EVENT.KICK_EVENT ? 1 : 0), totalObs: total, meta: metaOf(key),
  })
}
