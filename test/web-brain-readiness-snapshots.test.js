/**
 * web/brain-readiness-snapshots — Readiness Coach View HTML Snapshot Suite (M223) tests
 *
 * Canonical, deterministic HTML snapshots across 9 scenarios, composed from the M221 renderer + M222
 * theme helpers. Verifies byte-stability, escaping, no internal-field leakage, and no selection language.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildReadinessSnapshots, renderReadinessSnapshot } from '../web/brain-readiness-snapshots.js'

const SCENARIOS = ['fullyReady', 'matchReady', 'understrength', 'noSquad', 'lowConfidence', 'warningHeavy', 'trendImproving', 'trendDeclining', 'trendUnavailable']

// ── all scenarios present ──────────────────────────────────────────────────────────────

test('builds an HTML snapshot for every named scenario', () => {
  const snaps = buildReadinessSnapshots()
  assert.deepEqual(Object.keys(snaps).sort(), [...SCENARIOS].sort())
  for (const name of SCENARIOS) {
    assert.equal(typeof snaps[name], 'string')
    assert.ok(snaps[name].startsWith('<div class="readiness-snapshot">') && snaps[name].endsWith('</section></div>'))
  }
})

// ── scenario-specific content ──────────────────────────────────────────────────────────

test('each scenario renders its status, gate, and trend correctly', () => {
  const s = buildReadinessSnapshots()
  assert.ok(s.fullyReady.includes('readiness-badge--fully-ready') && s.fullyReady.includes('data-status="FULLY_READY"'))
  assert.ok(s.understrength.includes('data-status="UNDERSTRENGTH"'))
  assert.ok(s.noSquad.includes('data-status="NO_SQUAD"') && s.noSquad.includes('data-gate="FAIL"'))
  assert.ok(s.lowConfidence.includes('Confidence: LOW') && s.lowConfidence.includes('LOW_CONFIDENCE'))
  assert.ok(s.warningHeavy.includes('VACANT_POSITIONS') && s.warningHeavy.includes('CAPTAIN_UNAVAILABLE'))
  // trend present (badge from M222 + line from M221) vs absent
  assert.ok(s.trendImproving.includes('readiness-badge--trend-improving') && s.trendImproving.includes('↑ Improving'))
  assert.ok(s.trendDeclining.includes('readiness-badge--trend-declining') && s.trendDeclining.includes('↓ Declining'))
  assert.ok(!s.trendUnavailable.includes('readiness-badge--trend'))   // not comparable ⇒ no trend badge
  assert.ok(!s.trendUnavailable.includes('brain-readiness__trend'))   // M221 omits the trend line too
})

// ── byte-for-byte determinism ──────────────────────────────────────────────────────────

test('snapshot output is byte-for-byte deterministic', () => {
  assert.deepEqual(buildReadinessSnapshots(), buildReadinessSnapshots())
  // explicit string equality per scenario
  const a = buildReadinessSnapshots(); const b = buildReadinessSnapshots()
  for (const name of SCENARIOS) assert.equal(a[name], b[name])
})

// ── escaping ──────────────────────────────────────────────────────────────────────────

test('escaping remains correct (hostile coachView values are escaped)', () => {
  const html = renderReadinessSnapshot({ status: '<x>', confidence: '"y"', gate: { status: 'PASS', reasons: [] }, headline: '<script>alert(1)</script>', keyNumbers: {}, warnings: ['<img src=x>'], playerReadiness: {}, squad: null, trend: null })
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(html.includes('&lt;img src=x&gt;'))
})

// ── no internal-field leakage ──────────────────────────────────────────────────────────

test('no raw internal bundle fields leak into any snapshot', () => {
  const snaps = buildReadinessSnapshots()
  for (const name of SCENARIOS) {
    const html = snaps[name]
    for (const token of ['"sources"', '"manifest"', '"schemaVersion"', '"components"', 'readiness-evidence-bundle']) {
      assert.ok(!html.includes(token), `${name} leaks ${token}`)
    }
  }
})

// ── no selection / recommendation language ──────────────────────────────────────────────

test('no selection or recommendation language appears', () => {
  const snaps = buildReadinessSnapshots()
  for (const name of SCENARIOS) {
    assert.doesNotMatch(snaps[name], /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i)
  }
})

// ── validation / export ────────────────────────────────────────────────────────────────

test('renderReadinessSnapshot rejects malformed input', () => {
  assert.throws(() => renderReadinessSnapshot(null), TypeError)
  assert.throws(() => renderReadinessSnapshot('x'), TypeError)
})

test('exports exist', () => {
  assert.equal(typeof buildReadinessSnapshots, 'function')
  assert.equal(typeof renderReadinessSnapshot, 'function')
})
