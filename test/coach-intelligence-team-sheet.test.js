/**
 * M127 — Team Sheet Composer tests
 *
 * Deterministic tests for the pure, dormant presenter combining M123 XV + M124 risk + M126
 * sign-off: line/text/markdown/json outputs, default format, approved/blocked/review-needed
 * status, vacant jersey rendering, bench rendering, invalid input + unsupported format
 * rejection, determinism, no mutation, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { composeTeamSheet } from '../packages/coach-intelligence/index.js'

const player = (playerId, position, over = {}) => ({
  playerId, position, score: 0.7, recommendationAction: 'present', requiresCoachReview: false, evidence: {}, ...over,
})
const filledE = (jersey, position, p) => ({ jersey, position, player: p, status: 'filled' })
const vacantE = (jersey, position) => ({ jersey, position, player: null, status: 'vacant' })

const mkXV = (entries, bench = [], unavailable = []) => Object.freeze({
  startingXV: Object.freeze(entries.map((e) => Object.freeze({ ...e, player: e.player ? Object.freeze(e.player) : null }))),
  benchCandidates: Object.freeze(bench.map((b) => Object.freeze(b))),
  unavailable: Object.freeze(unavailable.map((u) => Object.freeze(u))),
  metadata: Object.freeze({}),
})

const risk = (severity) => ({ type: 't', severity, jersey: null, position: 'P', playerId: null, reason: 'r' })
const mkRisk = (risks, overallRisk = 'NONE') => Object.freeze({
  overallRisk,
  risks: Object.freeze(risks.map((r) => Object.freeze(r))),
  metadata: Object.freeze({ totalRisks: risks.length, highestSeverity: overallRisk, deterministic: true, explainable: true, llm: false }),
})

const mkSignOff = (approved, blockers = [], requiresReview = false, highestSeverity = 'NONE') => Object.freeze({
  approved,
  blockers: Object.freeze(blockers.map((b) => Object.freeze(b))),
  requiresReview,
  metadata: Object.freeze({ approved, blockerCount: blockers.length, reviewCount: 0, highestSeverity, deterministic: true, explainable: true, llm: false }),
})

// a clean, fully-approved sheet
const APPROVED = {
  startingXV: mkXV([filledE('1', 'LH', player('alice', 'LH')), filledE('2', 'Hooker', player('bob', 'Hooker'))], [player('carol', 'LH')]),
  riskReport: mkRisk([], 'NONE'),
  signOff: mkSignOff(true, [], false, 'NONE'),
}

// ── line ─────────────────────────────────────────────────────────────────────────────

test('line output', () => {
  assert.equal(composeTeamSheet(APPROVED, { format: 'line' }),
    'team-sheet status=APPROVED filled=2 vacant=0 bench=1 risk=NONE blockers=0 review=false')
})

test('line uses an underscore token for REVIEW NEEDED', () => {
  const parts = { startingXV: mkXV([filledE('1', 'LH', player('a', 'LH'))]), riskReport: mkRisk([risk('HIGH')], 'HIGH'), signOff: mkSignOff(true, [], true, 'HIGH') }
  assert.ok(composeTeamSheet(parts, { format: 'line' }).startsWith('team-sheet status=REVIEW_NEEDED '))
})

// ── text + default ───────────────────────────────────────────────────────────────────

test('text is the default format', () => {
  assert.equal(composeTeamSheet(APPROVED), composeTeamSheet(APPROVED, { format: 'text' }))
})

test('text output renders all sections', () => {
  assert.equal(composeTeamSheet(APPROVED, { format: 'text' }), [
    'Team Sheet',
    'Status: APPROVED',
    '',
    'Starting XV:',
    '1. LH — alice',
    '2. Hooker — bob',
    '',
    'Bench Candidates:',
    '- carol',
    '',
    'Risk:',
    'Overall: NONE',
    'Total risks: 0',
    'Unavailable players: 0',
    '',
    'Sign-off:',
    'Approved: true',
    'Requires review: false',
    'Blockers: 0',
  ].join('\n'))
})

// ── markdown ─────────────────────────────────────────────────────────────────────────

test('markdown output includes all headings', () => {
  const md = composeTeamSheet(APPROVED, { format: 'markdown' })
  for (const h of ['# Team Sheet', '## Starting XV', '## Bench Candidates', '## Risk', '## Sign-off']) {
    assert.ok(md.includes(h), `missing heading: ${h}`)
  }
  assert.ok(md.includes('**Status:** APPROVED'))
  assert.ok(md.includes('1. LH — alice'))
})

// ── json ─────────────────────────────────────────────────────────────────────────────

test('json output is canonical and round-trips the three inputs', () => {
  const json = composeTeamSheet(APPROVED, { format: 'json' })
  assert.deepEqual(JSON.parse(json), JSON.parse(JSON.stringify({ startingXV: APPROVED.startingXV, riskReport: APPROVED.riskReport, signOff: APPROVED.signOff })))
  assert.ok(json.indexOf('"riskReport"') < json.indexOf('"signOff"') && json.indexOf('"signOff"') < json.indexOf('"startingXV"'))   // sorted keys
})

// ── status variants ──────────────────────────────────────────────────────────────────

test('approved team → Status: APPROVED', () => {
  assert.ok(composeTeamSheet(APPROVED, { format: 'text' }).includes('Status: APPROVED'))
})

test('blocked team → Status: BLOCKED', () => {
  const parts = { startingXV: mkXV([vacantE('1', 'LH')]), riskReport: mkRisk([risk('CRITICAL')], 'CRITICAL'), signOff: mkSignOff(false, [risk('CRITICAL')], false, 'CRITICAL') }
  const text = composeTeamSheet(parts, { format: 'text' })
  assert.ok(text.includes('Status: BLOCKED'))
  assert.ok(text.includes('Blockers: 1'))
})

test('review-needed team → Status: REVIEW NEEDED', () => {
  const parts = { startingXV: mkXV([filledE('1', 'LH', player('a', 'LH'))]), riskReport: mkRisk([risk('HIGH')], 'HIGH'), signOff: mkSignOff(true, [], true, 'HIGH') }
  assert.ok(composeTeamSheet(parts, { format: 'text' }).includes('Status: REVIEW NEEDED'))
})

// ── rendering details ────────────────────────────────────────────────────────────────

test('vacant jersey renders as VACANT', () => {
  const parts = { startingXV: mkXV([vacantE('3', 'TH')]), riskReport: mkRisk([], 'NONE'), signOff: mkSignOff(false, [], false, 'NONE') }
  assert.ok(composeTeamSheet(parts, { format: 'text' }).includes('3. TH — VACANT'))
})

test('bench rendering — players listed, empty bench shows (none)', () => {
  assert.ok(composeTeamSheet(APPROVED, { format: 'text' }).includes('- carol'))
  const noBench = { startingXV: mkXV([filledE('1', 'LH', player('a', 'LH'))]), riskReport: mkRisk([], 'NONE'), signOff: mkSignOff(true, [], false, 'NONE') }
  assert.ok(composeTeamSheet(noBench, { format: 'text' }).includes('Bench Candidates:\n- (none)'))
})

test('unavailable count is rendered', () => {
  const parts = {
    startingXV: mkXV([filledE('1', 'LH', player('a', 'LH'))], [], [{ position: 'Lock', ineligibleCount: 2 }, { position: 'TH', ineligibleCount: 1 }]),
    riskReport: mkRisk([], 'NONE'), signOff: mkSignOff(true, [], false, 'NONE'),
  }
  assert.ok(composeTeamSheet(parts, { format: 'text' }).includes('Unavailable players: 3'))
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid input → TypeError', () => {
  assert.throws(() => composeTeamSheet(null), TypeError)
  assert.throws(() => composeTeamSheet({}), TypeError)                                                    // missing parts
  assert.throws(() => composeTeamSheet({ ...APPROVED, startingXV: {} }), TypeError)                       // invalid startingXV
  assert.throws(() => composeTeamSheet({ ...APPROVED, riskReport: {} }), TypeError)                       // invalid riskReport
  assert.throws(() => composeTeamSheet({ ...APPROVED, signOff: { approved: 'yes' } }), TypeError)         // invalid signOff
})

test('unsupported format → TypeError', () => {
  assert.throws(() => composeTeamSheet(APPROVED, { format: 'html' }), TypeError)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate inputs', () => {
  const before = JSON.stringify(APPROVED)
  for (const format of ['line', 'text', 'markdown', 'json']) composeTeamSheet(APPROVED, { format })
  assert.equal(JSON.stringify(APPROVED), before)
})

test('deterministic across formats', () => {
  for (const format of ['line', 'text', 'markdown', 'json']) {
    assert.equal(composeTeamSheet(APPROVED, { format }), composeTeamSheet(APPROVED, { format }))
  }
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof composeTeamSheet, 'function')
})
