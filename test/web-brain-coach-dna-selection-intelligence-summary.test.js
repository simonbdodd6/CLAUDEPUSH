/**
 * web/brain-coach-dna-selection-intelligence-summary - Coach DNA Selection Intelligence Summary (M268) tests
 *
 * Verifies the top-level summary of the selection reasoning chain: it folds M266 characteristics + M267
 * assessment into one overview (style/evidence/confidence/unknown/readiness) without creating recommendations
 * or selecting players. It propagates unknown, contains NO player data, preserves provenance, handles a missing
 * assessment, never mutates inputs, and is deeply frozen and byte-deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaSelectionIntelligenceSummary,
  summarizeCoachDnaSelectionIntelligenceSummary,
  serializeCoachDnaSelectionIntelligenceSummary,
} from '../web/brain-coach-dna-selection-intelligence-summary.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaSelectionIntelligenceInputs } from '../web/brain-coach-dna-selection-intelligence-inputs.js'
import { buildCoachDnaSelectionIntelligenceProfile } from '../web/brain-coach-dna-selection-intelligence-profile.js'
import { createCoachDnaSelectionIntelligenceQuery } from '../web/brain-coach-dna-selection-intelligence-query.js'
import { buildCoachDnaSelectionIntelligenceCharacteristics } from '../web/brain-coach-dna-selection-intelligence-characteristics.js'
import { buildCoachDnaSelectionIntelligenceEvidenceAssessment } from '../web/brain-coach-dna-selection-intelligence-evidence-assessment.js'

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
const FULL_ASSESS = freeze(JSON.parse(JSON.stringify(buildCoachDnaSelectionIntelligenceEvidenceAssessment(FULL_CHARS))))
const S = buildCoachDnaSelectionIntelligenceSummary(FULL_CHARS, FULL_ASSESS)

test('valid characteristics + assessment produce the full summary shape', () => {
  assert.equal(S.type, 'coach-dna-selection-intelligence-summary')
  assert.equal(S.schemaVersion, 1)
  assert.equal(S.summaryVersion, 1)
  assert.equal(S.valid, true)
  assert.equal(S.characteristicsFingerprint, FULL_CHARS.characteristicsFingerprint)
  assert.equal(S.assessmentFingerprint, FULL_ASSESS.assessmentFingerprint)
  for (const k of ['selectionStyleSummary', 'evidenceSummary', 'confidenceSummary', 'unknownSummary', 'readinessSummary', 'provenance', 'derivationMetadata']) {
    assert.ok(isObj(S[k]), k)
  }
  assert.match(S.summaryFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }

test('the style summary projects each characteristic emphasis + strongest flag', () => {
  const st = S.selectionStyleSummary
  assert.equal(st.selectionEmphasis, 'strong')
  assert.equal(st.continuity, 'low')
  assert.equal(st.rotation, 'unknown')
  assert.equal(st.trust, 'moderate')
  assert.equal(st.availability, 'unknown')
  assert.equal(st.strongestCharacteristic, 'selectionEmphasis')
  assert.equal(st.presentCharacteristics, 3)
})

test('the evidence summary reflects the M267 assessment', () => {
  assert.equal(S.evidenceSummary.assessed, true)
  assert.equal(S.evidenceSummary.wellSupported, 1)
  assert.equal(S.evidenceSummary.tentative, 2)
  assert.equal(S.evidenceSummary.unknown, 2)
  assert.equal(S.evidenceSummary.completeness, 'low')
  assert.equal(S.evidenceSummary.consistency, 'consistent')
  assert.deepEqual(S.evidenceSummary.wellSupportedCharacteristics, ['selectionEmphasis'])
})

test('confidence + readiness summaries are derived deterministically', () => {
  assert.equal(S.confidenceSummary.level, 'HIGH')
  assert.equal(S.readinessSummary.readiness, 'partial')   // present but completeness low
  assert.equal(S.readinessSummary.note, 'partial Coach DNA available to characterise selection behaviour')
  assert.equal(S.readinessSummary.assessmentIncluded, true)
})

test('unknown propagates into the unknown summary', () => {
  assert.deepEqual([...S.unknownSummary.unknownCharacteristics].sort(), ['availabilityCharacteristics', 'rotationCharacteristics'])
  assert.equal(S.unknownSummary.unknownCount, 2)
  assert.equal(S.unknownSummary.allKnown, false)
})

test('a missing assessment is handled — evidence not assessed, unknown read from M266', () => {
  const s = buildCoachDnaSelectionIntelligenceSummary(FULL_CHARS)
  assert.equal(s.valid, true)
  assert.equal(s.assessmentFingerprint, null)
  assert.equal(s.evidenceSummary.assessed, false)
  assert.equal(s.evidenceSummary.wellSupported, null)
  assert.equal(s.evidenceSummary.completeness, 'unknown')
  // unknown summary still computed from the M266 characteristics
  assert.deepEqual([...s.unknownSummary.unknownCharacteristics].sort(), ['availabilityCharacteristics', 'rotationCharacteristics'])
  assert.equal(s.readinessSummary.readiness, 'partial')
  assert.equal(s.derivationMetadata.assessmentIncluded, false)
})

test('the assessment is checked to pair with the characteristics', () => {
  assert.equal(S.derivationMetadata.assessmentMatchesCharacteristics, true)
  const otherAssess = buildCoachDnaSelectionIntelligenceEvidenceAssessment(MINIMAL_CHARS)
  const s = buildCoachDnaSelectionIntelligenceSummary(FULL_CHARS, otherAssess)
  assert.equal(s.derivationMetadata.assessmentMatchesCharacteristics, false)
})

test('contains NO player data and NO recommendation/ranking/scoring', () => {
  const json = JSON.stringify(S)
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(json, /\b(ranking|ranked|scored|recommendation|recommended)\b/i)
  assert.doesNotMatch(json, FORBIDDEN_LANG)
  assert.equal(S.derivationMetadata.containsPlayerData, false)
  assert.equal(S.derivationMetadata.playerSelection, false)
  assert.equal(S.derivationMetadata.teamRecommendation, false)
})

test('provenance preserves the chain back to M230', () => {
  assert.equal(S.provenance.characteristicsSourceMilestone, 'M266')
  assert.equal(S.provenance.assessmentSourceMilestone, 'M267')
  assert.deepEqual(S.provenance.chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M261', 'M262', 'M263'])
  assert.equal(S.derivationMetadata.milestone, 'M268')
})

test('minimal characteristics yield an insufficient/all-unknown summary', () => {
  const minAssess = buildCoachDnaSelectionIntelligenceEvidenceAssessment(MINIMAL_CHARS)
  const s = buildCoachDnaSelectionIntelligenceSummary(MINIMAL_CHARS, minAssess)
  assert.equal(s.valid, true)
  assert.equal(s.selectionStyleSummary.presentCharacteristics, 0)
  assert.equal(s.unknownSummary.unknownCount, 5)
  assert.equal(s.readinessSummary.readiness, 'insufficient')
  assert.equal(s.confidenceSummary.level, 'LOW')
})

test('malformed inputs fail safe — valid:false, unknown, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let s
    assert.doesNotThrow(() => { s = buildCoachDnaSelectionIntelligenceSummary(bad) })
    assert.equal(s.valid, false)
    assert.equal(s.readinessSummary.readiness, 'unknown')
    assert.equal(s.unknownSummary.unknownCount, 5)
  }
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaSelectionIntelligenceSummary(FULL_CHARS, FULL_ASSESS), serializeCoachDnaSelectionIntelligenceSummary(FULL_CHARS, FULL_ASSESS))
  assert.equal(buildCoachDnaSelectionIntelligenceSummary(FULL_CHARS, FULL_ASSESS).summaryFingerprint, S.summaryFingerprint)
})

test('summary fingerprint changes when the assessment is omitted', () => {
  const withAssess = buildCoachDnaSelectionIntelligenceSummary(FULL_CHARS, FULL_ASSESS).summaryFingerprint
  const withoutAssess = buildCoachDnaSelectionIntelligenceSummary(FULL_CHARS).summaryFingerprint
  assert.notEqual(withAssess, withoutAssess)
})

test('the source inputs are never mutated', () => {
  const cBefore = JSON.parse(JSON.stringify(FULL_CHARS))
  const aBefore = JSON.parse(JSON.stringify(FULL_ASSESS))
  buildCoachDnaSelectionIntelligenceSummary(FULL_CHARS, FULL_ASSESS)
  assert.deepEqual(JSON.parse(JSON.stringify(FULL_CHARS)), cBefore)
  assert.deepEqual(JSON.parse(JSON.stringify(FULL_ASSESS)), aBefore)
})

test('the output is deeply frozen', () => {
  assert.ok(Object.isFrozen(S))
  assert.ok(Object.isFrozen(S.selectionStyleSummary))
  assert.ok(Object.isFrozen(S.evidenceSummary))
  assert.ok(Object.isFrozen(S.unknownSummary.unknownCharacteristics))
  assert.ok(Object.isFrozen(S.provenance))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaSelectionIntelligenceSummary(FULL_CHARS, FULL_ASSESS, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-selection-intelligence-summary')
  const line = serializeCoachDnaSelectionIntelligenceSummary(FULL_CHARS, FULL_ASSESS, { format: 'line' })
  assert.match(line, /^coach-dna-selection-intelligence-summary valid=true readiness=partial /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaSelectionIntelligenceSummary(FULL_CHARS, FULL_ASSESS, { format: 'xml' }), /unsupported/)
})

test('the summary carries no recommendation, ranking or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaSelectionIntelligenceSummary(FULL_CHARS, FULL_ASSESS), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaSelectionIntelligenceSummary(FULL_CHARS, FULL_ASSESS), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaSelectionIntelligenceSummary(FULL_CHARS, FULL_ASSESS), /selection intelligence summary: summarised/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaSelectionIntelligenceSummary, 'function')
  assert.equal(typeof summarizeCoachDnaSelectionIntelligenceSummary, 'function')
  assert.equal(typeof serializeCoachDnaSelectionIntelligenceSummary, 'function')
})
