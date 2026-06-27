/**
 * web/brain-coach-dna-view.js — Coach DNA Coach View Renderer (M232, DORMANT)
 *
 * A pure, deterministic renderer that turns an M230 Coach DNA `coachView` into a self-contained HTML
 * fragment for the future premium Coach DNA panel. It is the Coach Memory analogue of the M221
 * readiness renderer and deliberately reuses the EXISTING Brain visual language — the same `brain-<panel>__*`
 * block/element naming, the same badge-row + value/label list + name/count list structure, the same
 * shared M222 `escapeHtml` utility, and the same read-only closing note — so the panel looks like it
 * belongs to the same designed experience. No new aesthetic is introduced.
 *
 * It only reads the coachView, escapes all interpolated values (no XSS), recommends nothing, invents no
 * philosophy, and has no side effects (no DOM, network, storage, AI, clock, or randomness). Same input →
 * same output. Importing this module changes nothing in production — `index.html` is untouched.
 */

import { escapeHtml as esc } from './brain-readiness-theme.js'   // M222 shared HTML helper (reused)

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const arr = (v) => (Array.isArray(v) ? v : [])
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const clamp01 = (x) => Math.min(1, Math.max(0, x))
const pct = (v) => `${Math.round(clamp01(num(v)) * 100)}%`
const str = (v) => (typeof v === 'string' ? v : '')

/** Slug a value into a CSS-class-safe variant token (deterministic) — mirrors the M222 theme helper. */
const variant = (v) => {
  const s = String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || 'unknown'
}

/**
 * Render a Coach DNA coachView (M230) into an HTML string for the Coach DNA panel.
 *
 * @param {object} coachView  an M230 coachView (e.g. from buildCoachDnaCoachViewSample)
 * @returns {string}  a self-contained `<section class="brain-coach-dna">…</section>` fragment
 */
export function renderCoachDnaCoachView(coachView) {
  if (!isObj(coachView)) throw new TypeError('renderCoachDnaCoachView requires a coachView object')

  const headline = str(coachView.headline) || 'Coach DNA unavailable'
  const confidence = isObj(coachView.confidence) ? coachView.confidence : {}
  const confLevel = str(confidence.level) || 'UNKNOWN'
  const confLabel = str(confidence.label) || confLevel
  const identity = isObj(coachView.identity) ? coachView.identity : {}
  const strongestCategory = str(identity.strongestCategory)
  const strongestLabel = str(identity.strongestLabel) || '—'
  const diversityLabel = str(identity.diversityLabel) || '—'
  const signals = arr(coachView.dominantSignals).filter(isObj)
  const themes = arr(coachView.themes).filter(isObj)
  const knowledge = isObj(coachView.knowledge) ? coachView.knowledge : {}
  const summary = str(coachView.summary)

  const badges = [
    `<span class="brain-coach-dna__badge brain-coach-dna__badge--confidence brain-coach-dna__badge--${esc(variant(confLevel))}">Confidence: ${esc(confLabel)}</span>`,
    `<span class="brain-coach-dna__badge brain-coach-dna__badge--diversity">${esc(diversityLabel)} spread</span>`,
    `<span class="brain-coach-dna__badge brain-coach-dna__badge--strongest">Strongest: ${esc(strongestLabel)}</span>`,
  ].join('')

  const numbers = [
    ['Memories', num(knowledge.totalMemories)],
    ['Themes', num(knowledge.uniqueTypes)],
    ['Evidence', num(knowledge.totalEvidence)],
    ['Links', num(knowledge.totalOntologyLinks)],
    ['Avg confidence', pct(knowledge.averageConfidence)],
    ['Avg weight', pct(knowledge.averageWeight)],
  ].map(([label, value]) =>
    `<li class="brain-coach-dna__number"><span class="brain-coach-dna__number-label">${esc(label)}</span><span class="brain-coach-dna__number-value">${esc(value)}</span></li>`).join('')

  const signalsBlock = signals.length
    ? `<ul class="brain-coach-dna__signals">${signals.map((s) =>
        `<li class="brain-coach-dna__signal"><span class="brain-coach-dna__signal-name">${esc(str(s.label) || str(s.category) || '—')}</span>`
        + `<span class="brain-coach-dna__signal-meta">${esc(pct(s.strength))} · ${esc(num(s.occurrences))}×</span></li>`).join('')}</ul>`
    : '<p class="brain-coach-dna__signals brain-coach-dna__signals--none">No coaching signals yet</p>'

  const themesBlock = themes.length
    ? `<ul class="brain-coach-dna__themes">${themes.map((t) =>
        `<li class="brain-coach-dna__theme"><span class="brain-coach-dna__theme-name">${esc(str(t.label) || str(t.type) || '—')}</span>`
        + `<span class="brain-coach-dna__theme-count">${esc(num(t.count))}</span></li>`).join('')}</ul>`
    : ''

  const summaryLine = summary ? `<p class="brain-coach-dna__summary">${esc(summary)}</p>` : ''

  return `<section class="brain-coach-dna" data-strongest="${esc(strongestCategory)}" data-confidence="${esc(confLevel)}">`
    + `<header class="brain-coach-dna__headline">${esc(headline)}</header>`
    + `<div class="brain-coach-dna__badges">${badges}</div>`
    + `<ul class="brain-coach-dna__numbers">${numbers}</ul>`
    + signalsBlock
    + themesBlock
    + summaryLine
    + '<p class="brain-coach-dna__note">Read-only — built from the coach\'s recorded memories.</p>'
    + '</section>'
}
