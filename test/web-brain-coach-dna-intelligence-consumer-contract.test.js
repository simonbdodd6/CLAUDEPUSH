/**
 * web/brain-coach-dna-intelligence-consumer-contract - Coach DNA Intelligence Consumer Contract (M256) tests
 *
 * Verifies the consumer-safety contract: it describes the allowed M255 query methods, response shapes and the
 * no-recommendation/no-prediction boundary, and validates that a surface honours that contract — a genuine M255
 * surface passes (even with empty data), a non-compliant fake is rejected, malformed inputs are handled safely,
 * responses are frozen, output is deterministic, and inputs are never mutated.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  describeCoachDnaIntelligenceConsumerContract,
  validateCoachDnaIntelligenceConsumer,
  summarizeCoachDnaIntelligenceConsumerValidation,
} from '../web/brain-coach-dna-intelligence-consumer-contract.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'

const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

function freeze(o) {
  if (o && typeof o === 'object') { for (const k of Object.keys(o)) freeze(o[k]); Object.freeze(o) }
  return o
}
const FULL_VIEW = freeze({
  profileVersion: 'coach-dna-v3',
  confidence: { value: 0.72, level: 'HIGH', label: 'High' },
  headline: 'Philosophy focus',
  identity: { strongestCategory: 'philosophy', strongestLabel: 'Philosophy', weakestCategory: 'risk-warning', weakestLabel: 'Risk warnings', diversityScore: 0.5, diversityLabel: 'Balanced' },
  dominantSignals: [{ category: 'philosophy', label: 'Philosophy', occurrences: 6, strength: 0.8, averageConfidence: 0.75, averageWeight: 0.6, supportingCount: 5 }],
  themes: [{ type: 'philosophy', label: 'Philosophy', count: 6, averageConfidence: 0.75, averageWeight: 0.6 }],
  knowledge: { totalMemories: 12, uniqueTypes: 4, averageConfidence: 0.68, averageWeight: 0.57, totalEvidence: 20, totalOntologyLinks: 8 },
  summary: 'A philosophy-led coach.',
  metadata: { explainable: true, deterministic: true, llmGenerated: false },
})
const PROFILE = freeze(JSON.parse(JSON.stringify(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(FULL_VIEW)))))
const SURFACE = createCoachDnaIntelligenceQuery(PROFILE)

test('the contract descriptor lists the allowed methods, shapes and boundaries', () => {
  const c = describeCoachDnaIntelligenceConsumerContract()
  assert.equal(c.type, 'coach-dna-intelligence-consumer-contract')
  assert.equal(c.sourceMilestone, 'M255')
  assert.deepEqual(c.allowedMethods.map((m) => m.name), ['isUsable', 'getSignalGroup', 'getCategory', 'listPresentCategories', 'getCoverage', 'getEvidence', 'getConfidence', 'getProvenance', 'getValidationState'])
  assert.equal(c.boundaries.noRecommendation, true)
  assert.equal(c.boundaries.noPrediction, true)
  assert.equal(c.boundaries.frozenResponses, true)
  assert.equal(c.availability.provenance, true)
  assert.match(c.contractFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.allowedMethods))
})

test('a valid M255 surface honours the contract', () => {
  const v = validateCoachDnaIntelligenceConsumer(SURFACE)
  assert.equal(v.valid, true)
  assert.equal(v.surfaceUsable, true)
  assert.equal(v.failedChecks, 0)
  assert.deepEqual(v.errors, [])
  assert.equal(v.availability.provenance, true)
  assert.equal(v.availability.coverage, true)
  assert.equal(v.availability.confidence, true)
  assert.equal(v.availability.validationState, true)
})

test('all required methods are checked present', () => {
  const v = validateCoachDnaIntelligenceConsumer(SURFACE)
  for (const m of ['isUsable', 'getSignalGroup', 'getCategory', 'listPresentCategories', 'getCoverage', 'getEvidence', 'getConfidence', 'getProvenance', 'getValidationState']) {
    const check = v.checks.find((c) => c.name === `method:${m}`)
    assert.ok(check && check.pass, m)
  }
})

test('a contract validation can be built straight from a profile or index', () => {
  const v = validateCoachDnaIntelligenceConsumer(PROFILE)
  assert.equal(v.valid, true)
  assert.equal(v.surfaceUsable, true)
})

test('an empty/malformed-data surface still honours the contract (valid, not usable)', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, { type: 'wrong' }]) {
    const v = validateCoachDnaIntelligenceConsumer(bad)
    assert.equal(v.valid, true, JSON.stringify(bad))       // contract behaviour holds even with no data
    assert.equal(v.surfaceUsable, false, JSON.stringify(bad))
  }
})

test('safe null/empty responses are required and verified', () => {
  const v = validateCoachDnaIntelligenceConsumer(SURFACE)
  assert.ok(v.checks.find((c) => c.name === 'safe-unknown-key-null').pass)
  assert.ok(v.checks.find((c) => c.name === 'safe-nonstring-key-null').pass)
  assert.ok(v.checks.find((c) => c.name === 'safe-unknown-category-null').pass)
})

test('a non-compliant fake surface is rejected', () => {
  // looks like a surface (function methods) but violates the contract:
  // unknown key returns a non-null object, getValidationState returns a non-object, responses are not frozen
  const fake = {
    isUsable: () => true,
    getSignalGroup: () => ({ not: 'null' }),          // should be null for unknown keys
    getCategory: () => ({ not: 'null' }),
    listPresentCategories: () => [],
    getCoverage: () => ({}),                           // not frozen
    getEvidence: () => ({}),
    getConfidence: () => ({}),
    getProvenance: () => ({}),
    getValidationState: () => 'not-an-object',         // wrong shape
  }
  const v = validateCoachDnaIntelligenceConsumer(fake)
  assert.equal(v.valid, false)
  assert.ok(v.errors.includes('safe-unknown-key-null'))
  assert.ok(v.errors.includes('validation-state-available'))
  assert.ok(v.errors.some((e) => /returns-frozen-object/.test(e)))
})

test('a non-compliant surface that returns recommendation language is rejected', () => {
  const advisory = createCoachDnaIntelligenceQuery(PROFILE)
  const fake = { ...advisory, getCoverage: () => Object.freeze({ note: 'you should start him' }) }
  // copy the bound methods so the spread keeps them callable
  for (const m of ['isUsable', 'getSignalGroup', 'getCategory', 'listPresentCategories', 'getEvidence', 'getConfidence', 'getProvenance', 'getValidationState']) {
    fake[m] = advisory[m].bind(advisory)
  }
  const v = validateCoachDnaIntelligenceConsumer(fake)
  assert.equal(v.valid, false)
  assert.ok(v.errors.includes('no-recommendation-or-prediction'))
})

test('the validation report and contract responses are frozen', () => {
  const v = validateCoachDnaIntelligenceConsumer(SURFACE)
  assert.ok(Object.isFrozen(v))
  assert.ok(Object.isFrozen(v.checks))
  assert.ok(Object.isFrozen(v.availability))
  assert.ok(Object.isFrozen(describeCoachDnaIntelligenceConsumerContract()))
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(
    JSON.stringify(validateCoachDnaIntelligenceConsumer(SURFACE)),
    JSON.stringify(validateCoachDnaIntelligenceConsumer(SURFACE)),
  )
  assert.equal(
    describeCoachDnaIntelligenceConsumerContract().contractFingerprint,
    describeCoachDnaIntelligenceConsumerContract().contractFingerprint,
  )
  assert.equal(
    validateCoachDnaIntelligenceConsumer(PROFILE).validationFingerprint,
    validateCoachDnaIntelligenceConsumer(PROFILE).validationFingerprint,
  )
})

test('the source profile is never mutated', () => {
  const before = JSON.parse(JSON.stringify(PROFILE))
  validateCoachDnaIntelligenceConsumer(PROFILE)
  validateCoachDnaIntelligenceConsumer(SURFACE)
  assert.deepEqual(JSON.parse(JSON.stringify(PROFILE)), before)
})

test('the descriptor and summary carry no recommendation or advice language', () => {
  assert.doesNotMatch(JSON.stringify(describeCoachDnaIntelligenceConsumerContract()), ADVICE_LANG)
  assert.doesNotMatch(summarizeCoachDnaIntelligenceConsumerValidation(SURFACE), ADVICE_LANG)
  assert.match(summarizeCoachDnaIntelligenceConsumerValidation(SURFACE), /consumer contract: HONOURED/)
})

test('exports exist', () => {
  assert.equal(typeof describeCoachDnaIntelligenceConsumerContract, 'function')
  assert.equal(typeof validateCoachDnaIntelligenceConsumer, 'function')
  assert.equal(typeof summarizeCoachDnaIntelligenceConsumerValidation, 'function')
})
