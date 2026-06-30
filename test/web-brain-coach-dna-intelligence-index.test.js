/**
 * web/brain-coach-dna-intelligence-index - Coach DNA Intelligence Index (M254) tests
 *
 * Verifies the navigation layer: it turns an M253 intelligence profile into keyed lookup surfaces (category,
 * signal, evidence, provenance) plus a coverage summary, lets a downstream module query one category/signal in
 * O(1) without walking the profile, preserves provenance back through M253/M252 to M230, invents/predicts/
 * recommends nothing, never mutates inputs, and is deeply frozen and byte-deterministic. Minimal profiles index
 * empty; malformed profiles fail safe.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaIntelligenceIndex,
  summarizeCoachDnaIntelligenceIndex,
  serializeCoachDnaIntelligenceIndex,
} from '../web/brain-coach-dna-intelligence-index.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'

const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

function freeze(o) {
  if (o && typeof o === 'object') { for (const k of Object.keys(o)) freeze(o[k]); Object.freeze(o) }
  return o
}

// M230 coachView fixture → M252 inputs → M253 profile → fed to M254.
const FULL_VIEW = freeze({
  profileVersion: 'coach-dna-v3',
  confidence: { value: 0.72, level: 'HIGH', label: 'High' },
  headline: 'Philosophy focus',
  identity: {
    strongestCategory: 'philosophy', strongestLabel: 'Philosophy',
    weakestCategory: 'risk-warning', weakestLabel: 'Risk warnings',
    diversityScore: 0.5, diversityLabel: 'Balanced',
  },
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

const FULL_PROFILE = freeze(JSON.parse(JSON.stringify(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(FULL_VIEW)))))
const MINIMAL_PROFILE = freeze(JSON.parse(JSON.stringify(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(MINIMAL_VIEW)))))
const INDEX = buildCoachDnaIntelligenceIndex(FULL_PROFILE)

const ALL_CATEGORIES = ['philosophy', 'communication-style', 'training-preference', 'player-management', 'selection-preference', 'tactical-preference', 'learned-pattern', 'risk-warning']
const ALL_FIELDS = ['coachingStyleSignals', 'communicationSignals', 'trainingSignals', 'playerDevelopmentSignals', 'selectionSignals', 'tacticalSignals', 'planningSignals', 'riskSignals']

test('a valid profile builds the full index shape', () => {
  assert.equal(INDEX.type, 'coach-dna-intelligence-index')
  assert.equal(INDEX.schemaVersion, 1)
  assert.equal(INDEX.indexVersion, 1)
  assert.equal(INDEX.validationState.profileUsable, true)
  for (const k of ['categoryIndex', 'signalIndex', 'evidenceIndex', 'provenanceIndex', 'coverageSummary', 'validationState', 'derivationMetadata']) {
    assert.ok(isObj(INDEX[k]), k)
  }
  assert.match(INDEX.indexFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }

test('the category index keys all eight categories for O(1) lookup', () => {
  assert.deepEqual(Object.keys(INDEX.categoryIndex).sort(), [...ALL_CATEGORIES].sort())
  // a downstream module can look up one category directly
  const phil = INDEX.categoryIndex['philosophy']
  assert.equal(phil.present, true)
  assert.equal(phil.isStrongest, true)
  assert.equal(phil.signalKey, 'coachingStyleSignals')
  const sel = INDEX.categoryIndex['selection-preference']
  assert.equal(sel.present, false)
  assert.equal(sel.signalKey, 'selectionSignals')
})

test('the signal index keys all eight signal fields with their aggregates', () => {
  assert.deepEqual(Object.keys(INDEX.signalIndex).sort(), [...ALL_FIELDS].sort())
  const style = INDEX.signalIndex['coachingStyleSignals']
  assert.equal(style.category, 'philosophy')
  assert.equal(style.occurrences, 6)
  assert.equal(style.supportingCount, 5)
  assert.equal(style.isDominant, true)
  // never leaks raw ids
  assert.ok(!('supportingMemoryIds' in style))
})

test('the evidence index rolls up totals and a per-category presence map', () => {
  assert.equal(INDEX.evidenceIndex.totalMemories, 12)
  assert.equal(INDEX.evidenceIndex.totalEvidence, 20)
  assert.equal(INDEX.evidenceIndex.totalOntologyLinks, 8)
  assert.deepEqual(Object.keys(INDEX.evidenceIndex.byCategory).sort(), [...ALL_CATEGORIES].sort())
  assert.equal(INDEX.evidenceIndex.byCategory['philosophy'].supportingCount, 5)
  assert.equal(INDEX.evidenceIndex.byCategory['selection-preference'].present, false)
})

test('the coverage summary reflects the profile', () => {
  const c = INDEX.coverageSummary
  assert.equal(c.categoriesCovered, 3)
  assert.equal(c.categoriesPossible, 8)
  assert.equal(c.coverageRatio, 3 / 8)
  assert.equal(c.presentSignals, 3)
  assert.equal(c.dominantSignals, 2)
  assert.equal(c.totalSignals, 8)
  assert.equal(c.confidenceLevel, 'HIGH')
})

test('the provenance index preserves the full lineage back to M230', () => {
  const p = INDEX.provenanceIndex
  assert.deepEqual(p.chain, ['M230', 'M252', 'M253', 'M254'])
  assert.equal(p.profileFingerprint, FULL_PROFILE.profileFingerprint)
  assert.equal(INDEX.profileFingerprint, FULL_PROFILE.profileFingerprint)
  assert.equal(p.intelligenceInputsFingerprint, FULL_PROFILE.intelligenceInputsFingerprint)
  assert.equal(p.origin.sourceMilestone, 'M230')
  assert.equal(p.origin.profileVersion, 'coach-dna-v3')
  assert.equal(p.byMilestone.M253.fingerprint, FULL_PROFILE.profileFingerprint)
  assert.equal(p.byMilestone.M252.fingerprint, FULL_PROFILE.intelligenceInputsFingerprint)
})

test('a minimal profile indexes empty but remains queryable', () => {
  const x = buildCoachDnaIntelligenceIndex(MINIMAL_PROFILE)
  assert.equal(x.validationState.profileUsable, true)
  assert.equal(Object.keys(x.categoryIndex).length, 8)
  for (const cat of ALL_CATEGORIES) assert.equal(x.categoryIndex[cat].present, false, cat)
  assert.equal(x.coverageSummary.categoriesCovered, 0)
  assert.equal(x.coverageSummary.presentSignals, 0)
})

test('a malformed profile fails safe — unusable, empty index, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let x
    assert.doesNotThrow(() => { x = buildCoachDnaIntelligenceIndex(bad) })
    assert.equal(x.validationState.profileUsable, false)
    assert.equal(Object.keys(x.categoryIndex).length, 8)   // still total — every category keyed
    for (const cat of ALL_CATEGORIES) assert.equal(x.categoryIndex[cat].present, false, cat)
    assert.equal(x.coverageSummary.categoriesCovered, 0)
    assert.equal(x.profileFingerprint, null)
    assert.ok(x.validationState.issues.length >= 1)
  }
})

test('repeated execution is byte-identical and the fingerprint is stable', () => {
  assert.equal(serializeCoachDnaIntelligenceIndex(FULL_PROFILE), serializeCoachDnaIntelligenceIndex(FULL_PROFILE))
  assert.equal(buildCoachDnaIntelligenceIndex(FULL_PROFILE).indexFingerprint, INDEX.indexFingerprint)
  const copy = JSON.parse(JSON.stringify(FULL_PROFILE))
  assert.equal(buildCoachDnaIntelligenceIndex(copy).indexFingerprint, INDEX.indexFingerprint)
})

test('the source profile is never mutated', () => {
  const before = JSON.parse(JSON.stringify(FULL_PROFILE))
  buildCoachDnaIntelligenceIndex(FULL_PROFILE)
  assert.deepEqual(JSON.parse(JSON.stringify(FULL_PROFILE)), before)
})

test('the output is deeply frozen', () => {
  assert.ok(Object.isFrozen(INDEX))
  assert.ok(Object.isFrozen(INDEX.categoryIndex))
  assert.ok(Object.isFrozen(INDEX.categoryIndex['philosophy']))
  assert.ok(Object.isFrozen(INDEX.signalIndex))
  assert.ok(Object.isFrozen(INDEX.evidenceIndex.byCategory))
  assert.ok(Object.isFrozen(INDEX.provenanceIndex))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaIntelligenceIndex(FULL_PROFILE, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-intelligence-index')
  const line = serializeCoachDnaIntelligenceIndex(FULL_PROFILE, { format: 'line' })
  assert.match(line, /^coach-dna-intelligence-index usable=true coverage=3\/8 signals=3\/8 confidence=HIGH /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaIntelligenceIndex(FULL_PROFILE, { format: 'xml' }), /unsupported/)
})

test('the index and summary carry no recommendation or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaIntelligenceIndex(FULL_PROFILE), ADVICE_LANG)
  assert.doesNotMatch(summarizeCoachDnaIntelligenceIndex(FULL_PROFILE), ADVICE_LANG)
  assert.match(summarizeCoachDnaIntelligenceIndex(FULL_PROFILE), /intelligence index: queryable/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaIntelligenceIndex, 'function')
  assert.equal(typeof summarizeCoachDnaIntelligenceIndex, 'function')
  assert.equal(typeof serializeCoachDnaIntelligenceIndex, 'function')
})
