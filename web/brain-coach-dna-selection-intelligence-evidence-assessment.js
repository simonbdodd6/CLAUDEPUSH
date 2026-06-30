/**
 * web/brain-coach-dna-selection-intelligence-evidence-assessment.js - Coach DNA Selection Intelligence Evidence Assessment (M267, DORMANT)
 *
 * The deterministic evidence-assessment layer over the M266 selection characteristics. It does NOT create new
 * characteristics — it only EVALUATES how well-supported the existing M266 characteristics are: which are
 * well-supported, which are tentative, which remain unknown, and how complete/consistent the evidence is
 * overall.
 *
 * It is critically NOT player reasoning. It selects/ranks/scores NO players, recommends NO team and contains
 * NO player data. Every output is a fixed, documented transformation of the M266 characteristics' own emphasis
 * and evidence levels. Where M266 said 'unknown', this layer keeps it unknown — it never infers missing
 * information.
 *
 * Pure function. It reuses ONLY the M266 characteristics shape, mutates no input, performs no writes, makes no
 * recommendation, calls no AI/LLM, and uses no DOM/network/storage/env/database/clock/randomness. Same input →
 * same assessment, byte for byte.
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

// The five M266 characteristics, in fixed order, each mapped to its evidence lens. Membership lists below are
// categories in this fixed order — NOT rankings.
const CHARACTERISTICS = Object.freeze([
  { name: 'selectionEmphasis', lens: 'selectionSignals' },
  { name: 'continuityCharacteristics', lens: 'continuitySignals' },
  { name: 'rotationCharacteristics', lens: 'rotationSignals' },
  { name: 'trustCharacteristics', lens: 'playerTrustSignals' },
  { name: 'availabilityCharacteristics', lens: 'availabilitySignals' },
])

// ---- Documented deterministic rules (recorded in derivationMetadata.thresholds) ----------------------------
const COMPLETENESS_HIGH = 0.66
const COMPLETENESS_MODERATE = 0.33
const CONSISTENCY_FULL = 0.999
const CONSISTENCY_MOSTLY = 0.5

// Support of a single characteristic, from its M266 emphasis + its lens evidence level. Unknown stays unknown.
function supportOf(present, emphasis, evidenceLevel) {
  if (present !== true || emphasis === 'unknown') return 'unknown'
  if (evidenceLevel === 'well-evidenced') return 'well-supported'
  return 'tentative'   // present but only tentative / no supporting count
}

// Consistency of a present characteristic: a strong/moderate emphasis with NO evidence is inconsistent.
function consistencyOf(present, emphasis, evidenceLevel) {
  if (present !== true || emphasis === 'unknown') return null   // not applicable
  if ((emphasis === 'strong' || emphasis === 'moderate') && evidenceLevel === 'none') return false
  return true
}

function completenessLevel(wellSupported, tentative, total) {
  if (wellSupported === 0 && tentative === 0) return 'none'
  const ratio = total ? wellSupported / total : 0
  if (ratio >= COMPLETENESS_HIGH) return 'high'
  if (ratio >= COMPLETENESS_MODERATE) return 'moderate'
  return 'low'
}

function consistencyLevel(consistent, applicable) {
  if (applicable === 0) return 'unknown'
  const ratio = consistent / applicable
  if (ratio >= CONSISTENCY_FULL) return 'consistent'
  if (ratio >= CONSISTENCY_MOSTLY) return 'mostly-consistent'
  return 'mixed'
}

const CONFIDENCE_NOTE = Object.freeze({
  HIGH: 'characteristics rest on highly self-consistent Coach DNA',
  MEDIUM: 'characteristics rest on moderately self-consistent Coach DNA',
  LOW: 'characteristics rest on weakly self-consistent Coach DNA',
})

/**
 * Build the deterministic evidence assessment from an M266 selection characteristics object.
 *
 * @param {object} characteristics an M266 selection intelligence characteristics object
 * @returns {object} frozen evidence assessment.
 */
