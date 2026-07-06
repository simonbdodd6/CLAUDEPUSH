/**
 * web/brain-coach-dna-cross-domain-intelligence-consumer-contract - Coach DNA Cross-Domain Intelligence Consumer Contract (M281) tests
 *
 * Verifies the consumer-safety contract over the M280 query surface: the frozen contract descriptor (allowed
 * methods, response shapes, availability, and the explicit no-player / no-recommendation / no-training-plan /
 * no-session-analysis / no-domain-comparison / no-cross-domain-reasoning boundaries) and the deterministic
 * validator that probes a real surface — passing compliant surfaces (including unusable-but-safe ones), failing
 * non-compliant fakes, never throwing on malformed input, mutating nothing, and reporting byte-identically.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  describeCoachDnaCrossDomainIntelligenceConsumerContract,
  validateCoachDnaCrossDomainIntelligenceConsumer,
  summarizeCoachDnaCrossDomainIntelligenceConsumerValidation,
} from '../web/brain-coach-dna-cross-domain-intelligence-consumer-contract.js'
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

const FORBIDDEN_LANG = /\b(you should|drop him|pick him|best xv|must start|must bench|select him|start him|bench him|do this drill|run this session)\b/i

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
const PROFILE = freeze(JSON.parse(JSON.stringify(buildCoachDnaCrossDomainIntelligenceProfile(buildCoachDnaCrossDomainIntelligenceInputs(selSummaryOf(SEL_VIEW), trnSummaryOf(TRN_VIEW))))))
const INDEX = freeze(JSON.parse(JSON.stringify(buildCoachDnaCrossDomainIntelligenceIndex(PROFILE))))
const SURFACE = createCoachDnaCrossDomainIntelligenceQuery({ profile: PROFILE, index: INDEX })
const CONTRACT = describeCoachDnaCrossDomainIntelligenceConsumerContract()
const V = validateCoachDnaCrossDomainIntelligenceConsumer(SURFACE)

const METHODS = ['isUsable', 'getDomain', 'getEvidence', 'getConfidence', 'getCompleteness', 'getProvenance', 'getValidationState', 'listAvailableDomains']

test('the contract descriptor declares the full public API and every boundary', () => {
  assert.equal(CONTRACT.type, 'coach-dna-cross-domain-intelligence-consumer-contract')
  assert.equal(CONTRACT.contractVersion, 1)
  assert.equal(CONTRACT.sourceMilestone, 'M280')
  assert.deepEqual(CONTRACT.allowedMethods.map((m) => m.name), METHODS)
  for (const k of ['getDomain', 'getEvidence', 'getConfidence', 'getCompleteness', 'getProvenance', 'getValidationState']) {
    assert.ok(Array.isArray(CONTRACT.responseShapes[k]), k)
  }
  for (const b of ['readOnly', 'frozenResponses', 'safeMalformedInput', 'noPlayerData', 'noPlayerEvaluation', 'noPlayerSelection', 'noPlayerScoring', 'noPlayerRanking', 'noTeamRecommendation', 'noTrainingRecommendation', 'noContentGeneration', 'noSessionAnalysis', 'noPrediction', 'noDomainComparison', 'noCrossDomainReasoning']) {
    assert.equal(CONTRACT.boundaries[b], true, b)
  }
  assert.deepEqual(CONTRACT.availability, { provenance: true, evidence: true, confidence: true, completeness: true, validationState: true })
  assert.equal(CONTRACT.derivationMetadata.milestone, 'M281')
  assert.match(CONTRACT.contractFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('a valid M280 surface honours the contract — every check passes', () => {
  assert.equal(V.type, 'coach-dna-cross-domain-intelligence-consumer-contract-validation')
  assert.equal(V.valid, true)
  assert.equal(V.surfaceUsable, true)
  assert.equal(V.failedChecks, 0)
  assert.equal(V.passedChecks, V.totalChecks)
  assert.deepEqual(V.errors, [])
  assert.equal(V.contractFingerprint, CONTRACT.contractFingerprint)
  assert.match(V.validationFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('required methods are individually checked and reported', () => {
  for (const m of METHODS) {
    const check = V.checks.find((c) => c.name === `method:${m}`)
    assert.ok(check, m)
    assert.equal(check.pass, true, m)
  }
})

test('frozen-response and safe-null checks are part of the report', () => {
  for (const name of ['returns-frozen-object:getEvidence', 'returns-frozen-object:getConfidence', 'returns-frozen-object:getCompleteness', 'returns-frozen-object:getProvenance', 'returns-frozen-object:getValidationState', 'domain-frozen-or-null:selection', 'domain-frozen-or-null:training', 'available-domains-frozen-array', 'safe-unknown-domain-null', 'safe-nonstring-domain-null', 'safe-unknown-evidence-null', 'safe-unknown-confidence-null']) {
    const check = V.checks.find((c) => c.name === name)
    assert.ok(check, name)
    assert.equal(check.pass, true, name)
  }
})

test('availability of provenance, evidence, confidence, completeness and validation state is verified', () => {
  assert.deepEqual(V.availability, { provenance: true, evidence: true, confidence: true, completeness: true, validationState: true })
  for (const name of ['provenance-available', 'evidence-available', 'confidence-available', 'completeness-available', 'validation-state-available']) {
    assert.equal(V.checks.find((c) => c.name === name).pass, true, name)
  }
})

test('the no-player, no-recommendation and no-comparison boundaries are verified over real responses', () => {
  assert.deepEqual(V.boundaries, {
    noPlayerData: true,
    noTrainingRecommendation: true,
    noContentGeneration: true,
    noSessionAnalysis: true,
    noDomainComparison: true,
    noCrossDomainReasoning: true,
  })
  for (const name of ['no-player-data', 'no-recommendation-content-session-analysis', 'no-domain-comparison-or-reasoning']) {
    assert.equal(V.checks.find((c) => c.name === name).pass, true, name)
  }
})

test('profile, index and pair inputs validate identically', () => {
  const vp = validateCoachDnaCrossDomainIntelligenceConsumer(PROFILE)
  const vi = validateCoachDnaCrossDomainIntelligenceConsumer(INDEX)
  const vpair = validateCoachDnaCrossDomainIntelligenceConsumer({ profile: PROFILE, index: INDEX })
  assert.equal(vp.valid, true)
  assert.equal(vi.valid, true)
  assert.equal(vp.validationFingerprint, vi.validationFingerprint)
  assert.equal(vp.validationFingerprint, vpair.validationFingerprint)
  assert.equal(vp.validationFingerprint, V.validationFingerprint)
})

test('malformed inputs yield a compliant-but-unusable surface — contract honoured, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, [], { type: 'wrong' }]) {
    let v
    assert.doesNotThrow(() => { v = validateCoachDnaCrossDomainIntelligenceConsumer(bad) })
    // the resolver builds a REAL (empty) M280 surface, which still honours every behavioural guarantee
    assert.equal(v.valid, true)
    assert.equal(v.surfaceUsable, false)
  }
})

test('a non-compliant fake surface is failed with named checks', () => {
  const fake = {
    isUsable: () => true,
    getDomain: () => ({ unfrozen: true }),            // unfrozen response
    getValidationState: () => { throw new Error('boom') }, // throwing getter
  }
  const v = validateCoachDnaCrossDomainIntelligenceConsumer(fake)
  assert.equal(v.valid, false)
  assert.ok(v.failedChecks > 0)
  assert.ok(v.errors.includes('method:getEvidence'))
  assert.ok(v.errors.includes('method:listAvailableDomains'))
  assert.ok(v.errors.includes('returns-frozen-object:getValidationState'))
  assert.ok(v.errors.includes('safe-unknown-domain-null'))
  assert.match(summarizeCoachDnaCrossDomainIntelligenceConsumerValidation(fake), /VIOLATED/)
})

test('validation reports are byte-identical across repeated runs (deterministic)', () => {
  const a = validateCoachDnaCrossDomainIntelligenceConsumer(SURFACE)
  const b = validateCoachDnaCrossDomainIntelligenceConsumer(SURFACE)
  assert.equal(JSON.stringify(a), JSON.stringify(b))
  assert.equal(a.validationFingerprint, V.validationFingerprint)
  assert.equal(describeCoachDnaCrossDomainIntelligenceConsumerContract().contractFingerprint, CONTRACT.contractFingerprint)
})

test('the contract descriptor and validation reports are deeply frozen', () => {
  assert.ok(Object.isFrozen(CONTRACT))
  assert.ok(Object.isFrozen(CONTRACT.allowedMethods))
  assert.ok(Object.isFrozen(CONTRACT.boundaries))
  assert.ok(Object.isFrozen(V))
  assert.ok(Object.isFrozen(V.checks))
  assert.ok(Object.isFrozen(V.checks[0]))
  assert.ok(Object.isFrozen(V.availability))
  assert.ok(Object.isFrozen(V.boundaries))
})

test('the source profile and index are never mutated by validation', () => {
  const pBefore = JSON.parse(JSON.stringify(PROFILE))
  const iBefore = JSON.parse(JSON.stringify(INDEX))
  validateCoachDnaCrossDomainIntelligenceConsumer({ profile: PROFILE, index: INDEX })
  assert.deepEqual(JSON.parse(JSON.stringify(PROFILE)), pBefore)
  assert.deepEqual(JSON.parse(JSON.stringify(INDEX)), iBefore)
})

test('contract and report carry no player, recommendation or comparison language', () => {
  const all = JSON.stringify([CONTRACT, V]) + summarizeCoachDnaCrossDomainIntelligenceConsumerValidation(SURFACE)
  assert.doesNotMatch(all, FORBIDDEN_LANG)
  assert.doesNotMatch(all, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(all, /\b(better than|worse than|outperform\w*)\b/i)
  assert.match(summarizeCoachDnaCrossDomainIntelligenceConsumerValidation(SURFACE), /HONOURED/)
})

test('exports exist', () => {
  assert.equal(typeof describeCoachDnaCrossDomainIntelligenceConsumerContract, 'function')
  assert.equal(typeof validateCoachDnaCrossDomainIntelligenceConsumer, 'function')
  assert.equal(typeof summarizeCoachDnaCrossDomainIntelligenceConsumerValidation, 'function')
})
