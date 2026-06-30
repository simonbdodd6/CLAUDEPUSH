/**
 * web/brain-coach-dna-selection-intelligence-profile - Coach DNA Selection Intelligence Profile (M262) tests
 *
 * Verifies the assembled selection object: it folds the five M261 lenses into one profile (lens summary,
 * evidence coverage, confidence), contains NO player data and performs NO scoring/ranking/recommendation,
 * preserves provenance back to M230, never mutates inputs, and is deeply frozen and byte-deterministic. Minimal
 * inputs yield an empty-but-usable profile; malformed inputs fail safe.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaSelectionIntelligenceProfile,
  summarizeCoachDnaSelectionIntelligenceProfile,
  serializeCoachDnaSelectionIntelligenceProfile,
} from '../web/brain-coach-dna-selection-intelligence-profile.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaSelectionIntelligenceInputs } from '../web/brain-coach-dna-selection-intelligence-inputs.js'

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

const selInputs = (view) => buildCoachDnaSelectionIntelligenceInputs(createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(view))))
const FULL_INPUTS = freeze(JSON.parse(JSON.stringify(selInputs(FULL_VIEW))))
const MINIMAL_INPUTS = freeze(JSON.parse(JSON.stringify(selInputs(MINIMAL_VIEW))))
const PROFILE = buildCoachDnaSelectionIntelligenceProfile(FULL_INPUTS)

const ALL_LENSES = ['selectionSignals', 'playerTrustSignals', 'continuitySignals', 'rotationSignals', 'availabilitySignals']

test('valid inputs assemble the full selection profile shape', () => {
  assert.equal(PROFILE.type, 'coach-dna-selection-intelligence-profile')
  assert.equal(PROFILE.schemaVersion, 1)
  assert.equal(PROFILE.profileVersion, 'selection-intelligence-profile-v1')
  assert.equal(PROFILE.validationState.usable, true)
  for (const k of ['selectionLensSummary', 'evidenceCoverage', 'confidenceSummary', 'provenance', 'validationState', 'derivationMetadata']) {
    assert.ok(isObj(PROFILE[k]), k)
  }
  assert.match(PROFILE.profileFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }

test('the lens summary aggregates the M261 lenses in fixed order (not ranked)', () => {
  const s = PROFILE.selectionLensSummary
  assert.equal(s.totalLenses, 5)
  assert.equal(s.presentLenses, 3)          // selection, playerTrust, continuity present
  assert.equal(s.dominantLenses, 2)         // selection, playerTrust
  assert.equal(s.totalOccurrences, 11)      // 7 + 4
  assert.equal(s.totalSupporting, 9)        // 6 + 3
  assert.equal(s.strongestLens, 'selectionSignals')
  assert.equal(s.weakestLens, 'availabilitySignals')
  // fixed order — exactly the M261 lens order, not sorted by strength
  assert.deepEqual(s.lenses.map((l) => l.lens), ALL_LENSES)
})

test('contains NO player data and NO scoring/ranking fields', () => {
  const json = JSON.stringify(PROFILE)
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(json, /\b(ranking|ranked|scored|recommendation|recommended)\b/i)
  assert.doesNotMatch(json, FORBIDDEN_LANG)
  assert.equal(PROFILE.derivationMetadata.containsPlayerData, false)
  assert.equal(PROFILE.derivationMetadata.playerScoring, false)
  assert.equal(PROFILE.derivationMetadata.playerRanking, false)
  assert.equal(PROFILE.derivationMetadata.playerRecommendation, false)
})

test('evidence coverage and confidence are carried forward', () => {
  assert.equal(PROFILE.evidenceCoverage.totalMemories, 14)
  assert.equal(PROFILE.evidenceCoverage.byLens.selectionSignals.supportingCount, 6)
  assert.equal(PROFILE.confidenceSummary.level, 'HIGH')
  assert.equal(PROFILE.confidenceSummary.high, true)
})

test('provenance preserves the chain back through M261 to M230', () => {
  assert.equal(PROFILE.provenance.source, 'coach-dna-selection-intelligence-inputs')
  assert.equal(PROFILE.provenance.sourceMilestone, 'M261')
  assert.equal(PROFILE.provenance.selectionInputsFingerprint, FULL_INPUTS.selectionInputsFingerprint)
  assert.equal(PROFILE.selectionInputsFingerprint, FULL_INPUTS.selectionInputsFingerprint)
  assert.equal(PROFILE.provenance.origin.sourceMilestone, 'M255')
  assert.deepEqual(PROFILE.provenance.origin.chain, ['M230', 'M252', 'M253', 'M254'])
  assert.equal(PROFILE.derivationMetadata.milestone, 'M262')
})

test('minimal inputs yield an empty but usable profile', () => {
  const p = buildCoachDnaSelectionIntelligenceProfile(MINIMAL_INPUTS)
  assert.equal(p.validationState.usable, true)
  assert.equal(p.selectionLensSummary.presentLenses, 0)
  assert.equal(p.selectionLensSummary.strongestLens, null)
  assert.equal(p.confidenceSummary.level, 'LOW')
})

test('malformed inputs fail safe — unusable, empty, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }, { type: 'coach-dna-selection-intelligence-inputs', valid: false }]) {
    let p
    assert.doesNotThrow(() => { p = buildCoachDnaSelectionIntelligenceProfile(bad) })
    assert.equal(p.validationState.usable, false)
    assert.equal(p.selectionLensSummary.presentLenses, 0)
    assert.equal(p.confidenceSummary.low, true)
    assert.ok(p.validationState.issues.length >= 1)
  }
})

test('repeated execution is byte-identical and the fingerprint is stable', () => {
  assert.equal(serializeCoachDnaSelectionIntelligenceProfile(FULL_INPUTS), serializeCoachDnaSelectionIntelligenceProfile(FULL_INPUTS))
  assert.equal(buildCoachDnaSelectionIntelligenceProfile(FULL_INPUTS).profileFingerprint, PROFILE.profileFingerprint)
  const copy = JSON.parse(JSON.stringify(FULL_INPUTS))
  assert.equal(buildCoachDnaSelectionIntelligenceProfile(copy).profileFingerprint, PROFILE.profileFingerprint)
})

test('the source inputs are never mutated', () => {
  const before = JSON.parse(JSON.stringify(FULL_INPUTS))
  buildCoachDnaSelectionIntelligenceProfile(FULL_INPUTS)
  assert.deepEqual(JSON.parse(JSON.stringify(FULL_INPUTS)), before)
})

test('the output is deeply frozen', () => {
  assert.ok(Object.isFrozen(PROFILE))
  assert.ok(Object.isFrozen(PROFILE.selectionLensSummary))
  assert.ok(Object.isFrozen(PROFILE.selectionLensSummary.lenses))
  assert.ok(Object.isFrozen(PROFILE.evidenceCoverage))
  assert.ok(Object.isFrozen(PROFILE.provenance))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaSelectionIntelligenceProfile(FULL_INPUTS, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-selection-intelligence-profile')
  const line = serializeCoachDnaSelectionIntelligenceProfile(FULL_INPUTS, { format: 'line' })
  assert.match(line, /^coach-dna-selection-intelligence-profile usable=true lenses=3\/5 confidence=HIGH /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaSelectionIntelligenceProfile(FULL_INPUTS, { format: 'xml' }), /unsupported/)
})

test('the profile and summary carry no recommendation, ranking or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaSelectionIntelligenceProfile(FULL_INPUTS), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaSelectionIntelligenceProfile(FULL_INPUTS), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaSelectionIntelligenceProfile(FULL_INPUTS), /selection intelligence profile: usable/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaSelectionIntelligenceProfile, 'function')
  assert.equal(typeof summarizeCoachDnaSelectionIntelligenceProfile, 'function')
  assert.equal(typeof serializeCoachDnaSelectionIntelligenceProfile, 'function')
})
