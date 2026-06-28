/**
 * web/brain-coach-dna-docs.js - Coach DNA Documentation Pack (M237, DORMANT)
 *
 * A documentation generator for the COMPLETE Coach DNA publishing pipeline (M230-M236): the public M230
 * coachView contract, the M232/M233 rendering surfaces, the M234 snapshot generation, the M235 export
 * formats, and the M236 validator behaviour. It produces a deterministic, structured doc object (and a
 * Markdown rendering) including an ASCII architecture diagram. The validation summary is sourced LIVE from
 * the M236 validator so the numbers can never drift from reality.
 *
 * It documents the public contract ONLY - internal memory fields (raw ids, statements, evidence refs) are
 * rejected, never described. No recommendation language. Pure and deterministic: no DOM/network/storage/
 * AI/clock/randomness. It changes no engine, the M230 contract, the M230-M236 modules, index.html,
 * runtime, or API. This is documentation only - it wires nothing and renders no product surface.
 */

import { validateCoachDnaExports } from './brain-coach-dna-validator.js' // M236 (live validation summary)

// The public coachView contract (M230): the ONLY fields documented.

const PUBLIC_FIELDS = Object.freeze([
  { name: 'profileVersion', type: 'string | null', summary: 'Version tag of the Coach DNA profile (M114), or null when there is no profile yet.', renderedIn: ['identity panel (M233)'] },
  { name: 'confidence', type: '{ value: number 0..1, level: string, label: string }', summary: 'Overall profile confidence, derived from average signal strength.', renderedIn: ['panel badge (M232)', 'confidence gauge + indicators (M233)', 'text / clipboard (M235)'] },
  { name: 'headline', type: 'string', summary: 'One-line plain-language Coach DNA headline.', renderedIn: ['panel header (M232)', 'page hero (M233)', 'text (M235)'] },
  { name: 'identity', type: '{ strongestCategory, strongestLabel, weakestCategory, weakestLabel, diversityScore: number 0..1, diversityLabel }', summary: 'Coaching identity: strongest/weakest dimensions and how broadly the memories spread.', renderedIn: ['panel badges (M232)', 'identity + development panels (M233)', 'text (M235)'] },
  { name: 'dominantSignals', type: '{ category, label, occurrences, strength: number 0..1, averageConfidence, averageWeight, supportingCount }[]', summary: 'Ranked coaching strengths. supportingCount is a COUNT only - raw memory ids are never exposed.', renderedIn: ['panel signals (M232)', 'strength bars (M233)', 'text (M235)'] },
  { name: 'themes', type: '{ type, label, count, averageConfidence: number 0..1, averageWeight: number 0..1 }[]', summary: 'Knowledge themes across coaching dimensions, with per-theme memory counts.', renderedIn: ['panel themes (M232)', 'knowledge themes panel (M233)', 'text (M235)'] },
  { name: 'knowledge', type: '{ totalMemories, uniqueTypes, averageConfidence, averageWeight, totalEvidence, totalOntologyLinks }', summary: 'Aggregate knowledge-base counts (counts and 0..1 averages only).', renderedIn: ['panel numbers (M232)', 'confidence + evidence panels (M233)', 'text (M235)'] },
  { name: 'summary', type: 'string | null', summary: 'Plain-language memory summary (M112), or null when there is nothing to summarise.', renderedIn: ['panel summary (M232)', 'memory summary panel (M233)', 'text (M235)'] },
  { name: 'metadata', type: '{ explainable: boolean, deterministic: boolean, llmGenerated: boolean }', summary: 'Provenance flags. llmGenerated is always false - this pipeline is fully deterministic.', renderedIn: ['validator contract check (M236)'] },
])

// Internal memory fields that must NEVER be documented as part of the public coachView contract.
const INTERNAL_FIELDS = Object.freeze(['supportingMemoryIds', 'evidenceRefs', 'ontologyLinks', 'statement', 'createdAt', 'coachId', 'sources', 'manifest'])

