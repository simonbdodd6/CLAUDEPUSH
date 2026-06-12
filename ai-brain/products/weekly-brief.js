/**
 * AI Brain — Weekly Coach Brief product (M16)
 *
 * Composes AI.getDashboard() into a complete weekly coaching briefing.
 * A coach receives this at the start of each week: priorities, risks,
 * training checklist, attendance and medical summaries, selection reminders,
 * and recommended actions — all in one structured document.
 *
 * Source: getDashboard(coachId, clubId)
 * No LLM. No new reasoning. Pure composition.
 */

import { getDashboard }    from '../api/index.js'
import { toProduct, toProductError, toProductDisabled, isProductEnabled, apiOpts } from './product-response.js'
import { PRODUCT_ID, PRODUCT_FEATURE_FLAG, PRODUCT_ERROR, RISK_LEVEL, PRIORITY } from './product-types.js'

const ID = PRODUCT_ID.WEEKLY_BRIEF

// ── Section builders ──────────────────────────────────────────────────────────

function buildTopPriorities(topRecommendations = []) {
  return topRecommendations.slice(0, 5).map((rec, i) => ({
    rank:               i + 1,
    recommendationId:   rec.id,
    title:              rec.title      ?? null,
    category:           rec.category   ?? null,
    priority:           rec.priority   ?? null,
    confidence:         rec.confidence ?? null,
    action:             rec.action     ?? null,
    policyStatus:       rec.policyStatus ?? 'allowed',
  }))
}

function buildBiggestRisks(topRecommendations = [], urgentPolicyWarnings = []) {
  // Policy warnings are always a risk; supplement with HIGH-priority recs
  const warningIds = new Set(urgentPolicyWarnings.map(w => w.recommendationId))

  const fromWarnings = urgentPolicyWarnings.map(w => ({
    recommendationId: w.recommendationId,
    title:            w.title      ?? null,
    category:         w.category   ?? null,
    riskLevel:        w.policyStatus === 'blocked' ? RISK_LEVEL.HIGH : RISK_LEVEL.MEDIUM,
    policyStatus:     w.policyStatus,
    reason:           w.policyReason ?? null,
  }))

  const fromRecs = topRecommendations
    .filter(r => r.priority === 'HIGH' && !warningIds.has(r.id))
    .map(r => ({
      recommendationId: r.id,
      title:            r.title    ?? null,
      category:         r.category ?? null,
      riskLevel:        RISK_LEVEL.HIGH,
      policyStatus:     r.policyStatus ?? 'allowed',
      reason:           null,
    }))

  return [...fromWarnings, ...fromRecs].slice(0, 5)
}

function buildTrainingChecklist(planningChecklist = []) {
  return planningChecklist.map(item => ({
    actionId:         item.actionId,
    planId:           item.planId,
    recommendationId: item.recommendationId,
    title:            item.title           ?? null,
    suggestedDate:    item.suggestedDate   ?? null,
    estimatedMinutes: item.estimatedMinutes ?? null,
    planScope:        item.planScope       ?? null,
    planStatus:       item.planStatus      ?? null,
    done:             false,
  }))
}

function buildAttendanceSummary(importantObservations = [], topRecommendations = []) {
  const attObs = importantObservations.filter(o =>
    String(o.type ?? '').toLowerCase().includes('attendance') ||
    String(o.summary ?? '').toLowerCase().includes('attendance')
  )

  const attRec = topRecommendations.find(r =>
    String(r.category ?? '').toLowerCase().includes('training') &&
    String(r.title ?? '').toLowerCase().includes('attendance')
  ) ?? null

  const trend = attObs.length > 0
    ? (String(attObs[0].summary ?? '').toLowerCase().includes('improv') ? 'improving'
    :  String(attObs[0].summary ?? '').toLowerCase().includes('declin') ? 'declining'
    : 'stable')
    : 'unknown'

  return {
    trend,
    observationCount:   attObs.length,
    observations:       attObs.slice(0, 3),
    recommendationId:   attRec?.id ?? null,
  }
}

