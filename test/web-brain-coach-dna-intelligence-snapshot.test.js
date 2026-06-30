/**
 * web/brain-coach-dna-intelligence-snapshot - Coach DNA Intelligence Snapshot (M257) tests
 *
 * Verifies the portable sealed record: it assembles an M253 profile's intelligence state (coverage, confidence,
 * evidence, navigation) into one immutable fingerprinted snapshot, embeds each layer's fingerprint (proving the
 * source is unaltered), self-certifies via the M256 consumer contract, carries the full M230-M257 provenance,
 * derives no new intelligence, never mutates inputs, and is deeply frozen and byte-deterministic. Malformed
 * profiles seal safely (usable:false) without throwing.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaIntelligenceSnapshot,
  summarizeCoachDnaIntelligenceSnapshot,
  serializeCoachDnaIntelligenceSnapshot,
} from '../web/brain-coach-dna-intelligence-snapshot.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { buildCoachDnaIntelligenceIndex } from '../web/brain-coach-dna-intelligence-index.js'

const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv|predict|forecast)\b/i

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

const PROFILE = freeze(JSON.parse(JSON.stringify(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(FULL_VIEW)))))
const MINIMAL_PROFILE = freeze(JSON.parse(JSON.stringify(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(MINIMAL_VIEW)))))
const SNAP = buildCoachDnaIntelligenceSnapshot(PROFILE)

test('a valid profile seals the full snapshot shape', () => {
  assert.equal(SNAP.type, 'coach-dna-intelligence-snapshot')
  assert.equal(SNAP.schemaVersion, 1)
  assert.equal(SNAP.snapshotVersion, 1)
  assert.equal(SNAP.milestone, 'M257')
  assert.equal(SNAP.mode, 'dormant')
  assert.equal(SNAP.usable, true)
  for (const k of ['fingerprints', 'coverage', 'confidence', 'evidence', 'navigation', 'contract', 'provenance', 'validationState', 'derivationMetadata']) {
    assert.ok(isObj(SNAP[k]), k)
  }
  assert.match(SNAP.snapshotFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }

test('it embeds each layer fingerprint, proving the source is unaltered', () => {
  const index = buildCoachDnaIntelligenceIndex(PROFILE)
  assert.equal(SNAP.fingerprints.profile, PROFILE.profileFingerprint)
  assert.equal(SNAP.fingerprints.intelligenceInputs, PROFILE.intelligenceInputsFingerprint)
  assert.equal(SNAP.fingerprints.index, index.indexFingerprint)
  assert.match(SNAP.fingerprints.contractValidation, /^fnv1a32:[0-9a-f]{8}$/)
})

test('the sealed views match what the surface/profile expose (no new derivation)', () => {
  assert.equal(SNAP.coverage.categoriesCovered, 3)
  assert.equal(SNAP.coverage.categoriesPossible, 8)
  assert.equal(SNAP.confidence.level, 'HIGH')
  assert.equal(SNAP.evidence.totalMemories, 12)
  assert.deepEqual([...SNAP.navigation.presentCategories].sort(), ['communication-style', 'philosophy', 'training-preference'])
  assert.equal(SNAP.navigation.categoryIndex['philosophy'].present, true)
  assert.equal(SNAP.navigation.signalIndex['coachingStyleSignals'].occurrences, 6)
  // never leaks raw ids
  assert.ok(!('supportingMemoryIds' in SNAP.navigation.signalIndex['coachingStyleSignals']))
})

test('it self-certifies via the M256 consumer contract', () => {
  assert.equal(SNAP.contract.honoured, true)
  assert.equal(SNAP.contract.surfaceUsable, true)
  assert.equal(SNAP.contract.failedChecks, 0)
  assert.match(SNAP.contract.fingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('provenance carries the full M230-M257 chain back to the view', () => {
  assert.deepEqual(SNAP.provenance.chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M256', 'M257'])
  assert.equal(SNAP.provenance.profileFingerprint, PROFILE.profileFingerprint)
  assert.equal(SNAP.provenance.origin.sourceMilestone, 'M230')
  assert.equal(SNAP.provenance.origin.profileVersion, 'coach-dna-v3')
  assert.equal(SNAP.derivationMetadata.milestone, 'M257')
  assert.equal(SNAP.derivationMetadata.llmGenerated, false)
})

test('a minimal profile seals an empty-but-usable snapshot', () => {
  const s = buildCoachDnaIntelligenceSnapshot(MINIMAL_PROFILE)
  assert.equal(s.usable, true)
  assert.equal(s.contract.honoured, true)
  assert.equal(s.coverage.categoriesCovered, 0)
  assert.deepEqual(s.navigation.presentCategories, [])
})

test('a malformed profile seals safely — usable:false, contract still honoured, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }]) {
    let s
    assert.doesNotThrow(() => { s = buildCoachDnaIntelligenceSnapshot(bad) })
    assert.equal(s.usable, false)
    assert.equal(s.contract.honoured, true)              // contract holds even with no data
    assert.equal(s.fingerprints.profile, null)
    assert.equal(s.coverage.categoriesCovered ?? 0, 0)
    assert.ok(s.validationState.issues.length >= 1)
  }
})

test('repeated execution is byte-identical and the snapshot fingerprint is stable', () => {
  assert.equal(serializeCoachDnaIntelligenceSnapshot(PROFILE), serializeCoachDnaIntelligenceSnapshot(PROFILE))
  assert.equal(buildCoachDnaIntelligenceSnapshot(PROFILE).snapshotFingerprint, SNAP.snapshotFingerprint)
  const copy = JSON.parse(JSON.stringify(PROFILE))
  assert.equal(buildCoachDnaIntelligenceSnapshot(copy).snapshotFingerprint, SNAP.snapshotFingerprint)
})

test('the source profile is never mutated', () => {
  const before = JSON.parse(JSON.stringify(PROFILE))
  buildCoachDnaIntelligenceSnapshot(PROFILE)
  assert.deepEqual(JSON.parse(JSON.stringify(PROFILE)), before)
})

test('the snapshot is deeply frozen', () => {
  assert.ok(Object.isFrozen(SNAP))
  assert.ok(Object.isFrozen(SNAP.fingerprints))
  assert.ok(Object.isFrozen(SNAP.coverage))
  assert.ok(Object.isFrozen(SNAP.navigation))
  assert.ok(Object.isFrozen(SNAP.navigation.categoryIndex))
  assert.ok(Object.isFrozen(SNAP.provenance))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaIntelligenceSnapshot(PROFILE, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-intelligence-snapshot')
  const line = serializeCoachDnaIntelligenceSnapshot(PROFILE, { format: 'line' })
  assert.match(line, /^coach-dna-intelligence-snapshot usable=true contractHonoured=true coverage=3\/8 confidence=HIGH /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaIntelligenceSnapshot(PROFILE, { format: 'xml' }), /unsupported/)
})

test('the snapshot and summary carry no recommendation, prediction or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaIntelligenceSnapshot(PROFILE), ADVICE_LANG)
  assert.doesNotMatch(summarizeCoachDnaIntelligenceSnapshot(PROFILE), ADVICE_LANG)
  assert.match(summarizeCoachDnaIntelligenceSnapshot(PROFILE), /intelligence snapshot: sealed/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaIntelligenceSnapshot, 'function')
  assert.equal(typeof summarizeCoachDnaIntelligenceSnapshot, 'function')
  assert.equal(typeof serializeCoachDnaIntelligenceSnapshot, 'function')
})
