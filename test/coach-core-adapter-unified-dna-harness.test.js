/**
 * coach-core-adapter — Unified DNA Selection Harness (DORMANT PROOF, test-only)
 *
 * Proves the SAME coach memories can influence both:
 *   (1) the overall recommendation intelligence path — the memory-derived M114 coach DNA profile, and
 *   (2) the per-player DNA confidence path — that same profile, via M155 → M152.
 *
 * Flow (NO pipeline execution):
 *   coach memories → coachDnaProfileFromMemories (M157) → createDnaConfidenceProvider (M155)
 *   → getConfidence(player) per-player adjustments (M152)
 *
 * It also asserts the per-player profile is byte-identical to the profile the recommendation path
 * derives from the same memories (real M113 → M114). Pure adapter layer: no engine / M120 / M138 /
 * M118 changes, no pipeline run, no Core/Redis/network/persistence/AI generation.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  coachDnaProfileFromMemories, createDnaConfidenceProvider, applyPlayerDnaInfluence,
} from '../packages/coach-core-adapter/index.js'
import { extractCoachDnaSignals, buildCoachDnaProfile } from '../packages/coach-memory/index.js'

const ENGINES = { extractCoachDnaSignals, buildCoachDnaProfile }   // real M113 + M114
const SH06 = ['available', 'available', 'available', 'unavailable', 'unavailable']   // availability baseline 0.6

const memory = (id, type, createdAt) => ({ id, coachId: 'coach-demo', clubId: 'boitsfort-rfc', type, statement: `insight ${id}`, source: 'manual', confidence: 0.8, weight: 0.7, tags: [], ontologyLinks: [], evidenceRefs: [], createdAt })
// selection-focused memories (+ one risk-warning so a conflicting player can be penalised)
const selectionMemories = () => [
  memory('m1', 'selection-preference', '2026-06-01T00:00:00.000Z'),
  memory('m2', 'selection-preference', '2026-06-02T00:00:00.000Z'),
  memory('m3', 'selection-preference', '2026-06-03T00:00:00.000Z'),
  memory('m4', 'risk-warning', '2026-06-04T00:00:00.000Z'),
]

function makeData() {
  return {
    historyByPlayer: { p_align: SH06, p_conflict: SH06, p_neutral: SH06 },
    dnaProfiles: { p_align: { tags: ['reliable'] }, p_conflict: { tags: ['reckless'] } },   // p_neutral has none
    mappings: { tags: { reliable: { category: 'selection-preference', weight: 1 }, reckless: { category: 'risk-warning', weight: -1 } } },
  }
}

// memories → M157 profile → M155 provider
function buildProvider(data, memories) {
  const coachDnaProfile = coachDnaProfileFromMemories(memories, ENGINES)   // M157
  const provider = createDnaConfidenceProvider({ historyByPlayer: data.historyByPlayer, dnaProfiles: data.dnaProfiles, mappings: data.mappings, coachDnaProfile })   // M155
  return { coachDnaProfile, provider }
}

const conf = (provider, id) => provider.getConfidence({ userId: id })

// ── baseline / direction (1, 2, 3) ───────────────────────────────────────────────────

test('empty memories → baseline confidence (no influence)', () => {
  const { provider } = buildProvider(makeData(), [])
  assert.equal(conf(provider, 'p_align'), 0.6)      // empty profile → no dominant signals → baseline
  assert.equal(conf(provider, 'p_conflict'), 0.6)
})

test('selection-focused memories boost aligned players', () => {
  const { provider } = buildProvider(makeData(), selectionMemories())
  assert.ok(conf(provider, 'p_align') > 0.6)        // reliable → selection-preference (dominant) → boost
})

test('conflicting players receive a penalty', () => {
  const { provider } = buildProvider(makeData(), selectionMemories())
  assert.ok(conf(provider, 'p_conflict') < 0.6)     // reckless → risk-warning (dominant) → penalty
  assert.equal(conf(provider, 'p_neutral'), 0.6)    // no DNA → baseline
})

// ── multiple players / determinism (4, 5, 8) ─────────────────────────────────────────

test('multiple players are handled deterministically', () => {
  const { provider } = buildProvider(makeData(), selectionMemories())
  const a1 = conf(provider, 'p_align'); const c1 = conf(provider, 'p_conflict'); const n1 = conf(provider, 'p_neutral')
  assert.ok(a1 > n1 && n1 > c1)                     // aligned > neutral > conflicting
  assert.equal(conf(provider, 'p_align'), a1)       // repeated call identical
})

test('repeated full runs produce identical results', () => {
  const r1 = buildProvider(makeData(), selectionMemories())
  const r2 = buildProvider(makeData(), selectionMemories())
  assert.deepEqual(r1.coachDnaProfile, r2.coachDnaProfile)
  for (const id of ['p_align', 'p_conflict', 'p_neutral']) assert.equal(conf(r1.provider, id), conf(r2.provider, id))
})

// ── no mutation / frozen (6, 7) ──────────────────────────────────────────────────────

test('does not mutate memories or config', () => {
  const data = makeData(); const mem = selectionMemories()
  const before = [JSON.stringify(mem), JSON.stringify(data)]
  const { provider } = buildProvider(data, mem)
  conf(provider, 'p_align'); conf(provider, 'p_conflict')
  assert.deepEqual([JSON.stringify(mem), JSON.stringify(data)], before)
})

test('outputs are frozen', () => {
  const { coachDnaProfile, provider } = buildProvider(makeData(), selectionMemories())
  assert.ok(Object.isFrozen(coachDnaProfile) && Object.isFrozen(coachDnaProfile.dominantSignals))
  assert.ok(Object.isFrozen(provider))
})

// ── both paths share the same memory-derived profile (9, 10) ─────────────────────────

test('M157 compatibility — per-player profile equals the recommendation-path profile', () => {
  const mem = selectionMemories()
  // the per-player DNA profile (M157) is byte-identical to what the recommendation path derives (M113 → M114)
  assert.deepEqual(coachDnaProfileFromMemories(mem, ENGINES), buildCoachDnaProfile(extractCoachDnaSignals(mem)))
})

test('M155 compatibility — the memory-derived profile drives the confidence provider', () => {
  const { coachDnaProfile, provider } = buildProvider(makeData(), selectionMemories())
  assert.equal(coachDnaProfile.dominantSignals[0].category, 'selection-preference')   // strongest signal from the memories
  const v = conf(provider, 'p_align')
  assert.ok(typeof v === 'number' && v >= 0 && v <= 1)
  // confirm the same profile also influences a candidate directly via M152
  assert.ok(applyPlayerDnaInfluence({ playerId: 'x', confidence: 0.5, dnaSignals: [{ category: 'selection-preference', weight: 1 }] }, coachDnaProfile).finalConfidence > 0.5)
})
