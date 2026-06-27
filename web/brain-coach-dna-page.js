/**
 * web/brain-coach-dna-page.js — Coach DNA Visual Experience Page (M233, DORMANT)
 *
 * The first COMPLETE, premium, cinematic Coach DNA page: a pure, deterministic builder that wraps an
 * M230 `coachView` into one self-contained HTML document. It is the Coach Memory analogue of the
 * readiness M226 gallery, but instead of a neutral grey reference sheet it presents the coach's DNA as a
 * designed dashboard — while still reusing the EXISTING Brain visual language (the same `brain-coach-dna__*`
 * block/element names and the M232 renderer for the at-a-glance card, the same shared M222 `escapeHtml`
 * utility, the same read-only closing note). No new contract, engine, or aesthetic vocabulary is invented;
 * the page only re-skins and composes what M230–M232 already expose.
 *
 * Every section is built ONLY from the public coachView contract (e.g. a supporting-memory COUNT, never
 * raw ids). It reads the coachView, escapes all interpolated values (no XSS), invents no philosophy,
 * recommends nothing, and has no side effects (no DOM, network, storage, AI, clock, or randomness).
 * Same input → same output. Importing this module changes nothing in production — `index.html` is untouched.
 */

import { escapeHtml as esc } from './brain-readiness-theme.js'      // M222 shared HTML helper (reused)
import { renderCoachDnaCoachView } from './brain-coach-dna-view.js' // M232 panel renderer (reused verbatim)

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const arr = (v) => (Array.isArray(v) ? v : [])
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const str = (v) => (typeof v === 'string' ? v : '')
const clamp01 = (x) => Math.min(1, Math.max(0, x))
const pctNum = (v) => Math.round(clamp01(num(v)) * 100)   // 0..100 integer (safe for CSS + text)
const pct = (v) => `${pctNum(v)}%`

/** Slug a value into a CSS-class-safe variant token (deterministic) — mirrors the M222/M232 helper. */
const variant = (v) => {
  const s = String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || 'unknown'
}

const P = 'brain-coach-dna-page'   // page-level BEM block; the panel keeps its M232 `brain-coach-dna` block

