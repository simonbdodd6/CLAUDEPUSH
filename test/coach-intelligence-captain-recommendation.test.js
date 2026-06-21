/**
 * M128 — Captain Recommendation Engine tests
 *
 * Deterministic tests for the pure, dormant captain recommender over an M123 Starting XV:
 * captain/vice selection, review penalty, missing scores, score cascade, tie-break, vacant
 * exclusion, duplicate rejection, metadata, determinism, deep-frozen output, no mutation, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { recommendCaptain } from '../packages/coach-intelligence/index.js'

const player = (playerId, over = {}) => ({
  playerId, position: 'P', score: 0.7, recommendationAction: 'present', requiresCoachReview: false, evidence: {}, ...over,
})
const filledE = (jersey, position, p) => ({ jersey, position, player: p, status: 'filled' })
const vacantE = (jersey, position) => ({ jersey, position, player: null, status: 'vacant' })

const mkXV = (entries) => Object.freeze({
  startingXV: Object.freeze(entries.map((e) => Object.freeze({ ...e, player: e.player ? Object.freeze(e.player) : null }))),
  benchCandidates: Object.freeze([]),
  unavailable: Object.freeze([]),
  metadata: Object.freeze({}),
})

// ── captain / vice ───────────────────────────────────────────────────────────────────

test('captain is the highest-ranked eligible player by leadership', () => {
  const r = recommendCaptain(mkXV([
    filledE('1', 'LH', player('a', { leadershipScore: 0.5 })),
    filledE('2', 'Hooker', player('b', { leadershipScore: 0.9 })),
  ]))
  assert.equal(r.captain.playerId, 'b')
  assert.equal(r.viceCaptain.playerId, 'a')
  assert.equal(r.ranked.length, 2)
})

test('vice-captain is the next highest eligible player', () => {
  const r = recommendCaptain(mkXV([
    filledE('1', 'LH', player('a', { leadershipScore: 0.9 })),
    filledE('2', 'Hooker', player('b', { leadershipScore: 0.8 })),
    filledE('3', 'TH', player('c', { leadershipScore: 0.7 })),
  ]))
  assert.equal(r.captain.playerId, 'a')
  assert.equal(r.viceCaptain.playerId, 'b')
  assert.deepEqual(r.ranked.map((x) => x.playerId), ['a', 'b', 'c'])
})

// ── review penalty ───────────────────────────────────────────────────────────────────

test('requiresCoachReview is a penalty — flagged player ranks below non-flagged', () => {
  const r = recommendCaptain(mkXV([
    filledE('1', 'LH', player('a', { leadershipScore: 0.9, requiresCoachReview: true })),   // flagged, high
    filledE('2', 'Hooker', player('b', { leadershipScore: 0.1 })),                            // non-flagged, low
  ]))
  assert.equal(r.captain.playerId, 'b')
  assert.equal(r.viceCaptain.playerId, 'a')
})

// ── missing scores / cascade / tie-break ─────────────────────────────────────────────

test('missing scores are treated as zero', () => {
  const r = recommendCaptain(mkXV([filledE('1', 'LH', player('zoe')), filledE('2', 'Hooker', player('amy'))]))
  // all scores 0 → tie-break on playerId ascending
  assert.deepEqual(r.ranked.map((x) => x.playerId), ['amy', 'zoe'])
  assert.equal(r.ranked[0].leadershipScore, 0)
  assert.equal(r.ranked[0].experienceScore, 0)
  assert.equal(r.ranked[0].consistencyScore, 0)
})

test('score cascade — experience breaks a leadership tie, consistency breaks that tie', () => {
  const r = recommendCaptain(mkXV([
    filledE('1', 'LH', player('a', { leadershipScore: 0.5, experienceScore: 0.2 })),
    filledE('2', 'Hooker', player('b', { leadershipScore: 0.5, experienceScore: 0.9 })),
    filledE('3', 'TH', player('c', { leadershipScore: 0.5, experienceScore: 0.9, consistencyScore: 0.99 })),
  ]))
  assert.deepEqual(r.ranked.map((x) => x.playerId), ['c', 'b', 'a'])
})

test('tie-break — equal scores rank by playerId ascending', () => {
  const r = recommendCaptain(mkXV([
    filledE('1', 'LH', player('bob', { leadershipScore: 0.5 })),
    filledE('2', 'Hooker', player('amy', { leadershipScore: 0.5 })),
  ]))
  assert.equal(r.captain.playerId, 'amy')
})

// ── selection scope ──────────────────────────────────────────────────────────────────

test('vacant jerseys are excluded from candidates', () => {
  const r = recommendCaptain(mkXV([
    vacantE('1', 'LH'),
    filledE('2', 'Hooker', player('only', { leadershipScore: 0.4 })),
  ]))
  assert.equal(r.metadata.candidateCount, 1)
  assert.equal(r.captain.playerId, 'only')
  assert.equal(r.viceCaptain, null)
})

test('empty / all-vacant XV → no captain', () => {
  const r = recommendCaptain(mkXV([vacantE('1', 'LH')]))
  assert.equal(r.captain, null)
  assert.equal(r.viceCaptain, null)
  assert.deepEqual(r.ranked, [])
  assert.equal(r.metadata.captainSelected, false)
  assert.equal(r.metadata.viceCaptainSelected, false)
})

// ── metadata ─────────────────────────────────────────────────────────────────────────

test('metadata correctness', () => {
  const r = recommendCaptain(mkXV([filledE('1', 'LH', player('a')), filledE('2', 'Hooker', player('b'))]))
  assert.deepEqual(r.metadata, {
    captainSelected: true, viceCaptainSelected: true, candidateCount: 2,
    deterministic: true, explainable: true, llm: false,
  })
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid Starting XV → TypeError', () => {
  assert.throws(() => recommendCaptain(null), TypeError)
  assert.throws(() => recommendCaptain({}), TypeError)
  assert.throws(() => recommendCaptain(mkXV([{ jersey: '1', position: 'LH', status: 'filled', player: {} }])), TypeError)   // malformed player
})

test('duplicate players → TypeError', () => {
  assert.throws(() => recommendCaptain(mkXV([filledE('1', 'LH', player('dup')), filledE('2', 'Hooker', player('dup'))])), TypeError)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate the input', () => {
  const x = mkXV([filledE('1', 'LH', player('a', { leadershipScore: 0.9 })), filledE('2', 'Hooker', player('b'))])
  const before = JSON.stringify(x)
  recommendCaptain(x)
  assert.equal(JSON.stringify(x), before)
})

test('deterministic — identical input → identical recommendation', () => {
  const x = mkXV([filledE('1', 'LH', player('a', { leadershipScore: 0.5 })), filledE('2', 'Hooker', player('b', { leadershipScore: 0.5 }))])
  assert.deepEqual(recommendCaptain(x), recommendCaptain(x))
})

test('output is deeply frozen', () => {
  const r = recommendCaptain(mkXV([filledE('1', 'LH', player('a')), filledE('2', 'Hooker', player('b'))]))
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.ranked) && Object.isFrozen(r.metadata) && Object.isFrozen(r.captain) && Object.isFrozen(r.ranked[0]))
  assert.throws(() => r.ranked.push({}))
  assert.throws(() => { r.metadata.candidateCount = 9 })
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof recommendCaptain, 'function')
})
