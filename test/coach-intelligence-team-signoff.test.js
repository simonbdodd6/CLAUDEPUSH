/**
 * M126 — Team Sign-off Gate tests
 *
 * Deterministic tests for the pure, dormant approval gate over an M123 Starting XV + M124
 * selection-risk report: approved team, blocked team, review required, vacant jersey blocks,
 * critical risk blocks, high/medium risk review, metadata, determinism, deep-frozen output,
 * no mutation, invalid input rejection, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { evaluateTeamSignOff } from '../packages/coach-intelligence/index.js'

const player = (playerId, position, over = {}) => ({
  playerId, position, score: 0.7, recommendationAction: 'present', requiresCoachReview: false, evidence: {}, ...over,
})
const filled = (jersey, position, p) => ({ jersey, position, player: p, status: 'filled' })
const vacant = (jersey, position) => ({ jersey, position, player: null, status: 'vacant' })

const xv = (entries, bench = []) => Object.freeze({
  startingXV: Object.freeze(entries.map((e) => Object.freeze({ ...e, player: e.player ? Object.freeze(e.player) : null }))),
  benchCandidates: Object.freeze(bench),
  unavailable: Object.freeze([]),
  metadata: Object.freeze({}),
})

const risk = (severity, over = {}) => ({ type: 't', severity, jersey: null, position: 'P', playerId: null, reason: 'r', ...over })
const riskReport = (risks, overallRisk = 'NONE') => Object.freeze({
  overallRisk,
  risks: Object.freeze(risks.map((r) => Object.freeze(r))),
  metadata: Object.freeze({ totalRisks: risks.length, highestSeverity: overallRisk, deterministic: true, explainable: true, llm: false }),
})

// ── approved ─────────────────────────────────────────────────────────────────────────

test('approved team — no critical risks, no vacancies, no review triggers', () => {
  const r = evaluateTeamSignOff(xv([filled('1', 'A', player('a', 'A'))]), riskReport([risk('LOW')], 'LOW'))
  assert.equal(r.approved, true)
  assert.deepEqual(r.blockers, [])
  assert.equal(r.requiresReview, false)
})

// ── blocked ──────────────────────────────────────────────────────────────────────────

test('critical risk blocks sign-off', () => {
  const c = risk('CRITICAL', { reason: 'no eligible player' })
  const r = evaluateTeamSignOff(xv([filled('1', 'A', player('a', 'A'))]), riskReport([c], 'CRITICAL'))
  assert.equal(r.approved, false)
  assert.deepEqual(r.blockers, [c])
})

test('vacant jersey blocks sign-off (even with no critical risk in the report)', () => {
  const r = evaluateTeamSignOff(xv([vacant('1', 'LH')]), riskReport([], 'NONE'))
  assert.equal(r.approved, false)
  assert.deepEqual(r.blockers, [])   // no synthesized risk — vacancy gates independently
})

// ── review required ──────────────────────────────────────────────────────────────────

test('high risk → requires review, still approvable', () => {
  const r = evaluateTeamSignOff(xv([filled('7', 'Openside', player('os', 'Openside'))]), riskReport([risk('HIGH')], 'HIGH'))
  assert.equal(r.approved, true)
  assert.equal(r.requiresReview, true)
})

test('medium risk → requires review', () => {
  const r = evaluateTeamSignOff(xv([filled('1', 'A', player('a', 'A'))]), riskReport([risk('MEDIUM')], 'MEDIUM'))
  assert.equal(r.requiresReview, true)
})

test('player flagged requiresCoachReview → requires review even with an empty risk report', () => {
  const r = evaluateTeamSignOff(xv([filled('1', 'A', player('a', 'A', { requiresCoachReview: true }))]), riskReport([], 'NONE'))
  assert.equal(r.requiresReview, true)
  assert.equal(r.approved, true)   // review needed but not blocked
})

// ── metadata ─────────────────────────────────────────────────────────────────────────

test('metadata correctness', () => {
  const r = evaluateTeamSignOff(
    xv([vacant('1', 'LH'), filled('7', 'Openside', player('os', 'Openside'))]),
    riskReport([risk('CRITICAL'), risk('HIGH'), risk('MEDIUM'), risk('LOW')], 'CRITICAL'),
  )
  assert.deepEqual(r.metadata, {
    approved: false,
    blockerCount: 1,
    reviewCount: 2,            // HIGH + MEDIUM
    highestSeverity: 'CRITICAL',
    deterministic: true,
    explainable: true,
    llm: false,
  })
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid Starting XV → TypeError', () => {
  assert.throws(() => evaluateTeamSignOff(null, riskReport([])), TypeError)
  assert.throws(() => evaluateTeamSignOff({}, riskReport([])), TypeError)
  assert.throws(() => evaluateTeamSignOff(xv([{ jersey: '1' }]), riskReport([])), TypeError)   // malformed entry
})

test('invalid Selection Risk report → TypeError', () => {
  const good = xv([filled('1', 'A', player('a', 'A'))])
  assert.throws(() => evaluateTeamSignOff(good, null), TypeError)
  assert.throws(() => evaluateTeamSignOff(good, {}), TypeError)
  assert.throws(() => evaluateTeamSignOff(good, riskReport([risk('NOPE')], 'NONE')), TypeError)   // bad severity
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate inputs', () => {
  const x = xv([vacant('1', 'LH'), filled('7', 'Openside', player('os', 'Openside'))])
  const rr = riskReport([risk('CRITICAL'), risk('HIGH')], 'CRITICAL')
  const before = [JSON.stringify(x), JSON.stringify(rr)]
  evaluateTeamSignOff(x, rr)
  assert.deepEqual([JSON.stringify(x), JSON.stringify(rr)], before)
})

test('deterministic — identical input → identical decision', () => {
  const x = xv([filled('1', 'A', player('a', 'A'))])
  const rr = riskReport([risk('HIGH')], 'HIGH')
  assert.deepEqual(evaluateTeamSignOff(x, rr), evaluateTeamSignOff(x, rr))
})

test('output is deeply frozen', () => {
  const r = evaluateTeamSignOff(xv([filled('1', 'A', player('a', 'A'))]), riskReport([risk('CRITICAL')], 'CRITICAL'))
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.blockers) && Object.isFrozen(r.metadata))
  assert.throws(() => r.blockers.push({}))
  assert.throws(() => { r.metadata.approved = true })
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof evaluateTeamSignOff, 'function')
})
