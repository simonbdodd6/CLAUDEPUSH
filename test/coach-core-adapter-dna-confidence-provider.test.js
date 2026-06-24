/**
 * coach-core-adapter — DNA Confidence Provider tests
 *
 * One reusable provider composing M145 baseline + M153 signals + M152 influence:
 * baseline preserved, DNA boost/penalty, disabled→baseline, missing profile/history safe,
 * determinism, frozen provider, no mutation, interface compatibility, validation.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createDnaConfidenceProvider, buildSelectionContext } from '../packages/coach-core-adapter/index.js'

const SH = ['available', 'available', 'available', 'unavailable', 'unavailable']   // baseline 0.6
const FULL = ['available', 'available']                                            // baseline 1.0

const config = (over = {}) => ({
  historyByPlayer: { rel: SH, con: SH, plain: FULL },
  dnaProfiles: { rel: { tags: ['reliable'] }, con: { tags: ['reckless'] } },
  mappings: { tags: { reliable: { category: 'selection-preference', weight: 1 }, reckless: { category: 'risk-warning', weight: -1 } } },
  coachDnaProfile: { profileVersion: '1.0', dominantSignals: [{ category: 'selection-preference', strength: 0.9 }, { category: 'risk-warning', strength: 0.8 }], balance: {}, confidence: 0.5, metadata: {} },
  ...over,
})

// ── baseline + influence direction (1, 2, 3) ─────────────────────────────────────────

test('baseline confidence is preserved for players with no DNA', () => {
  const p = createDnaConfidenceProvider(config())
  assert.equal(p.getConfidence({ userId: 'plain' }), 1)   // FULL history → 1.0, no DNA tags
})

test('DNA boosts a matching player and penalises a conflicting player', () => {
  const p = createDnaConfidenceProvider(config())
  assert.ok(p.getConfidence({ userId: 'rel' }) > 0.6)     // reliable aligns with selection-preference
  assert.ok(p.getConfidence({ userId: 'con' }) < 0.6)     // reckless conflicts with risk-warning
})

// ── toggles / safety (4, 5, 6) ───────────────────────────────────────────────────────

test('disabled influence returns the baseline', () => {
  const p = createDnaConfidenceProvider(config({ enabled: false }))
  assert.equal(p.getConfidence({ userId: 'rel' }), 0.6)
  assert.equal(p.getConfidence({ userId: 'con' }), 0.6)
})

test('missing coach profile is safe (no influence)', () => {
  const p = createDnaConfidenceProvider(config({ coachDnaProfile: null }))
  assert.equal(p.getConfidence({ userId: 'rel' }), 0.6)
})

test('missing history is safe (baseline default)', () => {
  const p = createDnaConfidenceProvider(config())
  assert.equal(p.getConfidence({ userId: 'unknown' }), 0.5)   // no history → default; no DNA → no influence
})

// ── determinism / frozen / no mutation (7, 8, 9) ─────────────────────────────────────

test('deterministic — repeated calls and providers agree', () => {
  const p = createDnaConfidenceProvider(config())
  assert.equal(p.getConfidence({ userId: 'rel' }), p.getConfidence({ userId: 'rel' }))
  assert.equal(createDnaConfidenceProvider(config()).getConfidence({ userId: 'rel' }), p.getConfidence({ userId: 'rel' }))
})

test('the returned provider is frozen', () => {
  const p = createDnaConfidenceProvider(config())
  assert.ok(Object.isFrozen(p))
  assert.throws(() => { p.getConfidence = null })
})

test('does not mutate the config inputs', () => {
  const c = config()
  const before = JSON.stringify({ historyByPlayer: c.historyByPlayer, dnaProfiles: c.dnaProfiles, mappings: c.mappings, coachDnaProfile: c.coachDnaProfile })
  const p = createDnaConfidenceProvider(c)
  p.getConfidence({ userId: 'rel' }); p.getConfidence({ userId: 'con' })
  assert.equal(JSON.stringify({ historyByPlayer: c.historyByPlayer, dnaProfiles: c.dnaProfiles, mappings: c.mappings, coachDnaProfile: c.coachDnaProfile }), before)
})

// ── interface compatibility (10) ─────────────────────────────────────────────────────

test('is compatible with the confidence-provider contract (drives buildSelectionContext)', () => {
  const p = createDnaConfidenceProvider(config())
  assert.equal(typeof p.getConfidence, 'function')
  const v = p.getConfidence({ userId: 'rel' })
  assert.ok(v >= 0 && v <= 1)
  const ctx = buildSelectionContext({
    players: [{ id: 'profile_rel', userId: 'rel', displayName: 'rel', position: 'ScrumHalf' }],
    availabilityResponses: { rel: { response: 'available' } },
    confidenceProvider: p,
  })
  assert.equal(ctx.candidates[0].confidence, p.getConfidence({ userId: 'rel' }))   // same DNA-influenced value
})

test('playerIdField is honoured for lookup', () => {
  const p = createDnaConfidenceProvider({
    historyByPlayer: { 'inv-1': FULL }, dnaProfiles: {}, coachDnaProfile: null, playerIdField: 'legacyPlayerId',
  })
  assert.equal(p.getConfidence({ legacyPlayerId: 'inv-1' }), 1)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('validation → TypeError', () => {
  assert.throws(() => createDnaConfidenceProvider(null), TypeError)
  assert.throws(() => createDnaConfidenceProvider([]), TypeError)
  assert.throws(() => createDnaConfidenceProvider({ dnaProfiles: 'x' }), TypeError)
  assert.throws(() => createDnaConfidenceProvider({ playerIdField: '' }), TypeError)
  assert.throws(() => createDnaConfidenceProvider(config()).getConfidence('not-an-object'), TypeError)
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof createDnaConfidenceProvider, 'function')
})
