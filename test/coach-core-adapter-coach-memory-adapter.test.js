/**
 * coach-core-adapter — Coach Memory Adapter tests
 *
 * The M110 provider interface: search wrapping, array enforcement, in-memory adapter with
 * M108 validation, no-mutation, and an end-to-end check that the adapter plugs into the real
 * M110 retrieveCoachMemories. Exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createCoachMemoryAdapter, inMemoryCoachMemoryAdapter,
} from '../packages/coach-core-adapter/index.js'
import {
  createCoachMemoryQueryPlan, retrieveCoachMemories,
} from '../packages/coach-memory/index.js'

const entry = (id, over = {}) => ({
  id, coachId: 'coach-demo', clubId: 'boitsfort-rfc', type: 'selection-preference',
  statement: 'Pick on form and availability', source: 'manual', confidence: 0.8, weight: 0.7,
  tags: ['selection'], ontologyLinks: [], evidenceRefs: [], createdAt: '2026-06-01T00:00:00.000Z', ...over,
})

// ── createCoachMemoryAdapter ─────────────────────────────────────────────────────────

test('wraps a search function and returns its results', () => {
  const adapter = createCoachMemoryAdapter(() => [entry('m1')])
  assert.equal(typeof adapter.searchCoachMemory, 'function')
  assert.equal(adapter.searchCoachMemory({}).length, 1)
})

test('rejects a non-function search and a non-array result', () => {
  assert.throws(() => createCoachMemoryAdapter('nope'), TypeError)
  assert.throws(() => createCoachMemoryAdapter(() => ({})).searchCoachMemory({}), TypeError)   // search must yield an array
})

// ── inMemoryCoachMemoryAdapter ───────────────────────────────────────────────────────

test('in-memory adapter returns a copy of all entries (M110 does the filtering)', () => {
  const entries = [entry('m1'), entry('m2', { type: 'philosophy' })]
  const adapter = inMemoryCoachMemoryAdapter(entries)
  const out = adapter.searchCoachMemory({})
  assert.deepEqual(out.map((e) => e.id), ['m1', 'm2'])
  assert.notEqual(out, entries)   // shallow copy, not the same array reference
})

test('in-memory adapter validates entries against the M108 model', () => {
  assert.throws(() => inMemoryCoachMemoryAdapter([entry('m1'), { id: 'bad' }]), TypeError)
  assert.throws(() => inMemoryCoachMemoryAdapter('not-an-array'), TypeError)
  // validation can be opted out
  assert.doesNotThrow(() => inMemoryCoachMemoryAdapter([{ id: 'loose' }], { validate: false }))
})

test('does not mutate the supplied entries', () => {
  const entries = [entry('m1')]
  const before = JSON.stringify(entries)
  inMemoryCoachMemoryAdapter(entries).searchCoachMemory({})
  assert.equal(JSON.stringify(entries), before)
})

// ── end-to-end: satisfies the real M110 provider contract ────────────────────────────

test('plugs into M110 retrieveCoachMemories and is filtered by the plan', () => {
  const adapter = inMemoryCoachMemoryAdapter([
    entry('m1', { type: 'selection-preference' }),
    entry('m2', { type: 'philosophy' }),
    entry('m3', { type: 'selection-preference', createdAt: '2026-06-02T00:00:00.000Z' }),
  ])
  const plan = createCoachMemoryQueryPlan({ types: ['selection-preference'], sort: 'createdAt', limit: 10 })
  const results = retrieveCoachMemories(plan, adapter)
  assert.deepEqual(results.map((e) => e.id), ['m3', 'm1'])   // selection-preference only, createdAt DESC
})

test('exports exist', () => {
  assert.equal(typeof createCoachMemoryAdapter, 'function')
  assert.equal(typeof inMemoryCoachMemoryAdapter, 'function')
})
