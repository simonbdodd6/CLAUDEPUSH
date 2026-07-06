/**
 * web/brain-coach-dna-cross-domain-intelligence-summary - Coach DNA Cross-Domain Intelligence Summary (M283) tests
 *
 * Verifies the top-level cross-domain summary: it folds the M268 selection summary, M276 training summary and
 * M282 coherence assessment into the single object future Brain consumers read — projecting domain headlines,
 * readiness, M282's coherence verdict (verbatim, no new reasoning), confidence and unknowns — WITHOUT
 * recommending, advising, or touching players/training content/sessions. It handles each input missing,
 * verifies the coherence assessment cites the same summaries it is folded with, propagates unknown, preserves
 * all three provenance chains, never mutates inputs, and is deeply frozen and byte-deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaCrossDomainIntelligenceSummary,
  summarizeCoachDnaCrossDomainIntelligenceSummary,
  serializeCoachDnaCrossDomainIntelligenceSummary,
} from '../web/brain-coach-dna-cross-domain-intelligence-summary.js'
import { buildCoachDnaCrossDomainCoherenceAssessment } from '../web/brain-coach-dna-cross-domain-coherence-assessment.js'
import { buildCoachDnaCrossDomainIntelligenceProfile } from '../web/brain-coach-dna-cross-domain-intelligence-profile.js'
import { buildCoachDnaCrossDomainIntelligenceInputs } from '../web/brain-coach-dna-cross-domain-intelligence-inputs.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaSelectionIntelligenceInputs } from '../web/brain-coach-dna-selection-intelligence-inputs.js'
import { buildCoachDnaSelectionIntelligenceProfile } from '../web/brain-coach-dna-selection-intelligence-profile.js'
import { createCoachDnaSelectionIntelligenceQuery } from '../web/brain-coach-dna-selection-intelligence-query.js'
import { buildCoachDnaSelectionIntelligenceCharacteristics } from '../web/brain-coach-dna-selection-intelligence-characteristics.js'
import { buildCoachDnaSelectionIntelligenceEvidenceAssessment } from '../web/brain-coach-dna-selection-intelligence-evidence-assessment.js'
import { buildCoachDnaSelectionIntelligenceSummary } from '../web/brain-coach-dna-selection-intelligence-summary.js'
import { buildCoachDnaTrainingIntelligenceInputs } from '../web/brain-coach-dna-training-intelligence-inputs.js'
import { buildCoachDnaTrainingIntelligenceProfile } from '../web/brain-coach-dna-training-intelligence-profile.js'
import { createCoachDnaTrainingIntelligenceQuery } from '../web/brain-coach-dna-training-intelligence-query.js'
import { buildCoachDnaTrainingIntelligenceCharacteristics } from '../web/brain-coach-dna-training-intelligence-characteristics.js'
import { buildCoachDnaTrainingIntelligenceEvidenceAssessment } from '../web/brain-coach-dna-training-intelligence-evidence-assessment.js'
import { buildCoachDnaTrainingIntelligenceSummary } from '../web/brain-coach-dna-training-intelligence-summary.js'

const FORBIDDEN_LANG = /\b(you should|recommend(ation|ed|s)?|advis\w+|advice|must (start|bench|do)|drop him|pick him|best xv|predict|forecast|ranking|ranked|scored|training plan|session plan|do this drill|run this session|session analysis|better|worse|stronger|weaker)\b/i

function freeze(o) {
  if (o && typeof o === 'object') { for (const k of Object.keys(o)) freeze(o[k]); Object.freeze(o) }
  return o
}
const SEL_VIEW = freeze({
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
const TRN_VIEW = freeze({
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

const selSummaryOf = (view) => {
  const chars = buildCoachDnaSelectionIntelligenceCharacteristics(createCoachDnaSelectionIntelligenceQuery(buildCoachDnaSelectionIntelligenceProfile(buildCoachDnaSelectionIntelligenceInputs(createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(view)))))))
  return buildCoachDnaSelectionIntelligenceSummary(chars, buildCoachDnaSelectionIntelligenceEvidenceAssessment(chars))
}
const trnSummaryOf = (view) => {
  const chars = buildCoachDnaTrainingIntelligenceCharacteristics(createCoachDnaTrainingIntelligenceQuery(buildCoachDnaTrainingIntelligenceProfile(buildCoachDnaTrainingIntelligenceInputs(createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(view)))))))
  return buildCoachDnaTrainingIntelligenceSummary(chars, buildCoachDnaTrainingIntelligenceEvidenceAssessment(chars))
}
const SEL = freeze(JSON.parse(JSON.stringify(selSummaryOf(SEL_VIEW))))
const TRN = freeze(JSON.parse(JSON.stringify(trnSummaryOf(TRN_VIEW))))
const COH = freeze(JSON.parse(JSON.stringify(buildCoachDnaCrossDomainCoherenceAssessment(buildCoachDnaCrossDomainIntelligenceProfile(buildCoachDnaCrossDomainIntelligenceInputs(SEL, TRN))))))
const COH_PARTIAL = freeze(JSON.parse(JSON.stringify(buildCoachDnaCrossDomainCoherenceAssessment(buildCoachDnaCrossDomainIntelligenceProfile(buildCoachDnaCrossDomainIntelligenceInputs(SEL))))))
const S = buildCoachDnaCrossDomainIntelligenceSummary(SEL, TRN, COH)

test('valid inputs produce the full summary shape', () => {
  assert.equal(S.type, 'coach-dna-cross-domain-intelligence-summary')
  assert.equal(S.schemaVersion, 1)
  assert.equal(S.summaryVersion, 1)
  assert.equal(S.milestone, 'M283')
  assert.equal(S.valid, true)
  assert.equal(S.selectionSummaryFingerprint, SEL.summaryFingerprint)
  assert.equal(S.trainingSummaryFingerprint, TRN.summaryFingerprint)
  assert.equal(S.coherenceAssessmentFingerprint, COH.assessmentFingerprint)
  for (const k of ['crossDomainSummary', 'readinessSummary', 'coherenceSummary', 'confidenceSummary', 'unknownSummary', 'provenance', 'derivationMetadata']) {
    assert.ok(isObj(S[k]), k)
  }
  assert.match(S.summaryFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }

test('the cross-domain summary projects each domain headline verbatim, in fixed order', () => {
  assert.deepEqual(Object.keys(S.crossDomainSummary), ['selection', 'training', 'usableDomains', 'totalDomains', 'complete'])
  assert.deepEqual(S.crossDomainSummary.selection, {
    sourceMilestone: 'M268', included: true, usable: true, readiness: 'partial',
    presentCharacteristics: 3, totalCharacteristics: 5, strongestCharacteristic: 'selectionEmphasis',
  })
  assert.deepEqual(S.crossDomainSummary.training, {
    sourceMilestone: 'M276', included: true, usable: true, readiness: 'partial',
    presentCharacteristics: 4, totalCharacteristics: 6, strongestCharacteristic: 'sessionStructure',
  })
  assert.equal(S.crossDomainSummary.usableDomains, 2)
  assert.equal(S.crossDomainSummary.complete, true)
})

test('readiness, confidence and unknown summaries carry domain values + M282 alignments — no new rules', () => {
  assert.deepEqual(S.readinessSummary, { selection: 'partial', training: 'partial', alignment: 'aligned', assemblyCompleteness: 'complete' })
  assert.deepEqual(S.confidenceSummary, {
    selection: { level: 'HIGH', value: 0.72 },
    training: { level: 'HIGH', value: 0.72 },
    alignment: 'aligned',
  })
  assert.equal(S.unknownSummary.alignment, 'broadly-aligned')
  assert.deepEqual(S.unknownSummary.selection, {
    unknownCount: 2, unknownCharacteristics: ['rotationCharacteristics', 'availabilityCharacteristics'], allKnown: false,
  })
  assert.equal(S.unknownSummary.training.unknownCount, 2)
})

test('the coherence summary carries the M282 verdict verbatim', () => {
  assert.equal(S.coherenceSummary.assessed, true)
  assert.equal(S.coherenceSummary.state, COH.coherenceState.state)
  assert.equal(S.coherenceSummary.note, COH.coherenceState.note)
  assert.deepEqual({ ...S.coherenceSummary.facets }, { ...COH.coherenceState.facets })
  assert.deepEqual([...S.coherenceSummary.conflictingFacets], [...COH.coherenceState.conflictingFacets])
  assert.deepEqual([...S.coherenceSummary.unknownFacets], [...COH.coherenceState.unknownFacets])
})

test('a missing coherence assessment stays unknown — never inferred', () => {
  const s = buildCoachDnaCrossDomainIntelligenceSummary(SEL, TRN)
  assert.equal(s.valid, true)
  assert.equal(s.coherenceAssessmentFingerprint, null)
  assert.equal(s.coherenceSummary.assessed, false)
  assert.equal(s.coherenceSummary.state, 'unknown')
  assert.equal(s.coherenceSummary.facets, null)
  assert.equal(s.readinessSummary.alignment, 'unknown')
  assert.equal(s.confidenceSummary.alignment, 'unknown')
  assert.equal(s.unknownSummary.alignment, 'unknown')
  assert.deepEqual(s.validationState.issues, ['coherence assessment not supplied'])
  assert.equal(s.derivationMetadata.coherenceIncluded, false)
  assert.equal(s.derivationMetadata.coherenceMatchesSelection, null)
})

test('a missing training summary yields a partial summary with null-safe slots', () => {
  const s = buildCoachDnaCrossDomainIntelligenceSummary(SEL, undefined, COH)
  assert.equal(s.valid, true)
  assert.equal(s.crossDomainSummary.complete, false)
  assert.equal(s.crossDomainSummary.usableDomains, 1)
  assert.equal(s.crossDomainSummary.training.included, false)
  assert.equal(s.crossDomainSummary.training.readiness, 'unknown')
  assert.equal(s.confidenceSummary.training, null)
  assert.equal(s.unknownSummary.training, null)
  assert.equal(s.trainingSummaryFingerprint, null)
  assert.deepEqual(s.validationState.issues, ['training summary missing or malformed'])
})

test('a missing selection summary yields a partial summary with null-safe slots', () => {
  const s = buildCoachDnaCrossDomainIntelligenceSummary(undefined, TRN, COH)
  assert.equal(s.valid, true)
  assert.equal(s.crossDomainSummary.selection.included, false)
  assert.equal(s.confidenceSummary.selection, null)
  assert.equal(s.selectionSummaryFingerprint, null)
  assert.deepEqual(s.validationState.issues, ['selection summary missing or malformed'])
})

test('malformed inputs fail safe — valid:false, unknown, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let s
    assert.doesNotThrow(() => { s = buildCoachDnaCrossDomainIntelligenceSummary(bad, bad, bad) })
    assert.equal(s.valid, false)
    assert.equal(s.coherenceSummary.state, 'unknown')
    assert.equal(s.crossDomainSummary.usableDomains, 0)
    assert.equal(s.validationState.issues.length, 3)
  }
  // swapped domain summaries are not accepted into the wrong slot
  const swapped = buildCoachDnaCrossDomainIntelligenceSummary(TRN, SEL, COH)
  assert.equal(swapped.valid, false)
})

test('the coherence assessment is checked to pair with the summaries it is folded with', () => {
  assert.equal(S.derivationMetadata.coherenceMatchesSelection, true)
  assert.equal(S.derivationMetadata.coherenceMatchesTraining, true)
  // an assessment built without the training domain does not pair with the full training summary
  const s = buildCoachDnaCrossDomainIntelligenceSummary(SEL, TRN, COH_PARTIAL)
  assert.equal(s.derivationMetadata.coherenceMatchesSelection, true)
  assert.equal(s.derivationMetadata.coherenceMatchesTraining, false)
})

test('provenance preserves all three lineages and the cross-domain fingerprints', () => {
  assert.equal(S.provenance.selectionSourceMilestone, 'M268')
  assert.deepEqual(S.provenance.selectionChain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M261', 'M262', 'M263'])
  assert.equal(S.provenance.trainingSourceMilestone, 'M276')
  assert.deepEqual(S.provenance.trainingChain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M269', 'M270', 'M271'])
  assert.equal(S.provenance.coherenceSourceMilestone, 'M282')
  assert.deepEqual(S.provenance.coherenceChain, ['M277', 'M278', 'M279'])
  assert.equal(S.provenance.selectionSummaryFingerprint, SEL.summaryFingerprint)
  assert.equal(S.provenance.trainingSummaryFingerprint, TRN.summaryFingerprint)
  assert.equal(S.provenance.coherenceAssessmentFingerprint, COH.assessmentFingerprint)
  assert.equal(S.provenance.crossDomainProfileFingerprint, COH.provenance.profileFingerprint)
  assert.equal(S.provenance.crossDomainInputsFingerprint, COH.provenance.crossDomainInputsFingerprint)
  assert.equal(S.derivationMetadata.milestone, 'M283')
  assert.deepEqual(S.derivationMetadata.summarizes, ['M268', 'M276', 'M282'])
})

test('contains NO player data and makes NO recommendation, advice or new reasoning', () => {
  const json = JSON.stringify(S)
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(json, FORBIDDEN_LANG)
  assert.equal(S.derivationMetadata.createsNewReasoning, false)
  assert.equal(S.derivationMetadata.playerComparison, false)
  assert.equal(S.derivationMetadata.coachAdvice, false)
  assert.equal(S.derivationMetadata.createsRecommendations, false)
  assert.equal(S.derivationMetadata.playerEvaluation, false)
  assert.equal(S.derivationMetadata.playerSelection, false)
  assert.equal(S.derivationMetadata.teamRecommendation, false)
  assert.equal(S.derivationMetadata.trainingRecommendation, false)
  assert.equal(S.derivationMetadata.generatesTrainingContent, false)
  assert.equal(S.derivationMetadata.analysesSessions, false)
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaCrossDomainIntelligenceSummary(SEL, TRN, COH), serializeCoachDnaCrossDomainIntelligenceSummary(SEL, TRN, COH))
  assert.equal(buildCoachDnaCrossDomainIntelligenceSummary(SEL, TRN, COH).summaryFingerprint, S.summaryFingerprint)
})

test('the summary fingerprint tracks its inputs', () => {
  const without = buildCoachDnaCrossDomainIntelligenceSummary(SEL, TRN).summaryFingerprint
  const selOnly = buildCoachDnaCrossDomainIntelligenceSummary(SEL, undefined, COH).summaryFingerprint
  assert.notEqual(without, S.summaryFingerprint)
  assert.notEqual(selOnly, S.summaryFingerprint)
  assert.notEqual(without, selOnly)
})

test('the source inputs are never mutated', () => {
  const sBefore = JSON.parse(JSON.stringify(SEL))
  const tBefore = JSON.parse(JSON.stringify(TRN))
  const cBefore = JSON.parse(JSON.stringify(COH))
  buildCoachDnaCrossDomainIntelligenceSummary(SEL, TRN, COH)
  assert.deepEqual(JSON.parse(JSON.stringify(SEL)), sBefore)
  assert.deepEqual(JSON.parse(JSON.stringify(TRN)), tBefore)
  assert.deepEqual(JSON.parse(JSON.stringify(COH)), cBefore)
})

test('the output is deeply frozen', () => {
  assert.ok(Object.isFrozen(S))
  assert.ok(Object.isFrozen(S.crossDomainSummary))
  assert.ok(Object.isFrozen(S.crossDomainSummary.selection))
  assert.ok(Object.isFrozen(S.coherenceSummary))
  assert.ok(Object.isFrozen(S.coherenceSummary.facets))
  assert.ok(Object.isFrozen(S.unknownSummary.selection.unknownCharacteristics))
  assert.ok(Object.isFrozen(S.provenance))
  assert.ok(Object.isFrozen(S.derivationMetadata))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaCrossDomainIntelligenceSummary(SEL, TRN, COH, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-cross-domain-intelligence-summary')
  const line = serializeCoachDnaCrossDomainIntelligenceSummary(SEL, TRN, COH, { format: 'line' })
  assert.match(line, /^coach-dna-cross-domain-intelligence-summary valid=true complete=true coherence=coherent domains=2\/2 /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaCrossDomainIntelligenceSummary(SEL, TRN, COH, { format: 'xml' }), /unsupported/)
})

test('rendered output carries no recommendation, advice, player or training-plan language', () => {
  assert.doesNotMatch(serializeCoachDnaCrossDomainIntelligenceSummary(SEL, TRN, COH), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaCrossDomainIntelligenceSummary(SEL, TRN, COH), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaCrossDomainIntelligenceSummary(SEL, TRN, COH), /cross-domain intelligence summary: complete/)
  assert.match(summarizeCoachDnaCrossDomainIntelligenceSummary(SEL, undefined, COH), /cross-domain intelligence summary: partial/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaCrossDomainIntelligenceSummary, 'function')
  assert.equal(typeof summarizeCoachDnaCrossDomainIntelligenceSummary, 'function')
  assert.equal(typeof serializeCoachDnaCrossDomainIntelligenceSummary, 'function')
})
