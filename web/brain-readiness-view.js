/**
 * web/brain-readiness-view.js — Readiness Coach View Renderer (M221, DORMANT)
 *
 * A pure, deterministic renderer that turns an M217 `coachView` into a self-contained HTML fragment for
 * the future Phase-1 premium readiness panel. It is NOT yet inlined into index.html — it is built and
 * tested in isolation (against the M219 sample) so it can be dropped into the correct branch's
 * front-end later, behind the feature flag.
 *
 * It only reads the coachView, escapes all interpolated values (no XSS), recommends no selection, and
 * has no side effects (no DOM, network, storage, AI, clock, or randomness). Same input → same output.
 * Importing this module changes nothing in production — `index.html` is untouched.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESCAPES[c])

const GATE_CLASS = Object.freeze({ PASS: 'pass', WARN: 'warn', FAIL: 'fail', UNVALIDATED: 'unvalidated' })

/**
 * Render a coachView (M217) into an HTML string for the readiness panel.
 *
 * @param {object} coachView  an M217 coachView (e.g. from the draft endpoint or buildReadinessCoachViewSample)
 * @returns {string}  a self-contained `<section class="brain-readiness">…</section>` fragment
 */
export function renderReadinessCoachView(coachView) {
  if (!isObj(coachView)) throw new TypeError('renderReadinessCoachView requires a coachView object')

  const status = typeof coachView.status === 'string' ? coachView.status : 'UNKNOWN'
  const confidence = typeof coachView.confidence === 'string' ? coachView.confidence : 'UNKNOWN'
  const gate = isObj(coachView.gate) ? coachView.gate : {}
  const gateStatus = typeof gate.status === 'string' ? gate.status : 'UNVALIDATED'
  const headline = typeof coachView.headline === 'string' && coachView.headline ? coachView.headline : 'Readiness unavailable'
  const kn = isObj(coachView.keyNumbers) ? coachView.keyNumbers : {}
  const warnings = Array.isArray(coachView.warnings) ? coachView.warnings.filter((w) => typeof w === 'string') : []
  const pr = isObj(coachView.playerReadiness) ? coachView.playerReadiness : {}
  const squad = isObj(coachView.squad) ? coachView.squad : null
  const trend = isObj(coachView.trend) ? coachView.trend : null

  const badges = [
    `<span class="brain-readiness__badge brain-readiness__badge--status">${esc(status)}</span>`,
    `<span class="brain-readiness__badge brain-readiness__badge--confidence">Confidence: ${esc(confidence)}</span>`,
    `<span class="brain-readiness__badge brain-readiness__badge--gate brain-readiness__badge--${esc(GATE_CLASS[gateStatus] || 'unvalidated')}">${esc(gateStatus)}</span>`,
  ].join('')

  const numbers = [
    ['Available', `${num(kn.available)}/${num(kn.total)}`],
    ['Injuries', num(kn.injuries)],
    ['Unavailable / suspended', num(kn.unavailableOrSuspended)],
    ['Limited training', num(kn.limitedTraining)],
    ['Missing info', num(kn.missing)],
  ].map(([label, value]) => `<li class="brain-readiness__number"><span class="brain-readiness__number-label">${esc(label)}</span><span class="brain-readiness__number-value">${esc(value)}</span></li>`).join('')

  const warningsBlock = warnings.length
    ? `<ul class="brain-readiness__warnings">${warnings.map((w) => `<li class="brain-readiness__warning">${esc(w)}</li>`).join('')}</ul>`
    : '<p class="brain-readiness__warnings brain-readiness__warnings--none">No warnings</p>'

  const players = `<p class="brain-readiness__players">${num(pr.count)} players · ${num(pr.withLimitingFactors)} with concerns · ${num(pr.withMissingInformation)} missing information</p>`

  const groups = squad && Array.isArray(squad.positionGroups) && squad.positionGroups.length
    ? `<ul class="brain-readiness__groups">${squad.positionGroups.map((g) => `<li class="brain-readiness__group"><span class="brain-readiness__group-name">${esc(isObj(g) ? g.group : '')}</span><span class="brain-readiness__group-count">${num(isObj(g) ? g.available : 0)}/${num(isObj(g) ? g.total : 0)}</span></li>`).join('')}</ul>`
    : ''

  const trendLine = trend && trend.comparable === true
    ? `<p class="brain-readiness__trend" data-direction="${esc(trend.direction || '')}">Trend: ${esc(String(trend.direction || '').toLowerCase())}</p>`
    : ''

  return `<section class="brain-readiness" data-status="${esc(status)}" data-gate="${esc(gateStatus)}">`
    + `<header class="brain-readiness__headline">${esc(headline)}</header>`
    + `<div class="brain-readiness__badges">${badges}</div>`
    + `<ul class="brain-readiness__numbers">${numbers}</ul>`
    + warningsBlock
    + players
    + groups
    + trendLine
    + '<p class="brain-readiness__note">Draft for review — the coach makes every selection.</p>'
    + '</section>'
}
