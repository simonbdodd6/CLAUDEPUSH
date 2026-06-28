/**
 * web/brain-coach-dna-release-bundle.js - Coach DNA Release Bundle (M240, DORMANT)
 *
 * Seals the complete Coach DNA deliverable into ONE deterministic, fingerprinted, gated bundle — the
 * natural stage after the M239 review envelope. Where M239 packages review *evidence* ("is it ready?"),
 * M240 assembles the actual publishable *content*: every M235 export form (html/page/text/clipboard) for
 * every canonical M234 scenario, plus the M234 gallery document and the M237 documentation markdown. Each
 * artifact is fingerprinted and sized; the whole set rolls up into a single bundle fingerprint; and the
 * bundle is "sealed" only when the M239 envelope passes its gate. This is the build artifact a future
 * publish step would consume — it is not that publish step.
 *
 * It does not publish, deploy, repair, persist, call AI, use DOM/network/storage/clock/randomness, touch
 * index.html, or wire anything into production. It imports only the dormant Coach DNA publishing modules
 * and returns frozen plain data or deterministic text. Same input → same bundle, byte for byte.
 */

import { buildCoachDnaReleaseEnvelope } from './brain-coach-dna-release-envelope.js' // M239
import { buildCoachDnaExport } from './brain-coach-dna-export.js'                     // M235
import { buildCoachDnaGalleryDocument } from './brain-coach-dna-gallery.js'          // M234
import { COACH_DNA_SNAPSHOT_SCENARIOS } from './brain-coach-dna-snapshots.js'        // M234
import { renderCoachDnaDocsMarkdown } from './brain-coach-dna-docs.js'               // M237

// The export forms contributed per canonical scenario, in fixed order → byte-stable manifest ordering.
const EXPORT_FORMS = Object.freeze([
  { form: 'html', format: 'html' },
  { form: 'page', format: 'html' },
  { form: 'text', format: 'text' },
  { form: 'clipboard', format: 'text' },
])

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`
}

// FNV-1a 32-bit — the same content fingerprint used by the M239 envelope, for cross-stage consistency.
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

function entry(id, kind, scenario, form, format, content) {
  return {
    id,
    kind,
    scenario,
    form,
    format,
    bytes: content.length,
    lineCount: lineCount(content),
    fingerprint: fingerprint(content),
  }
}

function normalizeInputs(options) {
  const opts = isObj(options) ? options : {}
  const envelope = isObj(opts.envelope) ? opts.envelope : buildCoachDnaReleaseEnvelope()
  const scenarios = isObj(opts.scenarios) ? opts.scenarios : COACH_DNA_SNAPSHOT_SCENARIOS
  const gallery = typeof opts.gallery === 'string' ? opts.gallery : buildCoachDnaGalleryDocument()
  const markdown = typeof opts.markdown === 'string' ? opts.markdown : renderCoachDnaDocsMarkdown()
  return { envelope, scenarios, gallery, markdown }
}

// ── content assembly (manifest entries + the raw content map) ────────────────────────────

function collectArtifacts({ scenarios, gallery, markdown }) {
  const entries = []
  const contents = {}
  const add = (id, kind, scenario, form, format, content) => {
    entries.push(entry(id, kind, scenario, form, format, content))
    contents[id] = content
  }

  for (const scenario of Object.keys(scenarios).sort()) {
    const pack = buildCoachDnaExport(scenarios[scenario]) // M235, reused verbatim
    for (const { form, format } of EXPORT_FORMS) {
      add(`export/${scenario}/${form}`, 'export', scenario, form, format, pack[form])
    }
  }
  add('gallery', 'gallery', null, null, 'html', gallery)
  add('docs', 'docs', null, null, 'markdown', markdown)

  // Deterministic, content-independent ordering: kind then id.
  entries.sort((a, b) => (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind)))
  return { entries, contents }
}

/**
 * Build the deterministic, sealed Coach DNA release bundle.
 *
 * @param {object} [options] optional injected envelope/scenarios/gallery/markdown for tests.
 * @returns {Readonly<object>} frozen bundle. It is a build artifact, not a publish action.
 */
export function buildCoachDnaReleaseBundle(options = {}) {
  const { envelope, scenarios, gallery, markdown } = normalizeInputs(options)
  const { entries, contents } = collectArtifacts({ scenarios, gallery, markdown })

  const totalBytes = entries.reduce((sum, e) => sum + e.bytes, 0)
  // The bundle fingerprint depends only on artifact identity + content fingerprint + size, never on order
  // of assembly — so the same deliverable always seals to the same id.
  const bundleFingerprint = fingerprint(
    canonicalStringify(entries.map((e) => ({ id: e.id, fingerprint: e.fingerprint, bytes: e.bytes }))),
  )

  const sealed = envelope.pass === true
  const status = sealed ? 'sealed' : 'unsealed'
  const summary = [
    `status=${status}`,
    `artifacts=${entries.length}`,
    `bytes=${totalBytes}`,
    `bundle=${bundleFingerprint}`,
    `envelope=${envelope.status || 'unknown'}`,
  ].join(' ')

  return deepFreeze({
    type: 'coach-dna-release-bundle',
    schemaVersion: 1,
    status,
    sealed,
    summary,
    bundleFingerprint,
    artifactCount: entries.length,
    totalBytes,
    gate: {
      envelopeStatus: envelope.status || 'unknown',
      envelopePass: envelope.pass === true,
      envelopeSummary: typeof envelope.summary === 'string' ? envelope.summary : '',
      docsFingerprint: envelope.evidence?.docs?.fingerprint || null,
    },
    manifest: entries,
    contents,
  })
}

/**
 * Serialize the release bundle deterministically.
 *
 * The default 'json' form is the lightweight manifest view (no raw content) — every artifact is still
 * fully identified by its fingerprint and size, so the view is compact and review-friendly. The 'manifest'
 * form is a plain-text table. Raw content remains available on the built bundle's `contents` map.
 *
 * @param {object} [options]
 * @param {{ format?: 'json' | 'manifest' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaReleaseBundle(options = {}, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const bundle = buildCoachDnaReleaseBundle(options)
  if (format === 'line') return bundle.summary
  if (format === 'json') {
    return canonicalStringify({
      type: bundle.type,
      schemaVersion: bundle.schemaVersion,
      status: bundle.status,
      sealed: bundle.sealed,
      summary: bundle.summary,
      bundleFingerprint: bundle.bundleFingerprint,
      artifactCount: bundle.artifactCount,
      totalBytes: bundle.totalBytes,
      gate: bundle.gate,
      manifest: bundle.manifest,
    })
  }
  if (format === 'manifest') {
    const header = `Coach DNA release bundle: ${bundle.status} (${bundle.artifactCount} artifacts, ${bundle.totalBytes} bytes)`
    const seal = `Bundle fingerprint: ${bundle.bundleFingerprint}`
    const rows = bundle.manifest.map((e) => `${e.fingerprint}  ${String(e.bytes).padStart(7)}b  ${e.format.padEnd(8)}  ${e.id}`)
    return [header, seal, '', ...rows].join('\n')
  }
  throw new TypeError(`unsupported Coach DNA release bundle format '${format}'`)
}
