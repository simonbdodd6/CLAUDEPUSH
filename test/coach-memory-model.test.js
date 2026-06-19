/**
 * M108 — Coach Memory model tests
 *
 * Deterministic tests for the pure, dormant Coach Memory IP layer: validation, normalization
 * (trim + dedupe, no mutation, deep frozen), scoring (exact formula, clamp, counts), the
 * adapter contract, and index exports. Imported via relative path (the package is not
 * workspace-linked yet — no install, fully dormant).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  validateCoachMemoryEntry,
  normalizeCoachMemoryEntry,
  scoreCoachMemoryEntry,
  createCoachMemoryStoreContract,
  COACH_MEMORY_TYPES,
  COACH_MEMORY_SOURCES,
  ONTOLOGY_KINDS,
} from '../packages/coach-memory/index.js'

const close = (a, b) => Math.abs(a - b) < 1e-9

const validEntry = (over = {}) => ({
  id: 'cm_1',
  coachId: 'coach_1',
  clubId: 'club_1',
  type: 'selection-preference',
  statement: 'Prefer a specialist openside at 7 against fast ball.',
  source: 'selection-decision',
  confidence: 0.8,
  weight: 0.6,
  tags: ['back-row', 'breakdown'],
  ontologyLinks: [{ kind: 'player', id: 'player-9' }, { kind: 'tactic', id: 'jackal' }],
  evidenceRefs: ['ev_1', 'ev_2', 'ev_3'],
  createdAt: '2026-06-16T09:30:00.000Z',
  ...over,
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('valid memory entry passes validation', () => {
  assert.equal(validateCoachMemoryEntry(validEntry()), true)
})

test('invalid missing fields reject', () => {
  for (const field of ['id', 'coachId', 'clubId', 'statement', 'createdAt']) {
    const e = validEntry(); delete e[field]
    assert.throws(() => validateCoachMemoryEntry(e), TypeError)
  }
  assert.throws(() => validateCoachMemoryEntry(null), TypeError)
  assert.throws(() => validateCoachMemoryEntry([]), TypeError)
})

test('invalid type reject', () => {
  assert.throws(() => validateCoachMemoryEntry(validEntry({ type: 'nope' })), TypeError)
  assert.throws(() => validateCoachMemoryEntry(validEntry({ type: undefined })), TypeError)
})

test('invalid source reject', () => {
  assert.throws(() => validateCoachMemoryEntry(validEntry({ source: 'tweet' })), TypeError)
})

test('invalid confidence/weight reject', () => {
  assert.throws(() => validateCoachMemoryEntry(validEntry({ confidence: 1.2 })), TypeError)
  assert.throws(() => validateCoachMemoryEntry(validEntry({ confidence: -0.1 })), TypeError)
  assert.throws(() => validateCoachMemoryEntry(validEntry({ confidence: '0.8' })), TypeError)
  assert.throws(() => validateCoachMemoryEntry(validEntry({ weight: 2 })), TypeError)
})

test('invalid ontology kind reject', () => {
  assert.throws(() => validateCoachMemoryEntry(validEntry({ ontologyLinks: [{ kind: 'referee', id: 'x' }] })), TypeError)
  assert.throws(() => validateCoachMemoryEntry(validEntry({ ontologyLinks: [{ kind: 'player', id: '' }] })), TypeError)
  assert.throws(() => validateCoachMemoryEntry(validEntry({ ontologyLinks: ['not-an-object'] })), TypeError)
})

test('invalid tags / evidenceRefs reject', () => {
  assert.throws(() => validateCoachMemoryEntry(validEntry({ tags: 'a,b' })), TypeError)
  assert.throws(() => validateCoachMemoryEntry(validEntry({ tags: [1, 2] })), TypeError)
  assert.throws(() => validateCoachMemoryEntry(validEntry({ evidenceRefs: [null] })), TypeError)
})

// ── normalization ────────────────────────────────────────────────────────────────────

test('normalization trims statement', () => {
  const n = normalizeCoachMemoryEntry(validEntry({ statement: '   trim me   ' }))
  assert.equal(n.statement, 'trim me')
})

test('normalization dedupes tags (trim + first-seen order)', () => {
  const n = normalizeCoachMemoryEntry(validEntry({ tags: [' a ', 'b', 'a', ' b', 'c'] }))
  assert.deepEqual(n.tags, ['a', 'b', 'c'])
})

test('normalization dedupes evidence refs (trim + first-seen order)', () => {
  const n = normalizeCoachMemoryEntry(validEntry({ evidenceRefs: ['ev_1', ' ev_2 ', 'ev_1', 'ev_2'] }))
  assert.deepEqual(n.evidenceRefs, ['ev_1', 'ev_2'])
})

test('normalization dedupes ontology links by kind:id (trim id, first-seen order)', () => {
  const n = normalizeCoachMemoryEntry(validEntry({
    ontologyLinks: [
      { kind: 'player', id: ' player-9 ' },
      { kind: 'player', id: 'player-9' },   // dup after trim
      { kind: 'tactic', id: 'player-9' },    // different kind, kept
      { kind: 'tactic', id: 'jackal' },
    ],
  }))
  assert.deepEqual(n.ontologyLinks, [
    { kind: 'player', id: 'player-9' },
    { kind: 'tactic', id: 'player-9' },
    { kind: 'tactic', id: 'jackal' },
  ])
})

test('normalization does not mutate input', () => {
  const e = validEntry({ statement: '  x  ', tags: ['a', 'a'] })
  const before = JSON.stringify(e)
  normalizeCoachMemoryEntry(e)
  assert.equal(JSON.stringify(e), before)
})

test('normalized output deeply frozen', () => {
  const n = normalizeCoachMemoryEntry(validEntry())
  assert.ok(Object.isFrozen(n) && Object.isFrozen(n.tags) && Object.isFrozen(n.evidenceRefs) &&
    Object.isFrozen(n.ontologyLinks) && Object.isFrozen(n.ontologyLinks[0]))
  assert.throws(() => { n.statement = 'x' })
  assert.throws(() => n.tags.push('x'))
})

test('normalization rejects invalid input (validates first)', () => {
  assert.throws(() => normalizeCoachMemoryEntry(validEntry({ type: 'nope' })), TypeError)
})

// ── scoring ──────────────────────────────────────────────────────────────────────────

test('scoring formula exact', () => {
  // confidence 0.8, weight 0.6, evidence 3, ontology 2, tags 4
  // 0.8*0.5 + 0.6*0.3 + (3/5)*0.1 + (2/5)*0.05 + (4/5)*0.05 = 0.4+0.18+0.06+0.02+0.04 = 0.70
  const s = scoreCoachMemoryEntry(validEntry({ tags: ['a', 'b', 'c', 'd'] }))
  assert.ok(close(s.score, 0.70))
})

test('scoring clamps to 0..1', () => {
  const hi = scoreCoachMemoryEntry(validEntry({ confidence: 2, weight: 2, tags: ['a', 'b', 'c', 'd', 'e', 'f'] }))
  assert.equal(hi.score, 1)
  const lo = scoreCoachMemoryEntry(validEntry({ confidence: -5, weight: -5, evidenceRefs: [], ontologyLinks: [], tags: [] }))
  assert.equal(lo.score, 0)
})

test('scoring counts evidence/ontology/tags + passes through confidence/weight', () => {
  const s = scoreCoachMemoryEntry(validEntry())
  assert.equal(s.evidenceCount, 3)
  assert.equal(s.ontologyLinkCount, 2)
  assert.equal(s.tagCount, 2)
  assert.equal(s.confidence, 0.8)
  assert.equal(s.weight, 0.6)
  assert.ok(Object.isFrozen(s))
})

test('scoring caps array contributions at 5', () => {
  const few = scoreCoachMemoryEntry(validEntry({ evidenceRefs: ['1', '2', '3', '4', '5'] }))
  const many = scoreCoachMemoryEntry(validEntry({ evidenceRefs: ['1', '2', '3', '4', '5', '6', '7'] }))
  assert.ok(close(few.score, many.score))   // both saturate at min(n,5)=5
})

// ── adapter contract ─────────────────────────────────────────────────────────────────

test('adapter contract returns expected methods', () => {
  const c = createCoachMemoryStoreContract()
  assert.deepEqual(c.methods, ['upsertCoachMemory', 'getCoachMemory', 'searchCoachMemory', 'listCoachMemories', 'deleteCoachMemory'])
})

test('adapter contract returns tenant/data safety guarantees', () => {
  const c = createCoachMemoryStoreContract()
  assert.ok(c.guarantees.some(g => /tenant boundaries/.test(g)))
  assert.ok(c.guarantees.some(g => /not expose one club's memory to another club/.test(g)))
  assert.ok(c.guarantees.some(g => /preserve evidenceRefs/.test(g)))
  assert.ok(c.guarantees.some(g => /preserve ontologyLinks/.test(g)))
  assert.ok(c.guarantees.some(g => /deterministic ordering for equal scores/.test(g)))
})

test('adapter contract deeply frozen', () => {
  const c = createCoachMemoryStoreContract()
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.methods) && Object.isFrozen(c.guarantees))
  assert.throws(() => c.methods.push('x'))
})

// ── exports / determinism ─────────────────────────────────────────────────────────────

test('index exports all public functions', () => {
  assert.equal(typeof validateCoachMemoryEntry, 'function')
  assert.equal(typeof normalizeCoachMemoryEntry, 'function')
  assert.equal(typeof scoreCoachMemoryEntry, 'function')
  assert.equal(typeof createCoachMemoryStoreContract, 'function')
  assert.ok(Array.isArray(COACH_MEMORY_TYPES) && Array.isArray(COACH_MEMORY_SOURCES) && Array.isArray(ONTOLOGY_KINDS))
})

test('deterministic repeated calls', () => {
  const e = validEntry()
  assert.deepEqual(normalizeCoachMemoryEntry(e), normalizeCoachMemoryEntry(e))
  assert.deepEqual(scoreCoachMemoryEntry(e), scoreCoachMemoryEntry(e))
  assert.deepEqual(createCoachMemoryStoreContract(), createCoachMemoryStoreContract())
})
