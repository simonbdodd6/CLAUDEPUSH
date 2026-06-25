/**
 * coach-intelligence — Selection Explanation Presenter (M185) tests
 *
 * Pure presenter over a hand-built M184 explanation (we do NOT call buildSelectionExplanation):
 * object/text/json formats, default, counts, empty, missing sections, determinism, frozen, malformed,
 * export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { summarizeSelectionExplanation } from '../packages/coach-intelligence/index.js'

const EXPL = () => ({
  summary: { starterCount: 2, benchCount: 1, reserveCount: 1, formation: { 1: 'LH', 9: 'ScrumHalf' }, overallRisk: 'LOW' },
  starters: [
    { playerId: 'p1', jersey: '1', explanationCodes: ['FORMATION_REQUIREMENT', 'POSITION_MATCH', 'LOW_SELECTION_RISK'] },
    { playerId: 'p9', jersey: '9', explanationCodes: ['CAPTAIN_SELECTION', 'FORMATION_REQUIREMENT', 'POSITION_MATCH'] },
  ],
  bench: [{ playerId: 'b1', explanationCodes: ['BENCH_COVER'] }],
  risks: [{ type: 'review-required', severity: 'MEDIUM', jersey: '9', position: 'ScrumHalf', playerId: 'p9', reason: 'review' }],
  alternatives: [{ playerId: 'r1', position: 'Lock' }],
  confidenceNotes: [{ playerId: 'p1', score: 0.7, alignmentTier: 'good' }],
})

// ── object format ──────────────────────────────────────────────────────────────────────

test('object format returns the normalized explanation + counts', () => {
  const out = summarizeSelectionExplanation(EXPL(), 'object')
  assert.deepEqual(out.summary, { starterCount: 2, benchCount: 1, reserveCount: 1, formation: { 1: 'LH', 9: 'ScrumHalf' }, overallRisk: 'LOW' })
  assert.deepEqual(out.starters[0], { jersey: '1', playerId: 'p1', codes: ['FORMATION_REQUIREMENT', 'POSITION_MATCH', 'LOW_SELECTION_RISK'] })
  assert.deepEqual(out.bench[0], { playerId: 'b1', codes: ['BENCH_COVER'] })
  assert.deepEqual(out.risks[0], { code: 'review-required', severity: 'MEDIUM', jersey: '9', position: 'ScrumHalf', playerId: 'p9', reason: 'review' })
  assert.deepEqual(out.alternatives[0], { playerId: 'r1', position: 'Lock' })
  assert.deepEqual(out.confidenceNotes[0], { playerId: 'p1', score: 0.7, alignmentTier: 'good' })
  assert.deepEqual(out.counts, { starters: 2, bench: 1, risks: 1, alternatives: 1, confidenceNotes: 1 })
})

// ── text format ──────────────────────────────────────────────────────────────────────

test('text format renders a deterministic multi-line string', () => {
  const lines = summarizeSelectionExplanation(EXPL(), 'text').split('\n')
  assert.equal(lines[0], 'SelectionExplanation starters=2 bench=1 risks=1 alternatives=1')
  assert.equal(lines[1], 'starter jersey=1 player=p1 codes=FORMATION_REQUIREMENT,POSITION_MATCH,LOW_SELECTION_RISK')
  assert.equal(lines[2], 'starter jersey=9 player=p9 codes=CAPTAIN_SELECTION,FORMATION_REQUIREMENT,POSITION_MATCH')
  assert.equal(lines[3], 'bench player=b1 codes=BENCH_COVER')
  assert.equal(lines[4], 'risk code=review-required severity=MEDIUM')
  assert.equal(lines[5], 'alternative player=r1 position=Lock')
})

// ── json format ──────────────────────────────────────────────────────────────────────

test('json format is deterministic and parses back to the object form', () => {
  const json = summarizeSelectionExplanation(EXPL(), 'json')
  assert.equal(typeof json, 'string')
  assert.deepEqual(JSON.parse(json), summarizeSelectionExplanation(EXPL(), 'object'))
})

// ── default / counts ───────────────────────────────────────────────────────────────────

test('default format (omitted) is the object form', () => {
  assert.deepEqual(summarizeSelectionExplanation(EXPL()), summarizeSelectionExplanation(EXPL(), 'object'))
})

test('counts reflect each section length', () => {
  const out = summarizeSelectionExplanation(EXPL(), 'object')
  assert.equal(out.counts.starters, out.starters.length)
  assert.equal(out.counts.bench, out.bench.length)
  assert.equal(out.counts.risks, out.risks.length)
  assert.equal(out.counts.alternatives, out.alternatives.length)
  assert.equal(out.counts.confidenceNotes, out.confidenceNotes.length)
})

// ── empty / missing sections default safely ────────────────────────────────────────────

test('empty explanation → empty sections, zero counts', () => {
  const out = summarizeSelectionExplanation({}, 'object')
  assert.deepEqual(out.starters, [])
  assert.deepEqual(out.bench, [])
  assert.deepEqual(out.risks, [])
  assert.deepEqual(out.alternatives, [])
  assert.deepEqual(out.confidenceNotes, [])
  assert.deepEqual(out.counts, { starters: 0, bench: 0, risks: 0, alternatives: 0, confidenceNotes: 0 })
  assert.deepEqual(out.summary, {})   // missing summary defaults safely to {}
})

test('present-but-partial summary normalizes missing fields to null', () => {
  const out = summarizeSelectionExplanation({ summary: {} }, 'object')
  assert.deepEqual(out.summary, { starterCount: null, benchCount: null, reserveCount: null, formation: {}, overallRisk: null })
})

test('missing sections default safely', () => {
  const out = summarizeSelectionExplanation({ summary: { starterCount: 1 }, starters: [{ playerId: 'p1', jersey: '1', explanationCodes: ['FORMATION_REQUIREMENT'] }] }, 'object')
  assert.equal(out.counts.starters, 1)
  assert.deepEqual(out.bench, [])
  assert.deepEqual(out.risks, [])
  // text never throws on missing sections
  assert.equal(summarizeSelectionExplanation({ starters: [] }, 'text'), 'SelectionExplanation starters=0 bench=0 risks=0 alternatives=0')
})

// ── determinism / frozen ───────────────────────────────────────────────────────────────

test('deterministic — repeated calls are identical', () => {
  assert.deepEqual(summarizeSelectionExplanation(EXPL(), 'object'), summarizeSelectionExplanation(EXPL(), 'object'))
  assert.equal(summarizeSelectionExplanation(EXPL(), 'text'), summarizeSelectionExplanation(EXPL(), 'text'))
  assert.equal(summarizeSelectionExplanation(EXPL(), 'json'), summarizeSelectionExplanation(EXPL(), 'json'))
})

test('object output is deeply frozen', () => {
  const out = summarizeSelectionExplanation(EXPL(), 'object')
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.starters) && Object.isFrozen(out.starters[0]) &&
    Object.isFrozen(out.counts) && Object.isFrozen(out.summary))
  assert.throws(() => { out.counts.starters = 0 })
})

// ── validation / export ────────────────────────────────────────────────────────────────

test('malformed input is rejected clearly', () => {
  assert.throws(() => summarizeSelectionExplanation(null), TypeError)
  assert.throws(() => summarizeSelectionExplanation([]), TypeError)
  assert.throws(() => summarizeSelectionExplanation('x'), TypeError)
  assert.throws(() => summarizeSelectionExplanation(42), TypeError)
  assert.throws(() => summarizeSelectionExplanation(EXPL(), 'yaml'), TypeError)
})

test('export exists', () => {
  assert.equal(typeof summarizeSelectionExplanation, 'function')
})
