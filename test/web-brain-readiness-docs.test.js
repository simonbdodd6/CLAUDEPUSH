/**
 * web/brain-readiness-docs — Readiness Coach View Documentation Pack (M228) tests
 *
 * Documents the public coachView contract + the M221–M227 renderers. Verifies every public field is
 * documented exactly once, internal fields are rejected, the documented exports really exist, and the
 * output is deterministic with no internal-field leak or selection language.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildReadinessDocs, renderReadinessDocsMarkdown, describeField } from '../web/brain-readiness-docs.js'

const PUBLIC_FIELDS = ['status', 'confidence', 'gate', 'headline', 'keyNumbers', 'warnings', 'playerReadiness', 'squad', 'trend']
const INTERNAL_FIELDS = ['sources', 'manifest', 'components', 'schemaVersion', 'validation']

// ── generated successfully / structure ───────────────────────────────────────────────────

test('documentation generates with every section', () => {
  const docs = buildReadinessDocs()
  for (const key of ['title', 'contractFields', 'components', 'renderFlow', 'exportFlow', 'accessibilityFlow', 'regressionValidation', 'note']) {
    assert.ok(key in docs, `missing ${key}`)
  }
  assert.ok(Object.isFrozen(docs) && Object.isFrozen(docs.contractFields))
  assert.equal(docs.regressionValidation.totalChecks, 46)
  assert.deepEqual(docs.regressionValidation.aspects, ['accessibility', 'export', 'gallery', 'html', 'print', 'screen'])
  assert.equal(docs.regressionValidation.allPass, true)
})

// ── every public field documented exactly once ──────────────────────────────────────────

test('every public coachView field is documented exactly once', () => {
  const names = buildReadinessDocs().contractFields.map((f) => f.name)
  assert.deepEqual([...names].sort(), [...PUBLIC_FIELDS].sort())
  assert.equal(names.length, new Set(names).size, 'no duplicates')
  // each field records where it is rendered
  for (const f of buildReadinessDocs().contractFields) {
    assert.ok(Array.isArray(f.renderedIn) && f.renderedIn.length > 0, `${f.name} has no renderedIn`)
    assert.ok(typeof f.type === 'string' && typeof f.summary === 'string')
  }
})

// ── internal fields rejected ─────────────────────────────────────────────────────────────

test('internal bundle fields are rejected, not documented', () => {
  for (const name of INTERNAL_FIELDS) {
    assert.throws(() => describeField(name), RangeError, name)
    assert.ok(!buildReadinessDocs().contractFields.some((f) => f.name === name), `${name} leaked into contract`)
  }
  assert.throws(() => describeField('totallyUnknown'), RangeError)
  assert.throws(() => describeField(5), TypeError)
})

test('describeField returns the doc for a public field', () => {
  const f = describeField('status')
  assert.equal(f.name, 'status')
  assert.ok(f.renderedIn.some((r) => r.includes('M221')))
})

// ── component map covers M221–M227, and the documented exports really exist ───────────────

test('component map covers M221–M227 with real exports', async () => {
  const docs = buildReadinessDocs()
  assert.deepEqual(docs.components.map((c) => c.milestone), ['M221', 'M222', 'M223', 'M224', 'M225', 'M226', 'M227'])
  for (const c of docs.components) {
    const mod = await import(`../web/${c.module}.js`)
    for (const name of c.exports) assert.ok(name in mod, `${c.module} is missing documented export ${name}`)
  }
})

// ── markdown rendering ───────────────────────────────────────────────────────────────────

test('markdown contains every section and every public field', () => {
  const md = renderReadinessDocsMarkdown()
  for (const h of ['# Readiness Coach View', '## Field reference', '## Component map', '## Render flow', '## Export flow', '## Accessibility flow', '## Regression validation summary']) {
    assert.ok(md.includes(h), `missing heading ${h}`)
  }
  for (const f of PUBLIC_FIELDS) assert.ok(md.includes(`| ${f} |`), `missing field row ${f}`)
  assert.ok(md.includes('Total checks: 46'))
  // pipe characters in types are escaped so the table stays well-formed
  assert.ok(md.includes('\\| null'))
})

// ── determinism / safety ─────────────────────────────────────────────────────────────────

test('output is deterministic across repeated runs', () => {
  assert.deepEqual(buildReadinessDocs(), buildReadinessDocs())
  assert.equal(renderReadinessDocsMarkdown(), renderReadinessDocsMarkdown())
})

test('no internal field names in the contract and no selection language', () => {
  const md = renderReadinessDocsMarkdown()
  // internal bundle field names never appear as documented coachView field rows
  for (const name of INTERNAL_FIELDS) assert.ok(!md.includes(`| ${name} |`), `${name} documented as a field`)
  assert.doesNotMatch(md, /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i)
})

test('exports exist', () => {
  for (const fn of [buildReadinessDocs, renderReadinessDocsMarkdown, describeField]) assert.equal(typeof fn, 'function')
})
