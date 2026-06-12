/**
 * AI Brain — Match Readiness Report product (M16)
 *
 * Composes getDashboard + getTeamInsight + getClubInsight into a
 * pre-match operational snapshot: squad readiness, availability, injury
 * concerns, training completion, preparation checklist, and missing actions.
 *
 * Sources: getDashboard(null, teamId), getTeamInsight(teamId), getClubInsight(teamId)
 * No LLM. No new reasoning. Pure composition.
 */

import { getDashboard, getTeamInsight, getClubInsight } from '../api/index.js'
import { toProduct, toProductError, toProductDisabled, isProductEnabled, apiOpts } from './product-response.js'
import { PRODUCT_ID, PRODUCT_FEATURE_FLAG, PRODUCT_ERROR } from './product-types.js'

const ID = PRODUCT_ID.MATCH_READINESS

const WELFARE_KEYWORDS = ['injury', 'medical', 'welfare', 'concern', 'unavailable', 'physio']
const PREP_SCOPE       = 'preparation'

// ── Section builders ──────────────────────────────────────────────────────────

function computeSquadReadinessPct(squadHealth) {
  const score = squadHealth?.score
  return typeof score === 'number' ? score : null
}

function computeAvailabilityPct(availability) {
  if (!availability) return null
  const { confirmed, total } = availability
  if (typeof total !== 'number' || total <= 0) return null
  return Math.round((confirmed / total) * 100)
}

function buildInjuryConcerns(importantObservations = [], urgentPolicyWarnings = []) {
  const fromObs = importantObservations
    .filter(o =>
      WELFARE_KEYWORDS.some(kw =>
        String(o.type ?? '').toLowerCase().includes(kw) ||
        String(o.summary ?? '').toLowerCase().includes(kw)
      )
    )
    .map(o => ({
      source:     'observation',
      type:       o.type    ?? null,
      summary:    o.summary ?? null,
      observedAt: o.observedAt ?? null,
      confidence: o.confidence ?? null,
    }))

  const fromWarnings = urgentPolicyWarnings
    .filter(w =>
      w.category === 'Medical' || w.category === 'Player Welfare' ||
      WELFARE_KEYWORDS.some(kw => String(w.title ?? '').toLowerCase().includes(kw))
    )
    .map(w => ({
      source:           'policy',
      type:             w.category ?? 'Medical',
      summary:          w.title    ?? null,
      recommendationId: w.recommendationId,
      observedAt:       null,
      confidence:       null,
    }))

  return [...fromWarnings, ...fromObs].slice(0, 5)
}

function buildTrainingCompletion(planningChecklist = []) {
  const total            = planningChecklist.length
  const estimatedMinutes = planningChecklist.reduce(
    (sum, item) => sum + (item.estimatedMinutes ?? 0), 0
  )
  return { total, estimatedMinutes }
}

function buildPreparationChecklist(planningActions = [], preparationStatus = {}) {
  // Active preparation plans from team insight
  const fromPlans = (preparationStatus.activePlans ?? []).map(p => ({
    planId:        p.planId,
    title:         p.goal   ?? null,
    status:        p.status ?? null,
    reviewDate:    p.reviewDate ?? null,
    suggestedDate: null,
    source:        'plan',
  }))

  // Planning actions that are preparation-scoped
  const fromActions = planningActions
    .filter(a => a.planScope === PREP_SCOPE)
    .map(a => ({
      planId:        a.planId,
      title:         a.title  ?? null,
      status:        a.planStatus ?? null,
      reviewDate:    null,
      suggestedDate: a.suggestedDate ?? null,
      source:        'action',
    }))

  const seen = new Set()
  return [...fromPlans, ...fromActions]
    .filter(item => {
      if (seen.has(item.planId)) return false
      seen.add(item.planId)
      return true
    })
    .slice(0, 10)
}

function buildMissingActions(planningActions = []) {
  const now = new Date()
  return planningActions
    .filter(a => a.planStatus !== 'done' && a.suggestedDate)
    .map(a => ({
      planId:        a.planId,
      recommendationId: a.recommendationId ?? null,
      title:         a.title        ?? null,
      suggestedDate: a.suggestedDate,
      planScope:     a.planScope    ?? null,
      planStatus:    a.planStatus   ?? null,
      overdue:       new Date(a.suggestedDate) < now,
    }))
    .sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0))
    .slice(0, 8)
}

function buildExplanationIds(explanationSummaries = []) {
  return explanationSummaries.map(e => e.recommendationId).filter(Boolean)
}

function computeConfidence(dashData, teamData) {
  const dash  = dashData?.confidence
  const squad = teamData?.squadHealth?.score
  const vals  = [dash, squad].filter(v => typeof v === 'number')
  if (vals.length === 0) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate the Match Readiness Report for a team.
 *
 * @param {string}  teamId
 * @param {object}  opts   - { flags?: Record<string, boolean> }
 * @returns {Promise<ProductResponse>}
 */
export async function getMatchReadiness(teamId, opts = {}) {
  const t0 = Date.now()

  if (!isProductEnabled(PRODUCT_FEATURE_FLAG.MATCH_READINESS, opts)) {
    return toProductDisabled(ID, PRODUCT_FEATURE_FLAG.MATCH_READINESS, { t0 })
  }

  if (!teamId) {
    return toProductError(ID, 'teamId is required', { t0, code: PRODUCT_ERROR.INVALID_INPUT })
  }

  try {
    const passOpts = apiOpts(opts)

    // All three API calls in parallel — each is best-effort
    const [dashResponse, teamResponse, clubResponse] = await Promise.all([
      getDashboard(null, teamId, passOpts).catch(() => ({ ok: false, data: null })),
      getTeamInsight(teamId, passOpts).catch(() => ({ ok: false, data: null })),
      getClubInsight(teamId, passOpts).catch(() => ({ ok: false, data: null })),
    ])

    const dash = dashResponse.ok ? dashResponse.data : null
    const team = teamResponse.ok ? teamResponse.data : null

    const planningChecklist  = dash?.planningChecklist  ?? []
    const importantObs       = dash?.importantObservations ?? []
    const urgentWarnings     = dash?.urgentPolicyWarnings  ?? []
    const explanationSums    = dash?.explanationSummaries  ?? []
    const planningActions    = team?.planningActions       ?? []
    const preparationStatus  = team?.preparationStatus     ?? {}
    const squadHealth        = team?.squadHealth           ?? {}
    const availability       = team?.availability          ?? {}

    return toProduct(ID, {
      teamId,
      squadReadinessPct:    computeSquadReadinessPct(squadHealth),
      availabilityPct:      computeAvailabilityPct(availability),
      injuryConcerns:       buildInjuryConcerns(importantObs, urgentWarnings),
      trainingCompletion:   buildTrainingCompletion(planningChecklist),
      preparationChecklist: buildPreparationChecklist(planningActions, preparationStatus),
      missingActions:       buildMissingActions(planningActions),
      explanationIds:       buildExplanationIds(explanationSums),
      confidence:           computeConfidence(dash, team),
      isMock: (dash?.isMock ?? true) && (team?.isMock ?? true),
    }, { t0 })

  } catch (err) {
    return toProductError(ID, err, { t0 })
  }
}
