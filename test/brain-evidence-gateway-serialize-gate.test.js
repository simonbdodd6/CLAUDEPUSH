/**
 * M73 — Evidence Gateway gate-outcome serializers (serializeGateOutcome) tests
 *
 * Deterministic tests for the dormant serializers over an M72 outcome: json (canonical,
 * round-trips), line (statusLine verbatim), annotations (stage<TAB>path<TAB>caseName rows),
 * overflow "... N more", empty annotations, default format, deterministic ordering, invalid
 * format rejection, gateway parity, frozen input untouched.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, runExpectationGate,
  emitGateOutcome, serializeGateOutcome, canonicalStringify, createEvidenceGateway,
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
const REG_CONF = createNormalizerRegistry([frame(0.82, 0.6), badNote])

const planFor = (registry, records) => prepareFullPipelinePlan({ registry, records, context: NCTX })
const snapFor = (registry, records) => snapshotPipelinePlan(planFor(registry, records))

const SNAP_A = snapFor(REG, [rec('ev_1')])
const PLAN_PASS = planFor(REG, [rec('ev_1')])
const PLAN_FAIL = planFor(REG_CONF, [rec('ev_1')])
const setOf = (...names) => createExpectationSet(names.map(n => ({ name: n, expectedSnapshot: SNAP_A })))

const passOutcome = () => emitGateOutcome(runExpectationGate(setOf('a', 'b'), { a: PLAN_PASS, b: PLAN_PASS }))
const failOutcome = (opts) => emitGateOutcome(runExpectationGate(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_FAIL }), opts)

// ── json ─────────────────────────────────────────────────────────────────────────────

test('format:"json" → canonical JSON string that round-trips to the outcome', () => {
  const o = failOutcome()
  const s = serializeGateOutcome(o, { format: 'json' })
  assert.equal(typeof s, 'string')
  assert.equal(s, canonicalStringify(o))              // reuses the canonical stringifier
  assert.deepEqual(JSON.parse(s), JSON.parse(canonicalStringify(o)))
  // canonical → object keys are sorted
  assert.ok(s.indexOf('"affectedStages"') < s.indexOf('"annotations"'))
})

test('default format is json', () => {
  const o = passOutcome()
  assert.equal(serializeGateOutcome(o), serializeGateOutcome(o, { format: 'json' }))
})

// ── line ─────────────────────────────────────────────────────────────────────────────

test('format:"line" → the M72 statusLine verbatim', () => {
  const o = failOutcome()
  assert.equal(serializeGateOutcome(o, { format: 'line' }), o.statusLine)
  assert.ok(serializeGateOutcome(o, { format: 'line' }).startsWith('gate=fail cases=1/2 first=bad'))
})

test('format:"line" for a passing outcome', () => {
  assert.equal(serializeGateOutcome(passOutcome(), { format: 'line' }), 'gate=pass cases=2/2 violations=0 tolerated=0')
})

// ── annotations ──────────────────────────────────────────────────────────────────────

test('format:"annotations" → one stage<TAB>path<TAB>caseName row per annotation', () => {
  const o = failOutcome()
  const s = serializeGateOutcome(o, { format: 'annotations' })
  const rows = s.split('\n')
  assert.equal(rows.length, o.annotations.length)
  rows.forEach((row, i) => {
    const [stage, path, caseName] = row.split('\t')
    assert.equal(stage, o.annotations[i].stage)
    assert.equal(path, o.annotations[i].path)
    assert.equal(caseName, o.annotations[i].caseName)
  })
})

test('format:"annotations" appends "... N more" exactly once on overflow', () => {
  const full = failOutcome()
  assert.ok(full.annotations.length > 1, 'fixture should yield several annotations')
  const o = failOutcome({ maxAnnotations: 1 })
  const s = serializeGateOutcome(o, { format: 'annotations' })
  const rows = s.split('\n')
  assert.equal(rows.length, 2)                                   // 1 annotation + 1 overflow line
  assert.equal(rows[0], `${o.annotations[0].stage}\t${o.annotations[0].path}\t${o.annotations[0].caseName}`)
  assert.equal(rows[1], `... ${o.overflow} more`)
  assert.equal((s.match(/\.\.\. \d+ more/g) || []).length, 1)    // exactly once
})

test('format:"annotations" with maxAnnotations=0 → only the overflow line', () => {
  const o = failOutcome({ maxAnnotations: 0 })
  const s = serializeGateOutcome(o, { format: 'annotations' })
  assert.equal(s, `... ${o.overflow} more`)
})

test('format:"annotations" with no violations → empty string', () => {
  const s = serializeGateOutcome(passOutcome(), { format: 'annotations' })
  assert.equal(s, '')
})

// ── determinism ──────────────────────────────────────────────────────────────────────

test('deterministic — identical outcome → identical serialization (all formats)', () => {
  for (const format of ['json', 'line', 'annotations']) {
    assert.equal(serializeGateOutcome(failOutcome(), { format }), serializeGateOutcome(failOutcome(), { format }))
  }
})

// ── invalid format / input ───────────────────────────────────────────────────────────

test('unknown format → TypeError', () => {
  const o = passOutcome()
  assert.throws(() => serializeGateOutcome(o, { format: 'yaml' }), TypeError)
  assert.throws(() => serializeGateOutcome(o, { format: '' }), TypeError)
  assert.throws(() => serializeGateOutcome(o, { format: 123 }), TypeError)
})

test('invalid outcome → TypeError', () => {
  assert.throws(() => serializeGateOutcome(null), TypeError)
  assert.throws(() => serializeGateOutcome('nope'), TypeError)
})

// ── purity: input untouched ──────────────────────────────────────────────────────────

test('frozen input outcome is left untouched', () => {
  const o = failOutcome({ maxAnnotations: 1 })
  assert.ok(Object.isFrozen(o))
  const before = JSON.stringify(o)
  serializeGateOutcome(o, { format: 'json' })
  serializeGateOutcome(o, { format: 'line' })
  serializeGateOutcome(o, { format: 'annotations' })
  assert.equal(JSON.stringify(o), before)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.serializeGateOutcome matches serializeGateOutcome (all formats)', () => {
  const gw = createEvidenceGateway()
  const o = failOutcome({ maxAnnotations: 2 })
  for (const format of ['json', 'line', 'annotations']) {
    assert.equal(gw.serializeGateOutcome(o, { format }), serializeGateOutcome(o, { format }))
  }
  assert.equal(gw.serializeGateOutcome(o), serializeGateOutcome(o))   // default
})
