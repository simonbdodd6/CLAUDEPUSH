/**
 * M122 — Positional Depth Chart tests
 *
 * Deterministic tests for the pure, dormant depth-chart builder over an M121 squad
 * evaluation: empty/single/multiple positions, starter selection, depth ordering, ineligible
 * counts, alphabetical position ordering, grouped positions, ungrouped fallback, duplicate
 * group source rejection, invalid squadEvaluation / duplicate playerId / invalid positionGroups
 * rejection, metadata, determinism, deep-frozen output, no mutation, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildDepthChart } from '../packages/coach-intelligence/index.js'

const item = (playerId, position, over = {}) => ({
  playerId, position, score: 0.7, recommendationAction: 'present', requiresCoachReview: false,
  evidence: { alignmentTier: 'good', challenged: false, dominantSignals: [], matchedSignals: [] }, ...over,
})

// build a frozen M121-shaped squad evaluation
const squad = (ranked, ineligible = []) => Object.freeze({
  ranked: Object.freeze(ranked.map((x) => Object.freeze({ ...x, evidence: Object.freeze(x.evidence) }))),
  ineligible: Object.freeze(ineligible.map((x) => Object.freeze({ ...x, evidence: Object.freeze(x.evidence) }))),
  metadata: Object.freeze({}),
})

// ── empty ────────────────────────────────────────────────────────────────────────────

test('empty squad → no positions, zero metadata', () => {
  const c = buildDepthChart(squad([], []))
  assert.deepEqual(c.positions, [])
  assert.deepEqual(c.metadata, {
    positionCount: 0, candidateCount: 0, eligibleCount: 0, ineligibleCount: 0,
    deterministic: true, explainable: true, llm: false,
  })
})

// ── single / starter / depth ─────────────────────────────────────────────────────────

test('single position — starter is first ranked, depth is the rest', () => {
  const c = buildDepthChart(squad([item('a', '7', { score: 0.9 }), item('b', '7', { score: 0.6 })]))
  assert.equal(c.positions.length, 1)
  const p = c.positions[0]
  assert.equal(p.position, '7')
  assert.equal(p.starter.playerId, 'a')
  assert.deepEqual(p.depth.map((x) => x.playerId), ['b'])
  assert.equal(p.eligibleCount, 2)
  assert.equal(p.ineligibleCount, 0)
})

test('depth preserves M121 ranking order within a position', () => {
  // ranked already in M121 order: a, b, c
  const c = buildDepthChart(squad([item('a', '7'), item('b', '7'), item('c', '7')]))
  assert.equal(c.positions[0].starter.playerId, 'a')
  assert.deepEqual(c.positions[0].depth.map((x) => x.playerId), ['b', 'c'])
})

test('position with only unavailable players — starter null, eligibleCount 0', () => {
  const c = buildDepthChart(squad([], [item('x', '7')]))
  assert.equal(c.positions.length, 1)
  assert.equal(c.positions[0].position, '7')
  assert.equal(c.positions[0].starter, null)
  assert.deepEqual(c.positions[0].depth, [])
  assert.equal(c.positions[0].eligibleCount, 0)
  assert.equal(c.positions[0].ineligibleCount, 1)
})

// ── multiple / ordering / ineligible counts ──────────────────────────────────────────

test('multiple positions sorted alphabetically; ineligible counts per position', () => {
  const c = buildDepthChart(squad(
    [item('a', 'Z'), item('b', 'A'), item('c', 'M')],
    [item('d', 'A'), item('e', 'Z')],
  ))
  assert.deepEqual(c.positions.map((p) => p.position), ['A', 'M', 'Z'])
  const A = c.positions.find((p) => p.position === 'A')
  assert.equal(A.eligibleCount, 1)
  assert.equal(A.ineligibleCount, 1)
})

// ── grouping ─────────────────────────────────────────────────────────────────────────

test('grouped positions collapse into group names', () => {
  const c = buildDepthChart(
    squad([item('a', 'LH'), item('b', 'Hooker'), item('c', '7')]),
    { 'Front Row': ['LH', 'Hooker', 'TH'], 'Back Row': ['6', '7', '8'] },
  )
  assert.deepEqual(c.positions.map((p) => p.position), ['Back Row', 'Front Row'])   // alphabetical
  const fr = c.positions.find((p) => p.position === 'Front Row')
  assert.equal(fr.starter.playerId, 'a')
  assert.deepEqual(fr.depth.map((x) => x.playerId), ['b'])
  assert.equal(c.positions.find((p) => p.position === 'Back Row').starter.playerId, 'c')
})

test('ungrouped positions keep their own position as the chart position', () => {
  const c = buildDepthChart(
    squad([item('a', 'LH'), item('z', 'Fullback')]),
    { 'Front Row': ['LH', 'Hooker', 'TH'] },
  )
  assert.deepEqual(c.positions.map((p) => p.position).sort(), ['Front Row', 'Fullback'])
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('duplicate source position across groups → TypeError', () => {
  assert.throws(() => buildDepthChart(squad([item('a', 'LH')]), { G1: ['LH'], G2: ['LH'] }), TypeError)
})

test('invalid squadEvaluation → TypeError', () => {
  assert.throws(() => buildDepthChart(null), TypeError)
  assert.throws(() => buildDepthChart({}), TypeError)                                  // no ranked/ineligible
  assert.throws(() => buildDepthChart({ ranked: [], ineligible: 'x' }), TypeError)
  assert.throws(() => buildDepthChart(squad([{ playerId: 'a' }])), TypeError)          // item missing position
})

test('duplicate playerId across ranked/ineligible → TypeError', () => {
  assert.throws(() => buildDepthChart(squad([item('dup', '7')], [item('dup', '7')])), TypeError)
  assert.throws(() => buildDepthChart(squad([item('dup', '7'), item('dup', '8')])), TypeError)
})

test('invalid positionGroups → TypeError', () => {
  const s = squad([item('a', '7')])
  assert.throws(() => buildDepthChart(s, null), TypeError)
  assert.throws(() => buildDepthChart(s, []), TypeError)
  assert.throws(() => buildDepthChart(s, { 'Back Row': '7' }), TypeError)              // non-array group
  assert.throws(() => buildDepthChart(s, { 'Back Row': [7, 8] }), TypeError)           // non-string members
})

// ── metadata ─────────────────────────────────────────────────────────────────────────

test('metadata correctness', () => {
  const c = buildDepthChart(squad([item('a', '7'), item('b', '6')], [item('c', '7')]))
  assert.deepEqual(c.metadata, {
    positionCount: 2, candidateCount: 3, eligibleCount: 2, ineligibleCount: 1,
    deterministic: true, explainable: true, llm: false,
  })
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate the input squad evaluation', () => {
  const s = squad([item('b', '7'), item('a', '7')], [item('c', '6')])
  const before = JSON.stringify(s)
  buildDepthChart(s, { 'Back Row': ['6', '7'] })
  assert.equal(JSON.stringify(s), before)
})

test('deterministic — identical input → identical chart', () => {
  const s = squad([item('a', 'LH'), item('b', '7')])
  const g = { 'Front Row': ['LH'], 'Back Row': ['7'] }
  assert.deepEqual(buildDepthChart(s, g), buildDepthChart(s, g))
})

test('output is deeply frozen', () => {
  const c = buildDepthChart(squad([item('a', '7'), item('b', '7')], [item('c', '7')]))
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.positions) && Object.isFrozen(c.metadata) &&
    Object.isFrozen(c.positions[0]) && Object.isFrozen(c.positions[0].depth))
  assert.throws(() => c.positions.push({}))
  assert.throws(() => { c.metadata.positionCount = 9 })
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof buildDepthChart, 'function')
})
