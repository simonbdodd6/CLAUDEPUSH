/**
 * M109 — Coach Memory retrieval planner tests
 *
 * Deterministic tests for the pure, dormant planner: valid request, normalization (trim),
 * deduplication (types/tags/ontologyTargets), minimumScore/limit clamping, sort validation,
 * invalid types/ontology kinds/sort rejection, no mutation, determinism, deep-frozen output,
 * complexity estimate, and exports. Structured requests only — no English, no store.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createCoachMemoryQueryPlan,
  COACH_MEMORY_SORTS,
} from '../packages/coach-memory/index.js'

// ── valid request ────────────────────────────────────────────────────────────────────

test('valid request → filters / retrieval / complexity', () => {
  const plan = createCoachMemoryQueryPlan({
    types: ['selection-preference', 'tactical-preference'],
    ontologyTargets: [{ kind: 'player', id: 'player-9' }],
    tags: ['back-row'],
    minimumScore: 0.4,
    limit: 25,
    sort: 'confidence',
  })
  assert.deepEqual(plan.filters.types, ['selection-preference', 'tactical-preference'])
  assert.deepEqual(plan.filters.ontologyTargets, [{ kind: 'player', id: 'player-9' }])
  assert.deepEqual(plan.filters.tags, ['back-row'])
  assert.equal(plan.filters.minimumScore, 0.4)
  assert.deepEqual(plan.retrieval, { limit: 25, sort: 'confidence' })
  assert.equal(plan.estimatedComplexity, 'medium')
})

test('empty request → defaults (limit 10, sort score, minScore 0, low complexity)', () => {
  const plan = createCoachMemoryQueryPlan()
  assert.deepEqual(plan.filters, { types: [], ontologyTargets: [], tags: [], minimumScore: 0 })
  assert.deepEqual(plan.retrieval, { limit: 10, sort: 'score' })
  assert.equal(plan.estimatedComplexity, 'low')
})

// ── normalization / dedup ────────────────────────────────────────────────────────────

test('normalization trims tags and ontology ids', () => {
  const plan = createCoachMemoryQueryPlan({
    tags: ['  back-row  ', ' breakdown'],
    ontologyTargets: [{ kind: 'player', id: '  player-9  ' }],
  })
  assert.deepEqual(plan.filters.tags, ['back-row', 'breakdown'])
  assert.deepEqual(plan.filters.ontologyTargets, [{ kind: 'player', id: 'player-9' }])
})

test('deduplication preserves first-seen order (types, tags, ontology targets)', () => {
  const plan = createCoachMemoryQueryPlan({
    types: ['philosophy', 'philosophy', 'risk-warning'],
    tags: [' a ', 'b', 'a', 'b ', 'c'],
    ontologyTargets: [
      { kind: 'player', id: ' p1 ' },
      { kind: 'player', id: 'p1' },     // dup after trim
      { kind: 'tactic', id: 'p1' },     // different kind, kept
    ],
  })
  assert.deepEqual(plan.filters.types, ['philosophy', 'risk-warning'])
  assert.deepEqual(plan.filters.tags, ['a', 'b', 'c'])
  assert.deepEqual(plan.filters.ontologyTargets, [{ kind: 'player', id: 'p1' }, { kind: 'tactic', id: 'p1' }])
})

// ── clamping ─────────────────────────────────────────────────────────────────────────

test('clamp minimumScore to [0,1]', () => {
  assert.equal(createCoachMemoryQueryPlan({ minimumScore: -3 }).filters.minimumScore, 0)
  assert.equal(createCoachMemoryQueryPlan({ minimumScore: 5 }).filters.minimumScore, 1)
  assert.equal(createCoachMemoryQueryPlan({ minimumScore: 0.55 }).filters.minimumScore, 0.55)
})

test('clamp limit to [1,100] (integer)', () => {
  assert.equal(createCoachMemoryQueryPlan({ limit: 0 }).retrieval.limit, 1)
  assert.equal(createCoachMemoryQueryPlan({ limit: 500 }).retrieval.limit, 100)
  assert.equal(createCoachMemoryQueryPlan({ limit: 10.9 }).retrieval.limit, 10)   // clamp + floor
  assert.equal(createCoachMemoryQueryPlan({ limit: 0.4 }).retrieval.limit, 1)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid types → TypeError', () => {
  assert.throws(() => createCoachMemoryQueryPlan({ types: ['nope'] }), TypeError)
  assert.throws(() => createCoachMemoryQueryPlan({ types: 'philosophy' }), TypeError)
})

test('invalid ontology kinds → TypeError', () => {
  assert.throws(() => createCoachMemoryQueryPlan({ ontologyTargets: [{ kind: 'referee', id: 'x' }] }), TypeError)
  assert.throws(() => createCoachMemoryQueryPlan({ ontologyTargets: [{ kind: 'player', id: '' }] }), TypeError)
  assert.throws(() => createCoachMemoryQueryPlan({ ontologyTargets: ['x'] }), TypeError)
})

test('invalid sort → TypeError', () => {
  assert.throws(() => createCoachMemoryQueryPlan({ sort: 'relevance' }), TypeError)
  assert.throws(() => createCoachMemoryQueryPlan({ sort: 5 }), TypeError)
})

test('invalid numeric / shape inputs → TypeError', () => {
  assert.throws(() => createCoachMemoryQueryPlan(null), TypeError)
  assert.throws(() => createCoachMemoryQueryPlan([]), TypeError)
  assert.throws(() => createCoachMemoryQueryPlan({ minimumScore: 'high' }), TypeError)
  assert.throws(() => createCoachMemoryQueryPlan({ limit: 'ten' }), TypeError)
  assert.throws(() => createCoachMemoryQueryPlan({ tags: [1, 2] }), TypeError)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate the input request', () => {
  const req = { types: ['philosophy', 'philosophy'], tags: ['  a  ', 'a'], ontologyTargets: [{ kind: 'player', id: ' p ' }], limit: 999 }
  const before = JSON.stringify(req)
  createCoachMemoryQueryPlan(req)
  assert.equal(JSON.stringify(req), before)
})

test('deterministic — identical request → identical plan', () => {
  const req = { types: ['philosophy'], tags: ['a', 'b'], minimumScore: 0.3, limit: 20, sort: 'weight' }
  assert.deepEqual(createCoachMemoryQueryPlan(req), createCoachMemoryQueryPlan(req))
})

test('plan is deeply frozen', () => {
  const plan = createCoachMemoryQueryPlan({ types: ['philosophy'], tags: ['a'], ontologyTargets: [{ kind: 'player', id: 'p' }] })
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.filters) && Object.isFrozen(plan.retrieval) &&
    Object.isFrozen(plan.filters.types) && Object.isFrozen(plan.filters.tags) &&
    Object.isFrozen(plan.filters.ontologyTargets) && Object.isFrozen(plan.filters.ontologyTargets[0]))
  assert.throws(() => { plan.retrieval.limit = 1 })
  assert.throws(() => plan.filters.tags.push('x'))
})

// ── complexity ───────────────────────────────────────────────────────────────────────

test('complexity calculation — low / medium / high', () => {
  // low: no filters at all
  assert.equal(createCoachMemoryQueryPlan({ minimumScore: 0.5, limit: 50 }).estimatedComplexity, 'low')
  // medium: some filters under the high thresholds
  assert.equal(createCoachMemoryQueryPlan({ tags: ['a', 'b'] }).estimatedComplexity, 'medium')
  // high: types > 3
  assert.equal(createCoachMemoryQueryPlan({ types: ['philosophy', 'risk-warning', 'learned-pattern', 'player-management'] }).estimatedComplexity, 'high')
  // high: tags > 8
  assert.equal(createCoachMemoryQueryPlan({ tags: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] }).estimatedComplexity, 'high')
  // high: ontologyTargets > 5
  assert.equal(createCoachMemoryQueryPlan({
    ontologyTargets: [1, 2, 3, 4, 5, 6].map(n => ({ kind: 'player', id: `p${n}` })),
  }).estimatedComplexity, 'high')
})

test('complexity uses normalized (deduped) counts', () => {
  // 9 raw tags but only 2 distinct → medium, not high
  const plan = createCoachMemoryQueryPlan({ tags: ['a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'b'] })
  assert.equal(plan.filters.tags.length, 2)
  assert.equal(plan.estimatedComplexity, 'medium')
})

// ── exports ──────────────────────────────────────────────────────────────────────────

test('exports', () => {
  assert.equal(typeof createCoachMemoryQueryPlan, 'function')
  assert.deepEqual(COACH_MEMORY_SORTS, ['score', 'confidence', 'weight', 'createdAt'])
})
