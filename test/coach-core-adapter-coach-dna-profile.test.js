/**
 * coach-core-adapter — Coach DNA Profile tests
 *
 * Composes an M114-compatible coach DNA profile from coach signals/tags/traits/attributes:
 * empty, single-source, mixed, ordering, duplicate aggregation, deep freeze, no mutation,
 * interface compatibility (M152 + M155), validation, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  composeCoachDnaProfile, DEFAULT_COACH_DNA_MAPPINGS, applyPlayerDnaInfluence, createDnaConfidenceProvider,
} from '../packages/coach-core-adapter/index.js'

const MAPPINGS = {
  tags: { 'forward-led': { category: 'selection-preference', strength: 0.4 }, 'risk-averse': { category: 'risk-warning', strength: 0.4 } },
  traits: { methodical: { category: 'learned-pattern', strength: 0.3 } },
  attributes: { style: { expansive: { category: 'tactical-preference', strength: 0.5 } } },
}

// ── empty / single sources ───────────────────────────────────────────────────────────

test('empty profile → no dominant signals', () => {
  const p = composeCoachDnaProfile({}, { mappings: MAPPINGS })
  assert.deepEqual(p.dominantSignals, [])
  assert.equal(p.confidence, 0)
  assert.equal(p.profileVersion, '1.0')
})

test('tags only', () => {
  const p = composeCoachDnaProfile({ tags: ['forward-led'] }, { mappings: MAPPINGS })
  assert.deepEqual(p.dominantSignals, [{ category: 'selection-preference', strength: 0.4 }])
})

test('traits only', () => {
  const p = composeCoachDnaProfile({ traits: ['methodical'] }, { mappings: MAPPINGS })
  assert.deepEqual(p.dominantSignals, [{ category: 'learned-pattern', strength: 0.3 }])
})

test('attributes only', () => {
  const p = composeCoachDnaProfile({ attributes: { style: 'expansive' } }, { mappings: MAPPINGS })
  assert.deepEqual(p.dominantSignals, [{ category: 'tactical-preference', strength: 0.5 }])
})

test('direct signals are included', () => {
  const p = composeCoachDnaProfile({ signals: [{ category: 'communication-style', strength: 0.7 }] }, { mappings: MAPPINGS })
  assert.deepEqual(p.dominantSignals, [{ category: 'communication-style', strength: 0.7 }])
})

// ── mixed / ordering / duplicates ────────────────────────────────────────────────────

test('mixed profile combines all sources, sorted by category', () => {
  const p = composeCoachDnaProfile({ tags: ['forward-led', 'risk-averse'], traits: ['methodical'], attributes: { style: 'expansive' } }, { mappings: MAPPINGS })
  assert.deepEqual(p.dominantSignals.map((s) => s.category), ['learned-pattern', 'risk-warning', 'selection-preference', 'tactical-preference'])
})

test('duplicate categories aggregate (sum, clamped) into one signal', () => {
  const mappings = { tags: { a: { category: 'risk-warning', strength: 0.6 }, b: { category: 'risk-warning', strength: 0.6 } } }
  const p = composeCoachDnaProfile({ tags: ['a', 'b'] }, { mappings })
  assert.equal(p.dominantSignals.length, 1)
  assert.deepEqual(p.dominantSignals[0], { category: 'risk-warning', strength: 1 })   // 0.6+0.6 → clamp 1
  assert.equal(p.metadata.sources[0].sources.length, 2)
})

// ── frozen / no mutation ─────────────────────────────────────────────────────────────

test('output is deeply frozen', () => {
  const p = composeCoachDnaProfile({ tags: ['forward-led'] }, { mappings: MAPPINGS })
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.dominantSignals) && Object.isFrozen(p.metadata) && Object.isFrozen(p.dominantSignals[0]))
  assert.throws(() => p.dominantSignals.push({}))
  assert.throws(() => { p.confidence = 1 })
})

test('does not mutate inputs', () => {
  const profile = { tags: ['forward-led'], attributes: { style: 'expansive' } }
  const before = [JSON.stringify(profile), JSON.stringify(MAPPINGS)]
  composeCoachDnaProfile(profile, { mappings: MAPPINGS })
  assert.deepEqual([JSON.stringify(profile), JSON.stringify(MAPPINGS)], before)
})

// ── determinism ──────────────────────────────────────────────────────────────────────

test('deterministic — identical input → identical profile', () => {
  const profile = { tags: ['forward-led', 'risk-averse'], traits: ['methodical'] }
  assert.deepEqual(composeCoachDnaProfile(profile, { mappings: MAPPINGS }), composeCoachDnaProfile(profile, { mappings: MAPPINGS }))
})

// ── interface compatibility (M152 + M155) ────────────────────────────────────────────

test('output drives M152 applyPlayerDnaInfluence', () => {
  const coachProfile = composeCoachDnaProfile({ tags: ['forward-led'] }, { mappings: MAPPINGS })   // selection-preference 0.4
  const candidate = { playerId: 'p1', position: 'ScrumHalf', availability: true, confidence: 0.5, dnaSignals: [{ category: 'selection-preference', weight: 1 }] }
  const r = applyPlayerDnaInfluence(candidate, coachProfile)
  assert.ok(r.finalConfidence > r.baseConfidence)
})

test('output drives M155 createDnaConfidenceProvider', () => {
  const coachProfile = composeCoachDnaProfile({ tags: ['forward-led'] }, { mappings: MAPPINGS })
  const provider = createDnaConfidenceProvider({
    historyByPlayer: { p1: ['available', 'available'] },
    dnaProfiles: { p1: { tags: ['x'] } },
    mappings: { tags: { x: { category: 'selection-preference', weight: 1 } } },
    coachDnaProfile: coachProfile,
  })
  assert.equal(typeof provider.getConfidence({ userId: 'p1' }), 'number')
})

// ── validation / defaults / export ───────────────────────────────────────────────────

test('default mappings are used when none supplied', () => {
  const p = composeCoachDnaProfile({ tags: ['attacking'] })
  assert.deepEqual(p.dominantSignals, [{ category: 'tactical-preference', strength: 0.4 }])
})

test('validation → TypeError', () => {
  assert.throws(() => composeCoachDnaProfile(null), TypeError)
  assert.throws(() => composeCoachDnaProfile({ tags: [1] }), TypeError)
  assert.throws(() => composeCoachDnaProfile({ signals: [{ category: 'x' }] }), TypeError)              // missing strength
  assert.throws(() => composeCoachDnaProfile({ attributes: { style: 5 } }), TypeError)                  // non-string attribute
  assert.throws(() => composeCoachDnaProfile({ tags: ['forward-led'] }, { mappings: { tags: { 'forward-led': { category: 'x' } } } }), TypeError)   // malformed mapping
})

test('exports exist', () => {
  assert.equal(typeof composeCoachDnaProfile, 'function')
  assert.ok(typeof DEFAULT_COACH_DNA_MAPPINGS === 'object')
})
