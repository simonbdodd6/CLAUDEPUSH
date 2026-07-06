/**
 * web/brain-coach-dna-cross-domain-intelligence-inputs - Coach DNA Cross-Domain Intelligence Inputs (M277) tests
 *
 * Verifies the first cross-domain integration layer: it ASSEMBLES the M268 selection summary and the M276
 * training summary into one deterministic structure — embedding each summary verbatim with side-by-side
 * evidence/confidence overviews — WITHOUT comparing the domains, combining their figures or creating any new
 * intelligence. It handles a missing/malformed domain with a null slot, contains NO player data, makes NO
 * recommendation, preserves both provenance chains, never mutates inputs, and is deeply frozen and
 * byte-deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaCrossDomainIntelligenceInputs,
  summarizeCoachDnaCrossDomainIntelligenceInputs,
  serializeCoachDnaCrossDomainIntelligenceInputs,
} from '../web/brain-coach-dna-cross-domain-intelligence-inputs.js'
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

const FORBIDDEN_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv|predict|forecast|ranking|ranked|scored|select him|start him|bench him|training plan|session plan|do this drill|run this session|session analysis)\b/i

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
const X = buildCoachDnaCrossDomainIntelligenceInputs(SEL, TRN)

test('valid selection + training summaries produce the full cross-domain shape', () => {
  assert.equal(X.type, 'coach-dna-cross-domain-intelligence-inputs')
  assert.equal(X.schemaVersion, 1)
  assert.equal(X.crossDomainVersion, 1)
  assert.equal(X.milestone, 'M277')
  assert.equal(X.valid, true)
  assert.equal(X.complete, true)
  assert.equal(X.usableDomains, 2)
  assert.equal(X.totalDomains, 2)
  for (const k of ['selectionSummary', 'trainingSummary', 'sharedEvidenceOverview', 'sharedConfidenceOverview', 'provenance', 'derivationMetadata']) {
    assert.ok(isObj(X[k]), k)
  }
  assert.match(X.crossDomainFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }

test('both domain summaries are embedded verbatim as detached deep copies', () => {
  assert.notEqual(X.selectionSummary, SEL)
  assert.notEqual(X.trainingSummary, TRN)
  assert.deepEqual(JSON.parse(JSON.stringify(X.selectionSummary)), JSON.parse(JSON.stringify(SEL)))
  assert.deepEqual(JSON.parse(JSON.stringify(X.trainingSummary)), JSON.parse(JSON.stringify(TRN)))
  assert.equal(X.selectionSummary.summaryFingerprint, SEL.summaryFingerprint)
  assert.equal(X.trainingSummary.summaryFingerprint, TRN.summaryFingerprint)
})

test('the shared evidence overview carries each domain side by side, copied verbatim', () => {
  assert.deepEqual(X.sharedEvidenceOverview.selection, {
    assessed: true, wellSupported: 1, tentative: 2, unknown: 2, completeness: 'low', consistency: 'consistent',
  })
  assert.deepEqual(X.sharedEvidenceOverview.training, {
    assessed: true, wellSupported: 2, tentative: 2, unknown: 2, completeness: 'moderate', consistency: 'consistent',
  })
  // assembly only — no combined totals, no comparison verdicts
  assert.deepEqual(Object.keys(X.sharedEvidenceOverview).sort(), ['selection', 'training'])
})

test('the shared confidence overview carries each domain side by side, copied verbatim', () => {
  assert.deepEqual(X.sharedConfidenceOverview.selection, { level: 'HIGH', value: 0.72, high: true, low: false })
  assert.deepEqual(X.sharedConfidenceOverview.training, { level: 'HIGH', value: 0.72, high: true, low: false })
  // assembly only — no combined or reconciled confidence
  assert.deepEqual(Object.keys(X.sharedConfidenceOverview).sort(), ['selection', 'training'])
})

test('the assembly declares itself assembly-only — no comparison, no new intelligence', () => {
  assert.equal(X.derivationMetadata.milestone, 'M277')
  assert.equal(X.derivationMetadata.domain, 'cross-domain')
  assert.equal(X.derivationMetadata.layer, 'inputs')
  assert.deepEqual(X.derivationMetadata.assembles, ['M268', 'M276'])
  assert.equal(X.derivationMetadata.assemblyOnly, true)
  assert.equal(X.derivationMetadata.comparesDomains, false)
  assert.equal(X.derivationMetadata.createsNewIntelligence, false)
  assert.equal(X.derivationMetadata.deterministic, true)
  assert.equal(X.derivationMetadata.llmGenerated, false)
  assert.equal(X.derivationMetadata.dormant, true)
})

test('a missing training summary yields a partial assembly with a null slot', () => {
  const x = buildCoachDnaCrossDomainIntelligenceInputs(SEL)
  assert.equal(x.valid, true)
  assert.equal(x.complete, false)
  assert.equal(x.usableDomains, 1)
  assert.equal(x.trainingSummary, null)
  assert.equal(x.sharedEvidenceOverview.training, null)
  assert.equal(x.sharedConfidenceOverview.training, null)
  assert.equal(x.provenance.trainingSummaryFingerprint, null)
  assert.deepEqual(x.validationState.issues, ['training summary missing or malformed'])
  assert.equal(x.derivationMetadata.trainingIncluded, false)
})

test('a missing selection summary yields a partial assembly with a null slot', () => {
  const x = buildCoachDnaCrossDomainIntelligenceInputs(undefined, TRN)
  assert.equal(x.valid, true)
  assert.equal(x.complete, false)
  assert.equal(x.usableDomains, 1)
  assert.equal(x.selectionSummary, null)
  assert.equal(x.sharedEvidenceOverview.selection, null)
  assert.equal(x.sharedConfidenceOverview.selection, null)
  assert.deepEqual(x.validationState.issues, ['selection summary missing or malformed'])
  assert.equal(x.derivationMetadata.selectionIncluded, false)
})

test('malformed inputs fail safe — valid:false, null slots, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let x
    assert.doesNotThrow(() => { x = buildCoachDnaCrossDomainIntelligenceInputs(bad, bad) })
    assert.equal(x.valid, false)
    assert.equal(x.complete, false)
    assert.equal(x.usableDomains, 0)
    assert.equal(x.selectionSummary, null)
    assert.equal(x.trainingSummary, null)
    assert.equal(x.validationState.issues.length, 2)
  }
  // swapped domain summaries are not accepted into the wrong slot
  const swapped = buildCoachDnaCrossDomainIntelligenceInputs(TRN, SEL)
  assert.equal(swapped.valid, false)
  assert.equal(swapped.usableDomains, 0)
})

test('provenance preserves both domain chains and fingerprints', () => {
  assert.equal(X.provenance.selectionSource, 'coach-dna-selection-intelligence-summary')
  assert.equal(X.provenance.selectionSourceMilestone, 'M268')
  assert.equal(X.provenance.selectionSummaryFingerprint, SEL.summaryFingerprint)
  assert.deepEqual(X.provenance.selectionChain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M261', 'M262', 'M263'])
  assert.equal(X.provenance.trainingSource, 'coach-dna-training-intelligence-summary')
  assert.equal(X.provenance.trainingSourceMilestone, 'M276')
  assert.equal(X.provenance.trainingSummaryFingerprint, TRN.summaryFingerprint)
  assert.deepEqual(X.provenance.trainingChain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M269', 'M270', 'M271'])
})

test('contains NO player data and NO recommendation/scoring/ranking flags', () => {
  const json = JSON.stringify(X)
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(json, FORBIDDEN_LANG)
  assert.equal(X.derivationMetadata.containsPlayerData, false)
  assert.equal(X.derivationMetadata.playerEvaluation, false)
  assert.equal(X.derivationMetadata.playerSelection, false)
  assert.equal(X.derivationMetadata.playerRanking, false)
  assert.equal(X.derivationMetadata.playerScoring, false)
  assert.equal(X.derivationMetadata.teamRecommendation, false)
  assert.equal(X.derivationMetadata.trainingRecommendation, false)
  assert.equal(X.derivationMetadata.generatesTrainingContent, false)
  assert.equal(X.derivationMetadata.analysesSessions, false)
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaCrossDomainIntelligenceInputs(SEL, TRN), serializeCoachDnaCrossDomainIntelligenceInputs(SEL, TRN))
  assert.equal(buildCoachDnaCrossDomainIntelligenceInputs(SEL, TRN).crossDomainFingerprint, X.crossDomainFingerprint)
})

test('the cross-domain fingerprint changes when a domain is omitted', () => {
  const both = buildCoachDnaCrossDomainIntelligenceInputs(SEL, TRN).crossDomainFingerprint
  const selOnly = buildCoachDnaCrossDomainIntelligenceInputs(SEL).crossDomainFingerprint
  const trnOnly = buildCoachDnaCrossDomainIntelligenceInputs(undefined, TRN).crossDomainFingerprint
  assert.notEqual(both, selOnly)
  assert.notEqual(both, trnOnly)
  assert.notEqual(selOnly, trnOnly)
})

test('the source summaries are never mutated', () => {
  const sBefore = JSON.parse(JSON.stringify(SEL))
  const tBefore = JSON.parse(JSON.stringify(TRN))
  buildCoachDnaCrossDomainIntelligenceInputs(SEL, TRN)
  assert.deepEqual(JSON.parse(JSON.stringify(SEL)), sBefore)
  assert.deepEqual(JSON.parse(JSON.stringify(TRN)), tBefore)
})

test('the output is deeply frozen, including the embedded summaries', () => {
  assert.ok(Object.isFrozen(X))
  assert.ok(Object.isFrozen(X.selectionSummary))
  assert.ok(Object.isFrozen(X.selectionSummary.selectionStyleSummary))
  assert.ok(Object.isFrozen(X.trainingSummary))
  assert.ok(Object.isFrozen(X.trainingSummary.trainingStyleSummary))
  assert.ok(Object.isFrozen(X.sharedEvidenceOverview))
  assert.ok(Object.isFrozen(X.sharedConfidenceOverview))
  assert.ok(Object.isFrozen(X.provenance))
  assert.ok(Object.isFrozen(X.derivationMetadata))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaCrossDomainIntelligenceInputs(SEL, TRN, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-cross-domain-intelligence-inputs')
  const line = serializeCoachDnaCrossDomainIntelligenceInputs(SEL, TRN, { format: 'line' })
  assert.match(line, /^coach-dna-cross-domain-intelligence-inputs valid=true complete=true domains=2\/2 /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaCrossDomainIntelligenceInputs(SEL, TRN, { format: 'xml' }), /unsupported/)
})

test('the assembly carries no recommendation, player or training-plan language', () => {
  assert.doesNotMatch(serializeCoachDnaCrossDomainIntelligenceInputs(SEL, TRN), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaCrossDomainIntelligenceInputs(SEL, TRN), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaCrossDomainIntelligenceInputs(SEL, TRN), /cross-domain intelligence inputs: complete/)
  assert.match(summarizeCoachDnaCrossDomainIntelligenceInputs(SEL), /cross-domain intelligence inputs: partial/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaCrossDomainIntelligenceInputs, 'function')
  assert.equal(typeof summarizeCoachDnaCrossDomainIntelligenceInputs, 'function')
  assert.equal(typeof serializeCoachDnaCrossDomainIntelligenceInputs, 'function')
})
