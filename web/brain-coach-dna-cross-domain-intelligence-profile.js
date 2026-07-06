/**
 * web/brain-coach-dna-cross-domain-intelligence-profile.js - Coach DNA Cross-Domain Intelligence Profile (M278, DORMANT)
 *
 * The stable assembled object for the cross-domain chapter — the cross-domain analogue of the M262/M270 domain
 * profiles. Where M277 assembles the raw domain summaries side by side, this module folds that assembly into
 * one immutable Cross-Domain Intelligence Profile that future cross-domain reasoning layers can consume through
 * a single interface: a per-domain summary inventory, the side-by-side evidence and confidence overviews, and
 * an explicit completeness state.
 *
 * It critically creates NO new intelligence: it does NOT compare the domains, does NOT combine or reconcile
 * their figures, makes NO recommendation and gives NO coaching advice. It selects/ranks/scores/evaluates NO
 * players, recommends NO training and contains NO player data. Every field is a deterministic projection of
 * values already present in the M277 inputs — the domain list is kept in a fixed order (selection, training —
 * never sorted) so nothing is implicitly ranked. Where a domain is missing, its slot stays null — never
 * inferred.
 *
 * Pure function. It reuses ONLY the M277 inputs shape, mutates no input, performs no writes, makes no
 * recommendation, calls no AI/LLM, and uses no DOM/network/storage/env/database/clock/randomness. Same input →
 * same profile, byte for byte.
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

// The two domains, fixed order (never sorted) so nothing is implicitly ranked or preferred.
const DOMAINS = Object.freeze([
  { key: 'selection', summaryField: 'selectionSummary', styleField: 'selectionStyleSummary', sourceMilestone: 'M268' },
  { key: 'training', summaryField: 'trainingSummary', styleField: 'trainingStyleSummary', sourceMilestone: 'M276' },
])

// One domain's entry in the profile: a projection of its embedded summary in the M277 assembly. Null-safe —
// a missing domain yields included:false with null facts, never inferred values.
function domainEntryOf(inputs, inputsOk, { key, summaryField, styleField, sourceMilestone }) {
  const vs = inputsOk && isObj(inputs.validationState) ? inputs.validationState : {}
  const s = inputsOk && isObj(inputs[summaryField]) ? inputs[summaryField] : null
  const style = s && isObj(s[styleField]) ? s[styleField] : null
  const readiness = s && isObj(s.readinessSummary) ? s.readinessSummary : null
  const unknown = s && isObj(s.unknownSummary) ? s.unknownSummary : null
  return {
    domain: key,
    sourceMilestone,
    included: s !== null,
    usable: vs[`${key}Usable`] === true,
    summaryFingerprint: s ? strOrNull(s.summaryFingerprint) : null,
    readiness: readiness ? (strOrNull(readiness.readiness) || 'unknown') : 'unknown',
    presentCharacteristics: style ? numOr0(style.presentCharacteristics) : null,
    totalCharacteristics: style ? numOr0(style.totalCharacteristics) : null,
    strongestCharacteristic: style ? strOrNull(style.strongestCharacteristic) : null,
    unknownCount: unknown ? numOr0(unknown.unknownCount) : null,
  }
}

// A verbatim copy of one side of an M277 shared overview ({selection, training} of plain objects or null).
function overviewCopyOf(inputsOk, overview) {
  const o = inputsOk && isObj(overview) ? overview : {}
  const copySide = (side) => (isObj(o[side]) ? { ...o[side] } : null)
  return { selection: copySide('selection'), training: copySide('training') }
}

/**
 * Build the deterministic Coach DNA cross-domain intelligence profile from an M277 inputs object.
 *
 * @param {object} inputs an M277 cross-domain intelligence inputs object
 * @returns {object} frozen cross-domain profile; validationState.usable is false for malformed/invalid input.
 */
