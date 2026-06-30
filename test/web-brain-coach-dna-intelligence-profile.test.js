/**
 * web/brain-coach-dna-intelligence-profile - Coach DNA Intelligence Profile (M253) tests
 *
 * Verifies the first higher-level Intelligence object: it assembles M252 intelligence inputs into one stable
 * profile (signal summary, category coverage, confidence summary, evidence coverage), preserves provenance back
 * through M252 to the M230 view, invents/predicts/recommends nothing, never mutates inputs, and is deeply
 * frozen and byte-deterministic. Minimal inputs yield an empty-but-usable profile; malformed inputs fail safe.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaIntelligenceProfile,
  summarizeCoachDnaIntelligenceProfile,
  serializeCoachDnaIntelligenceProfile,
} from '../web/brain-coach-dna-intelligence-profile.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'

const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

function freeze(o) {
  if (o && typeof o === 'object') { for (const k of Object.keys(o)) freeze(o[k]); Object.freeze(o) }
  return o
}

// A representative M230 coachView fixture → real M252 inputs → fed to M253.
const FULL_VIEW = freeze({
  profileVersion: 'coach-dna-v3',
  confidence: { value: 0.72, level: 'HIGH', label: 'High' },
  headline: 'Philosophy focus — 12 memories across 4 themes, high confidence',
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
  summary: 'A philosophy-led coach with a developing training emphasis.',
  metadata: { explainable: true, deterministic: true, llmGenerated: false },
})
const MINIMAL_VIEW = freeze({
  profileVersion: null,
  confidence: { value: 0, level: 'LOW', label: 'Low' },
  headline: 'No coaching profile yet — add memories to build Coach DNA',
  identity: { strongestCategory: null, strongestLabel: null, weakestCategory: null, weakestLabel: null, diversityScore: 0, diversityLabel: 'Narrow' },
  dominantSignals: [], themes: [],
  knowledge: { totalMemories: 0, uniqueTypes: 0, averageConfidence: 0, averageWeight: 0, totalEvidence: 0, totalOntologyLinks: 0 },
  summary: null,
  metadata: { explainable: true, deterministic: true, llmGenerated: false },
})

const FULL_INPUTS = freeze(JSON.parse(JSON.stringify(buildCoachDnaIntelligenceInputs(FULL_VIEW))))
const MINIMAL_INPUTS = freeze(JSON.parse(JSON.stringify(buildCoachDnaIntelligenceInputs(MINIMAL_VIEW))))
const PROFILE = buildCoachDnaIntelligenceProfile(FULL_INPUTS)

test('valid inputs assemble the full intelligence profile shape', () => {
  assert.equal(PROFILE.type, 'coach-dna-intelligence-profile')
  assert.equal(PROFILE.schemaVersion, 1)
  assert.equal(PROFILE.profileVersion, 'intelligence-profile-v1')
  assert.equal(PROFILE.validationState.usable, true)
  for (const k of ['signalSummary', 'categoryCoverage', 'confidenceSummary', 'evidenceCoverage', 'provenance', 'derivationMetadata', 'validationState']) {
    assert.ok(isFilled(PROFILE[k]), k)
  }
  assert.match(PROFILE.profileFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})
function isFilled(v) { return v !== null && typeof v === 'object' }

test('the signal summary aggregates the M252 groups deterministically', () => {
  const s = PROFILE.signalSummary
  assert.equal(s.totalGroups, 8)
  assert.equal(s.presentGroups, 3)          // philosophy, training, communication
  assert.equal(s.dominantGroups, 2)         // philosophy, training
  assert.equal(s.totalOccurrences, 9)       // 6 + 3
  assert.equal(s.totalSupporting, 7)        // 5 + 2
  assert.equal(s.strongestCategory, 'philosophy')
  assert.equal(s.weakestCategory, 'risk-warning')
  assert.equal(s.groups.length, 8)
})

test('the category coverage map lists covered and missing categories', () => {
  const c = PROFILE.categoryCoverage
  assert.equal(c.coveredCount, 3)
  assert.equal(c.possibleCount, 8)
  assert.equal(c.coverageRatio, 3 / 8)
  assert.deepEqual([...c.covered].sort(), ['communication-style', 'philosophy', 'training-preference'])
  assert.equal(c.missing.length, 5)
  assert.ok(c.missing.includes('selection-preference'))
})

test('the confidence summary is derived from the M252 flags + present signals', () => {
  const cs = PROFILE.confidenceSummary
  assert.equal(cs.level, 'HIGH')
  assert.equal(cs.high, true)
  assert.equal(cs.low, false)
  assert.equal(cs.diversityLabel, 'Balanced')
  // mean of present groups' averageConfidence: philosophy 0.75, training 0.6, communication 0.5
  assert.ok(Math.abs(cs.averageSignalConfidence - (0.75 + 0.6 + 0.5) / 3) < 1e-12)
})

test('evidence coverage is carried forward from the M252 inputs', () => {
  assert.equal(PROFILE.evidenceCoverage.totalMemories, 12)
  assert.equal(PROFILE.evidenceCoverage.totalEvidence, 20)
  assert.equal(PROFILE.evidenceCoverage.categoriesCovered, 3)
  assert.equal(PROFILE.evidenceCoverage.categoriesPossible, 8)
})

test('provenance preserves the chain back through M252 to the M230 view', () => {
  assert.equal(PROFILE.provenance.source, 'coach-dna-intelligence-inputs')
  assert.equal(PROFILE.provenance.sourceMilestone, 'M252')
  assert.equal(PROFILE.provenance.intelligenceInputsFingerprint, FULL_INPUTS.inputsFingerprint)
  assert.equal(PROFILE.intelligenceInputsFingerprint, FULL_INPUTS.inputsFingerprint)
  assert.equal(PROFILE.provenance.origin.sourceMilestone, 'M230')
  assert.equal(PROFILE.provenance.origin.profileVersion, 'coach-dna-v3')
  assert.equal(PROFILE.derivationMetadata.milestone, 'M253')
  assert.equal(PROFILE.derivationMetadata.llmGenerated, false)
})

test('minimal inputs yield an empty but usable profile', () => {
  const p = buildCoachDnaIntelligenceProfile(MINIMAL_INPUTS)
  assert.equal(p.validationState.usable, true)
  assert.equal(p.signalSummary.presentGroups, 0)
  assert.equal(p.categoryCoverage.coveredCount, 0)
  assert.equal(p.confidenceSummary.averageSignalConfidence, 0)
  assert.equal(p.confidenceSummary.empty, true)
})

test('malformed inputs fail safe — unusable, empty, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }, { type: 'coach-dna-intelligence-inputs', valid: false }]) {
    let p
    assert.doesNotThrow(() => { p = buildCoachDnaIntelligenceProfile(bad) })
    assert.equal(p.validationState.usable, false)
    assert.equal(p.signalSummary.presentGroups, 0)
    assert.equal(p.categoryCoverage.coveredCount, 0)
    assert.equal(p.confidenceSummary.low, true)
    assert.ok(p.validationState.issues.length >= 1)
  }
})

test('an inputs object explicitly marked invalid is recognized but not usable', () => {
  const invalid = buildCoachDnaIntelligenceInputs(null) // valid:false, but a real M252 object
  const p = buildCoachDnaIntelligenceProfile(invalid)
  assert.equal(p.validationState.inputsRecognized, true)
  assert.equal(p.validationState.inputsValid, false)
  assert.equal(p.validationState.usable, false)
  assert.ok(p.validationState.issues.some((i) => /marked invalid/.test(i)))
})

test('repeated execution is byte-identical and the fingerprint is stable', () => {
  assert.equal(serializeCoachDnaIntelligenceProfile(FULL_INPUTS), serializeCoachDnaIntelligenceProfile(FULL_INPUTS))
  assert.equal(buildCoachDnaIntelligenceProfile(FULL_INPUTS).profileFingerprint, PROFILE.profileFingerprint)
  const copy = JSON.parse(JSON.stringify(FULL_INPUTS))
  assert.equal(buildCoachDnaIntelligenceProfile(copy).profileFingerprint, PROFILE.profileFingerprint)
})

test('the source inputs are never mutated', () => {
  const before = JSON.parse(JSON.stringify(FULL_INPUTS))
  buildCoachDnaIntelligenceProfile(FULL_INPUTS)
  assert.deepEqual(JSON.parse(JSON.stringify(FULL_INPUTS)), before)
})

test('the output is deeply frozen', () => {
  assert.ok(Object.isFrozen(PROFILE))
  assert.ok(Object.isFrozen(PROFILE.signalSummary))
  assert.ok(Object.isFrozen(PROFILE.signalSummary.groups))
  assert.ok(Object.isFrozen(PROFILE.categoryCoverage))
  assert.ok(Object.isFrozen(PROFILE.confidenceSummary))
  assert.ok(Object.isFrozen(PROFILE.provenance))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaIntelligenceProfile(FULL_INPUTS, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-intelligence-profile')
  const line = serializeCoachDnaIntelligenceProfile(FULL_INPUTS, { format: 'line' })
  assert.match(line, /^coach-dna-intelligence-profile usable=true signals=3\/8 coverage=3\/8 confidence=HIGH /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaIntelligenceProfile(FULL_INPUTS, { format: 'xml' }), /unsupported/)
})

test('the profile and summary carry no recommendation or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaIntelligenceProfile(FULL_INPUTS), ADVICE_LANG)
  assert.doesNotMatch(summarizeCoachDnaIntelligenceProfile(FULL_INPUTS), ADVICE_LANG)
  assert.match(summarizeCoachDnaIntelligenceProfile(FULL_INPUTS), /intelligence profile: usable/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaIntelligenceProfile, 'function')
  assert.equal(typeof summarizeCoachDnaIntelligenceProfile, 'function')
  assert.equal(typeof serializeCoachDnaIntelligenceProfile, 'function')
})
