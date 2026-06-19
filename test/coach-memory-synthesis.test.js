/**
 * M112 — Coach Memory synthesis tests
 *
 * Deterministic tests for the pure, dormant synthesizer: empty/single/multiple, grouping by
 * type (count desc, type asc), per-theme + overall averages, statistics, supportingEvidence
 * ordering (createdAt asc, memoryId tie-break), duplicate-id / invalid-memory / non-array
 * rejection, no mutation, determinism, deep-frozen output, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  normalizeCoachMemoryEntry,
  synthesizeCoachMemories,
} from '../packages/coach-memory/index.js'

const close = (a, b) => Math.abs(a - b) < 1e-9

// build a normalized (deeply frozen, valid) memory with controlled fields
const mem = (over = {}) => normalizeCoachMemoryEntry({
  id: 'm', coachId: 'c', clubId: 'club', type: 'philosophy',
  statement: 's', source: 'manual', confidence: 0.5, weight: 0.5,
  tags: [], ontologyLinks: [], evidenceRefs: [], createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

// ── empty ────────────────────────────────────────────────────────────────────────────

test('empty array → zeroed synthesis', () => {
  const s = synthesizeCoachMemories([])
  assert.equal(s.summary, 'Coach has 0 recorded coaching memories across 0 coaching themes.')
  assert.deepEqual(s.themes, [])
  assert.deepEqual(s.statistics, {
    totalMemories: 0, uniqueTypes: 0, averageConfidence: 0, averageWeight: 0, totalEvidence: 0, totalOntologyLinks: 0,
  })
  assert.deepEqual(s.supportingEvidence, [])
})

// ── single ───────────────────────────────────────────────────────────────────────────

test('single memory', () => {
  const s = synthesizeCoachMemories([mem({ id: 'a', confidence: 0.8, weight: 0.6, evidenceRefs: ['e1', 'e2'], ontologyLinks: [{ kind: 'player', id: 'p9' }] })])
  assert.equal(s.summary, 'Coach has 1 recorded coaching memories across 1 coaching themes.')
  assert.equal(s.themes.length, 1)
  assert.equal(s.themes[0].type, 'philosophy')
  assert.equal(s.themes[0].count, 1)
  assert.ok(close(s.themes[0].averageConfidence, 0.8) && close(s.themes[0].averageWeight, 0.6))
  assert.equal(s.statistics.totalEvidence, 2)
  assert.equal(s.statistics.totalOntologyLinks, 1)
  assert.deepEqual(s.supportingEvidence, [{ memoryId: 'a', type: 'philosophy' }])
})

// ── multiple / grouping / averages ───────────────────────────────────────────────────

test('grouping by type, sorted count desc then type asc', () => {
  const s = synthesizeCoachMemories([
    mem({ id: '1', type: 'philosophy' }),
    mem({ id: '2', type: 'selection-preference' }),
    mem({ id: '3', type: 'selection-preference' }),
    mem({ id: '4', type: 'risk-warning' }),
  ])
  // counts: selection-preference 2, philosophy 1, risk-warning 1 → 2 first, then ties by type asc
  assert.deepEqual(s.themes.map(t => [t.type, t.count]), [
    ['selection-preference', 2],
    ['philosophy', 1],
    ['risk-warning', 1],
  ])
})

test('per-theme and overall averages', () => {
  const s = synthesizeCoachMemories([
    mem({ id: '1', type: 'philosophy', confidence: 0.8, weight: 0.4 }),
    mem({ id: '2', type: 'philosophy', confidence: 0.6, weight: 0.6 }),
    mem({ id: '3', type: 'risk-warning', confidence: 0.2, weight: 1.0 }),
  ])
  const phil = s.themes.find(t => t.type === 'philosophy')
  assert.ok(close(phil.averageConfidence, 0.7) && close(phil.averageWeight, 0.5))   // (0.8+0.6)/2, (0.4+0.6)/2
  // overall: confidence (0.8+0.6+0.2)/3, weight (0.4+0.6+1.0)/3
  assert.ok(close(s.statistics.averageConfidence, (0.8 + 0.6 + 0.2) / 3))
  assert.ok(close(s.statistics.averageWeight, (0.4 + 0.6 + 1.0) / 3))
})

test('statistics totals', () => {
  const s = synthesizeCoachMemories([
    mem({ id: '1', type: 'philosophy', evidenceRefs: ['a', 'b'], ontologyLinks: [{ kind: 'player', id: 'p' }] }),
    mem({ id: '2', type: 'risk-warning', evidenceRefs: ['c'], ontologyLinks: [{ kind: 'team', id: 't' }, { kind: 'tactic', id: 'x' }] }),
  ])
  assert.equal(s.statistics.totalMemories, 2)
  assert.equal(s.statistics.uniqueTypes, 2)
  assert.equal(s.statistics.totalEvidence, 3)
  assert.equal(s.statistics.totalOntologyLinks, 3)
})

// ── supporting evidence ordering ─────────────────────────────────────────────────────

test('supporting evidence sorted by createdAt ascending', () => {
  const s = synthesizeCoachMemories([
    mem({ id: 'c', createdAt: '2026-03-01T00:00:00.000Z' }),
    mem({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' }),
    mem({ id: 'b', createdAt: '2026-02-01T00:00:00.000Z' }),
  ])
  assert.deepEqual(s.supportingEvidence.map(e => e.memoryId), ['a', 'b', 'c'])
})

test('supporting evidence ties (equal createdAt) break by memoryId ascending', () => {
  const s = synthesizeCoachMemories([
    mem({ id: 'z', createdAt: '2026-01-01T00:00:00.000Z' }),
    mem({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' }),
    mem({ id: 'm', createdAt: '2026-01-01T00:00:00.000Z' }),
  ])
  assert.deepEqual(s.supportingEvidence.map(e => e.memoryId), ['a', 'm', 'z'])
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('non-array → TypeError', () => {
  assert.throws(() => synthesizeCoachMemories(null), TypeError)
  assert.throws(() => synthesizeCoachMemories({}), TypeError)
})

test('invalid memory → TypeError', () => {
  assert.throws(() => synthesizeCoachMemories([mem({ id: 'a' }), { id: 'b' }]), TypeError)            // not a valid entry
  assert.throws(() => synthesizeCoachMemories([{ ...mem({ id: 'a' }), type: 'nope' }]), TypeError)    // invalid type
})

test('duplicate ids → TypeError', () => {
  assert.throws(() => synthesizeCoachMemories([mem({ id: 'dup' }), mem({ id: 'dup' })]), TypeError)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate the input array or memories', () => {
  const memories = [mem({ id: 'b', createdAt: '2026-02-01T00:00:00.000Z' }), mem({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' })]
  const before = JSON.stringify(memories)
  const order = memories.map(m => m.id)
  synthesizeCoachMemories(memories)
  assert.equal(JSON.stringify(memories), before)
  assert.deepEqual(memories.map(m => m.id), order)   // input order unchanged
})

test('deterministic — identical input → identical synthesis', () => {
  const memories = [mem({ id: '1', type: 'philosophy' }), mem({ id: '2', type: 'risk-warning' })]
  assert.deepEqual(synthesizeCoachMemories(memories), synthesizeCoachMemories(memories))
})

test('output is deeply frozen', () => {
  const s = synthesizeCoachMemories([mem({ id: 'a' })])
  assert.ok(Object.isFrozen(s) && Object.isFrozen(s.themes) && Object.isFrozen(s.statistics) &&
    Object.isFrozen(s.supportingEvidence) && Object.isFrozen(s.themes[0]) && Object.isFrozen(s.supportingEvidence[0]))
  assert.throws(() => { s.summary = 'x' })
  assert.throws(() => s.themes.push({}))
})

// ── exports ──────────────────────────────────────────────────────────────────────────

test('exports', () => {
  assert.equal(typeof synthesizeCoachMemories, 'function')
})
