/**
 * coach-core-adapter — Memories → Coach DNA Profile Bridge tests
 *
 * Derives a coach DNA profile from memory entries via the real M113 + M114, and proves the
 * result feeds M152 + M155: profile shape, memory-driven dominant signals, empty memories,
 * frozen output, no mutation, determinism, interface compatibility, validation, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  coachDnaProfileFromMemories, applyPlayerDnaInfluence, createDnaConfidenceProvider,
} from '../packages/coach-core-adapter/index.js'
import { extractCoachDnaSignals, buildCoachDnaProfile } from '../packages/coach-memory/index.js'

const SERVICES = { extractCoachDnaSignals, buildCoachDnaProfile }   // the real M113 + M114, injected

const memory = (id, type, createdAt) => ({
  id, coachId: 'coach-demo', clubId: 'boitsfort-rfc', type, statement: `insight ${id}`, source: 'manual',
  confidence: 0.8, weight: 0.7, tags: [], ontologyLinks: [], evidenceRefs: [], createdAt,
})
// selection-preference appears most → should be the strongest dominant signal
const memories = () => [
  memory('m1', 'selection-preference', '2026-06-01T00:00:00.000Z'),
  memory('m2', 'selection-preference', '2026-06-02T00:00:00.000Z'),
  memory('m3', 'selection-preference', '2026-06-03T00:00:00.000Z'),
  memory('m4', 'risk-warning', '2026-06-04T00:00:00.000Z'),
  memory('m5', 'tactical-preference', '2026-06-05T00:00:00.000Z'),
]

// ── profile shape + memory-driven signals ────────────────────────────────────────────

test('derives an M114 profile whose dominant signals reflect the memories', () => {
  const p = coachDnaProfileFromMemories(memories(), SERVICES)
  assert.equal(p.profileVersion, '1.0')
  assert.ok(Array.isArray(p.dominantSignals) && p.dominantSignals.length > 0)
  assert.ok(p.dominantSignals.every((s) => typeof s.category === 'string' && typeof s.strength === 'number'))
  assert.equal(p.dominantSignals[0].category, 'selection-preference')   // most-occurring → strongest
  const categories = p.dominantSignals.map((s) => s.category)
  assert.ok(categories.includes('risk-warning') && categories.includes('tactical-preference'))
})

test('empty memories → a profile with no dominant signals', () => {
  const p = coachDnaProfileFromMemories([], SERVICES)
  assert.deepEqual(p.dominantSignals, [])
})

// ── frozen / no mutation / determinism ───────────────────────────────────────────────

test('output is frozen', () => {
  const p = coachDnaProfileFromMemories(memories(), SERVICES)
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.dominantSignals))
  assert.throws(() => p.dominantSignals.push({}))
})

test('does not mutate the memories', () => {
  const mem = memories()
  const before = JSON.stringify(mem)
  coachDnaProfileFromMemories(mem, SERVICES)
  assert.equal(JSON.stringify(mem), before)
})

test('deterministic — identical memories → identical profile', () => {
  assert.deepEqual(coachDnaProfileFromMemories(memories(), SERVICES), coachDnaProfileFromMemories(memories(), SERVICES))
})

// ── interface compatibility (M152 + M155) ────────────────────────────────────────────

test('the derived profile drives M152 applyPlayerDnaInfluence', () => {
  const coachProfile = coachDnaProfileFromMemories(memories(), SERVICES)   // selection-preference dominant
  const candidate = { playerId: 'p1', position: 'ScrumHalf', availability: true, confidence: 0.5, dnaSignals: [{ category: 'selection-preference', weight: 1 }] }
  assert.ok(applyPlayerDnaInfluence(candidate, coachProfile).finalConfidence > 0.5)
})

test('the derived profile drives M155 createDnaConfidenceProvider', () => {
  const coachProfile = coachDnaProfileFromMemories(memories(), SERVICES)
  const provider = createDnaConfidenceProvider({
    historyByPlayer: { p1: ['available', 'available'] },
    dnaProfiles: { p1: { tags: ['x'] } },
    mappings: { tags: { x: { category: 'selection-preference', weight: 1 } } },
    coachDnaProfile: coachProfile,
  })
  assert.equal(typeof provider.getConfidence({ userId: 'p1' }), 'number')
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('validation → TypeError', () => {
  assert.throws(() => coachDnaProfileFromMemories('nope', SERVICES), TypeError)
  assert.throws(() => coachDnaProfileFromMemories([], {}), TypeError)                                          // services missing functions
  assert.throws(() => coachDnaProfileFromMemories([], { extractCoachDnaSignals, buildCoachDnaProfile: 5 }), TypeError)
  assert.throws(() => coachDnaProfileFromMemories([], { extractCoachDnaSignals: () => ({ signals: [] }), buildCoachDnaProfile: () => ({}) }), TypeError)   // builder returns non-profile
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof coachDnaProfileFromMemories, 'function')
})
