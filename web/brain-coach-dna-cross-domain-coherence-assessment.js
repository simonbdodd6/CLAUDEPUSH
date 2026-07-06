/**
 * web/brain-coach-dna-cross-domain-coherence-assessment.js - Coach DNA Cross-Domain Coherence Assessment (M282, DORMANT)
 *
 * The FIRST deterministic cross-domain reasoning layer. It consumes the M280 query surface and assesses whether
 * the completed Selection (M268) and Training (M276) pictures of the coach cohere: is the evidence quality
 * aligned across the two domains, do their confidence levels agree, do their readiness states match, and do
 * they share a similar proportion of unknowns? The overall coherenceState classifies the pair as coherent,
 * partial, conflicting, or unknown — using fixed, documented rules recorded in the output.
 *
 * It reasons about DOMAIN EVIDENCE QUALITY only — never about players, sessions or what the coach should do.
 * It makes NO recommendation, gives NO advice, selects/ranks/scores/evaluates NO players, generates NO training
 * content and analyses NO sessions. It contains NO player data. Where either domain is missing or unassessed,
 * the affected coherence facet is 'unknown' — never guessed, never inferred.
 *
 * Pure function. It reuses ONLY the M280 surface (building one on demand from an M278 profile / M279 index),
 * mutates no input, performs no writes, makes no recommendation, calls no AI/LLM, and uses no DOM/network/
 * storage/env/database/clock/randomness. Same input → same assessment, byte for byte.
 */

import { createCoachDnaCrossDomainIntelligenceQuery } from './brain-coach-dna-cross-domain-intelligence-query.js' // M280

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const strOrNull = (v) => (typeof v === 'string' && v.length > 0 ? v : null)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`
}

// FNV-1a 32-bit — the same fingerprint convention used across the Coach DNA pipeline, for consistency.
function fingerprint(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`
}

// ---- Documented deterministic rules (recorded in derivationMetadata.rules) ----
// Ordinal scales for the fixed vocabularies each domain already reports. Unknown never maps to a rank.
const COMPLETENESS_ORDINAL = Object.freeze({ none: 0, low: 1, moderate: 2, high: 3 })
const CONFIDENCE_ORDINAL = Object.freeze({ LOW: 0, MEDIUM: 1, HIGH: 2 })
const READINESS_ORDINAL = Object.freeze({ insufficient: 0, partial: 1, ready: 2 })
// Unknown-ratio bands: low < 0.34 <= moderate < 0.67 <= high.
const UNKNOWN_RATIO_MODERATE = 0.34
const UNKNOWN_RATIO_HIGH = 0.67
// Gap classification: 0 → aligned, 1 → broadly-aligned (confidence: adjacent), >= 2 → imbalanced (confidence:
// divergent). Overall: unusable → unknown; < 2 usable domains → partial; any imbalanced/divergent facet →
// conflicting; any unknown facet → partial; otherwise coherent.
const CONFLICT_ALIGNMENTS = Object.freeze(['imbalanced', 'divergent'])

const COHERENCE_NOTE = Object.freeze({
  coherent: 'the selection and training pictures of this coach rest on aligned evidence',
  partial: 'only part of the cross-domain picture can be assessed for coherence',
  conflicting: 'the selection and training pictures rest on materially different evidence quality',
  unknown: 'no usable cross-domain intelligence is available to assess coherence',
})

function gapAlignment(gap, scale) {
  if (gap === 0) return 'aligned'
  if (gap === 1) return scale === 'confidence' ? 'adjacent' : 'broadly-aligned'
  return scale === 'confidence' ? 'divergent' : 'imbalanced'
}

// Compare one ordinal facet across the two domains. Either side unknown → the facet stays unknown.
function facetOf(selValue, trnValue, ordinal, scale) {
  const selRank = selValue !== null && selValue in ordinal ? ordinal[selValue] : null
  const trnRank = trnValue !== null && trnValue in ordinal ? ordinal[trnValue] : null
  if (selRank === null || trnRank === null) {
    return { selection: selValue, training: trnValue, gap: null, alignment: 'unknown' }
  }
  const gap = Math.abs(selRank - trnRank)
  return { selection: selValue, training: trnValue, gap, alignment: gapAlignment(gap, scale) }
}

function unknownBandOf(ratio) {
  if (ratio === null) return null
  if (ratio >= UNKNOWN_RATIO_HIGH) return 'high'
  if (ratio >= UNKNOWN_RATIO_MODERATE) return 'moderate'
  return 'low'
}

function resolveSurface(input) {
  if (isObj(input) && typeof input.getDomain === 'function' && typeof input.getValidationState === 'function') return input
  return createCoachDnaCrossDomainIntelligenceQuery(input)
}

/**
 * Build the deterministic cross-domain coherence assessment from an M280 query surface.
 *
 * @param {object} input an M280 query surface (or an M278 profile / M279 index / { profile, index } pair)
 * @returns {object} frozen coherence assessment; `valid` is false when the source is unusable.
 */
