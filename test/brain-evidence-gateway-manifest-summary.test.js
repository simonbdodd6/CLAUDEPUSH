/**
 * M97 — Evidence Gateway manifest index summary (summarizeManifestIndex) tests
 *
 * Deterministic tests over an M95 index: default line, explicit line, text, markdown, json,
 * empty index, non-empty index, exact-string formatting, determinism, no mutation, unknown-
 * format rejection, invalid-index / missing-fields rejection, index stays frozen, gateway
 * parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, gateManifestIndex,
  summarizeManifestIndex, canonicalStringify, createEvidenceGateway,
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

// total=6 unique=3 duplicates=3 (matches the spec examples)
const indexOf = () => {
  const a = manifestFor('a'), b = manifestFor('b'), c = manifestFor('c')
  return gateManifestIndex([a, a, b, c, c, c])
}

// ── line (default + explicit) ────────────────────────────────────────────────────────

test('default format is line', () => {
  const ix = indexOf()
  assert.equal(summarizeManifestIndex(ix), 'manifest-index total=6 unique=3 duplicates=3')
  assert.equal(summarizeManifestIndex(ix), summarizeManifestIndex(ix, { format: 'line' }))
})

test('explicit line format', () => {
  assert.equal(summarizeManifestIndex(indexOf(), { format: 'line' }), 'manifest-index total=6 unique=3 duplicates=3')
})

// ── text ─────────────────────────────────────────────────────────────────────────────

test('text format exact string', () => {
  assert.equal(summarizeManifestIndex(indexOf(), { format: 'text' }),
    ['Manifest Index', '', 'Total manifests: 6', 'Unique digests: 3', 'Duplicate manifests: 3'].join('\n'))
})

// ── markdown ─────────────────────────────────────────────────────────────────────────

test('markdown format exact string', () => {
  assert.equal(summarizeManifestIndex(indexOf(), { format: 'markdown' }),
    ['# Manifest Index', '', '- Total: 6', '- Unique digests: 3', '- Duplicates: 3'].join('\n'))
})

// ── json ─────────────────────────────────────────────────────────────────────────────

test('json format → canonical, round-trips, reuses canonicalStringify', () => {
  const ix = indexOf()
  const s = summarizeManifestIndex(ix, { format: 'json' })
  assert.equal(s, canonicalStringify(ix))
  assert.deepEqual(JSON.parse(s), JSON.parse(canonicalStringify(ix)))
})

// ── empty / non-empty ────────────────────────────────────────────────────────────────

test('empty index', () => {
  const ix = gateManifestIndex([])
  assert.equal(summarizeManifestIndex(ix, { format: 'line' }), 'manifest-index total=0 unique=0 duplicates=0')
  assert.equal(summarizeManifestIndex(ix, { format: 'text' }),
    ['Manifest Index', '', 'Total manifests: 0', 'Unique digests: 0', 'Duplicate manifests: 0'].join('\n'))
})

test('non-empty unique-only index', () => {
  const ix = gateManifestIndex([manifestFor('a'), manifestFor('b')])
  assert.equal(summarizeManifestIndex(ix, { format: 'line' }), 'manifest-index total=2 unique=2 duplicates=0')
})

// ── determinism / mutation ───────────────────────────────────────────────────────────

test('deterministic — identical index → identical output (all formats)', () => {
  const ix = indexOf()
  for (const format of ['line', 'text', 'markdown', 'json']) {
    assert.equal(summarizeManifestIndex(ix, { format }), summarizeManifestIndex(ix, { format }))
  }
})

test('does not mutate the index (and it stays deeply frozen)', () => {
  const ix = indexOf()
  const before = JSON.stringify(ix)
  for (const format of ['line', 'text', 'markdown', 'json']) summarizeManifestIndex(ix, { format })
  assert.equal(JSON.stringify(ix), before)
  assert.ok(Object.isFrozen(ix) && Object.isFrozen(ix.entries) && Object.isFrozen(ix.digests))
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('unknown format → TypeError', () => {
  const ix = indexOf()
  assert.throws(() => summarizeManifestIndex(ix, { format: 'yaml' }), TypeError)
  assert.throws(() => summarizeManifestIndex(ix, { format: '' }), TypeError)
  assert.throws(() => summarizeManifestIndex(ix, { format: 9 }), TypeError)
})

test('invalid index → TypeError', () => {
  assert.throws(() => summarizeManifestIndex(null), TypeError)
  assert.throws(() => summarizeManifestIndex('nope'), TypeError)
  assert.throws(() => summarizeManifestIndex(42), TypeError)
})

test('missing required fields → TypeError', () => {
  assert.throws(() => summarizeManifestIndex({}), TypeError)
  assert.throws(() => summarizeManifestIndex({ total: 1, unique: 1, duplicates: 0 }), TypeError)                 // no digests/entries
  assert.throws(() => summarizeManifestIndex({ total: 1, unique: 1, duplicates: 0, digests: [] }), TypeError)    // no entries
  assert.throws(() => summarizeManifestIndex({ total: '1', unique: 1, duplicates: 0, digests: [], entries: {} }), TypeError)  // wrong type
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.summarizeManifestIndex matches summarizeManifestIndex (all formats + default)', () => {
  const gw = createEvidenceGateway()
  const ix = indexOf()
  for (const format of ['line', 'text', 'markdown', 'json']) {
    assert.equal(gw.summarizeManifestIndex(ix, { format }), summarizeManifestIndex(ix, { format }))
  }
  assert.equal(gw.summarizeManifestIndex(ix), summarizeManifestIndex(ix))
})
