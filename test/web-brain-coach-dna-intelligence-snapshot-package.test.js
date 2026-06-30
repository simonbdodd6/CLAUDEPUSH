/**
 * web/brain-coach-dna-intelligence-snapshot-package - Coach DNA Intelligence Snapshot Package (M260) tests
 *
 * Verifies the transport unit: it assembles an M257 snapshot (+ optional M258 validation, M259 manifest) into
 * one immutable package, embeds each artifact verbatim with its fingerprint preserved, records what is present,
 * cross-checks the artifacts pair with the snapshot, preserves the M230-M257 provenance, never rebuilds the
 * subsystem, never mutates inputs, and is deeply frozen and byte-deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaIntelligenceSnapshotPackage,
  summarizeCoachDnaIntelligenceSnapshotPackage,
  serializeCoachDnaIntelligenceSnapshotPackage,
} from '../web/brain-coach-dna-intelligence-snapshot-package.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { buildCoachDnaIntelligenceSnapshot } from '../web/brain-coach-dna-intelligence-snapshot.js'
import { validateCoachDnaIntelligenceSnapshot } from '../web/brain-coach-dna-intelligence-snapshot-validator.js'
import { buildCoachDnaIntelligenceSnapshotManifest } from '../web/brain-coach-dna-intelligence-snapshot-manifest.js'

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
const MAN = freeze(JSON.parse(JSON.stringify(buildCoachDnaIntelligenceSnapshotManifest(SNAP, VALID))))
const PKG = buildCoachDnaIntelligenceSnapshotPackage(SNAP, VALID, MAN)

test('a full package assembles all three artifacts and preserves their fingerprints', () => {
  assert.equal(PKG.type, 'coach-dna-intelligence-snapshot-package')
  assert.equal(PKG.schemaVersion, 1)
  assert.equal(PKG.packageVersion, 1)
  assert.equal(PKG.snapshot.snapshotFingerprint, SNAP.snapshotFingerprint)
  assert.equal(PKG.validation.validationFingerprint, VALID.validationFingerprint)
  assert.equal(PKG.manifest.manifestFingerprint, MAN.manifestFingerprint)
  assert.equal(PKG.transportMetadata.complete, true)
  assert.equal(PKG.transportMetadata.consistent, true)
  assert.match(PKG.packageFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('embedded artifacts are deep copies equal to the originals', () => {
  assert.deepEqual(PKG.snapshot, JSON.parse(JSON.stringify(SNAP)))
  assert.deepEqual(PKG.validation, JSON.parse(JSON.stringify(VALID)))
  assert.deepEqual(PKG.manifest, JSON.parse(JSON.stringify(MAN)))
  assert.notEqual(PKG.snapshot, SNAP)  // not the same reference
})

test('the provenance chain is preserved from the snapshot (M230-M257)', () => {
  assert.deepEqual(PKG.provenanceChain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M256', 'M257'])
})

test('cross-artifact pairing is verified', () => {
  const t = PKG.transportMetadata
  assert.equal(t.validationMatchesSnapshot, true)
  assert.equal(t.manifestMatchesSnapshot, true)
  assert.equal(t.manifestMatchesValidation, true)
  assert.deepEqual(t.included, { snapshot: true, validation: true, manifest: true })
})

test('a snapshot-only package is partial but consistent', () => {
  const p = buildCoachDnaIntelligenceSnapshotPackage(SNAP)
  assert.equal(p.validation, null)
  assert.equal(p.manifest, null)
  assert.equal(p.transportMetadata.complete, false)
  assert.equal(p.transportMetadata.consistent, true)        // no pairings to violate
  assert.equal(p.transportMetadata.included.snapshot, true)
  assert.equal(p.snapshot.snapshotFingerprint, SNAP.snapshotFingerprint)
})

test('a snapshot + validation package pairs the two', () => {
  const p = buildCoachDnaIntelligenceSnapshotPackage(SNAP, VALID)
  assert.equal(p.transportMetadata.included.validation, true)
  assert.equal(p.transportMetadata.included.manifest, false)
  assert.equal(p.transportMetadata.validationMatchesSnapshot, true)
  assert.equal(p.transportMetadata.manifestMatchesSnapshot, null)
})

test('a snapshot + manifest package pairs the two', () => {
  const p = buildCoachDnaIntelligenceSnapshotPackage(SNAP, undefined, MAN)
  assert.equal(p.transportMetadata.included.validation, false)
  assert.equal(p.transportMetadata.included.manifest, true)
  assert.equal(p.transportMetadata.manifestMatchesSnapshot, true)
  assert.equal(p.transportMetadata.validationMatchesSnapshot, null)
})

test('a mismatched validation is flagged as inconsistent', () => {
  const otherProfile = buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(null))
  const otherSnap = buildCoachDnaIntelligenceSnapshot(otherProfile)
  const otherVal = validateCoachDnaIntelligenceSnapshot(otherSnap)   // validates a DIFFERENT snapshot
  const p = buildCoachDnaIntelligenceSnapshotPackage(SNAP, otherVal)
  assert.equal(p.transportMetadata.validationMatchesSnapshot, false)
  assert.equal(p.transportMetadata.consistent, false)
})

test('malformed inputs yield a safe package (defaults, never throws)', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, { type: 'wrong' }]) {
    let p
    assert.doesNotThrow(() => { p = buildCoachDnaIntelligenceSnapshotPackage(bad) })
    assert.equal(p.snapshot, null)
    assert.equal(p.provenanceChain, null)
    assert.equal(p.transportMetadata.included.snapshot, false)
    assert.equal(p.packageMetadata.snapshotRecognized, false)
  }
})

test('repeated execution is byte-identical and the package fingerprint is stable', () => {
  assert.equal(serializeCoachDnaIntelligenceSnapshotPackage(SNAP, VALID, MAN), serializeCoachDnaIntelligenceSnapshotPackage(SNAP, VALID, MAN))
  assert.equal(buildCoachDnaIntelligenceSnapshotPackage(SNAP, VALID, MAN).packageFingerprint, PKG.packageFingerprint)
})

test('the package fingerprint reflects which artifacts are included', () => {
  const full = buildCoachDnaIntelligenceSnapshotPackage(SNAP, VALID, MAN).packageFingerprint
  const snapOnly = buildCoachDnaIntelligenceSnapshotPackage(SNAP).packageFingerprint
  const snapVal = buildCoachDnaIntelligenceSnapshotPackage(SNAP, VALID).packageFingerprint
  assert.notEqual(full, snapOnly)
  assert.notEqual(full, snapVal)
  assert.notEqual(snapOnly, snapVal)
})

test('the source inputs are never mutated (and never frozen by the package)', () => {
  const mutableSnap = JSON.parse(JSON.stringify(SNAP))
  const mutableVal = JSON.parse(JSON.stringify(VALID))
  const sBefore = JSON.parse(JSON.stringify(mutableSnap))
  buildCoachDnaIntelligenceSnapshotPackage(mutableSnap, mutableVal, MAN)
  assert.deepEqual(JSON.parse(JSON.stringify(mutableSnap)), sBefore)
  assert.ok(!Object.isFrozen(mutableSnap))   // the package cloned it, did not freeze the original
  assert.ok(!Object.isFrozen(mutableVal))
})

test('the package is deeply frozen', () => {
  assert.ok(Object.isFrozen(PKG))
  assert.ok(Object.isFrozen(PKG.snapshot))
  assert.ok(Object.isFrozen(PKG.validation))
  assert.ok(Object.isFrozen(PKG.manifest))
  assert.ok(Object.isFrozen(PKG.transportMetadata))
  assert.ok(Object.isFrozen(PKG.provenanceChain))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaIntelligenceSnapshotPackage(SNAP, VALID, MAN, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-intelligence-snapshot-package')
  const line = serializeCoachDnaIntelligenceSnapshotPackage(SNAP, VALID, MAN, { format: 'line' })
  assert.match(line, /^coach-dna-intelligence-snapshot-package complete=true consistent=true /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaIntelligenceSnapshotPackage(SNAP, VALID, MAN, { format: 'xml' }), /unsupported/)
})

test('the package and summary carry no recommendation or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaIntelligenceSnapshotPackage(SNAP, VALID, MAN), ADVICE_LANG)
  assert.doesNotMatch(summarizeCoachDnaIntelligenceSnapshotPackage(SNAP, VALID, MAN), ADVICE_LANG)
  assert.match(summarizeCoachDnaIntelligenceSnapshotPackage(SNAP, VALID, MAN), /snapshot package: complete/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaIntelligenceSnapshotPackage, 'function')
  assert.equal(typeof summarizeCoachDnaIntelligenceSnapshotPackage, 'function')
  assert.equal(typeof serializeCoachDnaIntelligenceSnapshotPackage, 'function')
})
