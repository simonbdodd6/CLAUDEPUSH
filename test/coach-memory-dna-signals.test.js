/**
 * M113 — Coach DNA signal extraction tests
 *
 * Deterministic tests for the pure, dormant signal extractor: empty/single/multiple,
 * grouping by type, exact strength formula, strength-desc sorting (category tie-break),
 * supportingMemoryIds ordering (createdAt asc then id asc), duplicate-id / invalid / non-array
 * rejection, no mutation, determinism, deep-frozen output, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  normalizeCoachMemoryEntry,
  extractCoachDnaSignals,
} from '../packages/coach-memory/index.js'

const close = (a, b) => Math.abs(a - b) < 1e-9

const mem = (over = {}) => normalizeCoachMemoryEntry({
  id: 'm', coachId: 'c', clubId: 'club', type: 'philosophy',
  statement: 's', source: 'manual', confidence: 0.5, weight: 0.5,
  tags: [], ontologyLinks: [], evidenceRefs: [], createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

// ── empty / single ───────────────────────────────────────────────────────────────────

test('empty array → no signals, null strongest', () => {
  const r = extractCoachDnaSignals([])
  assert.deepEqual(r.signals, [])
  assert.deepEqual(r.summary, { strongestCategory: null, totalSignals: 0, strongestStrength: 0 })
})

test('single memory — strength formula exact', () => {
  // occ 1, conf 0.8, weight 0.6 → 1*0.4 + 0.8*0.35 + 0.6*0.25 = 0.4 + 0.28 + 0.15 = 0.83
  const r = extractCoachDnaSignals([mem({ id: 'a', type: 'philosophy', confidence: 0.8, weight: 0.6 })])
  assert.equal(r.signals.length, 1)
  const s = r.signals[0]
  assert.equal(s.category, 'philosophy')
  assert.equal(s.occurrences, 1)
  assert.ok(close(s.averageConfidence, 0.8) && close(s.averageWeight, 0.6))
  assert.ok(close(s.strength, 0.83))
  assert.deepEqual(s.supportingMemoryIds, ['a'])
  assert.equal(r.summary.strongestCategory, 'philosophy')
  assert.equal(r.summary.totalSignals, 1)
  assert.ok(close(r.summary.strongestStrength, 0.83))
})

// ── multiple / grouping / strength / sorting ─────────────────────────────────────────

test('grouping by type with averaged confidence/weight', () => {
  const r = extractCoachDnaSignals([
    mem({ id: '1', type: 'philosophy', confidence: 0.8, weight: 0.4 }),
    mem({ id: '2', type: 'philosophy', confidence: 0.6, weight: 0.6 }),
    mem({ id: '3', type: 'risk-warning', confidence: 0.2, weight: 0.2 }),
  ])
  const phil = r.signals.find(s => s.category === 'philosophy')
  assert.equal(phil.occurrences, 2)
  assert.ok(close(phil.averageConfidence, 0.7) && close(phil.averageWeight, 0.5))
  // philosophy strength = 2*0.4 + 0.7*0.35 + 0.5*0.25 = 0.8 + 0.245 + 0.125 = 1.17 → clamp 1
  assert.equal(phil.strength, 1)
})

test('signals sorted by strength descending', () => {
  const r = extractCoachDnaSignals([
    mem({ id: '1', type: 'philosophy' }),                 // occ 1 → strength 0.4+0.175+0.125 = 0.7
    mem({ id: '2', type: 'risk-warning' }),
    mem({ id: '3', type: 'risk-warning' }),               // occ 2 → strength clamps to 1
  ])
  assert.deepEqual(r.signals.map(s => s.category), ['risk-warning', 'philosophy'])
  assert.equal(r.summary.strongestCategory, 'risk-warning')
})

test('equal strength → category ascending tie-break', () => {
  // two single-occurrence types with identical conf/weight → equal strength
  const r = extractCoachDnaSignals([
    mem({ id: '1', type: 'risk-warning' }),
    mem({ id: '2', type: 'philosophy' }),
  ])
  assert.deepEqual(r.signals.map(s => s.category), ['philosophy', 'risk-warning'])   // tie → category asc
})

// ── supporting ids ordering ──────────────────────────────────────────────────────────

test('supportingMemoryIds sorted by createdAt asc then id asc', () => {
  const r = extractCoachDnaSignals([
    mem({ id: 'c', type: 'philosophy', createdAt: '2026-03-01T00:00:00.000Z' }),
    mem({ id: 'a', type: 'philosophy', createdAt: '2026-01-01T00:00:00.000Z' }),
    mem({ id: 'b', type: 'philosophy', createdAt: '2026-02-01T00:00:00.000Z' }),
    mem({ id: 'a2', type: 'philosophy', createdAt: '2026-01-01T00:00:00.000Z' }),   // tie with 'a' → id asc
  ])
  assert.deepEqual(r.signals[0].supportingMemoryIds, ['a', 'a2', 'b', 'c'])
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('non-array → TypeError', () => {
  assert.throws(() => extractCoachDnaSignals(null), TypeError)
  assert.throws(() => extractCoachDnaSignals({}), TypeError)
})

test('invalid memory → TypeError', () => {
  assert.throws(() => extractCoachDnaSignals([mem({ id: 'a' }), { id: 'b' }]), TypeError)
  assert.throws(() => extractCoachDnaSignals([{ ...mem({ id: 'a' }), type: 'nope' }]), TypeError)
})

test('duplicate ids → TypeError', () => {
  assert.throws(() => extractCoachDnaSignals([mem({ id: 'dup' }), mem({ id: 'dup' })]), TypeError)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate the input', () => {
  const memories = [mem({ id: 'b', createdAt: '2026-02-01T00:00:00.000Z' }), mem({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' })]
  const before = JSON.stringify(memories)
  const order = memories.map(m => m.id)
  extractCoachDnaSignals(memories)
  assert.equal(JSON.stringify(memories), before)
  assert.deepEqual(memories.map(m => m.id), order)
})

test('deterministic — identical input → identical signals', () => {
  const memories = [mem({ id: '1', type: 'philosophy' }), mem({ id: '2', type: 'risk-warning' })]
  assert.deepEqual(extractCoachDnaSignals(memories), extractCoachDnaSignals(memories))
})

test('output is deeply frozen', () => {
  const r = extractCoachDnaSignals([mem({ id: 'a' })])
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.signals) && Object.isFrozen(r.summary) &&
    Object.isFrozen(r.signals[0]) && Object.isFrozen(r.signals[0].supportingMemoryIds))
  assert.throws(() => { r.summary.totalSignals = 9 })
  assert.throws(() => r.signals.push({}))
})

// ── exports ──────────────────────────────────────────────────────────────────────────

test('exports', () => {
  assert.equal(typeof extractCoachDnaSignals, 'function')
})
