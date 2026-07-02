/**
 * web/brain-coach-dna-training-intelligence-characteristics.js - Coach DNA Training Intelligence Characteristics (M274, DORMANT)
 *
 * The first deterministic reasoning layer for the training domain — the training-domain analogue of the M266
 * selection characteristics. It reads the M272 training query surface and describes the coach's existing
 * training tendencies (how strongly planning, session structure, development, technical, tactical and feedback
 * concerns feature in their DNA), using fixed, documented rule-based transformations with the thresholds
 * recorded in the output.
 *
 * It is critically NOT a training engine. It does NOT analyse real sessions, does NOT generate training plans
 * or drills, does NOT evaluate players and makes NO recommendation. It contains NO player data. Every
 * characteristic describes the COACH's tendencies only. Where the Coach DNA carries no evidence for a
 * characteristic, the value is 'unknown' — never guessed, never inferred.
 *
 * Pure function. It reuses ONLY the M272 surface (building one on demand from a profile/index), mutates no
 * input, performs no writes, makes no recommendation, calls no AI/LLM, and uses no DOM/network/storage/env/
 * database/clock/randomness. Same input → same characteristics, byte for byte.
 */

import { createCoachDnaTrainingIntelligenceQuery } from './brain-coach-dna-training-intelligence-query.js' // M272

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

// ---- Documented deterministic rules (recorded in derivationMetadata.thresholds) — same convention as M266 ----
const STRENGTH_STRONG = 0.66
const STRENGTH_MODERATE = 0.33
const EVIDENCE_WELL = 4
const EVIDENCE_SOME = 1
const SUFFICIENCY_RICH = 10
const SUFFICIENCY_MODERATE = 3

const EMPHASIS_NOTE = Object.freeze({
  strong: 'a strongly-evidenced characteristic of this coach',
  moderate: 'a moderately-evidenced characteristic of this coach',
  low: 'a weakly-evidenced characteristic of this coach',
  unknown: 'not evidenced in the available Coach DNA',
})
const SUFFICIENCY_NOTE = Object.freeze({
  rich: 'a rich body of coaching memories underpins these characteristics',
  moderate: 'a moderate body of coaching memories underpins these characteristics',
  sparse: 'only a sparse body of coaching memories underpins these characteristics',
  unknown: 'no coaching memories are available to characterise training behaviour',
})
const CONFIDENCE_NOTE = Object.freeze({
  HIGH: 'the underlying Coach DNA is highly self-consistent',
  MEDIUM: 'the underlying Coach DNA is moderately self-consistent',
  LOW: 'the underlying Coach DNA is weakly self-consistent',
})

// The six characteristics, each bound to its M272 training lens, in fixed order.
const CHARACTERISTICS = Object.freeze([
  { name: 'planningCharacteristics', lens: 'planningSignals' },
  { name: 'sessionStructureCharacteristics', lens: 'sessionStructureSignals' },
  { name: 'developmentCharacteristics', lens: 'developmentSignals' },
  { name: 'technicalCharacteristics', lens: 'technicalSignals' },
  { name: 'tacticalCharacteristics', lens: 'tacticalSignals' },
  { name: 'feedbackCharacteristics', lens: 'feedbackSignals' },
])

function emphasisOf(lens) {
  if (!isObj(lens) || lens.present !== true) return 'unknown'   // absent → unknown, never inferred
  const strength = numOr0(lens.strength)
  if (lens.isDominant === true && strength >= STRENGTH_STRONG) return 'strong'
  if (strength >= STRENGTH_MODERATE) return 'moderate'
  return 'low'
}

function evidenceLevelOf(supportingCount) {
  if (supportingCount >= EVIDENCE_WELL) return 'well-evidenced'
  if (supportingCount >= EVIDENCE_SOME) return 'tentative'
  return 'none'
}

function sufficiencyOf(totalMemories) {
  if (totalMemories <= 0) return 'unknown'
  if (totalMemories >= SUFFICIENCY_RICH) return 'rich'
  if (totalMemories >= SUFFICIENCY_MODERATE) return 'moderate'
  return 'sparse'
}

// Build one characteristic from a training lens. Describes the coach's tendency, never a player or session.
function characteristicOf(surface, name, lensKey) {
  const lens = typeof surface.getTrainingLens === 'function' ? surface.getTrainingLens(lensKey) : null
  const present = isObj(lens) && lens.present === true
  const emphasis = emphasisOf(lens)
  return {
    characteristic: name,
    lens: lensKey,
    sourceCategory: isObj(lens) ? strOrNull(lens.sourceCategory) : null,
    present,
    isDominant: present ? lens.isDominant === true : false,
    isStrongest: present ? lens.isStrongest === true : false,
    isWeakest: present ? lens.isWeakest === true : false,
    emphasis,
    note: EMPHASIS_NOTE[emphasis],
  }
}

function resolveSurface(input) {
  if (isObj(input) && typeof input.getTrainingLens === 'function' && typeof input.getValidationState === 'function') return input
  return createCoachDnaTrainingIntelligenceQuery(input)
}

/**
 * Build the deterministic Coach DNA training characteristics from an M272 query surface.
 *
 * @param {object} input an M272 training query surface (or an M270 profile / M271 index that yields one)
 * @returns {object} frozen characteristics; `valid` is false when the source is unusable.
 */
