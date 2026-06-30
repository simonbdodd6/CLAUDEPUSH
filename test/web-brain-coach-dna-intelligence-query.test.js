/**
 * web/brain-coach-dna-intelligence-query - Coach DNA Intelligence Query Surface (M255) tests
 *
 * Verifies the stable read API over the Intelligence subsystem: pure query helpers (getSignalGroup, getCategory,
 * getCoverage, getEvidence, getConfidence, getProvenance, getValidationState) that return only existing
 * information from the M253 profile / M254 index, derive no new intelligence, never mutate inputs, return frozen
 * responses, and answer safely (null-shaped) for unknown/missing categories and malformed inputs.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createCoachDnaIntelligenceQuery,
  getSignalGroup,
  getCategory,
  getCoverage,
  getEvidence,
  getConfidence,
  getProvenance,
  getValidationState,
} from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { buildCoachDnaIntelligenceIndex } from '../web/brain-coach-dna-intelligence-index.js'

function freeze(o) {
  if (o && typeof o === 'object') { for (const k of Object.keys(o)) freeze(o[k]); Object.freeze(o) }
  return o
}

const FULL_VIEW = freeze({
  profileVersion: 'coach-dna-v3',
  confidence: { value: 0.72, level: 'HIGH', label: 'High' },
  headline: 'Philosophy focus',
  identity: { strongestCategory: 'philosophy', strongestLabel: 'Philosophy', weakestCategory: 'risk-warning', weakestLabel: 'Risk warnings', diversityScore: 0.5, diversityLabel: 'Balanced' },
  dominantSignals: [
    { category: 'philosophy', label: 'Philosophy', occurrences: 6, strength: 0.8, averageConfidence: 0.75, averageWeight: 0.6, supportingCount: 5 },
    { category: 'training-preference', label: 'Training', occurrences: 3, strength: 0.5, averageConfidence: 0.6, averageWeight: 0.55, supportingCount: 2 },
  ],
  themes: [
    { type: 'philosophy', label: 'Philosophy', count: 6, averageConfidence: 0.75, averageWeight: 0.6 },
    { type: 'communication-style', label: 'Communication', count: 2, averageConfidence: 0.5, averageWeight: 0.45 },
  ],
  knowledge: { totalMemories: 12, uniqueTypes: 4, averageConfidence: 0.68, averageWeight: 0.57, totalEvidence: 20, totalOntologyLinks: 8 },
  summary: 'A philosophy-led coach.',
  metadata: { explainable: true, deterministic: true, llmGenerated: false },
})

const PROFILE = freeze(JSON.parse(JSON.stringify(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(FULL_VIEW)))))
const INDEX = freeze(JSON.parse(JSON.stringify(buildCoachDnaIntelligenceIndex(PROFILE))))
const Q = createCoachDnaIntelligenceQuery({ profile: PROFILE, index: INDEX })

test('a query surface binds to a profile/index and reports usability', () => {
  assert.equal(Q.isUsable(), true)
  assert.ok(Object.isFrozen(Q))
})

test('the surface can be built from a profile alone (index built on demand)', () => {
  const q = createCoachDnaIntelligenceQuery(PROFILE)
  assert.equal(q.isUsable(), true)
  assert.equal(q.getSignalGroup('philosophy').occurrences, 6)
})

test('the surface can be built from an index alone', () => {
  const q = createCoachDnaIntelligenceQuery(INDEX)
  assert.equal(q.isUsable(), true)
  assert.equal(q.getCategory('philosophy').isStrongest, true)
})

test('getSignalGroup resolves by category and by field name', () => {
  const byCategory = Q.getSignalGroup('philosophy')
  const byField = Q.getSignalGroup('coachingStyleSignals')
  assert.deepEqual(byCategory, byField)
  assert.equal(byCategory.occurrences, 6)
  assert.equal(byCategory.supportingCount, 5)
  assert.ok(!('supportingMemoryIds' in byCategory))
})

test('getSignalGroup returns a not-present entry for a known-but-absent category', () => {
  const sel = Q.getSignalGroup('selection-preference')
  assert.equal(sel.present, false)
  assert.equal(sel.occurrences, 0)
})

test('getSignalGroup / getCategory return null for an unknown key', () => {
  for (const bad of ['nope', '', 7, null, undefined, {}]) {
    assert.equal(Q.getSignalGroup(bad), null)
    assert.equal(Q.getCategory(bad), null)
  }
})

test('getCategory exposes navigation flags and the signal key', () => {
  const phil = Q.getCategory('philosophy')
  assert.equal(phil.present, true)
  assert.equal(phil.isStrongest, true)
  assert.equal(phil.signalKey, 'coachingStyleSignals')
})

test('listPresentCategories returns only the present categories', () => {
  assert.deepEqual([...Q.listPresentCategories()].sort(), ['communication-style', 'philosophy', 'training-preference'])
})

test('getCoverage / getEvidence / getConfidence / getProvenance / getValidationState return existing data', () => {
  assert.equal(Q.getCoverage().categoriesCovered, 3)
  assert.equal(Q.getEvidence().totalMemories, 12)
  assert.equal(Q.getEvidence().byCategory['philosophy'].supportingCount, 5)
  assert.equal(Q.getConfidence().level, 'HIGH')
  assert.deepEqual(Q.getProvenance().chain, ['M230', 'M252', 'M253', 'M254'])
  assert.equal(Q.getProvenance().origin.sourceMilestone, 'M230')
  assert.equal(Q.getValidationState().profileUsable, true)
})

test('every response is frozen (immutable)', () => {
  assert.ok(Object.isFrozen(Q.getSignalGroup('philosophy')))
  assert.ok(Object.isFrozen(Q.getCategory('philosophy')))
  assert.ok(Object.isFrozen(Q.getCoverage()))
  assert.ok(Object.isFrozen(Q.getEvidence()))
  assert.ok(Object.isFrozen(Q.getEvidence().byCategory))
  assert.ok(Object.isFrozen(Q.getProvenance()))
  assert.ok(Object.isFrozen(Q.getValidationState()))
})

test('malformed inputs fail safe — not usable, queries return null/empty, never throw', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let q
    assert.doesNotThrow(() => { q = createCoachDnaIntelligenceQuery(bad) })
    assert.equal(q.isUsable(), false)
    assert.equal(q.getSignalGroup('philosophy'), null)
    assert.equal(q.getCategory('philosophy'), null)
    assert.deepEqual(q.listPresentCategories(), [])
    assert.equal(q.getValidationState().profileUsable, false)
    assert.ok(Array.isArray(q.getValidationState().issues))
  }
})

test('repeated queries are byte-identical (deterministic)', () => {
  assert.equal(JSON.stringify(Q.getSignalGroup('philosophy')), JSON.stringify(Q.getSignalGroup('philosophy')))
  assert.equal(JSON.stringify(Q.getCoverage()), JSON.stringify(getCoverage(PROFILE)))
  assert.equal(JSON.stringify(Q.getProvenance()), JSON.stringify(getProvenance(INDEX)))
})

test('the one-shot helpers match the bound surface', () => {
  assert.deepEqual(getSignalGroup(PROFILE, 'philosophy'), Q.getSignalGroup('philosophy'))
  assert.deepEqual(getCategory(PROFILE, 'training-preference'), Q.getCategory('training-preference'))
  assert.deepEqual(getCoverage(INDEX), Q.getCoverage())
  assert.deepEqual(getEvidence(PROFILE), Q.getEvidence())
  assert.deepEqual(getConfidence(PROFILE), Q.getConfidence())
  assert.deepEqual(getValidationState(INDEX), Q.getValidationState())
})

test('provenance is consistent across profile-built and index-built surfaces', () => {
  const fromProfile = createCoachDnaIntelligenceQuery(PROFILE).getProvenance()
  const fromIndex = createCoachDnaIntelligenceQuery(INDEX).getProvenance()
  assert.deepEqual(fromProfile, fromIndex)
  assert.equal(fromProfile.profileFingerprint, PROFILE.profileFingerprint)
})

test('the source profile and index are never mutated', () => {
  const pBefore = JSON.parse(JSON.stringify(PROFILE))
  const xBefore = JSON.parse(JSON.stringify(INDEX))
  const q = createCoachDnaIntelligenceQuery({ profile: PROFILE, index: INDEX })
  q.getSignalGroup('philosophy'); q.getCoverage(); q.getEvidence(); q.getProvenance(); q.getValidationState()
  assert.deepEqual(JSON.parse(JSON.stringify(PROFILE)), pBefore)
  assert.deepEqual(JSON.parse(JSON.stringify(INDEX)), xBefore)
})

test('exports exist', () => {
  for (const fn of [createCoachDnaIntelligenceQuery, getSignalGroup, getCategory, getCoverage, getEvidence, getConfidence, getProvenance, getValidationState]) {
    assert.equal(typeof fn, 'function')
  }
})
