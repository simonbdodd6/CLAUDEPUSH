/**
 * coach-intelligence — Squad Readiness Trend (M210) tests
 *
 * Compares a chronological list of M209 summaries and reports the direction of travel. Observational
 * only: no selection, no team, no ranking. Snapshots are minimal M209-shaped summaries; one test
 * feeds real assessSquadReadiness output to prove output reuse.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { analyzeSquadReadinessTrend, assessSquadReadiness } from '../packages/coach-intelligence/index.js'

// minimal M209-summary-shaped snapshot
const snap = (readinessLevel, { avail = 0, injury = 0, unavail = 0, limited = 0, conf = 'HIGH' } = {}) => ({
  readinessLevel,
  confidence: { level: conf, label: '' },
  counts: { total: avail + unavail, fullyAvailable: avail, availableForSelection: avail, injuryConcern: injury, unavailableOrSuspended: unavail, limitedTraining: limited, missingInformation: 0 },
  positionGroups: {},
  summary: '',
})

// ── direction of travel ────────────────────────────────────────────────────────────────

test('improving squad', () => {
  const out = analyzeSquadReadinessTrend([snap('UNDERSTRENGTH', { avail: 12, conf: 'MEDIUM' }), snap('MATCH_READY', { avail: 16, conf: 'HIGH' })])
  assert.equal(out.direction, 'IMPROVING')
  assert.equal(out.currentReadinessLevel, 'MATCH_READY')
  assert.equal(out.previousReadinessLevel, 'UNDERSTRENGTH')
  assert.equal(out.changes.availability, 4)
  assert.equal(out.confidenceTrend, 'IMPROVING')
  assert.equal(out.comparable, true)
  assert.match(out.summary, /^Readiness improving \(UNDERSTRENGTH → MATCH_READY\)\. Availability \+4/)
})

test('declining squad', () => {
  const out = analyzeSquadReadinessTrend([snap('FULLY_READY', { avail: 19 }), snap('MATCH_READY', { avail: 15, injury: 3 })])
  assert.equal(out.direction, 'DECLINING')
  assert.equal(out.changes.availability, -4)
  assert.equal(out.changes.injuries, 3)
})

test('stable squad (identical snapshots)', () => {
  const s = snap('MATCH_READY', { avail: 16, injury: 1 })
  const out = analyzeSquadReadinessTrend([s, snap('MATCH_READY', { avail: 16, injury: 1 })])
  assert.equal(out.direction, 'STABLE')
  assert.deepEqual(out.changes, { availability: 0, injuries: 0, unavailableOrSuspended: 0, limitedTraining: 0 })
})

test('same level but fewer concerns → improving; more concerns → declining', () => {
  const better = analyzeSquadReadinessTrend([snap('MATCH_READY', { avail: 16, injury: 4 }), snap('MATCH_READY', { avail: 16, injury: 1 })])
  assert.equal(better.direction, 'IMPROVING')   // availability equal, injuries down
  const worse = analyzeSquadReadinessTrend([snap('MATCH_READY', { avail: 16, limited: 1 }), snap('MATCH_READY', { avail: 16, limited: 4 })])
  assert.equal(worse.direction, 'DECLINING')
})

// ── single / empty ───────────────────────────────────────────────────────────────────

test('single snapshot — not comparable, stable, null changes', () => {
  const out = analyzeSquadReadinessTrend([snap('MATCH_READY', { avail: 16 })])
  assert.equal(out.comparable, false)
  assert.equal(out.direction, 'STABLE')
  assert.equal(out.currentReadinessLevel, 'MATCH_READY')
  assert.equal(out.previousReadinessLevel, null)
  assert.deepEqual(out.changes, { availability: null, injuries: null, unavailableOrSuspended: null, limitedTraining: null })
  assert.match(out.summary, /no trend established yet/)
})

test('empty history — null current, no trend', () => {
  const out = analyzeSquadReadinessTrend([])
  assert.equal(out.currentReadinessLevel, null)
  assert.equal(out.comparable, false)
  assert.equal(out.summary, 'No readiness history supplied.')
})

// ── missing data ───────────────────────────────────────────────────────────────────────

test('missing data — counts default to 0, no crash', () => {
  const out = analyzeSquadReadinessTrend([{ readinessLevel: 'UNDERSTRENGTH' }, { readinessLevel: 'MATCH_READY' }])   // no counts/confidence
  assert.equal(out.direction, 'IMPROVING')   // by level rank
  assert.equal(out.changes.availability, 0)
  assert.equal(out.confidenceTrend, 'STABLE') // confidence unknown on both
})

// ── reuse M209 output end-to-end ─────────────────────────────────────────────────────

test('consumes real assessSquadReadiness output (reuse, not recompute)', () => {
  const healthy = (n) => Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, position: 'Lock', availability: 'available', fitness: 'fit', attendance: 'good' }))
  const t1 = assessSquadReadiness(healthy(12))   // UNDERSTRENGTH
  const t2 = assessSquadReadiness(healthy(18))   // FULLY_READY
  const out = analyzeSquadReadinessTrend([t1, t2])
  assert.equal(out.direction, 'IMPROVING')
  assert.equal(out.currentReadinessLevel, 'FULLY_READY')
  assert.equal(out.changes.availability, 6)
})

// ── determinism / immutability / mutation / validation / export ─────────────────────────

test('deterministic — repeated execution is identical', () => {
  const history = [snap('UNDERSTRENGTH', { avail: 10, injury: 2 }), snap('MATCH_READY', { avail: 16, injury: 1 })]
  assert.deepEqual(analyzeSquadReadinessTrend(history), analyzeSquadReadinessTrend(history))
})

test('output is deeply frozen', () => {
  const out = analyzeSquadReadinessTrend([snap('UNDERSTRENGTH', { avail: 10 }), snap('MATCH_READY', { avail: 16 })])
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.changes))
  assert.throws(() => { out.direction = 'X' })
  assert.throws(() => { out.changes.availability = 0 })
})

test('does not mutate the input', () => {
  const history = [snap('UNDERSTRENGTH', { avail: 10, injury: 2 }), snap('MATCH_READY', { avail: 16 })]
  const before = JSON.stringify(history)
  analyzeSquadReadinessTrend(history)
  assert.equal(JSON.stringify(history), before)
})

test('invalid input rejected clearly', () => {
  assert.throws(() => analyzeSquadReadinessTrend(null), TypeError)
  assert.throws(() => analyzeSquadReadinessTrend({}), TypeError)            // not an array
  assert.throws(() => analyzeSquadReadinessTrend('x'), TypeError)
  assert.throws(() => analyzeSquadReadinessTrend([snap('MATCH_READY'), null]), TypeError)   // non-object snapshot
})

test('export exists', () => {
  assert.equal(typeof analyzeSquadReadinessTrend, 'function')
})
