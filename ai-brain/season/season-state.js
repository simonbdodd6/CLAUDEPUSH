/**
 * AI Brain — Season Intelligence: Season State (M28)
 *
 * Shared core of the Season Intelligence Engine: constants, the recommendation
 * helper, and the deterministic derivation of the current season state from the
 * fixture list + results.
 *
 * No Brain imports, no Core imports. No randomness, no LLM, no external APIs.
 */

export const SEASON_VERSION = '1.0'
export const SEASON_FLAG     = 'ai.seasonIntelligence'
export const SEASON_TIERS    = Object.freeze(new Set(['performance', 'professional', 'club', 'enterprise']))

// ── tiny shared helpers ──────────────────────────────────────────────────────
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
export const round = (n) => Math.round(n)
export const round1 = (n) => Math.round(n * 10) / 10
export const round2 = (n) => Math.round(n * 100) / 100
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
export const sum = (a) => a.reduce((x, y) => x + y, 0)
export const mean = (a) => (a.length ? sum(a) / a.length : 0)

/** A season recommendation — every one carries WHY + evidence + confidence + fallback. */
export function rec(id, recommendation, why, evidence = [], opts = {}) {
  return {
    id,
    recommendation,
    why,
    evidence: (evidence ?? []).filter(Boolean).slice(0, 10),
    confidence: typeof opts.confidence === 'number' ? round2(opts.confidence) : null,
    priority: opts.priority ?? 'medium',
    fallback: opts.fallback ?? null,
  }
}

// ── grades / formats / league ────────────────────────────────────────────────

export const GRADE = Object.freeze({ YOUTH: 'youth', ACADEMY: 'academy', SENIOR: 'senior', PROFESSIONAL: 'professional' })
export const FORMAT = Object.freeze({ FIFTEENS: 'fifteens', SEVENS: 'sevens' })

/** Default league rules (rugby union). Overridable via context.league. */
export const LEAGUE_DEFAULTS = Object.freeze({
  teams: 12,
  pointsForWin: 4,
  pointsForDraw: 2,
  playoffSpots: 4,
  relegationSpots: 2,
})

export const RESULT = Object.freeze({ WIN: 'W', DRAW: 'D', LOSS: 'L' })

export const TRAJECTORY = Object.freeze({ IMPROVING: 'improving', STEADY: 'steady', DECLINING: 'declining' })
export const HEALTH = Object.freeze({ HEALTHY: 'healthy', STRAINED: 'strained', AT_RISK: 'at_risk', UNKNOWN: 'unknown' })
export const SEVERITY = Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low' })

// ── fixture helpers ──────────────────────────────────────────────────────────

const outcomeOf = (f) => f.result?.outcome ?? f.result?.result ?? null
const isPlayed = (f) => f.played === true || !!f.result
const pointsFor = (f) => (isNum(f.result?.pointsFor) ? f.result.pointsFor : 0)
const pointsAgainst = (f) => (isNum(f.result?.pointsAgainst) ? f.result.pointsAgainst : 0)

/** League points earned from a played fixture (base + bonus). */
export function leaguePoints(f, league) {
  const o = outcomeOf(f)
  const base = o === RESULT.WIN ? league.pointsForWin : o === RESULT.DRAW ? league.pointsForDraw : 0
  const bonus = isNum(f.result?.bonusPoints) ? clamp(f.result.bonusPoints, 0, 2) : 0
  return base + bonus
}

/**
 * Derive the current season state from the fixtures + results.
 * @param {object} context { fixtures[], league?, grade?, format?, seasonId? }
 */
export function deriveSeasonState(context = {}) {
  const grade = Object.values(GRADE).includes(context.grade) ? context.grade : GRADE.SENIOR
  const format = Object.values(FORMAT).includes(context.format) ? context.format : FORMAT.FIFTEENS
  const league = { ...LEAGUE_DEFAULTS, ...(context.league ?? {}) }

  const fixtures = (Array.isArray(context.fixtures) ? context.fixtures : [])
    .slice()
    .sort((a, b) => ((a.round ?? 0) - (b.round ?? 0)) || (String(a.fixtureId) < String(b.fixtureId) ? -1 : 1))

  const played = fixtures.filter(isPlayed)
  const upcoming = fixtures.filter(f => !isPlayed(f))

  let wins = 0, draws = 0, losses = 0, pf = 0, pa = 0, points = 0, bonus = 0
  const formSeq = []
  for (const f of played) {
    const o = outcomeOf(f)
    if (o === RESULT.WIN) wins++; else if (o === RESULT.DRAW) draws++; else if (o === RESULT.LOSS) losses++
    pf += pointsFor(f); pa += pointsAgainst(f)
    const lp = leaguePoints(f, league)
    points += lp
    bonus += isNum(f.result?.bonusPoints) ? clamp(f.result.bonusPoints, 0, 2) : 0
    formSeq.push(o)
  }

  const gamesPlayed = played.length
  const totalGames = fixtures.length || (gamesPlayed + upcoming.length)
  const gamesRemaining = Math.max(0, totalGames - gamesPlayed)
  const ppg = gamesPlayed ? points / gamesPlayed : 0

  // current streak
  let streak = { type: null, count: 0 }
  for (let i = formSeq.length - 1; i >= 0; i--) {
    if (i === formSeq.length - 1) { streak = { type: formSeq[i], count: 1 } }
    else if (formSeq[i] === streak.type) streak.count++
    else break
  }

  return {
    seasonId: context.seasonId ?? null,
    grade, format, league,
    fixtures, played, upcoming,
    totalGames, gamesPlayed, gamesRemaining,
    record: { wins, draws, losses },
    points, bonusPoints: bonus,
    pointsPerGame: round2(ppg),
    pointsFor: pf, pointsAgainst: pa, pointsDifference: pf - pa,
    form: formSeq.slice(-5),
    streak,
    seasonProgress: totalGames ? round2(gamesPlayed / totalGames) : 0,
    position: context.league?.currentPosition ?? null,
  }
}