export function buildCoachDnaTrainingIntelligenceCharacteristics(input) {
  const surface = resolveSurface(input)
  const valid = typeof surface.isUsable === 'function' ? surface.isUsable() === true : false

  const chars = {}
  for (const { name, lens } of CHARACTERISTICS) chars[name] = characteristicOf(surface, name, lens)

  const ev = typeof surface.getEvidence === 'function' && isObj(surface.getEvidence()) ? surface.getEvidence() : {}
  const evByLens = isObj(ev.byLens) ? ev.byLens : {}
  const sufficiency = sufficiencyOf(numOr0(ev.totalMemories))
  const evidenceCharacteristics = {
    totalMemories: numOr0(ev.totalMemories),
    uniqueTypes: numOr0(ev.uniqueTypes),
    totalEvidence: numOr0(ev.totalEvidence),
    sufficiency,
    note: SUFFICIENCY_NOTE[sufficiency],
    byLens: CHARACTERISTICS.reduce((acc, { lens }) => {
      const e = isObj(evByLens[lens]) ? evByLens[lens] : {}
      const supportingCount = numOr0(e.supportingCount)
      acc[lens] = { supportingCount, level: evidenceLevelOf(supportingCount) }
      return acc
    }, {}),
  }

  const conf = typeof surface.getConfidence === 'function' && isObj(surface.getConfidence()) ? surface.getConfidence() : {}
  const level = strOrNull(conf.level) || 'LOW'
  const confidenceCharacteristics = {
    level,
    value: numOr0(conf.value),
    high: conf.high === true,
    low: conf.low === true,
    note: CONFIDENCE_NOTE[level] || CONFIDENCE_NOTE.LOW,
  }

  const prov = typeof surface.getProvenance === 'function' && isObj(surface.getProvenance()) ? surface.getProvenance() : {}
  const origin = isObj(prov.origin) ? prov.origin : null
  const provenance = {
    source: 'coach-dna-training-intelligence-query',
    sourceMilestone: 'M272',
    chain: Array.isArray(prov.chain) ? [...prov.chain] : null,
    profileFingerprint: strOrNull(prov.profileFingerprint),
    trainingInputsFingerprint: strOrNull(prov.trainingInputsFingerprint),
    origin: origin ? {
      source: strOrNull(origin.source),
      sourceMilestone: strOrNull(origin.sourceMilestone),
      chain: Array.isArray(origin.chain) ? [...origin.chain] : null,
    } : null,
  }

  const derivationMetadata = {
    milestone: 'M274',
    domain: 'training',
    layer: 'characteristics',
    derivedFrom: 'coach-dna-training-intelligence-query',
    sourceMilestone: 'M272',
    deterministic: true,
    ruleBased: true,
    llmGenerated: false,
    readOnly: true,
    dormant: true,
    describesCoach: true,
    containsPlayerData: false,
    playerEvaluation: false,
    trainingRecommendation: false,
    generatesTrainingContent: false,
    analysesSessions: false,
    thresholds: {
      strengthStrong: STRENGTH_STRONG,
      strengthModerate: STRENGTH_MODERATE,
      evidenceWell: EVIDENCE_WELL,
      evidenceSome: EVIDENCE_SOME,
      sufficiencyRich: SUFFICIENCY_RICH,
      sufficiencyModerate: SUFFICIENCY_MODERATE,
    },
  }

  const draft = {
    type: 'coach-dna-training-intelligence-characteristics',
    schemaVersion: 1,
    characteristicsVersion: 1,
    milestone: 'M274',
    valid,
    planningCharacteristics: chars.planningCharacteristics,
    sessionStructureCharacteristics: chars.sessionStructureCharacteristics,
    developmentCharacteristics: chars.developmentCharacteristics,
    technicalCharacteristics: chars.technicalCharacteristics,
    tacticalCharacteristics: chars.tacticalCharacteristics,
    feedbackCharacteristics: chars.feedbackCharacteristics,
    evidenceCharacteristics,
    confidenceCharacteristics,
    provenance,
    derivationMetadata,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for these characteristics.
  draft.characteristicsFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the characteristics for logs or PR notes.
 * @param {object} input an M272 query surface (or a profile/index)
 * @returns {string}
 */
export function summarizeCoachDnaTrainingIntelligenceCharacteristics(input) {
  const c = buildCoachDnaTrainingIntelligenceCharacteristics(input)
  return [
    `Coach DNA training characteristics: ${c.valid ? 'described' : 'unusable source'}`,
    `Planning: ${c.planningCharacteristics.emphasis} · Session structure: ${c.sessionStructureCharacteristics.emphasis}`,
    `Development: ${c.developmentCharacteristics.emphasis} · Technical: ${c.technicalCharacteristics.emphasis}`,
    `Tactical: ${c.tacticalCharacteristics.emphasis} · Feedback: ${c.feedbackCharacteristics.emphasis}`,
    `Evidence: ${c.evidenceCharacteristics.sufficiency} · Confidence: ${c.confidenceCharacteristics.level}`,
    `Fingerprint: ${c.characteristicsFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the characteristics deterministically.
 * @param {object} input an M272 query surface (or a profile/index)
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaTrainingIntelligenceCharacteristics(input, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const c = buildCoachDnaTrainingIntelligenceCharacteristics(input)
  if (format === 'json') return canonicalStringify(c)
  if (format === 'line') {
    return `coach-dna-training-intelligence-characteristics valid=${c.valid} `
      + `sessionStructure=${c.sessionStructureCharacteristics.emphasis} sufficiency=${c.evidenceCharacteristics.sufficiency} `
      + `confidence=${c.confidenceCharacteristics.level} fp=${c.characteristicsFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA training characteristics format '${format}'`)
}