// ── premium, cinematic design system for the EXISTING Brain class names ──────────────────────────────
// Dark "match-night" palette, glass panels, a conic confidence ring and gradient strength bars. It skins
// the reused .brain-coach-dna__* fragment AND the page blocks; it defines no new class vocabulary.
const PAGE_CSS = [
  ':root{color-scheme:dark;',
  '--cdna-ink:#eef2ff;--cdna-muted:#9aa6c3;--cdna-faint:#6b7799;',
  '--cdna-line:rgba(255,255,255,.10);--cdna-card:rgba(255,255,255,.045);--cdna-card-2:rgba(255,255,255,.07);',
  '--cdna-gold:#e9c46a;--cdna-emerald:#34d399;--cdna-amber:#f5a524;--cdna-sky:#60a5fa;--cdna-rose:#fb7185;--cdna-track:rgba(255,255,255,.08)}',
  '*{box-sizing:border-box}',
  `body{margin:0;font-family:-apple-system,system-ui,"Segoe UI",Roboto,sans-serif;color:var(--cdna-ink);line-height:1.5;`,
  'background:radial-gradient(1200px 800px at 78% -10%,#15233f 0%,rgba(21,35,63,0) 60%),radial-gradient(1000px 700px at 0% 110%,#1a1330 0%,rgba(26,19,48,0) 55%),linear-gradient(160deg,#0a0e1a 0%,#0b1020 55%,#080b14 100%);background-attachment:fixed;min-height:100vh;-webkit-font-smoothing:antialiased}',
  `.${P}{max-width:1080px;margin:0 auto;padding:48px 24px 64px}`,
  // ── hero ──
  `.${P}__hero{position:relative;display:grid;grid-template-columns:1fr auto;gap:28px;align-items:center;padding:34px 34px 30px;border:1px solid var(--cdna-line);border-radius:22px;`,
  'background:linear-gradient(135deg,rgba(233,196,106,.10),rgba(96,165,250,.06) 45%,rgba(52,211,153,.07));box-shadow:0 24px 60px -28px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.06);overflow:hidden}',
  `.${P}__eyebrow{font-size:12px;letter-spacing:.32em;text-transform:uppercase;color:var(--cdna-gold);margin:0 0 12px;font-weight:600}`,
  `.${P}__title{font-size:30px;line-height:1.18;margin:0 0 6px;font-weight:700;letter-spacing:-.01em;`,
  'background:linear-gradient(90deg,#fff,#cdd7f5 60%,#9aa6c3);-webkit-background-clip:text;background-clip:text;color:transparent;max-width:40ch}',
  `.${P}__subtitle{margin:10px 0 0;color:var(--cdna-muted);font-size:14px;max-width:48ch}`,
  // ── confidence ring ──
  `.${P}__gauge{width:138px;height:138px;border-radius:50%;display:grid;place-items:center;flex:none;`,
  'background:conic-gradient(var(--cdna-gold) calc(var(--cdna-conf,0)*1%),var(--cdna-track) 0);box-shadow:0 0 0 1px var(--cdna-line),0 18px 40px -20px rgba(233,196,106,.5)}',
  `.${P}__gauge-inner{width:108px;height:108px;border-radius:50%;overflow:hidden;display:grid;place-items:center;text-align:center;background:radial-gradient(circle at 50% 35%,#141b2e,#0b1020)}`,
  `.${P}__gauge-value{font-size:27px;font-weight:700;letter-spacing:-.02em}`,
  `.${P}__gauge-label{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--cdna-muted);margin-top:3px}`,
  // ── badges ──
  `.${P}__badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}`,
  `.${P}__badge{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid var(--cdna-line);background:var(--cdna-card-2);color:var(--cdna-ink)}`,
  `.${P}__badge::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--cdna-faint)}`,
  `.${P}__badge--high::before{background:var(--cdna-emerald)}.${P}__badge--medium::before{background:var(--cdna-gold)}.${P}__badge--low::before,.${P}__badge--unknown::before{background:var(--cdna-rose)}`,
  // ── grid + panels ──
  `.${P}__grid{display:grid;grid-template-columns:repeat(12,1fr);gap:18px;margin-top:22px}`,
  `.${P}__panel{grid-column:span 6;padding:22px 22px 20px;border:1px solid var(--cdna-line);border-radius:18px;background:var(--cdna-card);backdrop-filter:blur(6px);box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}`,
  `.${P}__panel--wide{grid-column:span 12}.${P}__panel--third{grid-column:span 4}`,
  `.${P}__panel-title{display:flex;align-items:center;gap:10px;margin:0 0 14px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--cdna-muted);font-weight:600}`,
  `.${P}__panel-title::before{content:"";width:18px;height:2px;border-radius:2px;background:var(--cdna-gold)}`,
  `.${P}__lead{font-size:19px;font-weight:600;margin:0 0 4px;letter-spacing:-.01em}`,
  `.${P}__hint{margin:6px 0 0;font-size:12px;color:var(--cdna-faint)}`,
  // identity dl
  `.${P}__facts{margin:0;display:grid;grid-template-columns:1fr 1fr;gap:14px 18px}`,
  `.${P}__fact-label{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--cdna-faint)}`,
  `.${P}__fact-value{font-size:17px;font-weight:600;margin-top:3px}`,
  // strength bars
  `.${P}__bars{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:13px}`,
  `.${P}__bar-head{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;margin-bottom:6px}`,
  `.${P}__bar-name{font-weight:600}.${P}__bar-meta{color:var(--cdna-muted);font-size:12px;font-variant-numeric:tabular-nums}`,
  `.${P}__bar-track{height:8px;border-radius:99px;background:var(--cdna-track);overflow:hidden}`,
  `.${P}__bar-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--cdna-gold),var(--cdna-emerald))}`,
  // development chips
  `.${P}__dev{display:flex;flex-direction:column;gap:12px}`,
  `.${P}__dev-row{display:flex;align-items:center;gap:12px}`,
  `.${P}__dev-dot{width:9px;height:9px;border-radius:50%;background:var(--cdna-amber);flex:none;box-shadow:0 0 12px var(--cdna-amber)}`,
  // theme chips
  `.${P}__themes{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:9px}`,
  `.${P}__theme{display:inline-flex;align-items:center;gap:8px;padding:7px 8px 7px 13px;border-radius:999px;border:1px solid var(--cdna-line);background:var(--cdna-card-2);font-size:13px}`,
  `.${P}__theme-count{min-width:22px;height:22px;padding:0 6px;border-radius:999px;display:inline-grid;place-items:center;font-size:12px;font-weight:700;background:rgba(96,165,250,.18);color:var(--cdna-sky)}`,
  // evidence tiles
  `.${P}__tiles{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,1fr);gap:14px}`,
  `.${P}__tile{padding:16px 14px;border:1px solid var(--cdna-line);border-radius:14px;background:var(--cdna-card-2);text-align:center}`,
  `.${P}__tile-value{font-size:26px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}`,
  `.${P}__tile-label{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--cdna-muted);margin-top:4px}`,
  // summary quote
  `.${P}__quote{margin:0;font-size:18px;line-height:1.55;color:#dde4fb;font-style:italic;position:relative;padding-left:18px;border-left:2px solid var(--cdna-gold)}`,
  // at-a-glance: skin the reused M232 fragment as a glass card
  `.${P}__panel .brain-coach-dna{margin:0}`,
  '.brain-coach-dna__headline{font-size:16px;font-weight:600;margin:0 0 12px}',
  '.brain-coach-dna__badges{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}',
  `.brain-coach-dna__badge{display:inline-block;padding:5px 11px;border-radius:999px;font-size:12px;border:1px solid var(--cdna-line);background:var(--cdna-card-2)}`,
  '.brain-coach-dna__badge--high{border-color:rgba(52,211,153,.4)}.brain-coach-dna__badge--medium{border-color:rgba(233,196,106,.4)}.brain-coach-dna__badge--low{border-color:rgba(251,113,133,.4)}',
  '.brain-coach-dna__numbers,.brain-coach-dna__signals,.brain-coach-dna__themes{list-style:none;padding:0;margin:0 0 12px}',
  '.brain-coach-dna__numbers{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}',
  `.brain-coach-dna__number{display:flex;flex-direction:column;padding:9px 10px;border:1px solid var(--cdna-line);border-radius:10px;background:var(--cdna-card)}`,
  '.brain-coach-dna__number-label{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--cdna-faint)}',
  '.brain-coach-dna__number-value{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums}',
  '.brain-coach-dna__signal,.brain-coach-dna__theme{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--cdna-line);font-size:13px}',
  '.brain-coach-dna__signal-meta,.brain-coach-dna__theme-count{color:var(--cdna-muted);font-variant-numeric:tabular-nums}',
  '.brain-coach-dna__summary{margin:10px 0 0;color:var(--cdna-muted);font-size:13px}',
  '.brain-coach-dna__note,.brain-coach-dna__signals--none{color:var(--cdna-faint);font-size:12px;margin:12px 0 0}',
  // footer
  `.${P}__footer{margin-top:30px;padding-top:18px;border-top:1px solid var(--cdna-line);color:var(--cdna-faint);font-size:12px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}`,
  // responsive + print
  `@media(max-width:760px){.${P}__hero{grid-template-columns:1fr}.${P}__panel,.${P}__panel--third{grid-column:span 12}.${P}__tiles{grid-template-columns:repeat(2,1fr)}.brain-coach-dna__numbers{grid-template-columns:repeat(2,1fr)}}`,
  '@media print{body{background:#fff;color:#000}*{box-shadow:none!important}}',
].join('')

