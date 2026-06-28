/**
 * web/brain-coach-dna-release-checklist - Coach DNA Publishing Readiness Checklist (M238) tests
 *
 * Verifies the dormant M238 checklist over M230-M237: complete component inventory, public contract
 * coverage, validator summary, snapshot inventory, docs sections/diagrams, deterministic text summary,
 * failure reporting, frozen output, and no production wiring or generated advice language.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaReleaseChecklist,
  summarizeCoachDnaReleaseChecklist,
} from '../web/brain-coach-dna-release-checklist.js'
import { buildCoachDnaDocs, renderCoachDnaDocsMarkdown } from '../web/brain-coach-dna-docs.js'
import { validateCoachDnaExports } from '../web/brain-coach-dna-validator.js'
import { buildCoachDnaSnapshots, COACH_DNA_SNAPSHOT_SCENARIOS } from '../web/brain-coach-dna-snapshots.js'

const EXPECTED_FIELDS = ['profileVersion', 'confidence', 'headline', 'identity', 'dominantSignals', 'themes', 'knowledge', 'summary', 'metadata']
const EXPECTED_ASPECTS = ['clipboard', 'contract', 'export', 'gallery', 'html', 'page', 'screen', 'text']

test('canonical checklist passes and has the expected envelope', () => {
  const c = buildCoachDnaReleaseChecklist()
  assert.equal(c.type, 'coach-dna-publishing-readiness-checklist')
  assert.equal(c.schemaVersion, 1)
  assert.equal(c.status, 'ready-for-human-review')
  assert.equal(c.pass, true)
  assert.equal(c.checkCount, 8)
  assert.equal(c.passedChecks, 8)
  assert.equal(c.failedChecks, 0)
  assert.deepEqual(c.mismatchSummary, [])
})

test('component inventory covers M230-M237 without adding a production surface', () => {
  const c = buildCoachDnaReleaseChecklist()
  assert.equal(c.componentCount, 9)
  const milestones = new Set(c.components.map((x) => x.milestone))
  for (const m of ['M230', 'M231', 'M232', 'M233', 'M234', 'M235', 'M236', 'M237']) assert.ok(milestones.has(m), `missing ${m}`)
  for (const item of c.components) {
    assert.ok(item.artifact.startsWith('web/') || item.artifact.startsWith('packages/coach-intelligence/'))
    assert.doesNotMatch(item.artifact, /index\.html|api\/|app\/|src\/|CLAUDEPUSH/)
  }
})

test('contract-field check matches the M237 docs field inventory', () => {
  const c = buildCoachDnaReleaseChecklist()
  const contract = c.checks.find((x) => x.id === 'contract-fields')
  assert.equal(contract.pass, true)
  assert.deepEqual(contract.detail.expected, EXPECTED_FIELDS)
  assert.deepEqual(contract.detail.actual, [...EXPECTED_FIELDS].sort())
  assert.equal(c.docsSummary.fieldCount, EXPECTED_FIELDS.length)
})

test('validator summary mirrors the live M236 validator', () => {
  const c = buildCoachDnaReleaseChecklist()
  const v = validateCoachDnaExports()
  assert.equal(c.validationSummary.totalChecks, v.totalChecks)
  assert.equal(c.validationSummary.failedChecks, v.failedChecks)
  assert.deepEqual(c.validationSummary.aspects, EXPECTED_ASPECTS)
})

test('snapshot summary covers every canonical Coach DNA scenario', () => {
  const c = buildCoachDnaReleaseChecklist()
  const names = Object.keys(COACH_DNA_SNAPSHOT_SCENARIOS).sort()
  assert.equal(c.snapshotSummary.scenarioCount, names.length)
  assert.equal(c.snapshotSummary.snapshotCount, Object.keys(buildCoachDnaSnapshots()).length)
  assert.deepEqual(c.snapshotSummary.scenarios, names)
  assert.equal(c.checks.find((x) => x.id === 'snapshots-present').pass, true)
})

test('documentation checks require sections and architecture diagrams', () => {
  const c = buildCoachDnaReleaseChecklist()
  assert.equal(c.checks.find((x) => x.id === 'docs-sections').pass, true)
  assert.equal(c.checks.find((x) => x.id === 'architecture-diagrams').pass, true)
  assert.deepEqual(c.docsSummary.sections, ['Contract field reference', 'Component map', 'Rendering pipeline', 'Snapshot generation', 'Export formats', 'Validator behaviour', 'Architecture diagrams'])
})

test('output and nested collections are deeply frozen', () => {
  const c = buildCoachDnaReleaseChecklist()
  assert.ok(Object.isFrozen(c))
  assert.ok(Object.isFrozen(c.components))
  assert.ok(Object.isFrozen(c.components[0]))
  assert.ok(Object.isFrozen(c.checks))
  assert.ok(Object.isFrozen(c.checks[0]))
  assert.ok(Object.isFrozen(c.validationSummary))
  assert.ok(Object.isFrozen(c.snapshotSummary.scenarios))
})

test('summary is deterministic and compact', () => {
  const a = summarizeCoachDnaReleaseChecklist()
  const b = summarizeCoachDnaReleaseChecklist()
  assert.equal(a, b)
  assert.equal(a, [
    'Coach DNA publishing checklist: ready-for-human-review',
    'Checks: 8/8',
    'Components: 9',
    'Validator: 36 checks, 0 failed',
    'Snapshots: 5/5',
  ].join('\n'))
})

test('tampered validation failure makes the checklist fail without throwing', () => {
  const validation = { ...validateCoachDnaExports(), pass: false, failedChecks: 1 }
  const c = buildCoachDnaReleaseChecklist({ validation })
  assert.equal(c.pass, false)
  assert.equal(c.status, 'needs-review')
  assert.equal(c.failedChecks, 1)
  assert.ok(c.mismatchSummary.some((x) => x.startsWith('validator-pass:')))
})

test('missing documentation field is reported in the contract check', () => {
  const docs = buildCoachDnaDocs()
  const trimmed = { ...docs, contractFields: docs.contractFields.filter((f) => f.name !== 'metadata') }
  const c = buildCoachDnaReleaseChecklist({ docs })
  assert.equal(c.pass, true)
  const failed = buildCoachDnaReleaseChecklist({ docs: trimmed })
  assert.equal(failed.pass, false)
  assert.equal(failed.checks.find((x) => x.id === 'contract-fields').pass, false)
})

test('missing snapshot is reported in the snapshot check', () => {
  const snapshots = { ...buildCoachDnaSnapshots() }
  delete snapshots.empty
  const c = buildCoachDnaReleaseChecklist({ snapshots })
  assert.equal(c.pass, false)
  assert.equal(c.checks.find((x) => x.id === 'snapshots-present').pass, false)
})

test('safety check rejects internal contract rows and generated advice language', () => {
  const md = renderCoachDnaDocsMarkdown()
  assert.equal(buildCoachDnaReleaseChecklist({ markdown: md }).pass, true)
  const leaked = `${md}\n| supportingMemoryIds | string[] | leak | bad |`
  const leakCheck = buildCoachDnaReleaseChecklist({ markdown: leaked }).checks.find((x) => x.id === 'safety-language')
  assert.equal(leakCheck.pass, false)
  const adviceCheck = buildCoachDnaReleaseChecklist({ markdown: `${md}\nyou should pick him` }).checks.find((x) => x.id === 'safety-language')
  assert.equal(adviceCheck.pass, false)
})

test('exports exist and malformed options use canonical defaults', () => {
  assert.equal(typeof buildCoachDnaReleaseChecklist, 'function')
  assert.equal(typeof summarizeCoachDnaReleaseChecklist, 'function')
  assert.equal(buildCoachDnaReleaseChecklist(null).pass, true)
  assert.equal(buildCoachDnaReleaseChecklist('x').pass, true)
})
