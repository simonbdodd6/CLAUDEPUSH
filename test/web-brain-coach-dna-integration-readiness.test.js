/**
 * web/brain-coach-dna-integration-readiness - Coach DNA Integration Readiness (M284) tests
 *
 * Verifies the integration-readiness report: it declares the Brain pipeline's fixed data requirements and
 * checks a SUPPLIED availability/mapping declaration against them (available/missing/partial/unknown inputs,
 * mapping status, rule-based score, ready/partial/blocked/unknown state, blockers and warnings) — WITHOUT
 * reading Core files, querying databases, inspecting production data, wiring anything, recommending or
 * advising. Undeclared fields stay unknown, malformed input fails safe, nothing is mutated, and the report is
 * deeply frozen and byte-deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaIntegrationReadiness,
  summarizeCoachDnaIntegrationReadiness,
  serializeCoachDnaIntegrationReadiness,
} from '../web/brain-coach-dna-integration-readiness.js'

const FORBIDDEN_LANG = /\b(you should|recommend(ation|ed|s)?|advis\w+|advice|must (start|bench|do)|drop him|pick him|best xv|predict|forecast|ranking|ranked|scored|training plan|session plan|do this drill|run this session|session analysis|better|worse|stronger|weaker)\b/i

const ALL_KEYS = [
  'coachIdentity', 'coachProfileVersion', 'coachMemoryRecords', 'memoryTypeTaxonomy',
  'selectionPreferenceSignals', 'playerManagementSignals', 'trainingPreferenceSignals',
  'tacticalPreferenceSignals', 'communicationStyleSignals', 'learnedPatternSignals',
  'memoryConfidenceScores', 'evidenceCounts', 'ontologyLinks', 'memorySourceIdentifiers', 'memoryTimestamps',
]
const CATEGORIES = ['coach-identity', 'coach-memory', 'selection-evidence', 'training-evidence', 'confidence-evidence', 'provenance']

function freeze(o) {
  if (o && typeof o === 'object') { for (const k of Object.keys(o)) freeze(o[k]); Object.freeze(o) }
  return o
}
const fullFields = () => Object.fromEntries(ALL_KEYS.map((k) => [k, { available: true, mapped: true, path: `core.${k}` }]))
const READY_DECL = freeze({ source: 'coach-eye-core-v1', fields: fullFields() })
const PARTIAL_DECL = freeze({
  source: 'coach-eye-core-v1',
  fields: (() => {
    const f = fullFields()
    f.evidenceCounts = { available: 'partial', mapped: true }   // important, partial
    f.ontologyLinks = false                                      // optional, missing
    delete f.memoryTimestamps                                    // optional, undeclared → unknown
    return f
  })(),
})
const BLOCKED_DECL = freeze({
  source: 'coach-eye-core-v1',
  fields: (() => {
    const f = fullFields()
    f.memorySourceIdentifiers = false                            // critical, missing → blocker
    f.trainingPreferenceSignals = { available: true, mapped: false } // critical, unmapped → blocker
    return f
  })(),
})
const R = buildCoachDnaIntegrationReadiness(READY_DECL)

test('the requirement registry covers all six categories with fixed keys', () => {
  assert.equal(R.type, 'coach-dna-integration-readiness')
  assert.equal(R.schemaVersion, 1)
  assert.equal(R.readinessVersion, 1)
  assert.equal(R.milestone, 'M284')
  assert.deepEqual(R.requiredInputs.map((r) => r.key), ALL_KEYS)
  assert.deepEqual([...new Set(R.requiredInputs.map((r) => r.category))], CATEGORIES)
  for (const r of R.requiredInputs) {
    assert.ok(['critical', 'important', 'optional'].includes(r.criticality), r.key)
    assert.ok(typeof r.description === 'string' && r.description.length > 0, r.key)
    assert.ok(typeof r.consumedBy === 'string' && r.consumedBy.length > 0, r.key)
  }
  // every category carries at least one critical requirement
  const criticalCategories = new Set(R.requiredInputs.filter((r) => r.criticality === 'critical').map((r) => r.category))
  for (const c of ['coach-identity', 'coach-memory', 'selection-evidence', 'training-evidence', 'confidence-evidence', 'provenance']) {
    assert.ok(criticalCategories.has(c), c)
  }
})

test('fully ready data reports ready with score 1 and no blockers or warnings', () => {
  assert.equal(R.readinessState, 'ready')
  assert.equal(R.readinessScore, 1)
  assert.equal(R.dryRunReady, true)
  assert.equal(R.availableInputs.length, ALL_KEYS.length)
  assert.deepEqual(R.missingInputs, [])
  assert.deepEqual(R.partialInputs, [])
  assert.deepEqual(R.unknownInputs, [])
  assert.deepEqual(R.blockers, [])
  assert.deepEqual(R.warnings, [])
  assert.equal(R.mappingStatus.mapped.length, ALL_KEYS.length)
  assert.deepEqual(R.mappingStatus.needsMapping, [])
  assert.match(R.readinessFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('partial data reports partial with the documented score', () => {
  const p = buildCoachDnaIntegrationReadiness(PARTIAL_DECL)
  assert.equal(p.readinessState, 'partial')
  assert.equal(p.dryRunReady, false)
  assert.deepEqual(p.partialInputs, ['evidenceCounts'])
  assert.deepEqual(p.missingInputs, ['ontologyLinks'])
  assert.deepEqual(p.unknownInputs, ['memoryTimestamps'])
  assert.equal(p.readinessScore, 0.9091)   // Σ(w·avail·map)/Σw per the documented rule
  assert.deepEqual(p.warnings.map((w) => w.key), ['evidenceCounts', 'ontologyLinks'])
  assert.deepEqual(p.blockers, [])
})

test('missing or unmapped critical data reports blocked with named blockers', () => {
  const b = buildCoachDnaIntegrationReadiness(BLOCKED_DECL)
  assert.equal(b.readinessState, 'blocked')
  assert.equal(b.dryRunReady, false)
  assert.deepEqual(b.blockers.map((x) => x.key), ['trainingPreferenceSignals', 'memorySourceIdentifiers'])
  assert.equal(b.blockers[0].reason, 'critical input present but declared unmapped to the M230 view')
  assert.equal(b.blockers[1].reason, 'critical input declared missing from Core data')
  assert.deepEqual(b.mappingStatus.needsMapping, ['trainingPreferenceSignals'])
  assert.deepEqual(b.missingInputs, ['memorySourceIdentifiers'])
  assert.equal(b.readinessScore, 0.8636)
})

test('empty and undeclared input stays unknown — nothing is assumed', () => {
  const empty = buildCoachDnaIntegrationReadiness({ fields: {} })
  assert.equal(empty.readinessState, 'unknown')
  assert.equal(empty.dryRunReady, false)
  assert.equal(empty.unknownInputs.length, ALL_KEYS.length)
  assert.deepEqual(empty.availableInputs, [])
  assert.deepEqual(empty.missingInputs, [])
  assert.equal(empty.validationState.declarationRecognized, true)
  assert.equal(empty.validationState.declaredRequiredInputs, 0)
})

test('malformed input fails safe — unknown state, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { fields: 'x' }, { fields: [] }]) {
    let r
    assert.doesNotThrow(() => { r = buildCoachDnaIntegrationReadiness(bad) })
    assert.equal(r.readinessState, 'unknown')
    assert.equal(r.dryRunReady, false)
    assert.equal(r.validationState.declarationRecognized, false)
    assert.deepEqual(r.validationState.issues, ['availability declaration missing or malformed'])
    assert.equal(r.unknownInputs.length, ALL_KEYS.length)
  }
})

test('boolean shorthand declarations are accepted; unrecognized fields are reported, not invented', () => {
  const r = buildCoachDnaIntegrationReadiness({ fields: { coachIdentity: true, coachMemoryRecords: false, bogusField: true } })
  assert.ok(r.availableInputs.includes('coachIdentity'))
  assert.ok(r.missingInputs.includes('coachMemoryRecords'))
  assert.deepEqual(r.validationState.unrecognizedFields, ['bogusField'])
  // a boolean declares availability only — mapping stays unknown
  assert.ok(r.mappingStatus.unknown.includes('coachIdentity'))
})

test('missing fields remain missing — no invention, no default availability', () => {
  const r = buildCoachDnaIntegrationReadiness({ fields: { coachIdentity: { available: true, mapped: true } } })
  assert.deepEqual(r.availableInputs, ['coachIdentity'])
  assert.equal(r.unknownInputs.length, ALL_KEYS.length - 1)
  assert.equal(r.readinessState, 'partial')   // declared but far from ready — never upgraded
  const entry = r.inputStatus.find((e) => e.key === 'selectionPreferenceSignals')
  assert.equal(entry.availability, 'unknown')
  assert.equal(entry.mapping, 'unknown')
  assert.equal(entry.path, null)
})

test('the scoring and state rules are documented in the derivation metadata', () => {
  assert.deepEqual(R.derivationMetadata.rules.criticalityWeight, { critical: 3, important: 2, optional: 1 })
  assert.deepEqual(R.derivationMetadata.rules.availabilityScore, { available: 1, partial: 0.5, missing: 0, unknown: 0 })
  assert.deepEqual(R.derivationMetadata.rules.mappingMultiplier, { mapped: 1, unknown: 0.75, unmapped: 0.5 })
  assert.match(R.derivationMetadata.rules.state, /blocked/)
  assert.equal(R.derivationMetadata.ruleBased, true)
  assert.equal(R.derivationMetadata.deterministic, true)
})

test('the report declares no wiring, no Core access, no runtime activation', () => {
  assert.equal(R.derivationMetadata.productionWiring, false)
  assert.equal(R.derivationMetadata.runtimeActivation, false)
  assert.equal(R.derivationMetadata.readsCoreFiles, false)
  assert.equal(R.derivationMetadata.queriesDatabases, false)
  assert.equal(R.derivationMetadata.inspectsProductionData, false)
  assert.equal(R.derivationMetadata.dormant, true)
  assert.equal(R.derivationMetadata.derivedFrom, 'supplied-availability-declaration')
  assert.equal(R.provenance.describedBy, 'supplied-availability-declaration')
  assert.deepEqual(R.provenance.assessedForPipeline, ['M230', 'M256', 'M268', 'M276', 'M283'])
  assert.equal(R.provenance.declarationSource, 'coach-eye-core-v1')
})

test('contains NO player data and NO recommendation or advice flags', () => {
  const json = JSON.stringify(R)
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i)
  assert.doesNotMatch(json, FORBIDDEN_LANG)
  assert.equal(R.derivationMetadata.coachAdvice, false)
  assert.equal(R.derivationMetadata.createsRecommendations, false)
  assert.equal(R.derivationMetadata.containsPlayerData, false)
  assert.equal(R.derivationMetadata.playerEvaluation, false)
  assert.equal(R.derivationMetadata.trainingRecommendation, false)
  assert.equal(R.derivationMetadata.generatesTrainingContent, false)
  assert.equal(R.derivationMetadata.analysesSessions, false)
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaIntegrationReadiness(READY_DECL), serializeCoachDnaIntegrationReadiness(READY_DECL))
  assert.equal(buildCoachDnaIntegrationReadiness(READY_DECL).readinessFingerprint, R.readinessFingerprint)
  assert.equal(buildCoachDnaIntegrationReadiness(BLOCKED_DECL).readinessFingerprint, buildCoachDnaIntegrationReadiness(BLOCKED_DECL).readinessFingerprint)
})

test('the fingerprint tracks the declaration', () => {
  const ready = R.readinessFingerprint
  const partial = buildCoachDnaIntegrationReadiness(PARTIAL_DECL).readinessFingerprint
  const blocked = buildCoachDnaIntegrationReadiness(BLOCKED_DECL).readinessFingerprint
  assert.notEqual(ready, partial)
  assert.notEqual(partial, blocked)
  assert.notEqual(ready, blocked)
})

test('the supplied declaration is never mutated', () => {
  const decl = { source: 'core', fields: { coachIdentity: { available: true, mapped: false }, ontologyLinks: false } }
  const before = JSON.stringify(decl)
  buildCoachDnaIntegrationReadiness(decl)
  assert.equal(JSON.stringify(decl), before)
})

test('the report is deeply frozen', () => {
  assert.ok(Object.isFrozen(R))
  assert.ok(Object.isFrozen(R.requiredInputs))
  assert.ok(Object.isFrozen(R.requiredInputs[0]))
  assert.ok(Object.isFrozen(R.mappingStatus))
  assert.ok(Object.isFrozen(R.inputStatus[0]))
  assert.ok(Object.isFrozen(R.blockers))
  assert.ok(Object.isFrozen(R.provenance))
  assert.ok(Object.isFrozen(R.derivationMetadata.rules))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaIntegrationReadiness(READY_DECL, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-integration-readiness')
  const line = serializeCoachDnaIntegrationReadiness(READY_DECL, { format: 'line' })
  assert.match(line, /^coach-dna-integration-readiness state=ready score=1 available=15\/15 blockers=0 dryRunReady=true /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaIntegrationReadiness(READY_DECL, { format: 'xml' }), /unsupported/)
})

test('rendered output carries no recommendation or advice language', () => {
  for (const decl of [READY_DECL, PARTIAL_DECL, BLOCKED_DECL, null]) {
    assert.doesNotMatch(serializeCoachDnaIntegrationReadiness(decl), FORBIDDEN_LANG)
    assert.doesNotMatch(summarizeCoachDnaIntegrationReadiness(decl), FORBIDDEN_LANG)
  }
  assert.match(summarizeCoachDnaIntegrationReadiness(READY_DECL), /integration readiness: ready/)
  assert.match(summarizeCoachDnaIntegrationReadiness(BLOCKED_DECL), /integration readiness: blocked/)
  assert.match(summarizeCoachDnaIntegrationReadiness(null), /integration readiness: unknown/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaIntegrationReadiness, 'function')
  assert.equal(typeof summarizeCoachDnaIntegrationReadiness, 'function')
  assert.equal(typeof serializeCoachDnaIntegrationReadiness, 'function')
})
