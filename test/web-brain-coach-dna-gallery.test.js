/**
 * web/brain-coach-dna-gallery — Coach DNA Snapshot Gallery (M234) tests
 *
 * A dormant builder that assembles ONE standalone HTML document embedding the live M233 Coach DNA page
 * for every scenario inside sandboxed iframes. Verifies a well-formed document, one iframe per scenario,
 * every caption, the embedded (escaped) pages, determinism, no live script injection, no internal-field
 * leak, and no recommendation language.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCoachDnaGalleryDocument } from '../web/brain-coach-dna-gallery.js'
import { COACH_DNA_SNAPSHOT_SCENARIOS } from '../web/brain-coach-dna-snapshots.js'

const TITLES = ['Selection-led — high confidence', 'Philosophy-led — medium confidence', 'Developing profile — low confidence', 'Broad veteran — full coverage', 'No profile yet — empty state']
const SCENARIO_COUNT = Object.keys(COACH_DNA_SNAPSHOT_SCENARIOS).length

test('builds a well-formed standalone HTML document', () => {
  const doc = buildCoachDnaGalleryDocument()
  assert.equal(typeof doc, 'string')
  assert.ok(doc.startsWith('<!DOCTYPE html>'))
  assert.ok(doc.trimEnd().endsWith('</html>'))
  assert.equal((doc.match(/<!DOCTYPE html>/g) || []).length, 1)   // exactly one *real* doctype (others are escaped)
  assert.equal((doc.match(/<html/g) || []).length, 1)
  assert.ok(doc.includes('<meta charset="utf-8">'))
  assert.ok(doc.includes('<title>Coach DNA — Snapshot Gallery</title>'))
})

test('embeds the scaffolding chrome stylesheet', () => {
  const doc = buildCoachDnaGalleryDocument()
  assert.ok(doc.includes('<style>') && doc.includes('</style>'))
  for (const sel of ['.cdna-gallery', '.cdna-gallery__grid', '.cdna-gallery__item', '.cdna-gallery__frame']) {
    assert.ok(doc.includes(sel), `CSS missing ${sel}`)
  }
})

test('embeds one sandboxed iframe per scenario, each with the live M233 page', () => {
  const doc = buildCoachDnaGalleryDocument()
  assert.equal((doc.match(/class="cdna-gallery__item"/g) || []).length, SCENARIO_COUNT)
  assert.equal((doc.match(/<iframe /g) || []).length, SCENARIO_COUNT)
  assert.equal((doc.match(/ sandbox /g) || []).length, SCENARIO_COUNT)             // every frame sandboxed
  // each embedded page is the M233 document, HTML-attribute-escaped into srcdoc
  assert.equal((doc.match(/srcdoc="/g) || []).length, SCENARIO_COUNT)
  assert.equal((doc.match(/&lt;!DOCTYPE html&gt;/g) || []).length, SCENARIO_COUNT)  // inner doctypes escaped
  // the embedded page markup is attribute-escaped: its tags appear as &lt;…&gt;, never as live tags
  assert.ok(doc.includes('&lt;section class=&quot;brain-coach-dna&quot;'), 'inner page tags should be escaped, not live')
  assert.ok(!doc.includes('<section class="brain-coach-dna"'), 'no live (unescaped) inner page markup')
})

test('includes every scenario caption', () => {
  const doc = buildCoachDnaGalleryDocument()
  for (const title of TITLES) assert.ok(doc.includes(`>${title}</figcaption>`), `missing caption ${title}`)
})

test('embedded pages carry scenario content (escaped) — e.g. the empty-state headline', () => {
  const doc = buildCoachDnaGalleryDocument()
  assert.ok(doc.includes('No coaching profile yet'))    // from the empty scenario's M233 page (text survives escaping)
  assert.ok(doc.includes('Broad veteran'))              // caption
})

test('deterministic — identical document on repeat', () => {
  assert.equal(buildCoachDnaGalleryDocument(), buildCoachDnaGalleryDocument())
})

test('no live script injection — the only executable context is none', () => {
  const doc = buildCoachDnaGalleryDocument()
  assert.ok(!doc.includes('<script'))   // no real <script> anywhere; embedded pages are escaped + sandboxed
})

test('no internal bundle fields leak and no recommendation language', () => {
  const doc = buildCoachDnaGalleryDocument()
  for (const token of ['supportingMemoryIds', 'evidenceRefs', 'ontologyLinks', 'createdAt', 'coachId']) {
    assert.ok(!doc.includes(token), `leaks ${token}`)
  }
  assert.doesNotMatch(doc, /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i)
})

test('export exists', () => {
  assert.equal(typeof buildCoachDnaGalleryDocument, 'function')
})
