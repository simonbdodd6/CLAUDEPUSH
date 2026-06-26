/**
 * web/brain-readiness-a11y-print.js — Readiness Coach View Accessibility & Print Pack (M224, DORMANT)
 *
 * Two presentation variants of the readiness coach view, built ONLY from the M222 theme helpers
 * (escaping, key-number cards, position-group table, status/confidence badges):
 *   - renderAccessibleReadiness(coachView): a screen-reader / keyboard-friendly variant with semantic
 *     headings, ARIA roles/labels, a spoken status summary, and an accessible warning list.
 *   - renderPrintableReadiness(coachView): a print-friendly variant with a page-break-safe layout,
 *     high-contrast classes, text-only (printer-friendly) badges, and no interactive elements.
 *
 * Pure and deterministic: no DOM, network, storage, AI, clock, or randomness. Every value is escaped.
 * It changes no engine, the coachView contract, the M221/M222/M223 modules, index.html, runtime, or API.
 */

import { escapeHtml, keyNumberCards, positionGroupTable, statusBadge, confidenceChip } from './brain-readiness-theme.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [])
const humanize = (v) => String(v == null ? '' : v).replace(/_/g, ' ').trim().toLowerCase()

function spokenSummary(coachView) {
  const status = humanize(coachView.status) || 'unknown'
  const confidence = humanize(coachView.confidence) || 'unknown'
  const kn = isObj(coachView.keyNumbers) ? coachView.keyNumbers : {}
  const w = strList(coachView.warnings).length
  return `Match readiness status: ${status}. Confidence: ${confidence}. `
    + `${num(kn.available)} of ${num(kn.total)} players available. `
    + `${w} ${w === 1 ? 'warning' : 'warnings'} to review.`
}

function accessibleWarnings(coachView) {
  const warnings = strList(coachView.warnings)
  if (!warnings.length) return '<p class="readiness-a11y__warnings">No warnings to review.</p>'
  const items = warnings.map((w) => `<li>${escapeHtml(humanize(w))}</li>`).join('')
  return `<ul class="readiness-a11y__warnings" aria-label="Readiness warnings to review">${items}</ul>`
}

/**
 * Accessible (screen-reader / keyboard-friendly) rendering of a coachView.
 * Semantic headings + ARIA region/labels; the visual badges are aria-hidden so the spoken summary is
 * the single screen-reader source of truth. No interactive elements.
 */
export function renderAccessibleReadiness(coachView) {
  if (!isObj(coachView)) throw new TypeError('renderAccessibleReadiness requires a coachView object')
  const positionGroups = isObj(coachView.squad) ? coachView.squad.positionGroups : []
  return '<article class="readiness-a11y" role="region" aria-labelledby="readiness-a11y-title">'
    + '<h2 class="readiness-a11y__title" id="readiness-a11y-title">Match readiness</h2>'
    + `<p class="readiness-a11y__spoken" role="status">${escapeHtml(spokenSummary(coachView))}</p>`
    + `<div class="readiness-a11y__badges" aria-hidden="true">${statusBadge(coachView.status)}${confidenceChip(coachView.confidence)}</div>`
    + '<h3 class="readiness-a11y__heading">Key numbers</h3>'
    + `<div class="readiness-a11y__numbers" aria-label="Key readiness numbers">${keyNumberCards(coachView.keyNumbers)}</div>`
    + '<h3 class="readiness-a11y__heading">Warnings to review</h3>'
    + accessibleWarnings(coachView)
    + '<h3 class="readiness-a11y__heading">Position groups</h3>'
    + `<div class="readiness-a11y__groups" aria-label="Position group readiness">${positionGroupTable(positionGroups)}</div>`
    + '<p class="readiness-a11y__note">Draft for review. The coach makes every selection.</p>'
    + '</article>'
}

/**
 * Print-friendly rendering of a coachView: page-break-safe sections, high-contrast classes, text-only
 * badges (no colour reliance), and no interactive elements.
 */
export function renderPrintableReadiness(coachView) {
  if (!isObj(coachView)) throw new TypeError('renderPrintableReadiness requires a coachView object')
  const status = typeof coachView.status === 'string' && coachView.status ? coachView.status : 'UNKNOWN'
  const confidence = typeof coachView.confidence === 'string' && coachView.confidence ? coachView.confidence : 'UNKNOWN'
  const gate = isObj(coachView.gate) && typeof coachView.gate.status === 'string' ? coachView.gate.status : 'UNVALIDATED'
  const trend = isObj(coachView.trend) && coachView.trend.comparable === true && typeof coachView.trend.direction === 'string'
    ? coachView.trend.direction : null
  const warnings = strList(coachView.warnings)
  const positionGroups = isObj(coachView.squad) ? coachView.squad.positionGroups : []

  const textBadges = [
    `[Status: ${status}]`,
    `[Confidence: ${confidence}]`,
    `[Gate: ${gate}]`,
    ...(trend ? [`[Trend: ${trend}]`] : []),
  ].map((b) => `<span class="readiness-print__badge">${escapeHtml(b)}</span>`).join('')

  const warningsBlock = warnings.length
    ? `<ul class="readiness-print__warnings">${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`
    : '<p class="readiness-print__warnings">No warnings</p>'

  const section = (modifier, inner) =>
    `<div class="readiness-print__section readiness-print__section--${modifier} readiness-print__section--avoid-break">${inner}</div>`

  return '<section class="readiness-print readiness-print--high-contrast" data-print="true">'
    + '<h2 class="readiness-print__title">Match readiness — printout</h2>'
    + section('summary', textBadges)
    + section('numbers', '<h3 class="readiness-print__heading">Key numbers</h3>' + keyNumberCards(coachView.keyNumbers))
    + section('warnings', '<h3 class="readiness-print__heading">Warnings</h3>' + warningsBlock)
    + section('groups', '<h3 class="readiness-print__heading">Position groups</h3>' + positionGroupTable(positionGroups))
    + '<p class="readiness-print__note">Draft for review — the coach makes every selection.</p>'
    + '</section>'
}
