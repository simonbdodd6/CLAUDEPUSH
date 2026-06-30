/**
 * web/brain-coach-dna-selection-intelligence-consumer-contract - Coach DNA Selection Intelligence Consumer Contract (M265) tests
 *
 * Verifies the selection consumer-safety contract: it describes the allowed M264 query methods, response shapes
 * and the no-player-data / no-ranking / no-scoring / no-recommendation boundaries, and validates that a surface
 * honours that contract — a genuine M264 surface passes (even empty), a non-compliant fake is rejected,
 * malformed inputs are handled safely, responses are frozen, output is deterministic, and inputs are never mutated.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  describeCoachDnaSelectionIntelligenceConsumerContract,
  validateCoachDnaSelectionIntelligenceConsumer,
  summarizeCoachDnaSelectionIntelligenceConsumerValidation,
} from '../web/brain-coach-dna-selection-intelligence-consumer-contract.js'
import { createCoachDnaSelectionIntelligenceQuery } from '../web/brain-coach-dna-selection-intelligence-query.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaSelectionIntelligenceInputs } from '../web/brain-coach-dna-selection-intelligence-inputs.js'
import { buildCoachDnaSelectionIntelligenceProfile } from '../web/brain-coach-dna-selection-intelligence-profile.js'

const FORBIDDEN_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv|predict|forecast|ranking|ranked|scored)\b/i

function freeze(o) {
  if (o && typeof o === 'object') { for (const k of Object.keys(o)) freeze(o[k]); Object.freeze(o) }
  return o
}
const FULL_VIEW = freeze({
  profileVersion: 'coach-dna-v3',
  confidence: { value: 0.72, level: 'HIGH', label: 'High' },
  headline: 'Selection-led',
  identity: { strongestCategory: 'selection-preference', strongestLabel: 'Selection', weakestCategory: 'risk-warning', weakestLabel: 'Risk warnings', diversityScore: 0.5, diversityLabel: 'Balanced' },
  dominantSignals: [{ category: 'selection-preference', label: 'Selection', occurrences: 7, strength: 0.9, averageConfidence: 0.8, averageWeight: 0.65, supportingCount: 6 }],
  themes: [{ type: 'selection-preference', label: 'Selection', count: 7, averageConfidence: 0.8, averageWeight: 0.65 }],
  knowledge: { totalMemories: 14, uniqueTypes: 4, averageConfidence: 0.7, averageWeight: 0.6, totalEvidence: 22, totalOntologyLinks: 9 },
  summary: 'A selection-led coach.',
  metadata: { explainable: true, deterministic: true, llmGenerated: false },
})
const PROFILE = freeze(JSON.parse(JSON.stringify(buildCoachDnaSelectionIntelligenceProfile(buildCoachDnaSelectionIntelligenceInputs(createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(FULL_VIEW))))))))
const SURFACE = createCoachDnaSelectionIntelligenceQuery(PROFILE)

test('the contract descriptor lists allowed methods, shapes and the domain boundaries', () => {
  const c = describeCoachDnaSelectionIntelligenceConsumerContract()
  assert.equal(c.type, 'coach-dna-selection-intelligence-consumer-contract')
  assert.equal(c.sourceMilestone, 'M264')
  assert.deepEqual(c.allowedMethods.map((m) => m.name), ['isUsable', 'getSelectionLens', 'getEvidence', 'getConfidence', 'getCoverage', 'getProvenance', 'getValidationState', 'listAvailableLenses'])
  assert.equal(c.boundaries.noPlayerData, true)
  assert.equal(c.boundaries.noPlayerScoring, true)
  assert.equal(c.boundaries.noPlayerRanking, true)
  assert.equal(c.boundaries.noRecommendation, true)
  assert.equal(c.availability.provenance, true)
  assert.match(c.contractFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.allowedMethods))
})

test('a valid M264 surface honours the contract', () => {
  const v = validateCoachDnaSelectionIntelligenceConsumer(SURFACE)
  assert.equal(v.valid, true)
  assert.equal(v.surfaceUsable, true)
  assert.equal(v.failedChecks, 0)
  assert.deepEqual(v.errors, [])
  assert.equal(v.availability.provenance, true)
  assert.equal(v.availability.evidence, true)
  assert.equal(v.availability.confidence, true)
  assert.equal(v.availability.validationState, true)
  assert.equal(v.boundaries.noPlayerData, true)
  assert.equal(v.boundaries.noPlayerRanking, true)
})

test('all required methods are checked present', () => {
  const v = validateCoachDnaSelectionIntelligenceConsumer(SURFACE)
  for (const m of ['isUsable', 'getSelectionLens', 'getEvidence', 'getConfidence', 'getCoverage', 'getProvenance', 'getValidationState', 'listAvailableLenses']) {
    const check = v.checks.find((c) => c.name === `method:${m}`)
    assert.ok(check && check.pass, m)
  }
})

test('a contract validation can be built straight from a profile or index', () => {
  const v = validateCoachDnaSelectionIntelligenceConsumer(PROFILE)
  assert.equal(v.valid, true)
  assert.equal(v.surfaceUsable, true)
})

test('an empty/malformed-data surface still honours the contract (valid, not usable)', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, { type: 'wrong' }]) {
    const v = validateCoachDnaSelectionIntelligenceConsumer(bad)
    assert.equal(v.valid, true, JSON.stringify(bad))
    assert.equal(v.surfaceUsable, false, JSON.stringify(bad))
  }
})

test('safe null responses for unknown keys are required and verified', () => {
  const v = validateCoachDnaSelectionIntelligenceConsumer(SURFACE)
  assert.ok(v.checks.find((c) => c.name === 'safe-unknown-lens-null').pass)
  assert.ok(v.checks.find((c) => c.name === 'safe-nonstring-lens-null').pass)
  assert.ok(v.checks.find((c) => c.name === 'safe-unknown-evidence-null').pass)
  assert.ok(v.checks.find((c) => c.name === 'safe-unknown-confidence-null').pass)
})

test('a non-compliant fake surface is rejected', () => {
  const fake = {
    isUsable: () => true,
    getSelectionLens: () => ({ not: 'null' }),         // should be null for unknown keys
    getEvidence: () => ({}),                            // not frozen
    getConfidence: () => ({}),
    getCoverage: () => ({}),
    getProvenance: () => ({}),
    getValidationState: () => 'not-an-object',         // wrong shape
    listAvailableLenses: () => [],
  }
  const v = validateCoachDnaSelectionIntelligenceConsumer(fake)
  assert.equal(v.valid, false)
  assert.ok(v.errors.includes('safe-unknown-lens-null'))
  assert.ok(v.errors.includes('validation-state-available'))
  assert.ok(v.errors.some((e) => /returns-frozen-object/.test(e)))
})

test('a surface leaking player data is rejected', () => {
  const base = createCoachDnaSelectionIntelligenceQuery(PROFILE)
  const fake = {}
  for (const m of ['isUsable', 'getSelectionLens', 'getEvidence', 'getConfidence', 'getCoverage', 'getProvenance', 'listAvailableLenses']) fake[m] = base[m].bind(base)
  fake.getValidationState = () => Object.freeze({ profileRecognized: true, profileUsable: true, issues: [], playerName: 'Smith' })
  const v = validateCoachDnaSelectionIntelligenceConsumer(fake)
  assert.equal(v.valid, false)
  assert.ok(v.errors.includes('no-player-data'))
  assert.equal(v.boundaries.noPlayerData, false)
})

test('a surface leaking ranking/recommendation language is rejected', () => {
  const base = createCoachDnaSelectionIntelligenceQuery(PROFILE)
  const fake = {}
  for (const m of ['isUsable', 'getSelectionLens', 'getEvidence', 'getConfidence', 'getProvenance', 'getValidationState', 'listAvailableLenses']) fake[m] = base[m].bind(base)
  fake.getCoverage = () => Object.freeze({ note: 'best xv ranked here' })
  const v = validateCoachDnaSelectionIntelligenceConsumer(fake)
  assert.equal(v.valid, false)
  assert.ok(v.errors.includes('no-ranking-scoring-recommendation'))
})

test('the validation report and contract responses are frozen', () => {
  const v = validateCoachDnaSelectionIntelligenceConsumer(SURFACE)
  assert.ok(Object.isFrozen(v))
  assert.ok(Object.isFrozen(v.checks))
  assert.ok(Object.isFrozen(v.boundaries))
  assert.ok(Object.isFrozen(describeCoachDnaSelectionIntelligenceConsumerContract()))
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(JSON.stringify(validateCoachDnaSelectionIntelligenceConsumer(SURFACE)), JSON.stringify(validateCoachDnaSelectionIntelligenceConsumer(SURFACE)))
  assert.equal(describeCoachDnaSelectionIntelligenceConsumerContract().contractFingerprint, describeCoachDnaSelectionIntelligenceConsumerContract().contractFingerprint)
  assert.equal(validateCoachDnaSelectionIntelligenceConsumer(PROFILE).validationFingerprint, validateCoachDnaSelectionIntelligenceConsumer(PROFILE).validationFingerprint)
})

test('the source profile is never mutated', () => {
  const before = JSON.parse(JSON.stringify(PROFILE))
  validateCoachDnaSelectionIntelligenceConsumer(PROFILE)
  validateCoachDnaSelectionIntelligenceConsumer(SURFACE)
  assert.deepEqual(JSON.parse(JSON.stringify(PROFILE)), before)
})

test('the descriptor and summary carry no recommendation, ranking or advice language', () => {
  assert.doesNotMatch(JSON.stringify(describeCoachDnaSelectionIntelligenceConsumerContract()), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaSelectionIntelligenceConsumerValidation(SURFACE), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaSelectionIntelligenceConsumerValidation(SURFACE), /selection intelligence consumer contract: HONOURED/)
})

test('exports exist', () => {
  assert.equal(typeof describeCoachDnaSelectionIntelligenceConsumerContract, 'function')
  assert.equal(typeof validateCoachDnaSelectionIntelligenceConsumer, 'function')
  assert.equal(typeof summarizeCoachDnaSelectionIntelligenceConsumerValidation, 'function')
})
