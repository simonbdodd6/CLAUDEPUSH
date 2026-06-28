/**
 * web/brain-coach-dna-release-checklist.js - Coach DNA Publishing Readiness Checklist (M238, DORMANT)
 *
 * A pure documentation/review manifest for the complete Coach DNA publishing pack. It assembles the
 * public contract documentation (M237), export validator result (M236), snapshot inventory (M234), and
 * fixed component map (M230-M237) into a deterministic checklist a human can review before any future
 * publish decision.
 *
 * It does not publish, repair, generate, persist, wire into production, touch index.html, call AI, use
 * DOM/network/storage/clock/randomness, or import Beta/Core. It only reads the dormant Brain web modules
 * already present in this worktree and returns frozen plain data or deterministic text.
 */

import { buildCoachDnaDocs, renderCoachDnaDocsMarkdown } from './brain-coach-dna-docs.js' // M237
import { validateCoachDnaExports } from './brain-coach-dna-validator.js'                 // M236
import { buildCoachDnaSnapshots, COACH_DNA_SNAPSHOT_SCENARIOS } from './brain-coach-dna-snapshots.js' // M234

const PUBLIC_FIELDS = Object.freeze(['profileVersion', 'confidence', 'headline', 'identity', 'dominantSignals', 'themes', 'knowledge', 'summary', 'metadata'])
const VALIDATION_ASPECTS = Object.freeze(['clipboard', 'contract', 'export', 'gallery', 'html', 'page', 'screen', 'text'])
const DOC_SECTIONS = Object.freeze(['Contract field reference', 'Component map', 'Rendering pipeline', 'Snapshot generation', 'Export formats', 'Validator behaviour', 'Architecture diagrams'])
const INTERNAL_TOKENS = Object.freeze(['supportingMemoryIds', 'evidenceRefs', 'ontologyLinks', 'statement', 'createdAt', 'coachId', 'sources', 'manifest'])
const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

const COMPONENTS = Object.freeze([
  { milestone: 'M230', artifact: 'packages/coach-intelligence/coach-dna-coach-view.js', role: 'public coachView contract' },
  { milestone: 'M231', artifact: 'packages/coach-intelligence/coach-dna-coach-view-sample.js', role: 'live deterministic sample' },
  { milestone: 'M232', artifact: 'web/brain-coach-dna-view.js', role: 'HTML panel renderer' },
  { milestone: 'M233', artifact: 'web/brain-coach-dna-page.js', role: 'standalone page renderer' },
  { milestone: 'M234', artifact: 'web/brain-coach-dna-snapshots.js', role: 'snapshot scenarios' },
  { milestone: 'M234', artifact: 'web/brain-coach-dna-gallery.js', role: 'snapshot gallery' },
  { milestone: 'M235', artifact: 'web/brain-coach-dna-export.js', role: 'export pack' },
  { milestone: 'M236', artifact: 'web/brain-coach-dna-validator.js', role: 'pre-publish validator' },
  { milestone: 'M237', artifact: 'web/brain-coach-dna-docs.js', role: 'documentation pack' },
])

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const uniqSorted = (items) => [...new Set(items)].sort()

function check(pass, id, summary, detail = null) {
  return { id, pass, summary, detail }
}

function listMissing(expected, actual) {
  const seen = new Set(actual)
  return expected.filter((x) => !seen.has(x))
}

function checkSafetyText(markdown) {
  const leaks = INTERNAL_TOKENS.filter((token) => markdown.includes(`| ${token} |`))
  if (leaks.length) return `internal contract rows present: ${leaks.join(', ')}`
  if (ADVICE_LANG.test(markdown)) return 'contains generated advice language'
  return null
}

function normalizeInputs(options) {
  const opts = isObj(options) ? options : {}
  const docs = isObj(opts.docs) ? opts.docs : buildCoachDnaDocs()
  const validation = isObj(opts.validation) ? opts.validation : validateCoachDnaExports()
  const markdown = typeof opts.markdown === 'string' ? opts.markdown : renderCoachDnaDocsMarkdown()
  const snapshots = isObj(opts.snapshots) ? opts.snapshots : buildCoachDnaSnapshots()
  const scenarios = isObj(opts.scenarios) ? opts.scenarios : COACH_DNA_SNAPSHOT_SCENARIOS
  return { docs, validation, markdown, snapshots, scenarios }
}

/**
 * Build the deterministic Coach DNA publishing readiness checklist.
 *
 * @param {object} [options] optional injected docs/validation/markdown/snapshots for tests.
 * @returns {Readonly<object>} frozen review manifest. It is not a publish action.
 */
