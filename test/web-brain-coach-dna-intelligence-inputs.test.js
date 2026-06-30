/**
 * web/brain-coach-dna-intelligence-inputs - Coach DNA Intelligence Inputs (M252) tests
 *
 * Verifies the first Intelligence subsystem module: it deterministically derives a machine-readable inputs
 * object from an M230 coachView, mapping all eight Coach Memory categories to named signal groups, copying
 * forward only already-public aggregates (a supporting COUNT, never ids), and inventing/predicting/recommending
 * nothing. A minimal profile yields empty groups; a malformed profile fails safe; the source view is never
 * mutated; output is deeply frozen and byte-deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaIntelligenceInputs,
  summarizeCoachDnaIntelligenceInputs,
  serializeCoachDnaIntelligenceInputs,
} from '../web/brain-coach-dna-intelligence-inputs.js'

const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

// A representative M230 coachView fixture (the exact shape buildCoachDnaCoachView returns). Frozen, so any
// accidental mutation by the module under test would throw.
function freeze(o) {
  if (o && typeof o === 'object') { for (const k of Object.keys(o)) freeze(o[k]); Object.freeze(o) }
  return o
}
const FULL_VIEW = freeze({
  profileVersion: 'coach-dna-v3',
  confidence: { value: 0.72, level: 'HIGH', label: 'High' },
  headline: 'Philosophy focus — 12 memories across 4 themes, high confidence',
  identity: {
    strongestCategory: 'philosophy', strongestLabel: 'Philosophy',
    weakestCategory: 'risk-warning', weakestLabel: 'Risk warnings',
    diversityScore: 0.5, diversityLabel: 'Balanced',
  },
  dominantSignals: [
    { category: 'philosophy', label: 'Philosophy', occurrences: 6, strength: 0.8, averageConfidence: 0.75, averageWeight: 0.6, supportingCount: 5 },
    { category: 'training-preference', label: 'Training', occurrences: 3, strength: 0.5, averageConfidence: 0.6, averageWeight: 0.55, supportingCount: 2 },
  ],
  themes: [
    { type: 'philosophy', label: 'Philosophy', count: 6, averageConfidence: 0.75, averageWeight: 0.6 },
    { type: 'communication-style', label: 'Communication', count: 2, averageConfidence: 0.5, averageWeight: 0.45 },
  ],
  knowledge: { totalMemories: 12, uniqueTypes: 4, averageConfidence: 0.68, averageWeight: 0.57, totalEvidence: 20, totalOntologyLinks: 8 },
  summary: 'A philosophy-led coach with a developing training emphasis.',
  metadata: { explainable: true, deterministic: true, llmGenerated: false },
})

// A minimal but recognizable empty coachView (no memories yet).
const MINIMAL_VIEW = freeze({
  profileVersion: null,
  confidence: { value: 0, level: 'LOW', label: 'Low' },
  headline: 'No coaching profile yet — add memories to build Coach DNA',
  identity: { strongestCategory: null, strongestLabel: null, weakestCategory: null, weakestLabel: null, diversityScore: 0, diversityLabel: 'Narrow' },
  dominantSignals: [],
  themes: [],
  knowledge: { totalMemories: 0, uniqueTypes: 0, averageConfidence: 0, averageWeight: 0, totalEvidence: 0, totalOntologyLinks: 0 },
  summary: null,
  metadata: { explainable: true, deterministic: true, llmGenerated: false },
})

const ALL_GROUPS = ['coachingStyleSignals', 'communicationSignals', 'trainingSignals', 'playerDevelopmentSignals', 'selectionSignals', 'tacticalSignals', 'planningSignals', 'riskSignals']

const INPUTS = buildCoachDnaIntelligenceInputs(FULL_VIEW)

test('a valid coachView derives the full inputs shape with all eight signal groups', () => {
  assert.equal(INPUTS.type, 'coach-dna-intelligence-inputs')
  assert.equal(INPUTS.schemaVersion, 1)
  assert.equal(INPUTS.inputsVersion, 1)
  assert.equal(INPUTS.valid, true)
  for (const g of ALL_GROUPS) assert.ok(typeof INPUTS[g] === 'object' && INPUTS[g] !== null, g)
  assert.match(INPUTS.inputsFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('each signal group maps to its Coach Memory category and copies forward only public aggregates', () => {
  assert.equal(INPUTS.coachingStyleSignals.category, 'philosophy')
  assert.equal(INPUTS.communicationSignals.category, 'communication-style')
  assert.equal(INPUTS.trainingSignals.category, 'training-preference')
  assert.equal(INPUTS.playerDevelopmentSignals.category, 'player-management')
  assert.equal(INPUTS.selectionSignals.category, 'selection-preference')
  assert.equal(INPUTS.tacticalSignals.category, 'tactical-preference')
  assert.equal(INPUTS.planningSignals.category, 'learned-pattern')
  assert.equal(INPUTS.riskSignals.category, 'risk-warning')
  // philosophy is present, dominant, strongest, with the view's exact numbers
  const style = INPUTS.coachingStyleSignals
  assert.equal(style.present, true)
  assert.equal(style.isDominant, true)
  assert.equal(style.isStrongest, true)
  assert.equal(style.occurrences, 6)
  assert.equal(style.strength, 0.8)
  assert.equal(style.supportingCount, 5)
  assert.equal(style.themeCount, 6)
  // never leaks raw ids — only a count field exists
  assert.ok(!('supportingMemoryIds' in style))
})

test('a theme-only category is present without being dominant', () => {
  const comm = INPUTS.communicationSignals
  assert.equal(comm.present, true)
  assert.equal(comm.isDominant, false)        // not in dominantSignals
  assert.equal(comm.occurrences, 0)
  assert.equal(comm.themeCount, 2)            // but has a theme
  assert.equal(comm.averageConfidence, 0.5)   // falls back to the theme's confidence
})

test('an absent category yields an empty, not-present group (invents nothing)', () => {
  const sel = INPUTS.selectionSignals
  assert.equal(sel.present, false)
  assert.equal(sel.isDominant, false)
  assert.equal(sel.occurrences, 0)
  assert.equal(sel.strength, 0)
  assert.equal(sel.themeCount, 0)
  assert.equal(sel.averageConfidence, 0)
})

test('the weakest category flag is mapped from the view identity', () => {
  assert.equal(INPUTS.riskSignals.isWeakest, true)
  assert.equal(INPUTS.coachingStyleSignals.isWeakest, false)
})

test('evidence coverage is derived from the view knowledge block', () => {
  const ec = INPUTS.evidenceCoverage
  assert.equal(ec.totalMemories, 12)
  assert.equal(ec.uniqueTypes, 4)
  assert.equal(ec.totalEvidence, 20)
  assert.equal(ec.totalOntologyLinks, 8)
  assert.equal(ec.categoriesPossible, 8)
  // present categories: philosophy, training, communication = 3
  assert.equal(ec.categoriesCovered, 3)
  assert.equal(ec.coverageRatio, 3 / 8)
})

test('confidence flags are copied from the view (no new thresholds invented)', () => {
  const cf = INPUTS.confidenceFlags
  assert.equal(cf.confidenceLevel, 'HIGH')
  assert.equal(cf.confidenceValue, 0.72)
  assert.equal(cf.highConfidence, true)
  assert.equal(cf.lowConfidence, false)
  assert.equal(cf.diversityLabel, 'Balanced')
  assert.equal(cf.narrowSpread, false)
  assert.equal(cf.empty, false)
  assert.equal(cf.llmGenerated, false)
  assert.equal(cf.deterministicSource, true)
})

test('provenance points back to the M230 coachView', () => {
  assert.equal(INPUTS.provenance.source, 'coach-dna-coach-view')
  assert.equal(INPUTS.provenance.sourceMilestone, 'M230')
  assert.equal(INPUTS.provenance.recognizable, true)
  assert.equal(INPUTS.provenance.profileVersion, 'coach-dna-v3')
  assert.equal(INPUTS.provenance.sourceConfidenceLevel, 'HIGH')
  assert.equal(INPUTS.derivationMetadata.milestone, 'M252')
  assert.equal(INPUTS.derivationMetadata.llmGenerated, false)
})

test('a minimal profile yields valid inputs with all groups empty', () => {
  const i = buildCoachDnaIntelligenceInputs(MINIMAL_VIEW)
  assert.equal(i.valid, true)
  for (const g of ALL_GROUPS) assert.equal(i[g].present, false, g)
  assert.equal(i.evidenceCoverage.categoriesCovered, 0)
  assert.equal(i.evidenceCoverage.coverageRatio, 0)
  assert.equal(i.confidenceFlags.empty, true)
  assert.equal(i.confidenceFlags.confidenceLevel, 'LOW')
})

test('a malformed profile fails safe — valid:false, empty groups, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { foo: 1 }]) {
    let i
    assert.doesNotThrow(() => { i = buildCoachDnaIntelligenceInputs(bad) })
    assert.equal(i.valid, false)
    assert.equal(i.provenance.recognizable, false)
    for (const g of ALL_GROUPS) assert.equal(i[g].present, false, `${g} for ${JSON.stringify(bad)}`)
    assert.equal(i.evidenceCoverage.categoriesCovered, 0)
    assert.equal(i.confidenceFlags.lowConfidence, true)
  }
})

test('the source view is never mutated', () => {
  const before = JSON.parse(JSON.stringify(FULL_VIEW))
  buildCoachDnaIntelligenceInputs(FULL_VIEW)
  assert.deepEqual(JSON.parse(JSON.stringify(FULL_VIEW)), before)
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaIntelligenceInputs(FULL_VIEW), serializeCoachDnaIntelligenceInputs(FULL_VIEW))
  assert.equal(buildCoachDnaIntelligenceInputs(FULL_VIEW).inputsFingerprint, INPUTS.inputsFingerprint)
  // a structurally-identical but distinct object produces the same fingerprint
  const copy = JSON.parse(JSON.stringify(FULL_VIEW))
  assert.equal(buildCoachDnaIntelligenceInputs(copy).inputsFingerprint, INPUTS.inputsFingerprint)
})

test('the output is deeply frozen', () => {
  assert.ok(Object.isFrozen(INPUTS))
  assert.ok(Object.isFrozen(INPUTS.coachingStyleSignals))
  assert.ok(Object.isFrozen(INPUTS.evidenceCoverage))
  assert.ok(Object.isFrozen(INPUTS.confidenceFlags))
  assert.ok(Object.isFrozen(INPUTS.provenance))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaIntelligenceInputs(FULL_VIEW, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-intelligence-inputs')
  const line = serializeCoachDnaIntelligenceInputs(FULL_VIEW, { format: 'line' })
  assert.match(line, /^coach-dna-intelligence-inputs valid=true coverage=3\/8 confidence=HIGH /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaIntelligenceInputs(FULL_VIEW, { format: 'xml' }), /unsupported/)
})

test('the inputs and summary carry no recommendation or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaIntelligenceInputs(FULL_VIEW), ADVICE_LANG)
  assert.doesNotMatch(summarizeCoachDnaIntelligenceInputs(FULL_VIEW), ADVICE_LANG)
  assert.match(summarizeCoachDnaIntelligenceInputs(FULL_VIEW), /intelligence inputs: derived/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaIntelligenceInputs, 'function')
  assert.equal(typeof summarizeCoachDnaIntelligenceInputs, 'function')
  assert.equal(typeof serializeCoachDnaIntelligenceInputs, 'function')
})
