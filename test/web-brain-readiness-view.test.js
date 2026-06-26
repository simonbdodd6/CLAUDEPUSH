/**
 * web/brain-readiness-view — Readiness Coach View Renderer (M221) tests
 *
 * Pure coachView → HTML renderer. Tested against the real M219 sample; escapes output; recommends
 * nothing; no index.html / production change.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { renderReadinessCoachView } from '../web/brain-readiness-view.js'
import { buildReadinessCoachViewSample } from '../packages/coach-intelligence/index.js'

// ── renders the real sample ──────────────────────────────────────────────────────────

test('renders the M219 sample coachView into a self-contained fragment', () => {
  const html = renderReadinessCoachView(buildReadinessCoachViewSample())
  assert.match(html, /^<section class="brain-readiness" data-status="MATCH_READY" data-gate="WARN">/)
  assert.match(html, /<\/section>$/)
  assert.ok(html.includes('Match ready'))                         // headline
  assert.ok(html.includes('Confidence: LOW'))                     // confidence badge
  assert.ok(html.includes('LOW_CONFIDENCE'))                      // warning
  assert.ok(html.includes('16/20'))                               // available/total
  assert.ok(html.includes('brain-readiness__badge--gate brain-readiness__badge--warn'))
  assert.ok(html.includes('Draft for review'))                   // never auto-selects
})

// ── escaping (no XSS) ──────────────────────────────────────────────────────────────────

test('escapes interpolated values', () => {
  const html = renderReadinessCoachView({ status: '<b>X</b>', confidence: 'HIGH', headline: '<script>alert(1)</script>', gate: { status: 'PASS', reasons: [] }, keyNumbers: {}, warnings: ['<img src=x>'], playerReadiness: {}, squad: null, trend: null })
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(html.includes('&lt;img src=x&gt;'))
  assert.ok(html.includes('data-status="&lt;b&gt;X&lt;/b&gt;"'))
})

// ── degraded / empty input ─────────────────────────────────────────────────────────────

test('empty/minimal coachView renders without crashing', () => {
  const html = renderReadinessCoachView({ status: null, confidence: null, gate: {}, headline: '', keyNumbers: {}, warnings: [], playerReadiness: {}, squad: null, trend: null })
  assert.match(html, /data-status="UNKNOWN"/)
  assert.ok(html.includes('Readiness unavailable'))
  assert.ok(html.includes('No warnings'))
  assert.ok(html.includes('0/0'))
})

test('omits the trend line when not comparable', () => {
  const base = buildReadinessCoachViewSample()
  const noTrend = renderReadinessCoachView({ ...base, trend: null })
  assert.ok(!noTrend.includes('brain-readiness__trend'))
})

// ── no selection language ──────────────────────────────────────────────────────────────

test('contains no selection/recommendation language', () => {
  const html = renderReadinessCoachView(buildReadinessCoachViewSample())
  // the only "select" is in the disclaimer "the coach makes every selection" — assert no imperative advice
  assert.doesNotMatch(html, /\b(you should|recommend|drop|pick this|must start|must bench)\b/i)
})

// ── determinism / validation / export ──────────────────────────────────────────────────

test('deterministic — same coachView yields identical HTML', () => {
  const v = buildReadinessCoachViewSample()
  assert.equal(renderReadinessCoachView(v), renderReadinessCoachView(v))
})

test('returns a string', () => {
  assert.equal(typeof renderReadinessCoachView(buildReadinessCoachViewSample()), 'string')
})

test('malformed input rejected clearly', () => {
  assert.throws(() => renderReadinessCoachView(null), TypeError)
  assert.throws(() => renderReadinessCoachView([]), TypeError)
  assert.throws(() => renderReadinessCoachView('x'), TypeError)
})

test('export exists', () => {
  assert.equal(typeof renderReadinessCoachView, 'function')
})
