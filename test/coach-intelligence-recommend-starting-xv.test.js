/**
 * M123 — Starting XV Recommendation Engine tests
 *
 * Deterministic tests for the pure, dormant XV recommender over an M122 depth chart: complete
 * XV, vacancies, duplicate prevention (no player twice), bench generation, unavailable
 * carry-through, metadata, determinism, deep-frozen output, no mutation, export, invalid input.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { recommendStartingXV, DEFAULT_FORMATION } from '../packages/coach-intelligence/index.js'

const player = (playerId, position) => ({
  playerId, position, score: 0.7, recommendationAction: 'present', requiresCoachReview: false, evidence: {},
})

// build an M122-shaped depth chart position
const pos = (position, eligible, ineligibleCount = 0) => ({
  position,
  starter: eligible.length ? eligible[0] : null,
  depth: eligible.slice(1),
  eligibleCount: eligible.length,
  ineligibleCount,
})

const depthChart = (positions) => Object.freeze({
  positions: Object.freeze(positions.map((p) => Object.freeze({ ...p, depth: Object.freeze(p.depth) }))),
  metadata: Object.freeze({}),
})

// a depth chart covering the default formation (Lock has 2 players for jerseys 4 & 5)
const fullChart = () => depthChart([
  pos('LH', [player('lh', 'LH')]),
  pos('Hooker', [player('hk', 'Hooker')]),
  pos('TH', [player('th', 'TH')]),
  pos('Lock', [player('l1', 'Lock'), player('l2', 'Lock')]),
  pos('Blindside', [player('bs', 'Blindside')]),
  pos('Openside', [player('os', 'Openside')]),
  pos('Number8', [player('n8', 'Number8')]),
  pos('ScrumHalf', [player('sh', 'ScrumHalf')]),
  pos('FlyHalf', [player('fh', 'FlyHalf')]),
  pos('LeftWing', [player('lw', 'LeftWing')]),
  pos('InsideCentre', [player('ic', 'InsideCentre')]),
  pos('OutsideCentre', [player('oc', 'OutsideCentre')]),
  pos('RightWing', [player('rw', 'RightWing')]),
  pos('Fullback', [player('fb', 'Fullback')]),
])

// ── complete XV ──────────────────────────────────────────────────────────────────────

test('complete XV — all 15 jerseys filled with the default formation', () => {
  const r = recommendStartingXV(fullChart())
  assert.equal(r.startingXV.length, 15)
  assert.ok(r.startingXV.every((s) => s.status === 'filled' && s.player !== null))
  assert.deepEqual(r.startingXV.map((s) => s.jersey), Object.keys(DEFAULT_FORMATION))   // jersey order 1..15
  // the two Lock jerseys take distinct players in ranking order
  assert.equal(r.startingXV.find((s) => s.jersey === '4').player.playerId, 'l1')
  assert.equal(r.startingXV.find((s) => s.jersey === '5').player.playerId, 'l2')
  assert.equal(r.metadata.filled, 15)
  assert.equal(r.metadata.vacant, 0)
})

// ── vacancies ────────────────────────────────────────────────────────────────────────

test('vacancy — jersey with no eligible player is vacant', () => {
  const r = recommendStartingXV(depthChart([pos('Openside', [player('os', 'Openside')])]), { 1: 'LH', 7: 'Openside' })
  const lh = r.startingXV.find((s) => s.jersey === '1')
  assert.equal(lh.player, null)
  assert.equal(lh.status, 'vacant')
  assert.equal(r.startingXV.find((s) => s.jersey === '7').status, 'filled')
  assert.equal(r.metadata.vacant, 1)
  assert.equal(r.metadata.filled, 1)
})

// ── duplicate prevention ─────────────────────────────────────────────────────────────

test('duplicate prevention — a player is never assigned to two jerseys', () => {
  // one Lock, two Lock jerseys → first filled, second vacant
  const r = recommendStartingXV(depthChart([pos('Lock', [player('l1', 'Lock')])]), { 4: 'Lock', 5: 'Lock' })
  assert.equal(r.startingXV.find((s) => s.jersey === '4').player.playerId, 'l1')
  assert.equal(r.startingXV.find((s) => s.jersey === '5').player, null)
  assert.equal(r.startingXV.find((s) => s.jersey === '5').status, 'vacant')
})

// ── bench ────────────────────────────────────────────────────────────────────────────

test('bench generation — remaining eligible players become bench candidates', () => {
  const r = recommendStartingXV(depthChart([pos('Openside', [player('os1', 'Openside'), player('os2', 'Openside')])]), { 7: 'Openside' })
  assert.equal(r.startingXV.find((s) => s.jersey === '7').player.playerId, 'os1')
  assert.deepEqual(r.benchCandidates.map((p) => p.playerId), ['os2'])
  assert.equal(r.metadata.benchCount, 1)
})

// ── unavailable carry-through ────────────────────────────────────────────────────────

test('unavailable carried through from M122 per-position counts', () => {
  const r = recommendStartingXV(depthChart([
    pos('Lock', [player('l1', 'Lock')], 2),
    pos('Openside', [player('os', 'Openside')], 1),
  ]), { 4: 'Lock', 7: 'Openside' })
  assert.deepEqual(r.unavailable, [{ position: 'Lock', ineligibleCount: 2 }, { position: 'Openside', ineligibleCount: 1 }])
  assert.equal(r.metadata.unavailableCount, 3)
})

// ── metadata ─────────────────────────────────────────────────────────────────────────

test('metadata correctness', () => {
  const r = recommendStartingXV(depthChart([pos('Openside', [player('os1', 'Openside'), player('os2', 'Openside')], 1)]), { 7: 'Openside', 8: 'Number8' })
  assert.deepEqual(r.metadata, {
    filled: 1, vacant: 1, benchCount: 1, unavailableCount: 1,
    deterministic: true, explainable: true, llm: false,
  })
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid depth chart → TypeError', () => {
  assert.throws(() => recommendStartingXV(null), TypeError)
  assert.throws(() => recommendStartingXV({}), TypeError)
  assert.throws(() => recommendStartingXV({ positions: [{ position: 'LH' }] }), TypeError)   // malformed position
})

test('duplicate players → TypeError', () => {
  assert.throws(() => recommendStartingXV(depthChart([
    pos('Lock', [player('dup', 'Lock')]),
    pos('Openside', [player('dup', 'Openside')]),
  ])), TypeError)
})

test('duplicate positions → TypeError', () => {
  assert.throws(() => recommendStartingXV(depthChart([pos('Lock', [player('a', 'Lock')]), pos('Lock', [player('b', 'Lock')])])), TypeError)
})

test('invalid formation / malformed jerseys → TypeError', () => {
  const dc = fullChart()
  assert.throws(() => recommendStartingXV(dc, null), TypeError)
  assert.throws(() => recommendStartingXV(dc, []), TypeError)
  assert.throws(() => recommendStartingXV(dc, { 1: '' }), TypeError)        // empty position
  assert.throws(() => recommendStartingXV(dc, { 1: 5 }), TypeError)         // non-string position
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate inputs', () => {
  const dc = fullChart()
  const formation = { 7: 'Openside' }
  const before = [JSON.stringify(dc), JSON.stringify(formation)]
  recommendStartingXV(dc, formation)
  assert.deepEqual([JSON.stringify(dc), JSON.stringify(formation)], before)
})

test('deterministic — identical input → identical XV', () => {
  const dc = fullChart()
  assert.deepEqual(recommendStartingXV(dc), recommendStartingXV(dc))
})

test('output is deeply frozen', () => {
  const r = recommendStartingXV(depthChart([pos('Openside', [player('os1', 'Openside'), player('os2', 'Openside')], 1)]), { 7: 'Openside' })
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.startingXV) && Object.isFrozen(r.benchCandidates) &&
    Object.isFrozen(r.unavailable) && Object.isFrozen(r.metadata) && Object.isFrozen(r.startingXV[0]))
  assert.throws(() => r.startingXV.push({}))
  assert.throws(() => { r.metadata.filled = 9 })
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('exports', () => {
  assert.equal(typeof recommendStartingXV, 'function')
  assert.equal(DEFAULT_FORMATION['1'], 'LH')
  assert.equal(DEFAULT_FORMATION['15'], 'Fullback')
})