const COMPONENTS = Object.freeze([
  { milestone: 'M230', home: 'packages/coach-intelligence', module: 'coach-dna-coach-view', exports: ['buildCoachDnaCoachView'], purpose: 'Map the Coach Memory aggregates into the public coachView contract.' },
  { milestone: 'M231', home: 'packages/coach-intelligence', module: 'coach-dna-coach-view-sample', exports: ['buildCoachDnaCoachViewSample'], purpose: 'Deterministic live-contract sample coachView (real engine chain).' },
  { milestone: 'M232', home: 'web', module: 'brain-coach-dna-view', exports: ['renderCoachDnaCoachView'], purpose: 'Render the coachView into an escaped HTML panel fragment.' },
  { milestone: 'M233', home: 'web', module: 'brain-coach-dna-page', exports: ['buildCoachDnaPageDocument'], purpose: 'Render the complete premium standalone Coach DNA page.' },
  { milestone: 'M234', home: 'web', module: 'brain-coach-dna-snapshots', exports: ['renderCoachDnaSnapshot', 'buildCoachDnaSnapshots', 'COACH_DNA_SNAPSHOT_SCENARIOS'], purpose: 'Canonical deterministic snapshots across 5 scenarios.' },
  { milestone: 'M234', home: 'web', module: 'brain-coach-dna-gallery', exports: ['buildCoachDnaGalleryDocument'], purpose: 'Standalone preview gallery embedding every M233 page in a sandboxed iframe.' },
  { milestone: 'M235', home: 'web', module: 'brain-coach-dna-export', exports: ['buildCoachDnaExport', 'exportCoachDnaHtml', 'exportCoachDnaPage', 'exportCoachDnaText', 'exportCoachDnaClipboard'], purpose: 'HTML / page / text / clipboard export forms.' },
  { milestone: 'M236', home: 'web', module: 'brain-coach-dna-validator', exports: ['validateCoachDnaExports', 'validateCoachDnaContract'], purpose: 'Deterministic, read-only pre-publish validation report.' },
])

const RENDER_FLOW = Object.freeze(['coachView (M230 contract)', 'renderCoachDnaCoachView (M232)', 'reuses escapeHtml (M222)', 'escaped HTML panel fragment'])
const PAGE_FLOW = Object.freeze(['coachView', 'buildCoachDnaPageDocument (M233)', 'embeds the M232 panel + premium design system', 'standalone HTML page'])
const SNAPSHOT_FLOW = Object.freeze(['fixed coachView scenarios (M234)', 'renderCoachDnaSnapshot -> buildCoachDnaSnapshots', 'buildCoachDnaGalleryDocument embeds the M233 pages in sandboxed iframes', 'byte-stable snapshots + preview gallery'])
const EXPORT_FLOW = Object.freeze(['coachView', 'buildCoachDnaExport (M235)', '{ html: M232 panel, page: M233 document, text, clipboard }'])
const VALIDATION_FLOW = Object.freeze(['coachView + snapshots', 'validateCoachDnaExports (M236)', 'contract + html + page + text + clipboard + export + screen + gallery checks', 'deterministic PASS / FAIL report (no repair)'])

// Documentation-only ASCII architecture diagrams of the M230-M236 publishing pipeline.
const PIPELINE_DIAGRAM = [
  'Coach Memory aggregates  (M112 synthesis + M114 profile)',
  '        |',
  '        |  buildCoachDnaCoachView (M230)  /  sample: buildCoachDnaCoachViewSample (M231)',
  '        v',
  '   coachView   (public, deep-frozen, counts-only)',
  '        |',
  '        +--> renderCoachDnaCoachView (M232) .......... HTML panel fragment',
  '        |            |',
  '        |            +--> buildCoachDnaPageDocument (M233) ... premium standalone page',
  '        |',
  '        +--> buildCoachDnaSnapshots (M234) ........... byte-stable snapshots',
  '        |            |',
  '        |            +--> buildCoachDnaGalleryDocument (M234) ... preview gallery (iframes)',
  '        |',
  '        +--> buildCoachDnaExport (M235) ............. html | page | text | clipboard',
  '                     |',
  '                     v',
  '        validateCoachDnaExports (M236)  ->  PASS / FAIL gate  ->  publish decision',
].join('\n')

