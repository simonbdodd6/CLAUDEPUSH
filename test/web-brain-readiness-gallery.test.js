/**
 * web/brain-readiness-gallery — Readiness Coach View Preview Gallery (M226) tests
 *
 * A dormant builder that assembles one standalone HTML document (screen panels + print preview + text
 * export + reference CSS) from M221–M225. Verifies a well-formed document, all scenarios present,
 * determinism, no injection, no internal-field leak, and no selection language.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildReadinessGalleryDocument } from '../web/brain-readiness-gallery.js'

const TITLES = ['Fully ready', 'Match ready', 'Understrength', 'No squad', 'Low confidence', 'Warning-heavy', 'Trend improving', 'Trend declining', 'Trend unavailable']

test('builds a well-formed standalone HTML document', () => {
  const doc = buildReadinessGalleryDocument()
  assert.equal(typeof doc, 'string')
  assert.ok(doc.startsWith('<!DOCTYPE html>'))
  assert.ok(doc.trimEnd().endsWith('</html>'))
  assert.equal((doc.match(/<!DOCTYPE html>/g) || []).length, 1)   // exactly one doctype
  assert.equal((doc.match(/<html/g) || []).length, 1)
  assert.ok(doc.includes('<meta charset="utf-8">'))
})

test('embeds the reference stylesheet', () => {
  const doc = buildReadinessGalleryDocument()
  assert.ok(doc.includes('<style>') && doc.includes('</style>'))
  for (const sel of ['.brain-readiness', '.readiness-table', '.readiness-card', '.readiness-print', '@media print']) {
    assert.ok(doc.includes(sel), `CSS missing ${sel}`)
  }
})

test('includes every scenario panel, a print preview, and a text export', () => {
  const doc = buildReadinessGalleryDocument()
  for (const title of TITLES) assert.ok(doc.includes(`>${title}</figcaption>`), `missing caption ${title}`)
  assert.equal((doc.match(/class="gallery__item"/g) || []).length, 9)
  assert.ok(doc.includes('class="readiness-print readiness-print--high-contrast"'))   // M224 print preview
  assert.ok(doc.includes('<pre class="gallery__pre">') && doc.includes('Match readiness'))  // M225 text export
})

test('deterministic — identical document on repeat', () => {
  assert.equal(buildReadinessGalleryDocument(), buildReadinessGalleryDocument())
})

test('no script injection, no internal bundle fields, no selection language', () => {
  const doc = buildReadinessGalleryDocument()
  assert.ok(!doc.includes('<script'))
  for (const token of ['"sources"', '"manifest"', '"schemaVersion"', '"components"', 'readiness-evidence-bundle']) {
    assert.ok(!doc.includes(token), `leaks ${token}`)
  }
  assert.doesNotMatch(doc, /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i)
})

test('export exists', () => {
  assert.equal(typeof buildReadinessGalleryDocument, 'function')
})
