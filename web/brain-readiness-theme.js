/**
 * web/brain-readiness-theme.js — Readiness Coach View Theme Pack (M222, DORMANT)
 *
 * Reusable PRESENTATION HELPERS for the readiness coach view — status badges, a confidence chip, a
 * warning banner, key-number cards, a position-group table, and a trend badge — plus a shared HTML
 * escape utility. These are pure, deterministic, fully-escaped HTML-string builders a future Phase-1 UI
 * can compose from. They extend the M221 renderer's toolkit; they do NOT change the readiness engines,
 * the coachView contract, the M221 renderer, index.html, or any runtime/API behaviour.
 *
 * No DOM, network, storage, AI, clock, or randomness. Same input → same output. Malformed input is
 * handled safely (a labelled fallback fragment, never broken or unescaped HTML).
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/** Shared HTML helper utility — escape a value for safe interpolation. */
export function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESCAPES[c])
}

/** Slug a label into a CSS-class-safe variant token (deterministic). */
function variant(value) {
  const s = String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || 'unknown'
}

/** Reusable status badge (READY / FULLY_READY / MATCH_READY / UNDERSTRENGTH / NOT_READY / NO_SQUAD …). */
export function statusBadge(status) {
  const s = typeof status === 'string' && status.trim() ? status : 'UNKNOWN'
  return `<span class="readiness-badge readiness-badge--status readiness-badge--${variant(s)}">${escapeHtml(s)}</span>`
}

/** Confidence chip styling (HIGH / MEDIUM / LOW / NONE). */
export function confidenceChip(level) {
  const c = typeof level === 'string' && level.trim() ? level : 'UNKNOWN'
  return `<span class="readiness-chip readiness-chip--confidence readiness-chip--${variant(c)}">Confidence: ${escapeHtml(c)}</span>`
}

/** Warning banner — a row of warning chips, or a labelled "no warnings" banner. */
export function warningBanner(warnings) {
  const list = Array.isArray(warnings) ? warnings.filter((w) => typeof w === 'string' && w) : []
  if (!list.length) return '<div class="readiness-banner readiness-banner--ok">No warnings</div>'
  const chips = list.map((w) => `<span class="readiness-banner__chip readiness-banner__chip--${variant(w)}">${escapeHtml(w)}</span>`).join('')
  return `<div class="readiness-banner readiness-banner--warnings" data-count="${list.length}">${chips}</div>`
}

/** Key-number cards (available / injuries / unavailable / limited / missing). */
export function keyNumberCards(keyNumbers) {
  const kn = isObj(keyNumbers) ? keyNumbers : {}
  const cards = [
    ['Available', `${num(kn.available)}/${num(kn.total)}`, 'available'],
    ['Injuries', num(kn.injuries), 'injuries'],
    ['Unavailable / suspended', num(kn.unavailableOrSuspended), 'unavailable'],
    ['Limited training', num(kn.limitedTraining), 'limited'],
    ['Missing info', num(kn.missing), 'missing'],
  ]
  const body = cards.map(([label, value, key]) =>
    `<div class="readiness-card readiness-card--${key}"><span class="readiness-card__value">${escapeHtml(value)}</span><span class="readiness-card__label">${escapeHtml(label)}</span></div>`).join('')
  return `<div class="readiness-cards">${body}</div>`
}

/** Position-group table (group · available/total · injuries · out). */
export function positionGroupTable(positionGroups) {
  const groups = Array.isArray(positionGroups) ? positionGroups.filter(isObj) : []
  if (!groups.length) return '<table class="readiness-table readiness-table--empty"><tbody><tr><td>No position data</td></tr></tbody></table>'
  const rows = groups.map((g) =>
    `<tr class="readiness-table__row"><td class="readiness-table__group">${escapeHtml(g.group)}</td>`
    + `<td class="readiness-table__num">${num(g.available)}/${num(g.total)}</td>`
    + `<td class="readiness-table__num">${num(g.injuryConcern)}</td>`
    + `<td class="readiness-table__num">${num(g.unavailableOrSuspended)}</td></tr>`).join('')
  return '<table class="readiness-table"><thead><tr><th>Group</th><th>Avail</th><th>Inj</th><th>Out</th></tr></thead>'
    + `<tbody>${rows}</tbody></table>`
}

const TREND_ARROW = Object.freeze({ IMPROVING: '↑', DECLINING: '↓', STABLE: '→' })

/** Trend badge — only when the trend is comparable; otherwise an empty string. */
export function trendBadge(trend) {
  if (!isObj(trend) || trend.comparable !== true) return ''
  const dir = typeof trend.direction === 'string' && trend.direction.trim() ? trend.direction : 'STABLE'
  const arrow = TREND_ARROW[dir] || '→'
  const word = dir.charAt(0).toUpperCase() + dir.slice(1).toLowerCase()
  return `<span class="readiness-badge readiness-badge--trend readiness-badge--trend-${variant(dir)}">${escapeHtml(arrow)} ${escapeHtml(word)}</span>`
}