export function buildCoachDnaReleaseChecklist(options = {}) {
  const { docs, validation, markdown, snapshots, scenarios } = normalizeInputs(options)
  const fieldNames = Array.isArray(docs.contractFields) ? docs.contractFields.map((f) => f.name) : []
  const docComponentMilestones = Array.isArray(docs.components) ? docs.components.map((c) => c.milestone) : []
  const validationAspects = Array.isArray(validation.checks) ? uniqSorted(validation.checks.map((c) => c.aspect)) : []
  const scenarioNames = Object.keys(scenarios).sort()
  const snapshotNames = Object.keys(snapshots).sort()
  const docSectionMissing = DOC_SECTIONS.filter((section) => !markdown.includes(`## ${section}`))
  const safetyIssue = checkSafetyText(markdown)

  const checks = [
    check(listMissing(PUBLIC_FIELDS, fieldNames).length === 0 && fieldNames.length === PUBLIC_FIELDS.length,
      'contract-fields', 'Every public M230 coachView field is documented exactly once.', { expected: [...PUBLIC_FIELDS], actual: [...fieldNames].sort() }),
    check(listMissing(['M230', 'M231', 'M232', 'M233', 'M234', 'M235', 'M236'], docComponentMilestones).length === 0,
      'component-map', 'M237 documents every M230-M236 component.', { milestones: uniqSorted(docComponentMilestones) }),
    check(validation.pass === true && validation.failedChecks === 0,
      'validator-pass', 'M236 export validator is passing.', { totalChecks: validation.totalChecks, failedChecks: validation.failedChecks }),
    check(listMissing(VALIDATION_ASPECTS, validationAspects).length === 0,
      'validator-aspects', 'Validator covers contract, render, export, snapshot, and gallery surfaces.', { aspects: validationAspects }),
    check(scenarioNames.length > 0 && listMissing(scenarioNames, snapshotNames).length === 0,
      'snapshots-present', 'Every canonical Coach DNA scenario has a rendered snapshot.', { scenarios: scenarioNames, snapshots: snapshotNames }),
    check(docSectionMissing.length === 0,
      'docs-sections', 'Documentation markdown contains the required review sections.', { missing: docSectionMissing }),
    check(typeof docs.architectureDiagrams?.pipeline === 'string' && typeof docs.architectureDiagrams?.dataBoundary === 'string',
      'architecture-diagrams', 'Documentation includes pipeline and data-boundary diagrams.', { diagrams: Object.keys(docs.architectureDiagrams || {}).sort() }),
    check(safetyIssue === null,
      'safety-language', 'Documentation exposes no internal contract rows and no generated advice language.', { issue: safetyIssue }),
  ]

  const failed = checks.filter((c) => !c.pass)
  return deepFreeze({
    type: 'coach-dna-publishing-readiness-checklist',
    schemaVersion: 1,
    status: failed.length === 0 ? 'ready-for-human-review' : 'needs-review',
    pass: failed.length === 0,
    componentCount: COMPONENTS.length,
    components: COMPONENTS.map((c) => ({ ...c })),
    checkCount: checks.length,
    passedChecks: checks.length - failed.length,
    failedChecks: failed.length,
    checks,
    validationSummary: {
      totalChecks: validation.totalChecks,
      failedChecks: validation.failedChecks,
      aspects: validationAspects,
    },
    docsSummary: {
      fieldCount: fieldNames.length,
      sectionCount: DOC_SECTIONS.length,
      sections: [...DOC_SECTIONS],
    },
    snapshotSummary: {
      scenarioCount: scenarioNames.length,
      snapshotCount: snapshotNames.length,
      scenarios: scenarioNames,
    },
    mismatchSummary: failed.map((c) => `${c.id}: ${c.summary}`),
  })
}

/**
 * Render a compact deterministic checklist summary for logs or PR notes.
 * @param {object} [options]
 * @returns {string}
 */
export function summarizeCoachDnaReleaseChecklist(options = {}) {
  const c = buildCoachDnaReleaseChecklist(options)
  return [
    `Coach DNA publishing checklist: ${c.status}`,
    `Checks: ${c.passedChecks}/${c.checkCount}`,
    `Components: ${c.componentCount}`,
    `Validator: ${c.validationSummary.totalChecks} checks, ${c.validationSummary.failedChecks} failed`,
    `Snapshots: ${c.snapshotSummary.snapshotCount}/${c.snapshotSummary.scenarioCount}`,
  ].join('\n')
}
