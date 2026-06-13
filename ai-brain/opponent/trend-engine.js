/**
 * AI Brain — Opponent Trend Engine + shared statistics (M24)
 *
 * Provides the deterministic statistics every dimension engine relies on:
 *   - sortIndexed   : stable, time-ordered observation stream with global index
 *   - scoreConfidence: saturation × recency (more evidence → higher; stale → lower)
 *   - computeTrend  : earlier-half vs later-half direction of a metric
 *   - buildEntry    : the standard dimension entry (score, confidence, evidence,
 *                     observationCount, lastUpdated, trend, summary)
 *
 * Also derives the three time-based dimensions that are inherently about trend:
 *   substitutionBehaviour, fitnessTrends, lateGameBehaviour.
 *
 * Pure + deterministic. No wall-clock — recency and trend are measured in
 * observation order, never time-of-day.
 */

import {
  OPP_EVENT, DIMENSION, DIMENSION_META,
  SATURATION_K, RECENCY_SCALE, MAX_EVIDENCE, TREND_THRESHOLD,
} from './opponent-types.js'

// ── tiny pure helpers (shared) ───────────────────────────────────────────────

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
export const num = (v, d = 0) => (isNum(v) ? v : d)
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
export const round = (n) => Math.round(n)
export const round2 = (n) => Math.round(n * 100) / 100
export const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0)

/** Stable, time-ordered stream; each obs tagged with a global _idx. */
export function sortIndexed(observations) {
  const obs = Array.isArray(observations) ? observations : []
  return [...obs]
    .sort((a, b) => {
      const ta = a.recordedAt ?? '', tb = b.recordedAt ?? ''
      if (ta !== tb) return ta < tb ? -1 : 1
      return String(a.observationId) < String(b.observationId) ? -1 : 1
    })
    .map((o, i) => ({ ...o, _idx: i }))
}

/** Confidence from sample count and recency of the latest supporting sample. */
export function scoreConfidence(n, lastIdx, totalObs) {
  if (n <= 0) return 0
  const saturation = n / (n + SATURATION_K)
  const gap = Math.max(0, (totalObs - 1) - lastIdx)
  const recency = 1 / (1 + gap / RECENCY_SCALE)
  return round2(saturation * recency)
}

/** Direction of a metric over time (earlier half vs later half). */
export function computeTrend(samples) {
  const s = (samples ?? []).filter(x => isNum(x.value))
  if (s.length < 4) return { direction: 'emerging', delta: 0, samples: s.length }
  const sorted = [...s].sort((a, b) => ((a.recordedAt ?? '') < (b.recordedAt ?? '') ? -1 : 1))
  const half = Math.floor(sorted.length / 2)
  const earlier = mean(sorted.slice(0, half).map(x => x.value))
  const later = mean(sorted.slice(half).map(x => x.value))
  const delta = round2(later - earlier)
  const direction = delta >= TREND_THRESHOLD ? 'rising' : delta <= -TREND_THRESHOLD ? 'falling' : 'stable'
  return { direction, delta, earlier: round2(earlier), later: round2(later), samples: sorted.length }
}

/** Empty (no-data) dimension entry. */
export function emptyEntry(key, label, meta = {}) {
  return {
    key, label,
    score: null, metrics: {}, confidence: 0,
    evidence: [], observationCount: 0, lastUpdated: null,
    trend: { direction: 'emerging', delta: 0, samples: 0 },
    summary: 'No data observed yet',
    higherIsBetter: meta.higherIsBetter ?? true,
    descriptive: meta.descriptive ?? false,
  }
}

/**
 * Build a standard dimension entry from a set of relevant (filtered) observations.
 * @param {object} o
 *  - key, label, score (0–100), metrics, summary
 *  - relevant   : the filtered, _idx-tagged observations supporting this dimension
 *  - valueOf    : obs → numeric sample for trend (0/1 rate, points diff, etc.)
 *  - totalObs   : full stream length (for recency)
 *  - meta       : { higherIsBetter, descriptive }
 */
export function buildEntry({ key, label, score, metrics = {}, summary = '', relevant, valueOf, totalObs, meta = {} }) {
  const n = relevant.length
  if (n === 0) return emptyEntry(key, label, meta)
  const lastIdx = Math.max(...relevant.map(o => o._idx))
  const lastUpdated = relevant[n - 1].recordedAt ?? null
  return {
    key, label,
    score: score == null ? null : clamp(round(score), 0, 100),
    metrics,
    confidence: scoreConfidence(n, lastIdx, totalObs),
    evidence: relevant.slice(-MAX_EVIDENCE).reverse().map(o => o.observationId),
    observationCount: n,
    lastUpdated,
    trend: computeTrend(relevant.map(o => ({ value: valueOf ? valueOf(o) : 0, recordedAt: o.recordedAt }))),
    summary,
    higherIsBetter: meta.higherIsBetter ?? true,
    descriptive: meta.descriptive ?? false,
  }
}

