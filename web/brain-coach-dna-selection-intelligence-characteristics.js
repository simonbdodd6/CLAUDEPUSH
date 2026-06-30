/**
 * web/brain-coach-dna-selection-intelligence-characteristics.js - Coach DNA Selection Intelligence Characteristics (M266, DORMANT)
 *
 * The FIRST deterministic reasoning layer for the selection domain. Every milestone before it surfaced data;
 * this one draws documented, rule-based CONCLUSIONS — but only about the COACH. It reads the M264 selection
 * query surface and describes the coach's existing selection behaviour (how strongly selection features in
 * their DNA, their continuity vs rotation lean, their player-management/trust orientation, etc.).
 *
 * It is critically NOT player selection. It does NOT select players, NOT rank players, NOT score players and
 * NOT recommend teams. It contains NO player data. Every characteristic is produced by a fixed, documented
 * transformation of values already present behind the M264 surface, with explicit thresholds recorded in the
 * output. Where the Coach DNA carries no evidence for a characteristic, the value is 'unknown' — never guessed,
 * never inferred.
 *
 * Pure function. It reuses ONLY the M264 surface (building one on demand from a profile/index), mutates no
 * input, performs no writes, makes no recommendation, calls no AI/LLM, and uses no DOM/network/storage/env/
 * database/clock/randomness. Same input → same characteristics, byte for byte.
 */

import { createCoachDnaSelectionIntelligenceQuery } from './brain-coach-dna-selection-intelligence-query.js' // M264

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

// ---- Documented deterministic rules (recorded in the output's derivationMetadata.thresholds) ----------------
// Emphasis of a present lens, by its signal strength + dominance. Absent → 'unknown' (no data, never guessed).
const STRENGTH_STRONG = 0.66
const STRENGTH_MODERATE = 0.33
// Per-lens evidence level, by supporting-memory count.
const EVIDENCE_WELL = 4
const EVIDENCE_SOME = 1
// Overall evidence sufficiency, by total memories.
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
  unknown: 'no coaching memories are available to characterise selection behaviour',
})
const CONFIDENCE_NOTE = Object.freeze({
  HIGH: 'the underlying Coach DNA is highly self-consistent',
  MEDIUM: 'the underlying Coach DNA is moderately self-consistent',
  LOW: 'the underlying Coach DNA is weakly self-consistent',
})

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

// Build one characteristic from a selection lens. Describes the coach's tendency, never a player.
function characteristicOf(surface, name, lensKey) {
  const lens = typeof surface.getSelectionLens === 'function' ? surface.getSelectionLens(lensKey) : null
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
  if (isObj(input) && typeof input.getSelectionLens === 'function' && typeof input.getValidationState === 'function') return input
  return createCoachDnaSelectionIntelligenceQuery(input)
}

/**
 * Build the deterministic Coach DNA selection characteristics from an M264 query surface.
 *
 * @param {object} input an M264 selection query surface (or an M262 profile / M263 index that yields one)
 * @returns {object} frozen characteristics; `valid` is false when the source is unusable.
 */
