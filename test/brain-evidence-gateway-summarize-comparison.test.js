/**
 * M86 — Evidence Gateway manifest comparison summary (summarizeManifestComparison) tests
 *
 * Deterministic tests over an M84 comparison result: line (identical + non-identical +
 * token omission), text, markdown, json (round-trip), default format, determinism, empty
 * sections omitted cleanly, invalid-format rejection, invalid-comparison rejection, input
 * not mutated, gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, compareGateManifests,
  summarizeManifestComparison, canonicalStringify, createEvidenceGateway,
} from '@brain/evidence-gateway'
import { createNormalizerRegistry } from '@brain/evidence-normalization'
import { SOURCE_TYPE, SIGNAL_POLARITY } from '@brain/evidence-contracts'

const TENANT = Object.freeze({ clubId: 'c1', teamId: 't1', seasonId: 's1' })
const NCTX = Object.freeze({ now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' })
const rec = (id, over = {}) => Object.freeze({
  id, tenant: TENANT, subjectType: 'player', subjectId: 'player-9',
  sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, observedAt: '2026-06-16T09:30:00.000Z', confidence: 0.8, ...over,
})
const frame = (value = 0.82, confidence = 0.5) => ({
  sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, version: '1.0',
  normalize: (r) => [{ key: 'lineout.winRate', value, unit: null, polarity: SIGNAL_POLARITY.STRENGTH, confidence, evidenceId: r.id }],
})
const badNote = { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE, version: '1.0',
  normalize: (r) => [{ key: 'bad key', value: 1, unit: null, polarity: null, confidence: 0.5, evidenceId: r.id }] }

const REG = createNormalizerRegistry([frame(), badNote])
const planFor = (registry, records) => prepareFullPipelinePlan({ registry, records, context: NCTX })
const snapFor = (registry, records) => snapshotPipelinePlan(planFor(registry, records))

const SNAP_A = snapFor(REG, [rec('ev_1')])
const PLAN_PASS = planFor(REG, [rec('ev_1')])
const setOf = (...names) => createExpectationSet(names.map(n => ({ name: n, expectedSnapshot: SNAP_A })))
const clone = (x) => structuredClone(x)

const baseManifest = () => createGateManifest(gateCI(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_PASS }))

// an identical comparison
const identicalComparison = () => compareGateManifests(baseManifest(), baseManifest())

// a non-identical comparison: changed case digest + report + 2 artifact digests
function changedComparison() {
  const a = baseManifest()
  const b = clone(a)
  b.pipelineDigest = '1111111111111111'                  // overall digest differs (realistic)
  b.inputs.caseDigests[1] = 'ffffffffffffffff'           // case 'bad' changed
  b.report.reportDigest = 'eeeeeeeeeeeeeeee'             // report changed
  b.artifacts.outcomeDigest = 'bbbbbbbbbbbbbbbb'         // artifact changes...
  b.artifacts.reportDigest = 'cccccccccccccccc'
  return compareGateManifests(a, b)
}

// ── line ─────────────────────────────────────────────────────────────────────────────

test('line for identical → no areas/cases/artifacts tokens', () => {
  const s = summarizeManifestComparison(identicalComparison(), { format: 'line' })
  assert.equal(s, 'manifest-diff identical=true pipelineDigestMatch=true changed=0')
})

test('line for non-identical → areas/cases/artifacts tokens present', () => {
  const c = changedComparison()
  const s = summarizeManifestComparison(c, { format: 'line' })
  assert.equal(s, `manifest-diff identical=false pipelineDigestMatch=false changed=${c.changed.length} areas=${c.changed.join(',')} cases=${c.caseChanges.length} artifacts=${c.artifactChanges.length}`)
  assert.ok(s.startsWith('manifest-diff identical=false pipelineDigestMatch=false changed='))
  assert.ok(s.includes('areas=inputs,report,artifacts'))
  assert.ok(s.includes('cases=1') && s.includes('artifacts=2'))
})

test('line omits cases token when no case changes (artifacts only)', () => {
  const a = baseManifest()
  const b = clone(a); b.artifacts.envelopeDigest = '0000000000000000'
  const s = summarizeManifestComparison(compareGateManifests(a, b), { format: 'line' })
  assert.ok(s.includes('artifacts=1'))
  assert.ok(!s.includes('cases='))
  assert.ok(s.includes('areas=artifacts'))
})

// ── text ─────────────────────────────────────────────────────────────────────────────

test('text → readable summary with sections', () => {
  const c = changedComparison()
  const s = summarizeManifestComparison(c, { format: 'text' })
  assert.ok(s.startsWith('Manifest comparison\n'))
  assert.ok(s.includes('identical: false'))
  assert.ok(s.includes('pipelineDigestMatch: false'))
  assert.ok(s.includes('changed areas: inputs, report, artifacts'))
  assert.ok(s.includes('report: changed=true'))
  assert.ok(s.includes('Case changes:'))
  assert.ok(s.includes('  - bad: changed ('))
  assert.ok(s.includes('Artifact changes:'))
  assert.ok(s.includes('  - outcomeDigest: '))
})

test('text for identical → "none" areas and no sections', () => {
  const s = summarizeManifestComparison(identicalComparison(), { format: 'text' })
  assert.ok(s.includes('changed areas: none'))
  assert.ok(!s.includes('Case changes:'))
  assert.ok(!s.includes('Artifact changes:'))
})

// ── markdown ─────────────────────────────────────────────────────────────────────────

test('markdown → headings, flags, and sections', () => {
  const c = changedComparison()
  const md = summarizeManifestComparison(c, { format: 'markdown' })
  assert.ok(md.startsWith('# Manifest Comparison'))
  assert.ok(md.includes('**Identical:** false  **Pipeline digest match:** false'))
  assert.ok(md.includes('**Changed areas:** inputs, report, artifacts'))
  assert.ok(md.includes('**Flags:** policy=false outcome=false decision=false report=true'))
  assert.ok(md.includes('## Case changes'))
  assert.ok(md.includes('- **bad** — changed (`'))
  assert.ok(md.includes('## Artifact changes'))
  assert.ok(md.includes('- **outcomeDigest** — `'))
})

test('markdown for identical → no change sections', () => {
  const md = summarizeManifestComparison(identicalComparison(), { format: 'markdown' })
  assert.ok(md.includes('**Changed areas:** none'))
  assert.ok(!md.includes('## Case changes'))
  assert.ok(!md.includes('## Artifact changes'))
})

// ── json ─────────────────────────────────────────────────────────────────────────────

test('json → canonical, round-trips, reuses canonicalStringify', () => {
  const c = changedComparison()
  const s = summarizeManifestComparison(c, { format: 'json' })
  assert.equal(s, canonicalStringify(c))
  assert.deepEqual(JSON.parse(s), JSON.parse(canonicalStringify(c)))
})

// ── default format ───────────────────────────────────────────────────────────────────

test('default format is line', () => {
  const c = changedComparison()
  assert.equal(summarizeManifestComparison(c), summarizeManifestComparison(c, { format: 'line' }))
})

// ── determinism ──────────────────────────────────────────────────────────────────────

test('deterministic — identical comparison → identical summary (all formats)', () => {
  for (const format of ['line', 'text', 'markdown', 'json']) {
    assert.equal(summarizeManifestComparison(changedComparison(), { format }), summarizeManifestComparison(changedComparison(), { format }))
  }
})

test('caseChanges/artifactChanges render in M84 order', () => {
  const c = changedComparison()
  const text = summarizeManifestComparison(c, { format: 'text' })
  // artifact rows appear in M84 order (outcomeDigest before reportDigest per ARTIFACT_KEYS)
  assert.ok(text.indexOf('- outcomeDigest:') < text.indexOf('- reportDigest:'))
})

// ── invalid format / comparison ──────────────────────────────────────────────────────

test('unknown format → TypeError', () => {
  const c = identicalComparison()
  assert.throws(() => summarizeManifestComparison(c, { format: 'csv' }), TypeError)
  assert.throws(() => summarizeManifestComparison(c, { format: '' }), TypeError)
})

test('invalid comparison → TypeError', () => {
  assert.throws(() => summarizeManifestComparison(null), TypeError)
  assert.throws(() => summarizeManifestComparison({}), TypeError)
  assert.throws(() => summarizeManifestComparison({ identical: true }), TypeError)   // missing fields
})

// ── purity: input untouched ──────────────────────────────────────────────────────────

test('does not mutate the input comparison', () => {
  const c = changedComparison()
  const before = JSON.stringify(c)
  for (const format of ['line', 'text', 'markdown', 'json']) summarizeManifestComparison(c, { format })
  assert.equal(JSON.stringify(c), before)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.summarizeManifestComparison matches summarizeManifestComparison (all formats + default)', () => {
  const gw = createEvidenceGateway()
  const c = changedComparison()
  for (const format of ['line', 'text', 'markdown', 'json']) {
    assert.equal(gw.summarizeManifestComparison(c, { format }), summarizeManifestComparison(c, { format }))
  }
  assert.equal(gw.summarizeManifestComparison(c), summarizeManifestComparison(c))
})
