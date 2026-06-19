/**
 * M110 — Coach Memory retrieval engine tests
 *
 * Deterministic tests for the pure, dormant retrieval engine executing an M109 plan against
 * an injected provider: valid/invalid provider, called-exactly-once, filters (type/ontology/
 * tags/minimumScore), sorts (score/confidence/weight), stable tie-break, limit, no mutation,
 * deep frozen, determinism, provider-exception propagation, exports. No real store.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  normalizeCoachMemoryEntry,
  createCoachMemoryQueryPlan,
  retrieveCoachMemories,
} from '../packages/coach-memory/index.js'

// build a normalized (deeply frozen) entry with controlled fields
const mk = (over = {}) => normalizeCoachMemoryEntry({
  id: 'x', coachId: 'c', clubId: 'club', type: 'philosophy',
  statement: 's', source: 'manual', confidence: 0.5, weight: 0.5,
  tags: [], ontologyLinks: [], evidenceRefs: [], createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

// injected provider stub that records calls and returns a fixed entry list
const makeProvider = (entries) => {
  const state = { calls: 0, lastPlan: null }
  return { state, searchCoachMemory(plan) { state.calls++; state.lastPlan = plan; return entries } }
}

const plan = (over) => createCoachMemoryQueryPlan(over)

// ── provider validation / call discipline ────────────────────────────────────────────

test('valid provider → returns an array', () => {
  const r = retrieveCoachMemories(plan(), makeProvider([mk({ id: 'a' })]))
  assert.ok(Array.isArray(r))
  assert.equal(r.length, 1)
})

test('invalid provider → TypeError', () => {
  assert.throws(() => retrieveCoachMemories(plan(), null), TypeError)
  assert.throws(() => retrieveCoachMemories(plan(), {}), TypeError)
  assert.throws(() => retrieveCoachMemories(plan(), { searchCoachMemory: 'nope' }), TypeError)
})

test('invalid plan → TypeError', () => {
  const p = makeProvider([])
  assert.throws(() => retrieveCoachMemories(null, p), TypeError)
  assert.throws(() => retrieveCoachMemories({}, p), TypeError)
  assert.throws(() => retrieveCoachMemories({ filters: {}, retrieval: {} }, p), TypeError)
})

test('provider called exactly once, with the plan', () => {
  const provider = makeProvider([mk({ id: 'a' })])
  const p = plan({ tags: ['x'] })
  retrieveCoachMemories(p, provider)
  assert.equal(provider.state.calls, 1)
  assert.equal(provider.state.lastPlan, p)
})

test('provider returning non-array → TypeError', () => {
  assert.throws(() => retrieveCoachMemories(plan(), { searchCoachMemory: () => 'nope' }), TypeError)
})

// ── filters ──────────────────────────────────────────────────────────────────────────

test('filter by type', () => {
  const entries = [mk({ id: 'a', type: 'selection-preference' }), mk({ id: 'b', type: 'risk-warning' })]
  const r = retrieveCoachMemories(plan({ types: ['selection-preference'] }), makeProvider(entries))
  assert.deepEqual(r.map(e => e.id), ['a'])
})

test('filter by ontology (any-match)', () => {
  const entries = [
    mk({ id: 'a', ontologyLinks: [{ kind: 'player', id: 'p9' }] }),
    mk({ id: 'b', ontologyLinks: [{ kind: 'player', id: 'p1' }] }),
  ]
  const r = retrieveCoachMemories(plan({ ontologyTargets: [{ kind: 'player', id: 'p9' }] }), makeProvider(entries))
  assert.deepEqual(r.map(e => e.id), ['a'])
})

test('filter by tags (any-match)', () => {
  const entries = [mk({ id: 'a', tags: ['x', 'z'] }), mk({ id: 'b', tags: ['y'] })]
  const r = retrieveCoachMemories(plan({ tags: ['x'] }), makeProvider(entries))
  assert.deepEqual(r.map(e => e.id), ['a'])
})

test('filter by minimumScore', () => {
  const hi = mk({ id: 'hi', confidence: 0.9, weight: 0.9 })   // score 0.72
  const lo = mk({ id: 'lo', confidence: 0.1, weight: 0.1 })   // score 0.08
  const r = retrieveCoachMemories(plan({ minimumScore: 0.5 }), makeProvider([hi, lo]))
  assert.deepEqual(r.map(e => e.id), ['hi'])
})

// ── sorting ──────────────────────────────────────────────────────────────────────────

test('sort by score (desc)', () => {
  const a = mk({ id: 'a', confidence: 0.9, weight: 0.9 })   // higher score
  const b = mk({ id: 'b', confidence: 0.2, weight: 0.2 })
  const r = retrieveCoachMemories(plan({ sort: 'score' }), makeProvider([b, a]))
  assert.deepEqual(r.map(e => e.id), ['a', 'b'])
})

test('sort by confidence (desc)', () => {
  const a = mk({ id: 'a', confidence: 0.8, weight: 0.5 })
  const b = mk({ id: 'b', confidence: 0.6, weight: 0.5 })
  const r = retrieveCoachMemories(plan({ sort: 'confidence' }), makeProvider([b, a]))
  assert.deepEqual(r.map(e => e.id), ['a', 'b'])
})

test('sort by weight (desc)', () => {
  const a = mk({ id: 'a', confidence: 0.5, weight: 0.8 })
  const b = mk({ id: 'b', confidence: 0.5, weight: 0.6 })
  const r = retrieveCoachMemories(plan({ sort: 'weight' }), makeProvider([b, a]))
  assert.deepEqual(r.map(e => e.id), ['a', 'b'])
})

// ── tie-break ────────────────────────────────────────────────────────────────────────

test('stable tie-break: equal primary → createdAt DESC then id ASC', () => {
  // equal confidence; newer createdAt first
  const older = mk({ id: 'older', confidence: 0.7, createdAt: '2026-01-01T00:00:00.000Z' })
  const newer = mk({ id: 'newer', confidence: 0.7, createdAt: '2026-02-01T00:00:00.000Z' })
  const r1 = retrieveCoachMemories(plan({ sort: 'confidence' }), makeProvider([older, newer]))
  assert.deepEqual(r1.map(e => e.id), ['newer', 'older'])

  // equal confidence AND createdAt → id ascending
  const z = mk({ id: 'z', confidence: 0.7, createdAt: '2026-03-01T00:00:00.000Z' })
  const a = mk({ id: 'a', confidence: 0.7, createdAt: '2026-03-01T00:00:00.000Z' })
  const r2 = retrieveCoachMemories(plan({ sort: 'confidence' }), makeProvider([z, a]))
  assert.deepEqual(r2.map(e => e.id), ['a', 'z'])
})

// ── limit ────────────────────────────────────────────────────────────────────────────

test('limit caps the number of results', () => {
  const entries = [1, 2, 3, 4, 5].map(n => mk({ id: `e${n}`, confidence: n / 10 }))
  const r = retrieveCoachMemories(plan({ sort: 'confidence', limit: 2 }), makeProvider(entries))
  assert.equal(r.length, 2)
  assert.deepEqual(r.map(e => e.id), ['e5', 'e4'])   // top 2 by confidence
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate provider results', () => {
  const entries = [mk({ id: 'b', confidence: 0.2 }), mk({ id: 'a', confidence: 0.9 })]
  const before = JSON.stringify(entries)
  const beforeOrder = entries.map(e => e.id)
  retrieveCoachMemories(plan({ sort: 'confidence' }), makeProvider(entries))
  assert.equal(JSON.stringify(entries), before)
  assert.deepEqual(entries.map(e => e.id), beforeOrder)   // provider array order unchanged
})

test('returned array is frozen (entries already frozen by contract)', () => {
  const r = retrieveCoachMemories(plan(), makeProvider([mk({ id: 'a' })]))
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r[0]))
  assert.throws(() => r.push(mk({ id: 'z' })))
})

test('deterministic — identical inputs → identical results', () => {
  const entries = [mk({ id: 'b', confidence: 0.5 }), mk({ id: 'a', confidence: 0.5 }), mk({ id: 'c', confidence: 0.9 })]
  const p = plan({ sort: 'confidence' })
  assert.deepEqual(
    retrieveCoachMemories(p, makeProvider(entries)).map(e => e.id),
    retrieveCoachMemories(p, makeProvider(entries)).map(e => e.id),
  )
})

// ── provider exception propagation ───────────────────────────────────────────────────

test('provider exceptions propagate unchanged', () => {
  const boom = new Error('provider exploded')
  assert.throws(() => retrieveCoachMemories(plan(), { searchCoachMemory() { throw boom } }), (e) => e === boom)
})

// ── exports ──────────────────────────────────────────────────────────────────────────

test('exports', () => {
  assert.equal(typeof retrieveCoachMemories, 'function')
})
