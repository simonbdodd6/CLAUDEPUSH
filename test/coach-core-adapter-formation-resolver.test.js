/**
 * coach-core-adapter — Formation & Position-Group Resolver tests
 *
 * Maps assembled candidates onto formation jerseys with coarse-position grouping: default
 * formation, exact coverage, Flanker→6/7, Wing→11/14, Centre→12/13, candidateIds ordering,
 * unresolved jerseys, custom formation/groups, validation, no mutation, determinism, frozen,
 * exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  resolveFormationFromCandidates, DEFAULT_FORMATION, DEFAULT_POSITION_GROUPS,
} from '../packages/coach-core-adapter/index.js'

const candidate = (playerId, position, confidence = 0.5, availability = true) => ({ playerId, position, availability, confidence })

const coverageFor = (result, jersey) => result.coverage.find((c) => c.jersey === jersey)

// ── defaults ─────────────────────────────────────────────────────────────────────────

test('default formation with no candidates → all jerseys unresolved', () => {
  const r = resolveFormationFromCandidates([])
  assert.equal(r.metadata.formationSize, 15)
  assert.deepEqual(r.coverage, [])
  assert.equal(r.unresolved.length, 15)
  assert.equal(r.unresolved[0].reason, 'no candidate coverage')
  assert.equal(r.formation['6'], 'Blindside')
  assert.deepEqual(r.positionGroups.Blindside, ['Blindside', 'Flanker'])
})

// ── exact coverage ───────────────────────────────────────────────────────────────────

test('exact position coverage', () => {
  const r = resolveFormationFromCandidates([candidate('h1', 'Hooker', 0.8)])
  const j2 = coverageFor(r, '2')
  assert.equal(j2.position, 'Hooker')
  assert.deepEqual(j2.candidateIds, ['h1'])
  assert.equal(j2.candidateCount, 1)
})

// ── coarse grouping ──────────────────────────────────────────────────────────────────

test('Flanker covers both Blindside (6) and Openside (7), exact Blindside only counts for 6', () => {
  const r = resolveFormationFromCandidates([candidate('f1', 'Flanker', 0.9), candidate('b1', 'Blindside', 0.8)])
  assert.deepEqual(coverageFor(r, '6').candidateIds, ['f1', 'b1'])   // Blindside accepts Blindside + Flanker
  assert.deepEqual(coverageFor(r, '7').candidateIds, ['f1'])         // Openside accepts Openside + Flanker (not Blindside)
})

test('Wing covers LeftWing (11) and RightWing (14)', () => {
  const r = resolveFormationFromCandidates([candidate('w1', 'Wing', 0.7)])
  assert.deepEqual(coverageFor(r, '11').candidateIds, ['w1'])
  assert.deepEqual(coverageFor(r, '14').candidateIds, ['w1'])
})

test('Centre covers InsideCentre (12) and OutsideCentre (13)', () => {
  const r = resolveFormationFromCandidates([candidate('c1', 'Centre', 0.7)])
  assert.deepEqual(coverageFor(r, '12').candidateIds, ['c1'])
  assert.deepEqual(coverageFor(r, '13').candidateIds, ['c1'])
})

// ── ordering ─────────────────────────────────────────────────────────────────────────

test('candidateIds sorted by confidence desc, then playerId asc', () => {
  const r = resolveFormationFromCandidates([
    candidate('zeb', 'Hooker', 0.5), candidate('amy', 'Hooker', 0.9), candidate('bob', 'Hooker', 0.5),
  ])
  assert.deepEqual(coverageFor(r, '2').candidateIds, ['amy', 'bob', 'zeb'])   // amy(0.9), then bob/zeb tie → id asc
})

// ── unresolved ───────────────────────────────────────────────────────────────────────

test('a jersey with no covering candidate is unresolved', () => {
  const r = resolveFormationFromCandidates([candidate('h1', 'Hooker', 0.8)])
  const j1 = r.unresolved.find((u) => u.jersey === '1')
  assert.equal(j1.position, 'LH')
  assert.equal(j1.reason, 'no candidate coverage')
  assert.equal(r.metadata.unresolvedCount, 14)   // 15 jerseys, only Hooker covered
})

// ── custom formation / groups ────────────────────────────────────────────────────────

test('custom formation is used and reported', () => {
  const r = resolveFormationFromCandidates([candidate('a', 'Hooker', 0.6)], { formation: { 1: 'Hooker', 2: 'Lock' } })
  assert.equal(r.metadata.formationSize, 2)
  assert.deepEqual(coverageFor(r, '1').candidateIds, ['a'])
  assert.equal(r.unresolved[0].position, 'Lock')
})

test('custom positionGroups override the defaults', () => {
  const r = resolveFormationFromCandidates(
    [candidate('u', 'Utility', 0.6)],
    { formation: { 6: 'Blindside' }, positionGroups: { Blindside: ['Blindside', 'Utility'] } },
  )
  assert.deepEqual(coverageFor(r, '6').candidateIds, ['u'])
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('duplicate playerId → TypeError', () => {
  assert.throws(() => resolveFormationFromCandidates([candidate('dup', 'Hooker'), candidate('dup', 'Lock')]), TypeError)
})

test('malformed candidate → TypeError', () => {
  assert.throws(() => resolveFormationFromCandidates('nope'), TypeError)
  assert.throws(() => resolveFormationFromCandidates([{ playerId: 'a' }]), TypeError)                                   // missing fields
  assert.throws(() => resolveFormationFromCandidates([candidate('a', 'Hooker', 'high')]), TypeError)                    // confidence not number
  assert.throws(() => resolveFormationFromCandidates([{ playerId: 'a', position: 'Hooker', availability: 'yes', confidence: 0.5 }]), TypeError)
})

test('malformed options / formation / positionGroups → TypeError', () => {
  const c = [candidate('a', 'Hooker')]
  assert.throws(() => resolveFormationFromCandidates(c, []), TypeError)
  assert.throws(() => resolveFormationFromCandidates(c, { formation: [] }), TypeError)
  assert.throws(() => resolveFormationFromCandidates(c, { formation: { 1: '' } }), TypeError)
  assert.throws(() => resolveFormationFromCandidates(c, { positionGroups: { Blindside: 'x' } }), TypeError)
  assert.throws(() => resolveFormationFromCandidates(c, { positionGroups: { Blindside: [''] } }), TypeError)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate inputs', () => {
  const candidates = [candidate('f1', 'Flanker', 0.9)]
  const options = { formation: { 6: 'Blindside', 7: 'Openside' }, positionGroups: { Blindside: ['Blindside', 'Flanker'], Openside: ['Openside', 'Flanker'] } }
  const before = [JSON.stringify(candidates), JSON.stringify(options)]
  const r = resolveFormationFromCandidates(candidates, options)
  assert.deepEqual([JSON.stringify(candidates), JSON.stringify(options)], before)
  assert.notEqual(r.formation, options.formation)        // copied, not referenced
  assert.equal(Object.isFrozen(options.formation), false)
})

test('deterministic — identical input → identical result', () => {
  const candidates = [candidate('a', 'Wing', 0.6), candidate('b', 'Centre', 0.5)]
  assert.deepEqual(resolveFormationFromCandidates(candidates), resolveFormationFromCandidates(candidates))
})

test('output is deeply frozen', () => {
  const r = resolveFormationFromCandidates([candidate('a', 'Flanker', 0.6)])
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.coverage) && Object.isFrozen(r.unresolved) &&
    Object.isFrozen(r.formation) && Object.isFrozen(r.positionGroups) && Object.isFrozen(r.metadata))
  assert.ok(Object.isFrozen(r.coverage[0]) && Object.isFrozen(r.coverage[0].candidateIds))
  assert.throws(() => r.coverage.push({}))
  assert.throws(() => { r.metadata.formationSize = 0 })
})

// ── exports ──────────────────────────────────────────────────────────────────────────

test('exports exist', () => {
  assert.equal(typeof resolveFormationFromCandidates, 'function')
  assert.equal(DEFAULT_FORMATION['9'], 'ScrumHalf')
  assert.deepEqual(DEFAULT_POSITION_GROUPS.OutsideCentre, ['OutsideCentre', 'Centre'])
})
