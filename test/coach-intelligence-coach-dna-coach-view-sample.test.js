/**
 * coach-intelligence — Coach DNA Coach View Smoke Fixture (M231) tests
 *
 * The sample runs the real Coach Memory chain (M112 + M113 → M114), injected per M138, and feeds the
 * result through the M230 presenter. These tests assert it conforms to the M230 contract, reflects its
 * fixed sample data, is deterministic, and is deeply frozen — so a future UI has an accurate preview.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCoachDnaCoachViewSample, buildCoachDnaCoachView } from '../packages/coach-intelligence/index.js'
import {
  synthesizeCoachMemories,
  extractCoachDnaSignals,
  buildCoachDnaProfile,
} from '../packages/coach-memory/index.js'

// the real M138 services bundle (just the three engines the sample needs)
const services = { synthesizeCoachMemories, extractCoachDnaSignals, buildCoachDnaProfile }

// ── sample → complete, contract-conformant coach view ──────────────────────────────────────────

test('sample → complete Coach DNA coach view reflecting the fixture', () => {
  const v = buildCoachDnaCoachViewSample(services)

  assert.equal(v.profileVersion, '1.0')

  // selection-led coach: high confidence, broad spread across six dimensions
  assert.equal(v.confidence.level, 'HIGH')
  assert.equal(v.confidence.label, 'High')
  assert.ok(v.confidence.value > 0.66 && v.confidence.value <= 1)

  assert.equal(v.identity.strongestCategory, 'selection-preference')
  assert.equal(v.identity.strongestLabel, 'Selection')
  assert.equal(v.identity.weakestCategory, 'tactical-preference')
  assert.equal(v.identity.weakestLabel, 'Tactics')
  assert.equal(v.identity.diversityScore, 6 / 8)   // six of eight dimensions covered
  assert.equal(v.identity.diversityLabel, 'Broad')

  // dominant signals: capped at five, ordered strength DESC; selection on top with three memories
  assert.equal(v.dominantSignals.length, 5)
  const top = v.dominantSignals[0]
  assert.equal(top.category, 'selection-preference')
  assert.equal(top.label, 'Selection')
  assert.equal(top.occurrences, 3)
  assert.equal(top.strength, 1)
  assert.equal(top.supportingCount, 3)
  assert.equal(top.supportingMemoryIds, undefined)   // never leak raw ids

  // every theme present (one per memory type)
  assert.equal(v.themes.length, 6)

  assert.equal(v.knowledge.totalMemories, 8)
  assert.equal(v.knowledge.uniqueTypes, 6)

  assert.equal(v.summary, 'Coach has 8 recorded coaching memories across 6 coaching themes.')
  assert.equal(v.headline, 'Selection focus — 8 memories across 6 themes, high confidence')
  assert.deepEqual(v.metadata, { explainable: true, deterministic: true, llmGenerated: false })
})

test('sample conforms to the M230 contract (same shape as a hand-built view)', () => {
  const v = buildCoachDnaCoachViewSample(services)
  // a minimal view built directly through the M230 presenter has the same top-level keys
  const reference = buildCoachDnaCoachView({
    profile: buildCoachDnaProfile(extractCoachDnaSignals([])),
    synthesis: synthesizeCoachMemories([]),
  })
  assert.deepEqual(Object.keys(v).sort(), Object.keys(reference).sort())
})

test('sample is deterministic across calls', () => {
  assert.deepEqual(buildCoachDnaCoachViewSample(services), buildCoachDnaCoachViewSample(services))
})

test('sample is deeply frozen', () => {
  const v = buildCoachDnaCoachViewSample(services)
  assert.ok(Object.isFrozen(v))
  assert.ok(Object.isFrozen(v.identity))
  assert.ok(Object.isFrozen(v.dominantSignals))
  assert.ok(Object.isFrozen(v.dominantSignals[0]))
  assert.ok(Object.isFrozen(v.themes))
  assert.ok(Object.isFrozen(v.metadata))
})

// ── services injection guard ────────────────────────────────────────────────────────────────────

test('throws when the injected engines are missing or malformed', () => {
  assert.throws(() => buildCoachDnaCoachViewSample(undefined), TypeError)
  assert.throws(() => buildCoachDnaCoachViewSample({}), TypeError)
  assert.throws(() => buildCoachDnaCoachViewSample({ synthesizeCoachMemories, extractCoachDnaSignals }), TypeError) // missing buildCoachDnaProfile
  assert.throws(() => buildCoachDnaCoachViewSample({ ...services, buildCoachDnaProfile: 'nope' }), TypeError)
})
