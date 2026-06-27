/**
 * web/brain-coach-dna-view — Coach DNA Coach View Renderer (M232) tests
 *
 * Pure coachView → HTML renderer for the Coach DNA panel. Tested against the real M231 sample; reuses
 * the existing Brain visual language; escapes all output; recommends nothing; no index.html / production
 * change.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { renderCoachDnaCoachView } from '../web/brain-coach-dna-view.js'
import { buildCoachDnaCoachViewSample, buildCoachDnaCoachView } from '../packages/coach-intelligence/index.js'
import { synthesizeCoachMemories, extractCoachDnaSignals, buildCoachDnaProfile } from '../packages/coach-memory/index.js'

const services = { synthesizeCoachMemories, extractCoachDnaSignals, buildCoachDnaProfile }

// ── renders the real sample ──────────────────────────────────────────────────────────

test('renders the M231 sample coachView into a self-contained fragment', () => {
  const html = renderCoachDnaCoachView(buildCoachDnaCoachViewSample(services))
  assert.match(html, /^<section class="brain-coach-dna" data-strongest="selection-preference" data-confidence="HIGH">/)
  assert.match(html, /<\/section>$/)
  assert.ok(html.includes('Selection focus'))                                   // headline
  assert.ok(html.includes('Confidence: High'))                                  // confidence badge
  assert.ok(html.includes('brain-coach-dna__badge--confidence brain-coach-dna__badge--high'))
  assert.ok(html.includes('Broad spread'))                                      // diversity badge
  assert.ok(html.includes('Strongest: Selection'))                              // strongest badge
  assert.ok(html.includes('100% · 3×'))                                         // top signal: strength 1.0, 3 memories
  assert.ok(html.includes('brain-coach-dna__number-value">8</span>'))           // totalMemories
  assert.ok(html.includes('Coach has 8 recorded coaching memories across 6 coaching themes.')) // summary
  assert.ok(html.includes('Read-only'))                                         // never auto-acts
})

// ── reuses the existing Brain visual language (mirrors M221 structure) ──────────────────

test('uses the established brain-<panel>__* structure (no redesign)', () => {
  const html = renderCoachDnaCoachView(buildCoachDnaCoachViewSample(services))
  for (const cls of [
    'brain-coach-dna__headline', 'brain-coach-dna__badges', 'brain-coach-dna__badge',
    'brain-coach-dna__numbers', 'brain-coach-dna__number', 'brain-coach-dna__signals',
    'brain-coach-dna__signal', 'brain-coach-dna__themes', 'brain-coach-dna__theme', 'brain-coach-dna__note',
  ]) assert.ok(html.includes(cls), `missing class ${cls}`)
})

// ── determinism ────────────────────────────────────────────────────────────────────────

test('same coachView → identical HTML', () => {
  const v = buildCoachDnaCoachViewSample(services)
  assert.equal(renderCoachDnaCoachView(v), renderCoachDnaCoachView(v))
})

// ── escaping (no XSS) ──────────────────────────────────────────────────────────────────

test('escapes every interpolated value', () => {
  const html = renderCoachDnaCoachView({
    headline: '<script>alert(1)</script>',
    confidence: { value: 0.5, level: '<b>L</b>', label: '<b>L</b>' },
    identity: { strongestCategory: '"><x>', strongestLabel: '<img src=x onerror=1>', diversityLabel: '<i>D</i>' },
    dominantSignals: [{ category: 'c', label: '<svg/onload=1>', strength: 0.5, occurrences: 1, supportingCount: 1 }],
    themes: [{ type: 't', label: '</section><script>', count: 1 }],
    knowledge: { totalMemories: 1, uniqueTypes: 1, averageConfidence: 0.5, averageWeight: 0.5, totalEvidence: 0, totalOntologyLinks: 0 },
    summary: '<iframe>',
    metadata: {},
  })
  assert.ok(!html.includes('<script>'))
  assert.ok(!html.includes('<img src=x'))
  assert.ok(!html.includes('<svg/onload'))
  assert.ok(!html.includes('<iframe>'))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(html.includes('data-strongest="&quot;&gt;&lt;x&gt;"'))
})

// ── degraded / empty input ─────────────────────────────────────────────────────────────

test('empty (no-profile) coachView renders without crashing', () => {
  const empty = buildCoachDnaCoachView({
    profile: buildCoachDnaProfile(extractCoachDnaSignals([])),
    synthesis: synthesizeCoachMemories([]),
  })
  const html = renderCoachDnaCoachView(empty)
  assert.match(html, /^<section class="brain-coach-dna"/)
  assert.ok(html.includes('No coaching profile yet'))                    // headline fallback from M230
  assert.ok(html.includes('brain-coach-dna__signals--none'))            // graceful empty signals state
  assert.ok(html.includes('Confidence: Low'))
})

test('throws on non-object input', () => {
  assert.throws(() => renderCoachDnaCoachView(null), TypeError)
  assert.throws(() => renderCoachDnaCoachView(undefined), TypeError)
  assert.throws(() => renderCoachDnaCoachView('x'), TypeError)
})
