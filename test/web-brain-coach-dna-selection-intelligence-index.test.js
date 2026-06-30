/**
 * web/brain-coach-dna-selection-intelligence-index - Coach DNA Selection Intelligence Index (M263) tests
 *
 * Verifies the selection navigation layer: it turns an M262 selection profile into keyed lookup surfaces (lens,
 * evidence, confidence, provenance), lets a downstream module query one lens in O(1) without walking the
 * profile, contains NO player data and does NO scoring/ranking/recommendation, preserves provenance back to
 * M230, never mutates inputs, and is deeply frozen and byte-deterministic. Minimal profiles index empty;
 * malformed profiles fail safe.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaSelectionIntelligenceIndex,
  summarizeCoachDnaSelectionIntelligenceIndex,
  serializeCoachDnaSelectionIntelligenceIndex,
} from '../web/brain-coach-dna-selection-intelligence-index.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaSelectionIntelligenceInputs } from '../web/brain-coach-dna-selection-intelligence-inputs.js'
import { buildCoachDnaSelectionIntelligenceProfile } from '../web/brain-coach-dna-selection-intelligence-profile.js'

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

const selProfile = (view) => buildCoachDnaSelectionIntelligenceProfile(buildCoachDnaSelectionIntelligenceInputs(createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(view)))))
const FULL_PROFILE = freeze(JSON.parse(JSON.stringify(selProfile(FULL_VIEW))))
const MINIMAL_PROFILE = freeze(JSON.parse(JSON.stringify(selProfile(MINIMAL_VIEW))))
const INDEX = buildCoachDnaSelectionIntelligenceIndex(FULL_PROFILE)

const ALL_LENSES = ['selectionSignals', 'playerTrustSignals', 'continuitySignals', 'rotationSignals', 'availabilitySignals']

test('a valid profile builds the full index shape', () => {
  assert.equal(INDEX.type, 'coach-dna-selection-intelligence-index')
  assert.equal(INDEX.schemaVersion, 1)
  assert.equal(INDEX.indexVersion, 1)
  assert.equal(INDEX.validationState.profileUsable, true)
  for (const k of ['lensIndex', 'evidenceIndex', 'confidenceIndex', 'provenanceIndex', 'validationState', 'derivationMetadata']) {
    assert.ok(isObj(INDEX[k]), k)
  }
  assert.match(INDEX.indexFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }

test('the lens index keys all five lenses for O(1) lookup', () => {
  assert.deepEqual(Object.keys(INDEX.lensIndex).sort(), [...ALL_LENSES].sort())
  const sel = INDEX.lensIndex['selectionSignals']
  assert.equal(sel.present, true)
  assert.equal(sel.isStrongest, true)
  assert.equal(sel.occurrences, 7)
  assert.equal(sel.sourceCategory, 'selection-preference')
  assert.equal(INDEX.lensIndex['rotationSignals'].present, false)
  // never leaks raw ids
  assert.ok(!('supportingMemoryIds' in sel))
})

test('the evidence + confidence indexes roll up per lens', () => {
  assert.equal(INDEX.evidenceIndex.totalMemories, 14)
  assert.deepEqual(Object.keys(INDEX.evidenceIndex.byLens).sort(), [...ALL_LENSES].sort())
  assert.equal(INDEX.evidenceIndex.byLens.selectionSignals.supportingCount, 6)
  assert.equal(INDEX.confidenceIndex.level, 'HIGH')
  assert.equal(INDEX.confidenceIndex.byLens.selectionSignals.averageConfidence, 0.8)
})

test('the provenance index preserves the selection lineage back to M230', () => {
  const p = INDEX.provenanceIndex
  assert.deepEqual(p.chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M261', 'M262', 'M263'])
  assert.equal(p.profileFingerprint, FULL_PROFILE.profileFingerprint)
  assert.equal(INDEX.profileFingerprint, FULL_PROFILE.profileFingerprint)
  assert.equal(p.selectionInputsFingerprint, FULL_PROFILE.selectionInputsFingerprint)
  assert.equal(p.byMilestone.M262.fingerprint, FULL_PROFILE.profileFingerprint)
  assert.equal(p.byMilestone.M261.fingerprint, FULL_PROFILE.selectionInputsFingerprint)
  assert.equal(p.origin.sourceMilestone, 'M255')
})

test('contains NO player data and NO scoring/ranking fields', () => {
  const json = JSON.stringify(INDEX)
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(json, /\b(ranking|ranked|scored|recommendation|recommended)\b/i)
  assert.doesNotMatch(json, FORBIDDEN_LANG)
  assert.equal(INDEX.derivationMetadata.containsPlayerData, false)
  assert.equal(INDEX.derivationMetadata.playerScoring, false)
  assert.equal(INDEX.derivationMetadata.playerRanking, false)
  assert.equal(INDEX.derivationMetadata.playerRecommendation, false)
})

test('a minimal profile indexes empty but remains queryable', () => {
  const x = buildCoachDnaSelectionIntelligenceIndex(MINIMAL_PROFILE)
  assert.equal(x.validationState.profileUsable, true)
  assert.equal(Object.keys(x.lensIndex).length, 5)
  for (const l of ALL_LENSES) assert.equal(x.lensIndex[l].present, false, l)
  assert.equal(x.validationState.presentLenses, 0)
})

test('a malformed profile fails safe — unusable, total index, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let x
    assert.doesNotThrow(() => { x = buildCoachDnaSelectionIntelligenceIndex(bad) })
    assert.equal(x.validationState.profileUsable, false)
    assert.equal(Object.keys(x.lensIndex).length, 5)        // still total
    for (const l of ALL_LENSES) assert.equal(x.lensIndex[l].present, false, l)
    assert.equal(x.profileFingerprint, null)
    assert.ok(x.validationState.issues.length >= 1)
  }
})

test('repeated execution is byte-identical and the fingerprint is stable', () => {
  assert.equal(serializeCoachDnaSelectionIntelligenceIndex(FULL_PROFILE), serializeCoachDnaSelectionIntelligenceIndex(FULL_PROFILE))
  assert.equal(buildCoachDnaSelectionIntelligenceIndex(FULL_PROFILE).indexFingerprint, INDEX.indexFingerprint)
  const copy = JSON.parse(JSON.stringify(FULL_PROFILE))
  assert.equal(buildCoachDnaSelectionIntelligenceIndex(copy).indexFingerprint, INDEX.indexFingerprint)
})

test('the source profile is never mutated', () => {
  const before = JSON.parse(JSON.stringify(FULL_PROFILE))
  buildCoachDnaSelectionIntelligenceIndex(FULL_PROFILE)
  assert.deepEqual(JSON.parse(JSON.stringify(FULL_PROFILE)), before)
})

test('the output is deeply frozen', () => {
  assert.ok(Object.isFrozen(INDEX))
  assert.ok(Object.isFrozen(INDEX.lensIndex))
  assert.ok(Object.isFrozen(INDEX.lensIndex['selectionSignals']))
  assert.ok(Object.isFrozen(INDEX.evidenceIndex.byLens))
  assert.ok(Object.isFrozen(INDEX.confidenceIndex))
  assert.ok(Object.isFrozen(INDEX.provenanceIndex))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaSelectionIntelligenceIndex(FULL_PROFILE, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-selection-intelligence-index')
  const line = serializeCoachDnaSelectionIntelligenceIndex(FULL_PROFILE, { format: 'line' })
  assert.match(line, /^coach-dna-selection-intelligence-index usable=true present=3\/5 confidence=HIGH /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaSelectionIntelligenceIndex(FULL_PROFILE, { format: 'xml' }), /unsupported/)
})

test('the index and summary carry no recommendation, ranking or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaSelectionIntelligenceIndex(FULL_PROFILE), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaSelectionIntelligenceIndex(FULL_PROFILE), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaSelectionIntelligenceIndex(FULL_PROFILE), /selection intelligence index: queryable/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaSelectionIntelligenceIndex, 'function')
  assert.equal(typeof summarizeCoachDnaSelectionIntelligenceIndex, 'function')
  assert.equal(typeof serializeCoachDnaSelectionIntelligenceIndex, 'function')
})
