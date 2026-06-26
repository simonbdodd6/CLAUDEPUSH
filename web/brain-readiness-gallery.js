/**
 * web/brain-readiness-gallery.js — Readiness Coach View Preview Gallery (M226, DORMANT)
 *
 * Assemble one standalone HTML document that renders every readiness scenario for visual review:
 * the screen panels (M223 snapshots, which reuse M221 + M222), a print preview (M224), and a text
 * export (M225) — wrapped with a neutral, functional REFERENCE stylesheet so the existing class names
 * render legibly. This is a dev/QA artifact: it is NOT wired into the app, defines no product design,
 * and changes no engine, the coachView contract, the M221–M225 modules, index.html, runtime, or API.
 *
 * Pure and deterministic: fixed scenarios + static CSS, no DOM/network/storage/AI/clock/randomness.
 */

import { buildReadinessSnapshots, READINESS_SNAPSHOT_SCENARIOS } from './brain-readiness-snapshots.js' // M223 (→ M221+M222)
import { renderPrintableReadiness } from './brain-readiness-a11y-print.js'                              // M224
import { exportReadinessText } from './brain-readiness-export.js'                                       // M225
import { escapeHtml } from './brain-readiness-theme.js'                                                 // M222

const SCREEN_TITLES = Object.freeze({
  fullyReady: 'Fully ready',
  matchReady: 'Match ready',
  understrength: 'Understrength',
  noSquad: 'No squad',
  lowConfidence: 'Low confidence',
  warningHeavy: 'Warning-heavy',
  trendImproving: 'Trend improving',
  trendDeclining: 'Trend declining',
  trendUnavailable: 'Trend unavailable',
})

// Neutral, functional reference styling for the existing class names — grayscale + borders, no brand
// design. Provided so the preview is legible and as a starting point for the eventual Phase-1 CSS.
const REFERENCE_CSS = [
  ':root{color-scheme:light}*{box-sizing:border-box}',
  'body{font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;color:#111;background:#fff;margin:0;padding:24px;line-height:1.4}',
  'h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:32px 0 12px;border-bottom:1px solid #ccc;padding-bottom:4px}',
  '.gallery__note{color:#555;margin:0 0 8px;font-size:13px}',
  '.gallery__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}',
  '.gallery__item{border:1px solid #ddd;border-radius:8px;padding:12px;margin:0;background:#fafafa}',
  '.gallery__caption{font-weight:600;font-size:13px;margin-bottom:8px;color:#333}',
  '.gallery__pre{background:#f4f4f4;border:1px solid #ddd;padding:12px;overflow:auto;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}',
  '.brain-readiness{border:1px solid #ccc;border-radius:6px;padding:10px;background:#fff}',
  '.brain-readiness__headline{font-weight:600;margin-bottom:8px}',
  '.brain-readiness__numbers,.readiness-cards{list-style:none;padding:0;margin:8px 0;display:flex;flex-wrap:wrap;gap:6px}',
  '.brain-readiness__badge,.readiness-badge,.readiness-chip{display:inline-block;border:1px solid #999;border-radius:4px;padding:2px 6px;font-size:12px;margin:0 4px 4px 0;background:#eee}',
  '.readiness-card{border:1px solid #ccc;border-radius:4px;padding:6px 8px;min-width:64px;text-align:center}',
  '.readiness-card__value{display:block;font-weight:700;font-size:15px}.readiness-card__label{display:block;font-size:11px;color:#555}',
  '.readiness-table{border-collapse:collapse;width:100%;font-size:12px;margin-top:8px}',
  '.readiness-table th,.readiness-table td{border:1px solid #ccc;padding:4px 6px;text-align:left}',
  '.brain-readiness__warnings,.readiness-banner{list-style:none;padding:0;margin:8px 0;display:flex;flex-wrap:wrap;gap:4px}',
  '.brain-readiness__warning,.readiness-banner__chip{border:1px solid #c33;border-radius:4px;padding:1px 5px;font-size:11px}',
  '.readiness-print{border:2px solid #000;padding:12px}.readiness-print--high-contrast{color:#000;background:#fff}',
  '.readiness-print__section--avoid-break{break-inside:avoid;page-break-inside:avoid;margin-bottom:8px}',
  '.readiness-print__badge{border:1px solid #000;padding:2px 6px;margin-right:6px;font-family:ui-monospace,monospace}',
  '@media print{body{padding:0}.gallery__header,.gallery__grid,.gallery__pre,h2{display:none}.readiness-print{border:1px solid #000}}',
].join('')

/**
 * Build the complete standalone preview document (a single HTML string).
 * @returns {string}
 */
export function buildReadinessGalleryDocument() {
  const snaps = buildReadinessSnapshots()
  const figures = Object.keys(snaps).map((name) =>
    `<figure class="gallery__item"><figcaption class="gallery__caption">${escapeHtml(SCREEN_TITLES[name] || name)}</figcaption>${snaps[name]}</figure>`).join('')
  const printPreview = renderPrintableReadiness(READINESS_SNAPSHOT_SCENARIOS.warningHeavy)
  const textPreview = escapeHtml(exportReadinessText(READINESS_SNAPSHOT_SCENARIOS.matchReady))

  return '<!DOCTYPE html>\n'
    + '<html lang="en">\n<head>\n'
    + '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<title>Readiness Coach View — Reference Preview</title>\n'
    + `<style>${REFERENCE_CSS}</style>\n`
    + '</head>\n<body>\n'
    + '<header class="gallery__header"><h1>Readiness Coach View — Reference Preview</h1>'
    + '<p class="gallery__note">Dormant reference preview — not wired into the app, not a product design. The coach makes every selection.</p></header>\n'
    + '<main>\n'
    + `<section class="gallery"><h2>Screen panels</h2><div class="gallery__grid">${figures}</div></section>\n`
    + `<section class="gallery"><h2>Print preview (warning-heavy)</h2>${printPreview}</section>\n`
    + `<section class="gallery"><h2>Text export (match ready)</h2><pre class="gallery__pre">${textPreview}</pre></section>\n`
    + '</main>\n</body>\n</html>\n'
}
