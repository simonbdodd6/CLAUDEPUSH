/**
 * M79 — Evidence Gateway gate-decision serializers (serializeGateDecision) tests
 *
 * Deterministic tests for the dormant serializers over an M75 decision: json (canonical,
 * round-trips, reuses canonicalStringify), line (decision.line verbatim), reasons (one per
 * line, empty string when none), default format, determinism, invalid-format rejection,
 * invalid-decision rejection, gateway parity, frozen input untouched.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, runExpectationGate, emitGateOutcome, decideGate,
  serializeGateDecision, canonicalStringify, createEvidenceGateway,
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

const passDecision = () => decideGate(runExpectationGate(setOf('a', 'b'), { a: PLAN_PASS, b: PLAN_PASS }))
const failDecision = (policy) => decideGate(emitGateOutcome(runExpectationGate(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_FAIL })), policy)

// ── json ─────────────────────────────────────────────────────────────────────────────

test('format:"json" → canonical JSON string that round-trips to the decision', () => {
  const d = failDecision()
  const s = serializeGateDecision(d, { format: 'json' })
  assert.equal(typeof s, 'string')
  assert.equal(s, canonicalStringify(d))               // reuses the canonical stringifier
  assert.deepEqual(JSON.parse(s), JSON.parse(canonicalStringify(d)))
  // canonical → keys sorted (exitCode before ok before reasons)
  assert.ok(s.indexOf('"exitCode"') < s.indexOf('"line"'))
  assert.ok(s.indexOf('"line"') < s.indexOf('"ok"'))
})

test('default format is json', () => {
  const d = passDecision()
  assert.equal(serializeGateDecision(d), serializeGateDecision(d, { format: 'json' }))
})

// ── line ─────────────────────────────────────────────────────────────────────────────

test('format:"line" → the decision line verbatim', () => {
  assert.equal(serializeGateDecision(passDecision(), { format: 'line' }), 'policy=pass')
  const d = failDecision()
  assert.equal(serializeGateDecision(d, { format: 'line' }), d.line)
  assert.ok(serializeGateDecision(d, { format: 'line' }).startsWith('policy=fail reasons='))
})

// ── reasons ──────────────────────────────────────────────────────────────────────────

test('format:"reasons" → one reason per line', () => {
  const o = emitGateOutcome(runExpectationGate(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_FAIL }))
  const d = decideGate(o, { maxViolations: o.violations - 1, forbiddenStages: [o.affectedStages[0]] })
  const s = serializeGateDecision(d, { format: 'reasons' })
  assert.deepEqual(s.split('\n'), [...d.reasons])
  assert.equal(s.split('\n').length, d.reasons.length)
})

test('format:"reasons" with no reasons → empty string', () => {
  const d = passDecision()
  assert.deepEqual(d.reasons, [])
  assert.equal(serializeGateDecision(d, { format: 'reasons' }), '')
})

// ── determinism ──────────────────────────────────────────────────────────────────────

test('deterministic — identical decision → identical serialization (all formats)', () => {
  for (const format of ['json', 'line', 'reasons']) {
    assert.equal(serializeGateDecision(failDecision(), { format }), serializeGateDecision(failDecision(), { format }))
  }
})

// ── invalid format / decision ────────────────────────────────────────────────────────

test('unknown format → TypeError', () => {
  const d = passDecision()
  assert.throws(() => serializeGateDecision(d, { format: 'yaml' }), TypeError)
  assert.throws(() => serializeGateDecision(d, { format: '' }), TypeError)
  assert.throws(() => serializeGateDecision(d, { format: 123 }), TypeError)
})

test('invalid decision → TypeError', () => {
  assert.throws(() => serializeGateDecision(null), TypeError)
  assert.throws(() => serializeGateDecision('nope'), TypeError)
})

// ── purity: input untouched ──────────────────────────────────────────────────────────

test('frozen input decision is left untouched', () => {
  const d = failDecision({ maxViolations: 0 })
  assert.ok(Object.isFrozen(d))
  const before = JSON.stringify(d)
  serializeGateDecision(d, { format: 'json' })
  serializeGateDecision(d, { format: 'line' })
  serializeGateDecision(d, { format: 'reasons' })
  assert.equal(JSON.stringify(d), before)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.serializeGateDecision matches serializeGateDecision (all formats)', () => {
  const gw = createEvidenceGateway()
  const d = failDecision({ maxViolations: 0 })
  for (const format of ['json', 'line', 'reasons']) {
    assert.equal(gw.serializeGateDecision(d, { format }), serializeGateDecision(d, { format }))
  }
  assert.equal(gw.serializeGateDecision(d), serializeGateDecision(d))   // default
})
