/**
 * web/brain-coach-dna-export.js — Coach DNA Export Pack (M235, DORMANT)
 *
 * Export a Coach DNA coachView in four shareable forms, each built ONLY from the public M230 coachView
 * contract — the Coach Memory analogue of the readiness M225 export pack:
 *   - html      : the M232 panel (rich HTML fragment)
 *   - page      : the M233 complete, premium standalone page document
 *   - text      : a deterministic plain-text summary
 *   - clipboard : a clipboard-safe plain-text version (control chars stripped, trimmed)
 *
 * The HTML forms reuse the M232 renderer and the M233 page builder verbatim; the text forms are derived
 * here from the same coachView fields (counts only — never raw ids/statements). No internal bundle fields
 * are exposed, nothing is recommended, and no philosophy is invented. Pure and deterministic: no DOM,
 * network, storage, AI, clock, or randomness. It changes no engine, the M230 contract, the M232/M233/M234
 * modules, index.html, runtime, or API.
 */

import { renderCoachDnaCoachView } from './brain-coach-dna-view.js'   // M232 panel renderer (reused)
import { buildCoachDnaPageDocument } from './brain-coach-dna-page.js' // M233 page builder (reused)

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const arr = (v) => (Array.isArray(v) ? v : [])
const strOr = (v, d) => (typeof v === 'string' && v ? v : d)
const clamp01 = (x) => Math.min(1, Math.max(0, x))
const pct = (v) => `${Math.round(clamp01(num(v)) * 100)}%`

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

// ── plain-text summary (built only from the coachView contract, plain ASCII) ─────────────

function textLines(coachView) {
  const confidence = isObj(coachView.confidence) ? coachView.confidence : {}
  const identity = isObj(coachView.identity) ? coachView.identity : {}
  const knowledge = isObj(coachView.knowledge) ? coachView.knowledge : {}
  const signals = arr(coachView.dominantSignals).filter(isObj)
  const themes = arr(coachView.themes).filter(isObj)
  const weakest = strOr(identity.weakestLabel, '')
  const summary = strOr(coachView.summary, '')

  return [
    'Coach DNA',
    '=========',
    `Confidence: ${strOr(confidence.label, 'Unknown')} (${pct(confidence.value)})`,
    `Strongest: ${strOr(identity.strongestLabel, 'None')}`,
    `Spread: ${strOr(identity.diversityLabel, 'None')}`,
    '',
    strOr(coachView.headline, 'Coach DNA unavailable'),
    '',
    'Coaching strengths:',
    ...(signals.length
      ? signals.map((s) => `- ${strOr(s.label, strOr(s.category, 'Unknown'))}: ${pct(s.strength)} strength, `
          + `${num(s.occurrences)} ${num(s.occurrences) === 1 ? 'memory' : 'memories'}, ${num(s.supportingCount)} evidence`)
      : ['- None recorded yet']),
    '',
    'Knowledge themes:',
    ...(themes.length
      ? themes.map((t) => `- ${strOr(t.label, strOr(t.type, 'Unknown'))}: ${num(t.count)}`)
      : ['- None recorded yet']),
    '',
    'Knowledge base:',
    `- Memories: ${num(knowledge.totalMemories)}`,
    `- Themes: ${num(knowledge.uniqueTypes)}`,
    `- Evidence refs: ${num(knowledge.totalEvidence)}`,
    `- Ontology links: ${num(knowledge.totalOntologyLinks)}`,
    `- Average confidence: ${pct(knowledge.averageConfidence)}`,
    `- Average weight: ${pct(knowledge.averageWeight)}`,
    '',
    `Development area: ${weakest ? `${weakest} is the least-evidenced dimension` : 'None identified yet'}`,
    '',
    'Memory summary:',
    summary || 'No memory summary yet.',
    '',
    "Read-only — built from the coach's recorded memories. No selection is made here.",
  ]
}

/** Plain-text summary of the coachView. */
export function exportCoachDnaText(coachView) {
  if (!isObj(coachView)) throw new TypeError('exportCoachDnaText requires a coachView object')
  return textLines(coachView).join('\n')
}

/** Clipboard-safe plain text: strip control characters (keep newlines), trim trailing space, trim ends. */
export function exportCoachDnaClipboard(coachView) {
  if (!isObj(coachView)) throw new TypeError('exportCoachDnaClipboard requires a coachView object')
  return exportCoachDnaText(coachView)
    .split('\n')
    .map((line) => line.replace(CONTROL_CHARS, '').replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim()
}

/** Rich HTML export — reuses the M232 panel renderer. */
export function exportCoachDnaHtml(coachView) {
  if (!isObj(coachView)) throw new TypeError('exportCoachDnaHtml requires a coachView object')
  return renderCoachDnaCoachView(coachView)
}

/** Complete standalone page export — reuses the M233 page builder. */
export function exportCoachDnaPage(coachView) {
  if (!isObj(coachView)) throw new TypeError('exportCoachDnaPage requires a coachView object')
  return buildCoachDnaPageDocument(coachView)
}

/**
 * Build all export forms at once.
 * @returns {Readonly<{ html: string, page: string, text: string, clipboard: string }>}
 */
export function buildCoachDnaExport(coachView) {
  if (!isObj(coachView)) throw new TypeError('buildCoachDnaExport requires a coachView object')
  return deepFreeze({
    html: exportCoachDnaHtml(coachView),
    page: exportCoachDnaPage(coachView),
    text: exportCoachDnaText(coachView),
    clipboard: exportCoachDnaClipboard(coachView),
  })
}
