/**
 * AI Brain — getTeamInsight API (M15)
 *
 * Composes club health, recommendations, plans, and observations into a
 * team-level insight payload for a given teamId (= clubId in Core).
 * Core never sees Brain internals — only the shaped ApiResponse.
 *
 * Sources used (all best-effort, never throws):
 *   AI.request()              → recommendations, plans, policy
 *   AI.observations.forEntity() → training load, preparation observations
 *
 * No LLM. No database. No new logic. Composition only.
 */

import { AI }                       from '../index.js'
import { toSuccess, toError, toDisabled, isFlagEnabled } from './api-response.js'
import { FEATURE_FLAG, API_ERROR }  from './api-types.js'

// ── Internal shapers ──────────────────────────────────────────────────────────

const LOAD_KEYWORDS       = ['load', 'overload', 'training', 'intensity', 'fatigue']
const PREP_KEYWORDS       = ['preparation', 'match prep', 'pre-match', 'preparation checklist']
const AVAILABILITY_KEYWORDS = ['availability', 'available', 'unavailable']

function hasKeyword(text = '', keywords = []) {
  const lower = String(text).toLowerCase()
  return keywords.some(kw => lower.includes(kw))
}

function deriveLoadStatus(observations = []) {
  const loadObs = observations.filter(o =>
    hasKeyword(o.type ?? '', LOAD_KEYWORDS) ||
    hasKeyword(o.summary ?? '', LOAD_KEYWORDS)
  )

  if (loadObs.length === 0) return { status: 'unknown', observations: [] }

  const obs = loadObs.slice(0, 3).map(o => ({
    type:    o.type    ?? null,
    summary: o.summary ?? o.value ?? null,
  }))

  // If any observation mentions "overload" or "high" → high; "low" → low; else normal
  const allText = loadObs.map(o => o.summary ?? o.value ?? '').join(' ').toLowerCase()
  const status  = allText.includes('overload') || allText.includes('high') ? 'high'
    : allText.includes('low') || allText.includes('reduce')                ? 'low'
    : 'normal'

  return { status, observations: obs }
}

function derivePreparationStatus(plans = []) {
  const prepPlans = plans.filter(p => p.scope === 'preparation')

  if (prepPlans.length === 0) return { readiness: 'unknown', activePlans: [] }

  const activePlans = prepPlans
    .slice(0, 3)
    .map(p => ({
      planId:     p.planId,
      goal:       p.goal,
      status:     p.status,
      reviewDate: p.reviewDate,
    }))

  const readiness = prepPlans.some(p => p.status === 'active') ? 'in_progress'
    : prepPlans.some(p => p.status === 'draft')                ? 'not_started'
    : 'unknown'

  return { readiness, activePlans }
}

function shapeAvailability(observations = []) {
  const avObs = observations.filter(o =>
    hasKeyword(o.type ?? '', AVAILABILITY_KEYWORDS) ||
    hasKeyword(o.summary ?? '', AVAILABILITY_KEYWORDS)
  )

  // Without a live roster, derive symbolic counts from observations
  const confirmed   = avObs.filter(o =>
    hasKeyword(o.summary ?? '', ['confirmed', 'available'])
  ).length
  const unavailable = avObs.filter(o =>
    hasKeyword(o.summary ?? '', ['unavailable', 'injured', 'unavail'])
  ).length
  const pending     = Math.max(0, avObs.length - confirmed - unavailable)

  return {
    confirmed,
    pending,
    unavailable,
    total:   avObs.length > 0 ? avObs.length : null,
    isMock:  avObs.length === 0,
  }
}

function shapePlanningActions(plans = []) {
  return plans
    .flatMap(p =>
      (p.actions ?? [])
        .filter(a => a.status === 'pending')
        .slice(0, 2)
        .map(a => ({
          planId:           p.planId,
          recommendationId: p.recommendationId,
          title:            a.title,
          suggestedDate:    a.suggestedDate,
          planScope:        p.scope,
          planStatus:       p.status,
        }))
    )
    .slice(0, 8)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return a team insight payload for a given teamId.
 *
 * In Coach's Eye, teamId is the same as clubId.
 *
 * @param {string}      teamId
 * @param {object}      opts   - { flags?: Record<string, boolean> }
 * @returns {Promise<ApiResponse>}
 */
export async function getTeamInsight(teamId, opts = {}) {
  const t0 = Date.now()

  if (!isFlagEnabled(FEATURE_FLAG.TEAM_INSIGHT, opts)) {
    return toDisabled(FEATURE_FLAG.TEAM_INSIGHT, { t0 })
  }

  if (!teamId) {
    return toError('teamId is required', { t0, code: 'INVALID_INPUT' })
  }

  try {
    // ── Parallel Brain calls ─────────────────────────────────────────────────
    const [brainResponse, observations] = await Promise.all([
      AI.request({ clubId: teamId }).catch(() => ({
        recommendations: [], meta: { isMock: true, plans: [] },
      })),
      AI.observations.forEntity(teamId).catch(() => []),
    ])

    const recs  = brainResponse.recommendations ?? []
    const plans = brainResponse.meta?.plans      ?? []

    return toSuccess({
      teamId,
      squadHealth:       {
        score:  brainResponse.meta?.isMock ? null : Math.round(
          recs.length > 0
            ? recs.reduce((s, r) => s + (r.confidence ?? 50), 0) / recs.length
            : 50
        ),
        isMock: brainResponse.meta?.isMock ?? true,
      },
      availability:      shapeAvailability(observations ?? []),
      trainingLoad:      deriveLoadStatus(observations ?? []),
      preparationStatus: derivePreparationStatus(plans),
      planningActions:   shapePlanningActions(plans),
      isMock:            brainResponse.meta?.isMock ?? true,
    }, { t0 })

  } catch (err) {
    return toError(err, { t0, code: API_ERROR.INTERNAL })
  }
}