const DATA_BOUNDARY_DIAGRAM = [
  'Internal Coach Memory data',
  '  - raw memory ids',
  '  - statements',
  '  - evidence refs',
  '  - ontology links',
  '        |',
  '        |  M230 presenter maps to counts, labels, summaries, and provenance flags',
  '        v',
  'Public coachView contract',
  '  - no raw ids',
  '  - no evidence references',
  '  - no generated advice',
  '  - deterministic metadata',
  '        |',
  '        v',
  'M232-M236 render, export, snapshot, and validate the public contract only',
].join('\n')

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/**
 * Describe a single public coachView field. Internal memory fields and unknown names are rejected.
 * @param {string} name
 * @returns {{ name, type, summary, renderedIn }}
 */
export function describeField(name) {
  if (typeof name !== 'string') throw new TypeError('describeField requires a field name string')
  if (INTERNAL_FIELDS.includes(name)) throw new RangeError(`'${name}' is an internal memory field and is not part of the public coachView contract`)
  const field = PUBLIC_FIELDS.find((f) => f.name === name)
  if (!field) throw new RangeError(`unknown coachView field '${name}'`)
  return field
}

/** Build the structured documentation object (deterministic, frozen). */
export function buildCoachDnaDocs() {
  const v = validateCoachDnaExports()
  const aspects = [...new Set(v.checks.map((c) => c.aspect))].sort()
  return deepFreeze({
    title: 'Coach DNA - Contract & Publishing Pipeline Reference',
    contractFields: PUBLIC_FIELDS.map((f) => ({ ...f, renderedIn: [...f.renderedIn] })),
    components: COMPONENTS.map((c) => ({ ...c, exports: [...c.exports] })),
    pipeline: {
      render: [...RENDER_FLOW],
      page: [...PAGE_FLOW],
      snapshot: [...SNAPSHOT_FLOW],
      export: [...EXPORT_FLOW],
      validation: [...VALIDATION_FLOW],
    },
    architectureDiagrams: {
      pipeline: PIPELINE_DIAGRAM,
      dataBoundary: DATA_BOUNDARY_DIAGRAM,
    },
    validation: { totalChecks: v.totalChecks, aspects, allPass: v.pass },
    note: 'Documents the public coachView contract only - internal memory fields are never described. Read-only: the coach makes every decision.',
  })
}

// Markdown rendering (deterministic).

const mdCell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ')

function mdTable(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`),
  ].join('\n')
}

/** Render the documentation as a deterministic Markdown string. */
export function renderCoachDnaDocsMarkdown() {
  const docs = buildCoachDnaDocs()
  const lines = []
  lines.push(`# ${docs.title}`, '')

  lines.push('## Contract field reference', '')
  lines.push(mdTable(['Field', 'Type', 'Summary', 'Rendered in'], docs.contractFields.map((f) => [f.name, f.type, f.summary, f.renderedIn.join('; ')])), '')

  lines.push('## Component map', '')
  lines.push(mdTable(['Milestone', 'Module', 'Exports', 'Purpose'], docs.components.map((c) => [c.milestone, `${c.home}/${c.module}`, c.exports.join(', '), c.purpose])), '')

  lines.push('## Rendering pipeline', '')
  lines.push('- Panel: ' + docs.pipeline.render.join(' -> '))
  lines.push('- Page: ' + docs.pipeline.page.join(' -> '), '')

  lines.push('## Snapshot generation', '')
  lines.push(docs.pipeline.snapshot.join(' -> '), '')

  lines.push('## Export formats', '')
  lines.push(docs.pipeline.export.join(' -> '), '')

  lines.push('## Validator behaviour', '')
  lines.push(docs.pipeline.validation.join(' -> '), '')
  lines.push(`- Total checks: ${docs.validation.totalChecks}`)
  lines.push(`- Aspects: ${docs.validation.aspects.join(', ')}`)
  lines.push(`- All pass: ${docs.validation.allPass}`, '')

  lines.push('## Architecture diagrams', '')
  lines.push('### Pipeline', '')
  lines.push('```', docs.architectureDiagrams.pipeline, '```', '')
  lines.push('### Data boundary', '')
  lines.push('```', docs.architectureDiagrams.dataBoundary, '```', '')

  lines.push(`> ${docs.note}`, '')
  return lines.join('\n')
}
