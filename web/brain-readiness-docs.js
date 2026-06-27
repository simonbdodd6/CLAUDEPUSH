/**
 * web/brain-readiness-docs.js — Readiness Coach View Documentation Pack (M228, DORMANT)
 *
 * A documentation generator for the PUBLIC coachView contract and the M221–M227 rendering surfaces.
 * It produces a deterministic, structured doc object (and a Markdown rendering) covering: the field
 * reference, the component map, the render/export/accessibility flows, and a regression-validation
 * summary (sourced live from the M227 validator so the numbers can't drift).
 *
 * It documents the public contract ONLY — internal evidence-bundle fields are rejected, never described.
 * No recommendation/selection language. Pure and deterministic: no DOM/network/storage/AI/clock/random.
 * It changes no engine, the coachView contract, the M221–M227 modules, index.html, runtime, or API.
 */

import { validateReadinessRendering } from './brain-readiness-validator.js' // M227

// ── the public coachView contract (M217) — the ONLY fields documented ────────────────────

const PUBLIC_FIELDS = Object.freeze([
  { name: 'status', type: 'string (enum)', summary: 'Overall readiness status, e.g. MATCH_READY / UNDERSTRENGTH / NO_SQUAD.', renderedIn: ['panel status badge (M221)', 'status badge (M222)', 'spoken summary (M224)', 'text / clipboard (M225)'] },
  { name: 'confidence', type: 'string (enum)', summary: 'Confidence in the assessment: HIGH / MEDIUM / LOW / NONE.', renderedIn: ['panel confidence badge (M221)', 'confidence chip (M222)', 'spoken summary (M224)', 'text / clipboard (M225)'] },
  { name: 'gate', type: '{ status, reasons }', summary: 'Validation gate outcome (PASS / WARN / FAIL) and its reasons.', renderedIn: ['panel gate badge (M221)', 'print badge (M224)', 'text / clipboard (M225)'] },
  { name: 'headline', type: 'string', summary: 'One-line plain-language readiness headline.', renderedIn: ['panel header (M221)', 'text / clipboard (M225)'] },
  { name: 'keyNumbers', type: '{ total, available, injuries, unavailableOrSuspended, limitedTraining, missing }', summary: 'Squad availability counts.', renderedIn: ['key-number cards (M221/M222)', 'a11y + print (M224)', 'text (M225)'] },
  { name: 'warnings', type: 'string[]', summary: 'Readiness warning codes to review.', renderedIn: ['panel warnings (M221)', 'warning banner (M222)', 'accessible warning list (M224)', 'text (M225)'] },
  { name: 'playerReadiness', type: '{ count, withLimitingFactors, withMissingInformation }', summary: 'Per-player readiness rollup counts.', renderedIn: ['panel player line (M221)', 'text (M225)'] },
  { name: 'squad', type: '{ readinessLevel, confidence, positionGroups, summary } | null', summary: 'Squad-level readiness, incl. the position-group breakdown.', renderedIn: ['panel groups (M221)', 'position-group table (M222)', 'a11y + print (M224)', 'text (M225)'] },
  { name: 'trend', type: '{ direction, comparable, changes } | null', summary: 'Readiness trend vs the previous assessment (shown only when comparable).', renderedIn: ['panel trend line (M221)', 'trend badge (M222)', 'print badge (M224)'] },
])

// Internal evidence-bundle fields that must NEVER be documented as part of the coachView contract.
const INTERNAL_FIELDS = Object.freeze(['sources', 'manifest', 'components', 'schemaVersion', 'validation'])

