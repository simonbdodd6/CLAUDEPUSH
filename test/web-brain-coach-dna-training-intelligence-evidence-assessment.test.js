/**
 * web/brain-coach-dna-training-intelligence-evidence-assessment - Coach DNA Training Intelligence Evidence Assessment (M275) tests
 *
 * Verifies the training evidence-assessment layer: it evaluates how well-supported the M274 characteristics are
 * (coverage, completeness, consistency, confidence + well-supported/tentative/unknown buckets) WITHOUT creating
 * new characteristics. It propagates unknown as unknown, contains NO player data, makes NO recommendation and
 * does NO content generation / session analysis, preserves provenance, never mutates inputs, and is deeply
 * frozen and byte-deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaTrainingIntelligenceEvidenceAssessment,
  summarizeCoachDnaTrainingIntelligenceEvidenceAssessment,
  serializeCoachDnaTrainingIntelligenceEvidenceAssessment,
} from '../web/brain-coach-dna-training-intelligence-evidence-assessment.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaTrainingIntelligenceInputs } from '../web/brain-coach-dna-training-intelligence-inputs.js'
import { buildCoachDnaTrainingIntelligenceProfile } from '../web/brain-coach-dna-training-intelligence-profile.js'
import { createCoachDnaTrainingIntelligenceQuery } from '../web/brain-coach-dna-training-intelligence-query.js'
import { buildCoachDnaTrainingIntelligenceCharacteristics } from '../web/brain-coach-dna-training-intelligence-characteristics.js'

const FORBIDDEN_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv|predict|forecast|ranking|ranked|scored|training plan|session plan|do this drill|run this session|session analysis)\b/i

function freeze(o) {
  if (o && typeof o === 'object') { for (const k of Object.keys(o)) freeze(o[k]); Object.freeze(o) }
  return o
}
const FULL_VIEW = freeze({
  profileVersion: 'coach-dna-v3',
  confidence: { value: 0.72, level: 'HIGH', label: 'High' },
  headline: 'Training-led',
  identity: { strongestCategory: 'training-preference', strongestLabel: 'Training', weakestCategory: 'risk-warning', weakestLabel: 'Risk warnings', diversityScore: 0.5, diversityLabel: 'Balanced' },
  dominantSignals: [
    { category: 'training-preference', label: 'Training', occurrences: 8, strength: 0.85, averageConfidence: 0.8, averageWeight: 0.65, supportingCount: 6 },
    { category: 'player-management', label: 'Player management', occurrences: 3, strength: 0.5, averageConfidence: 0.6, averageWeight: 0.55, supportingCount: 2 },
  ],
  themes: [
    { type: 'training-preference', label: 'Training', count: 8, averageConfidence: 0.8, averageWeight: 0.65 },
    { type: 'communication-style', label: 'Communication', count: 2, averageConfidence: 0.5, averageWeight: 0.45 },
  ],
  knowledge: { totalMemories: 13, uniqueTypes: 4, averageConfidence: 0.7, averageWeight: 0.6, totalEvidence: 21, totalOntologyLinks: 8 },
  summary: 'A training-led coach.',
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

const charsOf = (view) => buildCoachDnaTrainingIntelligenceCharacteristics(createCoachDnaTrainingIntelligenceQuery(buildCoachDnaTrainingIntelligenceProfile(buildCoachDnaTrainingIntelligenceInputs(createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(view)))))))
const FULL_CHARS = freeze(JSON.parse(JSON.stringify(charsOf(FULL_VIEW))))
const MINIMAL_CHARS = freeze(JSON.parse(JSON.stringify(charsOf(MINIMAL_VIEW))))
const A = buildCoachDnaTrainingIntelligenceEvidenceAssessment(FULL_CHARS)

const ALL_CHARS = ['planningCharacteristics', 'sessionStructureCharacteristics', 'developmentCharacteristics', 'technicalCharacteristics', 'tacticalCharacteristics', 'feedbackCharacteristics']

test('a valid characteristics input produces the full assessment shape', () => {
  assert.equal(A.type, 'coach-dna-training-intelligence-evidence-assessment')
  assert.equal(A.schemaVersion, 1)
  assert.equal(A.assessmentVersion, 1)
  assert.equal(A.milestone, 'M275')
  assert.equal(A.valid, true)
  for (const k of ['characteristicCoverage', 'evidenceCompleteness', 'evidenceConsistency', 'confidenceAssessment', 'unknownCharacteristics', 'wellSupportedCharacteristics', 'tentativeCharacteristics', 'provenance', 'derivationMetadata']) {
    assert.ok(k in A, k)
  }
  assert.match(A.assessmentFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('characteristics are bucketed by support level (well-supported / tentative / unknown)', () => {
  assert.deepEqual(A.wellSupportedCharacteristics, ['sessionStructureCharacteristics', 'technicalCharacteristics'])
  assert.deepEqual(A.tentativeCharacteristics, ['developmentCharacteristics', 'feedbackCharacteristics'])
  assert.deepEqual(A.unknownCharacteristics, ['planningCharacteristics', 'tacticalCharacteristics'])
})

test('coverage / completeness / consistency use the documented rules', () => {
  assert.equal(A.characteristicCoverage.totalCharacteristics, 6)
  assert.equal(A.characteristicCoverage.present, 4)
  assert.equal(A.evidenceCompleteness.wellSupported, 2)
  assert.equal(A.evidenceCompleteness.tentative, 2)
  assert.equal(A.evidenceCompleteness.unknown, 2)
  assert.equal(A.evidenceCompleteness.level, 'moderate')          // 2/6 ≈ 0.333 ≥ 0.33
  assert.equal(A.evidenceConsistency.applicable, 4)
  assert.equal(A.evidenceConsistency.consistent, 4)
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
  // the union of all buckets equals exactly the six M274 characteristics
  const all = [...A.wellSupportedCharacteristics, ...A.tentativeCharacteristics, ...A.unknownCharacteristics].sort()
  assert.deepEqual(all, [...ALL_CHARS].sort())
})

test('unknown propagates — characteristics M274 marked unknown stay unknown', () => {
  assert.ok(A.unknownCharacteristics.includes('planningCharacteristics'))
  assert.ok(A.unknownCharacteristics.includes('tacticalCharacteristics'))
  assert.ok(!A.wellSupportedCharacteristics.includes('planningCharacteristics'))
  assert.ok(!A.tentativeCharacteristics.includes('planningCharacteristics'))
})

test('contains NO player data and NO recommendation/content/session-analysis', () => {
  const json = JSON.stringify(A)
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(json, /\b(ranking|ranked|scored|recommendation|recommended)\b/i)
  assert.doesNotMatch(json, FORBIDDEN_LANG)
  assert.equal(A.derivationMetadata.containsPlayerData, false)
  assert.equal(A.derivationMetadata.playerEvaluation, false)
  assert.equal(A.derivationMetadata.trainingRecommendation, false)
  assert.equal(A.derivationMetadata.generatesTrainingContent, false)
  assert.equal(A.derivationMetadata.analysesSessions, false)
})

test('provenance preserves the chain back through M274 to M230', () => {
  assert.equal(A.provenance.source, 'coach-dna-training-intelligence-characteristics')
  assert.equal(A.provenance.sourceMilestone, 'M274')
  assert.equal(A.provenance.characteristicsFingerprint, FULL_CHARS.characteristicsFingerprint)
  assert.deepEqual(A.provenance.origin.chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M269', 'M270', 'M271'])
  assert.equal(A.derivationMetadata.milestone, 'M275')
})

test('minimal characteristics yield an all-unknown assessment', () => {
  const a = buildCoachDnaTrainingIntelligenceEvidenceAssessment(MINIMAL_CHARS)
  assert.equal(a.valid, true)
  assert.equal(a.unknownCharacteristics.length, 6)
  assert.deepEqual(a.wellSupportedCharacteristics, [])
  assert.deepEqual(a.tentativeCharacteristics, [])
  assert.equal(a.evidenceCompleteness.level, 'none')
  assert.equal(a.evidenceConsistency.level, 'unknown')
  assert.equal(a.confidenceAssessment.level, 'LOW')
})

test('malformed inputs fail safe — valid:false, all unknown, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let a
    assert.doesNotThrow(() => { a = buildCoachDnaTrainingIntelligenceEvidenceAssessment(bad) })
    assert.equal(a.valid, false)
    assert.equal(a.unknownCharacteristics.length, 6)
    assert.equal(a.evidenceCompleteness.level, 'none')
  }
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaTrainingIntelligenceEvidenceAssessment(FULL_CHARS), serializeCoachDnaTrainingIntelligenceEvidenceAssessment(FULL_CHARS))
  assert.equal(buildCoachDnaTrainingIntelligenceEvidenceAssessment(FULL_CHARS).assessmentFingerprint, A.assessmentFingerprint)
  const copy = JSON.parse(JSON.stringify(FULL_CHARS))
  assert.equal(buildCoachDnaTrainingIntelligenceEvidenceAssessment(copy).assessmentFingerprint, A.assessmentFingerprint)
})

test('the source characteristics are never mutated', () => {
  const before = JSON.parse(JSON.stringify(FULL_CHARS))
  buildCoachDnaTrainingIntelligenceEvidenceAssessment(FULL_CHARS)
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
  const json = serializeCoachDnaTrainingIntelligenceEvidenceAssessment(FULL_CHARS, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-training-intelligence-evidence-assessment')
  const line = serializeCoachDnaTrainingIntelligenceEvidenceAssessment(FULL_CHARS, { format: 'line' })
  assert.match(line, /^coach-dna-training-intelligence-evidence-assessment valid=true wellSupported=2 tentative=2 unknown=2 /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaTrainingIntelligenceEvidenceAssessment(FULL_CHARS, { format: 'xml' }), /unsupported/)
})

test('the assessment and summary carry no recommendation, content or session-analysis language', () => {
  assert.doesNotMatch(serializeCoachDnaTrainingIntelligenceEvidenceAssessment(FULL_CHARS), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaTrainingIntelligenceEvidenceAssessment(FULL_CHARS), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaTrainingIntelligenceEvidenceAssessment(FULL_CHARS), /training evidence assessment: assessed/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaTrainingIntelligenceEvidenceAssessment, 'function')
  assert.equal(typeof summarizeCoachDnaTrainingIntelligenceEvidenceAssessment, 'function')
  assert.equal(typeof serializeCoachDnaTrainingIntelligenceEvidenceAssessment, 'function')
})
