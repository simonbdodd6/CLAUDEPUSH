/**
 * web/brain-coach-dna-cross-domain-intelligence-query - Coach DNA Cross-Domain Intelligence Query Surface (M280) tests
 *
 * Verifies the stable cross-domain read API: it answers domain/evidence/confidence/completeness/provenance
 * lookups from the M278 profile / M279 index (accepting a profile, an index, or a { profile, index } pair and
 * building the index on demand) WITHOUT comparing domains, combining figures or creating any new intelligence.
 * Lookups are total and safe (unknown/missing → null, never throws), responses are frozen copies, partial and
 * malformed inputs fail safe, provenance is consistent across input forms, nothing is mutated, and answers are
 * byte-deterministic.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createCoachDnaCrossDomainIntelligenceQuery,
  isUsable,
  getDomain,
  getEvidence,
  getConfidence,
  getCompleteness,
  getProvenance,
  getValidationState,
  listAvailableDomains,
} from '../web/brain-coach-dna-cross-domain-intelligence-query.js'
import { buildCoachDnaCrossDomainIntelligenceIndex } from '../web/brain-coach-dna-cross-domain-intelligence-index.js'
import { buildCoachDnaCrossDomainIntelligenceProfile } from '../web/brain-coach-dna-cross-domain-intelligence-profile.js'
import { buildCoachDnaCrossDomainIntelligenceInputs } from '../web/brain-coach-dna-cross-domain-intelligence-inputs.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { createCoachDnaIntelligenceQuery } from '../web/brain-coach-dna-intelligence-query.js'
import { buildCoachDnaSelectionIntelligenceInputs } from '../web/brain-coach-dna-selection-intelligence-inputs.js'
import { buildCoachDnaSelectionIntelligenceProfile } from '../web/brain-coach-dna-selection-intelligence-profile.js'
import { createCoachDnaSelectionIntelligenceQuery } from '../web/brain-coach-dna-selection-intelligence-query.js'
import { buildCoachDnaSelectionIntelligenceCharacteristics } from '../web/brain-coach-dna-selection-intelligence-characteristics.js'
import { buildCoachDnaSelectionIntelligenceEvidenceAssessment } from '../web/brain-coach-dna-selection-intelligence-evidence-assessment.js'
import { buildCoachDnaSelectionIntelligenceSummary } from '../web/brain-coach-dna-selection-intelligence-summary.js'
import { buildCoachDnaTrainingIntelligenceInputs } from '../web/brain-coach-dna-training-intelligence-inputs.js'
import { buildCoachDnaTrainingIntelligenceProfile } from '../web/brain-coach-dna-training-intelligence-profile.js'
import { createCoachDnaTrainingIntelligenceQuery } from '../web/brain-coach-dna-training-intelligence-query.js'
import { buildCoachDnaTrainingIntelligenceCharacteristics } from '../web/brain-coach-dna-training-intelligence-characteristics.js'
import { buildCoachDnaTrainingIntelligenceEvidenceAssessment } from '../web/brain-coach-dna-training-intelligence-evidence-assessment.js'
import { buildCoachDnaTrainingIntelligenceSummary } from '../web/brain-coach-dna-training-intelligence-summary.js'

const FORBIDDEN_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv|predict|forecast|ranking|ranked|scored|select him|start him|bench him|training plan|session plan|do this drill|run this session|session analysis)\b/i

function freeze(o) {
  if (o && typeof o === 'object') { for (const k of Object.keys(o)) freeze(o[k]); Object.freeze(o) }
  return o
}
const SEL_VIEW = freeze({
  profileVersion: 'coach-dna-v3',
  confidence: { value: 0.72, level: 'HIGH', label: 'High' },
  headline: 'Selection-led',
  identity: { strongestCategory: 'selection-preference', strongestLabel: 'Selection', weakestCategory: 'risk-warning', weakestLabel: 'Risk warnings', diversityScore: 0.5, diversityLabel: 'Balanced' },
  dominantSignals: [
    { category: 'selection-preference', label: 'Selection', occurrences: 7, strength: 0.9, averageConfidence: 0.8, averageWeight: 0.65, supportingCount: 6 },
    { category: 'player-management', label: 'Player management', occurrences: 4, strength: 0.5, averageConfidence: 0.7, averageWeight: 0.6, supportingCount: 3 },
  ],
  themes: [
    { type: 'selection-preference', label: 'Selection', count: 7, averageConfidence: 0.8, averageWeight: 0.65 },
    { type: 'philosophy', label: 'Philosophy', count: 3, averageConfidence: 0.6, averageWeight: 0.5 },
  ],
  knowledge: { totalMemories: 14, uniqueTypes: 4, averageConfidence: 0.7, averageWeight: 0.6, totalEvidence: 22, totalOntologyLinks: 9 },
  summary: 'A selection-led coach.',
  metadata: { explainable: true, deterministic: true, llmGenerated: false },
})
const TRN_VIEW = freeze({
  profileVersion: 'coach-dna-v3',
  confidence: { value: 0.72, level: 'HIGH', label: 'High' },
  headline: 'Training-led',
  identity: { strongestCategory: 'training-preference', strongestLabel: 'Training', weakestCategory: 'risk-warning', weakestLabel: 'Risk warnings', diversityScore: 0.5, diversityLabel: 'Balanced' },
  dominantSignals: [
    { category: 'training-preference', label: 'Training', occurrences: 8, strength: 0.85, averageConfidence: 0.8, averageWeight: 0.65, supportingCount: 6 },
    { category: 'player-management', label: 'Player management', occurrences: 3, strength: 0.5, averageConfidence: 0.6, averageWeight: 0.55, supportingCount: 2 },
  ],
  themes: [
    { type: 'training-preference', label: 'Training', count: 8, averageConfidence: 0.8, averageWeight: 0.65 },
    { type: 'communication-style', label: 'Communication', count: 2, averageConfidence: 0.5, averageWeight: 0.45 },
  ],
  knowledge: { totalMemories: 13, uniqueTypes: 4, averageConfidence: 0.7, averageWeight: 0.6, totalEvidence: 21, totalOntologyLinks: 8 },
  summary: 'A training-led coach.',
  metadata: { explainable: true, deterministic: true, llmGenerated: false },
})

const selSummaryOf = (view) => {
  const chars = buildCoachDnaSelectionIntelligenceCharacteristics(createCoachDnaSelectionIntelligenceQuery(buildCoachDnaSelectionIntelligenceProfile(buildCoachDnaSelectionIntelligenceInputs(createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(view)))))))
  return buildCoachDnaSelectionIntelligenceSummary(chars, buildCoachDnaSelectionIntelligenceEvidenceAssessment(chars))
}
const trnSummaryOf = (view) => {
  const chars = buildCoachDnaTrainingIntelligenceCharacteristics(createCoachDnaTrainingIntelligenceQuery(buildCoachDnaTrainingIntelligenceProfile(buildCoachDnaTrainingIntelligenceInputs(createCoachDnaIntelligenceQuery(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(view)))))))
  return buildCoachDnaTrainingIntelligenceSummary(chars, buildCoachDnaTrainingIntelligenceEvidenceAssessment(chars))
}
const SEL = selSummaryOf(SEL_VIEW)
const TRN = trnSummaryOf(TRN_VIEW)
const PROFILE = freeze(JSON.parse(JSON.stringify(buildCoachDnaCrossDomainIntelligenceProfile(buildCoachDnaCrossDomainIntelligenceInputs(SEL, TRN)))))
const INDEX = freeze(JSON.parse(JSON.stringify(buildCoachDnaCrossDomainIntelligenceIndex(PROFILE))))
const PARTIAL_PROFILE = freeze(JSON.parse(JSON.stringify(buildCoachDnaCrossDomainIntelligenceProfile(buildCoachDnaCrossDomainIntelligenceInputs(SEL)))))
const Q = createCoachDnaCrossDomainIntelligenceQuery({ profile: PROFILE, index: INDEX })

test('a valid profile/index pair yields a usable query surface', () => {
  assert.equal(Q.isUsable(), true)
  assert.deepEqual(Q.listAvailableDomains(), ['selection', 'training'])
})

test('getDomain answers by key with frozen copies of the index entries', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(Q.getDomain('selection'))), JSON.parse(JSON.stringify(INDEX.domainIndex.selection)))
  assert.deepEqual(JSON.parse(JSON.stringify(Q.getDomain('training'))), JSON.parse(JSON.stringify(INDEX.domainIndex.training)))
  assert.equal(Q.getDomain('selection').readiness, 'partial')
  assert.equal(Q.getDomain('training').strongestCharacteristic, 'sessionStructure')
})

test('getEvidence answers per domain and as the full byDomain map', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(Q.getEvidence())), JSON.parse(JSON.stringify(INDEX.evidenceIndex.byDomain)))
  assert.deepEqual(JSON.parse(JSON.stringify(Q.getEvidence('selection'))), JSON.parse(JSON.stringify(INDEX.evidenceIndex.byDomain.selection)))
  assert.equal(Q.getEvidence('training').completeness, 'moderate')
})

test('getConfidence answers per domain and as the full byDomain map', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(Q.getConfidence())), JSON.parse(JSON.stringify(INDEX.confidenceIndex.byDomain)))
  assert.deepEqual(Q.getConfidence('selection'), { level: 'HIGH', value: 0.72, high: true, low: false })
})

test('getCompleteness reports the assembly state without deriving anything new', () => {
  assert.deepEqual(Q.getCompleteness(), {
    level: 'complete', complete: true, includedDomains: 2, usableDomains: 2, totalDomains: 2,
  })
})

test('unknown or invalid domain keys return null, never throw', () => {
  for (const bad of ['nutrition', 'Selection', '', 7, null, {}, []]) {
    assert.equal(Q.getDomain(bad), null)
    assert.equal(Q.getEvidence(bad), null)
    assert.equal(Q.getConfidence(bad), null)
  }
})

test('profile-only, index-only and pair inputs give identical answers', () => {
  for (const helper of [getDomain, getEvidence, getConfidence]) {
    for (const key of ['selection', 'training']) {
      assert.equal(JSON.stringify(helper(PROFILE, key)), JSON.stringify(helper(INDEX, key)))
      assert.equal(JSON.stringify(helper(PROFILE, key)), JSON.stringify(helper({ profile: PROFILE, index: INDEX }, key)))
    }
  }
  assert.equal(JSON.stringify(getProvenance(PROFILE)), JSON.stringify(getProvenance(INDEX)))
  assert.equal(JSON.stringify(getCompleteness(PROFILE)), JSON.stringify(getCompleteness({ profile: PROFILE })))
  assert.equal(isUsable(PROFILE), true)
  assert.equal(isUsable(INDEX), true)
  assert.deepEqual(listAvailableDomains(INDEX), ['selection', 'training'])
})

test('a partial profile answers with null for the missing domain', () => {
  const q = createCoachDnaCrossDomainIntelligenceQuery(PARTIAL_PROFILE)
  assert.equal(q.isUsable(), true)
  assert.deepEqual(q.listAvailableDomains(), ['selection'])
  assert.equal(q.getDomain('training').usable, false)
  assert.equal(q.getDomain('training').readiness, 'unknown')
  assert.equal(q.getEvidence('training'), null)
  assert.equal(q.getConfidence('training'), null)
  assert.deepEqual(q.getCompleteness(), { level: 'partial', complete: false, includedDomains: 1, usableDomains: 1, totalDomains: 2 })
  assert.equal(q.getEvidence().training, null)
  assert.equal(q.getEvidence().selection.assessed, true)
})

test('malformed inputs fail safe — unusable surface, null answers, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, [], { type: 'wrong' }, { profile: 'x' }, { index: [] }]) {
    let q
    assert.doesNotThrow(() => { q = createCoachDnaCrossDomainIntelligenceQuery(bad) })
    assert.equal(q.isUsable(), false)
    assert.equal(q.getDomain('selection'), null)
    assert.equal(q.getEvidence('training'), null)
    assert.deepEqual(q.listAvailableDomains(), [])
    assert.equal(q.getCompleteness().level, 'empty')
    assert.deepEqual(q.getValidationState().issues, ['no cross-domain index available'])
  }
})

test('provenance is consistent with the index and across input forms', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(Q.getProvenance())), JSON.parse(JSON.stringify(INDEX.provenanceIndex)))
  assert.deepEqual(Q.getProvenance().chain, ['M277', 'M278', 'M279'])
  assert.deepEqual(Q.getProvenance().byDomain.selection.chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M261', 'M262', 'M263'])
  assert.deepEqual(Q.getProvenance().byDomain.training.chain, ['M230', 'M252', 'M253', 'M254', 'M255', 'M269', 'M270', 'M271'])
  assert.equal(Q.getProvenance().byMilestone.M278.fingerprint, PROFILE.profileFingerprint)
  assert.equal(JSON.stringify(getProvenance(PROFILE)), JSON.stringify(Q.getProvenance()))
})

test('repeated queries are byte-identical (deterministic)', () => {
  assert.equal(JSON.stringify(Q.getEvidence()), JSON.stringify(Q.getEvidence()))
  assert.equal(JSON.stringify(Q.getDomain('training')), JSON.stringify(Q.getDomain('training')))
  assert.equal(JSON.stringify(getCompleteness(PROFILE)), JSON.stringify(getCompleteness(PROFILE)))
  assert.equal(JSON.stringify(createCoachDnaCrossDomainIntelligenceQuery(PROFILE).getProvenance()), JSON.stringify(createCoachDnaCrossDomainIntelligenceQuery(PROFILE).getProvenance()))
})

test('all responses and the surface itself are frozen copies', () => {
  assert.ok(Object.isFrozen(Q))
  assert.ok(Object.isFrozen(Q.getDomain('selection')))
  assert.ok(Object.isFrozen(Q.getEvidence()))
  assert.ok(Object.isFrozen(Q.getEvidence('training')))
  assert.ok(Object.isFrozen(Q.getConfidence('selection')))
  assert.ok(Object.isFrozen(Q.getCompleteness()))
  assert.ok(Object.isFrozen(Q.getProvenance()))
  assert.ok(Object.isFrozen(Q.getProvenance().byMilestone))
  assert.ok(Object.isFrozen(Q.getValidationState()))
  assert.ok(Object.isFrozen(Q.listAvailableDomains()))
  // responses are copies — not references into the bound index
  assert.notEqual(Q.getDomain('selection'), INDEX.domainIndex.selection)
  assert.notEqual(Q.getProvenance(), INDEX.provenanceIndex)
})

test('the source profile and index are never mutated', () => {
  const pBefore = JSON.parse(JSON.stringify(PROFILE))
  const iBefore = JSON.parse(JSON.stringify(INDEX))
  const q = createCoachDnaCrossDomainIntelligenceQuery({ profile: PROFILE, index: INDEX })
  q.getDomain('selection'); q.getEvidence(); q.getConfidence('training'); q.getCompleteness(); q.getProvenance(); q.getValidationState(); q.listAvailableDomains()
  assert.deepEqual(JSON.parse(JSON.stringify(PROFILE)), pBefore)
  assert.deepEqual(JSON.parse(JSON.stringify(INDEX)), iBefore)
})

test('serialized answers carry no recommendation, player or training-plan language', () => {
  const all = JSON.stringify([Q.getDomain('selection'), Q.getDomain('training'), Q.getEvidence(), Q.getConfidence(), Q.getCompleteness(), Q.getProvenance(), Q.getValidationState(), Q.listAvailableDomains()])
  assert.doesNotMatch(all, FORBIDDEN_LANG)
  assert.doesNotMatch(all, /player(Id|Name|s)\b/i)
})

test('exports exist', () => {
  assert.equal(typeof createCoachDnaCrossDomainIntelligenceQuery, 'function')
  for (const fn of [isUsable, getDomain, getEvidence, getConfidence, getCompleteness, getProvenance, getValidationState, listAvailableDomains]) {
    assert.equal(typeof fn, 'function')
  }
})
