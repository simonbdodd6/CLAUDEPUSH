/**
 * coach-intelligence — Match Readiness Intelligence (M206) tests
 *
 * Observes an existing squad + explanation + availability and reports deterministic readiness codes.
 * It selects/scores/ranks nothing. Hand-built M130-shaped squads exercise each code.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { assessMatchReadiness } from '../packages/coach-intelligence/index.js'

// jersey → position for a standard 15
const FORMATION = [
  ['1', 'Loosehead Prop'], ['2', 'Hooker'], ['3', 'Tighthead Prop'], ['4', 'Lock'], ['5', 'Lock'],
  ['6', 'Blindside Flanker'], ['7', 'Openside Flanker'], ['8', 'Number 8'], ['9', 'Scrum-half'], ['10', 'Fly-half'],
  ['11', 'Left Wing'], ['12', 'Inside Centre'], ['13', 'Outside Centre'], ['14', 'Right Wing'], ['15', 'Fullback'],
]
const filledEntry = ([jersey, position], i) => ({ jersey, position, player: { playerId: `p${i + 1}` }, status: 'filled' })
const vacantEntry = ([jersey, position]) => ({ jersey, position, player: null, status: 'vacant' })

function makeSquad(over = {}) {
  const startingXV = over.startingXV || FORMATION.map(filledEntry)
  return {
    startingXV,
    captain: over.captain !== undefined ? over.captain : { playerId: 'p1' },
    viceCaptain: over.viceCaptain !== undefined ? over.viceCaptain : { playerId: 'p2' },
    bench: over.bench !== undefined ? over.bench : [{ playerId: 'b1' }, { playerId: 'b2' }],
    reserves: over.reserves !== undefined ? over.reserves : [{ playerId: 'r1' }],
    risk: { overallRisk: 'LOW', risks: [], metadata: {} },
  }
}
// everyone available by default
const allAvailable = () => Object.fromEntries([...Array(15)].map((_, i) => [`p${i + 1}`, 'available']).concat([['b1', 'available'], ['b2', 'available'], ['r1', 'available']]))
const explanation15 = () => ({ starters: FORMATION.map(([jersey], i) => ({ playerId: `p${i + 1}`, jersey, explanationCodes: ['FORMATION_REQUIREMENT'] })), bench: [], risks: [], alternatives: [], confidenceNotes: [], summary: {} })

const assess = (over = {}, availability = allAvailable(), explanation = explanation15()) =>
  assessMatchReadiness({ squad: makeSquad(over), explanation, availability })

// ── READY ──────────────────────────────────────────────────────────────────────────────

test('READY — complete squad, everyone available, bench + captain/vice', () => {
  const out = assess()
  assert.equal(out.status, 'READY')
  assert.deepEqual(out.codes, [])
  assert.equal(out.metrics.startersFilled, 15)
  assert.equal(out.metrics.squadComplete, true)
  assert.equal(out.metrics.frontRowFilled, 3)
  assert.equal(out.metrics.frontRowComplete, true)
  assert.equal(out.metrics.benchSize, 2)
  assert.equal(out.metrics.totalSelected, 18)   // 15 + 2 bench + 1 reserve
  assert.equal(out.metrics.totalAvailable, 18)
  assert.equal(out.metrics.captainAvailable, true)
  assert.equal(out.metrics.explanationCoverage, 1)
})

// ── NO_SELECTION ─────────────────────────────────────────────────────────────────────

test('NO_SELECTION — null squad', () => {
  const out = assessMatchReadiness({ squad: null })
  assert.equal(out.status, 'NO_SELECTION')
  assert.deepEqual(out.codes, [])
  assert.equal(out.metrics.totalSelected, 0)
})

test('NO_SELECTION — all jerseys vacant', () => {
  const out = assessMatchReadiness({ squad: makeSquad({ startingXV: FORMATION.map(vacantEntry) }) })
  assert.equal(out.status, 'NO_SELECTION')
})

// ── individual warning codes ──────────────────────────────────────────────────────────

test('VACANT_POSITIONS — a non-front-row jersey vacant', () => {
  const xv = FORMATION.map(filledEntry)
  xv[14] = vacantEntry(FORMATION[14])   // Fullback vacant
  const out = assessMatchReadiness({ squad: makeSquad({ startingXV: xv }), availability: allAvailable() })
  assert.equal(out.status, 'READY_WITH_WARNINGS')
  assert.ok(out.codes.includes('VACANT_POSITIONS'))
  assert.deepEqual(out.metrics.vacantPositions, [{ jersey: '15', position: 'Fullback' }])
  assert.equal(out.metrics.squadComplete, false)
})

test('INSUFFICIENT_FRONT_ROW — a prop vacant', () => {
  const xv = FORMATION.map(filledEntry)
  xv[0] = vacantEntry(FORMATION[0])   // Loosehead Prop vacant
  const out = assessMatchReadiness({ squad: makeSquad({ startingXV: xv }), availability: allAvailable() })
  assert.ok(out.codes.includes('INSUFFICIENT_FRONT_ROW'))
  assert.equal(out.metrics.frontRowFilled, 2)
  assert.equal(out.metrics.frontRowComplete, false)
})

test('CAPTAIN_UNAVAILABLE — captain in the unavailable set, and when captain is null', () => {
  const unavail = { ...allAvailable(), p1: 'unavailable' }
  const out = assess({}, unavail)
  assert.ok(out.codes.includes('CAPTAIN_UNAVAILABLE'))
  assert.ok(out.codes.includes('UNAVAILABLE_STARTERS'))
  assert.equal(out.metrics.captainAvailable, false)
  assert.deepEqual(out.metrics.unavailableStarters, ['p1'])

  const noCaptain = assess({ captain: null })
  assert.ok(noCaptain.codes.includes('CAPTAIN_UNAVAILABLE'))
})

test('VICE_CAPTAIN_UNAVAILABLE — vice unavailable or null', () => {
  assert.ok(assess({}, { ...allAvailable(), p2: 'unavailable' }).codes.includes('VICE_CAPTAIN_UNAVAILABLE'))
  assert.ok(assess({ viceCaptain: null }).codes.includes('VICE_CAPTAIN_UNAVAILABLE'))
})

test('NO_BENCH — empty bench', () => {
  const out = assess({ bench: [] })
  assert.ok(out.codes.includes('NO_BENCH'))
  assert.equal(out.metrics.benchSize, 0)
})

test('LOW_PLAYER_NUMBERS — fewer than 15 available', () => {
  const sparse = { p1: 'available', p2: 'available', p3: 'unavailable' }
  const out = assessMatchReadiness({ squad: makeSquad(), availability: sparse })
  assert.ok(out.codes.includes('LOW_PLAYER_NUMBERS'))
  assert.equal(out.metrics.totalAvailable, 2)
  assert.equal(out.metrics.totalUnavailable, 1)
})

test('UNAVAILABLE_STARTERS — selected starter dropped out', () => {
  const out = assess({}, { ...allAvailable(), p10: 'unavailable' })
  assert.ok(out.codes.includes('UNAVAILABLE_STARTERS'))
  assert.deepEqual(out.metrics.unavailableStarters, ['p10'])
})

test('front row detected via short jersey codes (LH/Hooker/TH) — the real pipeline formation', () => {
  const shortXV = [
    ['1', 'LH'], ['2', 'Hooker'], ['3', 'TH'], ['4', 'Lock'], ['5', 'Lock'],
    ['6', 'Blindside'], ['7', 'Openside'], ['8', 'Number8'], ['9', 'ScrumHalf'], ['10', 'FlyHalf'],
    ['11', 'LeftWing'], ['12', 'InsideCentre'], ['13', 'OutsideCentre'], ['14', 'RightWing'], ['15', 'Fullback'],
  ].map(filledEntry)
  const out = assessMatchReadiness({ squad: makeSquad({ startingXV: shortXV }), availability: allAvailable() })
  assert.equal(out.metrics.frontRowFilled, 3)
  assert.equal(out.status, 'READY')   // not falsely INSUFFICIENT_FRONT_ROW
})

// ── availability optional ──────────────────────────────────────────────────────────────

test('availability omitted → no availability-driven codes, null tallies', () => {
  const out = assessMatchReadiness({ squad: makeSquad(), explanation: explanation15() })
  assert.equal(out.status, 'READY')
  assert.equal(out.metrics.totalAvailable, null)
  assert.equal(out.metrics.totalUnavailable, null)
  assert.equal(out.metrics.captainAvailable, true)   // present + not known-unavailable
})

test('explanation omitted → coverage null', () => {
  const out = assessMatchReadiness({ squad: makeSquad(), availability: allAvailable() })
  assert.equal(out.metrics.explanationCoverage, null)
})

test('accepts Core-shaped availability values ({ response })', () => {
  const coreAvail = Object.fromEntries(Object.entries(allAvailable()).map(([k]) => [k, { response: 'available' }]))
  assert.equal(assessMatchReadiness({ squad: makeSquad(), availability: coreAvail }).metrics.totalAvailable, 18)
})

// ── determinism / frozen / mutation / validation / export ───────────────────────────────

test('deterministic — repeated calls are identical', () => {
  const args = { squad: makeSquad(), explanation: explanation15(), availability: { ...allAvailable(), p1: 'unavailable' } }
  assert.deepEqual(assessMatchReadiness(args), assessMatchReadiness(args))
})

test('output is deeply frozen', () => {
  const out = assess()
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.codes) && Object.isFrozen(out.metrics) && Object.isFrozen(out.metrics.vacantPositions))
  assert.throws(() => { out.status = 'X' })
})

test('does not mutate the input', () => {
  const input = { squad: makeSquad(), explanation: explanation15(), availability: allAvailable() }
  const before = JSON.stringify(input)
  assessMatchReadiness(input)
  assert.equal(JSON.stringify(input), before)
})

test('malformed input rejected clearly', () => {
  assert.throws(() => assessMatchReadiness(null), TypeError)
  assert.throws(() => assessMatchReadiness([]), TypeError)
  assert.throws(() => assessMatchReadiness('x'), TypeError)
})

test('export exists', () => {
  assert.equal(typeof assessMatchReadiness, 'function')
})