export function buildCoachDnaSelectionIntelligenceEvidenceAssessment(characteristics) {
  const charsOk = isObj(characteristics) && characteristics.type === 'coach-dna-selection-intelligence-characteristics'
  const usable = charsOk && characteristics.valid === true

  const evByLens = charsOk && isObj(characteristics.evidenceCharacteristics) && isObj(characteristics.evidenceCharacteristics.byLens)
    ? characteristics.evidenceCharacteristics.byLens
    : {}

  const unknownCharacteristics = []
  const wellSupportedCharacteristics = []
  const tentativeCharacteristics = []
  let presentCount = 0
  let consistentCount = 0
  let applicableCount = 0

  for (const { name, lens } of CHARACTERISTICS) {
    const ch = charsOk && isObj(characteristics[name]) ? characteristics[name] : null
    const present = isObj(ch) && ch.present === true
    const emphasis = ch ? (strOrNull(ch.emphasis) || 'unknown') : 'unknown'
    const evidenceLevel = isObj(evByLens[lens]) ? (strOrNull(evByLens[lens].level) || 'none') : 'none'

    if (present) presentCount += 1
    const support = supportOf(present, emphasis, evidenceLevel)
    if (support === 'well-supported') wellSupportedCharacteristics.push(name)
    else if (support === 'tentative') tentativeCharacteristics.push(name)
    else unknownCharacteristics.push(name)

    const consistent = consistencyOf(present, emphasis, evidenceLevel)
    if (consistent !== null) { applicableCount += 1; if (consistent) consistentCount += 1 }
  }

  const total = CHARACTERISTICS.length
  const characteristicCoverage = {
    totalCharacteristics: total,
    present: presentCount,
    unknown: unknownCharacteristics.length,
    coverageRatio: total ? presentCount / total : 0,
  }

  const evidenceCompleteness = {
    wellSupported: wellSupportedCharacteristics.length,
    tentative: tentativeCharacteristics.length,
    unknown: unknownCharacteristics.length,
    completenessRatio: total ? wellSupportedCharacteristics.length / total : 0,
    level: completenessLevel(wellSupportedCharacteristics.length, tentativeCharacteristics.length, total),
  }

  const evidenceConsistency = {
    applicable: applicableCount,
    consistent: consistentCount,
    inconsistent: applicableCount - consistentCount,
    consistencyRatio: applicableCount ? consistentCount / applicableCount : 0,
    level: consistencyLevel(consistentCount, applicableCount),
  }

  const cc = charsOk && isObj(characteristics.confidenceCharacteristics) ? characteristics.confidenceCharacteristics : {}
  const level = strOrNull(cc.level) || 'LOW'
  const confidenceAssessment = {
    level,
    value: numOr0(cc.value),
    high: cc.high === true,
    low: cc.low === true,
    note: CONFIDENCE_NOTE[level] || CONFIDENCE_NOTE.LOW,
  }

  const inProv = charsOk && isObj(characteristics.provenance) ? characteristics.provenance : null
  const provenance = {
    source: 'coach-dna-selection-intelligence-characteristics',
    sourceMilestone: 'M266',
    characteristicsFingerprint: charsOk && typeof characteristics.characteristicsFingerprint === 'string' ? characteristics.characteristicsFingerprint : null,
    recognizable: charsOk,
    origin: inProv ? {
      source: strOrNull(inProv.source),
      sourceMilestone: strOrNull(inProv.sourceMilestone),
      chain: Array.isArray(inProv.chain) ? [...inProv.chain] : null,
      profileFingerprint: strOrNull(inProv.profileFingerprint),
    } : null,
  }

  const issues = []
  if (!charsOk) issues.push('selection characteristics missing or malformed')
  else if (!usable) issues.push('selection characteristics marked invalid (unusable source)')

  const derivationMetadata = {
    milestone: 'M267',
    domain: 'selection',
    layer: 'evidence-assessment',
    derivedFrom: 'coach-dna-selection-intelligence-characteristics',
    sourceMilestone: 'M266',
    deterministic: true,
    ruleBased: true,
    llmGenerated: false,
    readOnly: true,
    dormant: true,
    assessesCharacteristics: true,
    createsCharacteristics: false,
    containsPlayerData: false,
    playerSelection: false,
    playerRanking: false,
    playerScoring: false,
    teamRecommendation: false,
    thresholds: {
      completenessHigh: COMPLETENESS_HIGH,
      completenessModerate: COMPLETENESS_MODERATE,
      consistencyFull: CONSISTENCY_FULL,
      consistencyMostly: CONSISTENCY_MOSTLY,
    },
  }

  const draft = {
    type: 'coach-dna-selection-intelligence-evidence-assessment',
    schemaVersion: 1,
    assessmentVersion: 1,
    milestone: 'M267',
    valid: usable,
    characteristicCoverage,
    evidenceCompleteness,
    evidenceConsistency,
    confidenceAssessment,
    unknownCharacteristics,
    wellSupportedCharacteristics,
    tentativeCharacteristics,
    provenance,
    validationState: { characteristicsRecognized: charsOk, usable, issues },
    derivationMetadata,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this assessment.
  draft.assessmentFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the evidence assessment for logs or PR notes.
 * @param {object} characteristics an M266 selection characteristics object
 * @returns {string}
 */
export function summarizeCoachDnaSelectionIntelligenceEvidenceAssessment(characteristics) {
  const a = buildCoachDnaSelectionIntelligenceEvidenceAssessment(characteristics)
  return [
    `Coach DNA selection evidence assessment: ${a.valid ? 'assessed' : 'unusable source'}`,
    `Coverage: ${a.characteristicCoverage.present}/${a.characteristicCoverage.totalCharacteristics} present`,
    `Well-supported: ${a.evidenceCompleteness.wellSupported} · Tentative: ${a.evidenceCompleteness.tentative} · Unknown: ${a.evidenceCompleteness.unknown}`,
    `Completeness: ${a.evidenceCompleteness.level} · Consistency: ${a.evidenceConsistency.level}`,
    `Confidence: ${a.confidenceAssessment.level}`,
    `Fingerprint: ${a.assessmentFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the evidence assessment deterministically.
 * @param {object} characteristics an M266 selection characteristics object
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaSelectionIntelligenceEvidenceAssessment(characteristics, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const a = buildCoachDnaSelectionIntelligenceEvidenceAssessment(characteristics)
  if (format === 'json') return canonicalStringify(a)
  if (format === 'line') {
    return `coach-dna-selection-intelligence-evidence-assessment valid=${a.valid} `
      + `wellSupported=${a.evidenceCompleteness.wellSupported} tentative=${a.evidenceCompleteness.tentative} unknown=${a.evidenceCompleteness.unknown} `
      + `completeness=${a.evidenceCompleteness.level} consistency=${a.evidenceConsistency.level} fp=${a.assessmentFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA selection evidence assessment format '${format}'`)
}
