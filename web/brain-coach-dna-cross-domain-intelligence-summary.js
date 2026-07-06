/**
 * web/brain-coach-dna-cross-domain-intelligence-summary.js - Coach DNA Cross-Domain Intelligence Summary (M283, DORMANT)
 *
 * The top-level summary of the cross-domain chapter — the single object a future Brain consumer reads to
 * understand the overall state of a coach's Selection + Training DNA. It folds the M268 selection summary, the
 * M276 training summary and the M282 coherence assessment into one compact, deterministic overview: what each
 * domain says, how ready each is, whether the two pictures cohere, the confidence behind them, and what remains
 * unknown.
 *
 * It creates NO new reasoning: every field is a compact projection of values already present in M268/M276/M282
 * (the only cross-domain conclusions it carries are M282's own). It makes NO recommendation, gives NO advice,
 * selects/ranks/scores/evaluates NO players, generates NO training content and analyses NO sessions. It
 * contains NO player data. Where an input is missing or a value was 'unknown', it stays unknown — never
 * inferred.
 *
 * Pure function. It reuses ONLY the M268/M276/M282 shapes (importing none of their builders), mutates no input,
 * performs no writes, makes no recommendation, calls no AI/LLM, and uses no DOM/network/storage/env/database/
 * clock/randomness. Same input → same summary, byte for byte.
 */

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

/**
 * Build the deterministic top-level Coach DNA cross-domain intelligence summary.
 *
 * @param {object} selectionSummary an M268 selection intelligence summary
 * @param {object} trainingSummary an M276 training intelligence summary
 * @param {object} [coherenceAssessment] an optional M282 cross-domain coherence assessment
 * @returns {object} frozen summary.
 */
