/**
 * web/brain-coach-dna-training-intelligence-summary.js - Coach DNA Training Intelligence Summary (M276, DORMANT)
 *
 * The top-level summary of the training reasoning chain — the training-domain analogue of the M268 selection
 * summary. It folds the M274 training characteristics and the M275 evidence assessment into one compact,
 * deterministic overview a future surface could read at a glance: the coach's training style, how well-evidenced
 * it is, the confidence behind it, what remains unknown, and whether there is enough Coach DNA to characterise
 * training behaviour at all.
 *
 * It is critically NOT a training engine: it creates NO new recommendation, generates NO training plans or
 * drills, analyses NO sessions, evaluates NO players and contains NO player data. Every summary field is a
 * compact projection of values already present in M274/M275. Where the chain said 'unknown', this summary keeps
 * it unknown — it never infers.
 *
 * Pure function. It reuses ONLY the M274/M275 shapes (importing neither builder), mutates no input, performs no
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

// The six M274 characteristics, mapped to their summary keys, in fixed order.
const CHAR_MAP = Object.freeze([
  { field: 'planningCharacteristics', summaryKey: 'planning' },
  { field: 'sessionStructureCharacteristics', summaryKey: 'sessionStructure' },
  { field: 'developmentCharacteristics', summaryKey: 'development' },
  { field: 'technicalCharacteristics', summaryKey: 'technical' },
  { field: 'tacticalCharacteristics', summaryKey: 'tactical' },
  { field: 'feedbackCharacteristics', summaryKey: 'feedback' },
])

const READINESS_NOTE = Object.freeze({
  ready: 'sufficient well-supported Coach DNA to characterise training behaviour',
  partial: 'partial Coach DNA available to characterise training behaviour',
  insufficient: 'insufficient Coach DNA to characterise training behaviour',
  unknown: 'source characteristics unavailable',
})

// Documented readiness rule (recorded in derivationMetadata). NOT a player/session readiness — it reports whether
// there is enough Coach DNA to characterise the coach's training behaviour.
function readinessOf(usable, presentCount, completenessLevel) {
  if (!usable) return 'unknown'
  if (presentCount === 0) return 'insufficient'
  if (completenessLevel === 'high') return 'ready'
  if (completenessLevel === 'none') return 'insufficient'
  return 'partial'
}

/**
 * Build the deterministic top-level Coach DNA training intelligence summary.
 *
 * @param {object} characteristics an M274 training characteristics object
 * @param {object} [assessment] an optional M275 evidence assessment
 * @returns {object} frozen summary.
 */
