/**
 * web/brain-coach-dna-validator.js — Coach DNA Export Validator (M236, DORMANT)
 *
 * A pure, read-only validation layer that verifies every Coach DNA export and snapshot BEFORE it could be
 * published — the Coach Memory analogue of the readiness M227 regression validator, extended with an
 * explicit M230 contract-field check. For each scenario it validates:
 *   - contract  : every required M230 coachView field is present, correctly typed, and in range
 *   - html      : the M232 panel fragment has the required structure
 *   - page      : the M233 standalone page document is well-formed and script-free
 *   - text      : the M235 plain-text export carries every required section
 *   - clipboard : the M235 clipboard export is markup-free and trimmed
 *   - export    : the M235 pack is a frozen, self-consistent set of four string forms
 *   - screen    : the M234 snapshot matches the canonical baseline (regression detection)
 * plus one global `gallery` check that the M234 preview document is well-formed and complete.
 *
 * It produces a deterministic, timestamp-free report (PASS/FAIL, per-check pass + mismatch, totals). It
 * has NO repair logic — it only reports. It never mutates inputs, performs no writes, exposes no internal
 * bundle fields, calls no AI, and introduces no recommendation language. It changes no engine, the M230
 * contract, the M232–M235 modules, index.html, runtime, or API. No DOM, network, storage, clock, or
 * randomness — same input → same report.
 */

import { buildCoachDnaSnapshots, renderCoachDnaSnapshot, COACH_DNA_SNAPSHOT_SCENARIOS } from './brain-coach-dna-snapshots.js' // M234
import { buildCoachDnaGalleryDocument } from './brain-coach-dna-gallery.js'                                                   // M234
import {
  buildCoachDnaExport, exportCoachDnaHtml, exportCoachDnaPage, exportCoachDnaText, exportCoachDnaClipboard,
} from './brain-coach-dna-export.js'                                                                                          // M235

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isArr = Array.isArray
const isStr = (v) => typeof v === 'string'
const isStrOrNull = (v) => v === null || typeof v === 'string'
const isBool = (v) => typeof v === 'boolean'
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const rate = (v) => isNum(v) && v >= 0 && v <= 1     // a 0..1 proportion
const count = (v) => isNum(v) && v >= 0              // a non-negative tally

const INTERNAL_TOKENS = ['supportingMemoryIds', 'evidenceRefs', 'ontologyLinks', 'statement', 'createdAt', 'coachId']
const RECOMMEND_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i
const GALLERY_TITLES = ['Selection-led — high confidence', 'Philosophy-led — medium confidence', 'Developing profile — low confidence', 'Broad veteran — full coverage', 'No profile yet — empty state']

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function safetyIssue(text) {
  for (const t of INTERNAL_TOKENS) if (text.includes(t)) return `leaks internal field ${t}`
  if (RECOMMEND_LANG.test(text)) return 'contains recommendation language'
  return null
}

function firstDiffIndex(a, b) {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i
  return a.length === b.length ? -1 : n
}

// ── M230 contract-field validation (collects every issue; no repair) ─────────────────────