export function buildCoachDnaCrossDomainIntelligenceSummary(selectionSummary, trainingSummary, coherenceAssessment) {
  const selOk = isObj(selectionSummary) && selectionSummary.type === 'coach-dna-selection-intelligence-summary'
  const trnOk = isObj(trainingSummary) && trainingSummary.type === 'coach-dna-training-intelligence-summary'
  const cohOk = isObj(coherenceAssessment) && coherenceAssessment.type === 'coach-dna-cross-domain-coherence-assessment'
  const selUsable = selOk && selectionSummary.valid === true
  const trnUsable = trnOk && trainingSummary.valid === true
  const usable = selUsable || trnUsable

  const selectionSummaryFingerprint = selOk && typeof selectionSummary.summaryFingerprint === 'string' ? selectionSummary.summaryFingerprint : null
  const trainingSummaryFingerprint = trnOk && typeof trainingSummary.summaryFingerprint === 'string' ? trainingSummary.summaryFingerprint : null
  const coherenceAssessmentFingerprint = cohOk && typeof coherenceAssessment.assessmentFingerprint === 'string' ? coherenceAssessment.assessmentFingerprint : null

  // crossDomainSummary: each domain's headline facts, projected verbatim from its own summary. Fixed order
  // (selection, training — never sorted) so nothing is implicitly ranked.
  const domainOf = (ok, usableFlag, s, styleField, milestone) => {
    const style = ok && isObj(s[styleField]) ? s[styleField] : null
    const readiness = ok && isObj(s.readinessSummary) ? s.readinessSummary : null
    return {
      sourceMilestone: milestone,
      included: ok,
      usable: usableFlag,
      readiness: readiness ? (strOrNull(readiness.readiness) || 'unknown') : 'unknown',
      presentCharacteristics: style ? numOrNull(style.presentCharacteristics) : null,
      totalCharacteristics: style ? numOrNull(style.totalCharacteristics) : null,
      strongestCharacteristic: style ? strOrNull(style.strongestCharacteristic) : null,
    }
  }
  const crossDomainSummary = {
    selection: domainOf(selOk, selUsable, selectionSummary, 'selectionStyleSummary', 'M268'),
    training: domainOf(trnOk, trnUsable, trainingSummary, 'trainingStyleSummary', 'M276'),
    usableDomains: (selUsable ? 1 : 0) + (trnUsable ? 1 : 0),
    totalDomains: 2,
    complete: selUsable && trnUsable,
  }

  // readinessSummary: each domain's own readiness plus M282's completeness facet — no new readiness rule.
  const cohCompleteness = cohOk && isObj(coherenceAssessment.completenessCoherence) ? coherenceAssessment.completenessCoherence : null
  const readinessSummary = {
    selection: crossDomainSummary.selection.readiness,
    training: crossDomainSummary.training.readiness,
    alignment: cohCompleteness ? (strOrNull(cohCompleteness.alignment) || 'unknown') : 'unknown',
    assemblyCompleteness: cohCompleteness ? (strOrNull(cohCompleteness.assemblyCompleteness) || 'empty') : 'unknown',
  }

  // coherenceSummary: M282's own verdict, carried verbatim. Not assessed → unknown, never inferred.
  const cohState = cohOk && isObj(coherenceAssessment.coherenceState) ? coherenceAssessment.coherenceState : null
  const coherenceSummary = {
    assessed: cohOk,
    state: cohState ? (strOrNull(cohState.state) || 'unknown') : 'unknown',
    note: cohState ? strOrNull(cohState.note) : null,
    facets: cohState && isObj(cohState.facets) ? { ...cohState.facets } : null,
    conflictingFacets: cohState && Array.isArray(cohState.conflictingFacets) ? [...cohState.conflictingFacets] : [],
    unknownFacets: cohState && Array.isArray(cohState.unknownFacets) ? [...cohState.unknownFacets] : [],
  }

  // confidenceSummary: each domain's own confidence plus M282's confidence alignment.
  const confidenceOf = (ok, s) => {
    const c = ok && isObj(s.confidenceSummary) ? s.confidenceSummary : null
    return c ? { level: strOrNull(c.level) || 'LOW', value: numOrNull(c.value) } : null
  }
  const cohConfidence = cohOk && isObj(coherenceAssessment.confidenceCoherence) ? coherenceAssessment.confidenceCoherence : null
  const confidenceSummary = {
    selection: confidenceOf(selOk, selectionSummary),
    training: confidenceOf(trnOk, trainingSummary),
    alignment: cohConfidence ? (strOrNull(cohConfidence.alignment) || 'unknown') : 'unknown',
  }

  // unknownSummary: each domain's own unknowns (characteristic names, never players) plus M282's alignment.
  const unknownOf = (ok, s) => {
    const u = ok && isObj(s.unknownSummary) ? s.unknownSummary : null
    return u ? {
      unknownCount: numOrNull(u.unknownCount),
      unknownCharacteristics: Array.isArray(u.unknownCharacteristics) ? [...u.unknownCharacteristics] : [],
      allKnown: u.allKnown === true,
    } : null
  }
  const cohUnknown = cohOk && isObj(coherenceAssessment.unknownCoherence) ? coherenceAssessment.unknownCoherence : null
  const unknownSummary = {
    selection: unknownOf(selOk, selectionSummary),
    training: unknownOf(trnOk, trainingSummary),
    alignment: cohUnknown ? (strOrNull(cohUnknown.alignment) || 'unknown') : 'unknown',
  }

  // Preserve provenance from all three inputs: both M230-rooted domain chains + the M277-M279 coherence chain.
  const selProv = selOk && isObj(selectionSummary.provenance) ? selectionSummary.provenance : null
  const trnProv = trnOk && isObj(trainingSummary.provenance) ? trainingSummary.provenance : null
  const cohProv = cohOk && isObj(coherenceAssessment.provenance) ? coherenceAssessment.provenance : null
  const provenance = {
    selectionSource: 'coach-dna-selection-intelligence-summary',
    selectionSourceMilestone: 'M268',
    selectionSummaryFingerprint,
    selectionChain: selProv && Array.isArray(selProv.chain) ? [...selProv.chain] : null,
    trainingSource: 'coach-dna-training-intelligence-summary',
    trainingSourceMilestone: 'M276',
    trainingSummaryFingerprint,
    trainingChain: trnProv && Array.isArray(trnProv.chain) ? [...trnProv.chain] : null,
    coherenceSource: 'coach-dna-cross-domain-coherence-assessment',
    coherenceSourceMilestone: 'M282',
    coherenceAssessmentFingerprint,
    coherenceChain: cohProv && Array.isArray(cohProv.chain) ? [...cohProv.chain] : null,
    crossDomainProfileFingerprint: cohProv ? strOrNull(cohProv.profileFingerprint) : null,
    crossDomainInputsFingerprint: cohProv ? strOrNull(cohProv.crossDomainInputsFingerprint) : null,
  }

  // Pairing checks: does the M282 assessment cite the SAME domain summaries it is being folded with?
  const cohByMilestone = cohProv && isObj(cohProv.byMilestone) ? cohProv.byMilestone : null
  const citedFingerprint = (m) => (cohByMilestone && isObj(cohByMilestone[m]) ? strOrNull(cohByMilestone[m].fingerprint) : null)
  const coherenceMatchesSelection = cohOk && selOk ? citedFingerprint('M268') === selectionSummaryFingerprint : null
  const coherenceMatchesTraining = cohOk && trnOk ? citedFingerprint('M276') === trainingSummaryFingerprint : null

  const issues = []
  if (!selOk) issues.push('selection summary missing or malformed')
  else if (!selUsable) issues.push('selection summary marked invalid (unusable source)')
  if (!trnOk) issues.push('training summary missing or malformed')
  else if (!trnUsable) issues.push('training summary marked invalid (unusable source)')
  if (!cohOk) issues.push('coherence assessment not supplied')

  const derivationMetadata = {
    milestone: 'M283',
    domain: 'cross-domain',
    layer: 'summary',
    summarizes: ['M268', 'M276', 'M282'],
    deterministic: true,
    llmGenerated: false,
    readOnly: true,
    dormant: true,
    coherenceIncluded: cohOk,
    coherenceMatchesSelection,
    coherenceMatchesTraining,
    createsNewReasoning: false,
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
  }

  const draft = {
    type: 'coach-dna-cross-domain-intelligence-summary',
    schemaVersion: 1,
    summaryVersion: 1,
    milestone: 'M283',
    valid: usable,
    selectionSummaryFingerprint,
    trainingSummaryFingerprint,
    coherenceAssessmentFingerprint,
    crossDomainSummary,
    readinessSummary,
    coherenceSummary,
    confidenceSummary,
    unknownSummary,
    provenance,
    validationState: {
      selectionRecognized: selOk,
      trainingRecognized: trnOk,
      coherenceRecognized: cohOk,
      selectionUsable: selUsable,
      trainingUsable: trnUsable,
      usable,
      issues,
    },
    derivationMetadata,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this summary.
  draft.summaryFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary line set for logs or PR notes.
 * @param {object} selectionSummary an M268 selection intelligence summary
 * @param {object} trainingSummary an M276 training intelligence summary
 * @param {object} [coherenceAssessment] an optional M282 coherence assessment
 * @returns {string}
 */
export function summarizeCoachDnaCrossDomainIntelligenceSummary(selectionSummary, trainingSummary, coherenceAssessment) {
  const s = buildCoachDnaCrossDomainIntelligenceSummary(selectionSummary, trainingSummary, coherenceAssessment)
  return [
    `Coach DNA cross-domain intelligence summary: ${s.crossDomainSummary.complete ? 'complete' : s.valid ? 'partial' : 'unusable sources'}`,
    `Selection (M268): ${s.crossDomainSummary.selection.usable ? `readiness ${s.crossDomainSummary.selection.readiness}` : 'missing'}`,
    `Training (M276): ${s.crossDomainSummary.training.usable ? `readiness ${s.crossDomainSummary.training.readiness}` : 'missing'}`,
    `Coherence: ${s.coherenceSummary.assessed ? s.coherenceSummary.state : 'not assessed'}`,
    `Unknowns alignment: ${s.unknownSummary.alignment} · Confidence alignment: ${s.confidenceSummary.alignment}`,
    `Fingerprint: ${s.summaryFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the summary deterministically.
 * @param {object} selectionSummary an M268 selection intelligence summary
 * @param {object} trainingSummary an M276 training intelligence summary
 * @param {object} [coherenceAssessment] an optional M282 coherence assessment
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaCrossDomainIntelligenceSummary(selectionSummary, trainingSummary, coherenceAssessment, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const s = buildCoachDnaCrossDomainIntelligenceSummary(selectionSummary, trainingSummary, coherenceAssessment)
  if (format === 'json') return canonicalStringify(s)
  if (format === 'line') {
    return `coach-dna-cross-domain-intelligence-summary valid=${s.valid} complete=${s.crossDomainSummary.complete} `
      + `coherence=${s.coherenceSummary.state} domains=${s.crossDomainSummary.usableDomains}/${s.crossDomainSummary.totalDomains} `
      + `fp=${s.summaryFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA cross-domain intelligence summary format '${format}'`)
}
