/**
 * web/brain-coach-dna-selection-intelligence-summary.js - Coach DNA Selection Intelligence Summary (M268, DORMANT)
 *
 * The top-level summary of the selection reasoning chain. It folds the M266 selection characteristics and the
 * M267 evidence assessment into one compact, deterministic overview a future surface could read at a glance:
 * the coach's selection style, how well-evidenced it is, the confidence behind it, what remains unknown, and
 * whether there is enough Coach DNA to characterise selection at all.
 *
 * It is critically NOT player selection: it creates NO new recommendation, selects/ranks/scores NO players,
 * recommends NO team and contains NO player data. Every summary field is a compact projection of values already
 * present in M266/M267. Where the chain said 'unknown', this summary keeps it unknown — it never infers.
 *
 * Pure function. It reuses ONLY the M266/M267 shapes (importing neither builder), mutates no input, performs no
 * writes, makes no recommendation, calls no AI/LLM, and uses no DOM/network/storage/env/database/clock/
 * randomness. Same input → same summary, byte for byte.
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

// The five M266 characteristics, mapped to their summary keys, in fixed order.
const CHAR_MAP = Object.freeze([
  { field: 'selectionEmphasis', summaryKey: 'selectionEmphasis' },
  { field: 'continuityCharacteristics', summaryKey: 'continuity' },
  { field: 'rotationCharacteristics', summaryKey: 'rotation' },
  { field: 'trustCharacteristics', summaryKey: 'trust' },
  { field: 'availabilityCharacteristics', summaryKey: 'availability' },
])

const READINESS_NOTE = Object.freeze({
  ready: 'sufficient well-supported Coach DNA to characterise selection behaviour',
  partial: 'partial Coach DNA available to characterise selection behaviour',
  insufficient: 'insufficient Coach DNA to characterise selection behaviour',
  unknown: 'source characteristics unavailable',
})

// Documented readiness rule (recorded in derivationMetadata). NOT a team/player readiness — it reports whether
// there is enough Coach DNA to characterise the coach's selection behaviour.
function readinessOf(usable, presentCount, completenessLevel) {
  if (!usable) return 'unknown'
  if (presentCount === 0) return 'insufficient'
  if (completenessLevel === 'high') return 'ready'
  if (completenessLevel === 'none') return 'insufficient'
  return 'partial'
}

/**
 * Build the deterministic top-level Coach DNA selection intelligence summary.
 *
 * @param {object} characteristics an M266 selection characteristics object
 * @param {object} [assessment] an optional M267 evidence assessment
 * @returns {object} frozen summary.
 */
