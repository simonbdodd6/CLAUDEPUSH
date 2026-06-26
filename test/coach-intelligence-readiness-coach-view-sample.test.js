/**
 * coach-intelligence — Readiness Coach View Smoke Fixture (M219) tests
 *
 * Confirms the sample conforms to the M217 coachView contract, leaks no raw internals, and is a
 * deterministic frozen object. Built via the real chain — recommends nothing.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildReadinessCoachViewSample } from '../packages/coach-intelligence/index.js'

const COACH_VIEW_KEYS = ['confidence', 'gate', 'headline', 'keyNumbers', 'playerReadiness', 'squad', 'status', 'trend', 'warnings']

// ── matches the coachView contract ─────────────────────────────────────────────────────

test('fixture matches the M217 coachView contract shape', () => {
  const v = buildReadinessCoachViewSample()
  assert.deepEqual(Object.keys(v).sort(), COACH_VIEW_KEYS)
  assert.equal(typeof v.status, 'string')
  assert.equal(typeof v.confidence, 'string')
  assert.equal(typeof v.headline, 'string')
  assert.ok(typeof v.gate === 'object' && typeof v.gate.status === 'string' && Array.isArray(v.gate.reasons))
  assert.ok(typeof v.keyNumbers === 'object' && Array.isArray(v.warnings) && typeof v.playerReadiness === 'object')
})

test('normal squad status with low confidence (representative)', () => {
  const v = buildReadinessCoachViewSample()
  assert.equal(v.status, 'MATCH_READY')          // 16 of 20 available
  assert.equal(v.confidence, 'LOW')              // most fitness/attendance unknown
  assert.equal(v.keyNumbers.total, 20)
  assert.equal(v.keyNumbers.available, 16)
})

test('includes low-confidence warnings', () => {
  const v = buildReadinessCoachViewSample()
  assert.ok(v.warnings.includes('LOW_CONFIDENCE'))
  assert.ok(v.warnings.includes('MISSING_PLAYER_INFORMATION'))
})

test('includes a player-readiness summary', () => {
  const v = buildReadinessCoachViewSample()
  assert.equal(v.playerReadiness.count, 20)
  assert.ok(v.playerReadiness.withLimitingFactors > 0)
  assert.ok(v.playerReadiness.withMissingInformation > 0)
})

test('includes a squad summary section', () => {
  const v = buildReadinessCoachViewSample()
  assert.equal(v.squad.readinessLevel, 'MATCH_READY')
  assert.ok(Array.isArray(v.squad.positionGroups) && v.squad.positionGroups.length > 0)
  assert.equal(typeof v.squad.summary, 'string')
})

test('includes a gate status', () => {
  const v = buildReadinessCoachViewSample()
  assert.ok(['PASS', 'WARN', 'FAIL', 'UNVALIDATED'].includes(v.gate.status))
  assert.equal(v.gate.status, 'WARN')   // low confidence ⇒ WARN
})

test('makes no selection recommendation (no advice language, no recommendation field)', () => {
  const v = buildReadinessCoachViewSample()
  assert.equal(v.recommendation, undefined)
  assert.equal(v.selection, undefined)
  assert.doesNotMatch(JSON.stringify(v), /\b(select|drop|pick|bench|start|rest)\b/i)
})

// ── no raw internals leak ──────────────────────────────────────────────────────────────

test('no raw internal bundle fields leak into the fixture', () => {
  const v = buildReadinessCoachViewSample()
  assert.equal(v.sources, undefined)
  assert.equal(v.manifest, undefined)
  assert.equal(v.type, undefined)
  assert.equal(v.components, undefined)
  assert.equal(v.schemaVersion, undefined)
  assert.equal(v.validation, undefined)
})

// ── determinism / immutability / export ─────────────────────────────────────────────────

test('deterministic — repeated builds are identical', () => {
  assert.deepEqual(buildReadinessCoachViewSample(), buildReadinessCoachViewSample())
})

test('output is deeply frozen', () => {
  const v = buildReadinessCoachViewSample()
  assert.ok(Object.isFrozen(v) && Object.isFrozen(v.keyNumbers) && Object.isFrozen(v.warnings) &&
    Object.isFrozen(v.gate) && Object.isFrozen(v.squad) && Object.isFrozen(v.playerReadiness))
  assert.throws(() => { v.status = 'X' })
})

test('export exists', () => {
  assert.equal(typeof buildReadinessCoachViewSample, 'function')
})
