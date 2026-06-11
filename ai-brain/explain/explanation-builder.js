/**
 * AI Brain — Explanation Builder (M10)
 *
 * Composes a complete ExplanationRecord from a recommendation and its context.
 *
 * Rules:
 *  - Deterministic: same (rec, context) → same output, always.
 *  - No LLM calls. No random text. No invented evidence.
 *  - Only references observations, memories, and evidence that actually exist in rec.
 *  - Plain-language explanation is template-based, never generated.
 */

import { buildTrace                } from './trace-builder.js'
import { EXPLANATION_SCHEMA_VERSION } from './explanation-types.js'

function inferReasoner(source) {
  const s = String(source ?? '').toLowerCase()
  if (s.includes('coach')) return 'coach'
  if (s.includes('squad')) return 'squad'
  if (s.includes('club'))  return 'club'
  return 'brain'
}

function normaliseCalAdj(calibrationAdjustment) {
  if (calibrationAdjustment == null) {
    return { applied: false, delta: 0, sampleSize: 0, originalConfidence: null, adjustedConfidence: null }
  }
  return {
    applied:            true,
    delta:              calibrationAdjustment.delta              ?? 0,
    sampleSize:         calibrationAdjustment.sampleSize         ?? 0,
    originalConfidence: calibrationAdjustment.originalConfidence ?? null,
    adjustedConfidence: calibrationAdjustment.adjustedConfidence ?? null,
    category:           calibrationAdjustment.category           ?? null,
  }
}

function composePlainText(rec, trace, calibrationAdjustment) {
  const lines = []

  lines.push(`Recommendation: "${rec.title}"`)
  lines.push(`Category: ${rec.category} | Priority: ${rec.priority} | Confidence: ${rec.confidence}%`)
  lines.push(`Reasoner: ${inferReasoner(rec.source)} (source: ${rec.source})`)
  lines.push('')

  if (trace.timelineEventsReferenced.length > 0) {
    lines.push(`Live data signals (${trace.timelineEventsReferenced.length}):`)
    for (const ev of trace.timelineEventsReferenced) {
      lines.push(`  • ${ev.type}: ${ev.value} [${ev.source}]`)
    }
    lines.push('')
  }

  if (trace.observationsUsed.length > 0) {
    lines.push(`Observation signals (${trace.observationsUsed.length}):`)
    for (const obs of trace.observationsUsed) {
      lines.push(`  • [${obs.observationType}] ${obs.explanation} (confidence ${obs.confidence}%, id: ${obs.id})`)
    }
    lines.push('')
  }

  if (trace.memoriesUsed.length > 0) {
    lines.push(`Memory references: ${trace.memoriesUsed.join(', ')}`)
    lines.push('')
  }

  const cb   = trace.confidenceBreakdown
  const sign = cb.calibrationDelta >= 0 ? '+' : ''
  if (cb.calibrationApplied) {
    lines.push(`Confidence: base ${cb.base}% ${sign}${cb.calibrationDelta} calibration delta = ${cb.calibratedConfidence}% (${cb.sampleSize} historical outcome${cb.sampleSize === 1 ? '' : 's'})`)
  } else {
    lines.push(`Confidence: ${cb.base}% (calibration not applied — insufficient learning history)`)
  }

  const fp = trace.finalPriorityCalculation
  lines.push(`Priority ranking: weight ${fp.priorityWeight} + confidence component ${fp.confidenceComponent} = ${fp.combinedScore} → ${fp.priority}`)

  if (rec.explainability) {
    lines.push('')
    lines.push(`Reasoner rationale: ${rec.explainability}`)
  }

  lines.push('')
  lines.push(`Reproducible from: ${trace.timelineEventsReferenced.length} live signal(s), ${trace.observationsUsed.length} observation(s), ${trace.memoriesUsed.length} memory reference(s).`)

  return lines.join('\n')
}

/**
 * Build a complete ExplanationRecord for a recommendation.
 *
 * @param {object}      rec
 * @param {object}      opts
 * @param {object[]}    opts.observations           — all observations at reasoning time
 * @param {object|null} opts.calibrationAdjustment  — calibrator record, or null
 * @param {string|null} opts.coachId
 * @param {string|null} opts.clubId
 * @returns {ExplanationRecord}
 */
export function buildExplanation(rec, { observations = [], calibrationAdjustment = null, coachId = null, clubId = null } = {}) {
  if (rec == null) return null
  const trace = buildTrace(rec, { observations, calibrationAdjustment })

  return {
    schemaVersion:            EXPLANATION_SCHEMA_VERSION,
    recommendationId:         rec.id,
    generatedByReasoner:      inferReasoner(rec.source),
    observationsUsed:         trace.observationsUsed,
    memoriesUsed:             trace.memoriesUsed,
    timelineEventsReferenced: trace.timelineEventsReferenced,
    confidenceBreakdown:      trace.confidenceBreakdown,
    calibrationAdjustments:   normaliseCalAdj(calibrationAdjustment),
    learningInfluence: {
      calibrationApplied: calibrationAdjustment != null,
      sampleSize:         calibrationAdjustment?.sampleSize ?? 0,
      category:           rec.category  ?? null,
      delta:              calibrationAdjustment?.delta ?? 0,
    },
    finalPriorityCalculation: trace.finalPriorityCalculation,
    plainLanguageExplanation: composePlainText(rec, trace, calibrationAdjustment),
    context: { coachId, clubId },
  }
}
