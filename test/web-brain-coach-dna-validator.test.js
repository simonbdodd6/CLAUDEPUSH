/**
 * web/brain-coach-dna-validator — Coach DNA Export Validator (M236) tests
 *
 * A pure, read-only validator over every Coach DNA export + snapshot: M230 contract fields, the M232
 * panel, the M233 page, the M235 text/clipboard/pack forms, the M234 snapshot regression, and the M234
 * gallery. Verifies a clean PASS on the canonical set, the report shape, determinism, contract-field
 * detection (missing / wrong-type / out-of-range), export & snapshot regression detection, robustness to
 * malformed input, and a frozen report. No repair logic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { validateCoachDnaExports, validateCoachDnaContract } from '../web/brain-coach-dna-validator.js'
import { buildCoachDnaSnapshots, COACH_DNA_SNAPSHOT_SCENARIOS } from '../web/brain-coach-dna-snapshots.js'

const SCENARIO_NAMES = Object.keys(COACH_DNA_SNAPSHOT_SCENARIOS)
const ASPECTS = ['contract', 'html', 'page', 'text', 'clipboard', 'export', 'screen']

// ── clean pass on the canonical set ──────────────────────────────────────────────────────

test('the canonical Coach DNA artifacts pass every check', () => {
  const report = validateCoachDnaExports()
  assert.equal(report.type, 'coach-dna-export-validation')
  assert.equal(report.pass, true)
  assert.equal(report.failedChecks, 0)
  assert.deepEqual(report.mismatchSummary, [])
  // 7 aspects per scenario + 1 global gallery
  assert.equal(report.totalChecks, SCENARIO_NAMES.length * ASPECTS.length + 1)
  assert.equal(report.passedChecks, report.totalChecks)
})

test('report covers every scenario × aspect plus the gallery', () => {
  const report = validateCoachDnaExports()
  for (const name of SCENARIO_NAMES) {
    for (const aspect of ASPECTS) {
      assert.ok(report.checks.some((c) => c.snapshot === name && c.aspect === aspect && c.pass), `missing pass ${aspect}[${name}]`)
    }
  }
  assert.ok(report.checks.some((c) => c.aspect === 'gallery' && c.snapshot === '(all)' && c.pass))
})

// ── determinism & frozen report ──────────────────────────────────────────────────────────

test('validation report is deterministic and deeply frozen', () => {
  assert.deepEqual(validateCoachDnaExports(), validateCoachDnaExports())
  const report = validateCoachDnaExports()
  assert.ok(Object.isFrozen(report))
  assert.ok(Object.isFrozen(report.checks))
  assert.ok(Object.isFrozen(report.checks[0]))
})

// ── contract validation: clean pass ──────────────────────────────────────────────────────

test('validateCoachDnaContract passes every canonical scenario', () => {
  for (const name of SCENARIO_NAMES) {
    const res = validateCoachDnaContract(COACH_DNA_SNAPSHOT_SCENARIOS[name])
    assert.equal(res.pass, true, name)
    assert.deepEqual(res.issues, [], name)
    assert.ok(Object.isFrozen(res))
  }
})

// ── contract validation: detects missing / malformed values ──────────────────────────────

test('contract validation detects a non-object input', () => {
  for (const bad of [null, undefined, 'x', 42, []]) {
    const res = validateCoachDnaContract(bad)
    assert.equal(res.pass, false)
    assert.ok(res.issues.includes('coachView is not an object'))
  }
})

test('contract validation detects a missing/invalid required field', () => {
  const base = COACH_DNA_SNAPSHOT_SCENARIOS.selectionLed
  assert.ok(validateCoachDnaContract({ ...base, headline: 123 }).issues.includes('headline must be a non-empty string'))
  assert.ok(validateCoachDnaContract({ ...base, headline: '' }).issues.includes('headline must be a non-empty string'))
  assert.ok(validateCoachDnaContract({ ...base, summary: 5 }).issues.includes('summary must be a string or null'))
  assert.ok(validateCoachDnaContract({ ...base, metadata: { explainable: 'yes', deterministic: true, llmGenerated: false } }).issues.includes('metadata.explainable must be a boolean'))
  // a whole missing sub-object
  assert.ok(validateCoachDnaContract({ ...base, knowledge: undefined }).issues.includes('knowledge must be an object'))
})

test('contract validation detects out-of-range numeric values', () => {
  const base = COACH_DNA_SNAPSHOT_SCENARIOS.selectionLed
  assert.ok(validateCoachDnaContract({ ...base, confidence: { value: 5, level: 'HIGH', label: 'High' } }).issues.includes('confidence.value must be a number in 0..1'))
  assert.ok(validateCoachDnaContract({ ...base, identity: { ...base.identity, diversityScore: -0.2 } }).issues.includes('identity.diversityScore must be a number in 0..1'))
  const badSignal = validateCoachDnaContract({ ...base, dominantSignals: [{ category: 'c', label: 'l', occurrences: -1, strength: 2, averageConfidence: 0.5, averageWeight: 0.5, supportingCount: 0 }] })
  assert.ok(badSignal.issues.includes('dominantSignals[0].occurrences must be a number >= 0'))
  assert.ok(badSignal.issues.includes('dominantSignals[0].strength must be a number in 0..1'))
  const badTheme = validateCoachDnaContract({ ...base, themes: [{ type: 't', label: 'l', count: -3, averageConfidence: 0.5, averageWeight: 0.5 }] })
  assert.ok(badTheme.issues.includes('themes[0].count must be a number >= 0'))
})

// ── the main validator surfaces contract failures via options.scenarios ──────────────────

test('a malformed coachView fails the contract aspect in the full report', () => {
  const malformed = { ...COACH_DNA_SNAPSHOT_SCENARIOS.selectionLed, knowledge: { totalMemories: -1, uniqueTypes: 1, averageConfidence: 0.5, averageWeight: 0.5, totalEvidence: 0, totalOntologyLinks: 0 } }
  const report = validateCoachDnaExports({ scenarios: { custom: malformed } })
  assert.equal(report.pass, false)
  const contract = report.checks.find((c) => c.snapshot === 'custom' && c.aspect === 'contract')
  assert.equal(contract.pass, false)
  assert.match(contract.mismatch, /knowledge\.totalMemories must be a number >= 0/)
  assert.ok(report.mismatchSummary.some((m) => m.startsWith('contract[custom]')))
})

// ── snapshot regression detection ────────────────────────────────────────────────────────

test('detects a tampered snapshot (screen regression)', () => {
  const tampered = { ...buildCoachDnaSnapshots(), selectionLed: '<div class="brain-coach-dna-snapshot">TAMPERED</div>' }
  const report = validateCoachDnaExports({ snapshots: tampered })
  assert.equal(report.pass, false)
  const screen = report.checks.find((c) => c.snapshot === 'selectionLed' && c.aspect === 'screen')
  assert.equal(screen.pass, false)
  assert.match(screen.mismatch, /differs from canonical snapshot/)
  // a missing snapshot key is also caught
  const missing = { ...buildCoachDnaSnapshots() }
  delete missing.empty
  const report2 = validateCoachDnaExports({ snapshots: missing })
  assert.equal(report2.checks.find((c) => c.snapshot === 'empty' && c.aspect === 'screen').mismatch, 'missing rendered snapshot')
})

// ── robustness: never throws on hostile input ────────────────────────────────────────────

test('validator never throws on malformed scenarios (reports instead)', () => {
  let report
  assert.doesNotThrow(() => { report = validateCoachDnaExports({ scenarios: { broken: { headline: 'x' } } }) })
  assert.equal(report.pass, false)
  // contract catches the missing fields; render aspects stay defensive and still pass structurally
  assert.ok(report.checks.find((c) => c.snapshot === 'broken' && c.aspect === 'contract').pass === false)
})

test('options that are not objects are treated as defaults (clean pass)', () => {
  assert.equal(validateCoachDnaExports(null).pass, true)
  assert.equal(validateCoachDnaExports('x').pass, true)
})

// ── exports exist ──────────────────────────────────────────────────────────────────────

test('exports exist', () => {
  assert.equal(typeof validateCoachDnaExports, 'function')
  assert.equal(typeof validateCoachDnaContract, 'function')
})