export function buildCoachDnaSelectionIntelligenceCharacteristics(input) {
  const surface = resolveSurface(input)
  const valid = typeof surface.isUsable === 'function' ? surface.isUsable() === true : false

  const selectionEmphasis = characteristicOf(surface, 'selectionEmphasis', 'selectionSignals')
  const continuityCharacteristics = characteristicOf(surface, 'continuityCharacteristics', 'continuitySignals')
  const rotationCharacteristics = characteristicOf(surface, 'rotationCharacteristics', 'rotationSignals')
  const trustCharacteristics = characteristicOf(surface, 'trustCharacteristics', 'playerTrustSignals')
  const availabilityCharacteristics = characteristicOf(surface, 'availabilityCharacteristics', 'availabilitySignals')

  const ev = typeof surface.getEvidence === 'function' && isObj(surface.getEvidence()) ? surface.getEvidence() : {}
  const evByLens = isObj(ev.byLens) ? ev.byLens : {}
  const LENS_KEYS = ['selectionSignals', 'continuitySignals', 'rotationSignals', 'playerTrustSignals', 'availabilitySignals']
  const sufficiency = sufficiencyOf(numOr0(ev.totalMemories))
  const evidenceCharacteristics = {
    totalMemories: numOr0(ev.totalMemories),
    uniqueTypes: numOr0(ev.uniqueTypes),
    totalEvidence: numOr0(ev.totalEvidence),
    sufficiency,
    note: SUFFICIENCY_NOTE[sufficiency],
    byLens: LENS_KEYS.reduce((acc, key) => {
      const e = isObj(evByLens[key]) ? evByLens[key] : {}
      const supportingCount = numOr0(e.supportingCount)
      acc[key] = { supportingCount, level: evidenceLevelOf(supportingCount) }
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
    source: 'coach-dna-selection-intelligence-query',
    sourceMilestone: 'M264',
    chain: Array.isArray(prov.chain) ? [...prov.chain] : null,
    profileFingerprint: strOrNull(prov.profileFingerprint),
    selectionInputsFingerprint: strOrNull(prov.selectionInputsFingerprint),
    origin: origin ? {
      source: strOrNull(origin.source),
      sourceMilestone: strOrNull(origin.sourceMilestone),
      chain: Array.isArray(origin.chain) ? [...origin.chain] : null,
    } : null,
  }

  const derivationMetadata = {
    milestone: 'M266',
    domain: 'selection',
    layer: 'characteristics',
    derivedFrom: 'coach-dna-selection-intelligence-query',
    sourceMilestone: 'M264',
    deterministic: true,
    ruleBased: true,
    llmGenerated: false,
    readOnly: true,
    dormant: true,
    describesCoach: true,
    containsPlayerData: false,
    playerSelection: false,
    playerRanking: false,
    playerScoring: false,
    teamRecommendation: false,
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
    type: 'coach-dna-selection-intelligence-characteristics',
    schemaVersion: 1,
    characteristicsVersion: 1,
    milestone: 'M266',
    valid,
    selectionEmphasis,
    continuityCharacteristics,
    rotationCharacteristics,
    trustCharacteristics,
    availabilityCharacteristics,
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
 * @param {object} input an M264 query surface (or a profile/index)
 * @returns {string}
 */
export function summarizeCoachDnaSelectionIntelligenceCharacteristics(input) {
  const c = buildCoachDnaSelectionIntelligenceCharacteristics(input)
  return [
    `Coach DNA selection characteristics: ${c.valid ? 'described' : 'unusable source'}`,
    `Selection emphasis: ${c.selectionEmphasis.emphasis}`,
    `Continuity: ${c.continuityCharacteristics.emphasis} · Rotation: ${c.rotationCharacteristics.emphasis}`,
    `Trust: ${c.trustCharacteristics.emphasis} · Availability: ${c.availabilityCharacteristics.emphasis}`,
    `Evidence: ${c.evidenceCharacteristics.sufficiency} · Confidence: ${c.confidenceCharacteristics.level}`,
    `Fingerprint: ${c.characteristicsFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the characteristics deterministically.
 * @param {object} input an M264 query surface (or a profile/index)
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaSelectionIntelligenceCharacteristics(input, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const c = buildCoachDnaSelectionIntelligenceCharacteristics(input)
  if (format === 'json') return canonicalStringify(c)
  if (format === 'line') {
    return `coach-dna-selection-intelligence-characteristics valid=${c.valid} `
      + `selectionEmphasis=${c.selectionEmphasis.emphasis} sufficiency=${c.evidenceCharacteristics.sufficiency} `
      + `confidence=${c.confidenceCharacteristics.level} fp=${c.characteristicsFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA selection characteristics format '${format}'`)
}