export function buildCoachDnaTrainingIntelligenceSummary(characteristics, assessment) {
  const charsOk = isObj(characteristics) && characteristics.type === 'coach-dna-training-intelligence-characteristics'
  const assessOk = isObj(assessment) && assessment.type === 'coach-dna-training-intelligence-evidence-assessment'
  const usable = charsOk && characteristics.valid === true

  const characteristicsFingerprint = charsOk && typeof characteristics.characteristicsFingerprint === 'string' ? characteristics.characteristicsFingerprint : null
  const assessmentFingerprint = assessOk && typeof assessment.assessmentFingerprint === 'string' ? assessment.assessmentFingerprint : null

  // trainingStyleSummary: the emphasis of each characteristic + which is strongest (a flag from M274, not a
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
  const trainingStyleSummary = {
    ...style,
    strongestCharacteristic: strongestKey,
    presentCharacteristics: presentCount,
    totalCharacteristics: CHAR_MAP.length,
  }

  // evidenceSummary: from M275 when present; otherwise marked not-assessed (no re-derivation).
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

  // confidenceSummary: copied from the M274 characteristics (the source of confidence).
  const cc = charsOk && isObj(characteristics.confidenceCharacteristics) ? characteristics.confidenceCharacteristics : {}
  const confidenceSummary = {
    level: strOrNull(cc.level) || 'LOW',
    value: numOr0(cc.value),
    high: cc.high === true,
    low: cc.low === true,
  }

  // unknownSummary: the characteristics that are unknown. Prefer M275's list; otherwise read M274 emphasis.
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

  // M274's own provenance.chain holds the training lineage (its .origin.chain is the shorter upstream view).
  const inProv = charsOk && isObj(characteristics.provenance) ? characteristics.provenance : null
  const provenance = {
    characteristicsSource: 'coach-dna-training-intelligence-characteristics',
    characteristicsSourceMilestone: 'M274',
    assessmentSource: 'coach-dna-training-intelligence-evidence-assessment',
    assessmentSourceMilestone: 'M275',
    characteristicsFingerprint,
    assessmentFingerprint,
    chain: inProv && Array.isArray(inProv.chain) ? [...inProv.chain] : null,
    profileFingerprint: inProv ? strOrNull(inProv.profileFingerprint) : null,
    trainingInputsFingerprint: inProv ? strOrNull(inProv.trainingInputsFingerprint) : null,
  }

  const issues = []
  if (!charsOk) issues.push('training characteristics missing or malformed')
  else if (!usable) issues.push('training characteristics marked invalid (unusable source)')
  if (!assessOk) issues.push('evidence assessment not supplied')

  const derivationMetadata = {
    milestone: 'M276',
    domain: 'training',
    layer: 'summary',
    summarizes: ['M274', 'M275'],
    deterministic: true,
    llmGenerated: false,
    readOnly: true,
    dormant: true,
    assessmentIncluded: assessOk,
    assessmentMatchesCharacteristics: assessOk && charsOk && isObj(assessment.provenance)
      ? assessment.provenance.characteristicsFingerprint === characteristics.characteristicsFingerprint
      : null,
    containsPlayerData: false,
    playerEvaluation: false,
    trainingRecommendation: false,
    generatesTrainingContent: false,
    analysesSessions: false,
  }

  const draft = {
    type: 'coach-dna-training-intelligence-summary',
    schemaVersion: 1,
    summaryVersion: 1,
    milestone: 'M276',
    valid: usable,
    characteristicsFingerprint,
    assessmentFingerprint,
    trainingStyleSummary,
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
 * @param {object} characteristics an M274 training characteristics object
 * @param {object} [assessment] an optional M275 evidence assessment
 * @returns {string}
 */
export function summarizeCoachDnaTrainingIntelligenceSummary(characteristics, assessment) {
  const s = buildCoachDnaTrainingIntelligenceSummary(characteristics, assessment)
  return [
    `Coach DNA training intelligence summary: ${s.valid ? 'summarised' : 'unusable source'}`,
    `Planning: ${s.trainingStyleSummary.planning} · Session structure: ${s.trainingStyleSummary.sessionStructure} · Strongest: ${s.trainingStyleSummary.strongestCharacteristic || 'none'}`,
    `Evidence: ${s.evidenceSummary.assessed ? `${s.evidenceSummary.wellSupported} well-supported, ${s.evidenceSummary.tentative} tentative` : 'not assessed'}`,
    `Unknown: ${s.unknownSummary.unknownCount}/${s.trainingStyleSummary.totalCharacteristics}`,
    `Confidence: ${s.confidenceSummary.level} · Readiness: ${s.readinessSummary.readiness}`,
    `Fingerprint: ${s.summaryFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the summary deterministically.
 * @param {object} characteristics an M274 training characteristics object
 * @param {object} [assessment] an optional M275 evidence assessment
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaTrainingIntelligenceSummary(characteristics, assessment, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const s = buildCoachDnaTrainingIntelligenceSummary(characteristics, assessment)
  if (format === 'json') return canonicalStringify(s)
  if (format === 'line') {
    return `coach-dna-training-intelligence-summary valid=${s.valid} readiness=${s.readinessSummary.readiness} `
      + `unknown=${s.unknownSummary.unknownCount}/${s.trainingStyleSummary.totalCharacteristics} `
      + `confidence=${s.confidenceSummary.level} fp=${s.summaryFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA training intelligence summary format '${format}'`)
}
