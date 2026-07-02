/**
 * web/brain-coach-dna-training-intelligence-consumer-contract - Coach DNA Training Intelligence Consumer Contract (M273) tests
 *
 * Verifies the training consumer-safety contract: it describes the allowed M272 query methods, response shapes
 * and the no-player-data / no-training-recommendation / no-content-generation / no-session-analysis boundaries,
 * and validates that a surface honours that contract — a genuine M272 surface passes (even empty), a
 * non-compliant fake is rejected, malformed inputs are handled safely, responses are frozen, output is
 * deterministic, and inputs are never mutated.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  describeCoachDnaTrainingIntelligenceConsumerContract,
  validateCoachDnaTrainingIntelligenceConsumer,
  summarizeCoachDnaTrainingIntelligenceConsumerValidation,
} from '../web/brain-coach-dna-training-intelligence-consumer-contract.js'
import { createCoachDnaTrainingIntelligenceQuery } from '../web/brain-coach-dna-training-intelligence-query.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaTrainingIntelligenceInputs } from '../web/brain-coach-dna-training-intelligence-inputs.js'
import { buildCoachDnaTrainingIntelligenceProfile } from '../web/brain-coach-dna-training-intelligence-profile.js'

const FORBIDDEN_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv|predict|forecast|ranking|ranked|scored)\b/i

function freeze(o) {
  if (o && typeof o === 'object') { for (const k of Object.keys(o)) freeze(o[k]); Object.freeze(o) }
  return o
}
const FULL_VIEW = freeze({
  profileVersion: 'coach-dna-v3',
  confidence: { value: 0.72, level: 'HIGH', label: 'High' },
  headline: 'Training-led',
  identity: { strongestCategory: 'training-preference', strongestLabel: 'Training', weakestCategory: 'risk-warning', weakestLabel: 'Risk warnings', diversityScore: 0.5, diversityLabel: 'Balanced' },
  dominantSignals: [{ category: 'training-preference', label: 'Training', occurrences: 8, strength: 0.85, averageConfidence: 0.8, averageWeight: 0.65, supportingCount: 6 }],
  themes: [{ type: 'training-preference', label: 'Training', count: 8, averageConfidence: 0.8, averageWeight: 0.65 }],
  knowledge: { totalMemories: 13, uniqueTypes: 4, averageConfidence: 0.7, averageWeight: 0.6, totalEvidence: 21, totalOntologyLinks: 8 },
  summary: 'A training-led coach.',
  metadata: { explainable: true, deterministic: true, llmGenerated: false },
})
const PROFILE = freeze(JSON.parse(JSON.stringify(buildCoachDnaTrainingIntelligenceProfile(buildCoachDnaTrainingIntelligenceInputs(createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(FULL_VIEW))))))))
const SURFACE = createCoachDnaTrainingIntelligenceQuery(PROFILE)

test('the contract descriptor lists allowed methods, shapes and the four domain boundaries', () => {
  const c = describeCoachDnaTrainingIntelligenceConsumerContract()
  assert.equal(c.type, 'coach-dna-training-intelligence-consumer-contract')
  assert.equal(c.sourceMilestone, 'M272')
  assert.deepEqual(c.allowedMethods.map((m) => m.name), ['isUsable', 'getTrainingLens', 'getEvidence', 'getConfidence', 'getCoverage', 'getProvenance', 'getValidationState', 'listAvailableLenses'])
  assert.equal(c.boundaries.noPlayerData, true)
  assert.equal(c.boundaries.noTrainingRecommendation, true)
  assert.equal(c.boundaries.noContentGeneration, true)
  assert.equal(c.boundaries.noSessionAnalysis, true)
  assert.equal(c.availability.provenance, true)
  assert.match(c.contractFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.allowedMethods))
})

test('a valid M272 surface honours the contract', () => {
  const v = validateCoachDnaTrainingIntelligenceConsumer(SURFACE)
  assert.equal(v.valid, true)
  assert.equal(v.surfaceUsable, true)
  assert.equal(v.failedChecks, 0)
  assert.deepEqual(v.errors, [])
  assert.equal(v.availability.provenance, true)
  assert.equal(v.availability.evidence, true)
  assert.equal(v.availability.confidence, true)
  assert.equal(v.availability.validationState, true)
  assert.equal(v.boundaries.noPlayerData, true)
  assert.equal(v.boundaries.noTrainingRecommendation, true)
  assert.equal(v.boundaries.noContentGeneration, true)
  assert.equal(v.boundaries.noSessionAnalysis, true)
})

test('all required methods are checked present', () => {
  const v = validateCoachDnaTrainingIntelligenceConsumer(SURFACE)
  for (const m of ['isUsable', 'getTrainingLens', 'getEvidence', 'getConfidence', 'getCoverage', 'getProvenance', 'getValidationState', 'listAvailableLenses']) {
    const check = v.checks.find((c) => c.name === `method:${m}`)
    assert.ok(check && check.pass, m)
  }
})

test('a contract validation can be built straight from a profile or index', () => {
  const v = validateCoachDnaTrainingIntelligenceConsumer(PROFILE)
  assert.equal(v.valid, true)
  assert.equal(v.surfaceUsable, true)
})

test('an empty/malformed-data surface still honours the contract (valid, not usable)', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, { type: 'wrong' }]) {
    const v = validateCoachDnaTrainingIntelligenceConsumer(bad)
    assert.equal(v.valid, true, JSON.stringify(bad))
    assert.equal(v.surfaceUsable, false, JSON.stringify(bad))
  }
})

test('safe null responses for unknown keys are required and verified', () => {
  const v = validateCoachDnaTrainingIntelligenceConsumer(SURFACE)
  assert.ok(v.checks.find((c) => c.name === 'safe-unknown-lens-null').pass)
  assert.ok(v.checks.find((c) => c.name === 'safe-nonstring-lens-null').pass)
  assert.ok(v.checks.find((c) => c.name === 'safe-unknown-evidence-null').pass)
  assert.ok(v.checks.find((c) => c.name === 'safe-unknown-confidence-null').pass)
})

test('a non-compliant fake surface is rejected', () => {
  const fake = {
    isUsable: () => true,
    getTrainingLens: () => ({ not: 'null' }),          // should be null for unknown keys
    getEvidence: () => ({}),                            // not frozen
    getConfidence: () => ({}),
    getCoverage: () => ({}),
    getProvenance: () => ({}),
    getValidationState: () => 'not-an-object',          // wrong shape
    listAvailableLenses: () => [],
  }
  const v = validateCoachDnaTrainingIntelligenceConsumer(fake)
  assert.equal(v.valid, false)
  assert.ok(v.errors.includes('safe-unknown-lens-null'))
  assert.ok(v.errors.includes('validation-state-available'))
  assert.ok(v.errors.some((e) => /returns-frozen-object/.test(e)))
})

test('a surface leaking player data is rejected', () => {
  const base = createCoachDnaTrainingIntelligenceQuery(PROFILE)
  const fake = {}
  for (const m of ['isUsable', 'getTrainingLens', 'getEvidence', 'getConfidence', 'getCoverage', 'getProvenance', 'listAvailableLenses']) fake[m] = base[m].bind(base)
  fake.getValidationState = () => Object.freeze({ profileRecognized: true, profileUsable: true, issues: [], playerName: 'Smith' })
  const v = validateCoachDnaTrainingIntelligenceConsumer(fake)
  assert.equal(v.valid, false)
  assert.ok(v.errors.includes('no-player-data'))
  assert.equal(v.boundaries.noPlayerData, false)
})

test('a surface leaking training-content or session-analysis language is rejected', () => {
  const base = createCoachDnaTrainingIntelligenceQuery(PROFILE)
  const fake = {}
  for (const m of ['isUsable', 'getTrainingLens', 'getEvidence', 'getConfidence', 'getProvenance', 'getValidationState', 'listAvailableLenses']) fake[m] = base[m].bind(base)
  fake.getCoverage = () => Object.freeze({ note: 'run this session plan' })
  const v = validateCoachDnaTrainingIntelligenceConsumer(fake)
  assert.equal(v.valid, false)
  assert.ok(v.errors.includes('no-recommendation-content-session-analysis'))
  assert.equal(v.boundaries.noContentGeneration, false)
})

test('a surface leaking recommendation language is rejected', () => {
  const base = createCoachDnaTrainingIntelligenceQuery(PROFILE)
  const fake = {}
  for (const m of ['isUsable', 'getTrainingLens', 'getEvidence', 'getCoverage', 'getProvenance', 'getValidationState', 'listAvailableLenses']) fake[m] = base[m].bind(base)
  fake.getConfidence = () => Object.freeze({ level: 'HIGH', note: 'we recommend more contact work' })
  const v = validateCoachDnaTrainingIntelligenceConsumer(fake)
  assert.equal(v.valid, false)
  assert.ok(v.errors.includes('no-recommendation-content-session-analysis'))
})

test('the validation report and contract responses are frozen', () => {
  const v = validateCoachDnaTrainingIntelligenceConsumer(SURFACE)
  assert.ok(Object.isFrozen(v))
  assert.ok(Object.isFrozen(v.checks))
  assert.ok(Object.isFrozen(v.boundaries))
  assert.ok(Object.isFrozen(describeCoachDnaTrainingIntelligenceConsumerContract()))
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(JSON.stringify(validateCoachDnaTrainingIntelligenceConsumer(SURFACE)), JSON.stringify(validateCoachDnaTrainingIntelligenceConsumer(SURFACE)))
  assert.equal(describeCoachDnaTrainingIntelligenceConsumerContract().contractFingerprint, describeCoachDnaTrainingIntelligenceConsumerContract().contractFingerprint)
  assert.equal(validateCoachDnaTrainingIntelligenceConsumer(PROFILE).validationFingerprint, validateCoachDnaTrainingIntelligenceConsumer(PROFILE).validationFingerprint)
})

test('the source profile is never mutated', () => {
  const before = JSON.parse(JSON.stringify(PROFILE))
  validateCoachDnaTrainingIntelligenceConsumer(PROFILE)
  validateCoachDnaTrainingIntelligenceConsumer(SURFACE)
  assert.deepEqual(JSON.parse(JSON.stringify(PROFILE)), before)
})

test('the descriptor and summary carry no recommendation, ranking or advice language', () => {
  assert.doesNotMatch(JSON.stringify(describeCoachDnaTrainingIntelligenceConsumerContract()), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaTrainingIntelligenceConsumerValidation(SURFACE), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaTrainingIntelligenceConsumerValidation(SURFACE), /training intelligence consumer contract: HONOURED/)
})

test('exports exist', () => {
  assert.equal(typeof describeCoachDnaTrainingIntelligenceConsumerContract, 'function')
  assert.equal(typeof validateCoachDnaTrainingIntelligenceConsumer, 'function')
  assert.equal(typeof summarizeCoachDnaTrainingIntelligenceConsumerValidation, 'function')
})
