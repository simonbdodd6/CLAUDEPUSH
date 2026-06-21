/**
 * M129 — Bench Recommendation Engine tests
 *
 * Deterministic tests for the pure, dormant bench recommender over an M123 Starting XV + M121
 * squad evaluation: full 8-player bench, fewer than 8 available, no duplicate XV players,
 * reserve generation, custom bench size, invalid bench size, duplicate rejection, metadata,
 * determinism, deep-frozen output, no mutation, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { recommendBench } from '../packages/coach-intelligence/index.js'

const rp = (playerId, over = {}) => ({ playerId, position: 'P', score: 0.5, recommendationAction: 'present', requiresCoachReview: false, evidence: {}, ...over })
const mkSquad = (ranked, ineligible = []) => Object.freeze({
  ranked: Object.freeze(ranked.map((p) => Object.freeze(p))),
  ineligible: Object.freeze(ineligible.map((p) => Object.freeze(p))),
  metadata: Object.freeze({}),
})

const filledE = (jersey, position, p) => ({ jersey, position, player: p, status: 'filled' })
const mkXV = (entries) => Object.freeze({
  startingXV: Object.freeze(entries.map((e) => Object.freeze({ ...e, player: e.player ? Object.freeze(e.player) : null }))),
  benchCandidates: Object.freeze([]),
  unavailable: Object.freeze([]),
  metadata: Object.freeze({}),
})
const emptyXV = () => mkXV([])

// 12 ranked players p01..p12 (already in M121 order)
const ranked12 = () => Array.from({ length: 12 }, (_, i) => rp(`p${String(i + 1).padStart(2, '0')}`))

// ── full bench ───────────────────────────────────────────────────────────────────────

test('full 8-player bench, remaining become reserves', () => {
  const r = recommendBench(emptyXV(), mkSquad(ranked12()))
  assert.equal(r.bench.length, 8)
  assert.deepEqual(r.bench.map((p) => p.playerId), ['p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07', 'p08'])
  assert.deepEqual(r.reserves.map((p) => p.playerId), ['p09', 'p10', 'p11', 'p12'])
})

// ── fewer than 8 ─────────────────────────────────────────────────────────────────────

test('fewer than 8 available → bench holds all remaining, no reserves', () => {
  const r = recommendBench(emptyXV(), mkSquad([rp('a'), rp('b'), rp('c')]))
  assert.deepEqual(r.bench.map((p) => p.playerId), ['a', 'b', 'c'])
  assert.deepEqual(r.reserves, [])
})

// ── no duplicate XV players ──────────────────────────────────────────────────────────

test('players already in the Starting XV are excluded from bench and reserves', () => {
  const xv = mkXV([filledE('1', 'LH', rp('p01')), filledE('2', 'Hooker', rp('p02'))])
  const r = recommendBench(xv, mkSquad(ranked12()))
  const benchIds = r.bench.map((p) => p.playerId)
  assert.ok(!benchIds.includes('p01') && !benchIds.includes('p02'))
  assert.deepEqual(benchIds, ['p03', 'p04', 'p05', 'p06', 'p07', 'p08', 'p09', 'p10'])
  assert.deepEqual(r.reserves.map((p) => p.playerId), ['p11', 'p12'])
})

// ── reserves ─────────────────────────────────────────────────────────────────────────

test('reserve generation — ranked remainder beyond the bench', () => {
  const r = recommendBench(emptyXV(), mkSquad(ranked12()), { benchSize: 5 })
  assert.equal(r.bench.length, 5)
  assert.equal(r.reserves.length, 7)
  assert.equal(r.metadata.reserveCount, 7)
})

// ── custom bench size ────────────────────────────────────────────────────────────────

test('custom bench size is honoured and recorded', () => {
  const r = recommendBench(emptyXV(), mkSquad(ranked12()), { benchSize: 3 })
  assert.equal(r.bench.length, 3)
  assert.deepEqual(r.bench.map((p) => p.playerId), ['p01', 'p02', 'p03'])
  assert.equal(r.metadata.requestedBenchSize, 3)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid bench size → TypeError', () => {
  const sq = mkSquad(ranked12())
  assert.throws(() => recommendBench(emptyXV(), sq, { benchSize: 0 }), TypeError)
  assert.throws(() => recommendBench(emptyXV(), sq, { benchSize: 16 }), TypeError)
  assert.throws(() => recommendBench(emptyXV(), sq, { benchSize: 2.5 }), TypeError)
})

test('malformed options → TypeError', () => {
  assert.throws(() => recommendBench(emptyXV(), mkSquad(ranked12()), null), TypeError)
  assert.throws(() => recommendBench(emptyXV(), mkSquad(ranked12()), []), TypeError)
})

test('invalid Starting XV / Squad Evaluation → TypeError', () => {
  assert.throws(() => recommendBench(null, mkSquad(ranked12())), TypeError)
  assert.throws(() => recommendBench(emptyXV(), {}), TypeError)
})

test('duplicate players → TypeError', () => {
  assert.throws(() => recommendBench(emptyXV(), mkSquad([rp('dup'), rp('dup')])), TypeError)
  assert.throws(() => recommendBench(emptyXV(), mkSquad([rp('x')], [rp('x')])), TypeError)   // across ranked + ineligible
})

// ── metadata ─────────────────────────────────────────────────────────────────────────

test('metadata correctness', () => {
  const r = recommendBench(emptyXV(), mkSquad(ranked12()))
  assert.deepEqual(r.metadata, {
    benchCount: 8, reserveCount: 4, requestedBenchSize: 8,
    deterministic: true, explainable: true, llm: false,
  })
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate inputs', () => {
  const xv = mkXV([filledE('1', 'LH', rp('p01'))])
  const sq = mkSquad(ranked12())
  const before = [JSON.stringify(xv), JSON.stringify(sq)]
  recommendBench(xv, sq)
  assert.deepEqual([JSON.stringify(xv), JSON.stringify(sq)], before)
})

test('deterministic — identical input → identical bench', () => {
  const xv = emptyXV()
  const sq = mkSquad(ranked12())
  assert.deepEqual(recommendBench(xv, sq), recommendBench(xv, sq))
})

test('output is deeply frozen', () => {
  const r = recommendBench(emptyXV(), mkSquad(ranked12()))
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.bench) && Object.isFrozen(r.reserves) && Object.isFrozen(r.metadata) && Object.isFrozen(r.bench[0]))
  assert.throws(() => r.bench.push({}))
  assert.throws(() => { r.metadata.benchCount = 99 })
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof recommendBench, 'function')
})
