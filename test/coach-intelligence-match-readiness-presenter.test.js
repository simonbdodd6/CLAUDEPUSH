/**
 * coach-intelligence — Squad Readiness Report Presenter (M211) tests
 *
 * Renders an M209 summary (+ optional M210 trend) as object/text/json. Reads only; reports nothing new.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { summarizeSquadReadiness, assessSquadReadiness, analyzeSquadReadinessTrend } from '../packages/coach-intelligence/index.js'

const readiness = (over = {}) => ({
  readinessLevel: 'MATCH_READY',
  confidence: { level: 'HIGH', label: '' },
  counts: { total: 20, fullyAvailable: 14, availableForSelection: 16, injuryConcern: 2, unavailableOrSuspended: 1, limitedTraining: 1, missingInformation: 0 },
  positionGroups: { FRONT_ROW: { total: 3, available: 2, injuryConcern: 0, unavailableOrSuspended: 1, limitedTraining: 0, missingInformation: 0 }, BACK_THREE: { total: 3, available: 3, injuryConcern: 1, unavailableOrSuspended: 0, limitedTraining: 0, missingInformation: 0 } },
  summary: '',
  ...over,
})
const trend = (over = {}) => ({ currentReadinessLevel: 'MATCH_READY', previousReadinessLevel: 'UNDERSTRENGTH', direction: 'IMPROVING', comparable: true, changes: { availability: 4, injuries: 3, unavailableOrSuspended: 0, limitedTraining: 0 }, confidenceTrend: 'IMPROVING', summary: '', ...over })

// ── object ───────────────────────────────────────────────────────────────────────────

test('object format normalizes summary + trend', () => {
  const out = summarizeSquadReadiness({ readiness: readiness(), trend: trend() }, 'object')
  assert.equal(out.readinessLevel, 'MATCH_READY')
  assert.equal(out.confidenceLevel, 'HIGH')
  assert.equal(out.counts.availableForSelection, 16)
  // position groups sorted into an array
  assert.deepEqual(out.positionGroups.map((g) => g.group), ['BACK_THREE', 'FRONT_ROW'])
  assert.equal(out.trend.direction, 'IMPROVING')
  assert.equal(out.trend.changes.availability, 4)
})

test('trend omitted → trend is null', () => {
  const out = summarizeSquadReadiness({ readiness: readiness() }, 'object')
  assert.equal(out.trend, null)
})

// ── text ───────────────────────────────────────────────────────────────────────────────

test('text format renders deterministic lines', () => {
  const lines = summarizeSquadReadiness({ readiness: readiness(), trend: trend() }, 'text').split('\n')
  assert.equal(lines[0], 'SquadReadiness level=MATCH_READY confidence=HIGH available=16/20 fullyAvailable=14 injuries=2 unavailableOrSuspended=1 limitedTraining=1 missing=0')
  assert.equal(lines[1], 'group BACK_THREE total=3 available=3 injuries=1 unavailable=0 limited=0 missing=0')
  assert.equal(lines[2], 'group FRONT_ROW total=3 available=2 injuries=0 unavailable=1 limited=0 missing=0')
  assert.equal(lines[3], 'trend IMPROVING UNDERSTRENGTH→MATCH_READY availability=+4 injuries=+3 confidence=IMPROVING')
})

test('single-snapshot trend shows "(not comparable)"', () => {
  const out = summarizeSquadReadiness({ readiness: readiness(), trend: trend({ comparable: false, direction: 'STABLE', previousReadinessLevel: null }) }, 'text')
  assert.match(out, /trend STABLE \(not comparable\)$/)
})

// ── json ───────────────────────────────────────────────────────────────────────────────

test('json format parses back to the object form', () => {
  const json = summarizeSquadReadiness({ readiness: readiness(), trend: trend() }, 'json')
  assert.equal(typeof json, 'string')
  assert.deepEqual(JSON.parse(json), summarizeSquadReadiness({ readiness: readiness(), trend: trend() }, 'object'))
})

// ── default / reuse real outputs / determinism / frozen / mutation / validation / export ─

test('default format (omitted) is the object form', () => {
  assert.deepEqual(summarizeSquadReadiness({ readiness: readiness() }), summarizeSquadReadiness({ readiness: readiness() }, 'object'))
})

test('renders real M209 + M210 output end-to-end', () => {
  const players = (n, over = {}) => Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, position: 'Lock', availability: 'available', fitness: 'fit', attendance: 'good', ...over }))
  const s1 = assessSquadReadiness(players(12))
  const s2 = assessSquadReadiness(players(18))
  const t = analyzeSquadReadinessTrend([s1, s2])
  const out = summarizeSquadReadiness({ readiness: s2, trend: t }, 'object')
  assert.equal(out.readinessLevel, 'FULLY_READY')
  assert.equal(out.trend.direction, 'IMPROVING')
})

test('deterministic — repeated calls are identical', () => {
  const r = { readiness: readiness(), trend: trend() }
  assert.deepEqual(summarizeSquadReadiness(r, 'object'), summarizeSquadReadiness(r, 'object'))
  assert.equal(summarizeSquadReadiness(r, 'text'), summarizeSquadReadiness(r, 'text'))
  assert.equal(summarizeSquadReadiness(r, 'json'), summarizeSquadReadiness(r, 'json'))
})

test('object output is deeply frozen', () => {
  const out = summarizeSquadReadiness({ readiness: readiness(), trend: trend() }, 'object')
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.counts) && Object.isFrozen(out.positionGroups) && Object.isFrozen(out.positionGroups[0]) && Object.isFrozen(out.trend))
  assert.throws(() => { out.readinessLevel = 'X' })
})

test('does not mutate the input', () => {
  const r = { readiness: readiness(), trend: trend() }
  const before = JSON.stringify(r)
  summarizeSquadReadiness(r, 'object')
  assert.equal(JSON.stringify(r), before)
})

test('malformed input rejected clearly', () => {
  assert.throws(() => summarizeSquadReadiness(null), TypeError)
  assert.throws(() => summarizeSquadReadiness({}), TypeError)                                   // no readiness
  assert.throws(() => summarizeSquadReadiness({ readiness: {} }), TypeError)                    // no readinessLevel
  assert.throws(() => summarizeSquadReadiness({ readiness: readiness() }, 'yaml'), TypeError)   // bad format
})

test('export exists', () => {
  assert.equal(typeof summarizeSquadReadiness, 'function')
})
