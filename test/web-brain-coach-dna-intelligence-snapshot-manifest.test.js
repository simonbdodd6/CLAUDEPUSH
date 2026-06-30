/**
 * web/brain-coach-dna-intelligence-snapshot-manifest - Coach DNA Intelligence Snapshot Manifest (M259) tests
 *
 * Verifies the compact inventory: it projects an M257 snapshot (+ optional M258 validation) into a small
 * manifest — package fingerprints, validity/contract flags, provenance/coverage/confidence/evidence roll-ups,
 * error/warning counts — derives no new intelligence, never mutates inputs, is deeply frozen and
 * byte-deterministic, and never rebuilds the subsystem. Missing validation → snapshotValid:null; malformed
 * snapshot → safe defaults.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaIntelligenceSnapshotManifest,
  summarizeCoachDnaIntelligenceSnapshotManifest,
  serializeCoachDnaIntelligenceSnapshotManifest,
} from '../web/brain-coach-dna-intelligence-snapshot-manifest.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { buildCoachDnaIntelligenceSnapshot } from '../web/brain-coach-dna-intelligence-snapshot.js'
import { validateCoachDnaIntelligenceSnapshot } from '../web/brain-coach-dna-intelligence-snapshot-validator.js'

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
const PROFILE = freeze(JSON.parse(JSON.stringify(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(FULL_VIEW)))))
const SNAP = freeze(JSON.parse(JSON.stringify(buildCoachDnaIntelligenceSnapshot(PROFILE))))
const VALID = freeze(JSON.parse(JSON.stringify(validateCoachDnaIntelligenceSnapshot(SNAP))))
const MANIFEST = buildCoachDnaIntelligenceSnapshotManifest(SNAP, VALID)

test('a valid snapshot + valid validation produces the full manifest', () => {
  assert.equal(MANIFEST.type, 'coach-dna-intelligence-snapshot-manifest')
  assert.equal(MANIFEST.schemaVersion, 1)
  assert.equal(MANIFEST.manifestVersion, 1)
  assert.equal(MANIFEST.snapshotFingerprint, SNAP.snapshotFingerprint)
  assert.equal(MANIFEST.validationFingerprint, VALID.validationFingerprint)
  assert.equal(MANIFEST.snapshotValid, true)
  assert.equal(MANIFEST.contractHonoured, true)
  assert.equal(MANIFEST.errorCount, 0)
  assert.equal(MANIFEST.warningCount, 0)
  assert.equal(MANIFEST.manifestMetadata.validated, true)
  assert.equal(MANIFEST.manifestMetadata.validationMatchesSnapshot, true)
  assert.match(MANIFEST.manifestFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('the roll-ups are projected from the snapshot (no new derivation)', () => {
  assert.equal(MANIFEST.coverageSummary.categoriesCovered, 3)
  assert.equal(MANIFEST.coverageSummary.categoriesPossible, 8)
  assert.equal(MANIFEST.confidenceSummary.level, 'HIGH')
  assert.equal(MANIFEST.evidenceSummary.totalMemories, 12)
  assert.deepEqual(MANIFEST.provenanceSummary.chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M256', 'M257'])
  assert.equal(MANIFEST.provenanceSummary.profileFingerprint, SNAP.fingerprints.profile)
  assert.equal(MANIFEST.provenanceSummary.originMilestone, 'M230')
  assert.equal(MANIFEST.provenanceSummary.provenanceVerified, true)
})

test('a valid snapshot WITHOUT a validation result leaves snapshotValid unknown', () => {
  const m = buildCoachDnaIntelligenceSnapshotManifest(SNAP)
  assert.equal(m.snapshotValid, null)              // unknown, not assumed
  assert.equal(m.validationFingerprint, null)
  assert.equal(m.contractHonoured, true)           // still readable straight from the snapshot
  assert.equal(m.errorCount, 0)
  assert.equal(m.warningCount, 0)
  assert.equal(m.manifestMetadata.validated, false)
  assert.equal(m.provenanceSummary.provenanceVerified, null)
})

test('an invalid validation result is reflected with its counts', () => {
  const tampered = JSON.parse(JSON.stringify(SNAP))
  tampered.snapshotFingerprint = 'fnv1a32:deadbeef'             // breaks the seal
  const badValidation = validateCoachDnaIntelligenceSnapshot(tampered)
  assert.equal(badValidation.valid, false)
  const m = buildCoachDnaIntelligenceSnapshotManifest(SNAP, badValidation)
  assert.equal(m.snapshotValid, false)
  assert.ok(m.errorCount >= 1)
  // the supplied validation does not pair with THIS snapshot (different snapshotFingerprint)
  assert.equal(m.manifestMetadata.validationMatchesSnapshot, false)
})

test('a malformed snapshot yields a safe manifest (defaults, never throws)', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, { type: 'wrong' }]) {
    let m
    assert.doesNotThrow(() => { m = buildCoachDnaIntelligenceSnapshotManifest(bad) })
    assert.equal(m.snapshotFingerprint, null)
    assert.equal(m.contractHonoured, false)
    assert.equal(m.coverageSummary.categoriesCovered, 0)
    assert.equal(m.provenanceSummary.chain, null)
    assert.equal(m.manifestMetadata.snapshotRecognized, false)
  }
})

test('a malformed snapshot WITH a validation result still reports the validation', () => {
  const m = buildCoachDnaIntelligenceSnapshotManifest(null, VALID)
  assert.equal(m.snapshotFingerprint, null)
  assert.equal(m.validationFingerprint, VALID.validationFingerprint)
  assert.equal(m.snapshotValid, true)
  assert.equal(m.manifestMetadata.validationMatchesSnapshot, null)  // no snapshot to pair with
})

test('repeated execution is byte-identical and the manifest fingerprint is stable', () => {
  assert.equal(serializeCoachDnaIntelligenceSnapshotManifest(SNAP, VALID), serializeCoachDnaIntelligenceSnapshotManifest(SNAP, VALID))
  assert.equal(buildCoachDnaIntelligenceSnapshotManifest(SNAP, VALID).manifestFingerprint, MANIFEST.manifestFingerprint)
  const sCopy = JSON.parse(JSON.stringify(SNAP))
  const vCopy = JSON.parse(JSON.stringify(VALID))
  assert.equal(buildCoachDnaIntelligenceSnapshotManifest(sCopy, vCopy).manifestFingerprint, MANIFEST.manifestFingerprint)
})

test('the manifest fingerprint changes when the validation pairing changes', () => {
  const withVal = buildCoachDnaIntelligenceSnapshotManifest(SNAP, VALID).manifestFingerprint
  const withoutVal = buildCoachDnaIntelligenceSnapshotManifest(SNAP).manifestFingerprint
  assert.notEqual(withVal, withoutVal)
})

test('the source snapshot and validation are never mutated', () => {
  const sBefore = JSON.parse(JSON.stringify(SNAP))
  const vBefore = JSON.parse(JSON.stringify(VALID))
  buildCoachDnaIntelligenceSnapshotManifest(SNAP, VALID)
  assert.deepEqual(JSON.parse(JSON.stringify(SNAP)), sBefore)
  assert.deepEqual(JSON.parse(JSON.stringify(VALID)), vBefore)
})

test('the manifest is deeply frozen', () => {
  assert.ok(Object.isFrozen(MANIFEST))
  assert.ok(Object.isFrozen(MANIFEST.provenanceSummary))
  assert.ok(Object.isFrozen(MANIFEST.coverageSummary))
  assert.ok(Object.isFrozen(MANIFEST.confidenceSummary))
  assert.ok(Object.isFrozen(MANIFEST.evidenceSummary))
  assert.ok(Object.isFrozen(MANIFEST.manifestMetadata))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaIntelligenceSnapshotManifest(SNAP, VALID, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-intelligence-snapshot-manifest')
  const line = serializeCoachDnaIntelligenceSnapshotManifest(SNAP, VALID, { format: 'line' })
  assert.match(line, /^coach-dna-intelligence-snapshot-manifest snapshotValid=true contractHonoured=true /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaIntelligenceSnapshotManifest(SNAP, VALID, { format: 'xml' }), /unsupported/)
})

test('the manifest and summary carry no recommendation or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaIntelligenceSnapshotManifest(SNAP, VALID), ADVICE_LANG)
  assert.doesNotMatch(summarizeCoachDnaIntelligenceSnapshotManifest(SNAP, VALID), ADVICE_LANG)
  assert.match(summarizeCoachDnaIntelligenceSnapshotManifest(SNAP, VALID), /snapshot manifest: valid/)
  assert.match(summarizeCoachDnaIntelligenceSnapshotManifest(SNAP), /snapshot manifest: unvalidated/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaIntelligenceSnapshotManifest, 'function')
  assert.equal(typeof summarizeCoachDnaIntelligenceSnapshotManifest, 'function')
  assert.equal(typeof serializeCoachDnaIntelligenceSnapshotManifest, 'function')
})
