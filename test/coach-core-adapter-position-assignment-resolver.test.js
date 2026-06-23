/**
 * coach-core-adapter — Coverage → Assignment Position Resolver tests
 *
 * Splits coarse-family candidates across specific formation positions: flanker/centre/wing
 * splits, multiple candidates, insufficient/excess slots, playerId tie-break, no mutation,
 * determinism, deep freeze, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolvePositionAssignments, DEFAULT_FORMATION } from '../packages/coach-core-adapter/index.js'

const candidate = (playerId, position, confidence = 0.5, availability = true) => ({ playerId, position, availability, confidence })
const posOf = (result, playerId) => (result.assignments.find((a) => a.playerId === playerId) || {}).position

// ── family splits ────────────────────────────────────────────────────────────────────

test('flanker split — Blindside then Openside by playerId order', () => {
  const r = resolvePositionAssignments([candidate('f1', 'Flanker'), candidate('f2', 'Flanker')], DEFAULT_FORMATION)
  assert.equal(posOf(r, 'f1'), 'Blindside')
  assert.equal(posOf(r, 'f2'), 'Openside')
  assert.deepEqual(r.unresolved, [])
})

test('centre split — InsideCentre then OutsideCentre', () => {
  const r = resolvePositionAssignments([candidate('c1', 'Centre'), candidate('c2', 'Centre')], DEFAULT_FORMATION)
  assert.equal(posOf(r, 'c1'), 'InsideCentre')
  assert.equal(posOf(r, 'c2'), 'OutsideCentre')
})

test('wing split — LeftWing then RightWing', () => {
  const r = resolvePositionAssignments([candidate('w1', 'Wing'), candidate('w2', 'Wing')], DEFAULT_FORMATION)
  assert.equal(posOf(r, 'w1'), 'LeftWing')
  assert.equal(posOf(r, 'w2'), 'RightWing')
})

// ── multiple families + passthrough ──────────────────────────────────────────────────

test('multiple coarse candidates across families; specific positions pass through unchanged', () => {
  const r = resolvePositionAssignments([
    candidate('h1', 'Hooker'), candidate('f1', 'Flanker'), candidate('w1', 'Wing'),
    candidate('c1', 'Centre'), candidate('f2', 'Flanker'),
  ], DEFAULT_FORMATION)
  assert.equal(posOf(r, 'h1'), 'Hooker')        // non-coarse unchanged
  assert.equal(posOf(r, 'f1'), 'Blindside')
  assert.equal(posOf(r, 'f2'), 'Openside')
  assert.equal(posOf(r, 'w1'), 'LeftWing')
  assert.equal(posOf(r, 'c1'), 'InsideCentre')
  assert.equal(r.metadata.candidateCount, 5)
  assert.equal(r.metadata.assignedCount, 5)
  assert.equal(r.metadata.unresolvedCount, 0)
})

// ── insufficient / excess ────────────────────────────────────────────────────────────

test('insufficient candidates — one flanker fills only Blindside, no unresolved', () => {
  const r = resolvePositionAssignments([candidate('f1', 'Flanker')], DEFAULT_FORMATION)
  assert.equal(posOf(r, 'f1'), 'Blindside')
  assert.deepEqual(r.unresolved, [])
})

test('excess candidates — third flanker goes to unresolved', () => {
  const r = resolvePositionAssignments([candidate('f1', 'Flanker'), candidate('f2', 'Flanker'), candidate('f3', 'Flanker')], DEFAULT_FORMATION)
  assert.equal(posOf(r, 'f1'), 'Blindside')
  assert.equal(posOf(r, 'f2'), 'Openside')
  assert.equal(r.unresolved.length, 1)
  assert.equal(r.unresolved[0].playerId, 'f3')
  assert.equal(r.unresolved[0].position, 'Flanker')          // original coarse position retained
  assert.equal(r.unresolved[0].reason, 'no open assignment')
})

// ── tie-break ────────────────────────────────────────────────────────────────────────

test('assignment order is by playerId ascending regardless of input order', () => {
  const r = resolvePositionAssignments([candidate('zeb', 'Flanker'), candidate('amy', 'Flanker')], DEFAULT_FORMATION)
  assert.equal(posOf(r, 'amy'), 'Blindside')   // amy < zeb → first slot
  assert.equal(posOf(r, 'zeb'), 'Openside')
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('malformed candidate / formation → TypeError', () => {
  assert.throws(() => resolvePositionAssignments('nope', DEFAULT_FORMATION), TypeError)
  assert.throws(() => resolvePositionAssignments([{ playerId: 'a' }], DEFAULT_FORMATION), TypeError)
  assert.throws(() => resolvePositionAssignments([candidate('dup', 'Flanker'), candidate('dup', 'Wing')], DEFAULT_FORMATION), TypeError)
  assert.throws(() => resolvePositionAssignments([candidate('a', 'Flanker')], {}), TypeError)
  assert.throws(() => resolvePositionAssignments([candidate('a', 'Flanker')], { 6: '' }), TypeError)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate inputs', () => {
  const candidates = [candidate('f1', 'Flanker'), candidate('f2', 'Flanker')]
  const before = JSON.stringify(candidates)
  resolvePositionAssignments(candidates, DEFAULT_FORMATION)
  assert.equal(JSON.stringify(candidates), before)   // positions still "Flanker"
})

test('deterministic — identical input → identical result', () => {
  const candidates = [candidate('f1', 'Flanker'), candidate('w1', 'Wing'), candidate('c1', 'Centre')]
  assert.deepEqual(resolvePositionAssignments(candidates, DEFAULT_FORMATION), resolvePositionAssignments(candidates, DEFAULT_FORMATION))
})

test('output is deeply frozen', () => {
  const r = resolvePositionAssignments([candidate('f1', 'Flanker'), candidate('f2', 'Flanker'), candidate('f3', 'Flanker')], DEFAULT_FORMATION)
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.assignments) && Object.isFrozen(r.unresolved) && Object.isFrozen(r.metadata) &&
    Object.isFrozen(r.assignments[0]) && Object.isFrozen(r.unresolved[0]))
  assert.throws(() => r.assignments.push({}))
  assert.throws(() => { r.metadata.assignedCount = 0 })
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof resolvePositionAssignments, 'function')
})
