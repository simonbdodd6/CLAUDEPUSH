/**
 * AI Brain — Club Health Snapshot product (M16)
 *
 * Composes getClubInsight() into a club-level health snapshot:
 * engagement, attendance, operational health, activity trends,
 * key warnings, and suggested focus areas.
 *
 * A club administrator or head coach uses this snapshot to understand
 * the state of the club at a glance and decide where to focus energy.
 *
 * Source: getClubInsight(clubId)
 * No LLM. No new reasoning. Pure composition.
 */

import { getClubInsight }    from '../api/index.js'
import { toProduct, toProductError, toProductDisabled, isProductEnabled, apiOpts } from './product-response.js'
import { PRODUCT_ID, PRODUCT_FEATURE_FLAG, PRODUCT_ERROR, PRIORITY, scoreToGrade } from './product-types.js'

const ID = PRODUCT_ID.CLUB_SNAPSHOT

// ── Section builders ──────────────────────────────────────────────────────────

function buildEngagement(engagementData = {}) {
  const score = engagementData.score
  return {
    score,
    trend:  engagementData.trend  ?? 'unknown',
    grade:  scoreToGrade(score),
    isMock: engagementData.isMock ?? true,
  }
}

function buildAttendanceSummary(trends = []) {
  const attTrend = trends.find(t =>
    String(t.type ?? '').toLowerCase().includes('attendance') ||
    String(t.type ?? '').toLowerCase().includes('training')
  )

  if (!attTrend) {
    return { trend: 'unknown', summary: null }
  }

  return {
    trend:   attTrend.direction ?? 'unknown',
    summary: attTrend.summary   ?? null,
  }
}

function buildOperationalHealth(operationalHealth = {}) {
  const score  = operationalHealth.score
  const grade  = scoreToGrade(score)
  const isMock = operationalHealth.isMock ?? true

  const summary = typeof score !== 'number' ? 'Status unavailable'
    : score >= 80 ? 'Systems operating well'
    : score >= 60 ? 'Systems operating normally'
    : score >= 40 ? 'Some systems need attention'
    : 'Multiple systems need attention'

  return {
    score,
    grade,
    summary,
    isMock,
    rawGrade: operationalHealth.grade ?? null,
  }
}

function buildActivityTrends(trends = []) {
  return trends.map(t => ({
    type:      t.type      ?? null,
    direction: t.direction ?? 'stable',
    summary:   t.summary   ?? null,
  }))
}

function buildKeyWarnings(recommendations = [], trends = []) {
  const fromRecs = recommendations
    .filter(r => r.priority === 'HIGH')
    .map(r => ({
      source:   'recommendation',
      id:       r.id        ?? null,
      title:    r.title     ?? null,
      category: r.category  ?? null,
      priority: PRIORITY.HIGH,
    }))

  const fromTrends = trends
    .filter(t => t.direction === 'warning' || t.direction === 'declining')
    .map(t => ({
      source:   'trend',
      id:       null,
      title:    t.summary ?? t.type ?? 'Trend warning',
      category: t.type    ?? null,
      priority: PRIORITY.MEDIUM,
    }))

  return [...fromRecs, ...fromTrends].slice(0, 6)
}

function buildSuggestedFocusAreas(recommendations = [], trends = [], operationalHealth = {}) {
  const areas = []

  // Top recommendations drive focus areas
  for (const rec of recommendations.slice(0, 2)) {
    if (rec.category) {
      areas.push({
        area:      rec.category,
        rationale: rec.title ?? null,
        priority:  (rec.priority ?? 'MEDIUM').toLowerCase(),
      })
    }
  }

  // Poor operational health → infrastructure focus
  if (typeof operationalHealth.score === 'number' && operationalHealth.score < 60) {
    if (!areas.some(a => a.area === 'Operations')) {
      areas.push({
        area:      'Operations',
        rationale: operationalHealth.summary ?? 'Operational health below target',
        priority:  operationalHealth.score < 40 ? PRIORITY.HIGH : PRIORITY.MEDIUM,
      })
    }
  }

  // Warning trends
  for (const t of trends.filter(t => t.direction === 'warning')) {
    if (areas.length >= 3) break
    areas.push({
      area:      t.type      ?? 'General',
      rationale: t.summary   ?? null,
      priority:  PRIORITY.MEDIUM,
    })
  }

  return areas.slice(0, 3)
}

function buildExplanationIds(recommendations = []) {
  return recommendations.map(r => r.id).filter(Boolean)
}

function computeConfidence(recommendations = [], engagementData = {}) {
  const recVals = recommendations
    .map(r => r.confidence)
    .filter(c => typeof c === 'number')
  const engVal  = typeof engagementData.score === 'number' ? [engagementData.score] : []
  const all     = [...recVals, ...engVal]
  if (all.length === 0) return null
  return Math.round(all.reduce((a, b) => a + b, 0) / all.length)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate the Club Health Snapshot for a club.
 *
 * @param {string}  clubId
 * @param {object}  opts   - { flags?: Record<string, boolean> }
 * @returns {Promise<ProductResponse>}
 */
export async function getClubSnapshot(clubId, opts = {}) {
  const t0 = Date.now()

  if (!isProductEnabled(PRODUCT_FEATURE_FLAG.CLUB_SNAPSHOT, opts)) {
    return toProductDisabled(ID, PRODUCT_FEATURE_FLAG.CLUB_SNAPSHOT, { t0 })
  }

  if (!clubId) {
    return toProductError(ID, 'clubId is required', { t0, code: PRODUCT_ERROR.INVALID_INPUT })
  }

  try {
    const clubResponse = await getClubInsight(clubId, apiOpts(opts))

    if (!clubResponse.ok) {
      return toProductError(ID, clubResponse.error?.message ?? 'Club insight unavailable', {
        t0, code: PRODUCT_ERROR.INTERNAL,
      })
    }

    const d = clubResponse.data

    const operationalHealth  = buildOperationalHealth(d.operationalHealth)
    const keyWarnings        = buildKeyWarnings(d.recommendations, d.trends)
    const suggestedFocusAreas = buildSuggestedFocusAreas(d.recommendations, d.trends, operationalHealth)

    return toProduct(ID, {
      clubId,
      engagement:          buildEngagement(d.engagement),
      attendance:          buildAttendanceSummary(d.trends),
      operationalHealth,
      activityTrends:      buildActivityTrends(d.trends),
      keyWarnings,
      suggestedFocusAreas,
      explanationIds:      buildExplanationIds(d.recommendations),
      confidence:          computeConfidence(d.recommendations, d.engagement),
      isMock:              d.isMock ?? true,
    }, { t0 })

  } catch (err) {
    return toProductError(ID, err, { t0 })
  }
}
