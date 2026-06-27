/**
 * web/brain-readiness-validator — Readiness Coach View Regression Validator (M227) tests
 *
 * Pure read-only validation of every readiness view surface against the canonical M223 suite. Verifies
 * matching passes, intentional mismatch fails with clear diagnostics, empty input is safe, the report is
 * deterministic and timestamp-free, and no internal fields / selection language appear.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { validateReadinessRendering } from '../web/brain-readiness-validator.js'
import { buildReadinessSnapshots } from '../web/brain-readiness-snapshots.js'

const EXPECTED_TOTAL = 9 * 5 + 1   // 9 scenarios × {screen,html,accessibility,print,export} + 1 gallery

// ── matching → pass ────────────────────────────────────────────────────────────────────

test('canonical rendering passes every check', () => {
  const report = validateReadinessRendering()
  assert.equal(report.type, 'readiness-rendering-validation')
  assert.equal(report.schemaVersion, 1)
  assert.equal(report.pass, true)
  assert.equal(report.totalChecks, EXPECTED_TOTAL)
  assert.equal(report.passedChecks, EXPECTED_TOTAL)
  assert.equal(report.failedChecks, 0)
  assert.deepEqual(report.mismatchSummary, [])
  assert.ok(Object.isFrozen(report) && Object.isFrozen(report.checks))
  for (const c of report.checks) {
    assert.deepEqual(Object.keys(c).sort(), ['aspect', 'mismatch', 'pass', 'snapshot'])
    assert.equal(c.pass, true)
    assert.equal(c.mismatch, null)
  }
  // every aspect is represented
  assert.deepEqual([...new Set(report.checks.map((c) => c.aspect))].sort(), ['accessibility', 'export', 'gallery', 'html', 'print', 'screen'])
})

// ── intentional mismatch → fail with diagnostics ─────────────────────────────────────────

test('a tampered snapshot fails with a clear, scoped diagnostic', () => {
  const canon = buildReadinessSnapshots()
  const tampered = { ...canon, matchReady: canon.matchReady.replace('MATCH_READY', 'TEAM_READY') }
  const report = validateReadinessRendering({ snapshots: tampered })
  assert.equal(report.pass, false)
  assert.equal(report.failedChecks, 1)
  const fail = report.checks.find((c) => !c.pass)
  assert.equal(fail.aspect, 'screen')
  assert.equal(fail.snapshot, 'matchReady')
  assert.match(fail.mismatch, /differs from canonical snapshot at index \d+/)
  assert.deepEqual(report.mismatchSummary, [`screen[matchReady]: ${fail.mismatch}`])
  // all other checks still pass
  assert.equal(report.passedChecks, EXPECTED_TOTAL - 1)
})

test('a missing snapshot is reported, not thrown', () => {
  const canon = buildReadinessSnapshots()
  const { noSquad, ...rest } = canon   // drop one scenario
  const report = validateReadinessRendering({ snapshots: rest })
  const fail = report.checks.find((c) => c.aspect === 'screen' && c.snapshot === 'noSquad')
  assert.equal(fail.pass, false)
  assert.equal(fail.mismatch, 'missing rendered snapshot')
})

// ── empty input → safe ─────────────────────────────────────────────────────────────────

test('empty snapshots map is handled safely (all screen checks fail, no throw)', () => {
  const report = validateReadinessRendering({ snapshots: {} })
  assert.equal(report.pass, false)
  const screenFails = report.checks.filter((c) => c.aspect === 'screen' && !c.pass)
  assert.equal(screenFails.length, 9)
  assert.ok(screenFails.every((c) => c.mismatch === 'missing rendered snapshot'))
  // non-screen aspects still validate the live renderers and pass
  assert.ok(report.checks.filter((c) => c.aspect !== 'screen').every((c) => c.pass))
})

test('non-object options handled safely', () => {
  assert.equal(validateReadinessRendering(null).pass, true)
  assert.equal(validateReadinessRendering('x').pass, true)
  assert.equal(validateReadinessRendering().pass, true)
})

// ── determinism / timestamp-free ───────────────────────────────────────────────────────

test('report is byte-identical on repeated execution', () => {
  assert.deepEqual(validateReadinessRendering(), validateReadinessRendering())
  assert.equal(JSON.stringify(validateReadinessRendering()), JSON.stringify(validateReadinessRendering()))
})

test('report is timestamp-free', () => {
  const json = JSON.stringify(validateReadinessRendering())
  assert.doesNotMatch(json, /\d{4}-\d{2}-\d{2}/)          // no ISO date
  assert.doesNotMatch(json, /timestamp|"date"|"time"/i)   // no time fields
})

// ── safety / export ────────────────────────────────────────────────────────────────────

test('report exposes no internal fields and no selection language', () => {
  const json = JSON.stringify(validateReadinessRendering({ snapshots: {} }))
  for (const token of ['"sources"', '"manifest"', 'readiness-evidence-bundle']) assert.ok(!json.includes(token))
  assert.doesNotMatch(json, /\b(you should|recommend|must start|drop him|pick him)\b/i)
})

test('export exists', () => {
  assert.equal(typeof validateReadinessRendering, 'function')
})
