/**
 * web/brain-coach-dna-training-intelligence-summary - Coach DNA Training Intelligence Summary (M276) tests
 *
 * Verifies the top-level summary of the training reasoning chain: it folds M274 characteristics + M275
 * assessment into one overview (style/evidence/confidence/unknown/readiness) without creating recommendations,
 * generating training content or analysing sessions. It propagates unknown, contains NO player data, preserves
 * provenance, handles a missing assessment, never mutates inputs, and is deeply frozen and byte-deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaTrainingIntelligenceSummary,
  summarizeCoachDnaTrainingIntelligenceSummary,
  serializeCoachDnaTrainingIntelligenceSummary,
} from '../web/brain-coach-dna-training-intelligence-summary.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaTrainingIntelligenceInputs } from '../web/brain-coach-dna-training-intelligence-inputs.js'
import { buildCoachDnaTrainingIntelligenceProfile } from '../web/brain-coach-dna-training-intelligence-profile.js'
import { createCoachDnaTrainingIntelligenceQuery } from '../web/brain-coach-dna-training-intelligence-query.js'
import { buildCoachDnaTrainingIntelligenceCharacteristics } from '../web/brain-coach-dna-training-intelligence-characteristics.js'
import { buildCoachDnaTrainingIntelligenceEvidenceAssessment } from '../web/brain-coach-dna-training-intelligence-evidence-assessment.js'

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
const FULL_ASSESS = freeze(JSON.parse(JSON.stringify(buildCoachDnaTrainingIntelligenceEvidenceAssessment(FULL_CHARS))))
const S = buildCoachDnaTrainingIntelligenceSummary(FULL_CHARS, FULL_ASSESS)

test('valid characteristics + assessment produce the full summary shape', () => {
  assert.equal(S.type, 'coach-dna-training-intelligence-summary')
  assert.equal(S.schemaVersion, 1)
  assert.equal(S.summaryVersion, 1)
  assert.equal(S.milestone, 'M276')
  assert.equal(S.valid, true)
  assert.equal(S.characteristicsFingerprint, FULL_CHARS.characteristicsFingerprint)
  assert.equal(S.assessmentFingerprint, FULL_ASSESS.assessmentFingerprint)
  for (const k of ['trainingStyleSummary', 'evidenceSummary', 'confidenceSummary', 'unknownSummary', 'readinessSummary', 'provenance', 'derivationMetadata']) {
    assert.ok(isObj(S[k]), k)
  }
  assert.match(S.summaryFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }

test('the style summary projects each characteristic emphasis + strongest flag', () => {
  const st = S.trainingStyleSummary
  assert.equal(st.planning, 'unknown')
  assert.equal(st.sessionStructure, 'strong')
  assert.equal(st.development, 'moderate')
  assert.equal(st.technical, 'strong')
  assert.equal(st.tactical, 'unknown')
  assert.equal(st.feedback, 'low')
  assert.equal(st.strongestCharacteristic, 'sessionStructure')
  assert.equal(st.presentCharacteristics, 4)
  assert.equal(st.totalCharacteristics, 6)
})

test('the evidence summary reflects the M275 assessment', () => {
  assert.equal(S.evidenceSummary.assessed, true)
  assert.equal(S.evidenceSummary.wellSupported, 2)
  assert.equal(S.evidenceSummary.tentative, 2)
  assert.equal(S.evidenceSummary.unknown, 2)
  assert.equal(S.evidenceSummary.completeness, 'moderate')
  assert.equal(S.evidenceSummary.consistency, 'consistent')
  assert.deepEqual(S.evidenceSummary.wellSupportedCharacteristics, ['sessionStructureCharacteristics', 'technicalCharacteristics'])
  assert.deepEqual(S.evidenceSummary.tentativeCharacteristics, ['developmentCharacteristics', 'feedbackCharacteristics'])
})

test('confidence + readiness summaries are derived deterministically', () => {
  assert.equal(S.confidenceSummary.level, 'HIGH')
  assert.equal(S.confidenceSummary.value, 0.72)
  assert.equal(S.readinessSummary.readiness, 'partial')   // present but completeness moderate
  assert.equal(S.readinessSummary.note, 'partial Coach DNA available to characterise training behaviour')
  assert.equal(S.readinessSummary.assessmentIncluded, true)
})

test('unknown propagates into the unknown summary', () => {
  assert.deepEqual([...S.unknownSummary.unknownCharacteristics].sort(), ['planningCharacteristics', 'tacticalCharacteristics'])
  assert.equal(S.unknownSummary.unknownCount, 2)
  assert.equal(S.unknownSummary.allKnown, false)
})

test('a missing assessment is handled — evidence not assessed, unknown read from M274', () => {
  const s = buildCoachDnaTrainingIntelligenceSummary(FULL_CHARS)
  assert.equal(s.valid, true)
  assert.equal(s.assessmentFingerprint, null)
  assert.equal(s.evidenceSummary.assessed, false)
  assert.equal(s.evidenceSummary.wellSupported, null)
  assert.equal(s.evidenceSummary.completeness, 'unknown')
  // unknown summary still computed from the M274 characteristics
  assert.deepEqual([...s.unknownSummary.unknownCharacteristics].sort(), ['planningCharacteristics', 'tacticalCharacteristics'])
  assert.equal(s.readinessSummary.readiness, 'partial')
  assert.equal(s.derivationMetadata.assessmentIncluded, false)
})

test('the assessment is checked to pair with the characteristics', () => {
  assert.equal(S.derivationMetadata.assessmentMatchesCharacteristics, true)
  const otherAssess = buildCoachDnaTrainingIntelligenceEvidenceAssessment(MINIMAL_CHARS)
  const s = buildCoachDnaTrainingIntelligenceSummary(FULL_CHARS, otherAssess)
  assert.equal(s.derivationMetadata.assessmentMatchesCharacteristics, false)
})

test('contains NO player data and NO recommendation/content-generation/session-analysis', () => {
  const json = JSON.stringify(S)
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(json, /\b(ranking|ranked|scored|recommendation|recommended|drill|session plan)\b/i)
  assert.doesNotMatch(json, FORBIDDEN_LANG)
  assert.equal(S.derivationMetadata.containsPlayerData, false)
  assert.equal(S.derivationMetadata.playerEvaluation, false)
  assert.equal(S.derivationMetadata.trainingRecommendation, false)
  assert.equal(S.derivationMetadata.generatesTrainingContent, false)
  assert.equal(S.derivationMetadata.analysesSessions, false)
})

test('provenance preserves the chain back to M230', () => {
  assert.equal(S.provenance.characteristicsSourceMilestone, 'M274')
  assert.equal(S.provenance.assessmentSourceMilestone, 'M275')
  assert.deepEqual(S.provenance.chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M269', 'M270', 'M271'])
  assert.equal(S.provenance.profileFingerprint, FULL_CHARS.provenance.profileFingerprint)
  assert.equal(S.provenance.trainingInputsFingerprint, FULL_CHARS.provenance.trainingInputsFingerprint)
  assert.equal(S.derivationMetadata.milestone, 'M276')
  assert.deepEqual(S.derivationMetadata.summarizes, ['M274', 'M275'])
})

test('minimal characteristics yield an insufficient/all-unknown summary', () => {
  const minAssess = buildCoachDnaTrainingIntelligenceEvidenceAssessment(MINIMAL_CHARS)
  const s = buildCoachDnaTrainingIntelligenceSummary(MINIMAL_CHARS, minAssess)
  assert.equal(s.valid, true)
  assert.equal(s.trainingStyleSummary.presentCharacteristics, 0)
  assert.equal(s.unknownSummary.unknownCount, 6)
  assert.equal(s.readinessSummary.readiness, 'insufficient')
  assert.equal(s.confidenceSummary.level, 'LOW')
})

test('malformed inputs fail safe — valid:false, unknown, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let s
    assert.doesNotThrow(() => { s = buildCoachDnaTrainingIntelligenceSummary(bad) })
    assert.equal(s.valid, false)
    assert.equal(s.readinessSummary.readiness, 'unknown')
    assert.equal(s.unknownSummary.unknownCount, 6)
  }
})

test('a malformed assessment is ignored, not trusted', () => {
  for (const badAssess of [{}, 'x', 7, [], { type: 'wrong' }]) {
    const s = buildCoachDnaTrainingIntelligenceSummary(FULL_CHARS, badAssess)
    assert.equal(s.valid, true)
    assert.equal(s.evidenceSummary.assessed, false)
    assert.equal(s.assessmentFingerprint, null)
    assert.equal(s.derivationMetadata.assessmentMatchesCharacteristics, null)
  }
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaTrainingIntelligenceSummary(FULL_CHARS, FULL_ASSESS), serializeCoachDnaTrainingIntelligenceSummary(FULL_CHARS, FULL_ASSESS))
  assert.equal(buildCoachDnaTrainingIntelligenceSummary(FULL_CHARS, FULL_ASSESS).summaryFingerprint, S.summaryFingerprint)
})

test('summary fingerprint changes when the assessment is omitted', () => {
  const withAssess = buildCoachDnaTrainingIntelligenceSummary(FULL_CHARS, FULL_ASSESS).summaryFingerprint
  const withoutAssess = buildCoachDnaTrainingIntelligenceSummary(FULL_CHARS).summaryFingerprint
  assert.notEqual(withAssess, withoutAssess)
})

test('the source inputs are never mutated', () => {
  const cBefore = JSON.parse(JSON.stringify(FULL_CHARS))
  const aBefore = JSON.parse(JSON.stringify(FULL_ASSESS))
  buildCoachDnaTrainingIntelligenceSummary(FULL_CHARS, FULL_ASSESS)
  assert.deepEqual(JSON.parse(JSON.stringify(FULL_CHARS)), cBefore)
  assert.deepEqual(JSON.parse(JSON.stringify(FULL_ASSESS)), aBefore)
})

test('the output is deeply frozen', () => {
  assert.ok(Object.isFrozen(S))
  assert.ok(Object.isFrozen(S.trainingStyleSummary))
  assert.ok(Object.isFrozen(S.evidenceSummary))
  assert.ok(Object.isFrozen(S.evidenceSummary.wellSupportedCharacteristics))
  assert.ok(Object.isFrozen(S.unknownSummary.unknownCharacteristics))
  assert.ok(Object.isFrozen(S.provenance))
  assert.ok(Object.isFrozen(S.derivationMetadata))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaTrainingIntelligenceSummary(FULL_CHARS, FULL_ASSESS, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-training-intelligence-summary')
  const line = serializeCoachDnaTrainingIntelligenceSummary(FULL_CHARS, FULL_ASSESS, { format: 'line' })
  assert.match(line, /^coach-dna-training-intelligence-summary valid=true readiness=partial /)
  assert.match(line, /unknown=2\/6 /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaTrainingIntelligenceSummary(FULL_CHARS, FULL_ASSESS, { format: 'xml' }), /unsupported/)
})

test('the summary carries no recommendation, training-content or session-analysis language', () => {
  assert.doesNotMatch(serializeCoachDnaTrainingIntelligenceSummary(FULL_CHARS, FULL_ASSESS), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaTrainingIntelligenceSummary(FULL_CHARS, FULL_ASSESS), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaTrainingIntelligenceSummary(FULL_CHARS, FULL_ASSESS), /training intelligence summary: summarised/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaTrainingIntelligenceSummary, 'function')
  assert.equal(typeof summarizeCoachDnaTrainingIntelligenceSummary, 'function')
  assert.equal(typeof serializeCoachDnaTrainingIntelligenceSummary, 'function')
})
