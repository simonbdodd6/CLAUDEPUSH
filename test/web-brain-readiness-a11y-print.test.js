/**
 * web/brain-readiness-a11y-print — Accessibility & Print Pack (M224) tests
 *
 * Screen-reader/keyboard-friendly and print-friendly variants of the readiness coach view, built from
 * the M222 theme helpers and exercised against the M223 canonical scenarios. Verifies determinism,
 * escaping, no internal-field leak, no selection language, no interactive elements — and that the M223
 * snapshots remain byte-for-byte deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { renderAccessibleReadiness, renderPrintableReadiness } from '../web/brain-readiness-a11y-print.js'
import { buildReadinessSnapshots, READINESS_SNAPSHOT_SCENARIOS } from '../web/brain-readiness-snapshots.js'

const SCENARIO_NAMES = Object.keys(READINESS_SNAPSHOT_SCENARIOS)
const NO_INTERACTIVE = /<button|<a\s|<input|<select|<textarea|onclick=|tabindex=/i
const INTERNAL_TOKENS = ['"sources"', '"manifest"', '"schemaVersion"', '"components"', 'readiness-evidence-bundle']
const SELECTION_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

// ── accessibility ──────────────────────────────────────────────────────────────────────

test('accessible variant: semantic headings, ARIA, spoken status, accessible warnings', () => {
  const html = renderAccessibleReadiness(READINESS_SNAPSHOT_SCENARIOS.lowConfidence)
  assert.ok(html.includes('role="region"') && html.includes('aria-labelledby="readiness-a11y-title"'))
  assert.ok(html.includes('<h2 class="readiness-a11y__title" id="readiness-a11y-title">'))
  assert.equal((html.match(/<h3 /g) || []).length, 3)                      // semantic sub-headings
  assert.ok(html.includes('role="status"') && html.includes('Match readiness status: match ready'))
  assert.ok(html.includes('Confidence: low'))                              // spoken, screen-reader friendly
  assert.ok(html.includes('aria-hidden="true"'))                          // visual badges hidden from SR
  assert.ok(html.includes('aria-label="Readiness warnings to review"'))
  assert.ok(html.includes('<li>low confidence</li>'))                      // accessible warning summary
})

test('accessible variant: no-warnings case reads cleanly', () => {
  const html = renderAccessibleReadiness(READINESS_SNAPSHOT_SCENARIOS.fullyReady)
  assert.ok(html.includes('No warnings to review.'))
  assert.ok(html.includes('0 warnings to review.'))
})

test('accessible variant has no interactive elements', () => {
  for (const name of SCENARIO_NAMES) {
    assert.doesNotMatch(renderAccessibleReadiness(READINESS_SNAPSHOT_SCENARIOS[name]), NO_INTERACTIVE, name)
  }
})

// ── print ──────────────────────────────────────────────────────────────────────────────

test('print variant: high-contrast, page-break-safe sections, text badges', () => {
  const html = renderPrintableReadiness(READINESS_SNAPSHOT_SCENARIOS.warningHeavy)
  assert.ok(html.startsWith('<section class="readiness-print readiness-print--high-contrast" data-print="true">'))
  assert.equal((html.match(/readiness-print__section--avoid-break/g) || []).length, 4)   // page-break-safe sections
  assert.ok(html.includes('[Status: MATCH_READY]') && html.includes('[Confidence: LOW]') && html.includes('[Gate: WARN]'))
  assert.ok(html.includes('VACANT_POSITIONS'))
})

test('print variant: trend badge present only when comparable', () => {
  assert.ok(renderPrintableReadiness(READINESS_SNAPSHOT_SCENARIOS.trendImproving).includes('[Trend: IMPROVING]'))
  assert.ok(!renderPrintableReadiness(READINESS_SNAPSHOT_SCENARIOS.trendUnavailable).includes('[Trend:'))
})

test('print variant has no interactive elements', () => {
  for (const name of SCENARIO_NAMES) {
    assert.doesNotMatch(renderPrintableReadiness(READINESS_SNAPSHOT_SCENARIOS[name]), NO_INTERACTIVE, name)
  }
})

// ── determinism ──────────────────────────────────────────────────────────────────────

test('accessibility and print output are deterministic across all scenarios', () => {
  for (const name of SCENARIO_NAMES) {
    const cv = READINESS_SNAPSHOT_SCENARIOS[name]
    assert.equal(renderAccessibleReadiness(cv), renderAccessibleReadiness(cv), `a11y ${name}`)
    assert.equal(renderPrintableReadiness(cv), renderPrintableReadiness(cv), `print ${name}`)
  }
})

test('existing M223 snapshots remain byte-for-byte deterministic', () => {
  assert.deepEqual(buildReadinessSnapshots(), buildReadinessSnapshots())
})

// ── escaping ──────────────────────────────────────────────────────────────────────────

test('escaping is correct in both variants', () => {
  const hostile = { status: '<x>', confidence: '"c"', gate: { status: 'PASS' }, headline: 'h', keyNumbers: {}, warnings: ['<img src=x>'], playerReadiness: {}, squad: null, trend: null }
  for (const html of [renderAccessibleReadiness(hostile), renderPrintableReadiness(hostile)]) {
    assert.ok(!html.includes('<img src=x>'))
    assert.ok(html.includes('&lt;img src=x&gt;'))
  }
})

// ── leakage / language ───────────────────────────────────────────────────────────────

test('no raw internal bundle fields leak in either variant', () => {
  for (const name of SCENARIO_NAMES) {
    for (const html of [renderAccessibleReadiness(READINESS_SNAPSHOT_SCENARIOS[name]), renderPrintableReadiness(READINESS_SNAPSHOT_SCENARIOS[name])]) {
      for (const token of INTERNAL_TOKENS) assert.ok(!html.includes(token), `${name} leaks ${token}`)
    }
  }
})

test('no recommendation or selection language in either variant', () => {
  for (const name of SCENARIO_NAMES) {
    assert.doesNotMatch(renderAccessibleReadiness(READINESS_SNAPSHOT_SCENARIOS[name]), SELECTION_LANG, name)
    assert.doesNotMatch(renderPrintableReadiness(READINESS_SNAPSHOT_SCENARIOS[name]), SELECTION_LANG, name)
  }
})

// ── validation / export ────────────────────────────────────────────────────────────────

test('malformed input rejected; exports exist', () => {
  assert.throws(() => renderAccessibleReadiness(null), TypeError)
  assert.throws(() => renderPrintableReadiness('x'), TypeError)
  assert.equal(typeof renderAccessibleReadiness, 'function')
  assert.equal(typeof renderPrintableReadiness, 'function')
})