function buildMedicalSummary(topRecommendations = [], urgentPolicyWarnings = []) {
  const medRecs = topRecommendations.filter(r =>
    r.category === 'Medical' || r.category === 'Player Welfare'
  )
  const medWarnings = urgentPolicyWarnings.filter(w =>
    w.category === 'Medical' || w.category === 'Player Welfare'
  )

  return {
    total:    medRecs.length + medWarnings.length,
    concerns: [
      ...medWarnings.map(w => ({
        recommendationId: w.recommendationId,
        title:            w.title       ?? null,
        policyStatus:     w.policyStatus,
        severity:         'high',
      })),
      ...medRecs.map(r => ({
        recommendationId: r.id,
        title:            r.title ?? null,
        policyStatus:     r.policyStatus,
        severity:         r.priority === 'HIGH' ? 'high' : 'medium',
      })),
    ].slice(0, 5),
  }
}

function buildSelectionReminders(topRecommendations = []) {
  return topRecommendations
    .filter(r => r.category === 'Selection')
    .map(r => ({
      recommendationId: r.id,
      title:            r.title      ?? null,
      action:           r.action     ?? null,
      confidence:       r.confidence ?? null,
      priority:         r.priority   ?? null,
    }))
}

function buildRecommendedActions(topRecommendations = [], trainingChecklist = []) {
  const fromRecs = topRecommendations.slice(0, 3).map(r => ({
    source:    'recommendation',
    id:        r.id,
    title:     r.action ?? r.title ?? null,
    priority:  (r.priority ?? 'LOW').toLowerCase(),
    dueDate:   null,
  }))

  const fromChecklist = trainingChecklist.slice(0, 3).map(item => ({
    source:   'plan',
    id:       item.actionId,
    title:    item.title,
    priority: PRIORITY.MEDIUM,
    dueDate:  item.suggestedDate ?? null,
  }))

  // Interleave: rec, checklist, rec, checklist...
  const merged = []
  const maxLen  = Math.max(fromRecs.length, fromChecklist.length)
  for (let i = 0; i < maxLen; i++) {
    if (fromRecs[i])      merged.push(fromRecs[i])
    if (fromChecklist[i]) merged.push(fromChecklist[i])
  }
  return merged.slice(0, 7)
}

function buildExplanationIds(explanationSummaries = []) {
  return explanationSummaries
    .map(e => e.recommendationId)
    .filter(Boolean)
}

function computeConfidence(topRecommendations = [], dashConfidence) {
  if (typeof dashConfidence === 'number') return dashConfidence
  const values = topRecommendations
    .map(r => r.confidence)
    .filter(c => typeof c === 'number')
  if (values.length === 0) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate the Weekly Coach Brief for a coach and club.
 *
 * @param {string|null} coachId
 * @param {string|null} clubId
 * @param {object}      opts   - { flags?: Record<string, boolean> }
 * @returns {Promise<ProductResponse>}
 */
export async function getWeeklyBrief(coachId, clubId, opts = {}) {
  const t0 = Date.now()

  if (!isProductEnabled(PRODUCT_FEATURE_FLAG.WEEKLY_BRIEF, opts)) {
    return toProductDisabled(ID, PRODUCT_FEATURE_FLAG.WEEKLY_BRIEF, { t0 })
  }

  try {
    const dashResponse = await getDashboard(coachId, clubId, apiOpts(opts))

    if (!dashResponse.ok) {
      return toProductError(ID, dashResponse.error?.message ?? 'Dashboard unavailable', {
        t0, code: PRODUCT_ERROR.INTERNAL,
      })
    }

    const d = dashResponse.data

    const topPriorities      = buildTopPriorities(d.topRecommendations)
    const trainingChecklist  = buildTrainingChecklist(d.planningChecklist)
    const biggestRisks       = buildBiggestRisks(d.topRecommendations, d.urgentPolicyWarnings)
    const attendanceSummary  = buildAttendanceSummary(d.importantObservations, d.topRecommendations)
    const medicalSummary     = buildMedicalSummary(d.topRecommendations, d.urgentPolicyWarnings)
    const selectionReminders = buildSelectionReminders(d.topRecommendations)
    const recommendedActions = buildRecommendedActions(d.topRecommendations, trainingChecklist)
    const explanationIds     = buildExplanationIds(d.explanationSummaries)
    const confidence         = computeConfidence(d.topRecommendations, d.confidence)

    return toProduct(ID, {
      coachId,
      clubId,
      topPriorities,
      biggestRisks,
      trainingChecklist,
      attendanceSummary,
      medicalSummary,
      selectionReminders,
      recommendedActions,
      explanationIds,
      confidence,
      isMock: d.isMock ?? true,
    }, { t0 })

  } catch (err) {
    return toProductError(ID, err, { t0 })
  }
}
