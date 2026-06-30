/**
 * web/brain-coach-dna-selection-intelligence-evidence-assessment - Coach DNA Selection Intelligence Evidence Assessment (M267) tests
 *
 * Verifies the evidence-assessment layer: it evaluates how well-supported the M266 characteristics are
 * (coverage, completeness, consistency, confidence + well-supported/tentative/unknown buckets) WITHOUT creating
 * new characteristics. It propagates unknown as unknown, contains NO player data, makes NO recommendation,
 * preserves provenance, never mutates inputs, and is deeply frozen and byte-deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaSelectionIntelligenceEvidenceAssessment,
  summarizeCoachDnaSelectionIntelligenceEvidenceAssessment,
  serializeCoachDnaSelectionIntelligenceEvidenceAssessment,
} from '../web/brain-coach-dna-selection-intelligence-evidence-assessment.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaSelectionIntelligenceInputs } from '../web/brain-coach-dna-selection-intelligence-inputs.js'
import { buildCoachDnaSelectionIntelligenceProfile } from '../web/brain-coach-dna-selection-intelligence-profile.js'
import { createCoachDnaSelectionIntelligenceQuery } from '../web/brain-coach-dna-selection-intelligence-query.js'
import { buildCoachDnaSelectionIntelligenceCharacteristics } from '../web/brain-coach-dna-selection-intelligence-characteristics.js'

const FORBIDDEN_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv|predict|forecast|ranking|ranked|scored|select him|start him|bench him)\b/i

function freeze(o) {
  if (o && typeof o === 'object') { for (const k of Object.keys(o)) freeze(o[k]); Object.freeze(o) }
  return o
}
const FULL_VIEW = freeze({
  profileVersion: 'coach-dna-v3',
  confidence: { value: 0.72, level: 'HIGH', label: 'High' },
  headline: 'Selection-led',
  identity: { strongestCategory: 'selection-preference', strongestLabel: 'Selection', weakestCategory: 'risk-warning', weakestLabel: 'Risk warnings', diversityScore: 0.5, diversityLabel: 'Balanced' },
  dominantSignals: [
    { category: 'selection-preference', label: 'Selection', occurrences: 7, strength: 0.9, averageConfidence: 0.8, averageWeight: 0.65, supportingCount: 6 },
    { category: 'player-management', label: 'Player management', occurrences: 4, strength: 0.5, averageConfidence: 0.7, averageWeight: 0.6, supportingCount: 3 },
  ],
  themes: [
    { type: 'selection-preference', label: 'Selection', count: 7, averageConfidence: 0.8, averageWeight: 0.65 },
    { type: 'philosophy', label: 'Philosophy', count: 3, averageConfidence: 0.6, averageWeight: 0.5 },
  ],
  knowledge: { totalMemories: 14, uniqueTypes: 4, averageConfidence: 0.7, averageWeight: 0.6, totalEvidence: 22, totalOntologyLinks: 9 },
  summary: 'A selection-led coach.',
  metadata: { explainable: true, deterministic: true, llmGenerated: false },
})
const MINIMAL_VIEW = freeze({
  profileVersion: null,
  confidence: { value: 0, level: 'LOW', label: 'Low' },
  headline: 'No coaching profile yet',
  identity: { strongestCategory: null, strongestLabel: null, weakestCategory: null, weakestLabel: null, diversityScore: 0, diversityLabel: 'Narrow' },
  dominantSignals: [], themes: [],
  knowledge: { totalMemories: 0, uniqueTypes: 0, averageConfidence: 0, averageWeight: 0, totalEvidence: 0, totalOntologyLinks: 0 },
  summary: null,
  metadata: { explainable: true, deterministic: true, llmGenerated: false },
})

const charsOf = (view) => buildCoachDnaSelectionIntelligenceCharacteristics(createCoachDnaSelectionIntelligenceQuery(buildCoachDnaSelectionIntelligenceProfile(buildCoachDnaSelectionIntelligenceInputs(createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(view)))))))
const FULL_CHARS = freeze(JSON.parse(JSON.stringify(charsOf(FULL_VIEW))))
const MINIMAL_CHARS = freeze(JSON.parse(JSON.stringify(charsOf(MINIMAL_VIEW))))
const A = buildCoachDnaSelectionIntelligenceEvidenceAssessment(FULL_CHARS)

test('a valid characteristics input produces the full assessment shape', () => {
  assert.equal(A.type, 'coach-dna-selection-intelligence-evidence-assessment')
  assert.equal(A.schemaVersion, 1)
  assert.equal(A.assessmentVersion, 1)
  assert.equal(A.milestone, 'M267')
  assert.equal(A.valid, true)
  for (const k of ['characteristicCoverage', 'evidenceCompleteness', 'evidenceConsistency', 'confidenceAssessment', 'unknownCharacteristics', 'wellSupportedCharacteristics', 'tentativeCharacteristics', 'provenance', 'derivationMetadata']) {
    assert.ok(k in A, k)
  }
  assert.match(A.assessmentFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('characteristics are bucketed by support level (well-supported / tentative / unknown)', () => {
  assert.deepEqual(A.wellSupportedCharacteristics, ['selectionEmphasis'])
  assert.deepEqual(A.tentativeCharacteristics, ['continuityCharacteristics', 'trustCharacteristics'])
  assert.deepEqual(A.unknownCharacteristics, ['rotationCharacteristics', 'availabilityCharacteristics'])
})

test('coverage / completeness / consistency use the documented rules', () => {
  assert.equal(A.characteristicCoverage.totalCharacteristics, 5)
  assert.equal(A.characteristicCoverage.present, 3)
  assert.equal(A.evidenceCompleteness.wellSupported, 1)
  assert.equal(A.evidenceCompleteness.tentative, 2)
  assert.equal(A.evidenceCompleteness.unknown, 2)
  assert.equal(A.evidenceCompleteness.level, 'low')             // 1/5 = 0.2 < 0.33
  assert.equal(A.evidenceConsistency.applicable, 3)
  assert.equal(A.evidenceConsistency.consistent, 3)
  assert.equal(A.evidenceConsistency.level, 'consistent')
  assert.equal(A.confidenceAssessment.level, 'HIGH')
})

test('the documented thresholds are recorded in the output', () => {
  const t = A.derivationMetadata.thresholds
  assert.equal(t.completenessHigh, 0.66)
  assert.equal(t.completenessModerate, 0.33)
  assert.equal(t.consistencyFull, 0.999)
})

test('it creates no new characteristics — only assesses existing ones', () => {
  assert.equal(A.derivationMetadata.assessesCharacteristics, true)
  assert.equal(A.derivationMetadata.createsCharacteristics, false)
  // the union of all buckets equals exactly the five M266 characteristics
  const all = [...A.wellSupportedCharacteristics, ...A.tentativeCharacteristics, ...A.unknownCharacteristics].sort()
  assert.deepEqual(all, ['availabilityCharacteristics', 'continuityCharacteristics', 'rotationCharacteristics', 'selectionEmphasis', 'trustCharacteristics'])
})

test('unknown propagates — characteristics M266 marked unknown stay unknown', () => {
  // rotation & availability were unknown in M266 → must remain unknown here
  assert.ok(A.unknownCharacteristics.includes('rotationCharacteristics'))
  assert.ok(A.unknownCharacteristics.includes('availabilityCharacteristics'))
  assert.ok(!A.wellSupportedCharacteristics.includes('rotationCharacteristics'))
  assert.ok(!A.tentativeCharacteristics.includes('rotationCharacteristics'))
})

test('contains NO player data and NO recommendation/ranking/scoring', () => {
  const json = JSON.stringify(A)
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(json, /\b(ranking|ranked|scored|recommendation|recommended)\b/i)
  assert.doesNotMatch(json, FORBIDDEN_LANG)
  assert.equal(A.derivationMetadata.containsPlayerData, false)
  assert.equal(A.derivationMetadata.playerSelection, false)
  assert.equal(A.derivationMetadata.playerRanking, false)
  assert.equal(A.derivationMetadata.playerScoring, false)
  assert.equal(A.derivationMetadata.teamRecommendation, false)
})

test('provenance preserves the chain back through M266 to M230', () => {
  assert.equal(A.provenance.source, 'coach-dna-selection-intelligence-characteristics')
  assert.equal(A.provenance.sourceMilestone, 'M266')
  assert.equal(A.provenance.characteristicsFingerprint, FULL_CHARS.characteristicsFingerprint)
  assert.deepEqual(A.provenance.origin.chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M261', 'M262', 'M263'])
  assert.equal(A.derivationMetadata.milestone, 'M267')
})

test('minimal characteristics yield an all-unknown assessment', () => {
  const a = buildCoachDnaSelectionIntelligenceEvidenceAssessment(MINIMAL_CHARS)
  assert.equal(a.valid, true)
  assert.equal(a.unknownCharacteristics.length, 5)
  assert.deepEqual(a.wellSupportedCharacteristics, [])
  assert.deepEqual(a.tentativeCharacteristics, [])
  assert.equal(a.evidenceCompleteness.level, 'none')
  assert.equal(a.evidenceConsistency.level, 'unknown')
  assert.equal(a.confidenceAssessment.level, 'LOW')
})

test('malformed inputs fail safe — valid:false, all unknown, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let a
    assert.doesNotThrow(() => { a = buildCoachDnaSelectionIntelligenceEvidenceAssessment(bad) })
    assert.equal(a.valid, false)
    assert.equal(a.unknownCharacteristics.length, 5)
    assert.equal(a.evidenceCompleteness.level, 'none')
  }
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaSelectionIntelligenceEvidenceAssessment(FULL_CHARS), serializeCoachDnaSelectionIntelligenceEvidenceAssessment(FULL_CHARS))
  assert.equal(buildCoachDnaSelectionIntelligenceEvidenceAssessment(FULL_CHARS).assessmentFingerprint, A.assessmentFingerprint)
  const copy = JSON.parse(JSON.stringify(FULL_CHARS))
  assert.equal(buildCoachDnaSelectionIntelligenceEvidenceAssessment(copy).assessmentFingerprint, A.assessmentFingerprint)
})

test('the source characteristics are never mutated', () => {
  const before = JSON.parse(JSON.stringify(FULL_CHARS))
  buildCoachDnaSelectionIntelligenceEvidenceAssessment(FULL_CHARS)
  assert.deepEqual(JSON.parse(JSON.stringify(FULL_CHARS)), before)
})

test('the output is deeply frozen', () => {
  assert.ok(Object.isFrozen(A))
  assert.ok(Object.isFrozen(A.evidenceCompleteness))
  assert.ok(Object.isFrozen(A.unknownCharacteristics))
  assert.ok(Object.isFrozen(A.wellSupportedCharacteristics))
  assert.ok(Object.isFrozen(A.provenance))
  assert.ok(Object.isFrozen(A.derivationMetadata.thresholds))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaSelectionIntelligenceEvidenceAssessment(FULL_CHARS, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-selection-intelligence-evidence-assessment')
  const line = serializeCoachDnaSelectionIntelligenceEvidenceAssessment(FULL_CHARS, { format: 'line' })
  assert.match(line, /^coach-dna-selection-intelligence-evidence-assessment valid=true wellSupported=1 tentative=2 unknown=2 /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaSelectionIntelligenceEvidenceAssessment(FULL_CHARS, { format: 'xml' }), /unsupported/)
})

test('the assessment and summary carry no recommendation, ranking or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaSelectionIntelligenceEvidenceAssessment(FULL_CHARS), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaSelectionIntelligenceEvidenceAssessment(FULL_CHARS), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaSelectionIntelligenceEvidenceAssessment(FULL_CHARS), /selection evidence assessment: assessed/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaSelectionIntelligenceEvidenceAssessment, 'function')
  assert.equal(typeof summarizeCoachDnaSelectionIntelligenceEvidenceAssessment, 'function')
  assert.equal(typeof serializeCoachDnaSelectionIntelligenceEvidenceAssessment, 'function')
})
