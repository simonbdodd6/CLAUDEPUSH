/**
 * web/brain-coach-dna-training-intelligence-inputs - Coach DNA Training Intelligence Inputs (M269) tests
 *
 * Verifies the second reasoning domain's first module: it projects an M255 query surface into training lenses
 * (each a re-view of one Coach DNA category), carries only existing aggregates, contains NO player data, makes
 * NO training recommendation and generates NO training content, leaves unknown as not-present, preserves
 * provenance back to M230, never mutates inputs, and is deeply frozen and byte-deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaTrainingIntelligenceInputs,
  summarizeCoachDnaTrainingIntelligenceInputs,
  serializeCoachDnaTrainingIntelligenceInputs,
} from '../web/brain-coach-dna-training-intelligence-inputs.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'

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

const FULL_SURFACE = createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(FULL_VIEW)))
const MINIMAL_SURFACE = createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(MINIMAL_VIEW)))
const T = buildCoachDnaTrainingIntelligenceInputs(FULL_SURFACE)

const ALL_LENSES = ['planningSignals', 'sessionStructureSignals', 'developmentSignals', 'technicalSignals', 'tacticalSignals', 'feedbackSignals']

test('a valid query surface derives the full training inputs shape', () => {
  assert.equal(T.type, 'coach-dna-training-intelligence-inputs')
  assert.equal(T.schemaVersion, 1)
  assert.equal(T.trainingInputsVersion, 1)
  assert.equal(T.milestone, 'M269')
  assert.equal(T.valid, true)
  for (const l of ALL_LENSES) assert.ok(typeof T[l] === 'object' && T[l] !== null, l)
  assert.match(T.trainingInputsFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('each lens re-views exactly one Coach DNA category with its existing aggregates', () => {
  assert.equal(T.planningSignals.sourceCategory, 'learned-pattern')
  assert.equal(T.sessionStructureSignals.sourceCategory, 'training-preference')
  assert.equal(T.developmentSignals.sourceCategory, 'player-management')
  assert.equal(T.technicalSignals.sourceCategory, 'training-preference')
  assert.equal(T.tacticalSignals.sourceCategory, 'tactical-preference')
  assert.equal(T.feedbackSignals.sourceCategory, 'communication-style')
  // training-preference is present, dominant, strongest, with the view's exact numbers
  const s = T.sessionStructureSignals
  assert.equal(s.present, true)
  assert.equal(s.isDominant, true)
  assert.equal(s.isStrongest, true)
  assert.equal(s.occurrences, 8)
  assert.equal(s.supportingCount, 6)
  assert.ok(!('supportingMemoryIds' in s))
})

test('two lenses sharing a source category project the same data (honestly)', () => {
  // sessionStructureSignals and technicalSignals both ← training-preference
  assert.equal(T.technicalSignals.sourceCategory, T.sessionStructureSignals.sourceCategory)
  assert.equal(T.technicalSignals.occurrences, T.sessionStructureSignals.occurrences)
  assert.equal(T.technicalSignals.supportingCount, T.sessionStructureSignals.supportingCount)
})

test('an absent source category yields an empty, not-present lens (invents nothing)', () => {
  // planningSignals ← learned-pattern, absent in the fixture
  assert.equal(T.planningSignals.present, false)
  assert.equal(T.planningSignals.occurrences, 0)
  // tacticalSignals ← tactical-preference, also absent
  assert.equal(T.tacticalSignals.present, false)
})

test('evidence coverage is projected per lens from the surface', () => {
  assert.equal(T.evidenceCoverage.totalMemories, 13)
  assert.equal(T.evidenceCoverage.totalEvidence, 21)
  assert.equal(T.evidenceCoverage.byLens.sessionStructureSignals.supportingCount, 6)
  assert.equal(T.evidenceCoverage.byLens.planningSignals.present, false)
})

test('confidence summary is copied from the surface', () => {
  assert.equal(T.confidenceSummary.level, 'HIGH')
  assert.equal(T.confidenceSummary.high, true)
  assert.equal(T.confidenceSummary.low, false)
})

test('contains NO player data and NO training-recommendation / content-generation', () => {
  const json = JSON.stringify(T)
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(json, /\b(ranking|ranked|scored|recommendation|recommended)\b/i)
  assert.doesNotMatch(json, FORBIDDEN_LANG)
  assert.equal(T.derivationMetadata.containsPlayerData, false)
  assert.equal(T.derivationMetadata.trainingRecommendation, false)
  assert.equal(T.derivationMetadata.generatesTrainingContent, false)
  assert.equal(T.derivationMetadata.analysesSessions, false)
  for (const l of ALL_LENSES) assert.ok(!Array.isArray(T[l]), l)
})

test('provenance preserves the chain back to M230', () => {
  assert.equal(T.provenance.source, 'coach-dna-intelligence-query')
  assert.equal(T.provenance.sourceMilestone, 'M255')
  assert.deepEqual(T.provenance.chain, ['M230', 'M252', 'M253', 'M254'])
  assert.equal(T.provenance.origin.sourceMilestone, 'M230')
  assert.equal(T.provenance.origin.profileVersion, 'coach-dna-v3')
  assert.equal(T.derivationMetadata.milestone, 'M269')
})

test('it can be built straight from a profile (surface built on demand)', () => {
  const profile = buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(FULL_VIEW))
  const t = buildCoachDnaTrainingIntelligenceInputs(profile)
  assert.equal(t.valid, true)
  assert.equal(t.sessionStructureSignals.occurrences, 8)
})

test('a minimal surface yields valid inputs with all lenses empty (unknown propagation)', () => {
  const t = buildCoachDnaTrainingIntelligenceInputs(MINIMAL_SURFACE)
  assert.equal(t.valid, true)
  for (const l of ALL_LENSES) assert.equal(t[l].present, false, l)
  assert.equal(t.confidenceSummary.level, 'LOW')
})

test('malformed inputs fail safe — valid:false, empty lenses, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let t
    assert.doesNotThrow(() => { t = buildCoachDnaTrainingIntelligenceInputs(bad) })
    assert.equal(t.valid, false)
    for (const l of ALL_LENSES) assert.equal(t[l].present, false, `${l} for ${JSON.stringify(bad)}`)
    assert.equal(t.evidenceCoverage.totalMemories, 0)
  }
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaTrainingIntelligenceInputs(FULL_SURFACE), serializeCoachDnaTrainingIntelligenceInputs(FULL_SURFACE))
  assert.equal(buildCoachDnaTrainingIntelligenceInputs(FULL_SURFACE).trainingInputsFingerprint, T.trainingInputsFingerprint)
  const profile = buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(FULL_VIEW))
  assert.equal(buildCoachDnaTrainingIntelligenceInputs(profile).trainingInputsFingerprint, T.trainingInputsFingerprint)
})

test('the source surface is never mutated', () => {
  const surface = createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(FULL_VIEW)))
  const before = JSON.stringify(surface.getProvenance())
  buildCoachDnaTrainingIntelligenceInputs(surface)
  assert.equal(JSON.stringify(surface.getProvenance()), before)
})

test('the output is deeply frozen', () => {
  assert.ok(Object.isFrozen(T))
  assert.ok(Object.isFrozen(T.sessionStructureSignals))
  assert.ok(Object.isFrozen(T.evidenceCoverage))
  assert.ok(Object.isFrozen(T.evidenceCoverage.byLens))
  assert.ok(Object.isFrozen(T.provenance))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaTrainingIntelligenceInputs(FULL_SURFACE, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-training-intelligence-inputs')
  const line = serializeCoachDnaTrainingIntelligenceInputs(FULL_SURFACE, { format: 'line' })
  assert.match(line, /^coach-dna-training-intelligence-inputs valid=true presentLenses=\d\/6 confidence=HIGH /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaTrainingIntelligenceInputs(FULL_SURFACE, { format: 'xml' }), /unsupported/)
})

test('the inputs and summary carry no recommendation or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaTrainingIntelligenceInputs(FULL_SURFACE), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaTrainingIntelligenceInputs(FULL_SURFACE), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaTrainingIntelligenceInputs(FULL_SURFACE), /training intelligence inputs: derived/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaTrainingIntelligenceInputs, 'function')
  assert.equal(typeof summarizeCoachDnaTrainingIntelligenceInputs, 'function')
  assert.equal(typeof serializeCoachDnaTrainingIntelligenceInputs, 'function')
})
