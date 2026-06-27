/**
 * web/brain-coach-dna-snapshots — Coach DNA HTML Snapshot Suite (M234) tests
 *
 * Canonical, deterministic Coach DNA snapshots across representative scenarios, composed from the M232
 * renderer + the M222 escape helper. Verifies all scenarios present, scenario-specific content, byte
 * stability, distinct inputs → distinct outputs, escaping, no internal-field leakage, no recommendation
 * language, frozen scenarios, and that the snapshot works on the real live-contract M231 sample.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCoachDnaSnapshots, renderCoachDnaSnapshot, COACH_DNA_SNAPSHOT_SCENARIOS } from '../web/brain-coach-dna-snapshots.js'
import { buildCoachDnaCoachViewSample } from '../packages/coach-intelligence/index.js'
import { synthesizeCoachMemories, extractCoachDnaSignals, buildCoachDnaProfile } from '../packages/coach-memory/index.js'

const services = { synthesizeCoachMemories, extractCoachDnaSignals, buildCoachDnaProfile }
const SCENARIOS = ['selectionLed', 'philosophyLed', 'developing', 'broadVeteran', 'empty']

// ── all scenarios present ──────────────────────────────────────────────────────────────

test('builds an HTML snapshot for every named scenario', () => {
  const snaps = buildCoachDnaSnapshots()
  assert.deepEqual(Object.keys(snaps).sort(), [...SCENARIOS].sort())
  for (const name of SCENARIOS) {
    assert.equal(typeof snaps[name], 'string')
    assert.ok(snaps[name].startsWith('<div class="brain-coach-dna-snapshot"'), `${name} missing wrapper`)
    assert.ok(snaps[name].endsWith('</section></div>'), `${name} not closed`)
    assert.ok(snaps[name].includes('<section class="brain-coach-dna"'), `${name} missing M232 fragment`)
  }
})

// ── reuses the M232 visual language (no re-implementation) ───────────────────────────────

test('every snapshot reuses the established brain-coach-dna__* fragment', () => {
  const snaps = buildCoachDnaSnapshots()
  for (const name of SCENARIOS) {
    for (const cls of ['brain-coach-dna__headline', 'brain-coach-dna__badges', 'brain-coach-dna__numbers', 'brain-coach-dna__note']) {
      assert.ok(snaps[name].includes(cls), `${name} missing ${cls}`)
    }
  }
})

// ── scenario-specific content ──────────────────────────────────────────────────────────

test('each scenario renders its own identity, confidence and state', () => {
  const s = buildCoachDnaSnapshots()
  assert.ok(s.selectionLed.includes('data-confidence="HIGH"') && s.selectionLed.includes('data-strongest="selection-preference"'))
  assert.ok(s.selectionLed.includes('Selection focus') && s.selectionLed.includes('Confidence: High'))
  assert.ok(s.philosophyLed.includes('data-confidence="MEDIUM"') && s.philosophyLed.includes('Philosophy focus'))
  assert.ok(s.developing.includes('data-confidence="LOW"') && s.developing.includes('Confidence: Low'))
  assert.ok(s.broadVeteran.includes('data-strongest="tactical-preference"') && s.broadVeteran.includes('Tactics focus'))
  // empty/degraded state surfaces the M230 fallbacks
  assert.ok(s.empty.includes('No coaching profile yet'))
  assert.ok(s.empty.includes('brain-coach-dna__signals--none'))
})

// ── distinct inputs → distinct outputs ───────────────────────────────────────────────────

test('different coachView inputs produce different snapshots', () => {
  const s = buildCoachDnaSnapshots()
  const values = SCENARIOS.map((n) => s[n])
  assert.equal(new Set(values).size, SCENARIOS.length)   // all five are distinct
})

// ── byte-for-byte determinism ──────────────────────────────────────────────────────────

test('snapshot output is byte-for-byte deterministic', () => {
  assert.deepEqual(buildCoachDnaSnapshots(), buildCoachDnaSnapshots())
  const a = buildCoachDnaSnapshots(); const b = buildCoachDnaSnapshots()
  for (const name of SCENARIOS) assert.equal(a[name], b[name])
})

// ── escaping ──────────────────────────────────────────────────────────────────────────

test('escaping remains correct (hostile coachView values are escaped)', () => {
  const html = renderCoachDnaSnapshot({
    headline: '<script>alert(1)</script>',
    confidence: { value: 0.5, level: '"><x>', label: '<b>L</b>' },
    identity: { strongestCategory: '"><y>', strongestLabel: '<img src=x>', diversityLabel: '<i>D</i>' },
    dominantSignals: [{ category: 'c', label: '<svg/onload=1>', strength: 0.5, occurrences: 1, supportingCount: 1 }],
    themes: [{ type: 't', label: '</section><script>', count: 1 }],
    knowledge: { totalMemories: 1, uniqueTypes: 1, averageConfidence: 0.5, averageWeight: 0.5, totalEvidence: 0, totalOntologyLinks: 0 },
    summary: '<iframe>', metadata: {},
  })
  assert.ok(!html.includes('<script>'))
  assert.ok(!html.includes('<img src=x'))
  assert.ok(!html.includes('<svg/onload'))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(html.includes('data-confidence="&quot;&gt;&lt;x&gt;"'))
  assert.ok(html.includes('data-strongest="&quot;&gt;&lt;y&gt;"'))
})

// ── no internal-field leakage ──────────────────────────────────────────────────────────

test('no raw internal bundle fields leak into any snapshot', () => {
  const snaps = buildCoachDnaSnapshots()
  for (const name of SCENARIOS) {
    for (const token of ['supportingMemoryIds', 'evidenceRefs', 'ontologyLinks', 'statement', 'createdAt', 'coachId']) {
      assert.ok(!snaps[name].includes(token), `${name} leaks ${token}`)
    }
  }
})

// ── no selection / recommendation language ──────────────────────────────────────────────

test('no selection or recommendation language appears', () => {
  const snaps = buildCoachDnaSnapshots()
  for (const name of SCENARIOS) {
    assert.doesNotMatch(snaps[name], /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i)
  }
})

// ── live-contract bridge: works on the real M231 sample ─────────────────────────────────

test('renders the real M231 sample coachView (stays true to the live contract)', () => {
  const html = renderCoachDnaSnapshot(buildCoachDnaCoachViewSample(services))
  assert.ok(html.startsWith('<div class="brain-coach-dna-snapshot"'))
  assert.ok(html.includes('<section class="brain-coach-dna" data-strongest="selection-preference"'))
  assert.ok(html.includes('Selection focus'))
})

// ── frozen scenarios + degraded input + exports ─────────────────────────────────────────

test('exported scenarios are deeply frozen', () => {
  assert.ok(Object.isFrozen(COACH_DNA_SNAPSHOT_SCENARIOS))
  assert.ok(Object.isFrozen(COACH_DNA_SNAPSHOT_SCENARIOS.selectionLed))
  assert.ok(Object.isFrozen(COACH_DNA_SNAPSHOT_SCENARIOS.selectionLed.dominantSignals))
  assert.equal(Object.keys(COACH_DNA_SNAPSHOT_SCENARIOS).length, SCENARIOS.length)
})

test('renderCoachDnaSnapshot rejects malformed input', () => {
  assert.throws(() => renderCoachDnaSnapshot(null), TypeError)
  assert.throws(() => renderCoachDnaSnapshot(undefined), TypeError)
  assert.throws(() => renderCoachDnaSnapshot('x'), TypeError)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaSnapshots, 'function')
  assert.equal(typeof renderCoachDnaSnapshot, 'function')
  assert.equal(typeof COACH_DNA_SNAPSHOT_SCENARIOS, 'object')
})
