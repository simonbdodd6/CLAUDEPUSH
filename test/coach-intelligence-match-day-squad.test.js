/**
 * M130 — Match-Day Squad Composer tests
 *
 * Deterministic tests for the pure, dormant composer assembling M123 + M124 + M126 + M128 +
 * M129 outputs into one canonical squad: valid composition, duplicate rejection, metadata,
 * approved/captain/vice/bench/reserves/risk/sign-off propagation, determinism, deep-frozen
 * output, no mutation, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { composeMatchDaySquad } from '../packages/coach-intelligence/index.js'

const player = (playerId, over = {}) => ({ playerId, position: 'P', score: 0.5, requiresCoachReview: false, evidence: {}, ...over })
const filledE = (jersey, position, p) => ({ jersey, position, player: p, status: 'filled' })
const vacantE = (jersey, position) => ({ jersey, position, player: null, status: 'vacant' })

const mkXV = (entries) => Object.freeze({
  startingXV: Object.freeze(entries.map((e) => Object.freeze({ ...e, player: e.player ? Object.freeze(e.player) : null }))),
  benchCandidates: Object.freeze([]), unavailable: Object.freeze([]), metadata: Object.freeze({}),
})
const mkCaptain = (captain, viceCaptain) => Object.freeze({
  captain: captain ? Object.freeze(captain) : null,
  viceCaptain: viceCaptain ? Object.freeze(viceCaptain) : null,
  ranked: Object.freeze([captain, viceCaptain].filter(Boolean)),
  metadata: Object.freeze({ captainSelected: !!captain, viceCaptainSelected: !!viceCaptain, candidateCount: 2, deterministic: true, explainable: true, llm: false }),
})
const mkBench = (bench, reserves = []) => Object.freeze({
  bench: Object.freeze(bench.map((p) => Object.freeze(p))),
  reserves: Object.freeze(reserves.map((p) => Object.freeze(p))),
  metadata: Object.freeze({ benchCount: bench.length, reserveCount: reserves.length, requestedBenchSize: 8, deterministic: true, explainable: true, llm: false }),
})
const mkRisk = (overallRisk = 'NONE', risks = []) => Object.freeze({
  overallRisk, risks: Object.freeze(risks.map((r) => Object.freeze(r))),
  metadata: Object.freeze({ totalRisks: risks.length, highestSeverity: overallRisk, deterministic: true, explainable: true, llm: false }),
})
const mkSignOff = (approved, blockers = [], requiresReview = false) => Object.freeze({
  approved, blockers: Object.freeze(blockers), requiresReview,
  metadata: Object.freeze({ approved, blockerCount: blockers.length, reviewCount: 0, highestSeverity: 'NONE', deterministic: true, explainable: true, llm: false }),
})

const cap = (playerId, jersey, position) => ({ playerId, jersey, position, requiresCoachReview: false, leadershipScore: 0, experienceScore: 0, consistencyScore: 0 })

// a consistent set of inputs
const inputs = (over = {}) => ({
  startingXV: mkXV([filledE('1', 'LH', player('s1')), filledE('2', 'Hooker', player('s2'))]),
  captainRecommendation: mkCaptain(cap('s1', '1', 'LH'), cap('s2', '2', 'Hooker')),
  benchRecommendation: mkBench([player('b1'), player('b2')], [player('r1')]),
  selectionRisk: mkRisk('LOW', []),
  signOff: mkSignOff(true, [], false),
  ...over,
})

// ── valid composition ────────────────────────────────────────────────────────────────

test('valid composition assembles all fields', () => {
  const i = inputs()
  const sq = composeMatchDaySquad(i)
  assert.equal(sq.startingXV, i.startingXV.startingXV)   // M123.startingXV
  assert.equal(sq.captain, i.captainRecommendation.captain)
  assert.equal(sq.viceCaptain, i.captainRecommendation.viceCaptain)
  assert.equal(sq.bench, i.benchRecommendation.bench)
  assert.equal(sq.reserves, i.benchRecommendation.reserves)
  assert.equal(sq.risk, i.selectionRisk)
  assert.equal(sq.signOff, i.signOff)
})

// ── propagation ──────────────────────────────────────────────────────────────────────

test('captain propagation', () => {
  assert.equal(composeMatchDaySquad(inputs()).captain.playerId, 's1')
})
test('vice-captain propagation', () => {
  assert.equal(composeMatchDaySquad(inputs()).viceCaptain.playerId, 's2')
})
test('bench propagation', () => {
  assert.deepEqual(composeMatchDaySquad(inputs()).bench.map((p) => p.playerId), ['b1', 'b2'])
})
test('reserves propagation', () => {
  assert.deepEqual(composeMatchDaySquad(inputs()).reserves.map((p) => p.playerId), ['r1'])
})
test('risk propagation', () => {
  assert.equal(composeMatchDaySquad(inputs()).risk.overallRisk, 'LOW')
})
test('sign-off propagation', () => {
  const sq = composeMatchDaySquad(inputs({ signOff: mkSignOff(false, [], true) }))
  assert.equal(sq.signOff.approved, false)
  assert.equal(sq.signOff.requiresReview, true)
})
test('approved propagation into metadata', () => {
  assert.equal(composeMatchDaySquad(inputs()).metadata.approved, true)
  assert.equal(composeMatchDaySquad(inputs({ signOff: mkSignOff(false, []) })).metadata.approved, false)
})

// ── metadata ─────────────────────────────────────────────────────────────────────────

test('metadata correctness (vacant jerseys are not counted as starting players)', () => {
  const i = inputs({ startingXV: mkXV([filledE('1', 'LH', player('s1')), filledE('2', 'Hooker', player('s2')), vacantE('3', 'TH')]) })
  assert.deepEqual(composeMatchDaySquad(i).metadata, {
    startingPlayers: 2, benchPlayers: 2, reservePlayers: 1, approved: true,
    deterministic: true, explainable: true, llm: false,
  })
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('duplicate player anywhere in the squad → TypeError', () => {
  // bench player shares an id with a starting player
  assert.throws(() => composeMatchDaySquad(inputs({ benchRecommendation: mkBench([player('s1')], []) })), TypeError)
  // bench and reserves share an id
  assert.throws(() => composeMatchDaySquad(inputs({ benchRecommendation: mkBench([player('x')], [player('x')]) })), TypeError)
})

test('invalid inputs → TypeError', () => {
  assert.throws(() => composeMatchDaySquad(null), TypeError)
  assert.throws(() => composeMatchDaySquad(inputs({ startingXV: {} })), TypeError)             // bad M123
  assert.throws(() => composeMatchDaySquad(inputs({ selectionRisk: {} })), TypeError)          // bad M124
  assert.throws(() => composeMatchDaySquad(inputs({ signOff: { approved: 'yes' } })), TypeError)   // bad M126
  assert.throws(() => composeMatchDaySquad(inputs({ captainRecommendation: {} })), TypeError)  // bad M128
  assert.throws(() => composeMatchDaySquad(inputs({ benchRecommendation: {} })), TypeError)    // bad M129
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate inputs', () => {
  const i = inputs()
  const before = JSON.stringify(i)
  composeMatchDaySquad(i)
  assert.equal(JSON.stringify(i), before)
})

test('deterministic — identical input → identical squad', () => {
  const i = inputs()
  assert.deepEqual(composeMatchDaySquad(i), composeMatchDaySquad(i))
})

test('output is deeply frozen', () => {
  const sq = composeMatchDaySquad(inputs())
  assert.ok(Object.isFrozen(sq) && Object.isFrozen(sq.bench) && Object.isFrozen(sq.reserves) && Object.isFrozen(sq.metadata))
  assert.throws(() => sq.bench.push({}))
  assert.throws(() => { sq.metadata.approved = false })
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof composeMatchDaySquad, 'function')
})
