/**
 * AI Brain — Trace Builder (M10)
 *
 * Pure function: extracts the evidence chain and computes confidence /
 * priority breakdowns from a single recommendation.
 *
 * Rules:
 *  - Never invents data. Only references what exists in rec.evidence.
 *  - Observation citations are extracted by matching observationId in evidence.
 *  - Memory references are extracted from obs.supportingMemories.
 *  - Timeline-event references are all non-observation evidence items.
 *  - Deterministic: same (rec, opts) always produces the same output.
 */

const PRIORITY_WEIGHT = Object.freeze({ HIGH: 100, MEDIUM: 60, LOW: 25 })

function extractObservationsUsed(rec, observations) {
  const cited = new Set(
    (rec.evidence ?? [])
      .filter(ev => ev.type === 'observation' && ev.observationId != null)
      .map(ev => ev.observationId)
  )
  return observations.filter(o => cited.has(o.id))
}

function extractMemoriesUsed(observationsUsed) {
  const seen = new Set()
  const ids  = []
  for (const obs of observationsUsed) {
    for (const memId of (obs.supportingMemories ?? [])) {
      if (!seen.has(memId)) { seen.add(memId); ids.push(memId) }
    }
  }
  return ids
}

function extractTimelineEventsReferenced(rec) {
  return (rec.evidence ?? [])
    .filter(ev => ev.type !== 'observation')
    .map(ev => ({ type: ev.type, value: ev.value, source: ev.source ?? 'unknown' }))
}

function buildConfidenceBreakdown(rec, calibrationAdjustment) {
  const base                = calibrationAdjustment?.originalConfidence ?? rec.confidence ?? 50
  const delta               = calibrationAdjustment?.delta              ?? 0
  const calibratedConfidence = calibrationAdjustment?.adjustedConfidence ?? rec.confidence ?? 50
  return {
    base,
    calibrationDelta:    Math.round(delta * 100) / 100,
    calibratedConfidence,
    sampleSize:          calibrationAdjustment?.sampleSize ?? 0,
    calibrationApplied:  calibrationAdjustment != null,
  }
}

function buildFinalPriorityCalculation(rec) {
  const priorityWeight      = PRIORITY_WEIGHT[rec.priority] ?? 60
  const confidenceComponent = Math.round((rec.confidence ?? 50) * 0.3 * 100) / 100
  return {
    priorityWeight,
    confidenceComponent,
    combinedScore: Math.round((priorityWeight + confidenceComponent) * 100) / 100,
    priority:      rec.priority  ?? 'MEDIUM',
    confidence:    rec.confidence ?? 50,
  }
}

/**
 * Build the full evidence trace for a recommendation.
 *
 * @param {object}      rec
 * @param {object}      opts
 * @param {object[]}    opts.observations           — all observations present at reasoning time
 * @param {object|null} opts.calibrationAdjustment  — calibrator record for this rec, or null
 * @returns {TraceResult}
 */
export function buildTrace(rec, { observations = [], calibrationAdjustment = null } = {}) {
  if (rec == null) {
    return {
      observationsUsed:         [],
      memoriesUsed:             [],
      timelineEventsReferenced: [],
      confidenceBreakdown:      buildConfidenceBreakdown({}, null),
      finalPriorityCalculation: buildFinalPriorityCalculation({}),
    }
  }
  const observationsUsed         = extractObservationsUsed(rec, observations)
  const memoriesUsed             = extractMemoriesUsed(observationsUsed)
  const timelineEventsReferenced = extractTimelineEventsReferenced(rec)
  const confidenceBreakdown      = buildConfidenceBreakdown(rec, calibrationAdjustment)
  const finalPriorityCalculation = buildFinalPriorityCalculation(rec)

  return { observationsUsed, memoriesUsed, timelineEventsReferenced, confidenceBreakdown, finalPriorityCalculation }
}
