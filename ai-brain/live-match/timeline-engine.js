/**
 * AI Brain — Live Timeline Engine (M27)
 *
 * Orders the event log and extracts the critical moments — the high-leverage
 * events (scores, cards, red-zone turnovers, missed kicks) that shaped the game.
 * Deterministic.
 */

import { EVENT, ZONE } from './match-state.js'

const CRITICAL_TYPES = new Set([EVENT.SCORE, EVENT.CARD, EVENT.INJURY])

function describe(e) {
  const who = e.team === 'us' ? 'Us' : 'Them'
  switch (e.type) {
    case EVENT.SCORE: return `${who} scored (${e.data?.kind ?? 'points'})`
    case EVENT.CARD: return `${who} — ${e.data?.cardType ?? 'card'} card`
    case EVENT.INJURY: return `${who} injury${e.data?.playerId ? ` (${e.data.playerId})` : ''}`
    case EVENT.TURNOVER: return `${who} won a turnover in the ${e.zone?.replace('_', ' ')}`
    default: return `${who} ${e.type}`
  }
}

export function buildCriticalMoments(state, events) {
  const moments = []
  for (const e of events) {
    const isCritical = CRITICAL_TYPES.has(e.type) ||
      (e.type === EVENT.TURNOVER && (e.zone === ZONE.OPP_22 || e.zone === ZONE.OWN_22))
    if (!isCritical) continue
    moments.push({
      minute: e.minute,
      type: e.type,
      team: e.team,
      description: describe(e),
      evidence: e.eventId ? [e.eventId] : [],
    })
  }
  moments.sort((a, b) => a.minute - b.minute)
  return {
    moments,
    count: moments.length,
    summary: moments.length ? `${moments.length} critical moment(s)` : 'No critical moments yet',
    confidence: 0.8,
    fallback: 'Critical moments will populate as scores/cards occur',
  }
}

export function buildTimeline(events) {
  return [...events].sort((a, b) => (a.minute - b.minute) || (String(a.eventId) < String(b.eventId) ? -1 : 1))
}
