/**
 * web/brain-coach-dna-page — Coach DNA Visual Experience Page (M233) tests
 *
 * A dormant builder that assembles ONE premium, cinematic standalone HTML document for a coach's DNA
 * from an M230 coachView — reusing the M232 renderer, the brain-coach-dna__* visual language, and the
 * M222 escape helper. Verifies a well-formed document, every required section, the embedded fragment,
 * determinism, no XSS, graceful empty/degraded input, no internal-field leak, and no recommendation
 * language. Built and tested against the real M231 sample; index.html / production untouched.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCoachDnaPageDocument } from '../web/brain-coach-dna-page.js'
import { buildCoachDnaCoachViewSample, buildCoachDnaCoachView } from '../packages/coach-intelligence/index.js'
import { synthesizeCoachMemories, extractCoachDnaSignals, buildCoachDnaProfile } from '../packages/coach-memory/index.js'

const services = { synthesizeCoachMemories, extractCoachDnaSignals, buildCoachDnaProfile }
const sampleView = () => buildCoachDnaCoachViewSample(services)
const emptyView = () => buildCoachDnaCoachView({
  profile: buildCoachDnaProfile(extractCoachDnaSignals([])),
  synthesis: synthesizeCoachMemories([]),
})

// ── well-formed standalone document ──────────────────────────────────────────────────────

test('builds a well-formed standalone HTML document', () => {
  const doc = buildCoachDnaPageDocument(sampleView())
  assert.equal(typeof doc, 'string')
  assert.ok(doc.startsWith('<!DOCTYPE html>'))
  assert.ok(doc.trimEnd().endsWith('</html>'))
  assert.equal((doc.match(/<!DOCTYPE html>/g) || []).length, 1)   // exactly one doctype
  assert.equal((doc.match(/<html/g) || []).length, 1)
  assert.ok(doc.includes('<meta charset="utf-8">'))
  assert.ok(doc.includes('<title>Coach DNA</title>'))
  assert.equal((doc.match(/<\/body>/g) || []).length, 1)
})

// ── premium design system embedded ───────────────────────────────────────────────────────

test('embeds the cinematic design system stylesheet', () => {
  const doc = buildCoachDnaPageDocument(sampleView())
  assert.ok(doc.includes('<style>') && doc.includes('</style>'))
  for (const sel of [
    '.brain-coach-dna-page__hero', '.brain-coach-dna-page__gauge', '.brain-coach-dna-page__panel',
    '.brain-coach-dna-page__bar-fill', '.brain-coach-dna-page__tiles', '.brain-coach-dna', '@media print',
  ]) assert.ok(doc.includes(sel), `CSS missing ${sel}`)
})

// ── every required Coach DNA section is present ──────────────────────────────────────────

test('renders every required Coach DNA section', () => {
  const doc = buildCoachDnaPageDocument(sampleView())
  for (const title of [
    'Coach DNA',                  // identity / hero eyebrow
    'Coach identity',
    'Coaching philosophy',
    'Coaching strengths',
    'Coaching development areas',
    'Confidence indicators',
    'Memory summary',
    'Knowledge themes',
    'Supporting evidence',
  ]) assert.ok(doc.includes(title), `missing section "${title}"`)
})

test('surfaces the sample data in the right sections', () => {
  const doc = buildCoachDnaPageDocument(sampleView())
  assert.ok(doc.includes('Selection focus'))                                  // hero headline (M230)
  assert.ok(/High confidence/.test(doc))                                      // confidence indicator
  assert.ok(doc.includes('data-confidence="HIGH"'))                           // page root data attr
  assert.ok(doc.includes('data-strongest="selection-preference"'))
  assert.ok(doc.includes('Strongest · Selection'))                            // identity badge
  assert.ok(doc.includes('width:100%'))                                       // top strength bar (strength 1.0)
  assert.ok(doc.includes('Coach has 8 recorded coaching memories across 6 coaching themes.')) // memory summary
  assert.ok(doc.includes('brain-coach-dna-page__tile-value">8<'))             // evidence tile: totalMemories
})

// ── reuses the M232 fragment (no parallel re-implementation) ─────────────────────────────

test('embeds the M232 panel fragment verbatim (reuse, not redesign)', () => {
  const doc = buildCoachDnaPageDocument(sampleView())
  assert.ok(doc.includes('<section class="brain-coach-dna" data-strongest='))   // the M232 fragment itself
  for (const cls of ['brain-coach-dna__headline', 'brain-coach-dna__badge', 'brain-coach-dna__note']) {
    assert.ok(doc.includes(cls), `missing reused class ${cls}`)
  }
})

// ── confidence gauge is driven by the contract value ─────────────────────────────────────

test('confidence gauge is driven deterministically by the coachView value', () => {
  const view = sampleView()
  const doc = buildCoachDnaPageDocument(view)
  const expected = Math.round(view.confidence.value * 100)
  assert.ok(doc.includes(`--cdna-conf:${expected}`), `gauge not set to ${expected}`)
  assert.ok(doc.includes(`${expected}%`))
})

// ── determinism ──────────────────────────────────────────────────────────────────────────

test('deterministic — identical document on repeat', () => {
  const view = sampleView()
  assert.equal(buildCoachDnaPageDocument(view), buildCoachDnaPageDocument(view))
})

// ── escaping (no XSS) ────────────────────────────────────────────────────────────────────

test('escapes every interpolated value', () => {
  const doc = buildCoachDnaPageDocument({
    headline: '<script>alert(1)</script>',
    confidence: { value: 0.5, level: '<b>L</b>', label: '<b>L</b>' },
    identity: { strongestCategory: '"><x>', strongestLabel: '<img src=x onerror=1>', weakestLabel: '<u>w</u>', diversityLabel: '<i>D</i>' },
    dominantSignals: [{ category: 'philosophy', label: '<svg/onload=1>', strength: 0.5, occurrences: 1, averageConfidence: 0.5, supportingCount: 1 }],
    themes: [{ type: 't', label: '</section><script>', count: 1 }],
    knowledge: { totalMemories: 1, uniqueTypes: 1, averageConfidence: 0.5, averageWeight: 0.5, totalEvidence: 0, totalOntologyLinks: 0 },
    summary: '<iframe>',
    profileVersion: '"v1',
    metadata: {},
  })
  // only the one trusted <style> block may contain a raw "<script"-free stylesheet; no injected markup survives
  assert.ok(!doc.includes('<script>'))
  assert.ok(!doc.includes('<img src=x'))
  assert.ok(!doc.includes('<svg/onload'))
  assert.ok(!doc.includes('<iframe>'))
  assert.ok(doc.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(doc.includes('data-strongest="&quot;&gt;&lt;x&gt;"'))
})

// ── graceful empty / degraded input ──────────────────────────────────────────────────────

test('empty (no-profile) coachView renders a complete document without crashing', () => {
  const doc = buildCoachDnaPageDocument(emptyView())
  assert.ok(doc.startsWith('<!DOCTYPE html>'))
  assert.ok(doc.trimEnd().endsWith('</html>'))
  assert.ok(doc.includes('No coaching profile yet'))               // M230 headline fallback
  assert.ok(doc.includes('No coaching signals yet'))               // empty strengths state
  assert.ok(doc.includes('--cdna-conf:0'))                         // zero-confidence gauge, no NaN
  assert.ok(!/NaN|undefined|\[object Object\]/.test(doc))
})

test('throws on non-object input', () => {
  assert.throws(() => buildCoachDnaPageDocument(null), TypeError)
  assert.throws(() => buildCoachDnaPageDocument(undefined), TypeError)
  assert.throws(() => buildCoachDnaPageDocument('x'), TypeError)
})

// ── read-only ethos: no leaked internals, no recommendation language ─────────────────────

test('no internal bundle fields leak and no selection/recommendation language', () => {
  const doc = buildCoachDnaPageDocument(sampleView())
  assert.ok(doc.includes('Read-only'))
  for (const token of ['supportingMemoryIds', 'evidenceRefs', 'ontologyLinks', 'statement', 'createdAt', 'coachId']) {
    assert.ok(!doc.includes(token), `leaks internal field ${token}`)
  }
  assert.doesNotMatch(doc, /\b(you should|recommend|must start|must bench|drop him|pick him|best xv|select)\b/i)
})

test('export exists', () => {
  assert.equal(typeof buildCoachDnaPageDocument, 'function')
})