export function buildCoachDnaSelectionIntelligenceSummary(characteristics, assessment) {
  const charsOk = isObj(characteristics) && characteristics.type === 'coach-dna-selection-intelligence-characteristics'
  const assessOk = isObj(assessment) && assessment.type === 'coach-dna-selection-intelligence-evidence-assessment'
  const usable = charsOk && characteristics.valid === true

  const characteristicsFingerprint = charsOk && typeof characteristics.characteristicsFingerprint === 'string' ? characteristics.characteristicsFingerprint : null
  const assessmentFingerprint = assessOk && typeof assessment.assessmentFingerprint === 'string' ? assessment.assessmentFingerprint : null

  // selectionStyleSummary: the emphasis of each characteristic + which is strongest (a flag from M266, not a
  // ranking). Unknown stays unknown.
  const style = {}
  let presentCount = 0
  let strongestKey = null
  for (const { field, summaryKey } of CHAR_MAP) {
    const ch = charsOk && isObj(characteristics[field]) ? characteristics[field] : null
    const emphasis = ch ? (strOrNull(ch.emphasis) || 'unknown') : 'unknown'
    style[summaryKey] = emphasis
    if (ch && ch.present === true) presentCount += 1
    if (ch && ch.isStrongest === true && strongestKey === null) strongestKey = summaryKey
  }
  const selectionStyleSummary = {
    ...style,
    strongestCharacteristic: strongestKey,
    presentCharacteristics: presentCount,
    totalCharacteristics: CHAR_MAP.length,
  }

  // evidenceSummary: from M267 when present; otherwise marked not-assessed (no re-derivation).
  const comp = assessOk && isObj(assessment.evidenceCompleteness) ? assessment.evidenceCompleteness : {}
  const cons = assessOk && isObj(assessment.evidenceConsistency) ? assessment.evidenceConsistency : {}
  const evidenceSummary = {
    assessed: assessOk,
    wellSupported: assessOk ? numOr0(comp.wellSupported) : null,
    tentative: assessOk ? numOr0(comp.tentative) : null,
    unknown: assessOk ? numOr0(comp.unknown) : null,
    completeness: assessOk ? (strOrNull(comp.level) || 'none') : 'unknown',
    consistency: assessOk ? (strOrNull(cons.level) || 'unknown') : 'unknown',
    wellSupportedCharacteristics: assessOk && Array.isArray(assessment.wellSupportedCharacteristics) ? [...assessment.wellSupportedCharacteristics] : [],
    tentativeCharacteristics: assessOk && Array.isArray(assessment.tentativeCharacteristics) ? [...assessment.tentativeCharacteristics] : [],
  }

  // confidenceSummary: copied from the M266 characteristics (the source of confidence).
  const cc = charsOk && isObj(characteristics.confidenceCharacteristics) ? characteristics.confidenceCharacteristics : {}
  const confidenceSummary = {
    level: strOrNull(cc.level) || 'LOW',
    value: numOr0(cc.value),
    high: cc.high === true,
    low: cc.low === true,
  }

  // unknownSummary: the characteristics that are unknown. Prefer M267's list; otherwise read M266 emphasis.
  let unknownCharacteristics
  if (assessOk && Array.isArray(assessment.unknownCharacteristics)) {
    unknownCharacteristics = [...assessment.unknownCharacteristics]
  } else {
    unknownCharacteristics = CHAR_MAP.filter(({ field }) => {
      const ch = charsOk && isObj(characteristics[field]) ? characteristics[field] : null
      return !ch || ch.emphasis === 'unknown' || ch.present !== true
    }).map(({ field }) => field)
  }
  const unknownSummary = {
    unknownCharacteristics,
    unknownCount: unknownCharacteristics.length,
    allKnown: usable && unknownCharacteristics.length === 0,
  }

  const readiness = readinessOf(usable, presentCount, assessOk ? strOrNull(comp.level) : null)
  const readinessSummary = {
    readiness,
    note: READINESS_NOTE[readiness],
    presentCharacteristics: presentCount,
    totalCharacteristics: CHAR_MAP.length,
    assessmentIncluded: assessOk,
  }

  // M266's own provenance.chain holds the full M230-M263 lineage (its .origin.chain is the shorter M255 view).
  const inProv = charsOk && isObj(characteristics.provenance) ? characteristics.provenance : null
  const provenance = {
    characteristicsSource: 'coach-dna-selection-intelligence-characteristics',
    characteristicsSourceMilestone: 'M266',
    assessmentSource: 'coach-dna-selection-intelligence-evidence-assessment',
    assessmentSourceMilestone: 'M267',
    characteristicsFingerprint,
    assessmentFingerprint,
    chain: inProv && Array.isArray(inProv.chain) ? [...inProv.chain] : null,
    profileFingerprint: inProv ? strOrNull(inProv.profileFingerprint) : null,
  }

  const issues = []
  if (!charsOk) issues.push('selection characteristics missing or malformed')
  else if (!usable) issues.push('selection characteristics marked invalid (unusable source)')
  if (!assessOk) issues.push('evidence assessment not supplied')

  const derivationMetadata = {
    milestone: 'M268',
    domain: 'selection',
    layer: 'summary',
    summarizes: ['M266', 'M267'],
    deterministic: true,
    llmGenerated: false,
    readOnly: true,
    dormant: true,
    assessmentIncluded: assessOk,
    assessmentMatchesCharacteristics: assessOk && charsOk && isObj(assessment.provenance)
      ? assessment.provenance.characteristicsFingerprint === characteristics.characteristicsFingerprint
      : null,
    containsPlayerData: false,
    playerSelection: false,
    playerRanking: false,
    playerScoring: false,
    teamRecommendation: false,
  }

  const draft = {
    type: 'coach-dna-selection-intelligence-summary',
    schemaVersion: 1,
    summaryVersion: 1,
    milestone: 'M268',
    valid: usable,
    characteristicsFingerprint,
    assessmentFingerprint,
    selectionStyleSummary,
    evidenceSummary,
    confidenceSummary,
    unknownSummary,
    readinessSummary,
    provenance,
    validationState: { characteristicsRecognized: charsOk, assessmentRecognized: assessOk, usable, issues },
    derivationMetadata,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this summary.
  draft.summaryFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary line set for logs or PR notes.
 * @param {object} characteristics an M266 selection characteristics object
 * @param {object} [assessment] an optional M267 evidence assessment
 * @returns {string}
 */
export function summarizeCoachDnaSelectionIntelligenceSummary(characteristics, assessment) {
  const s = buildCoachDnaSelectionIntelligenceSummary(characteristics, assessment)
  return [
    `Coach DNA selection intelligence summary: ${s.valid ? 'summarised' : 'unusable source'}`,
    `Selection emphasis: ${s.selectionStyleSummary.selectionEmphasis} · Strongest: ${s.selectionStyleSummary.strongestCharacteristic || 'none'}`,
    `Evidence: ${s.evidenceSummary.assessed ? `${s.evidenceSummary.wellSupported} well-supported, ${s.evidenceSummary.tentative} tentative` : 'not assessed'}`,
    `Unknown: ${s.unknownSummary.unknownCount}/${s.selectionStyleSummary.totalCharacteristics}`,
    `Confidence: ${s.confidenceSummary.level} · Readiness: ${s.readinessSummary.readiness}`,
    `Fingerprint: ${s.summaryFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the summary deterministically.
 * @param {object} characteristics an M266 selection characteristics object
 * @param {object} [assessment] an optional M267 evidence assessment
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaSelectionIntelligenceSummary(characteristics, assessment, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const s = buildCoachDnaSelectionIntelligenceSummary(characteristics, assessment)
  if (format === 'json') return canonicalStringify(s)
  if (format === 'line') {
    return `coach-dna-selection-intelligence-summary valid=${s.valid} readiness=${s.readinessSummary.readiness} `
      + `unknown=${s.unknownSummary.unknownCount}/${s.selectionStyleSummary.totalCharacteristics} `
      + `confidence=${s.confidenceSummary.level} fp=${s.summaryFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA selection intelligence summary format '${format}'`)
}
