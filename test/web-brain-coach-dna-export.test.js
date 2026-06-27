/**
 * web/brain-coach-dna-export — Coach DNA Export Pack (M235) tests
 *
 * Four export forms (html / page / text / clipboard) derived only from the M230 coachView contract,
 * driven by the M234 canonical scenarios. Verifies the frozen shape + reuse (M232 panel, M233 page),
 * plain-text formatting and preserved fields, clipboard safety, safe empty handling, determinism,
 * escaping in the HTML forms, no internal-field leak, and no recommendation language.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaExport, exportCoachDnaText, exportCoachDnaClipboard,
  exportCoachDnaHtml, exportCoachDnaPage,
} from '../web/brain-coach-dna-export.js'
import { COACH_DNA_SNAPSHOT_SCENARIOS } from '../web/brain-coach-dna-snapshots.js'

const SCENARIO_NAMES = Object.keys(COACH_DNA_SNAPSHOT_SCENARIOS)
const INTERNAL_TOKENS = ['supportingMemoryIds', 'evidenceRefs', 'ontologyLinks', 'statement', 'createdAt', 'coachId']
const RECOMMEND_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

// ── shape & reuse ──────────────────────────────────────────────────────────────────────

test('buildCoachDnaExport returns a frozen pack of four string forms', () => {
  const pack = buildCoachDnaExport(COACH_DNA_SNAPSHOT_SCENARIOS.selectionLed)
  assert.deepEqual(Object.keys(pack).sort(), ['clipboard', 'html', 'page', 'text'])
  for (const k of Object.keys(pack)) assert.equal(typeof pack[k], 'string')
  assert.ok(Object.isFrozen(pack))
  // reuse: html = M232 panel, page = M233 document
  assert.ok(pack.html.includes('class="brain-coach-dna"'))
  assert.ok(pack.page.startsWith('<!DOCTYPE html>') && pack.page.includes('brain-coach-dna-page__hero'))
  assert.equal(pack.html, exportCoachDnaHtml(COACH_DNA_SNAPSHOT_SCENARIOS.selectionLed))
  assert.equal(pack.page, exportCoachDnaPage(COACH_DNA_SNAPSHOT_SCENARIOS.selectionLed))
})

// ── plain-text formatting & preserved fields ────────────────────────────────────────────

test('plain-text summary preserves every required field', () => {
  const text = exportCoachDnaText(COACH_DNA_SNAPSHOT_SCENARIOS.selectionLed)
  const lines = text.split('\n')
  assert.equal(lines[0], 'Coach DNA')
  assert.equal(lines[1], '=========')
  assert.ok(text.includes('Confidence: High (88%)'))                       // confidence indicator + %
  assert.ok(text.includes('Strongest: Selection'))                         // identity
  assert.ok(text.includes('Spread: Broad'))                                // diversity
  assert.ok(text.includes('Selection focus'))                              // headline
  assert.ok(text.includes('Coaching strengths:') && text.includes('- Selection: 100% strength, 3 memories, 3 evidence'))
  assert.ok(text.includes('Knowledge themes:') && text.includes('- Philosophy: 1'))
  assert.ok(text.includes('Knowledge base:') && text.includes('- Memories: 8') && text.includes('- Evidence refs: 3'))
  assert.ok(text.includes('- Average confidence: 79%') && text.includes('- Average weight: 79%'))
  assert.ok(text.includes('Development area: Tactics is the least-evidenced dimension'))
  assert.ok(text.includes('Memory summary:') && text.includes('Coach has 8 recorded coaching memories across 6 coaching themes.'))
  assert.equal(lines[lines.length - 1], "Read-only — built from the coach's recorded memories. No selection is made here.")
})

test('plain-text handles the empty / developing edge cases', () => {
  const empty = exportCoachDnaText(COACH_DNA_SNAPSHOT_SCENARIOS.empty)
  assert.ok(empty.includes('Confidence: Low (0%)'))
  assert.ok(empty.includes('Coaching strengths:\n- None recorded yet'))
  assert.ok(empty.includes('Knowledge themes:\n- None recorded yet'))
  assert.ok(empty.includes('Memory summary:\nNo memory summary yet.'))
  assert.ok(empty.includes('No coaching profile yet'))                      // headline fallback (M230)
})

// ── clipboard safety ───────────────────────────────────────────────────────────────────

test('clipboard version contains no HTML and strips control characters', () => {
  const bel = String.fromCharCode(7)
  const cv = {
    headline: 'Head' + bel + 'line', confidence: { value: 0.5, level: 'MEDIUM', label: 'Med' + bel },
    identity: { strongestLabel: 'Selection', diversityLabel: 'Broad', weakestLabel: 'Tactics' },
    dominantSignals: [], themes: [], knowledge: {}, summary: '',
  }
  const clip = exportCoachDnaClipboard(cv)
  assert.ok(!clip.includes(bel), 'control char stripped')
  assert.ok(!clip.includes('<'), 'no HTML markup')
  assert.equal(clip, clip.trim(), 'trimmed')
  assert.ok(clip.includes('Headline') && clip.includes('Confidence: Med'))
})

// ── empty / malformed input ────────────────────────────────────────────────────────────

test('empty {} coachView is handled safely across all forms', () => {
  const pack = buildCoachDnaExport({})
  assert.ok(pack.text.includes('Confidence: Unknown (0%)'))
  assert.ok(pack.text.includes('Strongest: None') && pack.text.includes('Spread: None'))
  assert.ok(pack.text.includes('Coaching strengths:\n- None recorded yet'))
  assert.ok(pack.text.includes('Development area: None identified yet'))
  assert.ok(pack.html.includes('class="brain-coach-dna"'))
  assert.ok(pack.page.startsWith('<!DOCTYPE html>'))
})

test('malformed input rejected; exports exist', () => {
  for (const fn of [buildCoachDnaExport, exportCoachDnaText, exportCoachDnaClipboard, exportCoachDnaHtml, exportCoachDnaPage]) {
    assert.equal(typeof fn, 'function')
    assert.throws(() => fn(null), TypeError)
    assert.throws(() => fn(undefined), TypeError)
    assert.throws(() => fn('x'), TypeError)
  }
})

// ── determinism ──────────────────────────────────────────────────────────────────────

test('every export is identical on repeated execution', () => {
  for (const name of SCENARIO_NAMES) {
    const cv = COACH_DNA_SNAPSHOT_SCENARIOS[name]
    assert.deepEqual(buildCoachDnaExport(cv), buildCoachDnaExport(cv), name)
  }
})

// ── escaping (HTML forms) ──────────────────────────────────────────────────────────────

test('HTML and page exports escape hostile values', () => {
  const hostile = {
    headline: '<script>alert(1)</script>', confidence: { value: 0.5, level: '<b>L</b>', label: '<b>L</b>' },
    identity: { strongestCategory: '"><x>', strongestLabel: '<img src=x>', diversityLabel: '<i>D</i>' },
    dominantSignals: [{ category: 'c', label: '<svg/onload=1>', strength: 0.5, occurrences: 1, supportingCount: 1 }],
    themes: [{ type: 't', label: '</section><script>', count: 1 }],
    knowledge: { totalMemories: 1, uniqueTypes: 1, averageConfidence: 0.5, averageWeight: 0.5, totalEvidence: 0, totalOntologyLinks: 0 },
    summary: '<iframe>', metadata: {},
  }
  for (const html of [exportCoachDnaHtml(hostile), exportCoachDnaPage(hostile)]) {
    assert.ok(!html.includes('<script>alert(1)'))
    assert.ok(!html.includes('<img src=x'))
    assert.ok(!html.includes('<svg/onload'))
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  }
})

// ── leakage / language ───────────────────────────────────────────────────────────────

test('no internal bundle fields and no recommendation language in any export', () => {
  for (const name of SCENARIO_NAMES) {
    const pack = buildCoachDnaExport(COACH_DNA_SNAPSHOT_SCENARIOS[name])
    for (const form of ['html', 'page', 'text', 'clipboard']) {
      for (const token of INTERNAL_TOKENS) assert.ok(!pack[form].includes(token), `${name}.${form} leaks ${token}`)
      assert.doesNotMatch(pack[form], RECOMMEND_LANG, `${name}.${form}`)
    }
  }
})
