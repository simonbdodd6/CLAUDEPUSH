/**
 * M125 — Selection Risk Summary tests
 *
 * Deterministic tests for the pure, dormant presenter over an M124 risk report: line (default),
 * text, markdown, json (canonical), unsupported format rejection, invalid report rejection,
 * determinism, frozen input untouched, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { summarizeSelectionRisk } from '../packages/coach-intelligence/index.js'

const risk = (severity, reason) => ({ type: 'x', severity, jersey: null, position: 'P', playerId: null, reason })

const report = (risks, overallRisk = 'NONE') => Object.freeze({
  overallRisk,
  risks: Object.freeze(risks.map((r) => Object.freeze(r))),
  metadata: Object.freeze({ totalRisks: risks.length, highestSeverity: overallRisk, deterministic: true, explainable: true, llm: false }),
})

const SAMPLE = report([
  risk('CRITICAL', 'Jersey 3 is vacant'),
  risk('HIGH', 'Lock has only one eligible player'),
  risk('MEDIUM', 'Player requires coach review'),
], 'HIGH')

// ── line (default) ───────────────────────────────────────────────────────────────────

test('line is the default format', () => {
  assert.equal(summarizeSelectionRisk(SAMPLE), 'selection-risk overall=HIGH total=3 critical=1 high=1 medium=1 low=0')
  assert.equal(summarizeSelectionRisk(SAMPLE), summarizeSelectionRisk(SAMPLE, { format: 'line' }))
})

test('line counts each severity, including zeros', () => {
  assert.equal(summarizeSelectionRisk(report([])), 'selection-risk overall=NONE total=0 critical=0 high=0 medium=0 low=0')
  assert.equal(
    summarizeSelectionRisk(report([risk('LOW', 'x'), risk('LOW', 'y')], 'LOW')),
    'selection-risk overall=LOW total=2 critical=0 high=0 medium=0 low=2',
  )
})

// ── text ─────────────────────────────────────────────────────────────────────────────

test('text groups non-empty severities under headings', () => {
  assert.equal(summarizeSelectionRisk(SAMPLE, { format: 'text' }), [
    'Selection Risk',
    '',
    'Overall Risk: HIGH',
    '',
    'Total Risks: 3',
    '',
    'CRITICAL',
    '- Jersey 3 is vacant',
    '',
    'HIGH',
    '- Lock has only one eligible player',
    '',
    'MEDIUM',
    '- Player requires coach review',
  ].join('\n'))
})

test('text with no risks shows only the header block', () => {
  assert.equal(summarizeSelectionRisk(report([]), { format: 'text' }), 'Selection Risk\n\nOverall Risk: NONE\n\nTotal Risks: 0')
})

// ── markdown ─────────────────────────────────────────────────────────────────────────

test('markdown shows all four severity sections, including empty Low', () => {
  assert.equal(summarizeSelectionRisk(SAMPLE, { format: 'markdown' }), [
    '# Selection Risk',
    '',
    '**Overall:** HIGH',
    '',
    '## Critical',
    '- Jersey 3 is vacant',
    '',
    '## High',
    '- Lock has only one eligible player',
    '',
    '## Medium',
    '- Player requires coach review',
    '',
    '## Low',
  ].join('\n'))
})

// ── json (canonical) ─────────────────────────────────────────────────────────────────

test('json is canonical and round-trips to the report', () => {
  const json = summarizeSelectionRisk(SAMPLE, { format: 'json' })
  assert.deepEqual(JSON.parse(json), JSON.parse(JSON.stringify(SAMPLE)))
  assert.equal(json, summarizeSelectionRisk(SAMPLE, { format: 'json' }))   // deterministic
  // canonical → object keys are sorted
  assert.ok(json.indexOf('"metadata"') < json.indexOf('"overallRisk"') && json.indexOf('"overallRisk"') < json.indexOf('"risks"'))
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid report → TypeError', () => {
  assert.throws(() => summarizeSelectionRisk(null), TypeError)
  assert.throws(() => summarizeSelectionRisk({}), TypeError)
  assert.throws(() => summarizeSelectionRisk({ overallRisk: 'NONE', risks: [{ severity: 'NOPE', reason: 'x' }], metadata: {} }), TypeError)
})

test('unsupported format → TypeError', () => {
  assert.throws(() => summarizeSelectionRisk(SAMPLE, { format: 'html' }), TypeError)
  assert.throws(() => summarizeSelectionRisk(SAMPLE, { format: 'csv' }), TypeError)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate the frozen input report', () => {
  const before = JSON.stringify(SAMPLE)
  summarizeSelectionRisk(SAMPLE, { format: 'markdown' })
  summarizeSelectionRisk(SAMPLE, { format: 'json' })
  assert.equal(JSON.stringify(SAMPLE), before)
})

test('deterministic across formats', () => {
  for (const format of ['line', 'text', 'markdown', 'json']) {
    assert.equal(summarizeSelectionRisk(SAMPLE, { format }), summarizeSelectionRisk(SAMPLE, { format }))
  }
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof summarizeSelectionRisk, 'function')
})
