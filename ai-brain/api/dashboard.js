/**
 * AI Brain — getDashboard API (M15)
 *
 * Composes Brain module outputs into a single coach dashboard payload.
 * Core never sees Brain internals — only the shaped ApiResponse.
 *
 * Sources used (all best-effort, never throws):
 *   AI.request()              → recommendations, plans, policy
 *   AI.observations.forEntity() → club/coach observations
 *   AI.explain()              → plain-language explanation summaries
 *
 * No LLM. No database. No new logic. Composition only.
 */

import { AI }                       from '../index.js'
import { toSuccess, toError, toDisabled, isFlagEnabled } from './api-response.js'
import { FEATURE_FLAG, API_ERROR, PRIORITY_RANK, API_LIMITS } from './api-types.js'

// ── Internal shapers ──────────────────────────────────────────────────────────

function shapeRecommendation(rec) {
  return {
    id:           rec.id,
    title:        rec.title        ?? null,
    category:     rec.category     ?? null,
    priority:     rec.priority     ?? null,
    confidence:   rec.confidence   ?? null,
    action:       rec.action       ?? null,
    policyStatus: rec.policy?.status ?? 'allowed',
  }
}

function shapeTopRecommendations(recs) {
  return recs
    .filter(r => r.policy?.status !== 'blocked')
    .sort((a, b) =>
      (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0)
    )
    .slice(0, API_LIMITS.TOP_RECOMMENDATIONS)
    .map(shapeRecommendation)
}

function shapePlanningChecklist(plans) {
  return (plans ?? [])
    .flatMap(p =>
      (p.actions ?? [])
        .filter(a => a.status === 'pending')
        .slice(0, 3)
        .map(a => ({
          planId:            p.planId,
          recommendationId:  p.recommendationId,
          actionId:          a.actionId,
          title:             a.title,
          suggestedDate:     a.suggestedDate,
          estimatedMinutes:  a.estimatedMinutes,
          planScope:         p.scope,
          planStatus:        p.status,
        }))
    )
    .slice(0, API_LIMITS.PLANNING_CHECKLIST)
}

function shapeObservation(obs) {
  return {
    type:        obs.type       ?? null,
    entityId:    obs.entityId   ?? null,
    summary:     obs.summary    ?? obs.value ?? obs.label ?? null,
    observedAt:  obs.observedAt ?? null,
    confidence:  obs.confidence ?? null,
  }
}

function shapeUrgentPolicyWarnings(recs) {
  return recs
    .filter(r => r.policy?.status === 'blocked' || r.policy?.status === 'needs_review')
    .slice(0, API_LIMITS.POLICY_WARNINGS)
    .map(r => ({
      recommendationId: r.id,
      title:            r.title       ?? null,
      category:         r.category    ?? null,
      policyStatus:     r.policy.status,
      policyReason:     r.policy.reason ?? null,
    }))
}

async function buildExplanationSummaries(topRecs) {
  const results = await Promise.all(
    topRecs.slice(0, API_LIMITS.EXPLANATION_SUMMARIES).map(async rec => {
      try {
        const exp = await AI.explain(rec.id)
        if (!exp) return null
        return {
          recommendationId: rec.id,
          summary:          exp.plainLanguageExplanation ?? null,
          confidence:       exp.confidence ?? rec.confidence ?? null,
          reasoner:         exp.reasoner   ?? null,
        }
      } catch { return null }
    })
  )
  return results.filter(Boolean)
}

function computeAverageConfidence(recs) {
  const values = recs
    .map(r => r.confidence)
    .filter(c => typeof c === 'number' && !isNaN(c))
  if (values.length === 0) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return a coach dashboard payload composed from all active Brain modules.
 *
 * @param {string|null} coachId
 * @param {string|null} clubId
 * @param {object}      opts    - { flags?: Record<string, boolean> }
 * @returns {Promise<ApiResponse>}
 */
export async function getDashboard(coachId, clubId, opts = {}) {
  const t0 = Date.now()

  if (!isFlagEnabled(FEATURE_FLAG.DASHBOARD, opts)) {
    return toDisabled(FEATURE_FLAG.DASHBOARD, { t0 })
  }

  try {
    // ── Primary: recommendations + plans ────────────────────────────────────
    const brainResponse = await AI.request({ coachId, clubId }).catch(() => ({
      recommendations: [], meta: { isMock: true, plans: [] },
    }))
    const recs  = brainResponse.recommendations ?? []
    const plans = brainResponse.meta?.plans ?? []

    // ── Observations (best-effort) ───────────────────────────────────────────
    const obsSource = clubId ?? coachId
    const rawObs = obsSource
      ? await AI.observations.forEntity(obsSource).catch(() => [])
      : await AI.observations.all().catch(() => [])
    const importantObservations = (rawObs ?? [])
      .slice(0, API_LIMITS.OBSERVATIONS)
      .map(shapeObservation)

    // ── Shape sections ───────────────────────────────────────────────────────
    const topRecommendations  = shapeTopRecommendations(recs)
    const planningChecklist   = shapePlanningChecklist(plans)
    const urgentPolicyWarnings = shapeUrgentPolicyWarnings(recs)
    const explanationSummaries = await buildExplanationSummaries(topRecommendations)
    const confidence           = computeAverageConfidence(topRecommendations)

    return toSuccess({
      coachId:               coachId  ?? null,
      clubId:                clubId   ?? null,
      topRecommendations,
      planningChecklist,
      importantObservations,
      urgentPolicyWarnings,
      explanationSummaries,
      confidence,
      isMock:                brainResponse.meta?.isMock ?? true,
    }, { t0 })

  } catch (err) {
    return toError(err, { t0, code: API_ERROR.INTERNAL })
  }
}
