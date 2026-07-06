/**
 * web/brain-coach-dna-cross-domain-intelligence-index.js - Coach DNA Cross-Domain Intelligence Index (M279, DORMANT)
 *
 * The stable navigation layer for the cross-domain chapter — the cross-domain analogue of the M263/M271 domain
 * indexes. Where M278 produces the complete Cross-Domain Intelligence Profile, this module turns it into keyed
 * lookup surfaces (by domain, by evidence, by confidence, by provenance) so future cross-domain consumers can
 * query a single domain in O(1) without walking the profile or depending on its internal structure.
 *
 * It critically creates NO new intelligence: it does NOT compare the domains, does NOT combine or reconcile
 * their figures, makes NO recommendation and gives NO coaching advice. It selects/ranks/scores/evaluates NO
 * players, recommends NO training and contains NO player data. Every index entry is a deterministic re-keying
 * or projection of values already present in the M278 profile. The domain index is keyed and total — both
 * expected domains (selection, training) always exist (usable or not) so downstream consumers never need
 * existence checks. Nothing is ordered or scored; unknown remains unknown.
 *
 * Pure function. It reuses ONLY the M278 profile shape, mutates no input, performs no writes, makes no
 * recommendation, calls no AI/LLM, and uses no DOM/network/storage/env/database/clock/randomness. Same input →
 * same index, byte for byte.
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

// The two domains, fixed order — total and deterministic. Never sorted, so nothing is implicitly ranked.
const DOMAIN_KEYS = Object.freeze(['selection', 'training'])
const DOMAIN_SOURCE_MILESTONES = Object.freeze({ selection: 'M268', training: 'M276' })
// The cross-domain lineage this index attests to (each domain's own M230-rooted chain is carried byDomain).
const PROVENANCE_CHAIN = Object.freeze(['M277', 'M278', 'M279'])

/**
 * Build the deterministic Coach DNA cross-domain intelligence index from an M278 cross-domain profile.
 *
 * @param {object} profile an M278 cross-domain intelligence profile
 * @returns {object} frozen cross-domain index; validationState.profileUsable is false for malformed/invalid input.
 */
