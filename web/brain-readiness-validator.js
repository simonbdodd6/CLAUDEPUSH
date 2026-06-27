/**
 * web/brain-readiness-validator.js — Readiness Coach View Regression Validator (M227, DORMANT)
 *
 * A pure, read-only validator that re-renders the canonical M223 scenarios through every readiness view
 * surface and checks them against the canonical snapshot suite and structural invariants:
 *   - screen        : the M223 snapshot (M221 panel + M222 theme) matches the canonical baseline
 *   - html          : the M221 panel has the required structure
 *   - accessibility : the M224 accessible variant has ARIA landmarks and no interactive elements
 *   - print         : the M224 print variant is high-contrast with page-break-safe sections
 *   - export        : the M225 export pack carries the preserved fields and a markup-free clipboard form
 *   - gallery       : the M226 preview document is well-formed and contains every scenario
 *
 * It produces a deterministic, timestamp-free report (PASS/FAIL, per-check snapshot + mismatch, totals).
 * It never mutates inputs, performs no writes, exposes no internal bundle fields, and introduces no
 * recommendation/selection language. It changes no engine, the coachView contract, the M221–M226
 * modules, index.html, runtime, or API.
 */

import { buildReadinessSnapshots, READINESS_SNAPSHOT_SCENARIOS } from './brain-readiness-snapshots.js' // M223
import { renderReadinessCoachView } from './brain-readiness-view.js'                                    // M221
import { renderAccessibleReadiness, renderPrintableReadiness } from './brain-readiness-a11y-print.js'   // M224
import { buildReadinessExport } from './brain-readiness-export.js'                                      // M225
import { buildReadinessGalleryDocument } from './brain-readiness-gallery.js'                            // M226

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const SCENARIO_NAMES = Object.keys(READINESS_SNAPSHOT_SCENARIOS)
const GALLERY_TITLES = ['Fully ready', 'Match ready', 'Understrength', 'No squad', 'Low confidence', 'Warning-heavy', 'Trend improving', 'Trend declining', 'Trend unavailable']
const INTERNAL_TOKENS = ['"sources"', '"manifest"', '"schemaVersion"', '"components"', 'readiness-evidence-bundle']
const SELECTION_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i
const NO_INTERACTIVE = /<button|<a\s|<input|<select|<textarea|onclick=|tabindex=/i

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function safetyIssue(text) {
  for (const t of INTERNAL_TOKENS) if (text.includes(t)) return `leaks internal field ${t}`
  if (SELECTION_LANG.test(text)) return 'contains selection/recommendation language'
  return null
}

function firstDiffIndex(a, b) {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i
  return a.length === b.length ? -1 : n
}

// ── per-aspect checks (return a mismatch string, or null when valid) ─────────────────────

function checkScreen(name, actual, expected) {
  if (!Object.prototype.hasOwnProperty.call(actual, name) || typeof actual[name] !== 'string') return 'missing rendered snapshot'
  if (actual[name] !== expected[name]) return `output differs from canonical snapshot at index ${firstDiffIndex(actual[name], expected[name])}`
  return safetyIssue(expected[name])
}

function checkHtml(coachView) {
  const html = renderReadinessCoachView(coachView)
  for (const marker of ['class="brain-readiness"', 'data-status=', 'brain-readiness__headline', 'brain-readiness__numbers']) {
    if (!html.includes(marker)) return `missing structural marker ${marker}`
  }
  if (!html.endsWith('</section>')) return 'panel is not a closed <section>'
  return safetyIssue(html)
}

function checkAccessibility(coachView) {
  const html = renderAccessibleReadiness(coachView)
  for (const marker of ['role="region"', 'aria-labelledby', '<h2 ', 'role="status"']) {
    if (!html.includes(marker)) return `missing accessibility marker ${marker}`
  }
  if (NO_INTERACTIVE.test(html)) return 'contains an interactive element'
  return safetyIssue(html)
}

function checkPrint(coachView) {
  const html = renderPrintableReadiness(coachView)
  if (!html.includes('readiness-print--high-contrast')) return 'missing high-contrast print layout'
  if ((html.match(/--avoid-break/g) || []).length !== 4) return 'expected 4 page-break-safe sections'
  if (NO_INTERACTIVE.test(html)) return 'contains an interactive element'
  return safetyIssue(html)
}

function checkExport(coachView) {
  const pack = buildReadinessExport(coachView)
  for (const k of ['html', 'printableHtml', 'text', 'clipboard']) {
    if (typeof pack[k] !== 'string') return `missing export form ${k}`
  }
  for (const field of ['Status:', 'Confidence:', 'Gate:']) {
    if (!pack.text.includes(field)) return `text export missing ${field}`
  }
  if (pack.clipboard.includes('<')) return 'clipboard export contains markup'
  for (const k of ['html', 'printableHtml', 'text', 'clipboard']) {
    const issue = safetyIssue(pack[k])
    if (issue) return `${k} ${issue}`
  }
  return null
}

function checkGallery() {
  const doc = buildReadinessGalleryDocument()
  if (!doc.startsWith('<!DOCTYPE html>')) return 'not a standalone document'
  if (!doc.includes('<style>')) return 'missing reference stylesheet'
  for (const title of GALLERY_TITLES) {
    if (!doc.includes(`>${title}</figcaption>`)) return `missing scenario ${title}`
  }
  if (doc.includes('<script')) return 'contains a script element'
  return safetyIssue(doc)
}

/**
 * Validate the readiness rendering surfaces against the canonical snapshot suite + structural invariants.
 *
 * @param {object} [options]
 * @param {Record<string,string>} [options.snapshots]  screen snapshots to validate (defaults to a fresh
 *   canonical build); pass a tampered map to exercise regression detection.
 * @returns {Readonly<object>}  a deterministic, timestamp-free validation report.
 */
export function validateReadinessRendering(options = {}) {
  const opts = isObj(options) ? options : {}
  const expected = buildReadinessSnapshots()
  const actual = isObj(opts.snapshots) ? opts.snapshots : buildReadinessSnapshots()

  const checks = []
  for (const name of SCENARIO_NAMES) {
    const coachView = READINESS_SNAPSHOT_SCENARIOS[name]
    checks.push({ snapshot: name, aspect: 'screen', mismatch: checkScreen(name, actual, expected) })
    checks.push({ snapshot: name, aspect: 'html', mismatch: checkHtml(coachView) })
    checks.push({ snapshot: name, aspect: 'accessibility', mismatch: checkAccessibility(coachView) })
    checks.push({ snapshot: name, aspect: 'print', mismatch: checkPrint(coachView) })
    checks.push({ snapshot: name, aspect: 'export', mismatch: checkExport(coachView) })
  }
  checks.push({ snapshot: '(all)', aspect: 'gallery', mismatch: checkGallery() })

  const results = checks.map((c) => ({ snapshot: c.snapshot, aspect: c.aspect, pass: c.mismatch === null, mismatch: c.mismatch }))
  const failed = results.filter((c) => !c.pass)

  return deepFreeze({
    type: 'readiness-rendering-validation',
    schemaVersion: 1,
    pass: failed.length === 0,
    totalChecks: results.length,
    passedChecks: results.length - failed.length,
    failedChecks: failed.length,
    checks: results,
    mismatchSummary: failed.map((c) => `${c.aspect}[${c.snapshot}]: ${c.mismatch}`),
  })
}
