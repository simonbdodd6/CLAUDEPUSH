/**
 * AI Brain — Opponent Profile Assembly + Products + Store (M24)
 *
 * Assembles the full, evidence-backed Opponent Profile from every dimension
 * engine, derives strengths / weaknesses / threats / opportunities, and exposes
 * the product functions (summary, threats, opportunities, compare, evolution).
 *
 * Holds a small in-memory opponent-observation store (append-only). The engine
 * consumes observations only — it never touches Core or any other Brain module.
 *
 * Pure assembly; the only state is the observation store.
 */

import {
  PROFILE_VERSION, DIMENSION, DIMENSION_KEYS, DIMENSION_META,
} from './opponent-types.js'
import { sortIndexed, round2, mean, deriveSubstitutionBehaviour, deriveFitnessTrends, deriveLateGameBehaviour } from './trend-engine.js'
import {
  deriveAttackTendencies, deriveDefensiveTendencies, derivePhaseCount,
  deriveBreakdownSpeed, deriveCounterattackFrequency, deriveTerritoryPreference,
} from './pattern-engine.js'
import { deriveScrumProfile, deriveLineoutProfile, deriveRestartProfile } from './set-piece-engine.js'
import { deriveKickProfile } from './kick-profile.js'
import { deriveDisciplineProfile } from './discipline-profile.js'
import { deriveStrengths } from './strength-engine.js'
import { deriveWeaknesses } from './weakness-engine.js'
import { buildThreats, buildOpportunities } from './recommendation-builder.js'

// ── Dimension assembly ────────────────────────────────────────────────────────

function buildDimensions(sorted, total) {
  return {
    [DIMENSION.ATTACK_TENDENCIES]:       deriveAttackTendencies(sorted, total),
    [DIMENSION.DEFENSIVE_TENDENCIES]:    deriveDefensiveTendencies(sorted, total),
    [DIMENSION.SCRUM_PROFILE]:           deriveScrumProfile(sorted, total),
    [DIMENSION.LINEOUT_PROFILE]:         deriveLineoutProfile(sorted, total),
    [DIMENSION.KICK_PROFILE]:            deriveKickProfile(sorted, total),
    [DIMENSION.RESTART_PROFILE]:         deriveRestartProfile(sorted, total),
    [DIMENSION.DISCIPLINE_PROFILE]:      deriveDisciplineProfile(sorted, total),
    [DIMENSION.SUBSTITUTION_BEHAVIOUR]:  deriveSubstitutionBehaviour(sorted, total),
    [DIMENSION.FITNESS_TRENDS]:          deriveFitnessTrends(sorted, total),
    [DIMENSION.LATE_GAME_BEHAVIOUR]:     deriveLateGameBehaviour(sorted, total),
    [DIMENSION.TERRITORY_PREFERENCE]:    deriveTerritoryPreference(sorted, total),
    [DIMENSION.PHASE_COUNT]:             derivePhaseCount(sorted, total),
    [DIMENSION.BREAKDOWN_SPEED]:         deriveBreakdownSpeed(sorted, total),
    [DIMENSION.COUNTERATTACK_FREQUENCY]: deriveCounterattackFrequency(sorted, total),
  }
}

function maturityOf(dimensions) {
  const confs = DIMENSION_KEYS.map(k => dimensions[k].confidence)
  return round2(mean(confs))
}

function matchesObserved(sorted) {
  const ids = new Set(sorted.map(o => o.matchId ?? o.eventData?.matchId).filter(Boolean))
  return ids.size || null
}

function buildSummaryLine(opponentId, strengths, weaknesses, observationCount) {
  if (!observationCount) return `No data observed for ${opponentId ?? 'opponent'} yet`
  const s = strengths[0] ? strengths[0].label.toLowerCase() : 'no clear strength yet'
  const w = weaknesses[0] ? weaknesses[0].label.toLowerCase() : 'no clear weakness yet'
  return `Strongest at ${s}; most exploitable at ${w}`
}

/**
 * Build a complete Opponent Profile (pure).
 * @param {string}   opponentId
 * @param {object[]} observations
 * @param {object}   opts { asOf?, opponentName? }
 * @returns {OpponentProfile}
 */
export function buildOpponentProfile(opponentId, observations = [], opts = {}) {
  const sorted = sortIndexed(observations)
  const total = sorted.length
  const dimensions = buildDimensions(sorted, total)
  const strengths = deriveStrengths(dimensions)
  const weaknesses = deriveWeaknesses(dimensions)
  const threats = buildThreats(strengths)
  const opportunities = buildOpportunities(weaknesses)

  return {
    profileVersion:   PROFILE_VERSION,
    opponentId:       opponentId ?? null,
    opponentName:     opts.opponentName ?? null,
    generatedAt:      opts.asOf ?? null,
    observationCount: total,
    matchesObserved:  matchesObserved(sorted),
    maturity:         maturityOf(dimensions),
    dimensions,
    strengths,
    weaknesses,
    threats,
    opportunities,
    summary: buildSummaryLine(opponentId, strengths, weaknesses, total),
  }
}

// ── Products (pure over a profile / observations) ─────────────────────────────

export function buildOpponentSummary(opponentId, observations = [], opts = {}) {
  const p = buildOpponentProfile(opponentId, observations, opts)
  return {
    profileVersion: PROFILE_VERSION,
    opponentId: p.opponentId,
    opponentName: p.opponentName,
    observationCount: p.observationCount,
    matchesObserved: p.matchesObserved,
    maturity: p.maturity,
    topStrengths: p.strengths.slice(0, 3).map(s => ({ key: s.key, label: s.label, score: s.score, confidence: s.confidence })),
    topWeaknesses: p.weaknesses.slice(0, 3).map(w => ({ key: w.key, label: w.label, score: w.score, confidence: w.confidence })),
    threatCount: p.threats.length,
    opportunityCount: p.opportunities.length,
    headline: p.summary,
  }
}

