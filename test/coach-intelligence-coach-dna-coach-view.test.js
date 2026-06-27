/**
 * coach-intelligence — Coach DNA Coach View Contract (M230) tests
 *
 * Maps the deterministic Coach Memory aggregates (M114 profile + M112 synthesis) into a curated
 * coachView for a future UI. Exposes only mapped fields (counts, not raw id arrays); recommends and
 * invents nothing. Bundles are built with the real M112/M113/M114 engines so the view can never drift
 * from the live contract.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCoachDnaCoachView } from '../packages/coach-intelligence/index.js'
import {
  synthesizeCoachMemories,
  extractCoachDnaSignals,
  buildCoachDnaProfile,
} from '../packages/coach-memory/index.js'

// ── fixtures (valid M108 entries) ────────────────────────────────────────────────────────────

const memory = (over = {}) => ({
  id: 'm0', coachId: 'coach-1', clubId: 'club-1',
  type: 'philosophy', statement: 'A coaching insight.', source: 'manual',
  confidence: 0.6, weight: 0.6, tags: [], ontologyLinks: [], evidenceRefs: [],
  createdAt: '2026-01-01T00:00:00.000Z', ...over,
})

// selection-preference is deliberately strongest (2 occurrences, high conf/weight → strength clamps to
// 1.0); training-preference is weakest. 4 memories across 3 themes, profile confidence ≈ 0.81 (HIGH).
const SAMPLE = [
  memory({ id: 'sp1', type: 'selection-preference', confidence: 0.9, weight: 0.9, createdAt: '2026-01-02T00:00:00.000Z' }),
  memory({ id: 'sp2', type: 'selection-preference', confidence: 0.8, weight: 0.8, createdAt: '2026-01-03T00:00:00.000Z' }),
  memory({ id: 'ph1', type: 'philosophy', confidence: 0.6, weight: 0.6, createdAt: '2026-01-01T00:00:00.000Z' }),
  memory({ id: 'tr1', type: 'training-preference', confidence: 0.4, weight: 0.5, createdAt: '2026-01-04T00:00:00.000Z' }),
]

const realBundle = (memories) => ({
  profile: buildCoachDnaProfile(extractCoachDnaSignals(memories)),
  synthesis: synthesizeCoachMemories(memories),
})

// ── full bundle → complete coach view ────────────────────────────────────────────────────────

test('full coach-memory bundle → complete Coach DNA coach view', () => {
  const bundle = realBundle(SAMPLE)
  const v = buildCoachDnaCoachView(bundle)

  assert.equal(v.profileVersion, '1.0')

  // confidence: number mapped to a HIGH/MEDIUM/LOW level + label (passthrough value)
  assert.equal(v.confidence.value, bundle.profile.confidence)
  assert.equal(v.confidence.level, 'HIGH')
  assert.equal(v.confidence.label, 'High')

  // identity: strongest/weakest categories from the profile balance, with human labels
  assert.equal(v.identity.strongestCategory, 'selection-preference')
  assert.equal(v.identity.strongestLabel, 'Selection')
  assert.equal(v.identity.weakestCategory, 'training-preference')
  assert.equal(v.identity.weakestLabel, 'Training')
  assert.equal(v.identity.diversityScore, 3 / 8)   // 3 of 8 dimensions covered
  assert.equal(v.identity.diversityLabel, 'Focused')

  // dominant signals: mapped, ordered by the engine (strength DESC); raw ids never leaked
  assert.equal(v.dominantSignals.length, 3)
  const top = v.dominantSignals[0]
  assert.equal(top.category, 'selection-preference')
  assert.equal(top.label, 'Selection')
  assert.equal(top.occurrences, 2)
  assert.equal(top.strength, 1)
  assert.equal(top.supportingCount, 2)            // count only…
  assert.equal(top.supportingMemoryIds, undefined) // …never the raw id array

  // themes from synthesis (count DESC, type ASC)
  assert.equal(v.themes.length, 3)
  const selectionTheme = v.themes.find((t) => t.type === 'selection-preference')
  assert.equal(selectionTheme.count, 2)
  assert.equal(selectionTheme.label, 'Selection')

  // knowledge stats passthrough
  assert.equal(v.knowledge.totalMemories, 4)
  assert.equal(v.knowledge.uniqueTypes, 3)

  // summary is the engine's deterministic text, passed through verbatim
  assert.equal(v.summary, bundle.synthesis.summary)

  // headline is deterministic and invents no philosophy
  assert.equal(v.headline, 'Selection focus — 4 memories across 3 themes, high confidence')

  // metadata mirrors the profile's provenance flags
  assert.deepEqual(v.metadata, { explainable: true, deterministic: true, llmGenerated: false })
})

test('coach view is deeply frozen', () => {
  const v = buildCoachDnaCoachView(realBundle(SAMPLE))
  assert.ok(Object.isFrozen(v))
  assert.ok(Object.isFrozen(v.identity))
  assert.ok(Object.isFrozen(v.confidence))
  assert.ok(Object.isFrozen(v.dominantSignals))
  assert.ok(Object.isFrozen(v.dominantSignals[0]))
  assert.ok(Object.isFrozen(v.themes))
  assert.ok(Object.isFrozen(v.knowledge))
  assert.ok(Object.isFrozen(v.metadata))
})

test('input bundle is never mutated', () => {
  const bundle = realBundle(SAMPLE)
  const before = JSON.stringify(bundle)
  buildCoachDnaCoachView(bundle)
  assert.equal(JSON.stringify(bundle), before)
})

test('accepts the full M118 pipeline output and ignores extra fields', () => {
  const bundle = realBundle(SAMPLE)
  const v = buildCoachDnaCoachView({ ...bundle, memories: [], signals: {}, explanation: {}, alignment: {}, challenge: {} })
  assert.equal(v.identity.strongestCategory, 'selection-preference')
  assert.equal(v.knowledge.totalMemories, 4)
})

// ── empty profile (no memories) ────────────────────────────────────────────────────────────────

test('empty bundle → "no profile yet" view', () => {
  const v = buildCoachDnaCoachView(realBundle([]))
  assert.equal(v.headline, 'No coaching profile yet — add memories to build Coach DNA')
  assert.equal(v.confidence.value, 0)
  assert.equal(v.confidence.level, 'LOW')
  assert.equal(v.identity.strongestCategory, null)
  assert.equal(v.identity.strongestLabel, null)
  assert.equal(v.identity.weakestCategory, null)
  assert.equal(v.identity.diversityScore, 0)
  assert.equal(v.identity.diversityLabel, 'Narrow')
  assert.equal(v.dominantSignals.length, 0)
  assert.equal(v.themes.length, 0)
  assert.equal(v.knowledge.totalMemories, 0)
  assert.equal(v.summary, 'Coach has 0 recorded coaching memories across 0 coaching themes.')
})

// ── label fallback for an unmapped-but-valid category ────────────────────────────────────────────

test('unknown-but-valid category falls back to the raw category as its label', () => {
  const v = buildCoachDnaCoachView({
    profile: {
      profileVersion: '1.0',
      generatedFrom: { signalCount: 1, generatedDeterministically: true },
      dominantSignals: [{ category: 'future-type', occurrences: 1, averageConfidence: 0.5, averageWeight: 0.5, strength: 0.5, supportingMemoryIds: ['x'] }],
      balance: { strongestCategory: 'future-type', weakestCategory: 'future-type', diversityScore: 0.125 },
      confidence: 0.5,
      metadata: { explainable: true, llmGenerated: false, deterministic: true },
    },
    synthesis: {
      summary: 'one memory',
      themes: [{ type: 'future-type', count: 1, averageConfidence: 0.5, averageWeight: 0.5 }],
      statistics: { totalMemories: 1, uniqueTypes: 1, averageConfidence: 0.5, averageWeight: 0.5, totalEvidence: 0, totalOntologyLinks: 0 },
      supportingEvidence: [{ memoryId: 'x', type: 'future-type' }],
    },
  })
  assert.equal(v.identity.strongestLabel, 'future-type')
  assert.equal(v.dominantSignals[0].label, 'future-type')
  assert.equal(v.confidence.level, 'MEDIUM')
})

// ── input validation ──────────────────────────────────────────────────────────────────────────

test('throws on malformed input', () => {
  assert.throws(() => buildCoachDnaCoachView(null), TypeError)
  assert.throws(() => buildCoachDnaCoachView({}), TypeError)
  assert.throws(() => buildCoachDnaCoachView({ profile: {} }), TypeError)          // missing synthesis
  assert.throws(() => buildCoachDnaCoachView({ synthesis: {} }), TypeError)        // missing profile
  assert.throws(() => buildCoachDnaCoachView([]), TypeError)                       // array, not object
})
