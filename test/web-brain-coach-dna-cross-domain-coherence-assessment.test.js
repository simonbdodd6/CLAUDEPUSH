/**
 * web/brain-coach-dna-cross-domain-coherence-assessment - Coach DNA Cross-Domain Coherence Assessment (M282) tests
 *
 * Verifies the FIRST cross-domain reasoning layer: it assesses whether the Selection and Training pictures
 * cohere (evidence, confidence, completeness, unknown facets → coherent/partial/conflicting/unknown) from the
 * M280 query surface, using fixed documented rules — WITHOUT recommending, advising, comparing players or
 * generating training content. Unknown propagates as unknown, a missing domain yields a partial assessment,
 * malformed inputs fail safe, provenance is preserved, nothing is mutated, and the output is deeply frozen and
 * byte-deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaCrossDomainCoherenceAssessment,
  summarizeCoachDnaCrossDomainCoherenceAssessment,
  serializeCoachDnaCrossDomainCoherenceAssessment,
} from '../web/brain-coach-dna-cross-domain-coherence-assessment.js'
import { createCoachDnaCrossDomainIntelligenceQuery } from '../web/brain-coach-dna-cross-domain-intelligence-query.js'
import { buildCoachDnaCrossDomainIntelligenceIndex } from '../web/brain-coach-dna-cross-domain-intelligence-index.js'
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

// Recommendation/advice/player/training-plan/session-analysis language the assessment must never contain.
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
const SEL = selSummaryOf(SEL_VIEW)
const TRN = trnSummaryOf(TRN_VIEW)
const PROFILE = freeze(JSON.parse(JSON.stringify(buildCoachDnaCrossDomainIntelligenceProfile(buildCoachDnaCrossDomainIntelligenceInputs(SEL, TRN)))))
const INDEX = freeze(JSON.parse(JSON.stringify(buildCoachDnaCrossDomainIntelligenceIndex(PROFILE))))
const SURFACE = createCoachDnaCrossDomainIntelligenceQuery({ profile: PROFILE, index: INDEX })
const PARTIAL_PROFILE = freeze(JSON.parse(JSON.stringify(buildCoachDnaCrossDomainIntelligenceProfile(buildCoachDnaCrossDomainIntelligenceInputs(SEL)))))
const A = buildCoachDnaCrossDomainCoherenceAssessment(SURFACE)

// A synthetic M280-shaped surface with hand-set values, to exercise specific rule branches deterministically.
function syntheticSurface({ selConf = 'HIGH', trnConf = 'HIGH', selEvLevel = 'moderate', trnEvLevel = 'moderate', selReadiness = 'partial', trnReadiness = 'partial' } = {}) {
  const domain = (key, readiness) => freeze({ domain: key, sourceMilestone: key === 'selection' ? 'M268' : 'M276', included: true, usable: true, summaryFingerprint: 'fnv1a32:00000000', readiness, presentCharacteristics: 3, totalCharacteristics: 5, strongestCharacteristic: null, unknownCount: 2 })
  const evidence = (level) => freeze({ assessed: true, wellSupported: 1, tentative: 1, unknown: 1, completeness: level, consistency: 'consistent' })
  const confidence = (level) => freeze({ level, value: 0.5, high: level === 'HIGH', low: level === 'LOW' })
  return freeze({
    isUsable: () => true,
    getDomain: (k) => (k === 'selection' ? domain('selection', selReadiness) : k === 'training' ? domain('training', trnReadiness) : null),
    getEvidence: (k) => (k === 'selection' ? evidence(selEvLevel) : k === 'training' ? evidence(trnEvLevel) : null),
    getConfidence: (k) => (k === 'selection' ? confidence(selConf) : k === 'training' ? confidence(trnConf) : null),
    getCompleteness: () => freeze({ level: 'complete', complete: true, includedDomains: 2, usableDomains: 2, totalDomains: 2 }),
    getProvenance: () => freeze({ chain: ['M277', 'M278', 'M279'], profileFingerprint: 'fnv1a32:00000000', crossDomainInputsFingerprint: 'fnv1a32:00000000', byDomain: null, byMilestone: null }),
    getValidationState: () => freeze({ profileRecognized: true, profileUsable: true, issues: [] }),
    listAvailableDomains: () => freeze(['selection', 'training']),
  })
}

test('valid selection + training domains produce the full assessment shape', () => {
  assert.equal(A.type, 'coach-dna-cross-domain-coherence-assessment')
  assert.equal(A.schemaVersion, 1)
  assert.equal(A.assessmentVersion, 1)
  assert.equal(A.milestone, 'M282')
  assert.equal(A.valid, true)
  for (const k of ['domainAvailability', 'evidenceCoherence', 'confidenceCoherence', 'completenessCoherence', 'unknownCoherence', 'coherenceState', 'provenance', 'derivationMetadata']) {
    assert.ok(isObj(A[k]), k)
  }
  assert.match(A.assessmentFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }

test('the coherence facets follow the documented rules for the fixture data', () => {
  // evidence: selection 'low' vs training 'moderate' → gap 1 → broadly-aligned
  assert.deepEqual({ ...A.evidenceCoherence }, {
    selection: 'low', training: 'moderate', gap: 1, alignment: 'broadly-aligned',
    selectionConsistency: 'consistent', trainingConsistency: 'consistent',
  })
  // confidence: HIGH vs HIGH → gap 0 → aligned
  assert.equal(A.confidenceCoherence.alignment, 'aligned')
  assert.equal(A.confidenceCoherence.gap, 0)
  // completeness: readiness partial vs partial → aligned; assembly complete
  assert.equal(A.completenessCoherence.alignment, 'aligned')
  assert.equal(A.completenessCoherence.assemblyCompleteness, 'complete')
  // unknowns: 2/5 (moderate band) vs 2/6 (low band) → gap 1 → broadly-aligned
  assert.equal(A.unknownCoherence.selection.band, 'moderate')
  assert.equal(A.unknownCoherence.training.band, 'low')
  assert.equal(A.unknownCoherence.alignment, 'broadly-aligned')
})

test('the overall state is coherent when no facet conflicts and none is unknown', () => {
  assert.equal(A.coherenceState.state, 'coherent')
  assert.deepEqual(A.coherenceState.facets, { evidence: 'broadly-aligned', confidence: 'aligned', completeness: 'aligned', unknown: 'broadly-aligned' })
  assert.deepEqual(A.coherenceState.conflictingFacets, [])
  assert.deepEqual(A.coherenceState.unknownFacets, [])
  assert.equal(A.domainAvailability.bothUsable, true)
})

test('divergent confidence across domains classifies as conflicting (documented rule)', () => {
  const a = buildCoachDnaCrossDomainCoherenceAssessment(syntheticSurface({ selConf: 'HIGH', trnConf: 'LOW' }))
  assert.equal(a.confidenceCoherence.gap, 2)
  assert.equal(a.confidenceCoherence.alignment, 'divergent')
  assert.equal(a.coherenceState.state, 'conflicting')
  assert.deepEqual(a.coherenceState.conflictingFacets, ['confidence'])
})

test('a wide evidence-completeness gap classifies as conflicting', () => {
  const a = buildCoachDnaCrossDomainCoherenceAssessment(syntheticSurface({ selEvLevel: 'high', trnEvLevel: 'low' }))
  assert.equal(a.evidenceCoherence.gap, 2)
  assert.equal(a.evidenceCoherence.alignment, 'imbalanced')
  assert.equal(a.coherenceState.state, 'conflicting')
})

test('mismatched readiness (ready vs insufficient) conflicts; adjacent readiness does not', () => {
  const conflict = buildCoachDnaCrossDomainCoherenceAssessment(syntheticSurface({ selReadiness: 'ready', trnReadiness: 'insufficient' }))
  assert.equal(conflict.completenessCoherence.alignment, 'imbalanced')
  assert.equal(conflict.coherenceState.state, 'conflicting')
  const fine = buildCoachDnaCrossDomainCoherenceAssessment(syntheticSurface({ selReadiness: 'ready', trnReadiness: 'partial' }))
  assert.equal(fine.completenessCoherence.alignment, 'broadly-aligned')
  assert.equal(fine.coherenceState.state, 'coherent')
})

test('one domain missing yields a partial assessment with unknown facets (unknown propagation)', () => {
  const a = buildCoachDnaCrossDomainCoherenceAssessment(PARTIAL_PROFILE)
  assert.equal(a.valid, true)
  assert.equal(a.coherenceState.state, 'partial')
  assert.equal(a.domainAvailability.bothUsable, false)
  assert.equal(a.domainAvailability.usableDomains, 1)
  assert.equal(a.domainAvailability.training.readiness, 'unknown')
  for (const facet of ['evidence', 'confidence', 'completeness', 'unknown']) {
    assert.equal(a.coherenceState.facets[facet], 'unknown', facet)
  }
  assert.equal(a.evidenceCoherence.gap, null)
  assert.equal(a.unknownCoherence.training.unknownRatio, null)
  assert.deepEqual(a.validationState.issues, ['coherence only partially assessable (a domain is missing)'])
})

test('malformed inputs fail safe — unknown state, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let a
    assert.doesNotThrow(() => { a = buildCoachDnaCrossDomainCoherenceAssessment(bad) })
    assert.equal(a.valid, false)
    assert.equal(a.coherenceState.state, 'unknown')
    assert.equal(a.evidenceCoherence.alignment, 'unknown')
    assert.equal(a.domainAvailability.usableDomains, 0)
    assert.deepEqual(a.validationState.issues, ['cross-domain intelligence unusable (source missing or malformed)'])
  }
})

test('surface, profile and index inputs produce byte-identical assessments', () => {
  const fromSurface = buildCoachDnaCrossDomainCoherenceAssessment(SURFACE)
  const fromProfile = buildCoachDnaCrossDomainCoherenceAssessment(PROFILE)
  const fromIndex = buildCoachDnaCrossDomainCoherenceAssessment(INDEX)
  assert.equal(fromProfile.assessmentFingerprint, fromSurface.assessmentFingerprint)
  assert.equal(fromIndex.assessmentFingerprint, fromSurface.assessmentFingerprint)
  assert.equal(JSON.stringify(fromProfile), JSON.stringify(fromSurface))
})

test('provenance preserves the cross-domain chain and both domain lineages', () => {
  assert.equal(A.provenance.source, 'coach-dna-cross-domain-intelligence-query')
  assert.equal(A.provenance.sourceMilestone, 'M280')
  assert.deepEqual(A.provenance.chain, ['M277', 'M278', 'M279'])
  assert.equal(A.provenance.profileFingerprint, PROFILE.profileFingerprint)
  assert.equal(A.provenance.crossDomainInputsFingerprint, PROFILE.crossDomainInputsFingerprint)
  assert.deepEqual(A.provenance.byDomain.selection.chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M261', 'M262', 'M263'])
  assert.deepEqual(A.provenance.byDomain.training.chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M269', 'M270', 'M271'])
  assert.equal(A.provenance.byMilestone.M278.fingerprint, PROFILE.profileFingerprint)
  assert.equal(A.derivationMetadata.milestone, 'M282')
})

test('the documented rules are recorded in the derivation metadata', () => {
  const r = A.derivationMetadata.rules
  assert.deepEqual(r.confidenceOrdinal, { LOW: 0, MEDIUM: 1, HIGH: 2 })
  assert.deepEqual(r.readinessOrdinal, { insufficient: 0, partial: 1, ready: 2 })
  assert.equal(r.unknownRatioModerate, 0.34)
  assert.equal(r.unknownRatioHigh, 0.67)
  assert.equal(A.derivationMetadata.ruleBased, true)
  assert.equal(A.derivationMetadata.assessesDomainCoherence, true)
  assert.equal(A.derivationMetadata.deterministic, true)
  assert.equal(A.derivationMetadata.llmGenerated, false)
  assert.equal(A.derivationMetadata.dormant, true)
})

test('contains NO player data and makes NO recommendation or advice', () => {
  const json = JSON.stringify(A)
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(json, FORBIDDEN_LANG)
  assert.equal(A.derivationMetadata.playerComparison, false)
  assert.equal(A.derivationMetadata.coachAdvice, false)
  assert.equal(A.derivationMetadata.createsRecommendations, false)
  assert.equal(A.derivationMetadata.playerEvaluation, false)
  assert.equal(A.derivationMetadata.playerSelection, false)
  assert.equal(A.derivationMetadata.teamRecommendation, false)
  assert.equal(A.derivationMetadata.trainingRecommendation, false)
  assert.equal(A.derivationMetadata.generatesTrainingContent, false)
  assert.equal(A.derivationMetadata.analysesSessions, false)
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaCrossDomainCoherenceAssessment(SURFACE), serializeCoachDnaCrossDomainCoherenceAssessment(SURFACE))
  assert.equal(buildCoachDnaCrossDomainCoherenceAssessment(SURFACE).assessmentFingerprint, A.assessmentFingerprint)
})

test('the assessment fingerprint changes when a domain is missing', () => {
  const partial = buildCoachDnaCrossDomainCoherenceAssessment(PARTIAL_PROFILE)
  assert.notEqual(partial.assessmentFingerprint, A.assessmentFingerprint)
})

test('the source profile and index are never mutated', () => {
  const pBefore = JSON.parse(JSON.stringify(PROFILE))
  const iBefore = JSON.parse(JSON.stringify(INDEX))
  buildCoachDnaCrossDomainCoherenceAssessment({ profile: PROFILE, index: INDEX })
  assert.deepEqual(JSON.parse(JSON.stringify(PROFILE)), pBefore)
  assert.deepEqual(JSON.parse(JSON.stringify(INDEX)), iBefore)
})

test('the output is deeply frozen', () => {
  assert.ok(Object.isFrozen(A))
  assert.ok(Object.isFrozen(A.domainAvailability))
  assert.ok(Object.isFrozen(A.evidenceCoherence))
  assert.ok(Object.isFrozen(A.coherenceState))
  assert.ok(Object.isFrozen(A.coherenceState.facets))
  assert.ok(Object.isFrozen(A.unknownCoherence.selection))
  assert.ok(Object.isFrozen(A.provenance))
  assert.ok(Object.isFrozen(A.derivationMetadata.rules))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaCrossDomainCoherenceAssessment(SURFACE, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-cross-domain-coherence-assessment')
  const line = serializeCoachDnaCrossDomainCoherenceAssessment(SURFACE, { format: 'line' })
  assert.match(line, /^coach-dna-cross-domain-coherence-assessment state=coherent domains=2\/2 /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaCrossDomainCoherenceAssessment(SURFACE, { format: 'xml' }), /unsupported/)
})

test('rendered output carries no recommendation, advice, player or training-plan language', () => {
  assert.doesNotMatch(serializeCoachDnaCrossDomainCoherenceAssessment(SURFACE), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaCrossDomainCoherenceAssessment(SURFACE), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaCrossDomainCoherenceAssessment(SURFACE), /coherence assessment: coherent/)
  assert.match(summarizeCoachDnaCrossDomainCoherenceAssessment(PARTIAL_PROFILE), /coherence assessment: partial/)
  assert.match(summarizeCoachDnaCrossDomainCoherenceAssessment(null), /coherence assessment: unknown/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaCrossDomainCoherenceAssessment, 'function')
  assert.equal(typeof summarizeCoachDnaCrossDomainCoherenceAssessment, 'function')
  assert.equal(typeof serializeCoachDnaCrossDomainCoherenceAssessment, 'function')
})
