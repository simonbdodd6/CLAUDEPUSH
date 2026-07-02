/**
 * web/brain-coach-dna-training-intelligence-index - Coach DNA Training Intelligence Index (M271) tests
 *
 * Verifies the training navigation layer: it turns an M270 training profile into keyed lookup surfaces (lens,
 * evidence, confidence, provenance), lets a downstream consumer query one lens in O(1) without walking the
 * profile, keeps every expected lens key always present (total index), contains NO player data and does NO
 * training recommendation/content/session analysis, preserves provenance back to M230, never mutates inputs,
 * and is deeply frozen and byte-deterministic. Minimal profiles index empty; malformed profiles fail safe.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaTrainingIntelligenceIndex,
  summarizeCoachDnaTrainingIntelligenceIndex,
  serializeCoachDnaTrainingIntelligenceIndex,
} from '../web/brain-coach-dna-training-intelligence-index.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaTrainingIntelligenceInputs } from '../web/brain-coach-dna-training-intelligence-inputs.js'
import { buildCoachDnaTrainingIntelligenceProfile } from '../web/brain-coach-dna-training-intelligence-profile.js'

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

const trainProfile = (view) => buildCoachDnaTrainingIntelligenceProfile(buildCoachDnaTrainingIntelligenceInputs(createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(view)))))
const FULL_PROFILE = freeze(JSON.parse(JSON.stringify(trainProfile(FULL_VIEW))))
const MINIMAL_PROFILE = freeze(JSON.parse(JSON.stringify(trainProfile(MINIMAL_VIEW))))
const INDEX = buildCoachDnaTrainingIntelligenceIndex(FULL_PROFILE)

const ALL_LENSES = ['planningSignals', 'sessionStructureSignals', 'developmentSignals', 'technicalSignals', 'tacticalSignals', 'feedbackSignals']

test('a valid profile builds the full index shape', () => {
  assert.equal(INDEX.type, 'coach-dna-training-intelligence-index')
  assert.equal(INDEX.schemaVersion, 1)
  assert.equal(INDEX.indexVersion, 1)
  assert.equal(INDEX.validationState.profileUsable, true)
  for (const k of ['trainingLensIndex', 'evidenceIndex', 'confidenceIndex', 'provenanceIndex', 'validationState', 'derivationMetadata']) {
    assert.ok(isObj(INDEX[k]), k)
  }
  assert.match(INDEX.indexFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }

test('the lens index keys all six lenses for O(1) lookup', () => {
  assert.deepEqual(Object.keys(INDEX.trainingLensIndex).sort(), [...ALL_LENSES].sort())
  const s = INDEX.trainingLensIndex['sessionStructureSignals']
  assert.equal(s.present, true)
  assert.equal(s.isStrongest, true)
  assert.equal(s.occurrences, 8)
  assert.equal(s.sourceCategory, 'training-preference')
  assert.equal(INDEX.trainingLensIndex['planningSignals'].present, false)
  // never leaks raw ids
  assert.ok(!('supportingMemoryIds' in s))
})

test('shared-source lenses carry the same data through the index (honest projection)', () => {
  // sessionStructureSignals and technicalSignals both ← training-preference
  assert.equal(INDEX.trainingLensIndex['technicalSignals'].sourceCategory, INDEX.trainingLensIndex['sessionStructureSignals'].sourceCategory)
  assert.equal(INDEX.trainingLensIndex['technicalSignals'].occurrences, INDEX.trainingLensIndex['sessionStructureSignals'].occurrences)
})

test('the evidence + confidence indexes roll up per lens', () => {
  assert.equal(INDEX.evidenceIndex.totalMemories, 13)
  assert.deepEqual(Object.keys(INDEX.evidenceIndex.byLens).sort(), [...ALL_LENSES].sort())
  assert.equal(INDEX.evidenceIndex.byLens.sessionStructureSignals.supportingCount, 6)
  assert.equal(INDEX.evidenceIndex.byLens.planningSignals.present, false)
  assert.equal(INDEX.confidenceIndex.level, 'HIGH')
  assert.equal(INDEX.confidenceIndex.byLens.sessionStructureSignals.averageConfidence, 0.8)
})

test('the provenance index preserves the training lineage back to M230', () => {
  const p = INDEX.provenanceIndex
  assert.deepEqual(p.chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M269', 'M270', 'M271'])
  assert.equal(p.profileFingerprint, FULL_PROFILE.profileFingerprint)
  assert.equal(INDEX.profileFingerprint, FULL_PROFILE.profileFingerprint)
  assert.equal(p.trainingInputsFingerprint, FULL_PROFILE.trainingInputsFingerprint)
  assert.equal(p.byMilestone.M270.fingerprint, FULL_PROFILE.profileFingerprint)
  assert.equal(p.byMilestone.M269.fingerprint, FULL_PROFILE.trainingInputsFingerprint)
  assert.equal(p.origin.sourceMilestone, 'M255')
  assert.deepEqual(p.origin.chain, ['M230', 'M252', 'M253', 'M254'])
})

test('contains NO player data and NO training-recommendation / content / session-analysis', () => {
  const json = JSON.stringify(INDEX)
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(json, /\b(ranking|ranked|scored|recommendation|recommended)\b/i)
  assert.doesNotMatch(json, FORBIDDEN_LANG)
  assert.equal(INDEX.derivationMetadata.containsPlayerData, false)
  assert.equal(INDEX.derivationMetadata.playerEvaluation, false)
  assert.equal(INDEX.derivationMetadata.trainingRecommendation, false)
  assert.equal(INDEX.derivationMetadata.generatesTrainingContent, false)
  assert.equal(INDEX.derivationMetadata.analysesSessions, false)
})

test('a minimal profile indexes empty but remains queryable (unknown propagation)', () => {
  const x = buildCoachDnaTrainingIntelligenceIndex(MINIMAL_PROFILE)
  assert.equal(x.validationState.profileUsable, true)
  assert.equal(Object.keys(x.trainingLensIndex).length, 6)
  for (const l of ALL_LENSES) assert.equal(x.trainingLensIndex[l].present, false, l)
  assert.equal(x.validationState.presentLenses, 0)
  assert.equal(x.confidenceIndex.level, 'LOW')
})

test('a malformed profile fails safe — unusable, total index, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let x
    assert.doesNotThrow(() => { x = buildCoachDnaTrainingIntelligenceIndex(bad) })
    assert.equal(x.validationState.profileUsable, false)
    assert.equal(Object.keys(x.trainingLensIndex).length, 6)   // still total — every lens keyed
    for (const l of ALL_LENSES) assert.equal(x.trainingLensIndex[l].present, false, l)
    assert.equal(x.profileFingerprint, null)
    assert.ok(x.validationState.issues.length >= 1)
  }
})

test('repeated execution is byte-identical and the fingerprint is stable', () => {
  assert.equal(serializeCoachDnaTrainingIntelligenceIndex(FULL_PROFILE), serializeCoachDnaTrainingIntelligenceIndex(FULL_PROFILE))
  assert.equal(buildCoachDnaTrainingIntelligenceIndex(FULL_PROFILE).indexFingerprint, INDEX.indexFingerprint)
  const copy = JSON.parse(JSON.stringify(FULL_PROFILE))
  assert.equal(buildCoachDnaTrainingIntelligenceIndex(copy).indexFingerprint, INDEX.indexFingerprint)
})

test('the source profile is never mutated', () => {
  const before = JSON.parse(JSON.stringify(FULL_PROFILE))
  buildCoachDnaTrainingIntelligenceIndex(FULL_PROFILE)
  assert.deepEqual(JSON.parse(JSON.stringify(FULL_PROFILE)), before)
})

test('the output is deeply frozen', () => {
  assert.ok(Object.isFrozen(INDEX))
  assert.ok(Object.isFrozen(INDEX.trainingLensIndex))
  assert.ok(Object.isFrozen(INDEX.trainingLensIndex['sessionStructureSignals']))
  assert.ok(Object.isFrozen(INDEX.evidenceIndex.byLens))
  assert.ok(Object.isFrozen(INDEX.confidenceIndex))
  assert.ok(Object.isFrozen(INDEX.provenanceIndex))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaTrainingIntelligenceIndex(FULL_PROFILE, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-training-intelligence-index')
  const line = serializeCoachDnaTrainingIntelligenceIndex(FULL_PROFILE, { format: 'line' })
  assert.match(line, /^coach-dna-training-intelligence-index usable=true present=4\/6 confidence=HIGH /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaTrainingIntelligenceIndex(FULL_PROFILE, { format: 'xml' }), /unsupported/)
})

test('the index and summary carry no recommendation, ranking or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaTrainingIntelligenceIndex(FULL_PROFILE), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaTrainingIntelligenceIndex(FULL_PROFILE), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaTrainingIntelligenceIndex(FULL_PROFILE), /training intelligence index: queryable/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaTrainingIntelligenceIndex, 'function')
  assert.equal(typeof summarizeCoachDnaTrainingIntelligenceIndex, 'function')
  assert.equal(typeof serializeCoachDnaTrainingIntelligenceIndex, 'function')
})
