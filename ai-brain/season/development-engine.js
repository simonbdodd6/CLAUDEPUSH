/**
 * AI Brain — Season Development Engine (M28)
 *
 * Player development curves and development targets from the player-development
 * history (a per-player series of ratings over time). Deterministic.
 */

import { round1, round2, mean, isNum, rec } from './season-state.js'

function curveOf(p) {
  const series = (Array.isArray(p.series) ? p.series : []).slice().sort((a, b) => (a.round ?? a.week ?? 0) - (b.round ?? b.week ?? 0))
  const vals = series.map(s => (isNum(s.rating) ? s.rating : (isNum(s.value) ? s.value : null))).filter(isNum)
  if (!vals.length) return null
  const first = vals[0], latest = vals[vals.length - 1]
  const delta = round1(latest - first)
  const direction = delta >= 1 ? 'improving' : delta <= -1 ? 'declining' : 'steady'
  return {
    playerId: p.playerId, name: p.name ?? null,
    points: series.map((s, i) => ({ t: s.round ?? s.week ?? i, value: isNum(s.rating) ? s.rating : s.value })),
    first, latest, delta, direction,
    target: isNum(p.target) ? p.target : null,
    evidence: p.evidence ?? [],
  }
}

export function buildDevelopment(context = {}) {
  const players = Array.isArray(context.playerDevelopment) ? context.playerDevelopment : []
  const curves = players.map(curveOf).filter(Boolean)

  const targets = curves.filter(c => c.target != null).map(c => {
    const gap = round1(c.target - c.latest)
    const status = gap <= 0 ? 'achieved' : gap <= 2 ? 'on_track' : 'behind'
    return rec(`devtgt-${c.playerId}`, `${c.name ?? c.playerId}: ${status === 'achieved' ? 'development target met' : `close the ${gap}-point gap to target ${c.target}`}`,
      `Now ${c.latest} vs target ${c.target} (${c.direction})`, c.evidence,
      { priority: status === 'behind' ? 'high' : 'medium', confidence: 0.6, fallback: 'Continue individual development plan' })
  })

  return {
    curves,
    targets,
    improvingCount: curves.filter(c => c.direction === 'improving').length,
    decliningCount: curves.filter(c => c.direction === 'declining').length,
    summary: curves.length ? `${curves.filter(c => c.direction === 'improving').length}/${curves.length} players improving` : 'No development data',
    confidence: curves.length ? 0.65 : 0,
    fallback: 'Development not tracked — rely on coach assessment',
  }
}
