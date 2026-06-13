/**
 * AI Brain — Training Constraint Engine (M25)
 *
 * Resolves a raw designer context into a normalised constraint set the rest of
 * the pipeline optimises around: format, grade, duration, players, space,
 * weather, injuries, match importance, season timing, contact/intensity caps.
 *
 * Pure + deterministic. Tolerant of missing inputs (graceful degradation).
 */

import {
  GRADE_META, GRADE_ORDER, FORMAT, FORMAT_META, SEASON_PHASE, MATCH_IMPORTANCE,
  BAD_WEATHER, clamp, round,
} from './training-types.js'

const HIGH_LOAD_THRESHOLD = 85

function availablePlayers(squad) {
  if (!Array.isArray(squad)) return null
  return squad.filter(p => p?.available !== false &&
    !['injured', 'unavailable', 'suspended'].includes(p?.status)).length
}

function idsWhere(squad, pred) {
  if (!Array.isArray(squad)) return []
  return squad.filter(pred).map(p => p.playerId).filter(Boolean)
}

export function resolveConstraints(context = {}) {
  const o = context.overrides ?? {}
  const grade = GRADE_META[context.grade] ? context.grade : 'senior'
  const gm = GRADE_META[grade]
  const gradeIndex = GRADE_ORDER.indexOf(grade)
  const format = FORMAT_META[context.format] ? context.format : FORMAT.FIFTEENS

  const squad = context.squad ?? null
  const requestedDuration = o.durationMin ?? context.durationMin ?? gm.defaultDuration
  const durationMin = clamp(round(requestedDuration), 30, gm.durationCap)

  const players = o.players ?? context.players ?? availablePlayers(squad) ?? 22

  const space = ['small', 'medium', 'large', 'full'].includes(context.space) ? context.space : 'full'
  const weather = context.weather ?? 'good'
  const badWeather = BAD_WEATHER.has(weather)

  // Welfare / load
  const welfare = Array.isArray(context.welfare) ? context.welfare : []
  const loadOf = (id) => {
    const w = welfare.find(x => x.playerId === id)
    if (w && typeof w.load === 'number') return w.load
    const p = Array.isArray(squad) ? squad.find(s => s.playerId === id) : null
    return typeof p?.minutesLoad === 'number' ? p.minutesLoad : null
  }
  const injuredIds = idsWhere(squad, p => ['injured', 'unavailable'].includes(p?.status))
  const doubtfulIds = idsWhere(squad, p => p?.status === 'doubtful')
  const highLoadIds = [
    ...welfare.filter(w => typeof w.load === 'number' && w.load >= HIGH_LOAD_THRESHOLD).map(w => w.playerId),
    ...idsWhere(squad, p => typeof p?.minutesLoad === 'number' && p.minutesLoad >= HIGH_LOAD_THRESHOLD),
  ].filter((v, i, a) => v && a.indexOf(v) === i)
  const welfareFlagIds = [
    ...welfare.filter(w => w.flag === true).map(w => w.playerId),
    ...idsWhere(squad, p => p?.welfareFlag === true),
  ].filter((v, i, a) => v && a.indexOf(v) === i)

  const matchImportance = Object.values(MATCH_IMPORTANCE).includes(context.matchImportance) ? context.matchImportance : MATCH_IMPORTANCE.NORMAL
  const seasonPhase = Object.values(SEASON_PHASE).includes(context.seasonPhase) ? context.seasonPhase : SEASON_PHASE.MID

  // Contact + intensity caps, softened by welfare pressure.
  const welfarePressure = injuredIds.length + highLoadIds.length + welfareFlagIds.length
  let contactLevel = gm.contact
  if (contactLevel === 'full' && (highLoadIds.length >= 5 || matchImportance === MATCH_IMPORTANCE.CUP_FINAL)) contactLevel = 'light' // taper / protect
  const trainingLoad = context.trainingLoad ?? null
  let intensityCap = gm.intensityCap
  if (seasonPhase === SEASON_PHASE.LATE || seasonPhase === SEASON_PHASE.PLAYOFFS) intensityCap = clamp(intensityCap - 1, 2, 5)
  if (welfarePressure >= 6) intensityCap = clamp(intensityCap - 1, 2, 5)

  return {
    format, grade, gradeIndex,
    contactLevel, complexityCap: gm.complexityCap, intensityCap,
    durationMin, players, space, weather, badWeather,
    injuredIds, doubtfulIds, highLoadIds, welfareFlagIds, welfarePressure,
    matchImportance, seasonPhase,
    formatMeta: FORMAT_META[format],
    minPlayersForLiveSetPiece: FORMAT_META[format].minPlayersForLiveSetPiece,
    trainingLoad,
  }
}