export function buildOpponentThreats(opponentId, observations = [], opts = {}) {
  const p = buildOpponentProfile(opponentId, observations, opts)
  return { profileVersion: PROFILE_VERSION, opponentId: p.opponentId, threats: p.threats }
}

export function buildOpponentOpportunities(opponentId, observations = [], opts = {}) {
  const p = buildOpponentProfile(opponentId, observations, opts)
  return { profileVersion: PROFILE_VERSION, opponentId: p.opponentId, opportunities: p.opportunities }
}

/**
 * Compare two opponents dimension-by-dimension.
 * @param {{opponentId, observations}} a
 * @param {{opponentId, observations}} b
 */
export function compareOpponentProfiles(a, b, opts = {}) {
  const pa = buildOpponentProfile(a.opponentId, a.observations ?? [], opts)
  const pb = buildOpponentProfile(b.opponentId, b.observations ?? [], opts)
  const dimensions = DIMENSION_KEYS
    .filter(k => !DIMENSION_META[k].descriptive)
    .map(k => {
      const sa = pa.dimensions[k].score
      const sb = pb.dimensions[k].score
      let edge = 'even'
      if (sa != null && sb != null) edge = sa - sb >= 5 ? 'a' : sb - sa >= 5 ? 'b' : 'even'
      else if (sa != null) edge = 'a'
      else if (sb != null) edge = 'b'
      return { key: k, label: DIMENSION_META[k].label, a: sa, b: sb, edge }
    })
  const aEdges = dimensions.filter(d => d.edge === 'a').length
  const bEdges = dimensions.filter(d => d.edge === 'b').length
  return {
    profileVersion: PROFILE_VERSION,
    a: { opponentId: pa.opponentId, maturity: pa.maturity },
    b: { opponentId: pb.opponentId, maturity: pb.maturity },
    dimensions,
    summary: aEdges === bEdges
      ? 'Evenly matched across measured dimensions'
      : `${aEdges > bEdges ? pa.opponentId : pb.opponentId} holds the edge in more areas (${Math.max(aEdges, bEdges)} vs ${Math.min(aEdges, bEdges)})`,
  }
}

/**
 * Evolution: split observations into an earlier and a recent window and report
 * how each measured dimension moved.
 */
export function buildOpponentEvolution(opponentId, observations = [], opts = {}) {
  const sorted = sortIndexed(observations)
  const total = sorted.length
  const empty = { profileVersion: PROFILE_VERSION, opponentId: opponentId ?? null, windows: [], changes: [], trend: { mostChanged: [], summary: 'Not enough data to compare' } }
  if (total < 4) return empty

  const half = Math.floor(total / 2)
  const earlierObs = sorted.slice(0, half)
  const recentObs = sorted.slice(half)
  const earlier = buildOpponentProfile(opponentId, earlierObs, opts)
  const recent = buildOpponentProfile(opponentId, recentObs, opts)

  const measured = DIMENSION_KEYS.filter(k => !DIMENSION_META[k].descriptive)
  const changes = measured.map(k => {
    const from = earlier.dimensions[k].score
    const to = recent.dimensions[k].score
    const delta = (from != null && to != null) ? to - from : null
    const direction = delta == null ? 'emerging' : delta >= 5 ? 'rising' : delta <= -5 ? 'falling' : 'stable'
    return { key: k, label: DIMENSION_META[k].label, from, to, delta, direction }
  })
  const moved = changes.filter(c => c.delta != null && c.direction !== 'stable')
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  const window = (label, prof) => ({
    label,
    observationCount: prof.observationCount,
    maturity: prof.maturity,
    scores: Object.fromEntries(measured.map(k => [k, prof.dimensions[k].score])),
  })

  return {
    profileVersion: PROFILE_VERSION,
    opponentId: opponentId ?? null,
    windows: [window('earlier', earlier), window('recent', recent)],
    changes,
    trend: {
      mostChanged: moved.slice(0, 3).map(c => ({ key: c.key, label: c.label, delta: c.delta, direction: c.direction })),
      summary: moved.length ? `Biggest shift: ${moved[0].label} ${moved[0].direction} (${moved[0].delta > 0 ? '+' : ''}${moved[0].delta})` : 'Profile stable across windows',
    },
  }
}

// ── In-memory opponent observation store ─────────────────────────────────────

const store = new Map()   // opponentId → observations[]

export function recordOpponentObservations(opponentId, observations) {
  if (!opponentId) return 0
  const cur = store.get(opponentId) ?? []
  const next = [...cur, ...(Array.isArray(observations) ? observations : [observations])]
  store.set(opponentId, next)
  return next.length
}

export function recordOpponentObservation(opponentId, observation) {
  return recordOpponentObservations(opponentId, [observation])
}

export function getOpponentObservations(opponentId) {
  return store.get(opponentId) ?? []
}

export function resetOpponent(opponentId) {
  if (!opponentId) return null
  store.delete(opponentId)
  return { opponentId, reset: true }
}

export function exportOpponentProfile(opponentId, observations = [], opts = {}) {
  return {
    exportVersion: PROFILE_VERSION,
    exportedAt: opts.asOf ?? null,
    opponentId: opponentId ?? null,
    profile: buildOpponentProfile(opponentId, observations, opts),
  }
}

export function _clear() {
  store.clear()
}
