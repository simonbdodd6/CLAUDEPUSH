/**
 * M104 — Evidence Gateway manifest assessment summary (summarizeManifestAssessment) tests
 *
 * Deterministic tests over an M103 assessment: default line, explicit line, text, markdown,
 * json, populated (passing) assessment, failed assessment (multiple reasons), exact-string
 * formatting, determinism, invalid-assessment rejection, unknown-format rejection, no
 * mutation, gateway parity. Also verifies it summarizes a real M103 assessment.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, gateManifestIndex, diffManifestIndexes,
  explainManifestDiff, assessManifestExplanation,
  summarizeManifestAssessment, canonicalStringify, createEvidenceGateway,
} from '@brain/evidence-gateway'
import { createNormalizerRegistry } from '@brain/evidence-normalization'
import { SOURCE_TYPE, SIGNAL_POLARITY } from '@brain/evidence-contracts'

// M103 assessment shape: { ok, verdict, reasons } — hand-built for exact formatter assertions.
const passing = Object.freeze({ ok: true, verdict: 'no-change', reasons: Object.freeze(['Explanation satisfies policy.']) })
const failed = Object.freeze({
  ok: false, verdict: 'mixed',
  reasons: Object.freeze(['Verdict "mixed" is forbidden.', 'Statement count 5 exceeds maxStatements 0.']),
})

// ── line (default + explicit) ────────────────────────────────────────────────────────

test('default format is line', () => {
  assert.equal(summarizeManifestAssessment(passing), 'manifest-assessment ok=true verdict=no-change reasons=1')
  assert.equal(summarizeManifestAssessment(passing), summarizeManifestAssessment(passing, { format: 'line' }))
})

test('explicit line — failed assessment', () => {
  assert.equal(summarizeManifestAssessment(failed, { format: 'line' }), 'manifest-assessment ok=false verdict=mixed reasons=2')
})

// ── text ─────────────────────────────────────────────────────────────────────────────

test('text format exact string (single reason)', () => {
  assert.equal(summarizeManifestAssessment(passing, { format: 'text' }),
    ['Manifest Assessment', 'OK: true', 'Verdict: no-change', 'Reasons:', '- Explanation satisfies policy.'].join('\n\n'))
})

test('text format exact string (multiple reasons)', () => {
  assert.equal(summarizeManifestAssessment(failed, { format: 'text' }),
    ['Manifest Assessment', 'OK: false', 'Verdict: mixed', 'Reasons:',
      '- Verdict "mixed" is forbidden.', '- Statement count 5 exceeds maxStatements 0.'].join('\n\n'))
})

// ── markdown ─────────────────────────────────────────────────────────────────────────

test('markdown format exact string (single reason)', () => {
  assert.equal(summarizeManifestAssessment(passing, { format: 'markdown' }),
    ['# Manifest Assessment', '- OK: true', '- Verdict: no-change', '## Reasons', '- Explanation satisfies policy.'].join('\n\n'))
})

test('markdown format exact string (multiple reasons)', () => {
  assert.equal(summarizeManifestAssessment(failed, { format: 'markdown' }),
    ['# Manifest Assessment', '- OK: false', '- Verdict: mixed', '## Reasons',
      '- Verdict "mixed" is forbidden.', '- Statement count 5 exceeds maxStatements 0.'].join('\n\n'))
})

// ── json ─────────────────────────────────────────────────────────────────────────────

test('json format → canonical, round-trips, reuses canonicalStringify', () => {
  const s = summarizeManifestAssessment(failed, { format: 'json' })
  assert.equal(s, canonicalStringify(failed))
  assert.deepEqual(JSON.parse(s), JSON.parse(canonicalStringify(failed)))
})

// ── determinism / mutation ───────────────────────────────────────────────────────────

test('deterministic — identical assessment → identical output (all formats)', () => {
  for (const format of ['line', 'text', 'markdown', 'json']) {
    assert.equal(summarizeManifestAssessment(failed, { format }), summarizeManifestAssessment(failed, { format }))
  }
})

test('does not mutate the assessment', () => {
  const before = JSON.stringify(failed)
  for (const format of ['line', 'text', 'markdown', 'json']) summarizeManifestAssessment(failed, { format })
  assert.equal(JSON.stringify(failed), before)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('unknown format → TypeError', () => {
  assert.throws(() => summarizeManifestAssessment(passing, { format: 'yaml' }), TypeError)
  assert.throws(() => summarizeManifestAssessment(passing, { format: '' }), TypeError)
  assert.throws(() => summarizeManifestAssessment(passing, { format: 9 }), TypeError)
})

test('invalid assessment → TypeError', () => {
  assert.throws(() => summarizeManifestAssessment(null), TypeError)
  assert.throws(() => summarizeManifestAssessment('nope'), TypeError)
  assert.throws(() => summarizeManifestAssessment({}), TypeError)
  assert.throws(() => summarizeManifestAssessment({ verdict: 'x', reasons: [] }), TypeError)        // missing ok
  assert.throws(() => summarizeManifestAssessment({ ok: true, reasons: [] }), TypeError)            // missing verdict
  assert.throws(() => summarizeManifestAssessment({ ok: true, verdict: 'x' }), TypeError)           // missing reasons
})

// ── real M103 assessment ─────────────────────────────────────────────────────────────

test('summarizes a real M103 assessment end-to-end', () => {
  const TENANT = Object.freeze({ clubId: 'c1', teamId: 't1', seasonId: 's1' })
  const NCTX = Object.freeze({ now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' })
  const rec = (id) => Object.freeze({ id, tenant: TENANT, subjectType: 'player', subjectId: 'player-9',
    sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, observedAt: '2026-06-16T09:30:00.000Z', confidence: 0.8 })
  const frame = { sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, version: '1.0',
    normalize: (r) => [{ key: 'lineout.winRate', value: 0.82, unit: null, polarity: SIGNAL_POLARITY.STRENGTH, confidence: 0.5, evidenceId: r.id }] }
  const REG = createNormalizerRegistry([frame])
  const SNAP_A = snapshotPipelinePlan(prepareFullPipelinePlan({ registry: REG, records: [rec('ev_1')], context: NCTX }))
  const PLAN = prepareFullPipelinePlan({ registry: REG, records: [rec('ev_1')], context: NCTX })
  const set = (name) => createExpectationSet([{ name, expectedSnapshot: SNAP_A }])
  const manifestFor = (name) => createGateManifest(gateCI(set(name), { [name]: PLAN }))
  const ix = (...ms) => gateManifestIndex(ms)
  const a = manifestFor('a'), b = manifestFor('b')

  const assessment = assessManifestExplanation(explainManifestDiff(diffManifestIndexes(ix(a), ix(a, b))))
  assert.equal(summarizeManifestAssessment(assessment, { format: 'line' }),
    `manifest-assessment ok=${assessment.ok} verdict=${assessment.verdict} reasons=${assessment.reasons.length}`)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.summarizeManifestAssessment matches summarizeManifestAssessment (all formats + default)', () => {
  const gw = createEvidenceGateway()
  for (const format of ['line', 'text', 'markdown', 'json']) {
    assert.equal(gw.summarizeManifestAssessment(failed, { format }), summarizeManifestAssessment(failed, { format }))
  }
  assert.equal(gw.summarizeManifestAssessment(passing), summarizeManifestAssessment(passing))
})
