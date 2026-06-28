/**
 * web/brain-coach-dna-release-envelope - Coach DNA Release Review Envelope (M239) tests
 *
 * Verifies the dormant M239 review envelope after M238: canonical evidence shape, deterministic
 * serialization, docs fingerprinting, validator/checklist propagation, snapshot inventory, artifact
 * boundaries, failure handling, immutability, and no production wiring.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaReleaseEnvelope,
  serializeCoachDnaReleaseEnvelope,
} from '../web/brain-coach-dna-release-envelope.js'
import { buildCoachDnaReleaseChecklist } from '../web/brain-coach-dna-release-checklist.js'
import { validateCoachDnaExports } from '../web/brain-coach-dna-validator.js'
import { buildCoachDnaSnapshots } from '../web/brain-coach-dna-snapshots.js'

test('canonical envelope is ready for review with the expected shape', () => {
  const e = buildCoachDnaReleaseEnvelope()
  assert.equal(e.type, 'coach-dna-release-review-envelope')
  assert.equal(e.schemaVersion, 1)
  assert.equal(e.status, 'ready-for-review')
  assert.equal(e.pass, true)
  for (const key of ['checklist', 'validator', 'docs', 'snapshots', 'artifacts']) assert.ok(key in e.evidence, key)
})

test('checklist evidence mirrors the live M238 checklist', () => {
  const e = buildCoachDnaReleaseEnvelope()
  const checklist = buildCoachDnaReleaseChecklist()
  assert.equal(e.evidence.checklist.status, checklist.status)
  assert.equal(e.evidence.checklist.pass, checklist.pass)
  assert.equal(e.evidence.checklist.totalChecks, checklist.checkCount)
  assert.equal(e.evidence.checklist.failedChecks, checklist.failedChecks)
  assert.deepEqual(
    e.evidence.checklist.checks.map((c) => c.id).sort(),
    checklist.checks.map((c) => c.id).sort(),
  )
})

test('validator evidence mirrors the live M236 validator summary', () => {
  const e = buildCoachDnaReleaseEnvelope()
  const validator = validateCoachDnaExports()
  assert.equal(e.evidence.validator.pass, validator.pass)
  assert.equal(e.evidence.validator.totalChecks, validator.totalChecks)
  assert.equal(e.evidence.validator.failedChecks, validator.failedChecks)
  assert.deepEqual(e.evidence.validator.aspects, ['clipboard', 'contract', 'export', 'gallery', 'html', 'page', 'screen', 'text'])
})

test('snapshot evidence lists every canonical snapshot in sorted order', () => {
  const e = buildCoachDnaReleaseEnvelope()
  const names = Object.keys(buildCoachDnaSnapshots()).sort()
  assert.equal(e.evidence.snapshots.count, names.length)
  assert.deepEqual(e.evidence.snapshots.names, names)
})

test('docs fingerprint is deterministic and reacts to markdown changes', () => {
  const a = buildCoachDnaReleaseEnvelope({ markdown: 'A\nB\n' })
  const b = buildCoachDnaReleaseEnvelope({ markdown: 'A\nB\n' })
  const c = buildCoachDnaReleaseEnvelope({ markdown: 'A\nC\n' })
  assert.deepEqual(a.evidence.docs, b.evidence.docs)
  assert.notEqual(a.evidence.docs.fingerprint, c.evidence.docs.fingerprint)
  assert.equal(a.evidence.docs.lineCount, 3)
  assert.equal(a.evidence.docs.charCount, 4)
  assert.match(a.evidence.docs.fingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('artifact inventory stays inside dormant Brain source paths', () => {
  const e = buildCoachDnaReleaseEnvelope()
  assert.equal(e.evidence.artifacts.length, 10)
  for (const path of e.evidence.artifacts) {
    assert.ok(path.startsWith('web/') || path.startsWith('packages/coach-intelligence/'), path)
    assert.doesNotMatch(path, /index\.html|api\/|app\/|src\/|CLAUDEPUSH|package-lock/)
  }
})

test('canonical JSON serialization is deterministic and parseable', () => {
  const a = serializeCoachDnaReleaseEnvelope()
  const b = serializeCoachDnaReleaseEnvelope()
  assert.equal(a, b)
  const parsed = JSON.parse(a)
  assert.equal(parsed.type, 'coach-dna-release-review-envelope')
  assert.equal(parsed.status, 'ready-for-review')
  assert.ok(a.indexOf('"evidence"') < a.indexOf('"pass"'), 'top-level keys are sorted canonically')
})

test('line serialization is compact and deterministic', () => {
  const line = serializeCoachDnaReleaseEnvelope({}, { format: 'line' })
  assert.equal(line, buildCoachDnaReleaseEnvelope().summary)
  assert.match(line, /^status=ready-for-review checklist=0\/8 failed validator=0\/36 failed snapshots=5 docs=fnv1a32:[0-9a-f]{8}$/)
})

test('failed checklist blocks the review envelope without throwing', () => {
  const checklist = { ...buildCoachDnaReleaseChecklist(), pass: false, status: 'needs-review', failedChecks: 1 }
  const e = buildCoachDnaReleaseEnvelope({ checklist })
  assert.equal(e.status, 'blocked-for-review')
  assert.equal(e.pass, false)
  assert.equal(e.evidence.checklist.failedChecks, 1)
  assert.match(e.summary, /status=blocked-for-review/)
})

test('failed validator blocks the review envelope without throwing', () => {
  const validation = { ...validateCoachDnaExports(), pass: false, failedChecks: 2 }
  const e = buildCoachDnaReleaseEnvelope({ validation })
  assert.equal(e.status, 'blocked-for-review')
  assert.equal(e.pass, false)
  assert.equal(e.evidence.validator.failedChecks, 2)
})

test('malformed options safely fall back to canonical evidence', () => {
  assert.equal(buildCoachDnaReleaseEnvelope(null).pass, true)
  assert.equal(buildCoachDnaReleaseEnvelope('x').pass, true)
  assert.equal(serializeCoachDnaReleaseEnvelope(null), serializeCoachDnaReleaseEnvelope('x'))
})

test('unsupported serialization format throws a programmer error', () => {
  assert.throws(() => serializeCoachDnaReleaseEnvelope({}, { format: 'xml' }), TypeError)
  assert.throws(() => serializeCoachDnaReleaseEnvelope({}, { format: 'markdown' }), TypeError)
})

test('envelope output is deeply frozen', () => {
  const e = buildCoachDnaReleaseEnvelope()
  assert.ok(Object.isFrozen(e))
  assert.ok(Object.isFrozen(e.evidence))
  assert.ok(Object.isFrozen(e.evidence.checklist))
  assert.ok(Object.isFrozen(e.evidence.checklist.checks))
  assert.ok(Object.isFrozen(e.evidence.checklist.checks[0]))
  assert.ok(Object.isFrozen(e.evidence.validator.aspects))
  assert.ok(Object.isFrozen(e.evidence.snapshots.names))
  assert.ok(Object.isFrozen(e.evidence.artifacts))
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaReleaseEnvelope, 'function')
  assert.equal(typeof serializeCoachDnaReleaseEnvelope, 'function')
})
