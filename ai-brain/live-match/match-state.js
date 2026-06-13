/**
 * AI Brain — Live Match State (M27)
 *
 * The shared core of the Live Match Intelligence Engine: constants, the
 * recommendation helper, and the deterministic derivation of the current match
 * state from the live event log.
 *
 * No Brain imports, no Core imports. No randomness, no LLM, no wall-clock — the
 * "clock" is the latest event minute, never real time.
 */

export const LIVE_VERSION = '1.0'
export const LIVE_FLAG     = 'ai.liveMatch'
export const LIVE_TIERS    = Object.freeze(new Set(['performance', 'professional', 'club', 'enterprise']))

// ── tiny shared helpers ──────────────────────────────────────────────────────
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
export const round = (n) => Math.round(n)
export const round2 = (n) => Math.round(n * 100) / 100
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
export const pct = (a, b) => (a + b > 0 ? round((a / (a + b)) * 100) : null)

/** Build a single live recommendation — every one carries WHY + evidence +
 *  confidence + a fallback for when the underlying data is missing. */
export function rec(id, recommendation, why, evidence = [], opts = {}) {
  return {
    id,
    recommendation,
    why,
    evidence: (evidence ?? []).filter(Boolean).slice(0, 8),
    confidence: typeof opts.confidence === 'number' ? round2(opts.confidence) : null,
    priority: opts.priority ?? 'medium',
    fallback: opts.fallback ?? null,
  }
}

// ── grades / formats ─────────────────────────────────────────────────────────

export const GRADE = Object.freeze({ YOUTH: 'youth', SENIOR: 'senior', PROFESSIONAL: 'professional' })
export const FORMAT = Object.freeze({ FIFTEENS: 'fifteens', SEVENS: 'sevens' })

export const GRADE_META = Object.freeze({
  youth:        { fullTime: 60, half: 30 },
  senior:       { fullTime: 80, half: 40 },
  professional: { fullTime: 80, half: 40 },
})
export const FORMAT_META = Object.freeze({
  fifteens: { players: 15, fullTime: 80, half: 40, sinBin: 10 },
  sevens:   { players: 7,  fullTime: 14, half: 7,  sinBin: 2 },
})

// ── field zones ──────────────────────────────────────────────────────────────

export const ZONE = Object.freeze({ OWN_22: 'own_22', OWN_HALF: 'own_half', OPP_HALF: 'opp_half', OPP_22: 'opp_22' })
export const ZONE_ORDER = Object.freeze([ZONE.OWN_22, ZONE.OWN_HALF, ZONE.OPP_HALF, ZONE.OPP_22])

// ── event types ──────────────────────────────────────────────────────────────

export const EVENT = Object.freeze({
  SCORE: 'score',         // { kind:'try'|'conversion'|'penalty'|'drop', points? }
  POSSESSION: 'possession',
  TERRITORY: 'territory',
  SCRUM: 'scrum',         // { won:boolean }
  LINEOUT: 'lineout',     // { won:boolean }
  MAUL: 'maul',
  RUCK: 'ruck',
  TACKLE: 'tackle',
  CARRY: 'carry',
  TURNOVER: 'turnover',   // team = team that WON possession
  KICK: 'kick',
  PENALTY: 'penalty',     // team = OFFENDING team
  CARD: 'card',           // { cardType:'yellow'|'red' } team = carded team
  INJURY: 'injury',       // { playerId, severity? }
  KICKOFF: 'kickoff',
  RESTART: 'restart',
  HALF: 'half',           // { marker:'ht'|'ft' }
})

export const SCORE_POINTS = Object.freeze({ try: 5, conversion: 2, penalty: 3, drop: 3 })

export const GAME_PHASE = Object.freeze({ OPENING: 'opening', FIRST_END: 'first_end', SECOND_OPEN: 'second_open', CLOSING: 'closing' })

// ── state derivation ─────────────────────────────────────────────────────────

const isOurs = (e) => e.team === 'us'
const pointsOf = (e) => (isNum(e.data?.points) ? e.data.points : (SCORE_POINTS[e.data?.kind] ?? 0))

function phaseOf(minute, fullTime) {
  const f = minute / fullTime
  if (f <= 0.25) return GAME_PHASE.OPENING
  if (f <= 0.5) return GAME_PHASE.FIRST_END
  if (f <= 0.75) return GAME_PHASE.SECOND_OPEN
  return GAME_PHASE.CLOSING
}

/** Players currently on the field for a side, given cards and the clock. */
function playersOnField(events, team, basePlayers, clock, sinBin) {
  let n = basePlayers
  for (const e of events) {
    if (e.type !== EVENT.CARD || e.team !== team) continue
    if (e.data?.cardType === 'red') n -= 1
    else if (e.data?.cardType === 'yellow' && clock < (e.minute + sinBin)) n -= 1
  }
  return Math.max(basePlayers - 3, n)
}

