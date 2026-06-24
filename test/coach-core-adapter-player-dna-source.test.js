/**
 * coach-core-adapter — Player DNA Signal Source tests
 *
 * Maps player tags/traits/attributes to DNA affinity signals: tags/traits/attributes only,
 * mixed, dedupe, empty profile, defaults, validation, determinism, no mutation, deep freeze,
 * export, and composition with M152.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  derivePlayerDnaSignals, DEFAULT_DNA_MAPPINGS, applyPlayerDnaInfluence,
} from '../packages/coach-core-adapter/index.js'

const MAPPINGS = {
  tags: { leader: { category: 'communication-style', weight: 1 }, reliable: { category: 'selection-preference', weight: 1 }, captain: { category: 'communication-style', weight: 0.5 } },
  traits: { disciplined: { category: 'player-management', weight: 1 } },
  attributes: { experience: { high: { category: 'learned-pattern', weight: 1 }, low: { category: 'learned-pattern', weight: -1 } } },
}

// ── single sources ───────────────────────────────────────────────────────────────────

test('tags only', () => {
  const r = derivePlayerDnaSignals({ playerId: 'p1', tags: ['leader', 'reliable'] }, { mappings: MAPPINGS })
  assert.deepEqual(r.dnaSignals, [
    { category: 'communication-style', weight: 1 },   // sorted by category
    { category: 'selection-preference', weight: 1 },
  ])
})

test('traits only', () => {
  const r = derivePlayerDnaSignals({ playerId: 'p1', traits: ['disciplined'] }, { mappings: MAPPINGS })
  assert.deepEqual(r.dnaSignals, [{ category: 'player-management', weight: 1 }])
})

test('attributes only', () => {
  const r = derivePlayerDnaSignals({ playerId: 'p1', attributes: { experience: 'high' } }, { mappings: MAPPINGS })
  assert.deepEqual(r.dnaSignals, [{ category: 'learned-pattern', weight: 1 }])
})

// ── mixed + dedupe + ordering ────────────────────────────────────────────────────────

test('mixed profile combines sources, sorted by category', () => {
  const r = derivePlayerDnaSignals({ playerId: 'p1', tags: ['leader'], traits: ['disciplined'], attributes: { experience: 'low' } }, { mappings: MAPPINGS })
  assert.deepEqual(r.dnaSignals.map((s) => s.category), ['communication-style', 'learned-pattern', 'player-management'])
  assert.equal(r.dnaSignals.find((s) => s.category === 'learned-pattern').weight, -1)
})

test('duplicate categories are removed (first-seen wins)', () => {
  const r = derivePlayerDnaSignals({ playerId: 'p1', tags: ['leader', 'captain'] }, { mappings: MAPPINGS })
  assert.deepEqual(r.dnaSignals, [{ category: 'communication-style', weight: 1 }])   // leader (1) kept, captain (0.5) dropped
  assert.equal(r.metadata.duplicatesRemoved, 1)
})

// ── empty / defaults ─────────────────────────────────────────────────────────────────

test('empty profile → empty dnaSignals', () => {
  const r = derivePlayerDnaSignals({ playerId: 'p1' }, { mappings: MAPPINGS })
  assert.deepEqual(r.dnaSignals, [])
  assert.equal(r.metadata.signalCount, 0)
})

test('default mappings are used when none supplied', () => {
  const r = derivePlayerDnaSignals({ playerId: 'p1', tags: ['leader'] })
  assert.deepEqual(r.dnaSignals, [{ category: 'communication-style', weight: 1 }])
  assert.equal(DEFAULT_DNA_MAPPINGS.tags.leader.category, 'communication-style')
})

// ── metadata ─────────────────────────────────────────────────────────────────────────

test('metadata explains the source mappings used', () => {
  const r = derivePlayerDnaSignals({ playerId: 'p1', tags: ['leader'], attributes: { experience: 'high' } }, { mappings: MAPPINGS })
  assert.deepEqual(r.metadata.sources.map((s) => s.source).sort(), ['attribute:experience=high', 'tag:leader'])
  assert.equal(r.metadata.tagCount, 1)
  assert.equal(r.metadata.attributeCount, 1)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid input → TypeError', () => {
  assert.throws(() => derivePlayerDnaSignals(null), TypeError)
  assert.throws(() => derivePlayerDnaSignals({}), TypeError)                                            // no playerId
  assert.throws(() => derivePlayerDnaSignals({ playerId: 'p', tags: [1] }), TypeError)                  // non-string tag
  assert.throws(() => derivePlayerDnaSignals({ playerId: 'p', attributes: { x: 5 } }), TypeError)       // non-string attribute value
  assert.throws(() => derivePlayerDnaSignals({ playerId: 'p', tags: ['leader'] }, { mappings: { tags: { leader: { category: 'x' } } } }), TypeError)   // malformed mapping (no weight)
  assert.throws(() => derivePlayerDnaSignals({ playerId: 'p' }, { mappings: { tags: 'nope' } }), TypeError)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('deterministic — identical input → identical output', () => {
  const profile = { playerId: 'p1', tags: ['leader', 'reliable'], attributes: { experience: 'high' } }
  assert.deepEqual(derivePlayerDnaSignals(profile, { mappings: MAPPINGS }), derivePlayerDnaSignals(profile, { mappings: MAPPINGS }))
})

test('does not mutate inputs', () => {
  const profile = { playerId: 'p1', tags: ['leader'], attributes: { experience: 'high' } }
  const before = [JSON.stringify(profile), JSON.stringify(MAPPINGS)]
  derivePlayerDnaSignals(profile, { mappings: MAPPINGS })
  assert.deepEqual([JSON.stringify(profile), JSON.stringify(MAPPINGS)], before)
})

test('output is deeply frozen', () => {
  const r = derivePlayerDnaSignals({ playerId: 'p1', tags: ['leader'] }, { mappings: MAPPINGS })
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.dnaSignals) && Object.isFrozen(r.metadata) && Object.isFrozen(r.dnaSignals[0]))
  assert.throws(() => r.dnaSignals.push({}))
  assert.throws(() => { r.metadata.signalCount = 9 })
})

// ── composition with M152 ────────────────────────────────────────────────────────────

test('derived dnaSignals feed M152 applyPlayerDnaInfluence', () => {
  const { dnaSignals } = derivePlayerDnaSignals({ playerId: 'p1', tags: ['leader'] }, { mappings: MAPPINGS })
  const candidate = { playerId: 'p1', position: 'ScrumHalf', availability: true, confidence: 0.5, dnaSignals }
  const profile = { profileVersion: '1.0', dominantSignals: [{ category: 'communication-style', strength: 0.8 }], balance: {}, confidence: 0.5, metadata: {} }
  const r = applyPlayerDnaInfluence(candidate, profile)
  assert.ok(r.finalConfidence > r.baseConfidence)   // the derived signal lifts confidence
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('exports exist', () => {
  assert.equal(typeof derivePlayerDnaSignals, 'function')
  assert.ok(typeof DEFAULT_DNA_MAPPINGS === 'object')
})
