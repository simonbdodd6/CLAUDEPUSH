/**
 * web/brain-coach-dna-release-record.js - Coach DNA Release Record (M241, DORMANT)
 *
 * The terminal stage of the Coach DNA publishing pipeline: a deterministic, auditable RELEASE RECORD that
 * sits over the M240 sealed bundle. Where M240 seals the deliverable and stamps a bundle fingerprint, M241
 * certifies the machine-checkable publishing preconditions (readiness checklist, export validator, review
 * envelope, bundle seal), captures the full provenance chain (M230-M240) against the exact bundle
 * fingerprint, and emits a human-readable attestation that a person signs off against. It records eligibility
 * — it does not grant approval, and it publishes nothing.
 *
 * It does not publish, deploy, repair, persist, call AI, use DOM/network/storage/clock/randomness, touch
 * index.html, or wire anything into production. It imports only the dormant Coach DNA publishing modules and
 * returns frozen plain data or deterministic text. Same input → same record, byte for byte.
 */

import { buildCoachDnaReleaseBundle } from './brain-coach-dna-release-bundle.js'     // M240
import { buildCoachDnaReleaseEnvelope } from './brain-coach-dna-release-envelope.js' // M239

// The full provenance chain certified by this record — every milestone that contributes to the deliverable.
const PROVENANCE = Object.freeze([
  { milestone: 'M230', artifact: 'packages/coach-intelligence/coach-dna-coach-view.js', role: 'public coachView contract' },
  { milestone: 'M231', artifact: 'packages/coach-intelligence/coach-dna-coach-view-sample.js', role: 'live deterministic sample' },
  { milestone: 'M232', artifact: 'web/brain-coach-dna-view.js', role: 'HTML panel renderer' },
  { milestone: 'M233', artifact: 'web/brain-coach-dna-page.js', role: 'standalone page renderer' },
  { milestone: 'M234', artifact: 'web/brain-coach-dna-snapshots.js', role: 'snapshot scenarios' },
  { milestone: 'M234', artifact: 'web/brain-coach-dna-gallery.js', role: 'snapshot gallery' },
  { milestone: 'M235', artifact: 'web/brain-coach-dna-export.js', role: 'export pack' },
  { milestone: 'M236', artifact: 'web/brain-coach-dna-validator.js', role: 'pre-publish validator' },
  { milestone: 'M237', artifact: 'web/brain-coach-dna-docs.js', role: 'documentation pack' },
  { milestone: 'M238', artifact: 'web/brain-coach-dna-release-checklist.js', role: 'publishing readiness checklist' },
  { milestone: 'M239', artifact: 'web/brain-coach-dna-release-envelope.js', role: 'release review envelope' },
  { milestone: 'M240', artifact: 'web/brain-coach-dna-release-bundle.js', role: 'sealed release bundle' },
])

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`
}

// FNV-1a 32-bit — the same fingerprint used across M239/M240, for cross-stage consistency.
function fingerprint(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`
}

function normalizeInputs(options) {
  const opts = isObj(options) ? options : {}
  const bundle = isObj(opts.bundle) ? opts.bundle : buildCoachDnaReleaseBundle()
  const envelope = isObj(opts.envelope) ? opts.envelope : buildCoachDnaReleaseEnvelope()
  return { bundle, envelope }
}

function buildAttestation(record) {
  return [
    'Coach DNA release record',
    '========================',
    `Bundle: ${record.bundleFingerprint} (${record.release.bundleStatus}, ${record.release.artifactCount} artifacts, ${record.release.totalBytes} bytes)`,
    `Readiness checklist: ${record.gate.checklistPass ? 'passing' : 'failing'}`,
    `Export validator: ${record.gate.validatorPass ? 'passing' : 'failing'}`,
    `Review envelope: ${record.gate.envelopeStatus}`,
    `Provenance: ${record.provenance.length} milestones (M230-M240)`,
    '',
    record.eligible
      ? 'All machine-checkable publishing preconditions are met. This record certifies eligibility only;'
      : 'One or more publishing preconditions are not met. This deliverable is on hold.',
    'a human sign-off is still required before any publish. No content is published by this record.',
  ].join('\n')
}

/**
 * Build the deterministic Coach DNA release record.
 *
 * @param {object} [options] optional injected bundle/envelope for tests.
 * @returns {Readonly<object>} frozen release record. It records eligibility; it is not an approval or a publish.
 */
export function buildCoachDnaReleaseRecord(options = {}) {
  const { bundle, envelope } = normalizeInputs(options)

  const bundleSealed = bundle.sealed === true
  const envelopePass = envelope.pass === true
  const checklistPass = envelope.evidence?.checklist?.pass === true
  const validatorPass = envelope.evidence?.validator?.pass === true
  const allClear = bundleSealed && envelopePass && checklistPass && validatorPass

  const gate = {
    bundleSealed,
    envelopeStatus: typeof envelope.status === 'string' ? envelope.status : 'unknown',
    envelopePass,
    checklistPass,
    validatorPass,
    allClear,
  }

  const release = {
    bundleStatus: typeof bundle.status === 'string' ? bundle.status : 'unknown',
    artifactCount: Number.isFinite(bundle.artifactCount) ? bundle.artifactCount : 0,
    totalBytes: Number.isFinite(bundle.totalBytes) ? bundle.totalBytes : 0,
  }

  const draft = {
    type: 'coach-dna-release-record',
    schemaVersion: 1,
    status: allClear ? 'eligible-for-publish' : 'on-hold',
    eligible: allClear,
    bundleFingerprint: typeof bundle.bundleFingerprint === 'string' ? bundle.bundleFingerprint : null,
    release,
    gate,
    provenance: PROVENANCE.map((p) => ({ ...p })),
  }

  draft.attestation = buildAttestation(draft)
  draft.summary = [
    `status=${draft.status}`,
    `bundle=${draft.bundleFingerprint}`,
    `checklist=${checklistPass ? 'pass' : 'fail'}`,
    `validator=${validatorPass ? 'pass' : 'fail'}`,
    `envelope=${gate.envelopeStatus}`,
    `provenance=${PROVENANCE.length}`,
  ].join(' ')
  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this record.
  draft.recordFingerprint = fingerprint(canonicalStringify(draft))

  return deepFreeze(draft)
}

/**
 * Serialize the release record deterministically.
 *
 * @param {object} [options]
 * @param {{ format?: 'json' | 'attestation' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaReleaseRecord(options = {}, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const record = buildCoachDnaReleaseRecord(options)
  if (format === 'json') return canonicalStringify(record)
  if (format === 'attestation') return record.attestation
  if (format === 'line') return record.summary
  throw new TypeError(`unsupported Coach DNA release record format '${format}'`)
}