/** Collect every contract violation for a coachView (empty array ⇒ valid). */
function contractIssues(cv) {
  if (!isObj(cv)) return ['coachView is not an object']
  const issues = []
  const req = (cond, msg) => { if (!cond) issues.push(msg) }

  req(isStrOrNull(cv.profileVersion), 'profileVersion must be a string or null')
  req(isStr(cv.headline) && cv.headline.length > 0, 'headline must be a non-empty string')
  req(isStrOrNull(cv.summary), 'summary must be a string or null')

  if (!isObj(cv.confidence)) issues.push('confidence must be an object')
  else {
    req(rate(cv.confidence.value), 'confidence.value must be a number in 0..1')
    req(isStr(cv.confidence.level), 'confidence.level must be a string')
    req(isStr(cv.confidence.label), 'confidence.label must be a string')
  }

  if (!isObj(cv.identity)) issues.push('identity must be an object')
  else {
    req(isStrOrNull(cv.identity.strongestCategory), 'identity.strongestCategory must be a string or null')
    req(isStrOrNull(cv.identity.strongestLabel), 'identity.strongestLabel must be a string or null')
    req(isStrOrNull(cv.identity.weakestCategory), 'identity.weakestCategory must be a string or null')
    req(isStrOrNull(cv.identity.weakestLabel), 'identity.weakestLabel must be a string or null')
    req(rate(cv.identity.diversityScore), 'identity.diversityScore must be a number in 0..1')
    req(isStr(cv.identity.diversityLabel), 'identity.diversityLabel must be a string')
  }

  if (!isArr(cv.dominantSignals)) issues.push('dominantSignals must be an array')
  else cv.dominantSignals.forEach((s, i) => {
    if (!isObj(s)) { issues.push(`dominantSignals[${i}] must be an object`); return }
    req(isStrOrNull(s.category), `dominantSignals[${i}].category must be a string or null`)
    req(isStrOrNull(s.label), `dominantSignals[${i}].label must be a string or null`)
    req(count(s.occurrences), `dominantSignals[${i}].occurrences must be a number >= 0`)
    req(rate(s.strength), `dominantSignals[${i}].strength must be a number in 0..1`)
    req(rate(s.averageConfidence), `dominantSignals[${i}].averageConfidence must be a number in 0..1`)
    req(rate(s.averageWeight), `dominantSignals[${i}].averageWeight must be a number in 0..1`)
    req(count(s.supportingCount), `dominantSignals[${i}].supportingCount must be a number >= 0`)
  })

  if (!isArr(cv.themes)) issues.push('themes must be an array')
  else cv.themes.forEach((t, i) => {
    if (!isObj(t)) { issues.push(`themes[${i}] must be an object`); return }
    req(isStrOrNull(t.type), `themes[${i}].type must be a string or null`)
    req(isStrOrNull(t.label), `themes[${i}].label must be a string or null`)
    req(count(t.count), `themes[${i}].count must be a number >= 0`)
    req(rate(t.averageConfidence), `themes[${i}].averageConfidence must be a number in 0..1`)
    req(rate(t.averageWeight), `themes[${i}].averageWeight must be a number in 0..1`)
  })

  if (!isObj(cv.knowledge)) issues.push('knowledge must be an object')
  else {
    for (const f of ['totalMemories', 'uniqueTypes', 'totalEvidence', 'totalOntologyLinks']) {
      req(count(cv.knowledge[f]), `knowledge.${f} must be a number >= 0`)
    }
    req(rate(cv.knowledge.averageConfidence), 'knowledge.averageConfidence must be a number in 0..1')
    req(rate(cv.knowledge.averageWeight), 'knowledge.averageWeight must be a number in 0..1')
  }

  if (!isObj(cv.metadata)) issues.push('metadata must be an object')
  else for (const f of ['explainable', 'deterministic', 'llmGenerated']) {
    req(isBool(cv.metadata[f]), `metadata.${f} must be a boolean`)
  }

  return issues
}

/**
 * Validate a single coachView against the required M230 contract fields.
 * @param {object} coachView
 * @returns {Readonly<{ pass: boolean, issues: string[] }>}  deterministic; never throws.
 */
export function validateCoachDnaContract(coachView) {
  const issues = contractIssues(coachView)
  return deepFreeze({ pass: issues.length === 0, issues })
}

// ── per-aspect checks (return a mismatch string, or null when valid) ─────────────────────

function checkContract(cv) {
  const issues = contractIssues(cv)
  return issues.length ? (issues.length === 1 ? issues[0] : `${issues.length} contract issues; first: ${issues[0]}`) : null
}

function checkHtml(cv) {
  const html = exportCoachDnaHtml(cv)
  for (const marker of ['class="brain-coach-dna"', 'data-confidence=', 'brain-coach-dna__headline', 'brain-coach-dna__numbers', 'brain-coach-dna__note']) {
    if (!html.includes(marker)) return `missing structural marker ${marker}`
  }
  if (!html.endsWith('</section>')) return 'panel is not a closed <section>'
  return safetyIssue(html)
}

function checkPage(cv) {
  const doc = exportCoachDnaPage(cv)
  if (!doc.startsWith('<!DOCTYPE html>')) return 'page is not a standalone document'
  if (!doc.trimEnd().endsWith('</html>')) return 'page document is not closed'
  for (const marker of ['<style>', 'brain-coach-dna-page__hero', 'brain-coach-dna-page__grid', 'class="brain-coach-dna"']) {
    if (!doc.includes(marker)) return `missing structural marker ${marker}`
  }
  if (doc.includes('<script')) return 'page contains a script element'
  return safetyIssue(doc)
}

function checkText(cv) {
  const text = exportCoachDnaText(cv)
  for (const header of ['Coach DNA', 'Confidence:', 'Strongest:', 'Spread:', 'Coaching strengths:', 'Knowledge themes:', 'Knowledge base:', 'Memory summary:']) {
    if (!text.includes(header)) return `text export missing "${header}"`
  }
  return safetyIssue(text)
}

function checkClipboard(cv) {
  const clip = exportCoachDnaClipboard(cv)
  if (clip.includes('<')) return 'clipboard export contains markup'
  if (clip !== clip.trim()) return 'clipboard export is not trimmed'
  return safetyIssue(clip)
}