const COMPONENTS = Object.freeze([
  { milestone: 'M221', module: 'brain-readiness-view', exports: ['renderReadinessCoachView'], purpose: 'Render the full coachView HTML panel.' },
  { milestone: 'M222', module: 'brain-readiness-theme', exports: ['escapeHtml', 'statusBadge', 'confidenceChip', 'warningBanner', 'keyNumberCards', 'positionGroupTable', 'trendBadge'], purpose: 'Reusable, escaped presentation helpers.' },
  { milestone: 'M223', module: 'brain-readiness-snapshots', exports: ['renderReadinessSnapshot', 'buildReadinessSnapshots', 'READINESS_SNAPSHOT_SCENARIOS'], purpose: 'Canonical deterministic HTML snapshots for 9 scenarios.' },
  { milestone: 'M224', module: 'brain-readiness-a11y-print', exports: ['renderAccessibleReadiness', 'renderPrintableReadiness'], purpose: 'Screen-reader/keyboard and print-friendly variants.' },
  { milestone: 'M225', module: 'brain-readiness-export', exports: ['buildReadinessExport', 'exportReadinessHtml', 'exportReadinessPrintableHtml', 'exportReadinessText', 'exportReadinessClipboard'], purpose: 'HTML / printable / text / clipboard export forms.' },
  { milestone: 'M226', module: 'brain-readiness-gallery', exports: ['buildReadinessGalleryDocument'], purpose: 'Standalone preview document of every scenario.' },
  { milestone: 'M227', module: 'brain-readiness-validator', exports: ['validateReadinessRendering'], purpose: 'Deterministic regression-validation report.' },
])

const RENDER_FLOW = Object.freeze(['coachView (M217 contract)', 'renderReadinessCoachView (M221)', 'composes theme helpers (M222)', 'escaped HTML panel'])
const EXPORT_FLOW = Object.freeze(['coachView', 'buildReadinessExport (M225)', '{ html: M221 panel, printableHtml: M224 print, text, clipboard }'])
const ACCESSIBILITY_FLOW = Object.freeze(['coachView', 'renderAccessibleReadiness (M224)', 'ARIA region + spoken status + accessible warnings (escaped via M222)', 'no interactive elements'])

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/**
 * Describe a single public coachView field. Internal bundle fields and unknown names are rejected.
 * @param {string} name
 * @returns {{ name, type, summary, renderedIn }}
 */
export function describeField(name) {
  if (typeof name !== 'string') throw new TypeError('describeField requires a field name string')
  if (INTERNAL_FIELDS.includes(name)) throw new RangeError(`'${name}' is an internal bundle field and is not part of the public coachView contract`)
  const field = PUBLIC_FIELDS.find((f) => f.name === name)
  if (!field) throw new RangeError(`unknown coachView field '${name}'`)
  return field
}

/** Build the structured documentation object (deterministic, frozen). */
export function buildReadinessDocs() {
  const v = validateReadinessRendering()
  const aspects = [...new Set(v.checks.map((c) => c.aspect))].sort()
  return deepFreeze({
    title: 'Readiness Coach View — Contract & Rendering Reference',
    contractFields: PUBLIC_FIELDS.map((f) => ({ ...f, renderedIn: [...f.renderedIn] })),
    components: COMPONENTS.map((c) => ({ ...c, exports: [...c.exports] })),
    renderFlow: [...RENDER_FLOW],
    exportFlow: [...EXPORT_FLOW],
    accessibilityFlow: [...ACCESSIBILITY_FLOW],
    regressionValidation: { totalChecks: v.totalChecks, aspects, allPass: v.pass },
    note: 'Documents the public coachView contract only. The coach makes every selection.',
  })
}

// ── Markdown rendering (deterministic) ───────────────────────────────────────────────────

const mdCell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ')

function mdTable(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`),
  ].join('\n')
}

/** Render the documentation as a deterministic Markdown string. */
export function renderReadinessDocsMarkdown() {
  const docs = buildReadinessDocs()
  const lines = []
  lines.push(`# ${docs.title}`, '')
  lines.push('## Field reference', '')
  lines.push(mdTable(['Field', 'Type', 'Summary', 'Rendered in'], docs.contractFields.map((f) => [f.name, f.type, f.summary, f.renderedIn.join('; ')])), '')
  lines.push('## Component map', '')
  lines.push(mdTable(['Milestone', 'Module', 'Exports', 'Purpose'], docs.components.map((c) => [c.milestone, c.module, c.exports.join(', '), c.purpose])), '')
  lines.push('## Render flow', '', docs.renderFlow.join(' → '), '')
  lines.push('## Export flow', '', docs.exportFlow.join(' → '), '')
  lines.push('## Accessibility flow', '', docs.accessibilityFlow.join(' → '), '')
  lines.push('## Regression validation summary', '')
  lines.push(`- Total checks: ${docs.regressionValidation.totalChecks}`)
  lines.push(`- Aspects: ${docs.regressionValidation.aspects.join(', ')}`)
  lines.push(`- All pass: ${docs.regressionValidation.allPass}`, '')
  lines.push(`> ${docs.note}`, '')
  return lines.join('\n')
}
