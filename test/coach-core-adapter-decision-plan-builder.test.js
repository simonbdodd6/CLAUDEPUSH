/**
 * coach-core-adapter — Decision / Plan Builder tests
 *
 * Builds the M118 intelligence input { plan, decision, metadata } from fixture/match/coach
 * context: defaults, fixture metadata, match mapping, coachContext tags/targets, deterministic
 * dedupe/sort, options overrides, validation, no mutation, determinism, deep freeze, exports.
 * Also confirms the built plan is a valid M109 request.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildDecisionPlanContext } from '../packages/coach-core-adapter/index.js'
import { createCoachMemoryQueryPlan } from '../packages/coach-memory/index.js'

// ── defaults ─────────────────────────────────────────────────────────────────────────

test('default context → default plan + decision + null metadata', () => {
  const r = buildDecisionPlanContext({})
  assert.deepEqual(r.plan, {
    types: ['selection-preference', 'tactical-preference', 'learned-pattern', 'risk-warning'],
    ontologyTargets: [], tags: [], minimumScore: 0, limit: 25, sort: 'score',
  })
  assert.deepEqual(r.decision, { category: 'selection-preference', confidence: 0.5, matchedSignals: [] })
  assert.deepEqual(r.metadata, {
    fixtureId: null, opponent: null, competition: null, venue: null, deterministic: true, adapterLayer: true,
  })
})

test('the built plan is a valid M109 request', () => {
  const r = buildDecisionPlanContext({ coachContext: { tags: ['forwards'], ontologyTargets: [{ kind: 'opponent', id: 'leinster' }] } })
  assert.doesNotThrow(() => createCoachMemoryQueryPlan(r.plan))   // accepted by M109
})

// ── fixture / match / coach mapping ──────────────────────────────────────────────────

test('fixture metadata is mapped', () => {
  const r = buildDecisionPlanContext({ fixture: { fixtureId: 'fix_1', opponent: 'Leinster', competition: 'AIL', venue: 'Home', date: '2026-07-01' } })
  assert.equal(r.metadata.fixtureId, 'fix_1')
  assert.equal(r.metadata.opponent, 'Leinster')
  assert.equal(r.metadata.competition, 'AIL')
  assert.equal(r.metadata.venue, 'Home')
  assert.equal('date' in r.metadata, false)   // date is not part of metadata
})

test('match category / confidence / matchedSignals map into the decision', () => {
  const r = buildDecisionPlanContext({ match: { category: 'tactical-preference', confidence: 0.82, matchedSignals: ['kick-exit', 'lineout'] } })
  assert.deepEqual(r.decision, { category: 'tactical-preference', confidence: 0.82, matchedSignals: ['kick-exit', 'lineout'] })
})

test('coachContext tags feed the plan', () => {
  const r = buildDecisionPlanContext({ coachContext: { tags: ['forwards', 'set-piece'] } })
  assert.deepEqual(r.plan.tags, ['forwards', 'set-piece'])
})

test('coachContext ontologyTargets feed the plan', () => {
  const r = buildDecisionPlanContext({ coachContext: { ontologyTargets: [{ kind: 'opponent', id: 'leinster' }, { kind: 'club', id: 'boitsfort' }] } })
  assert.deepEqual(r.plan.ontologyTargets, [{ kind: 'club', id: 'boitsfort' }, { kind: 'opponent', id: 'leinster' }])   // sorted by kind
})

// ── deterministic dedupe / sort ──────────────────────────────────────────────────────

test('tags, matchedSignals and ontologyTargets are deduped and sorted', () => {
  const r = buildDecisionPlanContext({
    match: { matchedSignals: ['b', 'a', 'a', 'c'] },
    coachContext: {
      tags: ['z', 'a', 'z'],
      ontologyTargets: [{ kind: 'player', id: 'p2' }, { kind: 'player', id: 'p1' }, { kind: 'player', id: 'p2' }],
    },
  })
  assert.deepEqual(r.plan.tags, ['a', 'z'])
  assert.deepEqual(r.decision.matchedSignals, ['a', 'b', 'c'])
  assert.deepEqual(r.plan.ontologyTargets, [{ kind: 'player', id: 'p1' }, { kind: 'player', id: 'p2' }])
})

// ── options overrides ────────────────────────────────────────────────────────────────

test('options override the plan defaults', () => {
  const r = buildDecisionPlanContext({}, { types: ['philosophy'], limit: 10, sort: 'confidence', minimumScore: 0.2 })
  assert.deepEqual(r.plan.types, ['philosophy'])
  assert.equal(r.plan.limit, 10)
  assert.equal(r.plan.sort, 'confidence')
  assert.equal(r.plan.minimumScore, 0.2)
})

test('options tags/ontologyTargets override coachContext', () => {
  const r = buildDecisionPlanContext(
    { coachContext: { tags: ['fromCoach'] } },
    { tags: ['fromOptions', 'a'] },
  )
  assert.deepEqual(r.plan.tags, ['a', 'fromOptions'])
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid context / options → TypeError', () => {
  assert.throws(() => buildDecisionPlanContext(null), TypeError)
  assert.throws(() => buildDecisionPlanContext([]), TypeError)
  assert.throws(() => buildDecisionPlanContext({}, []), TypeError)
})

test('malformed fixture / match / coachContext → TypeError', () => {
  assert.throws(() => buildDecisionPlanContext({ fixture: 'x' }), TypeError)
  assert.throws(() => buildDecisionPlanContext({ fixture: { opponent: 5 } }), TypeError)
  assert.throws(() => buildDecisionPlanContext({ match: 'x' }), TypeError)
  assert.throws(() => buildDecisionPlanContext({ coachContext: 'x' }), TypeError)
})

test('invalid confidence / matchedSignals / tags / ontologyTargets → TypeError', () => {
  assert.throws(() => buildDecisionPlanContext({ match: { confidence: 1.5 } }), TypeError)
  assert.throws(() => buildDecisionPlanContext({ match: { confidence: 'high' } }), TypeError)
  assert.throws(() => buildDecisionPlanContext({ match: { matchedSignals: [1, 2] } }), TypeError)
  assert.throws(() => buildDecisionPlanContext({ coachContext: { tags: [1] } }), TypeError)
  assert.throws(() => buildDecisionPlanContext({ coachContext: { ontologyTargets: [{ kind: 'opponent' }] } }), TypeError)   // missing id
  assert.throws(() => buildDecisionPlanContext({ coachContext: { ontologyTargets: [{ kind: 'not-a-kind', id: 'x' }] } }), TypeError)   // bad kind (via M109)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate inputs', () => {
  const context = { match: { matchedSignals: ['b', 'a'] }, coachContext: { tags: ['z', 'a'], ontologyTargets: [{ kind: 'club', id: 'c' }] } }
  const options = { types: ['philosophy'] }
  const before = [JSON.stringify(context), JSON.stringify(options)]
  buildDecisionPlanContext(context, options)
  assert.deepEqual([JSON.stringify(context), JSON.stringify(options)], before)
})

test('deterministic — identical input → identical output', () => {
  const context = { fixture: { opponent: 'Leinster' }, match: { matchedSignals: ['b', 'a'] } }
  assert.deepEqual(buildDecisionPlanContext(context), buildDecisionPlanContext(context))
})

test('output is deeply frozen', () => {
  const r = buildDecisionPlanContext({ coachContext: { tags: ['a'] } })
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.plan) && Object.isFrozen(r.decision) && Object.isFrozen(r.metadata) &&
    Object.isFrozen(r.plan.tags) && Object.isFrozen(r.plan.ontologyTargets) && Object.isFrozen(r.decision.matchedSignals))
  assert.throws(() => r.plan.tags.push('x'))
  assert.throws(() => { r.decision.confidence = 1 })
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof buildDecisionPlanContext, 'function')
})
