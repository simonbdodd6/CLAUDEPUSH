/**
 * web/brain-coach-dna-training-intelligence-characteristics - Coach DNA Training Intelligence Characteristics (M274) tests
 *
 * Verifies the training reasoning layer: it produces deterministic, rule-based descriptions of the COACH's
 * training tendencies (planning/sessionStructure/development/technical/tactical/feedback + evidence/confidence)
 * from the M272 surface. It analyses NO sessions, generates NO training content, evaluates NO players, makes NO
 * recommendation, leaves unknown as unknown, preserves provenance, never mutates inputs, and is deeply frozen
 * and byte-deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaTrainingIntelligenceCharacteristics,
  summarizeCoachDnaTrainingIntelligenceCharacteristics,
  serializeCoachDnaTrainingIntelligenceCharacteristics,
} from '../web/brain-coach-dna-training-intelligence-characteristics.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaTrainingIntelligenceInputs } from '../web/brain-coach-dna-training-intelligence-inputs.js'
import { buildCoachDnaTrainingIntelligenceProfile } from '../web/brain-coach-dna-training-intelligence-profile.js'
import { createCoachDnaTrainingIntelligenceQuery } from '../web/brain-coach-dna-training-intelligence-query.js'

const FORBIDDEN_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv|predict|forecast|ranking|ranked|scored|training plan|session plan|do this drill|run this session|session analysis)\b/i

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

const surfaceOf = (view) => createCoachDnaTrainingIntelligenceQuery(buildCoachDnaTrainingIntelligenceProfile(buildCoachDnaTrainingIntelligenceInputs(createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(view))))))
const FULL_SURFACE = surfaceOf(FULL_VIEW)
const MINIMAL_SURFACE = surfaceOf(MINIMAL_VIEW)
const C = buildCoachDnaTrainingIntelligenceCharacteristics(FULL_SURFACE)

const ALL_CHARS = ['planningCharacteristics', 'sessionStructureCharacteristics', 'developmentCharacteristics', 'technicalCharacteristics', 'tacticalCharacteristics', 'feedbackCharacteristics']

test('a valid surface produces the full characteristics shape', () => {
  assert.equal(C.type, 'coach-dna-training-intelligence-characteristics')
  assert.equal(C.schemaVersion, 1)
  assert.equal(C.characteristicsVersion, 1)
  assert.equal(C.milestone, 'M274')
  assert.equal(C.valid, true)
  for (const k of [...ALL_CHARS, 'evidenceCharacteristics', 'confidenceCharacteristics', 'provenance', 'derivationMetadata']) {
    assert.ok(typeof C[k] === 'object' && C[k] !== null, k)
  }
  assert.match(C.characteristicsFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('emphasis is classified by the documented strength rule', () => {
  // training-preference: present, dominant, strength 0.85 → strong (both sessionStructure and technical)
  assert.equal(C.sessionStructureCharacteristics.emphasis, 'strong')
  assert.equal(C.sessionStructureCharacteristics.isStrongest, true)
  assert.equal(C.technicalCharacteristics.emphasis, 'strong')     // shared source → same classification
  // player-management (development): present, dominant, strength 0.5 → moderate
  assert.equal(C.developmentCharacteristics.emphasis, 'moderate')
  // communication-style (feedback): theme-only present, strength 0 → low
  assert.equal(C.feedbackCharacteristics.present, true)
  assert.equal(C.feedbackCharacteristics.emphasis, 'low')
})

test('absent characteristics remain UNKNOWN (never inferred)', () => {
  // learned-pattern (planning) and tactical-preference (tactical) are absent in the fixture
  assert.equal(C.planningCharacteristics.present, false)
  assert.equal(C.planningCharacteristics.emphasis, 'unknown')
  assert.equal(C.planningCharacteristics.note, 'not evidenced in the available Coach DNA')
  assert.equal(C.tacticalCharacteristics.present, false)
  assert.equal(C.tacticalCharacteristics.emphasis, 'unknown')
})

test('evidence + confidence characteristics use documented rules', () => {
  assert.equal(C.evidenceCharacteristics.totalMemories, 13)
  assert.equal(C.evidenceCharacteristics.sufficiency, 'rich')                                    // 13 >= 10
  assert.equal(C.evidenceCharacteristics.byLens.sessionStructureSignals.level, 'well-evidenced') // 6 >= 4
  assert.equal(C.evidenceCharacteristics.byLens.developmentSignals.level, 'tentative')           // 2 in [1,4)
  assert.equal(C.evidenceCharacteristics.byLens.planningSignals.level, 'none')                   // 0
  assert.equal(C.confidenceCharacteristics.level, 'HIGH')
})

test('the documented thresholds are recorded in the output', () => {
  const t = C.derivationMetadata.thresholds
  assert.equal(t.strengthStrong, 0.66)
  assert.equal(t.strengthModerate, 0.33)
  assert.equal(t.evidenceWell, 4)
  assert.equal(t.sufficiencyRich, 10)
})

test('contains NO player data and NO training-recommendation/content/session-analysis behaviour', () => {
  const json = JSON.stringify(C)
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(json, /\b(ranking|ranked|scored|recommendation|recommended)\b/i)
  assert.doesNotMatch(json, FORBIDDEN_LANG)
  assert.equal(C.derivationMetadata.containsPlayerData, false)
  assert.equal(C.derivationMetadata.playerEvaluation, false)
  assert.equal(C.derivationMetadata.trainingRecommendation, false)
  assert.equal(C.derivationMetadata.generatesTrainingContent, false)
  assert.equal(C.derivationMetadata.analysesSessions, false)
  // no characteristic is an array (nothing ordered/ranked)
  for (const k of ALL_CHARS) assert.ok(!Array.isArray(C[k]), k)
})

test('provenance preserves the chain back to M230', () => {
  assert.equal(C.provenance.source, 'coach-dna-training-intelligence-query')
  assert.equal(C.provenance.sourceMilestone, 'M272')
  assert.deepEqual(C.provenance.chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M269', 'M270', 'M271'])
  assert.equal(C.provenance.origin.sourceMilestone, 'M255')
  assert.equal(C.derivationMetadata.milestone, 'M274')
})

test('it can be built straight from a profile (surface built on demand)', () => {
  const profile = buildCoachDnaTrainingIntelligenceProfile(buildCoachDnaTrainingIntelligenceInputs(createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(FULL_VIEW)))))
  const c = buildCoachDnaTrainingIntelligenceCharacteristics(profile)
  assert.equal(c.valid, true)
  assert.equal(c.sessionStructureCharacteristics.emphasis, 'strong')
})

test('a minimal surface yields all-unknown characteristics (valid, but nothing evidenced)', () => {
  const c = buildCoachDnaTrainingIntelligenceCharacteristics(MINIMAL_SURFACE)
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
    assert.doesNotThrow(() => { c = buildCoachDnaTrainingIntelligenceCharacteristics(bad) })
    assert.equal(c.valid, false)
    for (const k of ALL_CHARS) assert.equal(c[k].emphasis, 'unknown', `${k} for ${JSON.stringify(bad)}`)
    assert.equal(c.evidenceCharacteristics.sufficiency, 'unknown')
  }
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaTrainingIntelligenceCharacteristics(FULL_SURFACE), serializeCoachDnaTrainingIntelligenceCharacteristics(FULL_SURFACE))
  assert.equal(buildCoachDnaTrainingIntelligenceCharacteristics(FULL_SURFACE).characteristicsFingerprint, C.characteristicsFingerprint)
})

test('the source surface is never mutated', () => {
  const before = JSON.stringify(FULL_SURFACE.getProvenance())
  buildCoachDnaTrainingIntelligenceCharacteristics(FULL_SURFACE)
  assert.equal(JSON.stringify(FULL_SURFACE.getProvenance()), before)
})

test('the output is deeply frozen', () => {
  assert.ok(Object.isFrozen(C))
  assert.ok(Object.isFrozen(C.sessionStructureCharacteristics))
  assert.ok(Object.isFrozen(C.evidenceCharacteristics))
  assert.ok(Object.isFrozen(C.evidenceCharacteristics.byLens))
  assert.ok(Object.isFrozen(C.provenance))
  assert.ok(Object.isFrozen(C.derivationMetadata.thresholds))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaTrainingIntelligenceCharacteristics(FULL_SURFACE, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-training-intelligence-characteristics')
  const line = serializeCoachDnaTrainingIntelligenceCharacteristics(FULL_SURFACE, { format: 'line' })
  assert.match(line, /^coach-dna-training-intelligence-characteristics valid=true sessionStructure=strong /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaTrainingIntelligenceCharacteristics(FULL_SURFACE, { format: 'xml' }), /unsupported/)
})

test('the characteristics and summary carry no recommendation, content or session-analysis language', () => {
  assert.doesNotMatch(serializeCoachDnaTrainingIntelligenceCharacteristics(FULL_SURFACE), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaTrainingIntelligenceCharacteristics(FULL_SURFACE), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaTrainingIntelligenceCharacteristics(FULL_SURFACE), /training characteristics: described/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaTrainingIntelligenceCharacteristics, 'function')
  assert.equal(typeof summarizeCoachDnaTrainingIntelligenceCharacteristics, 'function')
  assert.equal(typeof serializeCoachDnaTrainingIntelligenceCharacteristics, 'function')
})
