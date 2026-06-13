/**
 * AI Brain — Season Injury Forecast (M28)
 *
 * Forecasts injury risk for the weeks ahead from the fatigue curve trend, the
 * season injury rate so far, and current availability. Deterministic.
 */

import { clamp, round, mean, isNum, SEVERITY, rec } from './season-state.js'

export function buildInjuryForecast(state, fatigue, context = {}) {
  const injuries = Array.isArray(context.injuryHistory) ? context.injuryHistory : []
  const ratePerGame = state.gamesPlayed ? injuries.length / state.gamesPlayed : 0

  // Trend of recent fatigue indices.
  const curves = fatigue.curves ?? []
  const recentFatigue = curves.length ? mean(curves.slice(-3).map(c => c.fatigueIndex)) : null

  // Forecast risk for the next block.
  let level = 'low'
  const reasons = []
  if (recentFatigue != null && recentFatigue >= 80) { level = 'high'; reasons.push(`high accumulated fatigue (${round(recentFatigue)}/100)`) }
  else if (recentFatigue != null && recentFatigue >= 60) { level = 'medium'; reasons.push(`rising fatigue (${round(recentFatigue)}/100)`) }
  if (ratePerGame >= 1.2) { level = level === 'low' ? 'medium' : 'high'; reasons.push(`elevated injury rate (${round(ratePerGame * 10) / 10}/game)`) }

  // Currently unavailable players from availability input.
  const unavailable = Array.isArray(context.availability)
    ? context.availability.filter(a => a.available === false || ['injured', 'unavailable'].includes(a.status)).map(a => a.playerId)
    : []

  const recs = []
  if (level !== 'low') {
    recs.push(rec('inj-forecast', `Manage load over the next block — injury risk is ${level}`,
      reasons.join('; ') || 'load/injury trend', [],
      { priority: level === 'high' ? 'high' : 'medium', confidence: 0.6, fallback: 'Apply standard load management and recovery protocols' }))
  }

  return {
    level, ratePerGame: round(ratePerGame * 100) / 100, recentFatigue: recentFatigue != null ? round(recentFatigue) : null,
    currentlyUnavailable: unavailable, recommendations: recs,
    summary: `Injury forecast: ${level}${unavailable.length ? ` (${unavailable.length} currently out)` : ''}`,
    confidence: state.gamesPlayed >= 4 ? 0.55 : 0.4,
    fallback: 'No injury/fatigue data — assume baseline risk',
  }
}
