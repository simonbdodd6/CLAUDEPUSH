/**
 * @coach-intelligence — Readiness Draft Coach View Contract (M217, DORMANT, read-only)
 *
 * Maps an M213 readiness evidence bundle (the readinessBundle now on the read-only draft response,
 * M216) into a stable, simplified `coachView` a future UI can render WITHOUT understanding any internal
 * engine detail. It exposes only deliberately-mapped fields — never the raw internals wholesale.
 *
 * It selects/ranks nothing, builds no team, recommends nothing, calls no AI, and touches no
 * database/network/filesystem/timestamp/clock/randomness. Pure, deterministic; input never mutated;
 * output deeply frozen.
 *
 * Input: an M213 buildReadinessEvidenceBundle result.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const numOr0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const strOrNull = (v) => (typeof v === 'string' ? v : null)
const strArr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
const arr = (v) => (Array.isArray(v) ? v : [])
const sortStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

const LEVEL_LABEL = Object.freeze({
  FULLY_READY: 'Fully ready', MATCH_READY: 'Match ready', UNDERSTRENGTH: 'Understrength',
  NOT_READY: 'Not ready', NO_SQUAD: 'No squad data', READY: 'Ready',
  READY_WITH_WARNINGS: 'Ready (review needed)', NO_SELECTION: 'No selection',
})

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function mapPositionGroups(groups) {
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

/**
 * Build the coach-facing readiness view from an M213 bundle.
 *
 * @param {object} bundle  an M213 readiness evidence bundle
 * @returns {Readonly<{ status:(string|null), confidence:(string|null), gate:object, headline:string,
 *   keyNumbers:object, warnings:string[], playerReadiness:object, squad:(object|null), trend:(object|null) }>}
 */
export function buildReadinessCoachView(bundle) {
  if (!isObj(bundle) || !isObj(bundle.sources) || !isObj(bundle.validation) || !Array.isArray(bundle.warnings)) {
    throw new TypeError('buildReadinessCoachView requires an M213 readiness evidence bundle { sources, validation, warnings }')
  }

  const src = bundle.sources
  const squadSummary = isObj(src.squadSummary) ? src.squadSummary : null
  const matchReadiness = isObj(src.readiness) ? src.readiness : null
  const trendSrc = isObj(src.trend) ? src.trend : null
  const envelope = isObj(src.envelope) ? src.envelope : null
  const explanations = arr(src.explanations).filter(isObj)
  const counts = squadSummary && isObj(squadSummary.counts) ? squadSummary.counts : {}

  const status = (squadSummary && strOrNull(squadSummary.readinessLevel))
    || (matchReadiness && strOrNull(matchReadiness.status))
    || null
  const confidence = isObj(bundle.confidence) ? strOrNull(bundle.confidence.level) : null
  const warnings = strArr(bundle.warnings)

  const keyNumbers = {
    total: numOr0(counts.total),
    available: numOr0(counts.availableForSelection),
    injuries: numOr0(counts.injuryConcern),
    unavailableOrSuspended: numOr0(counts.unavailableOrSuspended),
    limitedTraining: numOr0(counts.limitedTraining),
    missing: numOr0(counts.missingInformation),
  }

  const label = status ? (LEVEL_LABEL[status] || status) : 'Readiness unknown'
  const headline = `${label} — ${keyNumbers.available}/${keyNumbers.total} available`
    + (warnings.length ? `, ${warnings.length} to review` : '')

  const playerReadiness = {
    count: explanations.length,
    withLimitingFactors: explanations.filter((e) => arr(e.limitingFactors).length > 0).length,
    withMissingInformation: explanations.filter((e) => arr(e.missingInformation).length > 0).length,
  }

  const gate = {
    status: strOrNull(bundle.validation.status),
    reasons: envelope && isObj(envelope.gate) ? strArr(envelope.gate.reasons) : [],
  }

  const squad = squadSummary ? {
    readinessLevel: strOrNull(squadSummary.readinessLevel),
    confidence: isObj(squadSummary.confidence) ? strOrNull(squadSummary.confidence.level) : null,
    positionGroups: mapPositionGroups(squadSummary.positionGroups),
    summary: strOrNull(squadSummary.summary),
  } : null

  const trend = trendSrc ? {
    direction: strOrNull(trendSrc.direction),
    comparable: trendSrc.comparable === true,
    changes: isObj(trendSrc.changes) ? {
      availability: numOrNull(trendSrc.changes.availability),
      injuries: numOrNull(trendSrc.changes.injuries),
      unavailableOrSuspended: numOrNull(trendSrc.changes.unavailableOrSuspended),
      limitedTraining: numOrNull(trendSrc.changes.limitedTraining),
    } : null,
  } : null

  return deepFreeze({
    status,
    confidence,
    gate,
    headline,
    keyNumbers,
    warnings,
    playerReadiness,
    squad,
    trend,
  })
}
