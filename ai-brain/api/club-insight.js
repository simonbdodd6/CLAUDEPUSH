/**
 * AI Brain — getClubInsight API (M15)
 *
 * Composes club health, timeline events, memories, and recommendations
 * into a club-level operational insight payload.
 * Core never sees Brain internals — only the shaped ApiResponse.
 *
 * Sources used (all best-effort, never throws):
 *   AI.clubHealth()   → engagement score, operational health
 *   AI.request()      → recommendations, trends
 *   AI.timeline()     → recent activity events
 *   AI.memory.get()   → club-level memory patterns
 *
 * No LLM. No database. No new logic. Composition only.
 */

import { AI }                       from '../index.js'
import { toSuccess, toError, toDisabled, isFlagEnabled } from './api-response.js'
import { FEATURE_FLAG, API_ERROR, PRIORITY_RANK, API_LIMITS } from './api-types.js'

// ── Internal shapers ──────────────────────────────────────────────────────────

function shapeRecommendation(rec) {
  return {
    id:         rec.id,
    title:      rec.title      ?? null,
    category:   rec.category   ?? null,
    priority:   rec.priority   ?? null,
    confidence: rec.confidence ?? null,
  }
}

function shapeTopRecommendations(recs = []) {
  return recs
    .filter(r => r.policy?.status !== 'blocked')
    .sort((a, b) =>
      (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0)
    )
    .slice(0, API_LIMITS.TOP_RECOMMENDATIONS)
    .map(shapeRecommendation)
}

function deriveTrends(recs = [], memories = []) {
  // Build trends from HIGH-priority recs as the primary signal
  const recTrends = recs
    .filter(r => r.priority === 'HIGH')
    .slice(0, 3)
    .map(r => ({
      type:      r.category ?? 'General',
      direction: r.policy?.status === 'blocked' ? 'warning' : 'attention',
      summary:   r.title ?? null,
    }))

  // Pad with memory-derived trends if rec trends are sparse
  const memTrends = memories
    .slice(0, API_LIMITS.TRENDS - recTrends.length)
    .map(m => ({
      type:      m.type      ?? 'General',
      direction: 'stable',
      summary:   m.summary   ?? m.label ?? null,
    }))
    .filter(t => t.summary)

  return [...recTrends, ...memTrends].slice(0, API_LIMITS.TRENDS)
}

function shapeActivity(events = []) {
  return {
    totalEvents:   events.length,
    recentEvents:  events
      .slice(0, API_LIMITS.RECENT_EVENTS)
      .map(e => ({
        type:        e.type        ?? null,
        occurredAt:  e.occurredAt  ?? e.timestamp ?? null,
        summary:     e.metadata?.summary ?? null,
      })),
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return a club insight payload for a given clubId.
 *
 * @param {string}      clubId
 * @param {object}      opts   - { flags?: Record<string, boolean> }
 * @returns {Promise<ApiResponse>}
 */
export async function getClubInsight(clubId, opts = {}) {
  const t0 = Date.now()

  if (!isFlagEnabled(FEATURE_FLAG.CLUB_INSIGHT, opts)) {
    return toDisabled(FEATURE_FLAG.CLUB_INSIGHT, { t0 })
  }

  if (!clubId) {
    return toError('clubId is required', { t0, code: 'INVALID_INPUT' })
  }

  try {
    // ── Parallel Brain calls ─────────────────────────────────────────────────
    const [clubHealthResult, brainResponse, timelineResult, memories] = await Promise.all([
      AI.clubHealth().catch(() => ({
        health:   { overallScore: null, trend: 'unknown', isMock: true },
        insights: [],
      })),
      AI.request({ clubId }).catch(() => ({
        recommendations: [], meta: { isMock: true },
      })),
      AI.timeline({ clubId }).catch(() => ({ events: [], total: 0, stats: {} })),
      AI.memory.get(clubId).catch(() => []),
    ])

    const recs    = brainResponse.recommendations ?? []
    const health  = clubHealthResult.health        ?? {}
    const events  = timelineResult.events          ?? []

    // ── Operational health from Brain diagnostics ────────────────────────────
    const statusResult = await AI.status().catch(() => null)
    const operationalHealth = {
      score:  statusResult?.cis?.score ?? null,
      grade:  statusResult?.cis?.grade ?? null,
      isMock: statusResult == null,
    }

    return toSuccess({
      clubId,
      activity:           shapeActivity(events),
      engagement: {
        score:  typeof health.overallScore === 'number' ? health.overallScore : null,
        trend:  health.trend  ?? 'unknown',
        isMock: health.isMock ?? true,
      },
      operationalHealth,
      trends:             deriveTrends(recs, memories ?? []),
      recommendations:    shapeTopRecommendations(recs),
      isMock:             brainResponse.meta?.isMock ?? true,
    }, { t0 })

  } catch (err) {
    return toError(err, { t0, code: API_ERROR.INTERNAL })
  }
}
