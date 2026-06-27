/**
 * web/brain-coach-dna-gallery.js — Coach DNA Snapshot Gallery (M234, DORMANT)
 *
 * Assemble ONE standalone HTML document that presents the Coach DNA visual experience across every
 * representative coachView scenario — the Coach Memory analogue of the readiness M226 gallery. It REUSES
 * the M233 page builder verbatim: each scenario is rendered by `buildCoachDnaPageDocument` and embedded,
 * fully self-contained, inside a sandboxed `<iframe srcdoc>` so every snapshot carries the real premium
 * design system with no CSS duplication and no change to M232/M233. The gallery shell adds only neutral
 * scaffolding chrome (a dark grid + captions); it defines no Coach DNA design and no new class vocabulary.
 *
 * This is a dev/QA artifact: NOT wired into the app, defines no product surface, and changes no engine,
 * the M230 contract, the M232/M233 modules, the M234 snapshots, index.html, runtime, or API. Pure and
 * deterministic: fixed scenarios + static chrome, all embedded HTML escaped, no DOM/network/storage/AI/
 * clock/randomness.
 */

import { COACH_DNA_SNAPSHOT_SCENARIOS } from './brain-coach-dna-snapshots.js'  // M234 scenarios (reused)
import { buildCoachDnaPageDocument } from './brain-coach-dna-page.js'           // M233 page builder (reused)
import { escapeHtml } from './brain-readiness-theme.js'                         // M222 shared HTML helper (reused)

const SCENARIO_TITLES = Object.freeze({
  selectionLed: 'Selection-led — high confidence',
  philosophyLed: 'Philosophy-led — medium confidence',
  developing: 'Developing profile — low confidence',
  broadVeteran: 'Broad veteran — full coverage',
  empty: 'No profile yet — empty state',
})

// Neutral scaffolding chrome for the gallery shell only — it frames the embedded M233 pages, it does not
// style them (each iframe brings its own complete design system). No Coach DNA design lives here.
const GALLERY_CSS = [
  ':root{color-scheme:dark}*{box-sizing:border-box}',
  'body{margin:0;font-family:-apple-system,system-ui,"Segoe UI",Roboto,sans-serif;color:#eef2ff;line-height:1.5;',
  'background:linear-gradient(160deg,#0a0e1a 0%,#0b1020 55%,#080b14 100%);min-height:100vh;padding:44px 24px}',
  '.cdna-gallery{max-width:1320px;margin:0 auto}',
  '.cdna-gallery__eyebrow{font-size:12px;letter-spacing:.32em;text-transform:uppercase;color:#e9c46a;margin:0 0 8px;font-weight:600}',
  '.cdna-gallery__title{font-size:27px;font-weight:700;margin:0 0 6px;letter-spacing:-.01em}',
  '.cdna-gallery__note{color:#9aa6c3;font-size:14px;margin:0 0 28px;max-width:64ch}',
  '.cdna-gallery__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:22px}',
  '.cdna-gallery__item{margin:0;border:1px solid rgba(255,255,255,.10);border-radius:18px;overflow:hidden;',
  'background:rgba(255,255,255,.045);box-shadow:0 22px 54px -30px rgba(0,0,0,.85)}',
  '.cdna-gallery__caption{font-size:13px;font-weight:600;letter-spacing:.03em;padding:13px 16px;color:#cdd7f5;',
  'border-bottom:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04)}',
  '.cdna-gallery__frame{display:block;width:100%;height:1180px;border:0;background:#0a0e1a}',
  '.cdna-gallery__footer{margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,.10);color:#6b7799;font-size:12px}',
  '@media(max-width:760px){.cdna-gallery__frame{height:1480px}}',
].join('')

/**
 * Build the complete standalone Coach DNA snapshot gallery document (a single HTML string).
 * @returns {string}  a self-contained `<!DOCTYPE html>…</html>` document
 */
export function buildCoachDnaGalleryDocument() {
  const items = Object.keys(COACH_DNA_SNAPSHOT_SCENARIOS).map((name) => {
    const title = SCENARIO_TITLES[name] || name
    const page = buildCoachDnaPageDocument(COACH_DNA_SNAPSHOT_SCENARIOS[name])  // M233, reused verbatim
    return `<figure class="cdna-gallery__item">`
      + `<figcaption class="cdna-gallery__caption">${escapeHtml(title)}</figcaption>`
      + `<iframe class="cdna-gallery__frame" title="${escapeHtml(title)}" loading="lazy" sandbox`
      + ` srcdoc="${escapeHtml(page)}"></iframe>`
      + '</figure>'
  }).join('')

  return '<!DOCTYPE html>\n'
    + '<html lang="en">\n<head>\n'
    + '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<title>Coach DNA — Snapshot Gallery</title>\n'
    + `<style>${GALLERY_CSS}</style>\n`
    + '</head>\n<body>\n'
    + '<div class="cdna-gallery">\n'
    + '<header><p class="cdna-gallery__eyebrow">Coach DNA</p>'
    + '<h1 class="cdna-gallery__title">Snapshot gallery</h1>'
    + '<p class="cdna-gallery__note">Dormant reference preview — deterministic Coach DNA pages across representative '
    + 'coachView inputs, each rendered by the live M233 page builder. Not wired into the app and not a product surface. '
    + 'Read-only — the coach makes every decision.</p></header>\n'
    + `<main class="cdna-gallery__grid">${items}</main>\n`
    + '<footer class="cdna-gallery__footer">Read-only — built only from each coach\'s recorded memories. No selection is made here.</footer>\n'
    + '</div>\n</body>\n</html>\n'
}
