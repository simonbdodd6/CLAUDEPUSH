/**
 * web/brain-coach-dna-release-bundle - Coach DNA Release Bundle (M240) tests
 *
 * Verifies the dormant M240 sealed deliverable bundle after M239: canonical shape, full artifact
 * inventory (every M235 export form per M234 scenario + gallery + docs), per-artifact fingerprints/sizes,
 * content/manifest agreement, deterministic bundle fingerprinting, envelope gating (sealed vs unsealed),
 * deterministic serialization, safety boundaries, immutability, and no production wiring.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaReleaseBundle,
  serializeCoachDnaReleaseBundle,
} from '../web/brain-coach-dna-release-bundle.js'
import { buildCoachDnaReleaseEnvelope } from '../web/brain-coach-dna-release-envelope.js'
import { buildCoachDnaExport } from '../web/brain-coach-dna-export.js'
import { COACH_DNA_SNAPSHOT_SCENARIOS } from '../web/brain-coach-dna-snapshots.js'

const SCENARIOS = Object.keys(COACH_DNA_SNAPSHOT_SCENARIOS)
const FORMS = ['html', 'page', 'text', 'clipboard']
const INTERNAL_TOKENS = ['supportingMemoryIds', 'evidenceRefs', 'ontologyLinks', 'statement', 'createdAt', 'coachId']
const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

test('canonical bundle is sealed with the expected shape', () => {
  const b = buildCoachDnaReleaseBundle()
  assert.equal(b.type, 'coach-dna-release-bundle')
  assert.equal(b.schemaVersion, 1)
  assert.equal(b.status, 'sealed')
  assert.equal(b.sealed, true)
  for (const key of ['summary', 'bundleFingerprint', 'artifactCount', 'totalBytes', 'gate', 'manifest', 'contents']) {
    assert.ok(key in b, key)
  }
  assert.match(b.bundleFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('manifest inventories every export form per scenario plus gallery and docs', () => {
  const b = buildCoachDnaReleaseBundle()
  const expected = []
  for (const scenario of SCENARIOS) for (const form of FORMS) expected.push(`export/${scenario}/${form}`)
  expected.push('gallery', 'docs')
  const ids = b.manifest.map((e) => e.id).sort()
  assert.deepEqual(ids, expected.sort())
  assert.equal(b.artifactCount, expected.length)
  assert.equal(b.artifactCount, SCENARIOS.length * FORMS.length + 2)
})

test('every manifest entry is well-formed and fingerprinted', () => {
  const b = buildCoachDnaReleaseBundle()
  for (const e of b.manifest) {
    assert.ok(['export', 'gallery', 'docs'].includes(e.kind), e.kind)
    assert.ok(['html', 'text', 'markdown'].includes(e.format), e.format)
    assert.match(e.fingerprint, /^fnv1a32:[0-9a-f]{8}$/)
    assert.ok(e.bytes > 0, `${e.id} bytes`)
    assert.ok(e.lineCount >= 1, `${e.id} lineCount`)
    if (e.kind === 'export') {
      assert.ok(SCENARIOS.includes(e.scenario), e.scenario)
      assert.ok(FORMS.includes(e.form), e.form)
    } else {
      assert.equal(e.scenario, null)
      assert.equal(e.form, null)
    }
  }
})

test('manifest ordering is deterministic: kind then id', () => {
  const b = buildCoachDnaReleaseBundle()
  const ordered = [...b.manifest].sort((a, c) => (a.kind === c.kind ? a.id.localeCompare(c.id) : a.kind.localeCompare(c.kind)))
  assert.deepEqual(b.manifest.map((e) => e.id), ordered.map((e) => e.id))
})

test('contents map agrees with the manifest on size and fingerprint', () => {
  const b = buildCoachDnaReleaseBundle()
  assert.deepEqual(Object.keys(b.contents).sort(), b.manifest.map((e) => e.id).sort())
  let sum = 0
  for (const e of b.manifest) {
    const content = b.contents[e.id]
    assert.equal(typeof content, 'string', e.id)
    assert.equal(content.length, e.bytes, `${e.id} length`)
    sum += content.length
  }
  assert.equal(b.totalBytes, sum)
})

test('export contents reproduce the live M235 export pack', () => {
  const b = buildCoachDnaReleaseBundle()
  for (const scenario of SCENARIOS) {
    const pack = buildCoachDnaExport(COACH_DNA_SNAPSHOT_SCENARIOS[scenario])
    for (const form of FORMS) {
      assert.equal(b.contents[`export/${scenario}/${form}`], pack[form], `${scenario}/${form}`)
    }
  }
})

test('bundle fingerprint is deterministic and reacts to content changes', () => {
  const a = buildCoachDnaReleaseBundle()
  const b = buildCoachDnaReleaseBundle()
  assert.equal(a.bundleFingerprint, b.bundleFingerprint)
  const changed = buildCoachDnaReleaseBundle({ markdown: 'totally different docs\n' })
  assert.notEqual(changed.bundleFingerprint, a.bundleFingerprint)
  const docs = changed.manifest.find((e) => e.id === 'docs')
  assert.equal(docs.bytes, 'totally different docs\n'.length)
})

test('gate mirrors the live M239 release envelope', () => {
  const b = buildCoachDnaReleaseBundle()
  const envelope = buildCoachDnaReleaseEnvelope()
  assert.equal(b.gate.envelopeStatus, envelope.status)
  assert.equal(b.gate.envelopePass, envelope.pass)
  assert.equal(b.gate.envelopeSummary, envelope.summary)
  assert.equal(b.gate.docsFingerprint, envelope.evidence.docs.fingerprint)
})

test('a blocked envelope leaves the bundle unsealed without throwing', () => {
  const envelope = { ...buildCoachDnaReleaseEnvelope(), pass: false, status: 'blocked-for-review' }
  const b = buildCoachDnaReleaseBundle({ envelope })
  assert.equal(b.sealed, false)
  assert.equal(b.status, 'unsealed')
  assert.equal(b.gate.envelopePass, false)
  assert.match(b.summary, /status=unsealed/)
  // Content is still assembled — only the seal verdict changes.
  assert.equal(b.artifactCount, SCENARIOS.length * FORMS.length + 2)
})

test('no artifact content leaks internal fields or advice language', () => {
  const b = buildCoachDnaReleaseBundle()
  for (const e of b.manifest) {
    if (e.format !== 'text') continue // HTML/markdown legitimately mention contract terms in docs
    const content = b.contents[e.id]
    for (const token of INTERNAL_TOKENS) assert.ok(!content.includes(token), `${e.id} leaks ${token}`)
    assert.doesNotMatch(content, ADVICE_LANG, `${e.id} advice language`)
  }
})

test('canonical JSON serialization is deterministic, sorted, and excludes raw content', () => {
  const a = serializeCoachDnaReleaseBundle()
  const b = serializeCoachDnaReleaseBundle()
  assert.equal(a, b)
  const parsed = JSON.parse(a)
  assert.equal(parsed.type, 'coach-dna-release-bundle')
  assert.equal(parsed.status, 'sealed')
  assert.ok(Array.isArray(parsed.manifest))
  assert.equal(parsed.manifest.length, SCENARIOS.length * FORMS.length + 2)
  assert.ok(!('contents' in parsed), 'raw content excluded from canonical JSON')
  assert.ok(a.indexOf('"artifactCount"') < a.indexOf('"bundleFingerprint"'), 'top-level keys are sorted canonically')
})

test('manifest text serialization is compact and lists every artifact', () => {
  const b = buildCoachDnaReleaseBundle()
  const text = serializeCoachDnaReleaseBundle({}, { format: 'manifest' })
  assert.match(text, /^Coach DNA release bundle: sealed \(22 artifacts, \d+ bytes\)/)
  assert.match(text, new RegExp(`Bundle fingerprint: ${b.bundleFingerprint.replace(':', ':')}`))
  for (const e of b.manifest) assert.ok(text.includes(e.id), e.id)
})

test('line serialization equals the bundle summary', () => {
  const line = serializeCoachDnaReleaseBundle({}, { format: 'line' })
  assert.equal(line, buildCoachDnaReleaseBundle().summary)
  assert.match(line, /^status=sealed artifacts=22 bytes=\d+ bundle=fnv1a32:[0-9a-f]{8} envelope=ready-for-review$/)
})

test('malformed options safely fall back to the canonical bundle', () => {
  assert.equal(buildCoachDnaReleaseBundle(null).sealed, true)
  assert.equal(buildCoachDnaReleaseBundle('x').sealed, true)
  assert.equal(serializeCoachDnaReleaseBundle(null), serializeCoachDnaReleaseBundle('x'))
})

test('unsupported serialization format throws a programmer error', () => {
  assert.throws(() => serializeCoachDnaReleaseBundle({}, { format: 'xml' }), TypeError)
  assert.throws(() => serializeCoachDnaReleaseBundle({}, { format: 'zip' }), TypeError)
})

test('bundle output is deeply frozen', () => {
  const b = buildCoachDnaReleaseBundle()
  assert.ok(Object.isFrozen(b))
  assert.ok(Object.isFrozen(b.manifest))
  assert.ok(Object.isFrozen(b.manifest[0]))
  assert.ok(Object.isFrozen(b.contents))
  assert.ok(Object.isFrozen(b.gate))
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaReleaseBundle, 'function')
  assert.equal(typeof serializeCoachDnaReleaseBundle, 'function')
})
