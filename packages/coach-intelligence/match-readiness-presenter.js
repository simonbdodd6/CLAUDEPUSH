/**
 * @coach-intelligence — Squad Readiness Report Presenter (M211, DORMANT, read-only)
 *
 * A pure, deterministic presenter that renders an M209 squad readiness summary (and an optional M210
 * trend) into one readable report for engineering logs / a coach-facing surface. It reads only the
 * passed objects — it computes no readiness of its own, selects/ranks nothing, calls no AI, and
 * touches no database/network/filesystem/clock. Object output is deeply frozen.
 *
 * Formats: 'object' (default), 'text', 'json'. JSON uses the shared canonical key-sorted serializer
 * (already permitted for coach-intelligence by dependency-cruiser, as in M125/M127/M185/M193).
 *
 * Input: { readiness: <M209 summary>, trend?: <M210 trend> }
 */

import { canonicalStringify } from '@brain/evidence-gateway'

const SUPPORTED_FORMATS = Object.freeze(['object', 'text', 'json'])

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const numOr0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const strOrNull = (v) => (typeof v === 'string' ? v : null)
const sortStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const signed = (n) => (n === null ? 'n/a' : n > 0 ? `+${n}` : `${n}`)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function assertReport(report) {
  if (!isObj(report) || !isObj(report.readiness) || typeof report.readiness.readinessLevel !== 'string') {
    throw new TypeError('summarizeSquadReadiness requires { readiness: <M209 summary> } with a readinessLevel')
  }
}

const COUNT_KEYS = Object.freeze(['total', 'availableForSelection', 'fullyAvailable', 'injuryConcern', 'unavailableOrSuspended', 'limitedTraining', 'missingInformation'])

function normalizeCounts(counts) {
  const c = isObj(counts) ? counts : {}
  const out = {}
  for (const k of COUNT_KEYS) out[k] = numOr0(c[k])
  return out
}

function normalizePositionGroups(groups) {
  if (!isObj(groups)) return []
  return Object.keys(groups).sort(sortStr).map((group) => {
    const g = isObj(groups[group]) ? groups[group] : {}
    return {
      group,
      total: numOr0(g.total),
      available: numOr0(g.available),
      injuryConcern: numOr0(g.injuryConcern),
      unavailableOrSuspended: numOr0(g.unavailableOrSuspended),
      limitedTraining: numOr0(g.limitedTraining),
      missingInformation: numOr0(g.missingInformation),
    }
  })
}

function normalizeTrend(trend) {
  if (!isObj(trend)) return null
  const ch = isObj(trend.changes) ? trend.changes : {}
  return {
    direction: strOrNull(trend.direction),
    comparable: trend.comparable === true,
    currentReadinessLevel: strOrNull(trend.currentReadinessLevel),
    previousReadinessLevel: strOrNull(trend.previousReadinessLevel),
    confidenceTrend: strOrNull(trend.confidenceTrend),
    changes: {
      availability: numOrNull(ch.availability),
      injuries: numOrNull(ch.injuries),
      unavailableOrSuspended: numOrNull(ch.unavailableOrSuspended),
      limitedTraining: numOrNull(ch.limitedTraining),
    },
  }
}

function build(report) {
  const r = report.readiness
  return {
    readinessLevel: r.readinessLevel,
    confidenceLevel: isObj(r.confidence) ? strOrNull(r.confidence.level) : null,
    counts: normalizeCounts(r.counts),
    positionGroups: normalizePositionGroups(r.positionGroups),
    trend: normalizeTrend(report.trend),
  }
}

function renderText(n) {
  const c = n.counts
  const lines = [`SquadReadiness level=${n.readinessLevel} confidence=${n.confidenceLevel} available=${c.availableForSelection}/${c.total} fullyAvailable=${c.fullyAvailable} injuries=${c.injuryConcern} unavailableOrSuspended=${c.unavailableOrSuspended} limitedTraining=${c.limitedTraining} missing=${c.missingInformation}`]
  for (const g of n.positionGroups) {
    lines.push(`group ${g.group} total=${g.total} available=${g.available} injuries=${g.injuryConcern} unavailable=${g.unavailableOrSuspended} limited=${g.limitedTraining} missing=${g.missingInformation}`)
  }
  if (n.trend && n.trend.comparable) {
    const t = n.trend
    lines.push(`trend ${t.direction} ${t.previousReadinessLevel}→${t.currentReadinessLevel} availability=${signed(t.changes.availability)} injuries=${signed(t.changes.injuries)} confidence=${t.confidenceTrend}`)
  } else if (n.trend) {
    lines.push(`trend ${n.trend.direction} (not comparable)`)
  }
  return lines.join('\n')
}

/**
 * Present an M209 squad readiness summary (+ optional M210 trend) for review.
 *
 * @param {{ readiness: object, trend?: object }} report
 * @param {('object'|'text'|'json')} [format='object']
 * @returns {(Readonly<object>|string)}
 */
export function summarizeSquadReadiness(report, format = 'object') {
  if (typeof format !== 'string' || !SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`summarizeSquadReadiness: unsupported format "${format}" (expected object | text | json)`)
  }
  assertReport(report)

  const n = build(report)
  if (format === 'text') return renderText(n)
  if (format === 'json') return canonicalStringify(n)
  return deepFreeze(n)
}
