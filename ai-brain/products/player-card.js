/**
 * AI Brain — Player Development Card product (M16)
 *
 * Composes getPlayerInsight() into a structured coaching card per player:
 * attendance, availability, improvement trend, coach observations, welfare
 * indicators, and development priorities.
 *
 * A coach uses this card when preparing for a one-to-one or when selecting
 * their squad. It aggregates everything the Brain knows about a player
 * into a single, easy-to-read snapshot.
 *
 * Source: getPlayerInsight(playerId)
 * No LLM. No new reasoning. Pure composition.
 */

import { getPlayerInsight }  from '../api/index.js'
import { toProduct, toProductError, toProductDisabled, isProductEnabled, apiOpts } from './product-response.js'
import { PRODUCT_ID, PRODUCT_FEATURE_FLAG, PRODUCT_ERROR, TREND, PRIORITY } from './product-types.js'

const ID = PRODUCT_ID.PLAYER_CARD

// ── Section builders ──────────────────────────────────────────────────────────

function buildImprovementTrend(improvementObservations = []) {
  if (improvementObservations.length === 0) {
    return { direction: TREND.UNKNOWN, observations: [] }
  }

  const positiveTerms = ['improv', 'progress', 'better', 'strong', 'develop']
  const negativeTerms = ['declin', 'poor', 'weak', 'concern', 'inconsist']
  const allText = improvementObservations.map(o => o.summary ?? '').join(' ').toLowerCase()

  const posScore = positiveTerms.filter(t => allText.includes(t)).length
  const negScore = negativeTerms.filter(t => allText.includes(t)).length

  const direction = posScore > negScore   ? TREND.IMPROVING
    : negScore > posScore                 ? TREND.DECLINING
    : improvementObservations.length > 0  ? TREND.STABLE
    : TREND.UNKNOWN

  return {
    direction,
    observations: improvementObservations.map(o => ({
      type:       o.type       ?? null,
      summary:    o.summary    ?? null,
      observedAt: o.observedAt ?? null,
      confidence: o.confidence ?? null,
    })),
  }
}

function buildCoachObservations(improvementObservations = [], welfareObservations = []) {
  return [
    ...improvementObservations.map(o => ({ ...o, context: 'improvement' })),
    ...welfareObservations.map(o =>    ({ ...o, context: 'welfare' })),
  ]
    .slice(0, 8)
    .map(o => ({
      context:    o.context    ?? null,
      type:       o.type       ?? null,
      summary:    o.summary    ?? null,
      observedAt: o.observedAt ?? null,
      confidence: o.confidence ?? null,
    }))
}

function buildDevelopmentPriorities(
  attendanceTrend,
  availabilityTrend,
  improvementTrend,
  welfareObservations = []
) {
  const priorities = []

  // Welfare concerns are always highest priority
  if (welfareObservations.length > 0) {
    priorities.push({
      area:     'Player Welfare',
      priority: PRIORITY.HIGH,
      summary:  welfareObservations[0].summary ?? 'Welfare observation requires attention',
    })
  }

  // Attendance decline
  if (attendanceTrend?.trend === TREND.DECLINING) {
    priorities.push({
      area:     'Attendance',
      priority: PRIORITY.HIGH,
      summary:  'Attendance trend is declining — review barriers and expectations',
    })
  }

  // Availability concern
  if (availabilityTrend?.trend === TREND.DECLINING) {
    priorities.push({
      area:     'Availability',
      priority: PRIORITY.MEDIUM,
      summary:  'Availability trend is declining — follow up before next selection',
    })
  }

  // Improvement opportunity
  if (improvementTrend?.direction === TREND.IMPROVING) {
    priorities.push({
      area:     'Performance Development',
      priority: PRIORITY.MEDIUM,
      summary:  'Player is showing improvement — maintain current development focus',
    })
  } else if (improvementTrend?.direction === TREND.DECLINING) {
    priorities.push({
      area:     'Performance Review',
      priority: PRIORITY.HIGH,
      summary:  'Performance indicators declining — schedule a development conversation',
    })
  }

  // Attendance is stable but low — gentle prompt
  if (attendanceTrend?.trend === TREND.STABLE && typeof attendanceTrend.recentRate === 'number' && attendanceTrend.recentRate < 60) {
    if (!priorities.some(p => p.area === 'Attendance')) {
      priorities.push({
        area:     'Attendance',
        priority: PRIORITY.MEDIUM,
        summary:  'Attendance rate is below target — set expectations early in the season',
      })
    }
  }

  return priorities.slice(0, 4)
}

function computeConfidence(improvementObs = [], welfareObs = []) {
  const values = [...improvementObs, ...welfareObs]
    .map(o => o.confidence)
    .filter(c => typeof c === 'number')
  if (values.length === 0) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate the Player Development Card for a player.
 *
 * @param {string}  playerId
 * @param {object}  opts   - { flags?: Record<string, boolean> }
 * @returns {Promise<ProductResponse>}
 */
export async function getPlayerCard(playerId, opts = {}) {
  const t0 = Date.now()

  if (!isProductEnabled(PRODUCT_FEATURE_FLAG.PLAYER_CARD, opts)) {
    return toProductDisabled(ID, PRODUCT_FEATURE_FLAG.PLAYER_CARD, { t0 })
  }

  if (!playerId) {
    return toProductError(ID, 'playerId is required', { t0, code: PRODUCT_ERROR.INVALID_INPUT })
  }

  try {
    const insightResponse = await getPlayerInsight(playerId, apiOpts(opts))

    if (!insightResponse.ok) {
      return toProductError(ID, insightResponse.error?.message ?? 'Player insight unavailable', {
        t0, code: PRODUCT_ERROR.INTERNAL,
      })
    }

    const d = insightResponse.data

    const improvementTrend       = buildImprovementTrend(d.improvementObservations)
    const coachObservations      = buildCoachObservations(d.improvementObservations, d.welfareObservations)
    const developmentPriorities  = buildDevelopmentPriorities(
      d.attendanceTrend, d.availabilityTrend, improvementTrend, d.welfareObservations
    )
    const explanationIds = (d.explanations ?? [])
      .map(e => e.recommendationId)
      .filter(Boolean)
    const confidence     = computeConfidence(d.improvementObservations, d.welfareObservations)

    return toProduct(ID, {
      playerId,
      attendance: {
        trend:      d.attendanceTrend?.trend      ?? TREND.UNKNOWN,
        recentRate: d.attendanceTrend?.recentRate ?? null,
        evidence:   d.attendanceTrend?.evidence   ?? [],
      },
      availability: {
        trend:      d.availabilityTrend?.trend      ?? TREND.UNKNOWN,
        recentRate: d.availabilityTrend?.recentRate ?? null,
        evidence:   d.availabilityTrend?.evidence   ?? [],
      },
      improvementTrend,
      coachObservations,
      welfareIndicators: (d.welfareObservations ?? []).map(o => ({
        type:       o.type       ?? null,
        summary:    o.summary    ?? null,
        observedAt: o.observedAt ?? null,
      })),
      developmentPriorities,
      explanationIds,
      confidence,
      isMock: d.isMock ?? true,
    }, { t0 })

  } catch (err) {
    return toProductError(ID, err, { t0 })
  }
}
