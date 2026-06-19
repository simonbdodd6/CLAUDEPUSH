/**
 * M111 — Coach Memory learning assessment tests
 *
 * Deterministic tests for the pure, dormant Coach DNA learning step: should/should-not
 * remember, evidence/ontology requirements, type boost/suppress (importance + reasons),
 * optional-array defaults, validation (candidate/policy/type/source/confidence/weight/
 * boost-suppress types), no mutation, determinism, deep-frozen output, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { assessCoachMemoryCandidate } from '../packages/coach-memory/index.js'

const close = (a, b) => Math.abs(a - b) < 1e-9

const candidate = (over = {}) => ({
  type: 'learned-pattern',
  statement: 'Opposition tends to fold under sustained phase pressure.',
  confidence: 0.9,
  weight: 0.8,
  source: 'match-note',
  tags: [],
  ontologyLinks: [],
  evidenceRefs: [],
  ...over,
})

// ── should / should not remember ─────────────────────────────────────────────────────

test('valid candidate should remember (meets default threshold)', () => {
  // 0.9*0.45 + 0.8*0.25 = 0.405 + 0.2 = 0.605 >= 0.6
  const r = assessCoachMemoryCandidate(candidate())
  assert.equal(r.shouldRemember, true)
  assert.ok(close(r.importance, 0.605))
  assert.deepEqual(r.reasons, ['Importance meets policy threshold.'])
})

test('below threshold should not remember', () => {
  const r = assessCoachMemoryCandidate(candidate({ confidence: 0.1, weight: 0.1 }))
  assert.equal(r.shouldRemember, false)
  assert.deepEqual(r.reasons, ['Importance below policy threshold.'])
})

// ── evidence / ontology requirements ─────────────────────────────────────────────────

test('require evidence blocks (importance OK but no evidence)', () => {
  const r = assessCoachMemoryCandidate(candidate(), { requireEvidence: true })
  assert.equal(r.shouldRemember, false)
  assert.deepEqual(r.reasons, ['Evidence is required.'])   // threshold met → no "below threshold"
})

test('require evidence satisfied when evidence present', () => {
  const r = assessCoachMemoryCandidate(candidate({ evidenceRefs: ['ev_1'] }), { requireEvidence: true })
  assert.equal(r.shouldRemember, true)
})

test('require ontology link blocks (importance OK but no ontology link)', () => {
  const r = assessCoachMemoryCandidate(candidate(), { requireOntologyLink: true })
  assert.equal(r.shouldRemember, false)
  assert.deepEqual(r.reasons, ['Ontology link is required.'])
})

test('multiple failures ordered: threshold, evidence, ontology', () => {
  const r = assessCoachMemoryCandidate(candidate({ confidence: 0.1, weight: 0.1 }),
    { requireEvidence: true, requireOntologyLink: true })
  assert.equal(r.shouldRemember, false)
  assert.deepEqual(r.reasons, ['Importance below policy threshold.', 'Evidence is required.', 'Ontology link is required.'])
})

// ── boost / suppress ─────────────────────────────────────────────────────────────────

test('boost type increases importance by 0.1', () => {
  const base = assessCoachMemoryCandidate(candidate({ confidence: 0.5, weight: 0.5 }))
  const boosted = assessCoachMemoryCandidate(candidate({ confidence: 0.5, weight: 0.5 }), { boostTypes: ['learned-pattern'] })
  assert.ok(close(boosted.importance - base.importance, 0.1))
})

test('suppress type decreases importance by 0.1', () => {
  const base = assessCoachMemoryCandidate(candidate({ confidence: 0.5, weight: 0.5 }))
  const suppressed = assessCoachMemoryCandidate(candidate({ confidence: 0.5, weight: 0.5 }), { suppressTypes: ['learned-pattern'] })
  assert.ok(close(base.importance - suppressed.importance, 0.1))
})

test('boost and suppress reasons appear after threshold reasons', () => {
  // boosted + remembered → threshold reason first, then boost reason
  const boosted = assessCoachMemoryCandidate(candidate(), { boostTypes: ['learned-pattern'] })
  assert.deepEqual(boosted.reasons, ['Importance meets policy threshold.', 'Type boost applied.'])

  // suppressed enough to drop below threshold → failure reason first, then suppress reason
  const suppressed = assessCoachMemoryCandidate(candidate({ confidence: 0.5, weight: 0.45 }), { suppressTypes: ['learned-pattern'] })
  // 0.5*0.45 + 0.45*0.25 - 0.1 = 0.225 + 0.1125 - 0.1 = 0.2375 < 0.6
  assert.equal(suppressed.shouldRemember, false)
  assert.deepEqual(suppressed.reasons, ['Importance below policy threshold.', 'Type suppression applied.'])
})

// ── optional arrays default to [] ────────────────────────────────────────────────────

test('optional arrays default to [] (tags/ontologyLinks/evidenceRefs omitted)', () => {
  const c = { type: 'philosophy', statement: 's', confidence: 0.9, weight: 0.8, source: 'manual' }
  const r = assessCoachMemoryCandidate(c)
  assert.ok(close(r.importance, 0.605))   // no array contributions
  assert.equal(r.shouldRemember, true)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid candidate rejection', () => {
  assert.throws(() => assessCoachMemoryCandidate(null), TypeError)
  assert.throws(() => assessCoachMemoryCandidate({}), TypeError)
  assert.throws(() => assessCoachMemoryCandidate(candidate({ statement: '' })), TypeError)
  assert.throws(() => assessCoachMemoryCandidate(candidate({ tags: 'x' })), TypeError)
  assert.throws(() => assessCoachMemoryCandidate(candidate({ ontologyLinks: [{ kind: 'referee', id: 'x' }] })), TypeError)
})

test('invalid type / source rejection', () => {
  assert.throws(() => assessCoachMemoryCandidate(candidate({ type: 'nope' })), TypeError)
  assert.throws(() => assessCoachMemoryCandidate(candidate({ source: 'tweet' })), TypeError)
})

test('invalid confidence / weight rejection', () => {
  assert.throws(() => assessCoachMemoryCandidate(candidate({ confidence: 1.5 })), TypeError)
  assert.throws(() => assessCoachMemoryCandidate(candidate({ weight: -0.2 })), TypeError)
  assert.throws(() => assessCoachMemoryCandidate(candidate({ confidence: '0.9' })), TypeError)
})

test('invalid policy rejection', () => {
  assert.throws(() => assessCoachMemoryCandidate(candidate(), null), TypeError)
  assert.throws(() => assessCoachMemoryCandidate(candidate(), [1, 2]), TypeError)
  assert.throws(() => assessCoachMemoryCandidate(candidate(), { minimumImportance: 'high' }), TypeError)
  assert.throws(() => assessCoachMemoryCandidate(candidate(), { requireEvidence: 'yes' }), TypeError)
  assert.throws(() => assessCoachMemoryCandidate(candidate(), { requireOntologyLink: 1 }), TypeError)
})

test('invalid boost / suppress type rejection', () => {
  assert.throws(() => assessCoachMemoryCandidate(candidate(), { boostTypes: ['nope'] }), TypeError)
  assert.throws(() => assessCoachMemoryCandidate(candidate(), { suppressTypes: ['nope'] }), TypeError)
  assert.throws(() => assessCoachMemoryCandidate(candidate(), { boostTypes: 'learned-pattern' }), TypeError)
})

test('unknown fields are ignored (not errors)', () => {
  const r = assessCoachMemoryCandidate(candidate({ extra: 'ignore-me' }), { somethingElse: true })
  assert.equal(r.shouldRemember, true)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate the candidate or policy', () => {
  const c = candidate({ tags: ['a'], evidenceRefs: ['ev'] })
  const policy = { boostTypes: ['learned-pattern'] }
  const beforeC = JSON.stringify(c)
  const beforeP = JSON.stringify(policy)
  assessCoachMemoryCandidate(c, policy)
  assert.equal(JSON.stringify(c), beforeC)
  assert.equal(JSON.stringify(policy), beforeP)
})

test('deterministic — identical inputs → identical assessment', () => {
  const c = candidate({ tags: ['a', 'b'] })
  const policy = { minimumImportance: 0.5, boostTypes: ['learned-pattern'] }
  assert.deepEqual(assessCoachMemoryCandidate(c, policy), assessCoachMemoryCandidate(c, policy))
})

test('output is deeply frozen', () => {
  const r = assessCoachMemoryCandidate(candidate(), { boostTypes: ['learned-pattern'] })
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.reasons))
  assert.throws(() => { r.shouldRemember = false })
  assert.throws(() => r.reasons.push('x'))
})

// ── exports ──────────────────────────────────────────────────────────────────────────

test('exports', () => {
  assert.equal(typeof assessCoachMemoryCandidate, 'function')
})
