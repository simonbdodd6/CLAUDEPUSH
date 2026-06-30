/**
 * web/brain-coach-dna-training-intelligence-profile - Coach DNA Training Intelligence Profile (M270) tests
 *
 * Verifies the assembled training object: it folds the six M269 lenses into one profile (lens summary, evidence
 * coverage, confidence), contains NO player data and does NO training recommendation/content/session analysis,
 * preserves provenance back to M230, never mutates inputs, and is deeply frozen and byte-deterministic. Minimal
 * inputs yield an empty-but-usable profile; malformed inputs fail safe.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaTrainingIntelligenceProfile,
  summarizeCoachDnaTrainingIntelligenceProfile,
  serializeCoachDnaTrainingIntelligenceProfile,
} from '../web/brain-coach-dna-training-intelligence-profile.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaTrainingIntelligenceInputs } from '../web/brain-coach-dna-training-intelligence-inputs.js'

const FORBIDDEN_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv|predict|forecast|ranking|ranked|scored|select him|start him|bench him)\b/i

function freeze(o) {
  if (o && typeof o === 'object') { for (const k of Object.keys(o)) freeze(o[k]); Object.freeze(o) }
  return o
}
const FULL_VIEW = freeze({
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

const trainInputs = (view) => buildCoachDnaTrainingIntelligenceInputs(createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(view))))
const FULL_INPUTS = freeze(JSON.parse(JSON.stringify(trainInputs(FULL_VIEW))))
const MINIMAL_INPUTS = freeze(JSON.parse(JSON.stringify(trainInputs(MINIMAL_VIEW))))
const PROFILE = buildCoachDnaTrainingIntelligenceProfile(FULL_INPUTS)

const ALL_LENSES = ['planningSignals', 'sessionStructureSignals', 'developmentSignals', 'technicalSignals', 'tacticalSignals', 'feedbackSignals']

test('valid inputs assemble the full training profile shape', () => {
  assert.equal(PROFILE.type, 'coach-dna-training-intelligence-profile')
  assert.equal(PROFILE.schemaVersion, 1)
  assert.equal(PROFILE.profileVersion, 'training-intelligence-profile-v1')
  assert.equal(PROFILE.validationState.usable, true)
  for (const k of ['trainingLensSummary', 'evidenceCoverage', 'confidenceSummary', 'provenance', 'validationState', 'derivationMetadata']) {
    assert.ok(isObj(PROFILE[k]), k)
  }
  assert.match(PROFILE.profileFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }

test('the lens summary aggregates the M269 lenses in fixed order (not ranked)', () => {
  const s = PROFILE.trainingLensSummary
  assert.equal(s.totalLenses, 6)
  // present: sessionStructure + technical (both training-preference) + development + feedback = 4
  assert.equal(s.presentLenses, 4)
  assert.equal(s.strongestLens, 'sessionStructureSignals')   // training-preference is strongest
  assert.deepEqual(s.lenses.map((l) => l.lens), ALL_LENSES)
})

test('contains NO player data and NO training-recommendation / content / session-analysis', () => {
  const json = JSON.stringify(PROFILE)
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(json, /\b(ranking|ranked|scored|recommendation|recommended)\b/i)
  assert.doesNotMatch(json, FORBIDDEN_LANG)
  assert.equal(PROFILE.derivationMetadata.containsPlayerData, false)
  assert.equal(PROFILE.derivationMetadata.trainingRecommendation, false)
  assert.equal(PROFILE.derivationMetadata.generatesTrainingContent, false)
  assert.equal(PROFILE.derivationMetadata.analysesSessions, false)
})

test('evidence coverage and confidence are carried forward', () => {
  assert.equal(PROFILE.evidenceCoverage.totalMemories, 13)
  assert.equal(PROFILE.evidenceCoverage.byLens.sessionStructureSignals.supportingCount, 6)
  assert.equal(PROFILE.confidenceSummary.level, 'HIGH')
  assert.equal(PROFILE.confidenceSummary.high, true)
})

test('provenance preserves the chain back through M269 to M230', () => {
  assert.equal(PROFILE.provenance.source, 'coach-dna-training-intelligence-inputs')
  assert.equal(PROFILE.provenance.sourceMilestone, 'M269')
  assert.equal(PROFILE.provenance.trainingInputsFingerprint, FULL_INPUTS.trainingInputsFingerprint)
  assert.equal(PROFILE.trainingInputsFingerprint, FULL_INPUTS.trainingInputsFingerprint)
  assert.equal(PROFILE.provenance.origin.sourceMilestone, 'M255')
  assert.deepEqual(PROFILE.provenance.origin.chain, ['M230', 'M252', 'M253', 'M254'])
  assert.equal(PROFILE.derivationMetadata.milestone, 'M270')
})

test('minimal inputs yield an empty but usable profile (unknown propagation)', () => {
  const p = buildCoachDnaTrainingIntelligenceProfile(MINIMAL_INPUTS)
  assert.equal(p.validationState.usable, true)
  assert.equal(p.trainingLensSummary.presentLenses, 0)
  assert.equal(p.trainingLensSummary.strongestLens, null)
  assert.equal(p.confidenceSummary.level, 'LOW')
})

test('malformed inputs fail safe — unusable, empty, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }, { type: 'coach-dna-training-intelligence-inputs', valid: false }]) {
    let p
    assert.doesNotThrow(() => { p = buildCoachDnaTrainingIntelligenceProfile(bad) })
    assert.equal(p.validationState.usable, false)
    assert.equal(p.trainingLensSummary.presentLenses, 0)
    assert.equal(p.confidenceSummary.low, true)
    assert.ok(p.validationState.issues.length >= 1)
  }
})

test('repeated execution is byte-identical and the fingerprint is stable', () => {
  assert.equal(serializeCoachDnaTrainingIntelligenceProfile(FULL_INPUTS), serializeCoachDnaTrainingIntelligenceProfile(FULL_INPUTS))
  assert.equal(buildCoachDnaTrainingIntelligenceProfile(FULL_INPUTS).profileFingerprint, PROFILE.profileFingerprint)
  const copy = JSON.parse(JSON.stringify(FULL_INPUTS))
  assert.equal(buildCoachDnaTrainingIntelligenceProfile(copy).profileFingerprint, PROFILE.profileFingerprint)
})

test('the source inputs are never mutated', () => {
  const before = JSON.parse(JSON.stringify(FULL_INPUTS))
  buildCoachDnaTrainingIntelligenceProfile(FULL_INPUTS)
  assert.deepEqual(JSON.parse(JSON.stringify(FULL_INPUTS)), before)
})

test('the output is deeply frozen', () => {
  assert.ok(Object.isFrozen(PROFILE))
  assert.ok(Object.isFrozen(PROFILE.trainingLensSummary))
  assert.ok(Object.isFrozen(PROFILE.trainingLensSummary.lenses))
  assert.ok(Object.isFrozen(PROFILE.evidenceCoverage))
  assert.ok(Object.isFrozen(PROFILE.provenance))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaTrainingIntelligenceProfile(FULL_INPUTS, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-training-intelligence-profile')
  const line = serializeCoachDnaTrainingIntelligenceProfile(FULL_INPUTS, { format: 'line' })
  assert.match(line, /^coach-dna-training-intelligence-profile usable=true lenses=4\/6 confidence=HIGH /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaTrainingIntelligenceProfile(FULL_INPUTS, { format: 'xml' }), /unsupported/)
})

test('the profile and summary carry no recommendation or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaTrainingIntelligenceProfile(FULL_INPUTS), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaTrainingIntelligenceProfile(FULL_INPUTS), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaTrainingIntelligenceProfile(FULL_INPUTS), /training intelligence profile: usable/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaTrainingIntelligenceProfile, 'function')
  assert.equal(typeof summarizeCoachDnaTrainingIntelligenceProfile, 'function')
  assert.equal(typeof serializeCoachDnaTrainingIntelligenceProfile, 'function')
})
