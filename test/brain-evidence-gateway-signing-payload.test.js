/**
 * M88 — Evidence Gateway gate manifest signing payload (gateManifestSigningPayload) tests
 *
 * Deterministic tests over an M83 manifest: frozen { pipelineDigest, canonical }; digest
 * equals verifyGateManifest().actual; canonical excludes manifest.pipelineDigest; tampering
 * a payload field changes the digest; tampering only pipelineDigest does not; determinism;
 * invalid-input rejection; no input mutation; gateway parity. Reuses the M65 approach (no
 * new hashing/canonicalisation).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, verifyGateManifest,
  gateManifestSigningPayload, canonicalStringify, pipelineDigest, createEvidenceGateway,
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

const manifest = () => createGateManifest(gateCI(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_PASS }))
const HEX16 = /^[0-9a-f]{16}$/

// ── 1. valid → frozen { pipelineDigest, canonical } ──────────────────────────────────

test('valid manifest → frozen { pipelineDigest, canonical }', () => {
  const p = gateManifestSigningPayload(manifest())
  assert.deepEqual(Object.keys(p).sort(), ['canonical', 'pipelineDigest'])
  assert.ok(HEX16.test(p.pipelineDigest))
  assert.equal(typeof p.canonical, 'string')
  assert.deepEqual(JSON.parse(p.canonical), JSON.parse(p.canonical))   // valid JSON
  assert.ok(Object.isFrozen(p))
  assert.throws(() => { p.pipelineDigest = 'x' })
})

// ── 2. pipelineDigest equals verifyGateManifest().actual ─────────────────────────────

test('pipelineDigest equals verifyGateManifest(manifest).actual', () => {
  const m = manifest()
  assert.equal(gateManifestSigningPayload(m).pipelineDigest, verifyGateManifest(m).actual)
  // for an untouched manifest that also equals the stored digest
  assert.equal(gateManifestSigningPayload(m).pipelineDigest, m.pipelineDigest)
})

// ── 3. canonical excludes manifest.pipelineDigest ────────────────────────────────────

test('canonical excludes the manifest pipelineDigest field', () => {
  const m = manifest()
  const p = gateManifestSigningPayload(m)
  const parsed = JSON.parse(p.canonical)
  assert.ok(!('pipelineDigest' in parsed))
  // it is exactly the canonical JSON of the manifest minus pipelineDigest
  const { pipelineDigest: _omit, ...payload } = m
  assert.equal(p.canonical, canonicalStringify(payload))
  assert.equal(p.pipelineDigest, pipelineDigest(canonicalStringify(payload)))
})

// ── 4. tampering a payload field changes pipelineDigest ──────────────────────────────

test('tampering a payload field changes the signing pipelineDigest', () => {
  const base = gateManifestSigningPayload(manifest())
  const t = clone(manifest()); t.report.headline = `${t.report.headline} (tampered)`
  const after = gateManifestSigningPayload(t)
  assert.notEqual(after.pipelineDigest, base.pipelineDigest)
  assert.notEqual(after.canonical, base.canonical)
})

// ── 5. tampering only pipelineDigest does NOT change the signing payload ──────────────

test('tampering only manifest.pipelineDigest leaves the signing payload unchanged', () => {
  const m = manifest()
  const base = gateManifestSigningPayload(m)
  const t = clone(m); t.pipelineDigest = 'deadbeefdeadbeef'
  const after = gateManifestSigningPayload(t)
  assert.equal(after.pipelineDigest, base.pipelineDigest)   // payload digest unaffected
  assert.equal(after.canonical, base.canonical)
})

// ── 6. determinism ───────────────────────────────────────────────────────────────────

test('deterministic across repeated calls', () => {
  const m = manifest()
  assert.deepEqual(gateManifestSigningPayload(m), gateManifestSigningPayload(m))
})

// ── 7. invalid input ─────────────────────────────────────────────────────────────────

test('invalid input → TypeError', () => {
  assert.throws(() => gateManifestSigningPayload(null), TypeError)
  assert.throws(() => gateManifestSigningPayload('nope'), TypeError)
  assert.throws(() => gateManifestSigningPayload({}), TypeError)
  assert.throws(() => gateManifestSigningPayload({ pipelineDigest: 'x' }), TypeError)   // missing sub-objects
})

// ── 8. no input mutation ─────────────────────────────────────────────────────────────

test('does not mutate the input manifest', () => {
  const m = manifest()
  const before = JSON.stringify(m)
  gateManifestSigningPayload(m)
  assert.equal(JSON.stringify(m), before)
})

// ── 9. gateway parity ────────────────────────────────────────────────────────────────

test('gateway.gateManifestSigningPayload matches gateManifestSigningPayload', () => {
  const gw = createEvidenceGateway()
  const m = manifest()
  assert.deepEqual(gw.gateManifestSigningPayload(m), gateManifestSigningPayload(m))
})
