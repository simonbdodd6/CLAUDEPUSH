/**
 * web/brain-coach-dna-integration-readiness (real-shaped fixture) - Coach DNA Real Declaration Fixture (M285) tests
 *
 * Runs the M284 integration-readiness report over the first REAL-SHAPED Core availability declaration
 * (test/fixtures/coach-dna-integration-readiness.real-shaped.fixture.js — written from the actual Core Phase 0
 * codebase, anonymised, no live data). Verifies the honest verdict: Core identity and the memory-type taxonomy
 * are available and mapped, the entire memory-record family is mapped but NOT persisted (Phase 0 has no coach
 * memory store), so the readiness state is 'blocked' with the five critical gaps named. Also verifies the
 * fixture carries no personal data or production identifiers, missing fields stay missing, and the report is
 * deterministic, unmutated, frozen and serialization-consistent.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { REAL_SHAPED_CORE_DECLARATION } from './fixtures/coach-dna-integration-readiness.real-shaped.fixture.js'
import {
  buildCoachDnaIntegrationReadiness,
  summarizeCoachDnaIntegrationReadiness,
  serializeCoachDnaIntegrationReadiness,
} from '../web/brain-coach-dna-integration-readiness.js'

const FORBIDDEN_LANG = /\b(you should|recommend(ation|ed|s)?|advis\w+|advice|must (start|bench|do)|drop him|pick him|best xv|predict|forecast|ranking|ranked|scored|training plan|session plan|do this drill|run this session|session analysis|better|worse|stronger|weaker)\b/i

const R = buildCoachDnaIntegrationReadiness(REAL_SHAPED_CORE_DECLARATION)
const ALL_JSON = JSON.stringify(R) + JSON.stringify(REAL_SHAPED_CORE_DECLARATION)

test('the fixture declares all 15 required inputs against the Phase 0 Core codebase', () => {
  assert.equal(REAL_SHAPED_CORE_DECLARATION.source, 'coach-eye-core-phase0')
  assert.equal(R.validationState.declarationRecognized, true)
  assert.equal(R.validationState.declaredRequiredInputs, 15)
  assert.deepEqual(R.validationState.unrecognizedFields, [])
  // every field carries an explicit availability, mapping and a code-path source hint
  for (const [key, field] of Object.entries(REAL_SHAPED_CORE_DECLARATION.fields)) {
    assert.equal(typeof field.available, 'boolean', key)
    assert.equal(typeof field.mapped, 'boolean', key)
    assert.ok(typeof field.path === 'string' && field.path.length > 0, key)
    if (field.available === false) assert.ok(typeof field.notes === 'string' && field.notes.length > 0, `${key} explains its gap`)
  }
})

test('the readiness state is honest: blocked — mapping complete, memory store not built', () => {
  assert.equal(R.readinessState, 'blocked')
  assert.equal(R.dryRunReady, false)
  assert.equal(R.readinessScore, 0.1818)
  // what Core Phase 0 genuinely has
  assert.deepEqual(R.availableInputs, ['coachIdentity', 'coachProfileVersion', 'memoryTypeTaxonomy'])
  // everything memory-derived is missing — and stays missing
  assert.equal(R.missingInputs.length, 12)
  assert.deepEqual(R.partialInputs, [])
  assert.deepEqual(R.unknownInputs, [])
  // the mapping chain itself is complete: nothing needs mapping, all 15 are mapped
  assert.deepEqual(R.mappingStatus.needsMapping, [])
  assert.equal(R.mappingStatus.mapped.length, 15)
})

test('the five critical gaps are named as blockers, in registry order', () => {
  assert.deepEqual(R.blockers.map((b) => b.key), [
    'coachMemoryRecords',
    'selectionPreferenceSignals',
    'trainingPreferenceSignals',
    'memoryConfidenceScores',
    'memorySourceIdentifiers',
  ])
  for (const b of R.blockers) assert.equal(b.reason, 'critical input declared missing from Core data')
})

test('important and optional gaps surface as warnings, never upgraded', () => {
  assert.deepEqual(R.warnings.map((w) => w.key), [
    'playerManagementSignals', 'tacticalPreferenceSignals', 'communicationStyleSignals',
    'learnedPatternSignals', 'evidenceCounts', 'ontologyLinks', 'memoryTimestamps',
  ])
  // missing fields remain missing in the per-input status — no invention
  for (const key of R.missingInputs) {
    const entry = R.inputStatus.find((e) => e.key === key)
    assert.equal(entry.availability, 'missing', key)
  }
})

test('the fixture and report contain no personal data', () => {
  assert.doesNotMatch(ALL_JSON, /[\w.+-]+@[\w-]+\.[a-z]/i)                       // no email addresses
  assert.doesNotMatch(ALL_JSON, /\b(password|secret|credential|bearer|api[-_]?key)\b/i) // no credentials
  assert.doesNotMatch(ALL_JSON, /player(Id|Name|s)\b/i)                          // no player data
  assert.doesNotMatch(ALL_JSON, /\b(statement|memoryText|note[sS]?Content)":/)   // no memory record contents
})

test('the fixture and report contain no production identifiers', () => {
  assert.doesNotMatch(ALL_JSON, /boitsfort/i)                                    // no real club id
  assert.doesNotMatch(ALL_JSON, /ce_session|sessionId|identity:sessions/)        // no session identifiers
  assert.doesNotMatch(ALL_JSON, /https?:\/\//)                                   // no live endpoints
  assert.doesNotMatch(ALL_JSON, /\bredis:\/\/|\bkv_/i)                           // no connection strings
})

test('the report is deterministic and byte-identical across runs', () => {
  assert.equal(serializeCoachDnaIntegrationReadiness(REAL_SHAPED_CORE_DECLARATION), serializeCoachDnaIntegrationReadiness(REAL_SHAPED_CORE_DECLARATION))
  assert.equal(buildCoachDnaIntegrationReadiness(REAL_SHAPED_CORE_DECLARATION).readinessFingerprint, R.readinessFingerprint)
  assert.match(R.readinessFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('the fixture is never mutated (it ships frozen and survives a build untouched)', () => {
  assert.ok(Object.isFrozen(REAL_SHAPED_CORE_DECLARATION))
  assert.ok(Object.isFrozen(REAL_SHAPED_CORE_DECLARATION.fields.coachMemoryRecords))
  const before = JSON.stringify(REAL_SHAPED_CORE_DECLARATION)
  buildCoachDnaIntegrationReadiness(REAL_SHAPED_CORE_DECLARATION)
  assert.equal(JSON.stringify(REAL_SHAPED_CORE_DECLARATION), before)
})

test('the report is deeply frozen', () => {
  assert.ok(Object.isFrozen(R))
  assert.ok(Object.isFrozen(R.blockers))
  assert.ok(Object.isFrozen(R.blockers[0]))
  assert.ok(Object.isFrozen(R.inputStatus))
  assert.ok(Object.isFrozen(R.provenance))
})

test('serialization is consistent across formats', () => {
  const json = serializeCoachDnaIntegrationReadiness(REAL_SHAPED_CORE_DECLARATION, { format: 'json' })
  assert.equal(JSON.parse(json).readinessState, 'blocked')
  const line = serializeCoachDnaIntegrationReadiness(REAL_SHAPED_CORE_DECLARATION, { format: 'line' })
  assert.match(line, /^coach-dna-integration-readiness state=blocked score=0\.1818 available=3\/15 blockers=5 dryRunReady=false /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
})

test('the provenance records the declaration source and the assessed pipeline', () => {
  assert.equal(R.provenance.declarationSource, 'coach-eye-core-phase0')
  assert.deepEqual(R.provenance.assessedForPipeline, ['M230', 'M256', 'M268', 'M276', 'M283'])
  assert.equal(R.provenance.declaredFieldCount, 15)
  assert.equal(R.derivationMetadata.readsCoreFiles, false)
  assert.equal(R.derivationMetadata.queriesDatabases, false)
  assert.equal(R.derivationMetadata.inspectsProductionData, false)
})

test('report and summary carry no recommendation or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaIntegrationReadiness(REAL_SHAPED_CORE_DECLARATION), FORBIDDEN_LANG)
  assert.doesNotMatch(summarizeCoachDnaIntegrationReadiness(REAL_SHAPED_CORE_DECLARATION), FORBIDDEN_LANG)
  assert.match(summarizeCoachDnaIntegrationReadiness(REAL_SHAPED_CORE_DECLARATION), /integration readiness: blocked/)
})