// ── panel builders (each reads ONLY public coachView fields) ─────────────────────────────────────────

function heroBlock(coachView, confLevel, confLabel, identity) {
  const headline = str(coachView.headline) || 'Coach DNA unavailable'
  const confPct = pctNum(isObj(coachView.confidence) ? coachView.confidence.value : 0)
  const badges = [
    `<span class="${P}__badge ${P}__badge--${esc(variant(confLevel))}">${esc(confLabel)} confidence</span>`,
    `<span class="${P}__badge">${esc(str(identity.diversityLabel) || '—')} spread</span>`,
    `<span class="${P}__badge">Strongest · ${esc(str(identity.strongestLabel) || '—')}</span>`,
  ].join('')
  return `<header class="${P}__hero">`
    + `<div class="${P}__hero-text">`
    + `<p class="${P}__eyebrow">Coach DNA</p>`
    + `<h1 class="${P}__title">${esc(headline)}</h1>`
    + `<p class="${P}__subtitle">A read-only portrait of this coach, built only from their recorded coaching memories.</p>`
    + `<div class="${P}__badges">${badges}</div>`
    + '</div>'
    + `<div class="${P}__gauge" style="--cdna-conf:${confPct}" role="img" aria-label="Confidence ${esc(confLabel)}, ${confPct} percent">`
    + `<div class="${P}__gauge-inner"><div class="${P}__gauge-value">${confPct}%</div>`
    + `<div class="${P}__gauge-label">Confidence</div></div></div>`
    + '</header>'
}

