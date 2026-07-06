/**
 * web/brain-coach-dna-cross-domain-intelligence-profile - Coach DNA Cross-Domain Intelligence Profile (M278) tests
 *
 * Verifies the stable cross-domain profile: it folds the M277 assembly into one immutable profile (per-domain
 * summary inventory, verbatim evidence/confidence overviews, explicit completeness state) WITHOUT comparing the
 * domains, combining their figures or creating any new intelligence. It handles partial and malformed inputs
 * with null-safe slots, contains NO player data, makes NO recommendation, preserves both provenance chains,
 * never mutates inputs, and is deeply frozen and byte-deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaCrossDomainIntelligenceProfile,
  summarizeCoachDnaCrossDomainIntelligenceProfile,
  serializeCoachDnaCrossDomainIntelligenceProfile,
} from '../web/brain-coach-dna-cross-domain-intelligence-profile.js'
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
const SEL = selSummaryOf(SEL_VIEW)
const TRN = trnSummaryOf(TRN_VIEW)
const FULL_INPUTS = freeze(JSON.parse(JSON.stringify(buildCoachDnaCrossDomainIntelligenceInputs(SEL, TRN))))
const PARTIAL_INPUTS = freeze(JSON.parse(JSON.stringify(buildCoachDnaCrossDomainIntelligenceInputs(SEL))))
const P = buildCoachDnaCrossDomainIntelligenceProfile(FULL_INPUTS)

test('valid cross-domain inputs produce the full profile shape', () => {
  assert.equal(P.type, 'coach-dna-cross-domain-intelligence-profile')
  assert.equal(P.schemaVersion, 1)
  assert.equal(P.profileVersion, 'cross-domain-intelligence-profile-v1')
  assert.equal(P.milestone, 'M278')
  assert.equal(P.crossDomainInputsFingerprint, FULL_INPUTS.crossDomainFingerprint)
  assert.equal(P.validationState.usable, true)
  for (const k of ['domainSummary', 'evidenceOverview', 'confidenceOverview', 'completenessState', 'provenance', 'validationState', 'derivationMetadata']) {
    assert.ok(isObj(P[k]), k)
  }
  assert.match(P.profileFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }

test('the domain summary inventories both domains in fixed order (selection, training)', () => {
  assert.equal(P.domainSummary.totalDomains, 2)
  assert.equal(P.domainSummary.includedDomains, 2)
  assert.equal(P.domainSummary.usableDomains, 2)
  const [sel, trn] = P.domainSummary.domains
  assert.deepEqual(sel, {
    domain: 'selection', sourceMilestone: 'M268', included: true, usable: true,
    summaryFingerprint: SEL.summaryFingerprint, readiness: 'partial',
    presentCharacteristics: 3, totalCharacteristics: 5, strongestCharacteristic: 'selectionEmphasis', unknownCount: 2,
  })
  assert.deepEqual(trn, {
    domain: 'training', sourceMilestone: 'M276', included: true, usable: true,
    summaryFingerprint: TRN.summaryFingerprint, readiness: 'partial',
    presentCharacteristics: 4, totalCharacteristics: 6, strongestCharacteristic: 'sessionStructure', unknownCount: 2,
  })
})

test('the evidence and confidence overviews are copied verbatim from M277 — no totals, no comparison', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(P.evidenceOverview)), JSON.parse(JSON.stringify(FULL_INPUTS.sharedEvidenceOverview)))
  assert.deepEqual(JSON.parse(JSON.stringify(P.confidenceOverview)), JSON.parse(JSON.stringify(FULL_INPUTS.sharedConfidenceOverview)))
  assert.deepEqual(Object.keys(P.evidenceOverview).sort(), ['selection', 'training'])
  assert.deepEqual(Object.keys(P.confidenceOverview).sort(), ['selection', 'training'])
})

test('the completeness state is explicit for a complete assembly', () => {
  assert.deepEqual(P.completenessState, {
    complete: true, level: 'complete', usableDomains: 2, totalDomains: 2, missingDomains: [],
  })
})

test('the profile declares itself assembly-only — no comparison, no new intelligence', () => {
  assert.equal(P.derivationMetadata.milestone, 'M278')
  assert.equal(P.derivationMetadata.domain, 'cross-domain')
  assert.equal(P.derivationMetadata.layer, 'profile')
  assert.equal(P.derivationMetadata.derivedFrom, 'coach-dna-cross-domain-intelligence-inputs')
  assert.equal(P.derivationMetadata.sourceMilestone, 'M277')
  assert.equal(P.derivationMetadata.assemblyOnly, true)
  assert.equal(P.derivationMetadata.comparesDomains, false)
  assert.equal(P.derivationMetadata.createsNewIntelligence, false)
  assert.equal(P.derivationMetadata.deterministic, true)
  assert.equal(P.derivationMetadata.llmGenerated, false)
  assert.equal(P.derivationMetadata.dormant, true)
})

test('partial inputs (training missing) yield a partial profile with null-safe slots', () => {
  const p = buildCoachDnaCrossDomainIntelligenceProfile(PARTIAL_INPUTS)
  assert.equal(p.validationState.usable, true)
  assert.equal(p.completenessState.level, 'partial')
  assert.equal(p.completenessState.complete, false)
  assert.deepEqual(p.completenessState.missingDomains, ['training'])
  const trn = p.domainSummary.domains[1]
  assert.equal(trn.included, false)
  assert.equal(trn.usable, false)
  assert.equal(trn.summaryFingerprint, null)
  assert.equal(trn.readiness, 'unknown')
  assert.equal(trn.presentCharacteristics, null)
  assert.equal(p.evidenceOverview.training, null)
  assert.equal(p.confidenceOverview.training, null)
  assert.deepEqual(p.validationState.sourceIssues, ['training summary missing or malformed'])
})

test('malformed inputs fail safe — unusable, empty, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let p
    assert.doesNotThrow(() => { p = buildCoachDnaCrossDomainIntelligenceProfile(bad) })
    assert.equal(p.validationState.usable, false)
    assert.equal(p.completenessState.level, 'empty')
    assert.equal(p.crossDomainInputsFingerprint, null)
    assert.deepEqual(p.validationState.issues, ['cross-domain inputs missing or malformed'])
    assert.equal(p.domainSummary.usableDomains, 0)
    assert.equal(p.evidenceOverview.selection, null)
    assert.equal(p.confidenceOverview.training, null)
  }
})

test('provenance preserves the M277 fingerprint and both domain chains', () => {
  assert.equal(P.provenance.source, 'coach-dna-cross-domain-intelligence-inputs')
  assert.equal(P.provenance.sourceMilestone, 'M277')
  assert.equal(P.provenance.crossDomainInputsFingerprint, FULL_INPUTS.crossDomainFingerprint)
  assert.equal(P.provenance.selection.sourceMilestone, 'M268')
  assert.equal(P.provenance.selection.summaryFingerprint, SEL.summaryFingerprint)
  assert.deepEqual(P.provenance.selection.chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M261', 'M262', 'M263'])
  assert.equal(P.provenance.training.sourceMilestone, 'M276')
  assert.equal(P.provenance.training.summaryFingerprint, TRN.summaryFingerprint)
  assert.deepEqual(P.provenance.training.chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M269', 'M270', 'M271'])
})

test('contains NO player data and NO recommendation/scoring/ranking flags', () => {
  const json = JSON.stringify(P)
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(json, FORBIDDEN_LANG)
  assert.equal(P.derivationMetadata.containsPlayerData, false)
  assert.equal(P.derivationMetadata.playerEvaluation, false)
  assert.equal(P.derivationMetadata.playerSelection, false)
  assert.equal(P.derivationMetadata.playerRanking, false)
  assert.equal(P.derivationMetadata.playerScoring, false)
  assert.equal(P.derivationMetadata.teamRecommendation, false)
  assert.equal(P.derivationMetadata.trainingRecommendation, false)
  assert.equal(P.derivationMetadata.generatesTrainingContent, false)
  assert.equal(P.derivationMetadata.analysesSessions, false)
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaCrossDomainIntelligenceProfile(FULL_INPUTS), serializeCoachDnaCrossDomainIntelligenceProfile(FULL_INPUTS))
  assert.equal(buildCoachDnaCrossDomainIntelligenceProfile(FULL_INPUTS).profileFingerprint, P.profileFingerprint)
})

test('the profile fingerprint tracks the inputs fingerprint', () => {
  const full = buildCoachDnaCrossDomainIntelligenceProfile(FULL_INPUTS)
  const partial = buildCoachDnaCrossDomainIntelligenceProfile(PARTIAL_INPUTS)
  assert.notEqual(full.profileFingerprint, partial.profileFingerprint)
  assert.equal(full.crossDomainInputsFingerprint, FULL_INPUTS.crossDomainFingerprint)
  assert.equal(partial.crossDomainInputsFingerprint, PARTIAL_INPUTS.crossDomainFingerprint)
  assert.notEqual(full.crossDomainInputsFingerprint, partial.crossDomainInputsFingerprint)
})

test('the source inputs are never mutated', () => {
  const before = JSON.parse(JSON.stringify(FULL_INPUTS))
  buildCoachDnaCrossDomainIntelligenceProfile(FULL_INPUTS)
  assert.deepEqual(JSON.parse(JSON.stringify(FULL_INPUTS)), before)
})

test('the output is deeply frozen', () => {
  assert.ok(Object.isFrozen(P))
  assert.ok(Object.isFrozen(P.domainSummary))
  assert.ok(Object.isFrozen(P.domainSummary.domains))
  assert.ok(Object.isFrozen(P.domainSummary.domains[0]))
  assert.ok(Object.isFrozen(P.evidenceOverview))
  assert.ok(Object.isFrozen(P.confidenceOverview.selection))
  assert.ok(Object.isFrozen(P.completenessState))
  assert.ok(Object.isFrozen(P.provenance))
  assert.ok(Object.isFrozen(P.derivationMetadata))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaCrossDomainIntelligenceProfile(FULL_INPUTS, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-cross-domain-intelligence-profile')
  const line = serializeCoachDnaCrossDomainIntelligenceProfile(FULL_INPUTS, { format: 'line' })
  assert.match(line, /^coach-dna-cross-domain-intelligence-profile usable=true completeness=complete domains=2\/2 /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaCrossDomainIntelligenceProfile(FULL_INPUTS, { format: 'xml' }), /unsupported/)
})

test('the profile carries no recommendation, player or training-plan language', () => {
  assert.doesNotMatch(serializeCoachDnaCrossDomainIntelligenceProfile(FULL_INPUTS), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaCrossDomainIntelligenceProfile(FULL_INPUTS), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaCrossDomainIntelligenceProfile(FULL_INPUTS), /cross-domain intelligence profile: complete/)
  assert.match(summarizeCoachDnaCrossDomainIntelligenceProfile(PARTIAL_INPUTS), /cross-domain intelligence profile: partial/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaCrossDomainIntelligenceProfile, 'function')
  assert.equal(typeof summarizeCoachDnaCrossDomainIntelligenceProfile, 'function')
  assert.equal(typeof serializeCoachDnaCrossDomainIntelligenceProfile, 'function')
})