// ── time-based dimensions ────────────────────────────────────────────────────

const metaOf = (key) => ({ higherIsBetter: DIMENSION_META[key].higherIsBetter, descriptive: DIMENSION_META[key].descriptive })

/** substitutionBehaviour — bench timing + impact. */
export function deriveSubstitutionBehaviour(sorted, total) {
  const key = DIMENSION.SUBSTITUTION_BEHAVIOUR
  const rel = sorted.filter(o => o.eventType === OPP_EVENT.SUBSTITUTION_EVENT)
  const n = rel.length
  if (!n) return emptyEntry(key, DIMENSION_META[key].label, metaOf(key))
  const positive = rel.filter(o => o.eventData?.impact === 'positive').length
  const avgMinute = round(mean(rel.map(o => num(o.eventData?.minute, 60))))
  const frontRowEarly = rel.filter(o => o.eventData?.unit === 'front_row' && num(o.eventData?.minute, 99) <= 50).length
  const positiveRate = positive / n
  const score = positiveRate * 100
  const summary = `${positiveRate >= 0.5 ? 'impactful' : 'limited'} bench; avg sub ~${avgMinute}'`
  return buildEntry({
    key, label: DIMENSION_META[key].label, score,
    metrics: { positiveImpactRate: round2(positiveRate), avgSubMinute: avgMinute, earlyFrontRowSubs: frontRowEarly },
    summary, relevant: rel, valueOf: o => (o.eventData?.impact === 'positive' ? 1 : 0), totalObs: total, meta: metaOf(key),
  })
}

/** fitnessTrends — last-20 points differential and whether it is improving. */
export function deriveFitnessTrends(sorted, total) {
  const key = DIMENSION.FITNESS_TRENDS
  const rel = sorted.filter(o => o.eventType === OPP_EVENT.MATCH_SEGMENT && o.eventData?.segment === 'last20')
  const n = rel.length
  if (!n) return emptyEntry(key, DIMENSION_META[key].label, metaOf(key))
  const diffs = rel.map(o => num(o.eventData?.pointsFor) - num(o.eventData?.pointsAgainst))
  const avgLast20 = mean(diffs)
  const score = clamp(50 + avgLast20 * 5, 0, 100)
  const summary = `${avgLast20 >= 1 ? 'strong finishers' : avgLast20 <= -1 ? 'fade late' : 'level late'} (last-20 diff ${round2(avgLast20)})`
  return buildEntry({
    key, label: DIMENSION_META[key].label, score,
    metrics: { avgLast20PointsDiff: round2(avgLast20) },
    summary, relevant: rel, valueOf: o => num(o.eventData?.pointsFor) - num(o.eventData?.pointsAgainst), totalObs: total, meta: metaOf(key),
  })
}

/** lateGameBehaviour — absolute scoring behaviour in the final 20 minutes. */
export function deriveLateGameBehaviour(sorted, total) {
  const key = DIMENSION.LATE_GAME_BEHAVIOUR
  const rel = sorted.filter(o => o.eventType === OPP_EVENT.MATCH_SEGMENT && o.eventData?.segment === 'last20')
  const n = rel.length
  if (!n) return emptyEntry(key, DIMENSION_META[key].label, metaOf(key))
  const forPts = mean(rel.map(o => num(o.eventData?.pointsFor)))
  const againstPts = mean(rel.map(o => num(o.eventData?.pointsAgainst)))
  const diff = forPts - againstPts
  const score = clamp(50 + diff * 5, 0, 100)
  const summary = `${diff >= 1 ? 'closes games out' : diff <= -1 ? 'concedes late' : 'even late'} (avg ${round2(forPts)}–${round2(againstPts)})`
  return buildEntry({
    key, label: DIMENSION_META[key].label, score,
    metrics: { avgLast20For: round2(forPts), avgLast20Against: round2(againstPts) },
    summary, relevant: rel, valueOf: o => num(o.eventData?.pointsFor) - num(o.eventData?.pointsAgainst), totalObs: total, meta: metaOf(key),
  })
}