function panel(title, body, mod) {
  const cls = mod ? `${P}__panel ${P}__panel--${mod}` : `${P}__panel`
  return `<section class="${cls}"><h2 class="${P}__panel-title">${esc(title)}</h2>${body}</section>`
}

function identityPanel(identity, profileVersion) {
  const facts = [
    ['Strongest dimension', str(identity.strongestLabel) || '—'],
    ['Coaching spread', str(identity.diversityLabel) || '—'],
    ['Least-evidenced', str(identity.weakestLabel) || '—'],
    ['Profile version', str(profileVersion) || '—'],
  ].map(([label, value]) =>
    `<div class="${P}__fact"><div class="${P}__fact-label">${esc(label)}</div><div class="${P}__fact-value">${esc(value)}</div></div>`).join('')
  return panel('Coach identity', `<dl class="${P}__facts">${facts}</dl>`, 'third')
}

function philosophyPanel(signals, themes) {
  const sig = signals.find((s) => str(s.category) === 'philosophy')
  const theme = themes.find((t) => str(t.type) === 'philosophy')
  let lead = 'No philosophy memories recorded yet'
  let hint = 'Philosophy emerges as the coach records how they want the team to play.'
  if (sig) {
    lead = `${str(sig.label) || 'Philosophy'} · ${pct(sig.strength)} of recorded signals`
    hint = `${num(sig.occurrences)} philosophy ${num(sig.occurrences) === 1 ? 'memory' : 'memories'}, ${pct(sig.averageConfidence)} average confidence. No wording is inferred.`
  } else if (theme) {
    lead = `${str(theme.label) || 'Philosophy'} · ${num(theme.count)} ${num(theme.count) === 1 ? 'memory' : 'memories'}`
    hint = 'Surfaced from recorded philosophy memories. No wording is inferred.'
  }
  return panel('Coaching philosophy', `<p class="${P}__lead">${esc(lead)}</p><p class="${P}__hint">${esc(hint)}</p>`, 'third')
}

function confidencePanel(confLabel, confValue, knowledge) {
  const lead = `${esc(confLabel)} confidence · ${pct(confValue)}`
  const facts = [
    ['Average confidence', pct(knowledge.averageConfidence)],
    ['Average weight', pct(knowledge.averageWeight)],
  ].map(([label, value]) =>
    `<div class="${P}__fact"><div class="${P}__fact-label">${esc(label)}</div><div class="${P}__fact-value">${esc(value)}</div></div>`).join('')
  return panel('Confidence indicators', `<p class="${P}__lead">${lead}</p><dl class="${P}__facts">${facts}</dl>`, 'third')
}

function strengthsPanel(signals) {
  if (!signals.length) {
    return panel('Coaching strengths', `<p class="${P}__hint">No coaching signals yet — add memories to reveal the coach's strengths.</p>`)
  }
  const bars = signals.map((s) =>
    `<li class="${P}__bar"><div class="${P}__bar-head">`
    + `<span class="${P}__bar-name">${esc(str(s.label) || str(s.category) || '—')}</span>`
    + `<span class="${P}__bar-meta">${esc(pct(s.strength))} · ${esc(num(s.occurrences))}× · ${esc(num(s.supportingCount))} evidence</span></div>`
    + `<div class="${P}__bar-track"><div class="${P}__bar-fill" style="width:${pctNum(s.strength)}%"></div></div></li>`).join('')
  return panel('Coaching strengths', `<ul class="${P}__bars">${bars}</ul>`)
}

