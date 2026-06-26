/**
 * @coach-intelligence — Readiness Evidence Bundle Presenter (M214, DORMANT, read-only)
 *
 * Renders an M213 readiness evidence bundle into a compact, readable view (its metadata: type/version,
 * validation status, confidence, component manifest, and collected warnings) for engineering logs or a
 * future surface. It reads only the bundle — it bundles/recomputes nothing, selects/ranks nothing,
 * calls no AI, and touches no database/network/filesystem/clock. Object output is deeply frozen.
 *
 * Formats: 'object' (default), 'text', 'json'. JSON uses the shared canonical serializer (existing
 * coach-intelligence edge, as in M125/M127/M185/M193/M211).
 *
 * Input: an M213 buildReadinessEvidenceBundle result.
 */

import { canonicalStringify } from '@brain/evidence-gateway'

const SUPPORTED_FORMATS = Object.freeze(['object', 'text', 'json'])

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const strOrNull = (v) => (typeof v === 'string' ? v : null)
const strArr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function assertBundle(bundle) {
  if (!isObj(bundle) || typeof bundle.type !== 'string' || !isObj(bundle.validation) ||
      !Array.isArray(bundle.components) || !Array.isArray(bundle.warnings)) {
    throw new TypeError('summarizeReadinessBundle requires an M213 evidence bundle { type, validation, components, warnings }')
  }
}

function build(bundle) {
  const components = strArr(bundle.components)
  const warnings = strArr(bundle.warnings)
  return {
    type: bundle.type,
    schemaVersion: typeof bundle.schemaVersion === 'number' ? bundle.schemaVersion : null,
    validationStatus: strOrNull(bundle.validation.status),
    confidenceLevel: isObj(bundle.confidence) ? strOrNull(bundle.confidence.level) : null,
    components,
    warnings,
    counts: { components: components.length, warnings: warnings.length },
  }
}

function renderText(n) {
  return [
    `ReadinessBundle type=${n.type} v=${n.schemaVersion} validation=${n.validationStatus} confidence=${n.confidenceLevel} components=${n.counts.components} warnings=${n.counts.warnings}`,
    `components: ${n.components.length ? n.components.join(',') : '(none)'}`,
    `warnings: ${n.warnings.length ? n.warnings.join(',') : '(none)'}`,
  ].join('\n')
}

/**
 * Present an M213 readiness evidence bundle for review.
 *
 * @param {object} bundle  an M213 evidence bundle
 * @param {('object'|'text'|'json')} [format='object']
 * @returns {(Readonly<object>|string)}
 */
export function summarizeReadinessBundle(bundle, format = 'object') {
  if (typeof format !== 'string' || !SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`summarizeReadinessBundle: unsupported format "${format}" (expected object | text | json)`)
  }
  assertBundle(bundle)

  const n = build(bundle)
  if (format === 'text') return renderText(n)
  if (format === 'json') return canonicalStringify(n)
  return deepFreeze(n)
}
