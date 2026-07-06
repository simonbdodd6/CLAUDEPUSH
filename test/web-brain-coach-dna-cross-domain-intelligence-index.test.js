/**
 * web/brain-coach-dna-cross-domain-intelligence-index - Coach DNA Cross-Domain Intelligence Index (M279) tests
 *
 * Verifies the cross-domain navigation layer: it re-keys the M278 profile into total O(1) lookup surfaces
 * (domainIndex, evidenceIndex, confidenceIndex, provenanceIndex) WITHOUT comparing the domains, combining their
 * figures or creating any new intelligence. Both domain keys always exist (usable or not), partial and
 * malformed profiles fail safe with null-safe entries, it contains NO player data, makes NO recommendation,
 * preserves the full provenance (cross-domain chain, byDomain chains, byMilestone fingerprints), never mutates
 * inputs, and is deeply frozen and byte-deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaCrossDomainIntelligenceIndex,
  summarizeCoachDnaCrossDomainIntelligenceIndex,
  serializeCoachDnaCrossDomainIntelligenceIndex,
} from '../web/brain-coach-dna-cross-domain-intelligence-index.js'
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
const FULL_PROFILE = freeze(JSON.parse(JSON.stringify(buildCoachDnaCrossDomainIntelligenceProfile(buildCoachDnaCrossDomainIntelligenceInputs(SEL, TRN)))))
const PARTIAL_PROFILE = freeze(JSON.parse(JSON.stringify(buildCoachDnaCrossDomainIntelligenceProfile(buildCoachDnaCrossDomainIntelligenceInputs(SEL)))))
const I = buildCoachDnaCrossDomainIntelligenceIndex(FULL_PROFILE)

test('a valid profile produces the full index shape', () => {
  assert.equal(I.type, 'coach-dna-cross-domain-intelligence-index')
  assert.equal(I.schemaVersion, 1)
  assert.equal(I.indexVersion, 1)
  assert.equal(I.milestone, 'M279')
  assert.equal(I.profileFingerprint, FULL_PROFILE.profileFingerprint)
  assert.equal(I.validationState.profileUsable, true)
  for (const k of ['domainIndex', 'evidenceIndex', 'confidenceIndex', 'provenanceIndex', 'validationState', 'derivationMetadata']) {
    assert.ok(isObj(I[k]), k)
  }
  assert.match(I.indexFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }

test('the domain index is total and keyed — O(1) lookup for both domains', () => {
  assert.deepEqual(Object.keys(I.domainIndex), ['selection', 'training'])
  assert.deepEqual(I.domainIndex.selection, {
    domain: 'selection', sourceMilestone: 'M268', included: true, usable: true,
    summaryFingerprint: SEL.summaryFingerprint, readiness: 'partial',
    presentCharacteristics: 3, totalCharacteristics: 5, strongestCharacteristic: 'selectionEmphasis', unknownCount: 2,
  })
  assert.deepEqual(I.domainIndex.training, {
    domain: 'training', sourceMilestone: 'M276', included: true, usable: true,
    summaryFingerprint: TRN.summaryFingerprint, readiness: 'partial',
    presentCharacteristics: 4, totalCharacteristics: 6, strongestCharacteristic: 'sessionStructure', unknownCount: 2,
  })
})

test('the evidence and confidence indexes re-key the M278 overviews verbatim — no totals, no comparison', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(I.evidenceIndex.byDomain)), JSON.parse(JSON.stringify(FULL_PROFILE.evidenceOverview)))
  assert.deepEqual(JSON.parse(JSON.stringify(I.confidenceIndex.byDomain)), JSON.parse(JSON.stringify(FULL_PROFILE.confidenceOverview)))
  assert.deepEqual(Object.keys(I.evidenceIndex.byDomain), ['selection', 'training'])
  assert.deepEqual(Object.keys(I.confidenceIndex.byDomain), ['selection', 'training'])
  assert.deepEqual(Object.keys(I.evidenceIndex), ['byDomain'])
  assert.deepEqual(Object.keys(I.confidenceIndex), ['byDomain'])
})

test('the provenance index carries the cross-domain chain, both domain chains and byMilestone fingerprints', () => {
  assert.deepEqual(I.provenanceIndex.chain, ['M277', 'M278', 'M279'])
  assert.equal(I.provenanceIndex.profileFingerprint, FULL_PROFILE.profileFingerprint)
  assert.equal(I.provenanceIndex.crossDomainInputsFingerprint, FULL_PROFILE.crossDomainInputsFingerprint)
  assert.deepEqual(I.provenanceIndex.byDomain.selection.chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M261', 'M262', 'M263'])
  assert.deepEqual(I.provenanceIndex.byDomain.training.chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M269', 'M270', 'M271'])
  assert.deepEqual(I.provenanceIndex.byMilestone.M268, { milestone: 'M268', role: 'selection-intelligence-summary', fingerprint: SEL.summaryFingerprint })
  assert.deepEqual(I.provenanceIndex.byMilestone.M276, { milestone: 'M276', role: 'training-intelligence-summary', fingerprint: TRN.summaryFingerprint })
  assert.equal(I.provenanceIndex.byMilestone.M277.fingerprint, FULL_PROFILE.crossDomainInputsFingerprint)
  assert.equal(I.provenanceIndex.byMilestone.M278.fingerprint, FULL_PROFILE.profileFingerprint)
})

test('the index declares itself assembly-only — no comparison, no new intelligence', () => {
  assert.equal(I.derivationMetadata.milestone, 'M279')
  assert.equal(I.derivationMetadata.domain, 'cross-domain')
  assert.equal(I.derivationMetadata.layer, 'index')
  assert.equal(I.derivationMetadata.derivedFrom, 'coach-dna-cross-domain-intelligence-profile')
  assert.equal(I.derivationMetadata.sourceMilestone, 'M278')
  assert.equal(I.derivationMetadata.assemblyOnly, true)
  assert.equal(I.derivationMetadata.comparesDomains, false)
  assert.equal(I.derivationMetadata.createsNewIntelligence, false)
  assert.equal(I.derivationMetadata.deterministic, true)
  assert.equal(I.derivationMetadata.llmGenerated, false)
  assert.equal(I.derivationMetadata.dormant, true)
})

test('a partial profile (training missing) keeps the training key with an absent entry', () => {
  const x = buildCoachDnaCrossDomainIntelligenceIndex(PARTIAL_PROFILE)
  assert.equal(x.validationState.profileUsable, true)
  assert.equal(x.validationState.completenessLevel, 'partial')
  assert.equal(x.validationState.usableDomains, 1)
  const trn = x.domainIndex.training
  assert.equal(trn.included, false)
  assert.equal(trn.usable, false)
  assert.equal(trn.summaryFingerprint, null)
  assert.equal(trn.readiness, 'unknown')
  assert.equal(trn.presentCharacteristics, null)
  assert.equal(x.evidenceIndex.byDomain.training, null)
  assert.equal(x.confidenceIndex.byDomain.training, null)
  assert.equal(x.provenanceIndex.byMilestone.M276.fingerprint, null)
  // the selection side remains fully indexed
  assert.equal(x.domainIndex.selection.usable, true)
  assert.equal(x.provenanceIndex.byMilestone.M268.fingerprint, SEL.summaryFingerprint)
})

test('malformed profiles fail safe — unusable, empty, total keys, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let x
    assert.doesNotThrow(() => { x = buildCoachDnaCrossDomainIntelligenceIndex(bad) })
    assert.equal(x.validationState.profileUsable, false)
    assert.equal(x.validationState.completenessLevel, 'empty')
    assert.equal(x.profileFingerprint, null)
    assert.deepEqual(x.validationState.issues, ['cross-domain profile missing or malformed'])
    // the index stays total — both domain keys exist with absent entries
    assert.deepEqual(Object.keys(x.domainIndex), ['selection', 'training'])
    assert.equal(x.domainIndex.selection.included, false)
    assert.equal(x.domainIndex.training.readiness, 'unknown')
    assert.equal(x.evidenceIndex.byDomain.selection, null)
    assert.equal(x.provenanceIndex.byDomain.training, null)
  }
})

test('contains NO player data and NO recommendation/scoring/ranking flags', () => {
  const json = JSON.stringify(I)
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(json, FORBIDDEN_LANG)
  assert.equal(I.derivationMetadata.containsPlayerData, false)
  assert.equal(I.derivationMetadata.playerEvaluation, false)
  assert.equal(I.derivationMetadata.playerSelection, false)
  assert.equal(I.derivationMetadata.playerRanking, false)
  assert.equal(I.derivationMetadata.playerScoring, false)
  assert.equal(I.derivationMetadata.teamRecommendation, false)
  assert.equal(I.derivationMetadata.trainingRecommendation, false)
  assert.equal(I.derivationMetadata.generatesTrainingContent, false)
  assert.equal(I.derivationMetadata.analysesSessions, false)
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaCrossDomainIntelligenceIndex(FULL_PROFILE), serializeCoachDnaCrossDomainIntelligenceIndex(FULL_PROFILE))
  assert.equal(buildCoachDnaCrossDomainIntelligenceIndex(FULL_PROFILE).indexFingerprint, I.indexFingerprint)
})

test('the index fingerprint tracks the profile fingerprint', () => {
  const full = buildCoachDnaCrossDomainIntelligenceIndex(FULL_PROFILE)
  const partial = buildCoachDnaCrossDomainIntelligenceIndex(PARTIAL_PROFILE)
  assert.notEqual(full.indexFingerprint, partial.indexFingerprint)
  assert.equal(full.profileFingerprint, FULL_PROFILE.profileFingerprint)
  assert.equal(partial.profileFingerprint, PARTIAL_PROFILE.profileFingerprint)
  assert.notEqual(full.profileFingerprint, partial.profileFingerprint)
})

test('the source profile is never mutated', () => {
  const before = JSON.parse(JSON.stringify(FULL_PROFILE))
  buildCoachDnaCrossDomainIntelligenceIndex(FULL_PROFILE)
  assert.deepEqual(JSON.parse(JSON.stringify(FULL_PROFILE)), before)
})

test('the output is deeply frozen', () => {
  assert.ok(Object.isFrozen(I))
  assert.ok(Object.isFrozen(I.domainIndex))
  assert.ok(Object.isFrozen(I.domainIndex.selection))
  assert.ok(Object.isFrozen(I.evidenceIndex.byDomain))
  assert.ok(Object.isFrozen(I.confidenceIndex.byDomain.training))
  assert.ok(Object.isFrozen(I.provenanceIndex))
  assert.ok(Object.isFrozen(I.provenanceIndex.byMilestone.M277))
  assert.ok(Object.isFrozen(I.derivationMetadata))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaCrossDomainIntelligenceIndex(FULL_PROFILE, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-cross-domain-intelligence-index')
  const line = serializeCoachDnaCrossDomainIntelligenceIndex(FULL_PROFILE, { format: 'line' })
  assert.match(line, /^coach-dna-cross-domain-intelligence-index usable=true domains=2\/2 completeness=complete /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaCrossDomainIntelligenceIndex(FULL_PROFILE, { format: 'xml' }), /unsupported/)
})

test('the index carries no recommendation, player or training-plan language', () => {
  assert.doesNotMatch(serializeCoachDnaCrossDomainIntelligenceIndex(FULL_PROFILE), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaCrossDomainIntelligenceIndex(FULL_PROFILE), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaCrossDomainIntelligenceIndex(FULL_PROFILE), /cross-domain intelligence index: queryable/)
  assert.match(summarizeCoachDnaCrossDomainIntelligenceIndex('x'), /cross-domain intelligence index: unusable source/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaCrossDomainIntelligenceIndex, 'function')
  assert.equal(typeof summarizeCoachDnaCrossDomainIntelligenceIndex, 'function')
  assert.equal(typeof serializeCoachDnaCrossDomainIntelligenceIndex, 'function')
})
