/**
 * coach-intelligence — Match Readiness Explanations (M208) tests
 *
 * Explains a player's readiness as fixed-template positive / limiting / missing factors + a confidence
 * note. It recommends nothing (no select/drop) and overrides no coach judgement.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { explainPlayerReadiness } from '../packages/coach-intelligence/index.js'

const codes = (arr) => arr.map((f) => f.code)

// ── core scenarios ───────────────────────────────────────────────────────────────────

test('fully fit player — all positive, full confidence', () => {
  const out = explainPlayerReadiness({ playerId: 'p1', availability: 'available', fitness: 'fit', attendance: 'good' })
  assert.deepEqual(codes(out.positiveFactors), ['AVAILABLE', 'FULLY_FIT', 'GOOD_ATTENDANCE'])
  assert.deepEqual(out.limitingFactors, [])
  assert.deepEqual(out.missingInformation, [])
  assert.equal(out.confidence.level, 'HIGH')
  // every factor carries a plain-language label, never advice
  assert.ok(out.positiveFactors.every((f) => typeof f.label === 'string' && f.label.length > 0))
})

test('returning from injury — flagged as a limiting factor, not a recommendation', () => {
  const out = explainPlayerReadiness({ playerId: 'p2', availability: 'available', fitness: 'returning', attendance: 'good' })
  assert.ok(codes(out.limitingFactors).includes('RETURNING_FROM_INJURY'))
  assert.ok(codes(out.positiveFactors).includes('AVAILABLE'))
  assert.equal(out.confidence.level, 'HIGH')
  // never tells the coach what to do
  const allLabels = [...out.positiveFactors, ...out.limitingFactors, ...out.missingInformation].map((f) => f.label).join(' ')
  assert.doesNotMatch(allLabels, /\b(select|drop|bench|start|pick|rest)\b/i)
})

test('poor attendance — limiting factor', () => {
  const out = explainPlayerReadiness({ playerId: 'p3', availability: 'available', fitness: 'fit', attendance: 'poor' })
  assert.deepEqual(codes(out.limitingFactors), ['POOR_ATTENDANCE'])
  assert.deepEqual(codes(out.positiveFactors), ['AVAILABLE', 'FULLY_FIT'])
})

test('poor attendance via numeric rate', () => {
  const out = explainPlayerReadiness({ playerId: 'p3b', attendance: 0.3, availability: 'available', fitness: 'fit' })
  assert.ok(codes(out.limitingFactors).includes('POOR_ATTENDANCE'))
})

test('suspended player — limiting factor (engine states it, never advises dropping)', () => {
  const out = explainPlayerReadiness({ playerId: 'p4', availability: 'available', fitness: 'fit', attendance: 'good', suspended: true })
  assert.ok(codes(out.limitingFactors).includes('SUSPENDED'))
  assert.equal(out.confidence.level, 'HIGH')
})

test('missing information — warnings + low confidence', () => {
  const out = explainPlayerReadiness({ playerId: 'p5' })
  assert.deepEqual(codes(out.missingInformation), ['NO_ATTENDANCE_DATA', 'NO_AVAILABILITY_DATA', 'NO_FITNESS_DATA'])
  assert.deepEqual(out.positiveFactors, [])
  assert.deepEqual(out.limitingFactors, [])
  assert.equal(out.confidence.level, 'LOW')
})

test('one missing field → moderate confidence', () => {
  const out = explainPlayerReadiness({ playerId: 'p5b', availability: 'available', fitness: 'fit' })   // no attendance
  assert.deepEqual(codes(out.missingInformation), ['NO_ATTENDANCE_DATA'])
  assert.equal(out.confidence.level, 'MEDIUM')
})

test('mixed positive and negative indicators', () => {
  const out = explainPlayerReadiness({ playerId: 'p6', availability: 'maybe', fitness: 'returning', attendance: 'poor' })
  assert.deepEqual(codes(out.positiveFactors), [])
  assert.deepEqual(codes(out.limitingFactors), ['POOR_ATTENDANCE', 'RETURNING_FROM_INJURY', 'TENTATIVE_AVAILABILITY'])
  assert.deepEqual(out.missingInformation, [])
  assert.equal(out.confidence.level, 'HIGH')   // all three inputs known
})

test('average attendance is known but neither positive nor limiting', () => {
  const out = explainPlayerReadiness({ playerId: 'p7', availability: 'available', fitness: 'fit', attendance: 'average' })
  assert.ok(!codes(out.positiveFactors).includes('GOOD_ATTENDANCE'))
  assert.ok(!codes(out.limitingFactors).includes('POOR_ATTENDANCE'))
  assert.deepEqual(out.missingInformation, [])   // average is data, not missing
})

// ── determinism / frozen / mutation / validation / export ───────────────────────────────

test('deterministic — repeated execution is identical', () => {
  const input = { playerId: 'p8', availability: 'available', fitness: 'returning', attendance: 0.85, suspended: false }
  assert.deepEqual(explainPlayerReadiness(input), explainPlayerReadiness(input))
})

test('output is deeply frozen', () => {
  const out = explainPlayerReadiness({ playerId: 'p9', availability: 'available', fitness: 'fit', attendance: 'good' })
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.positiveFactors) && Object.isFrozen(out.positiveFactors[0]) &&
    Object.isFrozen(out.limitingFactors) && Object.isFrozen(out.missingInformation) && Object.isFrozen(out.confidence))
  assert.throws(() => out.positiveFactors.push({}))
  assert.throws(() => { out.confidence.level = 'X' })
})

test('does not mutate the input', () => {
  const input = { playerId: 'p10', availability: 'available', fitness: 'returning', attendance: 'poor', suspended: true }
  const before = JSON.stringify(input)
  explainPlayerReadiness(input)
  assert.equal(JSON.stringify(input), before)
})

test('malformed input rejected clearly', () => {
  assert.throws(() => explainPlayerReadiness(null), TypeError)
  assert.throws(() => explainPlayerReadiness([]), TypeError)
  assert.throws(() => explainPlayerReadiness({}), TypeError)                 // no playerId
  assert.throws(() => explainPlayerReadiness({ playerId: '' }), TypeError)
})

test('export exists', () => {
  assert.equal(typeof explainPlayerReadiness, 'function')
})