export function buildCoachDnaCrossDomainIntelligenceIndex(profile) {
  const profileOk = isObj(profile) && profile.type === 'coach-dna-cross-domain-intelligence-profile'
  const profileUsable = profileOk && isObj(profile.validationState) && profile.validationState.usable === true

  const ds = profileOk && isObj(profile.domainSummary) ? profile.domainSummary : {}
  const entryArray = Array.isArray(ds.domains) ? ds.domains.filter(isObj) : []
  const entryByName = (name) => entryArray.find((d) => d.domain === name) || null

  // domainIndex: O(1) lookup keyed by domain name. Both domains are always keyed (missing ones default to an
  // absent entry) so the index is total and stable. No ordering, no scoring, no comparison.
  const domainIndex = {}
  for (const key of DOMAIN_KEYS) {
    const d = entryByName(key)
    domainIndex[key] = {
      domain: key,
      sourceMilestone: DOMAIN_SOURCE_MILESTONES[key],
      included: d ? d.included === true : false,
      usable: d ? d.usable === true : false,
      summaryFingerprint: d ? strOrNull(d.summaryFingerprint) : null,
      readiness: d ? (strOrNull(d.readiness) || 'unknown') : 'unknown',
      presentCharacteristics: d ? numOrNull(d.presentCharacteristics) : null,
      totalCharacteristics: d ? numOrNull(d.totalCharacteristics) : null,
      strongestCharacteristic: d ? strOrNull(d.strongestCharacteristic) : null,
      unknownCount: d ? numOrNull(d.unknownCount) : null,
    }
  }

  // evidenceIndex / confidenceIndex: each domain's own M278 overview keyed by domain, copied verbatim.
  // Both keys always exist (null when the domain is missing). No totals, no comparison, no reconciliation.
  const eo = profileOk && isObj(profile.evidenceOverview) ? profile.evidenceOverview : {}
  const co = profileOk && isObj(profile.confidenceOverview) ? profile.confidenceOverview : {}
  const evidenceIndex = {
    byDomain: DOMAIN_KEYS.reduce((acc, key) => {
      acc[key] = isObj(eo[key]) ? { ...eo[key] } : null
      return acc
    }, {}),
  }
  const confidenceIndex = {
    byDomain: DOMAIN_KEYS.reduce((acc, key) => {
      acc[key] = isObj(co[key]) ? { ...co[key] } : null
      return acc
    }, {}),
  }

  const profileFingerprint = profileOk && typeof profile.profileFingerprint === 'string' ? profile.profileFingerprint : null
  const crossDomainInputsFingerprint = profileOk && typeof profile.crossDomainInputsFingerprint === 'string' ? profile.crossDomainInputsFingerprint : null
  const inProv = profileOk && isObj(profile.provenance) ? profile.provenance : null
  const domainProv = (side) => {
    const p = inProv && isObj(inProv[side]) ? inProv[side] : null
    return p ? {
      source: strOrNull(p.source),
      sourceMilestone: strOrNull(p.sourceMilestone),
      summaryFingerprint: strOrNull(p.summaryFingerprint),
      chain: Array.isArray(p.chain) ? [...p.chain] : null,
    } : null
  }

  const provenanceIndex = {
    chain: PROVENANCE_CHAIN,
    profileFingerprint,
    crossDomainInputsFingerprint,
    byDomain: {
      selection: domainProv('selection'),
      training: domainProv('training'),
    },
    byMilestone: {
      M268: { milestone: 'M268', role: 'selection-intelligence-summary', fingerprint: domainIndex.selection.summaryFingerprint },
      M276: { milestone: 'M276', role: 'training-intelligence-summary', fingerprint: domainIndex.training.summaryFingerprint },
      M277: { milestone: 'M277', role: 'cross-domain-intelligence-inputs', fingerprint: crossDomainInputsFingerprint },
      M278: { milestone: 'M278', role: 'cross-domain-intelligence-profile', fingerprint: profileFingerprint },
    },
  }

  const includedDomains = DOMAIN_KEYS.filter((k) => domainIndex[k].included).length
  const usableDomains = DOMAIN_KEYS.filter((k) => domainIndex[k].usable).length
  const cs = profileOk && isObj(profile.completenessState) ? profile.completenessState : {}

  const issues = []
  if (!profileOk) issues.push('cross-domain profile missing or malformed')
  else if (!profileUsable) issues.push('cross-domain profile not usable (source inputs were invalid)')
  const validationState = {
    profileRecognized: profileOk,
    profileUsable,
    includedDomains,
    usableDomains,
    totalDomains: DOMAIN_KEYS.length,
    completenessLevel: profileOk ? (strOrNull(cs.level) || 'empty') : 'empty',
    issues,
  }

  const derivationMetadata = {
    milestone: 'M279',
    domain: 'cross-domain',
    layer: 'index',
    derivedFrom: 'coach-dna-cross-domain-intelligence-profile',
    sourceMilestone: 'M278',
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
    type: 'coach-dna-cross-domain-intelligence-index',
    schemaVersion: 1,
    indexVersion: 1,
    milestone: 'M279',
    profileFingerprint,
    domainIndex,
    evidenceIndex,
    confidenceIndex,
    provenanceIndex,
    validationState,
    derivationMetadata,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this index.
  draft.indexFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the cross-domain index for logs or PR notes.
 * @param {object} profile an M278 cross-domain intelligence profile
 * @returns {string}
 */
export function summarizeCoachDnaCrossDomainIntelligenceIndex(profile) {
  const x = buildCoachDnaCrossDomainIntelligenceIndex(profile)
  return [
    `Coach DNA cross-domain intelligence index: ${x.validationState.profileUsable ? 'queryable' : 'unusable source'}`,
    `Domains indexed: ${Object.keys(x.domainIndex).length}`,
    `Usable: ${x.validationState.usableDomains}/${x.validationState.totalDomains} · Completeness: ${x.validationState.completenessLevel}`,
    `Fingerprint: ${x.indexFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the cross-domain index deterministically.
 * @param {object} profile an M278 cross-domain intelligence profile
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaCrossDomainIntelligenceIndex(profile, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const x = buildCoachDnaCrossDomainIntelligenceIndex(profile)
  if (format === 'json') return canonicalStringify(x)
  if (format === 'line') {
    return `coach-dna-cross-domain-intelligence-index usable=${x.validationState.profileUsable} `
      + `domains=${x.validationState.usableDomains}/${x.validationState.totalDomains} `
      + `completeness=${x.validationState.completenessLevel} fp=${x.indexFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA cross-domain intelligence index format '${format}'`)
}
