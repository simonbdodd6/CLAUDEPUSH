/**
 * web/brain-coach-dna-cross-domain-intelligence-inputs.js - Coach DNA Cross-Domain Intelligence Inputs (M277, DORMANT)
 *
 * The first cross-domain integration layer. It ASSEMBLES the two completed domain summaries — the M268
 * selection intelligence summary and the M276 training intelligence summary — into one deterministic structure
 * that later cross-domain reasoning layers can consume. It is pure assembly: each domain's summary, evidence
 * overview and confidence overview is carried side by side, verbatim.
 *
 * It critically creates NO new intelligence: it does NOT compare the domains, does NOT combine or reconcile
 * their evidence or confidence, makes NO recommendation, selects/ranks/scores/evaluates NO players, recommends
 * NO training and contains NO player data. Every field is a copy of information already present in M268/M276.
 * Where a domain summary is missing or unrecognisable, its slot is null — never inferred.
 *
 * Pure function. It reuses ONLY the M268/M276 shapes (importing neither builder), mutates no input, performs no
 * writes, makes no recommendation, calls no AI/LLM, and uses no DOM/network/storage/env/database/clock/
 * randomness. Same input → same structure, byte for byte.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const numOr0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const strOrNull = (v) => (typeof v === 'string' && v.length > 0 ? v : null)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

// A plain deterministic deep copy (JSON-shaped values only) — the embedded summaries stay verbatim but detached,
// so freezing the output never touches the caller's objects.
function deepCopy(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(deepCopy)
  const out = {}
  for (const k of Object.keys(value)) out[k] = deepCopy(value[k])
  return out
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

// A domain's evidence overview, copied verbatim from its summary's evidenceSummary. Null when absent.
function evidenceOverviewOf(ok, summary) {
  if (!ok || !isObj(summary.evidenceSummary)) return null
  const e = summary.evidenceSummary
  return {
    assessed: e.assessed === true,
    wellSupported: typeof e.wellSupported === 'number' ? e.wellSupported : null,
    tentative: typeof e.tentative === 'number' ? e.tentative : null,
    unknown: typeof e.unknown === 'number' ? e.unknown : null,
    completeness: strOrNull(e.completeness) || 'unknown',
    consistency: strOrNull(e.consistency) || 'unknown',
  }
}

// A domain's confidence overview, copied verbatim from its summary's confidenceSummary. Null when absent.
function confidenceOverviewOf(ok, summary) {
  if (!ok || !isObj(summary.confidenceSummary)) return null
  const c = summary.confidenceSummary
  return {
    level: strOrNull(c.level) || 'LOW',
    value: numOr0(c.value),
    high: c.high === true,
    low: c.low === true,
  }
}

/**
 * Assemble the deterministic cross-domain intelligence inputs from the two domain summaries.
 *
 * @param {object} selectionSummary an M268 selection intelligence summary
 * @param {object} trainingSummary an M276 training intelligence summary
 * @returns {object} frozen cross-domain inputs.
 */
