/**
 * web/brain-readiness-export — Readiness Coach View Export Pack (M225) tests
 *
 * Four export forms (html / printableHtml / text / clipboard) derived only from the coachView contract,
 * driven by the M223 canonical scenarios. Verifies determinism, safe empty handling, escaping, plain-text
 * formatting, printable output, no internal-field leak, and no selection language.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildReadinessExport, exportReadinessText, exportReadinessClipboard,
  exportReadinessHtml, exportReadinessPrintableHtml,
} from '../web/brain-readiness-export.js'
import { READINESS_SNAPSHOT_SCENARIOS } from '../web/brain-readiness-snapshots.js'

const SCENARIO_NAMES = Object.keys(READINESS_SNAPSHOT_SCENARIOS)
const INTERNAL_TOKENS = ['"sources"', '"manifest"', '"schemaVersion"', '"components"', 'readiness-evidence-bundle']
const SELECTION_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

// ── shape & reuse ──────────────────────────────────────────────────────────────────────

test('buildReadinessExport returns a frozen pack of four string forms', () => {
  const pack = buildReadinessExport(READINESS_SNAPSHOT_SCENARIOS.matchReady)
  assert.deepEqual(Object.keys(pack).sort(), ['clipboard', 'html', 'printableHtml', 'text'])
  for (const k of Object.keys(pack)) assert.equal(typeof pack[k], 'string')
  assert.ok(Object.isFrozen(pack))
  // reuse: html = M221 panel, printableHtml = M224 print pack
  assert.ok(pack.html.includes('class="brain-readiness"'))
  assert.ok(pack.printableHtml.includes('class="readiness-print readiness-print--high-contrast"'))
  assert.equal(pack.html, exportReadinessHtml(READINESS_SNAPSHOT_SCENARIOS.matchReady))
  assert.equal(pack.printableHtml, exportReadinessPrintableHtml(READINESS_SNAPSHOT_SCENARIOS.matchReady))
})

// ── plain-text formatting & preserved fields ────────────────────────────────────────────

test('plain-text summary preserves every required field', () => {
  const text = exportReadinessText(READINESS_SNAPSHOT_SCENARIOS.lowConfidence)
  const lines = text.split('\n')
  assert.equal(lines[0], 'Match readiness')
  assert.equal(lines[1], '===============')
  assert.ok(text.includes('Status: MATCH_READY'))           // status
  assert.ok(text.includes('Confidence: LOW'))               // confidence
  assert.ok(text.includes('Gate: WARN'))                    // gate
  assert.ok(text.includes('Match ready — 16/20 available, 2 to review'))  // headline
  assert.ok(text.includes('Key numbers:') && text.includes('- Available: 16/20') && text.includes('- Missing info: 13'))  // key numbers
  assert.ok(text.includes('Player readiness: 20 players, 3 with concerns, 0 missing information'))  // player readiness (from playerReadiness.*)
  assert.ok(text.includes('Warnings:') && text.includes('- LOW_CONFIDENCE') && text.includes('- MISSING_PLAYER_INFORMATION'))  // warnings
  assert.ok(text.includes('Position groups:') && text.includes('- FRONT_ROW: 3/3 available'))  // position groups
  assert.equal(lines[lines.length - 1], 'Draft for review — the coach makes every selection.')
})

test('plain-text handles no-warnings and no-squad cases', () => {
  assert.ok(exportReadinessText(READINESS_SNAPSHOT_SCENARIOS.fullyReady).includes('Warnings:\n- None'))
  assert.ok(exportReadinessText(READINESS_SNAPSHOT_SCENARIOS.noSquad).includes('Position groups:\n- No position data'))
})

// ── clipboard safety ───────────────────────────────────────────────────────────────────

test('clipboard version contains no HTML and strips control characters', () => {
  const bel = String.fromCharCode(7)
  const cv = { status: 'MATCH_READY' + bel, confidence: 'LOW', gate: { status: 'WARN' }, headline: 'Head' + bel + 'line', keyNumbers: { total: 20, available: 16 }, warnings: ['LOW_CONFIDENCE'], playerReadiness: { count: 20 }, squad: { positionGroups: [] }, trend: null }
  const clip = exportReadinessClipboard(cv)
  assert.ok(!clip.includes(bel), 'control char stripped')
  assert.ok(!clip.includes('<'), 'no HTML markup')
  assert.equal(clip, clip.trim(), 'trimmed')
  assert.ok(clip.includes('Status: MATCH_READY') && clip.includes('Headline'))
})

// ── empty / malformed input ────────────────────────────────────────────────────────────

test('empty coachView is handled safely', () => {
  const pack = buildReadinessExport({})
  assert.ok(pack.text.includes('Status: UNKNOWN') && pack.text.includes('Confidence: UNKNOWN') && pack.text.includes('Gate: UNVALIDATED'))
  assert.ok(pack.text.includes('- Available: 0/0'))
  assert.ok(pack.text.includes('Warnings:\n- None'))
  assert.ok(pack.html.includes('class="brain-readiness"'))
  assert.ok(pack.printableHtml.includes('readiness-print'))
})

test('malformed input rejected; exports exist', () => {
  for (const fn of [buildReadinessExport, exportReadinessText, exportReadinessClipboard, exportReadinessHtml, exportReadinessPrintableHtml]) {
    assert.equal(typeof fn, 'function')
    assert.throws(() => fn(null), TypeError)
    assert.throws(() => fn('x'), TypeError)
  }
})

// ── determinism ──────────────────────────────────────────────────────────────────────

test('every export is identical on repeated execution', () => {
  for (const name of SCENARIO_NAMES) {
    const cv = READINESS_SNAPSHOT_SCENARIOS[name]
    assert.deepEqual(buildReadinessExport(cv), buildReadinessExport(cv), name)
  }
})

// ── escaping (HTML forms) ──────────────────────────────────────────────────────────────

test('HTML and printable exports escape hostile values', () => {
  const hostile = { status: '<x>', confidence: '"c"', gate: { status: 'PASS' }, headline: '<script>alert(1)</script>', keyNumbers: {}, warnings: ['<img src=x>'], playerReadiness: {}, squad: null, trend: null }
  for (const html of [exportReadinessHtml(hostile), exportReadinessPrintableHtml(hostile)]) {
    assert.ok(!html.includes('<script>'))
    assert.ok(html.includes('&lt;img src=x&gt;'))
  }
})

// ── leakage / language ───────────────────────────────────────────────────────────────

test('no internal bundle fields and no selection language in any export', () => {
  for (const name of SCENARIO_NAMES) {
    const pack = buildReadinessExport(READINESS_SNAPSHOT_SCENARIOS[name])
    for (const form of ['html', 'printableHtml', 'text', 'clipboard']) {
      for (const token of INTERNAL_TOKENS) assert.ok(!pack[form].includes(token), `${name}.${form} leaks ${token}`)
      assert.doesNotMatch(pack[form], SELECTION_LANG, `${name}.${form}`)
    }
  }
})
