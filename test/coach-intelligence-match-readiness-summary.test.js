/**
 * coach-intelligence — Squad Match Readiness Summary (M209) tests
 *
 * Aggregates per-player readiness records into a squad-level summary. It selects/ranks nothing and
 * builds no XV — it only reports counts, level, confidence, position groups, and a plain summary.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { assessSquadReadiness } from '../packages/coach-intelligence/index.js'

const POSITIONS = [
  'Loosehead Prop', 'Hooker', 'Tighthead Prop', 'Lock', 'Lock', 'Blindside Flanker', 'Openside Flanker', 'Number 8',
  'Scrum-half', 'Fly-half', 'Left Wing', 'Inside Centre', 'Outside Centre', 'Right Wing', 'Fullback',
  'Loosehead Prop', 'Hooker', 'Lock', 'Scrum-half', 'Fullback',
]
// n fully-fit, available players
const healthy = (n) => Array.from({ length: n }, (_, i) => ({ playerId: `p${i + 1}`, position: POSITIONS[i % POSITIONS.length], availability: 'available', fitness: 'fit', attendance: 'good' }))

// ── fully healthy ──────────────────────────────────────────────────────────────────────

test('fully healthy squad — FULLY_READY, HIGH confidence, all fully available', () => {
  const out = assessSquadReadiness(healthy(20))
  assert.equal(out.readinessLevel, 'FULLY_READY')
  assert.equal(out.counts.total, 20)
  assert.equal(out.counts.availableForSelection, 20)
  assert.equal(out.counts.fullyAvailable, 20)
  assert.equal(out.counts.injuryConcern, 0)
  assert.equal(out.confidence.level, 'HIGH')
  assert.ok(out.positionGroups.FRONT_ROW.total >= 1)
  assert.match(out.summary, /^Fully ready: 20 of 20 available for selection\./)
})

// ── mixed availability ───────────────────────────────────────────────────────────────

test('mixed availability — counts each category', () => {
  const players = [
    { playerId: 'a', position: 'Hooker', availability: 'available', fitness: 'fit', attendance: 'good' },
    { playerId: 'b', position: 'Lock', availability: 'unavailable', fitness: 'fit', attendance: 'good' },
    { playerId: 'c', position: 'Fly-half', availability: 'maybe', fitness: 'fit', attendance: 'good' },
    { playerId: 'd', position: 'Fullback', availability: 'available', fitness: 'returning', attendance: 'poor' },
    { playerId: 'e', position: 'Loosehead Prop', availability: 'available', fitness: 'fit', attendance: 'good', suspended: true },
  ]
  const out = assessSquadReadiness(players)
  assert.equal(out.counts.total, 5)
  assert.equal(out.counts.availableForSelection, 2)          // a (available) + d (available, returning ok) — e is suspended, c is maybe, b unavailable
  assert.equal(out.counts.unavailableOrSuspended, 2)         // b + e
  assert.equal(out.counts.injuryConcern, 1)                  // d
  assert.equal(out.counts.limitedTraining, 1)                // d
  assert.equal(out.readinessLevel, 'UNDERSTRENGTH')
})

// ── heavy injury list ────────────────────────────────────────────────────────────────

test('heavy injury list — injuryConcern dominates, still no recommendations', () => {
  const players = Array.from({ length: 16 }, (_, i) => ({ playerId: `inj${i}`, position: POSITIONS[i % POSITIONS.length], availability: 'available', fitness: 'injured', attendance: 'good' }))
  const out = assessSquadReadiness(players)
  assert.equal(out.counts.injuryConcern, 16)
  // injured players are still "available for selection" by availability — the engine reports, never decides
  assert.equal(out.counts.availableForSelection, 16)
  assert.doesNotMatch(out.summary, /\b(select|drop|pick|bench|start|rest)\b/i)
})

// ── missing information ──────────────────────────────────────────────────────────────

test('missing player information — LOW confidence, missing counted', () => {
  const players = [{ playerId: 'm1' }, { playerId: 'm2' }, { playerId: 'm3', availability: 'available', fitness: 'fit', attendance: 'good' }]
  const out = assessSquadReadiness(players)
  assert.equal(out.counts.missingInformation, 2)
  assert.equal(out.confidence.level, 'LOW')   // 2 of 3 missing ≥ ceil(3/2)=2
})

// ── small + empty squads ───────────────────────────────────────────────────────────────

test('small squad — UNDERSTRENGTH', () => {
  const out = assessSquadReadiness(healthy(5))
  assert.equal(out.readinessLevel, 'UNDERSTRENGTH')
  assert.equal(out.counts.availableForSelection, 5)
})

test('exactly 15 available — MATCH_READY', () => {
  assert.equal(assessSquadReadiness(healthy(15)).readinessLevel, 'MATCH_READY')
  assert.equal(assessSquadReadiness(healthy(17)).readinessLevel, 'MATCH_READY')
  assert.equal(assessSquadReadiness(healthy(18)).readinessLevel, 'FULLY_READY')
})

test('empty squad — NO_SQUAD, NONE confidence, empty groups', () => {
  const out = assessSquadReadiness([])
  assert.equal(out.readinessLevel, 'NO_SQUAD')
  assert.equal(out.confidence.level, 'NONE')
  assert.deepEqual(out.counts, { total: 0, fullyAvailable: 0, availableForSelection: 0, injuryConcern: 0, unavailableOrSuspended: 0, limitedTraining: 0, missingInformation: 0 })
  assert.deepEqual(out.positionGroups, {})
  assert.equal(out.summary, 'No player readiness records were supplied.')
})

// ── position groups ──────────────────────────────────────────────────────────────────

test('position groups summarise only where position data exists', () => {
  const players = [
    { playerId: 'fr1', position: 'Hooker', availability: 'available', fitness: 'fit', attendance: 'good' },
    { playerId: 'fr2', position: 'LH', availability: 'unavailable', fitness: 'fit', attendance: 'good' },
    { playerId: 'bt1', position: 'Fullback', availability: 'available', fitness: 'returning', attendance: 'good' },
    { playerId: 'np', availability: 'available', fitness: 'fit', attendance: 'good' },   // no position ⇒ not grouped
  ]
  const out = assessSquadReadiness(players)
  assert.deepEqual(Object.keys(out.positionGroups).sort(), ['BACK_THREE', 'FRONT_ROW'])
  assert.deepEqual(out.positionGroups.FRONT_ROW, { total: 2, available: 1, injuryConcern: 0, unavailableOrSuspended: 1, limitedTraining: 0, missingInformation: 0 })
  assert.deepEqual(out.positionGroups.BACK_THREE, { total: 1, available: 1, injuryConcern: 1, unavailableOrSuspended: 0, limitedTraining: 0, missingInformation: 0 })
})

// ── determinism / immutability / mutation / validation / export ─────────────────────────

test('deterministic — repeated execution is identical', () => {
  const players = healthy(12).concat([{ playerId: 'x', position: 'Lock', availability: 'unavailable' }])
  assert.deepEqual(assessSquadReadiness(players), assessSquadReadiness(players))
})

test('output is deeply frozen', () => {
  const out = assessSquadReadiness(healthy(16))
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.counts) && Object.isFrozen(out.confidence) &&
    Object.isFrozen(out.positionGroups) && Object.isFrozen(out.positionGroups.FRONT_ROW))
  assert.throws(() => { out.readinessLevel = 'X' })
  assert.throws(() => { out.counts.total = 0 })
})

test('does not mutate the input', () => {
  const players = [{ playerId: 'k1', position: 'Hooker', availability: 'available', fitness: 'returning', attendance: 'poor', suspended: false }]
  const before = JSON.stringify(players)
  assessSquadReadiness(players)
  assert.equal(JSON.stringify(players), before)
})

test('invalid input rejected clearly', () => {
  assert.throws(() => assessSquadReadiness(null), TypeError)
  assert.throws(() => assessSquadReadiness({}), TypeError)                          // not an array
  assert.throws(() => assessSquadReadiness('x'), TypeError)
  assert.throws(() => assessSquadReadiness([{ position: 'Hooker' }]), TypeError)    // a record without playerId (via M208)
})

test('export exists', () => {
  assert.equal(typeof assessSquadReadiness, 'function')
})