/**
 * Derive the full current match state from the (already time-sorted) event log.
 * @param {object[]} events  normalised live events
 * @param {object}   context { grade?, format? }
 */
export function deriveMatchState(events = [], context = {}) {
  const grade = GRADE_META[context.grade] ? context.grade : GRADE.SENIOR
  const format = FORMAT_META[context.format] ? context.format : FORMAT.FIFTEENS
  const fm = FORMAT_META[format]
  const fullTime = context.format ? fm.fullTime : (GRADE_META[grade].fullTime)
  const halfLen = context.format ? fm.half : GRADE_META[grade].half
  const basePlayers = fm.players

  const sorted = [...events].sort((a, b) => (a.minute - b.minute) || (String(a.eventId) < String(b.eventId) ? -1 : 1))
  const clock = sorted.length ? sorted[sorted.length - 1].minute : 0
  const lastEvent = sorted.length ? sorted[sorted.length - 1] : null

  const halfMarker = sorted.filter(e => e.type === EVENT.HALF).map(e => e.data?.marker)
  const half = halfMarker.includes('ft') ? 'full_time' : (clock > halfLen || halfMarker.includes('ht')) ? 2 : 1

  // Score
  let scoreUs = 0, scoreThem = 0
  for (const e of sorted) if (e.type === EVENT.SCORE) { if (isOurs(e)) scoreUs += pointsOf(e); else scoreThem += pointsOf(e) }

  // Tally helper
  const tally = (type, sel = isOurs) => {
    let us = 0, them = 0
    for (const e of sorted) if (e.type === type) (sel(e) ? us++ : them++)
    return { us, them }
  }
  const rucks = tally(EVENT.RUCK)
  const tackles = tally(EVENT.TACKLE)
  const turnovers = tally(EVENT.TURNOVER)
  const kicks = tally(EVENT.KICK)
  const penalties = tally(EVENT.PENALTY)   // team = offending team
  const carries = tally(EVENT.CARRY)

  // Set piece win rates (team = team putting in / throwing)
  const setPiece = (type) => {
    let usWon = 0, usTot = 0, themWon = 0, themTot = 0
    for (const e of sorted) if (e.type === type) {
      if (isOurs(e)) { usTot++; if (e.data?.won) usWon++ }
      else { themTot++; if (e.data?.won) themWon++ }
    }
    return { us: { won: usWon, total: usTot }, them: { won: themWon, total: themTot } }
  }

  // Possession proxy from rucks + carries; territory proxy from zoned events.
  const possUs = rucks.us + carries.us, possThem = rucks.them + carries.them
  let oppHalfUs = 0, oppHalfThem = 0
  for (const e of sorted) {
    if (!e.zone) continue
    const inOppHalf = e.zone === ZONE.OPP_HALF || e.zone === ZONE.OPP_22
    if (isOurs(e)) { if (inOppHalf) oppHalfUs++ } else { if (inOppHalf) oppHalfThem++ }
  }

  const cards = { us: [], them: [] }
  for (const e of sorted) if (e.type === EVENT.CARD) cards[isOurs(e) ? 'us' : 'them'].push({ minute: e.minute, cardType: e.data?.cardType, eventId: e.eventId })
  const injuries = sorted.filter(e => e.type === EVENT.INJURY).map(e => ({ minute: e.minute, team: e.team, playerId: e.data?.playerId ?? null, eventId: e.eventId }))

  const usOn = playersOnField(sorted, 'us', basePlayers, clock, fm.sinBin)
  const themOn = playersOnField(sorted, 'them', basePlayers, clock, fm.sinBin)

  return {
    matchId: context.matchId ?? null,
    grade, format, fullTime, halfLen, basePlayers,
    clock, half, phase: phaseOf(clock, fullTime),
    minutesRemaining: Math.max(0, fullTime - clock),
    lastEvent,
    eventCount: sorted.length,

    score: { us: scoreUs, them: scoreThem, margin: scoreUs - scoreThem },
    possession: { us: pct(possUs, possThem), them: pct(possThem, possUs) },
    territory: { us: pct(oppHalfUs, oppHalfThem), them: pct(oppHalfThem, oppHalfUs) },

    scrum: setPiece(EVENT.SCRUM),
    lineout: setPiece(EVENT.LINEOUT),
    counts: { rucks, tackles, turnovers, kicks, penalties, carries },

    cards,
    injuries,
    playersOnField: { us: usOn, them: themOn },
    numericalAdvantage: usOn - themOn,
  }
}