function developmentPanel(identity) {
  const weakest = str(identity.weakestLabel)
  const spread = str(identity.diversityLabel) || '—'
  const rows = []
  rows.push([weakest ? `${weakest} is the least-evidenced dimension` : 'No clear development area yet',
    'Fewer recorded memories here than elsewhere — descriptive only, not a prompt to act.'])
  rows.push([`Coaching spread is ${spread.toLowerCase()}`,
    'Reflects how widely the recorded memories range across coaching dimensions.'])
  const body = `<div class="${P}__dev">` + rows.map(([lead, hint]) =>
    `<div class="${P}__dev-row"><span class="${P}__dev-dot"></span><div>`
    + `<div class="${P}__lead" style="font-size:16px">${esc(lead)}</div>`
    + `<p class="${P}__hint">${esc(hint)}</p></div></div>`).join('') + '</div>'
  return panel('Coaching development areas', body)
}

function themesPanel(themes) {
  if (!themes.length) {
    return panel('Knowledge themes', `<p class="${P}__hint">No themes recorded yet.</p>`, 'wide')
  }
  const chips = themes.map((t) =>
    `<li class="${P}__theme">${esc(str(t.label) || str(t.type) || '—')}`
    + `<span class="${P}__theme-count">${esc(num(t.count))}</span></li>`).join('')
  return panel('Knowledge themes', `<ul class="${P}__themes">${chips}</ul>`, 'wide')
}

function evidencePanel(knowledge) {
  const tiles = [
    ['Memories', num(knowledge.totalMemories)],
    ['Themes', num(knowledge.uniqueTypes)],
    ['Evidence refs', num(knowledge.totalEvidence)],
    ['Ontology links', num(knowledge.totalOntologyLinks)],
  ].map(([label, value]) =>
    `<li class="${P}__tile"><div class="${P}__tile-value">${esc(value)}</div><div class="${P}__tile-label">${esc(label)}</div></li>`).join('')
  return panel('Supporting evidence', `<ul class="${P}__tiles">${tiles}</ul>`, 'wide')
}

function summaryPanel(summary) {
  const body = summary
    ? `<blockquote class="${P}__quote">${esc(summary)}</blockquote>`
    : `<p class="${P}__hint">No memory summary yet — it appears once the coach records memories.</p>`
  return panel('Memory summary', body, 'wide')
}

/**
 * Build the complete, premium Coach DNA page document from a coachView.
 *
 * @param {object} coachView  an M230 coachView (e.g. from buildCoachDnaCoachViewSample)
 * @returns {string}  one self-contained `<!DOCTYPE html>…</html>` document string
 */
export function buildCoachDnaPageDocument(coachView) {
  if (!isObj(coachView)) throw new TypeError('buildCoachDnaPageDocument requires a coachView object')

  const confidence = isObj(coachView.confidence) ? coachView.confidence : {}
  const confLevel = str(confidence.level) || 'UNKNOWN'
  const confLabel = str(confidence.label) || confLevel
  const identity = isObj(coachView.identity) ? coachView.identity : {}
  const knowledge = isObj(coachView.knowledge) ? coachView.knowledge : {}
  const signals = arr(coachView.dominantSignals).filter(isObj)
  const themes = arr(coachView.themes).filter(isObj)
  const summary = str(coachView.summary)
  const strongestCategory = str(identity.strongestCategory)

  const atAGlance = panel('At a glance', renderCoachDnaCoachView(coachView), 'third')

  const main = `<main class="${P}__grid">`
    + identityPanel(identity, coachView.profileVersion)
    + philosophyPanel(signals, themes)
    + confidencePanel(confLabel, confidence.value, knowledge)
    + strengthsPanel(signals)
    + developmentPanel(identity)
    + summaryPanel(summary)
    + themesPanel(themes)
    + evidencePanel(knowledge)
    + atAGlance
    + '</main>'

  return '<!DOCTYPE html>\n'
    + '<html lang="en">\n<head>\n'
    + '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<title>Coach DNA</title>\n'
    + `<style>${PAGE_CSS}</style>\n`
    + '</head>\n<body>\n'
    + `<div class="${P}" data-strongest="${esc(strongestCategory)}" data-confidence="${esc(confLevel)}">\n`
    + heroBlock(coachView, confLevel, confLabel, identity) + '\n'
    + main + '\n'
    + `<footer class="${P}__footer">`
    + '<span>Read-only — built from the coach\'s recorded memories. No selection is made here.</span>'
    + '<span>Coach DNA · Brain</span>'
    + '</footer>\n'
    + '</div>\n</body>\n</html>\n'
}
