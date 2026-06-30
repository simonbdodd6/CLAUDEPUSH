/**
 * web/brain-coach-dna-selection-intelligence-characteristics - Coach DNA Selection Intelligence Characteristics (M266) tests
 *
 * Verifies the first selection reasoning layer: it produces deterministic, rule-based descriptions of the
 * COACH's selection behaviour (emphasis/continuity/rotation/trust/availability + evidence/confidence) from the
 * M264 surface. It selects/ranks/scores NO players, contains NO player data, makes NO recommendation, leaves
 * unknown as unknown, preserves provenance, never mutates inputs, and is deeply frozen and byte-deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaSelectionIntelligenceCharacteristics,
  summarizeCoachDnaSelectionIntelligenceCharacteristics,
  serializeCoachDnaSelectionIntelligenceCharacteristics,
} from '../web/brain-coach-dna-selection-intelligence-characteristics.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaSelectionIntelligenceInputs } from '../web/brain-coach-dna-selection-intelligence-inputs.js'
import { buildCoachDnaSelectionIntelligenceProfile } from '../web/brain-coach-dna-selection-intelligence-profile.js'
import { createCoachDnaSelectionIntelligenceQuery } from '../web/brain-coach-dna-selection-intelligence-query.js'

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
    { category: 'player-management', label: 'Player management', occurrences: 4, strength: 0.5, averageConfidence: 0.7, averageWeight: 0.6, supportingCount: 3 },
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

const surfaceOf = (view) => createCoachDnaSelectionIntelligenceQuery(buildCoachDnaSelectionIntelligenceProfile(buildCoachDnaSelectionIntelligenceInputs(createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(view))))))
const FULL_SURFACE = surfaceOf(FULL_VIEW)
const MINIMAL_SURFACE = surfaceOf(MINIMAL_VIEW)
const C = buildCoachDnaSelectionIntelligenceCharacteristics(FULL_SURFACE)

const ALL_CHARS = ['selectionEmphasis', 'continuityCharacteristics', 'rotationCharacteristics', 'trustCharacteristics', 'availabilityCharacteristics']

test('a valid surface produces the full characteristics shape', () => {
  assert.equal(C.type, 'coach-dna-selection-intelligence-characteristics')
  assert.equal(C.schemaVersion, 1)
  assert.equal(C.milestone, 'M266')
  assert.equal(C.valid, true)
  for (const k of [...ALL_CHARS, 'evidenceCharacteristics', 'confidenceCharacteristics', 'provenance', 'derivationMetadata']) {
    assert.ok(typeof C[k] === 'object' && C[k] !== null, k)
  }
  assert.match(C.characteristicsFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('selection emphasis is classified by the documented strength rule', () => {
  // selection-preference: present, dominant, strength 0.9 → strong
  assert.equal(C.selectionEmphasis.emphasis, 'strong')
  assert.equal(C.selectionEmphasis.present, true)
  assert.equal(C.selectionEmphasis.isStrongest, true)
  // player-management: present, dominant, strength 0.5 → moderate (>=0.33, <0.66)
  assert.equal(C.trustCharacteristics.emphasis, 'moderate')
  // philosophy (continuity): theme-only present, strength 0 → low
  assert.equal(C.continuityCharacteristics.present, true)
  assert.equal(C.continuityCharacteristics.emphasis, 'low')
})

test('absent characteristics remain UNKNOWN (never inferred)', () => {
  // tactical-preference (rotation) and risk-warning (availability) are absent in the fixture
  assert.equal(C.rotationCharacteristics.present, false)
  assert.equal(C.rotationCharacteristics.emphasis, 'unknown')
  assert.equal(C.rotationCharacteristics.note, 'not evidenced in the available Coach DNA')
  assert.equal(C.availabilityCharacteristics.present, false)
  assert.equal(C.availabilityCharacteristics.emphasis, 'unknown')
})

test('evidence + confidence characteristics use documented rules', () => {
  assert.equal(C.evidenceCharacteristics.totalMemories, 14)
  assert.equal(C.evidenceCharacteristics.sufficiency, 'rich')           // 14 >= 10
  assert.equal(C.evidenceCharacteristics.byLens.selectionSignals.level, 'well-evidenced')  // 6 >= 4
  assert.equal(C.evidenceCharacteristics.byLens.playerTrustSignals.level, 'tentative')     // 3 in [1,4)
  assert.equal(C.evidenceCharacteristics.byLens.rotationSignals.level, 'none')             // 0
  assert.equal(C.confidenceCharacteristics.level, 'HIGH')
})

test('the documented thresholds are recorded in the output', () => {
  const t = C.derivationMetadata.thresholds
  assert.equal(t.strengthStrong, 0.66)
  assert.equal(t.strengthModerate, 0.33)
  assert.equal(t.evidenceWell, 4)
  assert.equal(t.sufficiencyRich, 10)
})

test('contains NO player data and NO selection/ranking/scoring behaviour', () => {
  const json = JSON.stringify(C)
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(json, /\b(ranking|ranked|scored|recommendation|recommended)\b/i)
  assert.doesNotMatch(json, FORBIDDEN_LANG)
  assert.equal(C.derivationMetadata.containsPlayerData, false)
  assert.equal(C.derivationMetadata.playerSelection, false)
  assert.equal(C.derivationMetadata.playerRanking, false)
  assert.equal(C.derivationMetadata.playerScoring, false)
  assert.equal(C.derivationMetadata.teamRecommendation, false)
  // no characteristic is an array (nothing ordered/ranked)
  for (const k of ALL_CHARS) assert.ok(!Array.isArray(C[k]), k)
})

test('provenance preserves the chain back to M230', () => {
  assert.equal(C.provenance.source, 'coach-dna-selection-intelligence-query')
  assert.equal(C.provenance.sourceMilestone, 'M264')
  assert.deepEqual(C.provenance.chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M261', 'M262', 'M263'])
  assert.equal(C.provenance.origin.sourceMilestone, 'M255')
  assert.equal(C.derivationMetadata.milestone, 'M266')
})

test('it can be built straight from a profile (surface built on demand)', () => {
  const profile = buildCoachDnaSelectionIntelligenceProfile(buildCoachDnaSelectionIntelligenceInputs(createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(FULL_VIEW)))))
  const c = buildCoachDnaSelectionIntelligenceCharacteristics(profile)
  assert.equal(c.valid, true)
  assert.equal(c.selectionEmphasis.emphasis, 'strong')
})

test('a minimal surface yields all-unknown characteristics (valid, but nothing evidenced)', () => {
  const c = buildCoachDnaSelectionIntelligenceCharacteristics(MINIMAL_SURFACE)
  assert.equal(c.valid, true)
  for (const k of ALL_CHARS) {
    assert.equal(c[k].present, false, k)
    assert.equal(c[k].emphasis, 'unknown', k)
  }
  assert.equal(c.evidenceCharacteristics.sufficiency, 'unknown')
  assert.equal(c.confidenceCharacteristics.level, 'LOW')
})

test('malformed inputs fail safe — valid:false, all unknown, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let c
    assert.doesNotThrow(() => { c = buildCoachDnaSelectionIntelligenceCharacteristics(bad) })
    assert.equal(c.valid, false)
    for (const k of ALL_CHARS) assert.equal(c[k].emphasis, 'unknown', `${k} for ${JSON.stringify(bad)}`)
    assert.equal(c.evidenceCharacteristics.sufficiency, 'unknown')
  }
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaSelectionIntelligenceCharacteristics(FULL_SURFACE), serializeCoachDnaSelectionIntelligenceCharacteristics(FULL_SURFACE))
  assert.equal(buildCoachDnaSelectionIntelligenceCharacteristics(FULL_SURFACE).characteristicsFingerprint, C.characteristicsFingerprint)
})

test('the source surface is never mutated', () => {
  const before = JSON.stringify(FULL_SURFACE.getProvenance())
  buildCoachDnaSelectionIntelligenceCharacteristics(FULL_SURFACE)
  assert.equal(JSON.stringify(FULL_SURFACE.getProvenance()), before)
})

test('the output is deeply frozen', () => {
  assert.ok(Object.isFrozen(C))
  assert.ok(Object.isFrozen(C.selectionEmphasis))
  assert.ok(Object.isFrozen(C.evidenceCharacteristics))
  assert.ok(Object.isFrozen(C.evidenceCharacteristics.byLens))
  assert.ok(Object.isFrozen(C.provenance))
  assert.ok(Object.isFrozen(C.derivationMetadata.thresholds))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaSelectionIntelligenceCharacteristics(FULL_SURFACE, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-selection-intelligence-characteristics')
  const line = serializeCoachDnaSelectionIntelligenceCharacteristics(FULL_SURFACE, { format: 'line' })
  assert.match(line, /^coach-dna-selection-intelligence-characteristics valid=true selectionEmphasis=strong /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaSelectionIntelligenceCharacteristics(FULL_SURFACE, { format: 'xml' }), /unsupported/)
})

test('the characteristics and summary carry no recommendation, ranking or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaSelectionIntelligenceCharacteristics(FULL_SURFACE), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaSelectionIntelligenceCharacteristics(FULL_SURFACE), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaSelectionIntelligenceCharacteristics(FULL_SURFACE), /selection characteristics: described/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaSelectionIntelligenceCharacteristics, 'function')
  assert.equal(typeof summarizeCoachDnaSelectionIntelligenceCharacteristics, 'function')
  assert.equal(typeof serializeCoachDnaSelectionIntelligenceCharacteristics, 'function')
})
