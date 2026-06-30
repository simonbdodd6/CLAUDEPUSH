/**
 * web/brain-coach-dna-selection-intelligence-query - Coach DNA Selection Intelligence Query Surface (M264) tests
 *
 * Verifies the selection read API: pure query helpers (isUsable, getSelectionLens, getEvidence, getConfidence,
 * getCoverage, getProvenance, getValidationState, listAvailableLenses) over the M262 profile / M263 index. They
 * return only existing information, contain NO player data and do NO scoring/ranking/recommendation, return
 * frozen responses, answer safely for unknown/missing lenses, accept profile-only / index-only / pair inputs,
 * never mutate inputs, and are byte-deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createCoachDnaSelectionIntelligenceQuery,
  isUsable,
  getSelectionLens,
  getEvidence,
  getConfidence,
  getCoverage,
  getProvenance,
  getValidationState,
  listAvailableLenses,
} from '../web/brain-coach-dna-selection-intelligence-query.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaSelectionIntelligenceInputs } from '../web/brain-coach-dna-selection-intelligence-inputs.js'
import { buildCoachDnaSelectionIntelligenceProfile } from '../web/brain-coach-dna-selection-intelligence-profile.js'
import { buildCoachDnaSelectionIntelligenceIndex } from '../web/brain-coach-dna-selection-intelligence-index.js'

const FORBIDDEN_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv|predict|forecast|ranking|ranked|scored|select him|start him|bench him)\b/i

function freeze(o) {
  if (o && typeof o === 'object') { for (const k of Object.keys(o)) freeze(o[k]); Object.freeze(o) }
  return o
}
const FULL_VIEW = freeze({
  profileVersion: 'coach-dna-v3',
  confidence: { value: 0.72, level: 'HIGH', label: 'High' },
  headline: 'Selection-led',
  identity: { strongestCategory: 'selection-preference', strongestLabel: 'Selection', weakestCategory: 'risk-warning', weakestLabel: 'Risk warnings', diversityScore: 0.5, diversityLabel: 'Balanced' },
  dominantSignals: [
    { category: 'selection-preference', label: 'Selection', occurrences: 7, strength: 0.9, averageConfidence: 0.8, averageWeight: 0.65, supportingCount: 6 },
    { category: 'player-management', label: 'Player management', occurrences: 4, strength: 0.6, averageConfidence: 0.7, averageWeight: 0.6, supportingCount: 3 },
  ],
  themes: [
    { type: 'selection-preference', label: 'Selection', count: 7, averageConfidence: 0.8, averageWeight: 0.65 },
    { type: 'philosophy', label: 'Philosophy', count: 3, averageConfidence: 0.6, averageWeight: 0.5 },
  ],
  knowledge: { totalMemories: 14, uniqueTypes: 4, averageConfidence: 0.7, averageWeight: 0.6, totalEvidence: 22, totalOntologyLinks: 9 },
  summary: 'A selection-led coach.',
  metadata: { explainable: true, deterministic: true, llmGenerated: false },
})

const selProfileOf = (view) => buildCoachDnaSelectionIntelligenceProfile(buildCoachDnaSelectionIntelligenceInputs(createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(view)))))
const PROFILE = freeze(JSON.parse(JSON.stringify(selProfileOf(FULL_VIEW))))
const INDEX = freeze(JSON.parse(JSON.stringify(buildCoachDnaSelectionIntelligenceIndex(PROFILE))))
const Q = createCoachDnaSelectionIntelligenceQuery({ profile: PROFILE, index: INDEX })

test('a query surface binds and reports usability', () => {
  assert.equal(Q.isUsable(), true)
  assert.ok(Object.isFrozen(Q))
})

test('it builds from a profile alone (index on demand) and from an index alone', () => {
  assert.equal(createCoachDnaSelectionIntelligenceQuery(PROFILE).isUsable(), true)
  assert.equal(createCoachDnaSelectionIntelligenceQuery(INDEX).isUsable(), true)
  assert.equal(createCoachDnaSelectionIntelligenceQuery(PROFILE).getSelectionLens('selectionSignals').occurrences, 7)
  assert.equal(createCoachDnaSelectionIntelligenceQuery(INDEX).getSelectionLens('selectionSignals').occurrences, 7)
})

test('getSelectionLens resolves by lens name and by source category', () => {
  const byName = Q.getSelectionLens('selectionSignals')
  const byCategory = Q.getSelectionLens('selection-preference')
  assert.deepEqual(byName, byCategory)
  assert.equal(byName.occurrences, 7)
  assert.equal(byName.isStrongest, true)
  assert.ok(!('supportingMemoryIds' in byName))
})

test('getSelectionLens returns null for an unknown key', () => {
  for (const bad of ['nope', '', 7, null, undefined, {}]) assert.equal(Q.getSelectionLens(bad), null)
})

test('getEvidence works with and without a lens key', () => {
  assert.equal(Q.getEvidence().totalMemories, 14)
  assert.equal(Q.getEvidence('selectionSignals').supportingCount, 6)
  assert.equal(Q.getEvidence('rotationSignals').present, false)
  assert.equal(Q.getEvidence('nope'), null)
})

test('getConfidence works with and without a lens key', () => {
  assert.equal(Q.getConfidence().level, 'HIGH')
  assert.equal(Q.getConfidence('selectionSignals').averageConfidence, 0.8)
  assert.equal(Q.getConfidence('nope'), null)
})

test('getCoverage / getProvenance / getValidationState / listAvailableLenses return existing data', () => {
  assert.equal(Q.getCoverage().presentLenses, 3)
  assert.equal(Q.getCoverage().totalLenses, 5)
  assert.deepEqual(Q.getProvenance().chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M261', 'M262', 'M263'])
  assert.equal(Q.getProvenance().origin.sourceMilestone, 'M255')
  assert.equal(Q.getValidationState().profileUsable, true)
  assert.deepEqual([...Q.listAvailableLenses()].sort(), ['continuitySignals', 'playerTrustSignals', 'selectionSignals'])
})

test('every response is frozen (immutable)', () => {
  assert.ok(Object.isFrozen(Q.getSelectionLens('selectionSignals')))
  assert.ok(Object.isFrozen(Q.getEvidence()))
  assert.ok(Object.isFrozen(Q.getEvidence('selectionSignals')))
  assert.ok(Object.isFrozen(Q.getConfidence()))
  assert.ok(Object.isFrozen(Q.getCoverage()))
  assert.ok(Object.isFrozen(Q.getProvenance()))
  assert.ok(Object.isFrozen(Q.getValidationState()))
  assert.ok(Object.isFrozen(Q.listAvailableLenses()))
})

test('contains NO player data and NO scoring/ranking/recommendation in responses', () => {
  const blob = JSON.stringify([Q.getSelectionLens('selectionSignals'), Q.getEvidence(), Q.getConfidence(), Q.getCoverage(), Q.getProvenance(), Q.getValidationState()])
  assert.doesNotMatch(blob, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(blob, /\b(ranking|ranked|scored|recommendation|recommended)\b/i)
  assert.doesNotMatch(blob, FORBIDDEN_LANG)
})

test('malformed inputs fail safe — not usable, queries return null/empty, never throw', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let q
    assert.doesNotThrow(() => { q = createCoachDnaSelectionIntelligenceQuery(bad) })
    assert.equal(q.isUsable(), false)
    assert.equal(q.getSelectionLens('selectionSignals'), null)
    assert.deepEqual(q.listAvailableLenses(), [])
    assert.equal(q.getValidationState().profileUsable, false)
    assert.ok(Object.isFrozen(q.getEvidence()))
  }
})

test('repeated queries are byte-identical (deterministic)', () => {
  assert.equal(JSON.stringify(Q.getSelectionLens('selectionSignals')), JSON.stringify(Q.getSelectionLens('selectionSignals')))
  assert.equal(JSON.stringify(Q.getCoverage()), JSON.stringify(getCoverage(PROFILE)))
  assert.equal(JSON.stringify(Q.getProvenance()), JSON.stringify(getProvenance(INDEX)))
})

test('the one-shot helpers match the bound surface', () => {
  assert.equal(isUsable(PROFILE), Q.isUsable())
  assert.deepEqual(getSelectionLens(PROFILE, 'selectionSignals'), Q.getSelectionLens('selectionSignals'))
  assert.deepEqual(getEvidence(INDEX, 'selectionSignals'), Q.getEvidence('selectionSignals'))
  assert.deepEqual(getConfidence(PROFILE), Q.getConfidence())
  assert.deepEqual(getValidationState(INDEX), Q.getValidationState())
  assert.deepEqual(listAvailableLenses(PROFILE), Q.listAvailableLenses())
})

test('provenance is consistent across profile-built and index-built surfaces', () => {
  const fromProfile = createCoachDnaSelectionIntelligenceQuery(PROFILE).getProvenance()
  const fromIndex = createCoachDnaSelectionIntelligenceQuery(INDEX).getProvenance()
  assert.deepEqual(fromProfile, fromIndex)
  assert.equal(fromProfile.profileFingerprint, PROFILE.profileFingerprint)
})

test('the source profile and index are never mutated', () => {
  const pBefore = JSON.parse(JSON.stringify(PROFILE))
  const xBefore = JSON.parse(JSON.stringify(INDEX))
  const q = createCoachDnaSelectionIntelligenceQuery({ profile: PROFILE, index: INDEX })
  q.getSelectionLens('selectionSignals'); q.getEvidence(); q.getConfidence(); q.getProvenance(); q.getValidationState(); q.listAvailableLenses()
  assert.deepEqual(JSON.parse(JSON.stringify(PROFILE)), pBefore)
  assert.deepEqual(JSON.parse(JSON.stringify(INDEX)), xBefore)
})

test('exports exist', () => {
  for (const fn of [createCoachDnaSelectionIntelligenceQuery, isUsable, getSelectionLens, getEvidence, getConfidence, getCoverage, getProvenance, getValidationState, listAvailableLenses]) {
    assert.equal(typeof fn, 'function')
  }
})