export function buildCoachDnaCrossDomainIntelligenceProfile(inputs) {
  const inputsOk = isObj(inputs) && inputs.type === 'coach-dna-cross-domain-intelligence-inputs'
  const inputsValid = inputsOk && inputs.valid === true
  const usable = inputsValid

  // Domains kept in FIXED order — never sorted — so nothing is implicitly ranked.
  const domains = DOMAINS.map((d) => domainEntryOf(inputs, inputsOk, d))
  const includedDomains = domains.filter((d) => d.included).length
  const usableDomains = domains.filter((d) => d.usable).length
  const domainSummary = {
    totalDomains: DOMAINS.length,
    includedDomains,
    usableDomains,
    domains,
  }

  // The M277 side-by-side overviews, copied verbatim. No totals, no comparison, no reconciliation.
  const evidenceOverview = overviewCopyOf(inputsOk, inputsOk ? inputs.sharedEvidenceOverview : null)
  const confidenceOverview = overviewCopyOf(inputsOk, inputsOk ? inputs.sharedConfidenceOverview : null)

  const complete = inputsOk && inputs.complete === true
  const completenessState = {
    complete,
    level: complete ? 'complete' : usableDomains > 0 ? 'partial' : 'empty',
    usableDomains,
    totalDomains: DOMAINS.length,
    missingDomains: domains.filter((d) => !d.usable).map((d) => d.domain),
  }

  const crossDomainInputsFingerprint = inputsOk && typeof inputs.crossDomainFingerprint === 'string'
    ? inputs.crossDomainFingerprint
    : null

  // Preserve the provenance: this profile ← M277 inputs ← the two domain summary chains back to M230.
  const inProv = inputsOk && isObj(inputs.provenance) ? inputs.provenance : null
  const provenance = {
    source: 'coach-dna-cross-domain-intelligence-inputs',
    sourceMilestone: 'M277',
    crossDomainInputsFingerprint,
    recognizable: inputsOk,
    selection: inProv ? {
      source: strOrNull(inProv.selectionSource),
      sourceMilestone: strOrNull(inProv.selectionSourceMilestone),
      summaryFingerprint: strOrNull(inProv.selectionSummaryFingerprint),
      chain: Array.isArray(inProv.selectionChain) ? [...inProv.selectionChain] : null,
    } : null,
    training: inProv ? {
      source: strOrNull(inProv.trainingSource),
      sourceMilestone: strOrNull(inProv.trainingSourceMilestone),
      summaryFingerprint: strOrNull(inProv.trainingSummaryFingerprint),
      chain: Array.isArray(inProv.trainingChain) ? [...inProv.trainingChain] : null,
    } : null,
  }

  const issues = []
  if (!inputsOk) issues.push('cross-domain inputs missing or malformed')
  else if (!inputsValid) issues.push('cross-domain inputs marked invalid (no usable domain)')
  const sourceIssues = inputsOk && isObj(inputs.validationState) && Array.isArray(inputs.validationState.issues)
    ? [...inputs.validationState.issues]
    : []
  const validationState = {
    inputsRecognized: inputsOk,
    inputsValid,
    usable,
    issues,
    sourceIssues,
  }

  const derivationMetadata = {
    milestone: 'M278',
    domain: 'cross-domain',
    layer: 'profile',
    derivedFrom: 'coach-dna-cross-domain-intelligence-inputs',
    sourceMilestone: 'M277',
    deterministic: true,
    llmGenerated: false,
    readOnly: true,
    dormant: true,
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
    type: 'coach-dna-cross-domain-intelligence-profile',
    schemaVersion: 1,
    profileVersion: 'cross-domain-intelligence-profile-v1',
    milestone: 'M278',
    crossDomainInputsFingerprint,
    domainSummary,
    evidenceOverview,
    confidenceOverview,
    completenessState,
    provenance,
    validationState,
    derivationMetadata,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this profile.
  draft.profileFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the cross-domain profile for logs or PR notes.
 * @param {object} inputs an M277 cross-domain intelligence inputs object
 * @returns {string}
 */
export function summarizeCoachDnaCrossDomainIntelligenceProfile(inputs) {
  const p = buildCoachDnaCrossDomainIntelligenceProfile(inputs)
  const entryLine = (d) => `${d.domain === 'selection' ? 'Selection' : 'Training'} (${d.sourceMilestone}): ${d.usable ? `usable · readiness ${d.readiness}` : 'missing'}`
  return [
    `Coach DNA cross-domain intelligence profile: ${p.validationState.usable ? p.completenessState.level : 'unusable source'}`,
    ...p.domainSummary.domains.map(entryLine),
    `Domains: ${p.completenessState.usableDomains}/${p.completenessState.totalDomains} usable`,
    `Fingerprint: ${p.profileFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the cross-domain profile deterministically.
 * @param {object} inputs an M277 cross-domain intelligence inputs object
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaCrossDomainIntelligenceProfile(inputs, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const p = buildCoachDnaCrossDomainIntelligenceProfile(inputs)
  if (format === 'json') return canonicalStringify(p)
  if (format === 'line') {
    return `coach-dna-cross-domain-intelligence-profile usable=${p.validationState.usable} `
      + `completeness=${p.completenessState.level} domains=${p.completenessState.usableDomains}/${p.completenessState.totalDomains} `
      + `fp=${p.profileFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA cross-domain intelligence profile format '${format}'`)
}
