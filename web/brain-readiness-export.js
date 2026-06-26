/**
 * web/brain-readiness-export.js — Readiness Coach View Export Pack (M225, DORMANT)
 *
 * Export the readiness coach view in four shareable forms, each built ONLY from the public coachView
 * contract:
 *   - html           : the M221 panel (rich HTML)
 *   - printableHtml  : the M224 print-friendly layout
 *   - text           : a deterministic plain-text summary
 *   - clipboard      : a clipboard-safe plain-text version (control chars stripped, trimmed)
 *
 * The HTML forms reuse the M221 renderer and the M224 print pack; the text forms are derived here from
 * the same coachView fields. No internal bundle fields are ever exposed, and no recommendation/selection
 * language is introduced. Pure and deterministic: no DOM, network, storage, AI, clock, or randomness.
 * It changes no engine, the coachView contract, the M221–M224 modules, index.html, runtime, or API.
 */

import { renderReadinessCoachView } from './brain-readiness-view.js'        // M221
import { renderPrintableReadiness } from './brain-readiness-a11y-print.js'  // M224

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const strOr = (v, d) => (typeof v === 'string' && v ? v : d)
const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [])

// Strip C0 control characters and DEL for clipboard safety; tab and newline are preserved.
// Built from a pure-ASCII pattern so the source itself contains no control characters.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B-\\u001F\\u007F]', 'g')

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

// ── plain-text summary (built only from the coachView contract) ─────────────────────────

function textLines(coachView) {
  const gate = isObj(coachView.gate) ? strOr(coachView.gate.status, 'UNVALIDATED') : 'UNVALIDATED'
  const kn = isObj(coachView.keyNumbers) ? coachView.keyNumbers : {}
  const pr = isObj(coachView.playerReadiness) ? coachView.playerReadiness : {}
  const warnings = strList(coachView.warnings)
  const groups = isObj(coachView.squad) && Array.isArray(coachView.squad.positionGroups)
    ? coachView.squad.positionGroups.filter(isObj) : []

  return [
    'Match readiness',
    '===============',
    `Status: ${strOr(coachView.status, 'UNKNOWN')}`,
    `Confidence: ${strOr(coachView.confidence, 'UNKNOWN')}`,
    `Gate: ${gate}`,
    '',
    strOr(coachView.headline, 'Readiness unavailable'),
    '',
    'Key numbers:',
    `- Available: ${num(kn.available)}/${num(kn.total)}`,
    `- Injuries: ${num(kn.injuries)}`,
    `- Unavailable / suspended: ${num(kn.unavailableOrSuspended)}`,
    `- Limited training: ${num(kn.limitedTraining)}`,
    `- Missing info: ${num(kn.missing)}`,
    '',
    `Player readiness: ${num(pr.count)} players, ${num(pr.withLimitingFactors)} with concerns, ${num(pr.withMissingInformation)} missing information`,
    '',
    'Warnings:',
    ...(warnings.length ? warnings.map((w) => `- ${w}`) : ['- None']),
    '',
    'Position groups:',
    ...(groups.length ? groups.map((g) => `- ${strOr(g.group, 'UNKNOWN')}: ${num(g.available)}/${num(g.total)} available`) : ['- No position data']),
    '',
    'Draft for review — the coach makes every selection.',
  ]
}

/** Plain-text summary of the coachView. */
export function exportReadinessText(coachView) {
  if (!isObj(coachView)) throw new TypeError('exportReadinessText requires a coachView object')
  return textLines(coachView).join('\n')
}

/** Clipboard-safe plain text: strip control characters (keep newlines), trim trailing space, trim ends. */
export function exportReadinessClipboard(coachView) {
  if (!isObj(coachView)) throw new TypeError('exportReadinessClipboard requires a coachView object')
  return exportReadinessText(coachView)
    .split('\n')
    .map((line) => line.replace(CONTROL_CHARS, '').replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim()
}

/** Rich HTML export — reuses the M221 renderer. */
export function exportReadinessHtml(coachView) {
  if (!isObj(coachView)) throw new TypeError('exportReadinessHtml requires a coachView object')
  return renderReadinessCoachView(coachView)
}

/** Printable HTML export — reuses the M224 print pack. */
export function exportReadinessPrintableHtml(coachView) {
  if (!isObj(coachView)) throw new TypeError('exportReadinessPrintableHtml requires a coachView object')
  return renderPrintableReadiness(coachView)
}

/**
 * Build all export forms at once.
 * @returns {Readonly<{ html: string, printableHtml: string, text: string, clipboard: string }>}
 */
export function buildReadinessExport(coachView) {
  if (!isObj(coachView)) throw new TypeError('buildReadinessExport requires a coachView object')
  return deepFreeze({
    html: exportReadinessHtml(coachView),
    printableHtml: exportReadinessPrintableHtml(coachView),
    text: exportReadinessText(coachView),
    clipboard: exportReadinessClipboard(coachView),
  })
}
