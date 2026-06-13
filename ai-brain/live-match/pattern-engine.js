/**
 * AI Brain — Live Pattern Engine (M27)
 *
 * Detects deterministic in-game patterns from the event log: penalty streaks,
 * set-piece dominance/struggle, momentum swings, repeated entries to the 22.
 * Patterns feed the tactical-advice and scenario engines. Each carries evidence.
 */

import { EVENT, ZONE } from './match-state.js'

export function buildPatterns(state, events) {
  const patterns = []
  const clock = state.clock

  // Penalty streak (either side) in the last 10'.
  for (const side of ['us', 'them']) {
    const recent = events.filter(e => e.type === EVENT.PENALTY && e.team === side && e.minute >= clock - 10)
    if (recent.length >= 2) {
      patterns.push({
        id: `pat-pen-${side}`, type: 'penalty_streak', side,
        detail: `${side === 'us' ? 'We have' : 'They have'} conceded ${recent.length} penalties in 10'`,
        evidence: recent.map(e => e.eventId).filter(Boolean),
      })
    }
  }

  // Set-piece dominance / struggle (our feed).
  const sp = (label, st) => {
    if (st.us.total >= 3) {
      const rate = st.us.won / st.us.total
      if (rate <= 0.5) patterns.push({ id: `pat-${label}-struggle`, type: `${label}_struggle`, side: 'us', detail: `Our ${label} is under pressure (${st.us.won}/${st.us.total})`, evidence: [] })
      else if (rate >= 0.9) patterns.push({ id: `pat-${label}-strong`, type: `${label}_strong`, side: 'us', detail: `Our ${label} is dominant (${st.us.won}/${st.us.total})`, evidence: [] })
    }
  }
  sp('scrum', state.scrum)
  sp('lineout', state.lineout)

  // Repeated entries into the opposition 22 (sustained pressure).
  const entries = events.filter(e => e.zone === ZONE.OPP_22 && e.team === 'us' && e.minute >= clock - 8)
  if (entries.length >= 3) {
    patterns.push({ id: 'pat-22-pressure', type: 'sustained_pressure', side: 'us', detail: `${entries.length} entries into their 22 in 8' without a score`, evidence: entries.map(e => e.eventId).filter(Boolean) })
  }

  return {
    patterns,
    summary: patterns.length ? `${patterns.length} live pattern(s) detected` : 'No strong patterns yet',
    confidence: events.length >= 6 ? 0.65 : 0.4,
    fallback: 'No patterns — play the structured game plan',
  }
}
