/**
 * web/brain-coach-dna-docs - Coach DNA Documentation Pack (M237) tests
 *
 * Documents the public M230 coachView contract + the M230-M236 publishing pipeline. Verifies every
 * public field is documented exactly once AND matches the REAL contract (via the live M231 sample),
 * internal memory fields are rejected, the documented exports really exist, the validation summary tracks
 * the live M236 validator, the architecture diagram is present, and the output is deterministic with no
 * internal-field leak or recommendation language.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCoachDnaDocs, renderCoachDnaDocsMarkdown, describeField } from '../web/brain-coach-dna-docs.js'
import { validateCoachDnaExports } from '../web/brain-coach-dna-validator.js'
import { buildCoachDnaCoachViewSample } from '../packages/coach-intelligence/index.js'
import { synthesizeCoachMemories, extractCoachDnaSignals, buildCoachDnaProfile } from '../packages/coach-memory/index.js'

const services = { synthesizeCoachMemories, extractCoachDnaSignals, buildCoachDnaProfile }
const PUBLIC_FIELDS = ['profileVersion', 'confidence', 'headline', 'identity', 'dominantSignals', 'themes', 'knowledge', 'summary', 'metadata']
const INTERNAL_FIELDS = ['supportingMemoryIds', 'evidenceRefs', 'ontologyLinks', 'statement', 'createdAt', 'coachId', 'sources', 'manifest']

// Structure.

test('documentation generates with every section and is frozen', () => {
  const docs = buildCoachDnaDocs()
  for (const key of ['title', 'contractFields', 'components', 'pipeline', 'architectureDiagrams', 'validation', 'note']) {
    assert.ok(key in docs, `missing ${key}`)
  }
  for (const flow of ['render', 'page', 'snapshot', 'export', 'validation']) {
    assert.ok(Array.isArray(docs.pipeline[flow]) && docs.pipeline[flow].length > 0, `missing pipeline.${flow}`)
  }
  assert.ok(Object.isFrozen(docs) && Object.isFrozen(docs.contractFields) && Object.isFrozen(docs.pipeline))
  assert.ok(Object.isFrozen(docs.architectureDiagrams))
})

// Validation summary tracks the live M236 validator.

test('validation summary is sourced live from the M236 validator', () => {
  const docs = buildCoachDnaDocs()
  const validation = validateCoachDnaExports()
  assert.equal(docs.validation.totalChecks, validation.totalChecks)
  assert.deepEqual(docs.validation.aspects, [...new Set(validation.checks.map((c) => c.aspect))].sort())
  assert.equal(docs.validation.allPass, validation.pass)
})

// Every public field documented exactly once.

test('every public coachView field is documented exactly once', () => {
  const names = buildCoachDnaDocs().contractFields.map((f) => f.name)
  assert.deepEqual([...names].sort(), [...PUBLIC_FIELDS].sort())
  assert.equal(names.length, new Set(names).size, 'no duplicates')
  for (const f of buildCoachDnaDocs().contractFields) {
    assert.ok(Array.isArray(f.renderedIn) && f.renderedIn.length > 0, `${f.name} has no renderedIn`)
    assert.ok(typeof f.type === 'string' && typeof f.summary === 'string')
  }
})

// Documentation matches the real M230 contract (cannot drift).

test('documented fields exactly match the real coachView contract (M231 sample)', () => {
  const sample = buildCoachDnaCoachViewSample(services) // real engine chain -> live M230 contract
  const documented = buildCoachDnaDocs().contractFields.map((f) => f.name)
  assert.deepEqual([...Object.keys(sample)].sort(), [...documented].sort())
})

// Internal fields rejected.

test('internal memory fields are rejected, never documented', () => {
  for (const name of INTERNAL_FIELDS) {
    assert.throws(() => describeField(name), RangeError, name)
    assert.ok(!buildCoachDnaDocs().contractFields.some((f) => f.name === name), `${name} leaked into contract`)
  }
  assert.throws(() => describeField('totallyUnknown'), RangeError)
  assert.throws(() => describeField(5), TypeError)
})

test('describeField returns the doc for a public field', () => {
  const f = describeField('dominantSignals')
  assert.equal(f.name, 'dominantSignals')
  assert.ok(f.renderedIn.some((r) => r.includes('M233')))
  assert.match(f.summary, /COUNT only/i)   // documents the count-only privacy guarantee
})

// Component map covers M230-M236, and the documented exports really exist.

test('component map covers M230-M236 with real, importable exports', async () => {
  const docs = buildCoachDnaDocs()
  const milestones = new Set(docs.components.map((c) => c.milestone))
  for (const m of ['M230', 'M231', 'M232', 'M233', 'M234', 'M235', 'M236']) assert.ok(milestones.has(m), `missing ${m}`)
  for (const c of docs.components) {
    const mod = await import(`../${c.home}/${c.module}.js`)
    for (const name of c.exports) assert.ok(name in mod, `${c.home}/${c.module} is missing documented export ${name}`)
  }
})

// Markdown rendering.

test('markdown contains every section, field, the validation total and the diagram', () => {
  const md = renderCoachDnaDocsMarkdown()
  for (const h of ['# Coach DNA', '## Contract field reference', '## Component map', '## Rendering pipeline', '## Snapshot generation', '## Export formats', '## Validator behaviour', '## Architecture diagrams']) {
    assert.ok(md.includes(h), `missing heading ${h}`)
  }
  for (const f of PUBLIC_FIELDS) assert.ok(md.includes(`| ${f} |`), `missing field row ${f}`)
  assert.ok(md.includes('Total checks: 36'))
  // architecture diagrams are fenced and reference the pipeline endpoints and data boundary
  assert.ok(md.includes('```'))
  assert.ok(md.includes('validateCoachDnaExports (M236)') && md.includes('publish decision'))
  assert.ok(md.includes('Internal Coach Memory data') && md.includes('Public coachView contract'))
  // pipe characters inside types are escaped so the table stays well-formed
  assert.ok(md.includes('\\| null'))
})

// Determinism / safety.

test('output is deterministic across repeated runs', () => {
  assert.deepEqual(buildCoachDnaDocs(), buildCoachDnaDocs())
  assert.equal(renderCoachDnaDocsMarkdown(), renderCoachDnaDocsMarkdown())
})

test('no internal field names documented as contract rows, and no recommendation language', () => {
  const md = renderCoachDnaDocsMarkdown()
  for (const name of INTERNAL_FIELDS) assert.ok(!md.includes(`| ${name} |`), `${name} documented as a field`)
  assert.doesNotMatch(md, /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i)
})

test('exports exist', () => {
  for (const fn of [buildCoachDnaDocs, renderCoachDnaDocsMarkdown, describeField]) assert.equal(typeof fn, 'function')
})
