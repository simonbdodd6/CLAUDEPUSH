/**
 * AI Brain — Season Squad Rotation Engine (M28)
 *
 * Assesses squad rotation health from selection history: how evenly minutes /
 * appearances are spread, and whether a small core is being over-used (burnout
 * risk) or the squad is over-rotated (no settled side). Deterministic.
 */

import { clamp, round, round2, HEALTH, rec } from './season-state.js'

export function buildRotationHealth(state, context = {}) {
  const history = Array.isArray(context.selectionHistory) ? context.selectionHistory : []
  if (!history.length) {
    return { status: HEALTH.UNKNOWN, usedPlayers: 0, gamesAnalysed: 0, overUsed: [], summary: 'No selection history — rotation not tracked',
      recommendations: [], confidence: 0, fallback: 'Assume balanced rotation' }
  }
  const games = history.length
  const usage = new Map()
  for (const sel of history) for (const pid of (sel.players ?? [])) usage.set(pid, (usage.get(pid) ?? 0) + 1)

  const counts = [...usage.values()]
  const usedPlayers = usage.size
  const everPresent = counts.filter(c => c >= games * 0.9).length      // near ever-present
  const fringe = counts.filter(c => c <= games * 0.2).length

  // Spread index: mean appearances / games (higher = more reliance on a core).
  const coreReliance = round2((counts.filter(c => c >= games * 0.8).length) / Math.max(1, usedPlayers))
  const matchSquad = state.format === 'sevens' ? 12 : 23
  const depthRatio = round2(usedPlayers / matchSquad)

  let status = HEALTH.HEALTHY
  if (everPresent >= 8) status = HEALTH.STRAINED          // many never rested
  if (everPresent >= 11 && depthRatio < 1.2) status = HEALTH.AT_RISK
  if (usedPlayers >= matchSquad * 1.6 && coreReliance < 0.2) status = HEALTH.STRAINED  // over-rotated, no settled side

  const overUsed = [...usage.entries()].filter(([, c]) => c >= games * 0.9).map(([pid, c]) => ({ playerId: pid, appearances: c, of: games }))
  const recs = []
  if (status === HEALTH.AT_RISK || status === HEALTH.STRAINED) {
    recs.push(rec('rot-rest', `Rotate minutes for the most-used players — ${overUsed.length} near ever-present`,
      `${everPresent} player(s) playing ~every game across ${games} games`, [],
      { priority: status === HEALTH.AT_RISK ? 'high' : 'medium', confidence: 0.65, fallback: 'Build planned rest into the schedule for core players' }))
  }

  return {
    status, usedPlayers, gamesAnalysed: games, squadDepthRatio: depthRatio, coreReliance, everPresent, fringePlayers: fringe,
    overUsed, recommendations: recs,
    summary: `Rotation health: ${status} (${usedPlayers} players across ${games} games, ${everPresent} ever-present)`,
    confidence: games >= 4 ? 0.65 : 0.45,
    fallback: 'Assume balanced rotation',
  }
}
