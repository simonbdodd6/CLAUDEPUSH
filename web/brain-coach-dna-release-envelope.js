/**
 * web/brain-coach-dna-release-envelope.js - Coach DNA Release Review Envelope (M239, DORMANT)
 *
 * Builds a deterministic review envelope for the Coach DNA publishing pipeline after the M238 readiness
 * checklist. The envelope packages only review evidence: checklist verdict, validator summary, snapshot
 * inventory, documentation fingerprint, and artifact paths. It is designed for human review notes or CI
 * logs, not for runtime publishing.
 *
 * It does not publish, deploy, repair, persist, call AI, use DOM/network/storage/clock/randomness, touch
 * index.html, or wire anything into production. It imports only the dormant Coach DNA publishing modules.
 */

import { buildCoachDnaReleaseChecklist } from './brain-coach-dna-release-checklist.js' // M238
import { renderCoachDnaDocsMarkdown } from './brain-coach-dna-docs.js'                 // M237
import { validateCoachDnaExports } from './brain-coach-dna-validator.js'               // M236
import { buildCoachDnaSnapshots } from './brain-coach-dna-snapshots.js'                // M234

const ARTIFACTS = Object.freeze([
  'packages/coach-intelligence/coach-dna-coach-view.js',
  'packages/coach-intelligence/coach-dna-coach-view-sample.js',
  'web/brain-coach-dna-view.js',
  'web/brain-coach-dna-page.js',
  'web/brain-coach-dna-snapshots.js',
  'web/brain-coach-dna-gallery.js',
  'web/brain-coach-dna-export.js',
  'web/brain-coach-dna-validator.js',
  'web/brain-coach-dna-docs.js',
  'web/brain-coach-dna-release-checklist.js',
])

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`
}

function fingerprint(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`
}

function lineCount(text) {
  return text.length === 0 ? 0 : text.split('\n').length
}

function normalizeInputs(options) {
  const opts = isObj(options) ? options : {}
  const checklist = isObj(opts.checklist) ? opts.checklist : buildCoachDnaReleaseChecklist()
  const validation = isObj(opts.validation) ? opts.validation : validateCoachDnaExports()
  const markdown = typeof opts.markdown === 'string' ? opts.markdown : renderCoachDnaDocsMarkdown()
  const snapshots = isObj(opts.snapshots) ? opts.snapshots : buildCoachDnaSnapshots()
  return { checklist, validation, markdown, snapshots }
}

/**
 * Build a deterministic Coach DNA release review envelope.
 *
 * @param {object} [options] optional injected checklist/validation/markdown/snapshots for tests.
 * @returns {Readonly<object>}
 */
export function buildCoachDnaReleaseEnvelope(options = {}) {
  const { checklist, validation, markdown, snapshots } = normalizeInputs(options)
  const snapshotNames = Object.keys(snapshots).sort()
  const validationAspects = Array.isArray(validation.checks)
    ? [...new Set(validation.checks.map((c) => c.aspect))].sort()
    : []
  const checklistChecks = Array.isArray(checklist.checks)
    ? checklist.checks.map((c) => ({ id: c.id, pass: c.pass === true })).sort((a, b) => a.id.localeCompare(b.id))
    : []

  const evidence = {
    checklist: {
      status: checklist.status || 'unknown',
      pass: checklist.pass === true,
      totalChecks: checklist.checkCount || 0,
      failedChecks: checklist.failedChecks || 0,
      checks: checklistChecks,
    },
    validator: {
      pass: validation.pass === true,
      totalChecks: validation.totalChecks || 0,
      failedChecks: validation.failedChecks || 0,
      aspects: validationAspects,
    },
    docs: {
      format: 'markdown',
      lineCount: lineCount(markdown),
      charCount: markdown.length,
      fingerprint: fingerprint(markdown),
    },
    snapshots: {
      count: snapshotNames.length,
      names: snapshotNames,
    },
    artifacts: [...ARTIFACTS],
  }

  const status = evidence.checklist.pass && evidence.validator.pass ? 'ready-for-review' : 'blocked-for-review'
  const summary = [
    `status=${status}`,
    `checklist=${evidence.checklist.failedChecks}/${evidence.checklist.totalChecks} failed`,
    `validator=${evidence.validator.failedChecks}/${evidence.validator.totalChecks} failed`,
    `snapshots=${evidence.snapshots.count}`,
    `docs=${evidence.docs.fingerprint}`,
  ].join(' ')

  return deepFreeze({
    type: 'coach-dna-release-review-envelope',
    schemaVersion: 1,
    status,
    pass: status === 'ready-for-review',
    summary,
    evidence,
  })
}

/**
 * Serialize the release envelope in deterministic formats.
 * @param {object} [options]
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaReleaseEnvelope(options = {}, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const envelope = buildCoachDnaReleaseEnvelope(options)
  if (format === 'json') return canonicalStringify(envelope)
  if (format === 'line') return envelope.summary
  throw new TypeError(`unsupported Coach DNA release envelope format '${format}'`)
}
