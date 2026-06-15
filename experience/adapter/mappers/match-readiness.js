// ─────────────────────────────────────────────────────────────────────────────
// Match Readiness mapper (Experience Adapter, M33)
//
// Maps the façade envelope's `data` (the match-readiness product) into the
// presentation-only `matchReadiness` slice of a VisualModel. This is a PURE
// field reshape guarded against malformed input — it renames/selects fields,
// it does NOT compute scores, derive risks, rank, reason, recommend or predict
// (the engine already did all of that; here we only present it).
//
// The product shape (read-only reference, coach-products/match-readiness):
//   { overallScore, availabilityScore, fitnessScore, cohesionScore (0..100),
//     confidence (0..1), verdict ('ready'|'ready_with_risks'|'not_ready'|
//     'insufficient_data'), keyConcerns:[{severity,summary,...}],
//     evidenceIds:[string], explanation, ... }
// ─────────────────────────────────────────────────────────────────────────────

import { isObj, num, str, arr, oneOf } from '../shape-guards.js'

const VERDICT_LABEL = {
  ready:             'Ready',
  ready_with_risks:  'Ready — with risks to manage',
  not_ready:         'Not ready',
  insufficient_data: 'Insufficient data',
}

const SEVERITIES = ['high', 'medium', 'low']

/**
 * @param {any} data           façade envelope.data (match-readiness product)
 * @param {object} fallback     the placeholder matchReadiness slice (defaults)
 * @returns {object}            a 'live' matchReadiness slice, view-safe
 */
export function mapMatchReadiness(data, fallback) {
  const fb = isObj(fallback) ? fallback : {}
  const fbG = isObj(fb.gauges) ? fb.gauges : {}
  if (!isObj(data)) return { ...fb }

  const risks = arr(data.keyConcerns)
    .map(c => ({
      label: str(isObj(c) ? c.summary : '', ''),
      severity: oneOf(isObj(c) ? c.severity : null, SEVERITIES, 'low'),
    }))
    .filter(r => r.label)

  const evidence = arr(data.evidenceIds)
    .map(id => ({ label: str(id, '') }))
    .filter(e => e.label)

  return {
    state: 'live',
    confidence: num(data.confidence, num(fb.confidence, 0, 0, 1), 0, 1),
    verdict: VERDICT_LABEL[data.verdict] ?? str(data.verdict, str(fb.verdict, '')),
    gauges: {
      overall:      num(data.overallScore,      num(fbG.overall, 0, 0, 100),      0, 100),
      availability: num(data.availabilityScore, num(fbG.availability, 0, 0, 100), 0, 100),
      fitness:      num(data.fitnessScore,      num(fbG.fitness, 0, 0, 100),      0, 100),
      cohesion:     num(data.cohesionScore,     num(fbG.cohesion, 0, 0, 100),     0, 100),
    },
    risks:    risks.length    ? risks    : arr(fb.risks),
    evidence: evidence.length ? evidence : arr(fb.evidence),
  }
}