export function buildCoachDnaCrossDomainCoherenceAssessment(input) {
  const surface = resolveSurface(input)
  const call = (name, ...args) => (typeof surface[name] === 'function' ? surface[name](...args) : null)
  const usable = call('isUsable') === true

  const sel = call('getDomain', 'selection')
  const trn = call('getDomain', 'training')
  const selEvidence = call('getEvidence', 'selection')
  const trnEvidence = call('getEvidence', 'training')
  const selConfidence = call('getConfidence', 'selection')
  const trnConfidence = call('getConfidence', 'training')
  const completeness = call('getCompleteness')

  const availabilityOf = (d) => ({
    included: isObj(d) && d.included === true,
    usable: isObj(d) && d.usable === true,
    readiness: isObj(d) ? (strOrNull(d.readiness) || 'unknown') : 'unknown',
    summaryFingerprint: isObj(d) ? strOrNull(d.summaryFingerprint) : null,
  })
  const domainAvailability = {
    selection: availabilityOf(sel),
    training: availabilityOf(trn),
    usableDomains: (isObj(sel) && sel.usable === true ? 1 : 0) + (isObj(trn) && trn.usable === true ? 1 : 0),
    totalDomains: 2,
    bothUsable: isObj(sel) && sel.usable === true && isObj(trn) && trn.usable === true,
  }

  // evidenceCoherence: are the two domains' evidence-completeness levels aligned? Unassessed stays unknown.
  const evidenceLevel = (e) => (isObj(e) && e.assessed === true ? strOrNull(e.completeness) : null)
  const evidenceCoherence = {
    ...facetOf(evidenceLevel(selEvidence), evidenceLevel(trnEvidence), COMPLETENESS_ORDINAL, 'completeness'),
    selectionConsistency: isObj(selEvidence) ? (strOrNull(selEvidence.consistency) || 'unknown') : null,
    trainingConsistency: isObj(trnEvidence) ? (strOrNull(trnEvidence.consistency) || 'unknown') : null,
  }

  // confidenceCoherence: do the two domains' confidence levels agree?
  const confidenceLevel = (c) => (isObj(c) ? strOrNull(c.level) : null)
  const confidenceCoherence = {
    ...facetOf(confidenceLevel(selConfidence), confidenceLevel(trnConfidence), CONFIDENCE_ORDINAL, 'confidence'),
    selectionValue: isObj(selConfidence) ? numOrNull(selConfidence.value) : null,
    trainingValue: isObj(trnConfidence) ? numOrNull(trnConfidence.value) : null,
  }

  // completenessCoherence: do the two domains' readiness states match? Also carries the assembly-level state.
  const readinessOf = (d) => {
    const r = isObj(d) ? strOrNull(d.readiness) : null
    return r && r in READINESS_ORDINAL ? r : null
  }
  const completenessCoherence = {
    ...facetOf(readinessOf(sel), readinessOf(trn), READINESS_ORDINAL, 'readiness'),
    assemblyCompleteness: isObj(completeness) ? (strOrNull(completeness.level) || 'empty') : 'empty',
  }

  // unknownCoherence: do the two domains carry a similar proportion of unknown characteristics?
  const unknownSideOf = (d) => {
    const count = isObj(d) ? numOrNull(d.unknownCount) : null
    const total = isObj(d) ? numOrNull(d.totalCharacteristics) : null
    const ratio = count !== null && total !== null && total > 0 ? count / total : null
    return { unknownCount: count, totalCharacteristics: total, unknownRatio: ratio, band: unknownBandOf(ratio) }
  }
  const selUnknown = unknownSideOf(sel)
  const trnUnknown = unknownSideOf(trn)
  const BAND_ORDINAL = Object.freeze({ low: 0, moderate: 1, high: 2 })
  const unknownFacet = facetOf(selUnknown.band, trnUnknown.band, BAND_ORDINAL, 'band')
  const unknownCoherence = {
    selection: selUnknown,
    training: trnUnknown,
    gap: unknownFacet.gap,
    alignment: unknownFacet.alignment,
  }

  // coherenceState: the documented overall rule (see rules above / derivationMetadata.rules).
  const facets = {
    evidence: evidenceCoherence.alignment,
    confidence: confidenceCoherence.alignment,
    completeness: completenessCoherence.alignment,
    unknown: unknownCoherence.alignment,
  }
  let state
  if (!usable) state = 'unknown'
  else if (!domainAvailability.bothUsable) state = 'partial'
  else if (Object.values(facets).some((a) => CONFLICT_ALIGNMENTS.includes(a))) state = 'conflicting'
  else if (Object.values(facets).some((a) => a === 'unknown')) state = 'partial'
  else state = 'coherent'
  const coherenceState = {
    state,
    note: COHERENCE_NOTE[state],
    facets,
    conflictingFacets: Object.keys(facets).filter((k) => CONFLICT_ALIGNMENTS.includes(facets[k])),
    unknownFacets: Object.keys(facets).filter((k) => facets[k] === 'unknown'),
  }

  // Preserve the full provenance from the M280 surface (cross-domain chain + both M230-rooted domain chains).
  const provResponse = call('getProvenance')
  const surfaceProv = isObj(provResponse) ? provResponse : {}
  const provenance = {
    source: 'coach-dna-cross-domain-intelligence-query',
    sourceMilestone: 'M280',
    chain: Array.isArray(surfaceProv.chain) ? [...surfaceProv.chain] : null,
    profileFingerprint: strOrNull(surfaceProv.profileFingerprint),
    crossDomainInputsFingerprint: strOrNull(surfaceProv.crossDomainInputsFingerprint),
    byDomain: isObj(surfaceProv.byDomain) ? JSON.parse(JSON.stringify(surfaceProv.byDomain)) : null,
    byMilestone: isObj(surfaceProv.byMilestone) ? JSON.parse(JSON.stringify(surfaceProv.byMilestone)) : null,
  }

  const issues = []
  if (!usable) issues.push('cross-domain intelligence unusable (source missing or malformed)')
  else if (!domainAvailability.bothUsable) issues.push('coherence only partially assessable (a domain is missing)')
  const validationState = { surfaceUsable: usable, bothDomainsUsable: domainAvailability.bothUsable, issues }

  const derivationMetadata = {
    milestone: 'M282',
    domain: 'cross-domain',
    layer: 'coherence-assessment',
    derivedFrom: 'coach-dna-cross-domain-intelligence-query',
    sourceMilestone: 'M280',
    deterministic: true,
    ruleBased: true,
    llmGenerated: false,
    readOnly: true,
    dormant: true,
    assessesDomainCoherence: true,   // the first cross-domain reasoning: evidence-quality coherence only
    playerComparison: false,
    coachAdvice: false,
    createsRecommendations: false,
    containsPlayerData: false,
    playerEvaluation: false,
    playerSelection: false,
    playerRanking: false,
    playerScoring: false,
    teamRecommendation: false,
    trainingRecommendation: false,
    generatesTrainingContent: false,
    analysesSessions: false,
    rules: {
      completenessOrdinal: COMPLETENESS_ORDINAL,
      confidenceOrdinal: CONFIDENCE_ORDINAL,
      readinessOrdinal: READINESS_ORDINAL,
      unknownRatioModerate: UNKNOWN_RATIO_MODERATE,
      unknownRatioHigh: UNKNOWN_RATIO_HIGH,
      gapAligned: 0,
      gapBroadlyAligned: 1,
      gapConflict: 2,
      overall: 'unusable→unknown; <2 usable domains→partial; any imbalanced/divergent facet→conflicting; any unknown facet→partial; else coherent',
    },
  }

  const draft = {
    type: 'coach-dna-cross-domain-coherence-assessment',
    schemaVersion: 1,
    assessmentVersion: 1,
    milestone: 'M282',
    valid: usable,
    domainAvailability,
    evidenceCoherence,
    confidenceCoherence,
    completenessCoherence,
    unknownCoherence,
    coherenceState,
    provenance,
    validationState,
    derivationMetadata,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this assessment.
  draft.assessmentFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the coherence assessment for logs or PR notes.
 * @param {object} input an M280 query surface (or a profile/index)
 * @returns {string}
 */
export function summarizeCoachDnaCrossDomainCoherenceAssessment(input) {
  const a = buildCoachDnaCrossDomainCoherenceAssessment(input)
  return [
    `Coach DNA cross-domain coherence assessment: ${a.coherenceState.state}`,
    `Domains usable: ${a.domainAvailability.usableDomains}/${a.domainAvailability.totalDomains}`,
    `Evidence: ${a.evidenceCoherence.alignment} · Confidence: ${a.confidenceCoherence.alignment}`,
    `Completeness: ${a.completenessCoherence.alignment} · Unknowns: ${a.unknownCoherence.alignment}`,
    `Fingerprint: ${a.assessmentFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the coherence assessment deterministically.
 * @param {object} input an M280 query surface (or a profile/index)
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaCrossDomainCoherenceAssessment(input, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const a = buildCoachDnaCrossDomainCoherenceAssessment(input)
  if (format === 'json') return canonicalStringify(a)
  if (format === 'line') {
    return `coach-dna-cross-domain-coherence-assessment state=${a.coherenceState.state} `
      + `domains=${a.domainAvailability.usableDomains}/${a.domainAvailability.totalDomains} `
      + `evidence=${a.evidenceCoherence.alignment} confidence=${a.confidenceCoherence.alignment} `
      + `fp=${a.assessmentFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA cross-domain coherence assessment format '${format}'`)
}
