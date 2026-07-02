/**
 * web/brain-coach-dna-training-intelligence-query - Coach DNA Training Intelligence Query Surface (M272) tests
 *
 * Verifies the training read API: pure query helpers (isUsable, getTrainingLens, getEvidence, getConfidence,
 * getCoverage, getProvenance, getValidationState, listAvailableLenses) over the M270 profile / M271 index.
 * They return only existing information, contain NO player data and do NO training recommendation / content
 * generation / session analysis, return frozen responses, answer safely for unknown/missing lenses, accept
 * profile-only / index-only / pair inputs, never mutate inputs, and are byte-deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createCoachDnaTrainingIntelligenceQuery,
  isUsable,
  getTrainingLens,
  getEvidence,
  getConfidence,
  getCoverage,
  getProvenance,
  getValidationState,
  listAvailableLenses,
} from '../web/brain-coach-dna-training-intelligence-query.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaTrainingIntelligenceInputs } from '../web/brain-coach-dna-training-intelligence-inputs.js'
import { buildCoachDnaTrainingIntelligenceProfile } from '../web/brain-coach-dna-training-intelligence-profile.js'
import { buildCoachDnaTrainingIntelligenceIndex } from '../web/brain-coach-dna-training-intelligence-index.js'

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

const trainProfileOf = (view) => buildCoachDnaTrainingIntelligenceProfile(buildCoachDnaTrainingIntelligenceInputs(createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(view)))))
const PROFILE = freeze(JSON.parse(JSON.stringify(trainProfileOf(FULL_VIEW))))
const INDEX = freeze(JSON.parse(JSON.stringify(buildCoachDnaTrainingIntelligenceIndex(PROFILE))))
const Q = createCoachDnaTrainingIntelligenceQuery({ profile: PROFILE, index: INDEX })

test('a query surface binds and reports usability', () => {
  assert.equal(Q.isUsable(), true)
  assert.ok(Object.isFrozen(Q))
})

test('it builds from a profile alone (index on demand) and from an index alone', () => {
  assert.equal(createCoachDnaTrainingIntelligenceQuery(PROFILE).isUsable(), true)
  assert.equal(createCoachDnaTrainingIntelligenceQuery(INDEX).isUsable(), true)
  assert.equal(createCoachDnaTrainingIntelligenceQuery(PROFILE).getTrainingLens('sessionStructureSignals').occurrences, 8)
  assert.equal(createCoachDnaTrainingIntelligenceQuery(INDEX).getTrainingLens('sessionStructureSignals').occurrences, 8)
})

test('getTrainingLens resolves by lens name and by source category', () => {
  const byName = Q.getTrainingLens('tacticalSignals')
  const byCategory = Q.getTrainingLens('tactical-preference')
  assert.deepEqual(byName, byCategory)
  const feedback = Q.getTrainingLens('communication-style')
  assert.equal(feedback.lens, 'feedbackSignals')
  assert.equal(feedback.present, true)
  assert.ok(!('supportingMemoryIds' in feedback))
})

test('the shared training-preference category resolves deterministically to the first declaring lens', () => {
  const byCategory = Q.getTrainingLens('training-preference')
  assert.equal(byCategory.lens, 'sessionStructureSignals')   // first declared, documented resolution
  // and the two sharing lenses carry the same data anyway
  assert.equal(Q.getTrainingLens('technicalSignals').occurrences, byCategory.occurrences)
})

test('getTrainingLens returns null for an unknown key', () => {
  for (const bad of ['nope', '', 7, null, undefined, {}]) assert.equal(Q.getTrainingLens(bad), null)
})

test('getEvidence works with and without a lens key', () => {
  assert.equal(Q.getEvidence().totalMemories, 13)
  assert.equal(Q.getEvidence('sessionStructureSignals').supportingCount, 6)
  assert.equal(Q.getEvidence('planningSignals').present, false)
  assert.equal(Q.getEvidence('nope'), null)
})

test('getConfidence works with and without a lens key', () => {
  assert.equal(Q.getConfidence().level, 'HIGH')
  assert.equal(Q.getConfidence('sessionStructureSignals').averageConfidence, 0.8)
  assert.equal(Q.getConfidence('nope'), null)
})

test('getCoverage / getProvenance / getValidationState / listAvailableLenses return existing data', () => {
  assert.equal(Q.getCoverage().presentLenses, 4)
  assert.equal(Q.getCoverage().totalLenses, 6)
  assert.deepEqual(Q.getProvenance().chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M269', 'M270', 'M271'])
  assert.equal(Q.getProvenance().origin.sourceMilestone, 'M255')
  assert.equal(Q.getValidationState().profileUsable, true)
  assert.deepEqual([...Q.listAvailableLenses()].sort(), ['developmentSignals', 'feedbackSignals', 'sessionStructureSignals', 'technicalSignals'])
})

test('every response is frozen (immutable)', () => {
  assert.ok(Object.isFrozen(Q.getTrainingLens('sessionStructureSignals')))
  assert.ok(Object.isFrozen(Q.getEvidence()))
  assert.ok(Object.isFrozen(Q.getEvidence('sessionStructureSignals')))
  assert.ok(Object.isFrozen(Q.getConfidence()))
  assert.ok(Object.isFrozen(Q.getCoverage()))
  assert.ok(Object.isFrozen(Q.getProvenance()))
  assert.ok(Object.isFrozen(Q.getValidationState()))
  assert.ok(Object.isFrozen(Q.listAvailableLenses()))
})

test('contains NO player data and NO training-recommendation/content/session-analysis in responses', () => {
  const blob = JSON.stringify([Q.getTrainingLens('sessionStructureSignals'), Q.getEvidence(), Q.getConfidence(), Q.getCoverage(), Q.getProvenance(), Q.getValidationState()])
  assert.doesNotMatch(blob, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(blob, /\b(ranking|ranked|scored|recommendation|recommended)\b/i)
  assert.doesNotMatch(blob, FORBIDDEN_LANG)
})

test('malformed inputs fail safe — not usable, queries return null/empty, never throw', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let q
    assert.doesNotThrow(() => { q = createCoachDnaTrainingIntelligenceQuery(bad) })
    assert.equal(q.isUsable(), false)
    assert.equal(q.getTrainingLens('sessionStructureSignals'), null)
    assert.deepEqual(q.listAvailableLenses(), [])
    assert.equal(q.getValidationState().profileUsable, false)
    assert.ok(Object.isFrozen(q.getEvidence()))
  }
})

test('repeated queries are byte-identical (deterministic)', () => {
  assert.equal(JSON.stringify(Q.getTrainingLens('sessionStructureSignals')), JSON.stringify(Q.getTrainingLens('sessionStructureSignals')))
  assert.equal(JSON.stringify(Q.getCoverage()), JSON.stringify(getCoverage(PROFILE)))
  assert.equal(JSON.stringify(Q.getProvenance()), JSON.stringify(getProvenance(INDEX)))
})

test('the one-shot helpers match the bound surface', () => {
  assert.equal(isUsable(PROFILE), Q.isUsable())
  assert.deepEqual(getTrainingLens(PROFILE, 'sessionStructureSignals'), Q.getTrainingLens('sessionStructureSignals'))
  assert.deepEqual(getEvidence(INDEX, 'sessionStructureSignals'), Q.getEvidence('sessionStructureSignals'))
  assert.deepEqual(getConfidence(PROFILE), Q.getConfidence())
  assert.deepEqual(getValidationState(INDEX), Q.getValidationState())
  assert.deepEqual(listAvailableLenses(PROFILE), Q.listAvailableLenses())
})

test('provenance is consistent across profile-built and index-built surfaces', () => {
  const fromProfile = createCoachDnaTrainingIntelligenceQuery(PROFILE).getProvenance()
  const fromIndex = createCoachDnaTrainingIntelligenceQuery(INDEX).getProvenance()
  assert.deepEqual(fromProfile, fromIndex)
  assert.equal(fromProfile.profileFingerprint, PROFILE.profileFingerprint)
})

test('the source profile and index are never mutated', () => {
  const pBefore = JSON.parse(JSON.stringify(PROFILE))
  const xBefore = JSON.parse(JSON.stringify(INDEX))
  const q = createCoachDnaTrainingIntelligenceQuery({ profile: PROFILE, index: INDEX })
  q.getTrainingLens('sessionStructureSignals'); q.getEvidence(); q.getConfidence(); q.getProvenance(); q.getValidationState(); q.listAvailableLenses()
  assert.deepEqual(JSON.parse(JSON.stringify(PROFILE)), pBefore)
  assert.deepEqual(JSON.parse(JSON.stringify(INDEX)), xBefore)
})

test('exports exist', () => {
  for (const fn of [createCoachDnaTrainingIntelligenceQuery, isUsable, getTrainingLens, getEvidence, getConfidence, getCoverage, getProvenance, getValidationState, listAvailableLenses]) {
    assert.equal(typeof fn, 'function')
  }
})
