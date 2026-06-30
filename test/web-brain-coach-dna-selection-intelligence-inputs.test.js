/**
 * web/brain-coach-dna-selection-intelligence-inputs - Coach DNA Selection Intelligence Inputs (M261) tests
 *
 * Verifies the first domain consumer: it projects an M255 query surface into selection lenses (each a re-view
 * of one Coach DNA category), carries only existing aggregates, contains NO player data and performs NO
 * scoring/ranking/recommendation, preserves provenance back to M230, never mutates inputs, and is deeply frozen
 * and byte-deterministic. Minimal surfaces yield empty lenses; malformed inputs fail safe.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaSelectionIntelligenceInputs,
  summarizeCoachDnaSelectionIntelligenceInputs,
  serializeCoachDnaSelectionIntelligenceInputs,
} from '../web/brain-coach-dna-selection-intelligence-inputs.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'

// Recommendation/ranking/prediction language the output must never contain.
const FORBIDDEN_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv|predict|forecast|rank(ed|ing)?|score(d|s)?|select him|start him|bench him)\b/i

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

const FULL_SURFACE = createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(FULL_VIEW)))
const MINIMAL_SURFACE = createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(MINIMAL_VIEW)))
const SEL = buildCoachDnaSelectionIntelligenceInputs(FULL_SURFACE)

const ALL_LENSES = ['selectionSignals', 'playerTrustSignals', 'continuitySignals', 'rotationSignals', 'availabilitySignals']

test('a valid query surface derives the full selection inputs shape', () => {
  assert.equal(SEL.type, 'coach-dna-selection-intelligence-inputs')
  assert.equal(SEL.schemaVersion, 1)
  assert.equal(SEL.selectionInputsVersion, 1)
  assert.equal(SEL.milestone, 'M261')
  assert.equal(SEL.valid, true)
  for (const l of ALL_LENSES) assert.ok(typeof SEL[l] === 'object' && SEL[l] !== null, l)
  assert.match(SEL.selectionInputsFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('each lens re-views exactly one Coach DNA category with its existing aggregates', () => {
  assert.equal(SEL.selectionSignals.sourceCategory, 'selection-preference')
  assert.equal(SEL.playerTrustSignals.sourceCategory, 'player-management')
  assert.equal(SEL.continuitySignals.sourceCategory, 'philosophy')
  assert.equal(SEL.rotationSignals.sourceCategory, 'tactical-preference')
  assert.equal(SEL.availabilitySignals.sourceCategory, 'risk-warning')
  // selection-preference is present, dominant, strongest, with the view's exact numbers
  const s = SEL.selectionSignals
  assert.equal(s.present, true)
  assert.equal(s.isDominant, true)
  assert.equal(s.isStrongest, true)
  assert.equal(s.occurrences, 7)
  assert.equal(s.strength, 0.9)
  assert.equal(s.supportingCount, 6)
  // never leaks raw ids
  assert.ok(!('supportingMemoryIds' in s))
})

test('an absent source category yields an empty, not-present lens (invents nothing)', () => {
  // rotationSignals ← tactical-preference, which is absent in the fixture
  assert.equal(SEL.rotationSignals.present, false)
  assert.equal(SEL.rotationSignals.occurrences, 0)
  assert.equal(SEL.rotationSignals.strength, 0)
  // availabilitySignals ← risk-warning, also absent
  assert.equal(SEL.availabilitySignals.present, false)
})

test('contains NO player data and NO scoring/ranking/recommendation fields', () => {
  const json = JSON.stringify(SEL)
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(json, /\b(rank|ranking|ranked|score|scored|recommendation|recommended)\b/i)
  assert.doesNotMatch(json, FORBIDDEN_LANG)
  // metadata explicitly disclaims player behaviour
  assert.equal(SEL.derivationMetadata.containsPlayerData, false)
  assert.equal(SEL.derivationMetadata.playerScoring, false)
  assert.equal(SEL.derivationMetadata.playerRanking, false)
  assert.equal(SEL.derivationMetadata.playerRecommendation, false)
  // no lens is an array (so nothing is ordered/ranked)
  for (const l of ALL_LENSES) assert.ok(!Array.isArray(SEL[l]), l)
})

test('evidence coverage is projected per lens from the surface', () => {
  assert.equal(SEL.evidenceCoverage.totalMemories, 14)
  assert.equal(SEL.evidenceCoverage.totalEvidence, 22)
  assert.equal(SEL.evidenceCoverage.byLens.selectionSignals.supportingCount, 6)
  assert.equal(SEL.evidenceCoverage.byLens.rotationSignals.present, false)
})

test('confidence summary is copied from the surface (no new thresholds)', () => {
  assert.equal(SEL.confidenceSummary.level, 'HIGH')
  assert.equal(SEL.confidenceSummary.high, true)
  assert.equal(SEL.confidenceSummary.low, false)
})

test('provenance preserves the chain back to M230', () => {
  assert.equal(SEL.provenance.source, 'coach-dna-intelligence-query')
  assert.equal(SEL.provenance.sourceMilestone, 'M255')
  assert.deepEqual(SEL.provenance.chain, ['M230', 'M252', 'M253', 'M254'])
  assert.equal(SEL.provenance.origin.sourceMilestone, 'M230')
  assert.equal(SEL.provenance.origin.profileVersion, 'coach-dna-v3')
  assert.equal(SEL.derivationMetadata.milestone, 'M261')
})

test('it can be built straight from a profile (surface built on demand)', () => {
  const profile = buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(FULL_VIEW))
  const s = buildCoachDnaSelectionIntelligenceInputs(profile)
  assert.equal(s.valid, true)
  assert.equal(s.selectionSignals.occurrences, 7)
})

test('a minimal surface yields valid inputs with all lenses empty', () => {
  const s = buildCoachDnaSelectionIntelligenceInputs(MINIMAL_SURFACE)
  assert.equal(s.valid, true)
  for (const l of ALL_LENSES) assert.equal(s[l].present, false, l)
  assert.equal(s.confidenceSummary.level, 'LOW')
})

test('malformed inputs fail safe — valid:false, empty lenses, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let s
    assert.doesNotThrow(() => { s = buildCoachDnaSelectionIntelligenceInputs(bad) })
    assert.equal(s.valid, false)
    for (const l of ALL_LENSES) assert.equal(s[l].present, false, `${l} for ${JSON.stringify(bad)}`)
    assert.equal(s.evidenceCoverage.totalMemories, 0)
  }
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaSelectionIntelligenceInputs(FULL_SURFACE), serializeCoachDnaSelectionIntelligenceInputs(FULL_SURFACE))
  assert.equal(buildCoachDnaSelectionIntelligenceInputs(FULL_SURFACE).selectionInputsFingerprint, SEL.selectionInputsFingerprint)
  // structurally-identical distinct profile → same fingerprint
  const profile = buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(FULL_VIEW))
  assert.equal(buildCoachDnaSelectionIntelligenceInputs(profile).selectionInputsFingerprint, SEL.selectionInputsFingerprint)
})

test('the source surface is never mutated', () => {
  const surface = createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(FULL_VIEW)))
  const before = JSON.stringify(surface.getProvenance())
  buildCoachDnaSelectionIntelligenceInputs(surface)
  assert.equal(JSON.stringify(surface.getProvenance()), before)
})

test('the output is deeply frozen', () => {
  assert.ok(Object.isFrozen(SEL))
  assert.ok(Object.isFrozen(SEL.selectionSignals))
  assert.ok(Object.isFrozen(SEL.evidenceCoverage))
  assert.ok(Object.isFrozen(SEL.evidenceCoverage.byLens))
  assert.ok(Object.isFrozen(SEL.provenance))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaSelectionIntelligenceInputs(FULL_SURFACE, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-selection-intelligence-inputs')
  const line = serializeCoachDnaSelectionIntelligenceInputs(FULL_SURFACE, { format: 'line' })
  assert.match(line, /^coach-dna-selection-intelligence-inputs valid=true presentLenses=\d\/5 confidence=HIGH /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaSelectionIntelligenceInputs(FULL_SURFACE, { format: 'xml' }), /unsupported/)
})

test('the inputs and summary carry no recommendation, ranking or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaSelectionIntelligenceInputs(FULL_SURFACE), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaSelectionIntelligenceInputs(FULL_SURFACE), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaSelectionIntelligenceInputs(FULL_SURFACE), /selection intelligence inputs: derived/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaSelectionIntelligenceInputs, 'function')
  assert.equal(typeof summarizeCoachDnaSelectionIntelligenceInputs, 'function')
  assert.equal(typeof serializeCoachDnaSelectionIntelligenceInputs, 'function')
})
