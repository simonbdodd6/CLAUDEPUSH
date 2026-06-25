/**
 * coach-intelligence — Selection Explanation Engine (M184) tests
 *
 * Explains an existing M130 match-day squad as deterministic explanation codes. It never selects,
 * scores, or ranks. Hand-built M130-shaped squads exercise each code path precisely.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildSelectionExplanation } from '../packages/coach-intelligence/index.js'

// M121-ranked-item-shaped player
const player = (playerId, position, over = {}) => ({
  playerId, position, score: 0.7, recommendationAction: 'select', requiresCoachReview: false,
  evidence: { alignmentTier: 'good', challenged: false, dominantSignals: [], matchedSignals: [] }, ...over,
})
const filled = (jersey, position, p) => ({ jersey, position, player: p, status: 'filled' })
const vacant = (jersey, position) => ({ jersey, position, player: null, status: 'vacant' })

const p1 = () => player('p1', 'LH')
const p9 = () => player('p9', 'ScrumHalf', { score: 0.5, evidence: { alignmentTier: 'poor', challenged: true, dominantSignals: [], matchedSignals: [] } })
const b1 = () => player('b1', 'Hooker')
const r1 = () => player('r1', 'Lock')

const fullSquad = (over = {}) => ({
  startingXV: [filled('1', 'LH', p1()), filled('9', 'ScrumHalf', p9())],
  captain: { playerId: 'p1', jersey: '1', position: 'LH' },
  viceCaptain: { playerId: 'p9', jersey: '9', position: 'ScrumHalf' },
  bench: [b1()],
  reserves: [r1()],
  risk: { overallRisk: 'LOW', risks: [{ type: 'review-required', severity: 'MEDIUM', jersey: '9', position: 'ScrumHalf', playerId: 'p9', reason: 'review' }], metadata: {} },
  signOff: { approved: true, blockers: [], requiresReview: false, metadata: {} },
  metadata: {},
  ...over,
})

// ── normal squad ───────────────────────────────────────────────────────────────────────

test('normal squad explains starters, bench, risks, alternatives, confidence', () => {
  const out = buildSelectionExplanation(fullSquad())

  assert.deepEqual(out.summary, { starterCount: 2, benchCount: 1, reserveCount: 1, formation: { 1: 'LH', 9: 'ScrumHalf' }, overallRisk: 'LOW' })

  // p1: captain, position match, good alignment, not challenged, not flagged
  assert.deepEqual(out.starters[0], { playerId: 'p1', jersey: '1', explanationCodes: ['CAPTAIN_SELECTION', 'FORMATION_REQUIREMENT', 'POSITION_MATCH', 'HIGH_ALIGNMENT', 'CONSISTENT_SELECTION', 'LOW_SELECTION_RISK'] })
  // p9: vice (captain code), position match; poor tier + challenged + flagged by risk → none of HIGH/CONSISTENT/LOW
  assert.deepEqual(out.starters[1], { playerId: 'p9', jersey: '9', explanationCodes: ['CAPTAIN_SELECTION', 'FORMATION_REQUIREMENT', 'POSITION_MATCH'] })

  assert.deepEqual(out.bench[0], { playerId: 'b1', explanationCodes: ['BENCH_COVER', 'HIGH_ALIGNMENT', 'CONSISTENT_SELECTION', 'LOW_SELECTION_RISK'] })

  // risks reused verbatim from M124
  assert.deepEqual(out.risks, [{ type: 'review-required', severity: 'MEDIUM', jersey: '9', position: 'ScrumHalf', playerId: 'p9', reason: 'review' }])
  // alternatives = reserves
  assert.deepEqual(out.alternatives, [{ playerId: 'r1', position: 'Lock' }])
  // confidence surfaced (starters then bench), existing values only
  assert.deepEqual(out.confidenceNotes, [
    { playerId: 'p1', score: 0.7, alignmentTier: 'good' },
    { playerId: 'p9', score: 0.5, alignmentTier: 'poor' },
    { playerId: 'b1', score: 0.7, alignmentTier: 'good' },
  ])
})

test('vacant jerseys are not explained as starters but appear in formation', () => {
  const out = buildSelectionExplanation(fullSquad({ startingXV: [filled('1', 'LH', p1()), vacant('15', 'Fullback')] }))
  assert.equal(out.summary.starterCount, 1)
  assert.deepEqual(out.summary.formation, { 1: 'LH', 15: 'Fullback' })
  assert.deepEqual(out.starters.map((s) => s.playerId), ['p1'])
})

// ── degraded inputs default safely ───────────────────────────────────────────────────

test('missing bench → empty bench section', () => {
  const s = fullSquad(); delete s.bench
  const out = buildSelectionExplanation(s)
  assert.deepEqual(out.bench, [])
  assert.equal(out.summary.benchCount, 0)
})

test('missing risks → empty risks, null overallRisk, starters gain LOW_SELECTION_RISK', () => {
  const s = fullSquad(); delete s.risk
  const out = buildSelectionExplanation(s)
  assert.deepEqual(out.risks, [])
  assert.equal(out.summary.overallRisk, null)
  assert.ok(out.starters[1].explanationCodes.includes('LOW_SELECTION_RISK'))   // p9 no longer flagged
})

test('missing confidence/evidence → null notes, no alignment/consistency codes', () => {
  const bare = { playerId: 'x', position: 'LH' }   // no score, no evidence
  const out = buildSelectionExplanation(fullSquad({ startingXV: [filled('1', 'LH', bare)], captain: null, viceCaptain: null, bench: [], reserves: [], risk: undefined }))
  assert.deepEqual(out.starters[0].explanationCodes, ['FORMATION_REQUIREMENT', 'POSITION_MATCH', 'LOW_SELECTION_RISK'])
  assert.deepEqual(out.confidenceNotes, [{ playerId: 'x', score: null, alignmentTier: null }])
})

test('empty squad → all sections empty, zero counts', () => {
  const out = buildSelectionExplanation({ startingXV: [], bench: [], reserves: [], risk: { overallRisk: 'NONE', risks: [] } })
  assert.deepEqual(out.summary, { starterCount: 0, benchCount: 0, reserveCount: 0, formation: {}, overallRisk: 'NONE' })
  assert.deepEqual(out.starters, [])
  assert.deepEqual(out.bench, [])
  assert.deepEqual(out.alternatives, [])
  assert.deepEqual(out.confidenceNotes, [])
})

// ── determinism / frozen / no mutation ───────────────────────────────────────────────

test('deterministic — repeated calls are identical', () => {
  assert.deepEqual(buildSelectionExplanation(fullSquad()), buildSelectionExplanation(fullSquad()))
})

test('output is deeply frozen', () => {
  const out = buildSelectionExplanation(fullSquad())
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.starters) && Object.isFrozen(out.starters[0]) &&
    Object.isFrozen(out.starters[0].explanationCodes) && Object.isFrozen(out.risks) && Object.isFrozen(out.summary))
  assert.throws(() => out.starters.push({}))
})

test('does not mutate the input squad', () => {
  const s = fullSquad()
  const before = JSON.stringify(s)
  buildSelectionExplanation(s)
  assert.equal(JSON.stringify(s), before)
})

// ── malformed inputs ───────────────────────────────────────────────────────────────────

test('malformed inputs are rejected clearly', () => {
  assert.throws(() => buildSelectionExplanation(null), TypeError)
  assert.throws(() => buildSelectionExplanation([]), TypeError)
  assert.throws(() => buildSelectionExplanation({}), TypeError)                                   // no startingXV
  assert.throws(() => buildSelectionExplanation({ startingXV: 'x' }), TypeError)
  assert.throws(() => buildSelectionExplanation({ startingXV: [{ jersey: '1', position: 'LH', status: 'filled', player: null }] }), TypeError)  // filled but no player
  assert.throws(() => buildSelectionExplanation({ startingXV: [], bench: 'x' }), TypeError)
  assert.throws(() => buildSelectionExplanation({ startingXV: [], reserves: [{ position: 'Lock' }] }), TypeError)   // reserve without playerId
})

test('export exists', () => {
  assert.equal(typeof buildSelectionExplanation, 'function')
})