export function buildCoachDnaCrossDomainIntelligenceInputs(selectionSummary, trainingSummary) {
  const selOk = isObj(selectionSummary) && selectionSummary.type === 'coach-dna-selection-intelligence-summary'
  const trnOk = isObj(trainingSummary) && trainingSummary.type === 'coach-dna-training-intelligence-summary'
  const selUsable = selOk && selectionSummary.valid === true
  const trnUsable = trnOk && trainingSummary.valid === true
  const usableDomains = (selUsable ? 1 : 0) + (trnUsable ? 1 : 0)

  const selectionFingerprint = selOk && typeof selectionSummary.summaryFingerprint === 'string' ? selectionSummary.summaryFingerprint : null
  const trainingFingerprint = trnOk && typeof trainingSummary.summaryFingerprint === 'string' ? trainingSummary.summaryFingerprint : null

  // The two domain summaries, embedded verbatim (deep copies). Assembly only — nothing is compared or combined.
  const selection = selOk ? deepCopy(selectionSummary) : null
  const training = trnOk ? deepCopy(trainingSummary) : null

  // sharedEvidenceOverview: each domain's own evidence figures side by side. No totals, no comparison.
  const sharedEvidenceOverview = {
    selection: evidenceOverviewOf(selOk, selectionSummary),
    training: evidenceOverviewOf(trnOk, trainingSummary),
  }

  // sharedConfidenceOverview: each domain's own confidence side by side. No combined confidence.
  const sharedConfidenceOverview = {
    selection: confidenceOverviewOf(selOk, selectionSummary),
    training: confidenceOverviewOf(trnOk, trainingSummary),
  }

  const selProv = selOk && isObj(selectionSummary.provenance) ? selectionSummary.provenance : null
  const trnProv = trnOk && isObj(trainingSummary.provenance) ? trainingSummary.provenance : null
  const provenance = {
    selectionSource: 'coach-dna-selection-intelligence-summary',
    selectionSourceMilestone: 'M268',
    selectionSummaryFingerprint: selectionFingerprint,
    selectionChain: selProv && Array.isArray(selProv.chain) ? [...selProv.chain] : null,
    trainingSource: 'coach-dna-training-intelligence-summary',
    trainingSourceMilestone: 'M276',
    trainingSummaryFingerprint: trainingFingerprint,
    trainingChain: trnProv && Array.isArray(trnProv.chain) ? [...trnProv.chain] : null,
  }

  const issues = []
  if (!selOk) issues.push('selection summary missing or malformed')
  else if (!selUsable) issues.push('selection summary marked invalid (unusable source)')
  if (!trnOk) issues.push('training summary missing or malformed')
  else if (!trnUsable) issues.push('training summary marked invalid (unusable source)')

  const derivationMetadata = {
    milestone: 'M277',
    domain: 'cross-domain',
    layer: 'inputs',
    assembles: ['M268', 'M276'],
    deterministic: true,
    llmGenerated: false,
    readOnly: true,
    dormant: true,
    selectionIncluded: selOk,
    trainingIncluded: trnOk,
    assemblyOnly: true,
    comparesDomains: false,
    createsNewIntelligence: false,
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
    type: 'coach-dna-cross-domain-intelligence-inputs',
    schemaVersion: 1,
    crossDomainVersion: 1,
    milestone: 'M277',
    valid: usableDomains > 0,
    complete: selUsable && trnUsable,
    usableDomains,
    totalDomains: 2,
    selectionSummary: selection,
    trainingSummary: training,
    sharedEvidenceOverview,
    sharedConfidenceOverview,
    provenance,
    validationState: {
      selectionRecognized: selOk,
      trainingRecognized: trnOk,
      selectionUsable: selUsable,
      trainingUsable: trnUsable,
      issues,
    },
    derivationMetadata,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this assembly.
  draft.crossDomainFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary line set for logs or PR notes.
 * @param {object} selectionSummary an M268 selection intelligence summary
 * @param {object} trainingSummary an M276 training intelligence summary
 * @returns {string}
 */
export function summarizeCoachDnaCrossDomainIntelligenceInputs(selectionSummary, trainingSummary) {
  const x = buildCoachDnaCrossDomainIntelligenceInputs(selectionSummary, trainingSummary)
  const domainLine = (label, included, conf) =>
    `${label}: ${included ? `included · confidence ${conf ? conf.level : 'unknown'}` : 'missing'}`
  return [
    `Coach DNA cross-domain intelligence inputs: ${x.complete ? 'complete' : x.valid ? 'partial' : 'unusable sources'}`,
    domainLine('Selection (M268)', x.derivationMetadata.selectionIncluded, x.sharedConfidenceOverview.selection),
    domainLine('Training (M276)', x.derivationMetadata.trainingIncluded, x.sharedConfidenceOverview.training),
    `Usable domains: ${x.usableDomains}/${x.totalDomains}`,
    `Fingerprint: ${x.crossDomainFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the cross-domain inputs deterministically.
 * @param {object} selectionSummary an M268 selection intelligence summary
 * @param {object} trainingSummary an M276 training intelligence summary
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaCrossDomainIntelligenceInputs(selectionSummary, trainingSummary, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const x = buildCoachDnaCrossDomainIntelligenceInputs(selectionSummary, trainingSummary)
  if (format === 'json') return canonicalStringify(x)
  if (format === 'line') {
    return `coach-dna-cross-domain-intelligence-inputs valid=${x.valid} complete=${x.complete} `
      + `domains=${x.usableDomains}/${x.totalDomains} fp=${x.crossDomainFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA cross-domain intelligence inputs format '${format}'`)
}