function checkExportPack(cv) {
  const pack = buildCoachDnaExport(cv)
  if (!Object.isFrozen(pack)) return 'export pack is not frozen'
  for (const k of ['html', 'page', 'text', 'clipboard']) {
    if (typeof pack[k] !== 'string') return `missing export form ${k}`
  }
  if (pack.html !== exportCoachDnaHtml(cv)) return 'html form inconsistent with exporter'
  if (pack.page !== exportCoachDnaPage(cv)) return 'page form inconsistent with exporter'
  if (pack.text !== exportCoachDnaText(cv)) return 'text form inconsistent with exporter'
  if (pack.clipboard !== exportCoachDnaClipboard(cv)) return 'clipboard form inconsistent with exporter'
  return null
}

function checkScreen(name, actual, expected) {
  if (!Object.prototype.hasOwnProperty.call(actual, name) || typeof actual[name] !== 'string') return 'missing rendered snapshot'
  if (actual[name] !== expected[name]) return `output differs from canonical snapshot at index ${firstDiffIndex(actual[name], expected[name])}`
  return safetyIssue(expected[name])
}

function checkGallery() {
  const doc = buildCoachDnaGalleryDocument()
  if (!doc.startsWith('<!DOCTYPE html>')) return 'gallery is not a standalone document'
  if (!doc.includes('<style>')) return 'gallery missing stylesheet'
  for (const title of GALLERY_TITLES) {
    if (!doc.includes(`>${title}</figcaption>`)) return `gallery missing scenario ${title}`
  }
  if (doc.includes('<script')) return 'gallery contains a live script element'
  return safetyIssue(doc)
}

// Run a check, converting any thrown error into a deterministic mismatch string (never throws).
function runCheck(fn) {
  try { return fn() } catch (e) { return `threw: ${e && e.message ? e.message : 'error'}` }
}

/**
 * Validate every Coach DNA export and snapshot against the M230 contract + structural invariants.
 *
 * @param {object} [options]
 * @param {Record<string,object>} [options.scenarios]  coachViews to validate (default: the canonical M234
 *   scenarios). Provide your own to gate a fresh set before publishing.
 * @param {Record<string,string>} [options.snapshots]  screen snapshots to regression-check against the
 *   canonical baseline (default: a fresh canonical build). Pass a tampered map to exercise detection.
 * @returns {Readonly<object>}  a deterministic, timestamp-free validation report.
 */
export function validateCoachDnaExports(options = {}) {
  const opts = isObj(options) ? options : {}
  const scenarios = isObj(opts.scenarios) ? opts.scenarios : COACH_DNA_SNAPSHOT_SCENARIOS
  const expectedSnaps = buildCoachDnaSnapshots()                              // canonical baseline
  const actualSnaps = isObj(opts.snapshots) ? opts.snapshots : expectedSnaps

  const checks = []
  for (const name of Object.keys(scenarios)) {
    const cv = scenarios[name]
    checks.push({ snapshot: name, aspect: 'contract', mismatch: runCheck(() => checkContract(cv)) })
    checks.push({ snapshot: name, aspect: 'html', mismatch: runCheck(() => checkHtml(cv)) })
    checks.push({ snapshot: name, aspect: 'page', mismatch: runCheck(() => checkPage(cv)) })
    checks.push({ snapshot: name, aspect: 'text', mismatch: runCheck(() => checkText(cv)) })
    checks.push({ snapshot: name, aspect: 'clipboard', mismatch: runCheck(() => checkClipboard(cv)) })
    checks.push({ snapshot: name, aspect: 'export', mismatch: runCheck(() => checkExportPack(cv)) })
    // screen regression only applies to canonical scenarios that have a baseline snapshot
    if (Object.prototype.hasOwnProperty.call(expectedSnaps, name)) {
      checks.push({ snapshot: name, aspect: 'screen', mismatch: runCheck(() => checkScreen(name, actualSnaps, expectedSnaps)) })
    }
  }
  checks.push({ snapshot: '(all)', aspect: 'gallery', mismatch: runCheck(() => checkGallery()) })

  const results = checks.map((c) => ({ snapshot: c.snapshot, aspect: c.aspect, pass: c.mismatch === null, mismatch: c.mismatch }))
  const failed = results.filter((c) => !c.pass)

  return deepFreeze({
    type: 'coach-dna-export-validation',
    schemaVersion: 1,
    pass: failed.length === 0,
    totalChecks: results.length,
    passedChecks: results.length - failed.length,
    failedChecks: failed.length,
    checks: results,
    mismatchSummary: failed.map((c) => `${c.aspect}[${c.snapshot}]: ${c.mismatch}`),
  })
}
