/**
 * AI Brain — getPlayerInsight API (M15)
 *
 * Composes Memory and Observation outputs into a per-player insight payload.
 * Core never sees Brain internals — only the shaped ApiResponse.
 *
 * Sources used (all best-effort, never throws):
 *   AI.memory.get()              → attendance + availability + welfare memories
 *   AI.observations.forEntity()  → typed observation records
 *
 * No LLM. No database. No new logic. Composition only.
 */

import { AI }                       from '../index.js'
import { toSuccess, toError, toDisabled, isFlagEnabled } from './api-response.js'
import { FEATURE_FLAG, API_ERROR }  from './api-types.js'

// ── Memory type classifiers ───────────────────────────────────────────────────

const ATTENDANCE_TYPES  = ['ATTENDANCE', 'attendance', 'session_attendance']
const AVAILABILITY_TYPES = ['AVAILABILITY', 'availability', 'match_availability']
const WELFARE_TYPES     = ['WELFARE', 'welfare', 'injury', 'medical', 'Player Welfare']
const IMPROVEMENT_TYPES = ['IMPROVEMENT', 'performance', 'skill', 'PERFORMANCE', 'FORM']

function classifyMemories(memories = []) {
  const attendance   = []
  const availability = []
  const welfare      = []
  const improvement  = []

  for (const m of memories) {
    const t = String(m.type ?? m.category ?? '').toUpperCase()
    if (ATTENDANCE_TYPES.some(x => t.includes(x.toUpperCase())))        attendance.push(m)
    else if (AVAILABILITY_TYPES.some(x => t.includes(x.toUpperCase()))) availability.push(m)
    else if (WELFARE_TYPES.some(x => t.includes(x.toUpperCase())))      welfare.push(m)
    else if (IMPROVEMENT_TYPES.some(x => t.includes(x.toUpperCase())))  improvement.push(m)
  }
  return { attendance, availability, welfare, improvement }
}

function classifyObservations(observations = []) {
  const welfare     = []
  const improvement = []
  const other       = []

  for (const obs of observations) {
    const t = String(obs.type ?? '').toUpperCase()
    if (WELFARE_TYPES.some(x => t.includes(x.toUpperCase())))      welfare.push(obs)
    else if (IMPROVEMENT_TYPES.some(x => t.includes(x.toUpperCase()))) improvement.push(obs)
    else other.push(obs)
  }
  return { welfare, improvement, other }
}

// ── Trend derivation ──────────────────────────────────────────────────────────

function deriveTrend(memories = []) {
  if (memories.length === 0) {
    return { trend: 'unknown', recentRate: null, evidence: [] }
  }

  // Use count as a proxy: more than 3 positive memories = improving tendency
  const evidence = memories
    .slice(0, 3)
    .map(m => m.summary ?? m.value ?? m.label ?? 'observation')
    .filter(Boolean)

  // Simple heuristic: look at the most recent memory's value if numeric
  const values = memories
    .map(m => typeof m.value === 'number' ? m.value : null)
    .filter(v => v !== null)

  let trend       = 'stable'
  let recentRate  = null

  if (values.length >= 2) {
    const delta = values[0] - values[values.length - 1]
    trend      = delta > 5 ? 'improving' : delta < -5 ? 'declining' : 'stable'
    recentRate = values[0]
  } else if (values.length === 1) {
    recentRate = values[0]
  }

  return { trend, recentRate, evidence }
}

function shapeObservation(obs) {
  return {
    type:       obs.type       ?? null,
    summary:    obs.summary    ?? obs.value ?? obs.label ?? null,
    observedAt: obs.observedAt ?? null,
    confidence: obs.confidence ?? null,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return a player insight payload for a given player entity.
 *
 * @param {string}      playerId
 * @param {object}      opts     - { flags?: Record<string, boolean> }
 * @returns {Promise<ApiResponse>}
 */
export async function getPlayerInsight(playerId, opts = {}) {
  const t0 = Date.now()

  if (!isFlagEnabled(FEATURE_FLAG.PLAYER_INSIGHT, opts)) {
    return toDisabled(FEATURE_FLAG.PLAYER_INSIGHT, { t0 })
  }

  if (!playerId) {
    return toError('playerId is required', { t0, code: 'INVALID_INPUT' })
  }

  try {
    // ── Memory and observations (both best-effort) ───────────────────────────
    const [memories, observations] = await Promise.all([
      AI.memory.get(playerId).catch(() => []),
      AI.observations.forEntity(playerId).catch(() => []),
    ])

    const memGroups = classifyMemories(memories ?? [])
    const obsGroups = classifyObservations(observations ?? [])

    // ── Evidence: union of evidence strings from memories ───────────────────
    const supportingEvidence = [
      ...memGroups.attendance.flatMap(m => m.sourceEventIds ?? []),
      ...memGroups.availability.flatMap(m => m.sourceEventIds ?? []),
    ].filter(Boolean).slice(0, 10)

    // ── Explanations: shaped from welfare or improvement observations ────────
    const explanations = [
      ...obsGroups.welfare, ...obsGroups.improvement,
    ]
      .slice(0, 3)
      .map(obs => ({
        type:    obs.type    ?? null,
        summary: obs.summary ?? obs.value ?? null,
      }))
      .filter(e => e.summary)

    return toSuccess({
      playerId,
      attendanceTrend:        deriveTrend(memGroups.attendance),
      availabilityTrend:      deriveTrend(memGroups.availability),
      improvementObservations: obsGroups.improvement.slice(0, 5).map(shapeObservation),
      welfareObservations:    obsGroups.welfare.slice(0, 5).map(shapeObservation),
      supportingEvidence,
      explanations,
      isMock: (memories ?? []).length === 0 && (observations ?? []).length === 0,
    }, { t0 })

  } catch (err) {
    return toError(err, { t0, code: API_ERROR.INTERNAL })
  }
}
