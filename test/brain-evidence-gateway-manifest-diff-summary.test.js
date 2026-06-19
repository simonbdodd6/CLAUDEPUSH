/**
 * M101 — Evidence Gateway manifest diff summary (summarizeManifestDiff) tests
 *
 * Deterministic tests over an M100 diff: default line, explicit line, text, markdown, json,
 * empty diff, populated diff, exact-string formatting, determinism, invalid-diff rejection,
 * unknown-format rejection, no mutation, diff stays frozen, gateway parity. Presentation
 * only — reads diff.summary counts; computes nothing.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, gateManifestIndex, diffManifestIndexes,
  summarizeManifestDiff, canonicalStringify, createEvidenceGateway,
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
const manifestFor = (name) => createGateManifest(gateCI(setOf(name), { [name]: PLAN_PASS }))
const ix = (...ms) => gateManifestIndex(ms)

const a = manifestFor('a'), b = manifestFor('b'), c = manifestFor('c'), d = manifestFor('d')

// added=1 removed=1 changed=2 unchanged=0
const populated = () => diffManifestIndexes(ix(a, a, b, c, c), ix(a, b, b, d))
// added=0 removed=0 changed=0 unchanged=0
const emptyDiff = () => diffManifestIndexes(ix(), ix())
// added=0 removed=0 changed=0 unchanged=2
const unchangedDiff = () => diffManifestIndexes(ix(a, b), ix(a, b))

// ── line (default + explicit) ────────────────────────────────────────────────────────

test('default format is line', () => {
  const diff = populated()
  assert.equal(summarizeManifestDiff(diff), 'manifest-diff added=1 removed=1 changed=2 unchanged=0')
  assert.equal(summarizeManifestDiff(diff), summarizeManifestDiff(diff, { format: 'line' }))
})

test('explicit line — unchanged diff', () => {
  assert.equal(summarizeManifestDiff(unchangedDiff(), { format: 'line' }), 'manifest-diff added=0 removed=0 changed=0 unchanged=2')
})

// ── text ─────────────────────────────────────────────────────────────────────────────

test('text format exact string', () => {
  assert.equal(summarizeManifestDiff(populated(), { format: 'text' }),
    ['Manifest Diff', 'Added: 1', 'Removed: 1', 'Changed: 2', 'Unchanged: 0'].join('\n\n'))
})

// ── markdown ─────────────────────────────────────────────────────────────────────────

test('markdown format exact string', () => {
  assert.equal(summarizeManifestDiff(populated(), { format: 'markdown' }),
    ['# Manifest Diff', '- Added: 1', '- Removed: 1', '- Changed: 2', '- Unchanged: 0'].join('\n\n'))
})

// ── json ─────────────────────────────────────────────────────────────────────────────

test('json format → canonical, round-trips, reuses canonicalStringify', () => {
  const diff = populated()
  const s = summarizeManifestDiff(diff, { format: 'json' })
  assert.equal(s, canonicalStringify(diff))
  assert.deepEqual(JSON.parse(s), JSON.parse(canonicalStringify(diff)))
})

// ── empty / populated ────────────────────────────────────────────────────────────────

test('empty diff', () => {
  assert.equal(summarizeManifestDiff(emptyDiff(), { format: 'line' }), 'manifest-diff added=0 removed=0 changed=0 unchanged=0')
  assert.equal(summarizeManifestDiff(emptyDiff(), { format: 'text' }),
    ['Manifest Diff', 'Added: 0', 'Removed: 0', 'Changed: 0', 'Unchanged: 0'].join('\n\n'))
})

test('populated diff line reflects the diff summary counts', () => {
  const diff = populated()
  assert.equal(summarizeManifestDiff(diff, { format: 'line' }),
    `manifest-diff added=${diff.summary.added} removed=${diff.summary.removed} changed=${diff.summary.changed} unchanged=${diff.summary.unchanged}`)
})

// ── determinism / mutation ───────────────────────────────────────────────────────────

test('deterministic — identical diff → identical output (all formats)', () => {
  for (const format of ['line', 'text', 'markdown', 'json']) {
    assert.equal(summarizeManifestDiff(populated(), { format }), summarizeManifestDiff(populated(), { format }))
  }
})

test('does not mutate the diff (and it stays frozen)', () => {
  const diff = populated()
  const before = JSON.stringify(diff)
  for (const format of ['line', 'text', 'markdown', 'json']) summarizeManifestDiff(diff, { format })
  assert.equal(JSON.stringify(diff), before)
  assert.ok(Object.isFrozen(diff) && Object.isFrozen(diff.summary) && Object.isFrozen(diff.added))
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('unknown format → TypeError', () => {
  const diff = populated()
  assert.throws(() => summarizeManifestDiff(diff, { format: 'yaml' }), TypeError)
  assert.throws(() => summarizeManifestDiff(diff, { format: '' }), TypeError)
  assert.throws(() => summarizeManifestDiff(diff, { format: 9 }), TypeError)
})

test('invalid diff → TypeError', () => {
  assert.throws(() => summarizeManifestDiff(null), TypeError)
  assert.throws(() => summarizeManifestDiff('nope'), TypeError)
  assert.throws(() => summarizeManifestDiff({}), TypeError)
  assert.throws(() => summarizeManifestDiff({ added: [], removed: [], changed: [], unchanged: [] }), TypeError)   // no summary
  assert.throws(() => summarizeManifestDiff({ added: [], removed: [], changed: [], unchanged: [], summary: { added: 1 } }), TypeError)   // incomplete summary
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.summarizeManifestDiff matches summarizeManifestDiff (all formats + default)', () => {
  const gw = createEvidenceGateway()
  const diff = populated()
  for (const format of ['line', 'text', 'markdown', 'json']) {
    assert.equal(gw.summarizeManifestDiff(diff, { format }), summarizeManifestDiff(diff, { format }))
  }
  assert.equal(gw.summarizeManifestDiff(diff), summarizeManifestDiff(diff))
})
