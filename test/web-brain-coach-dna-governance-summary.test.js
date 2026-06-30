/**
 * web/brain-coach-dna-governance-summary - Coach DNA Governance Summary (M251) tests
 *
 * Verifies the dormant M251 summary: it distils the M250 audit pack into one top-level governance verdict
 * (pipelineComplete, governanceValid), copies blocking reasons / warnings forward, computes deterministic
 * chain statistics, carries the full M242-M251 provenance, and — the headline guarantee — never activates. An
 * invalid or malformed pack is reflected as invalid; output is byte-deterministic and inputs are never mutated.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaGovernanceSummary,
  summarizeCoachDnaGovernanceSummary,
  serializeCoachDnaGovernanceSummary,
} from '../web/brain-coach-dna-governance-summary.js'
import { buildCoachDnaActivationAuditPack } from '../web/brain-coach-dna-activation-audit-pack.js'

const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

// Computed once and shared by the read-only shape assertions (the build is deterministic).
const GOV = buildCoachDnaGovernanceSummary()

test('a live governance summary over a complete valid pack has the dormant shape', () => {
  assert.equal(GOV.type, 'coach-dna-governance-summary')
  assert.equal(GOV.schemaVersion, 1)
  assert.equal(GOV.governanceVersion, 1)
  assert.equal(GOV.milestone, 'M251')
  assert.equal(GOV.mode, 'dormant')
  assert.equal(GOV.activationGranted, false)
  assert.equal(GOV.pipelineComplete, true)
  assert.equal(GOV.governanceValid, true)
  assert.equal(GOV.approvalRequired, true)
  assert.match(GOV.governanceFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('provenance covers the full M242-M251 chain', () => {
  assert.deepEqual(GOV.provenance.map((p) => p.milestone), ['M242', 'M243', 'M244', 'M245', 'M246', 'M247', 'M248', 'M249', 'M250', 'M251'])
})

test('summary statistics describe the governance chain deterministically', () => {
  assert.equal(GOV.statistics.milestoneCount, 10)
  assert.equal(GOV.statistics.activationStages, 5)
  assert.equal(GOV.statistics.artifactsPresent, 5)
  assert.equal(GOV.statistics.validationValid, true)
  assert.equal(GOV.statistics.blockingReasonCount, GOV.blockingReasons.length)
  assert.equal(GOV.statistics.warningCount, GOV.warnings.length)
})

test('the pack verdicts and signals are carried forward', () => {
  const pack = buildCoachDnaActivationAuditPack()
  assert.equal(GOV.pipelineComplete, pack.complete)
  assert.equal(GOV.governanceValid, pack.valid)
  assert.equal(GOV.auditFingerprint, pack.auditFingerprint)
  assert.deepEqual(GOV.blockingReasons, pack.blockingReasons)
  assert.deepEqual(GOV.warnings, pack.warnings)
  // today: human approval still open → that blocker is carried up
  assert.ok(GOV.blockingReasons.some((r) => /human approval not granted/.test(r)))
})

test('an invalid audit pack is reflected as invalid (but never activates)', () => {
  // forcing a missing stage makes the pack incomplete + invalid
  const g = buildCoachDnaGovernanceSummary({ overrides: { ledger: null } })
  assert.equal(g.pipelineComplete, false)
  assert.equal(g.governanceValid, false)
  assert.equal(g.statistics.artifactsPresent < 5, true)
  assert.equal(g.activationGranted, false)
})

test('a failed-readiness but well-formed chain keeps governance integrity, yet stays blocked and dormant', () => {
  // A refusing gateway fails the activation readiness, but the audit chain is still well-formed and the ledger
  // is still contract-valid — so governanceValid (an INTEGRITY verdict) remains true while activation is blocked.
  const refusingGateway = { request: () => Object.freeze({ ok: false, api: 'coach-dna-release', apiVersion: 1, mode: 'dormant', action: null, result: null, error: { code: 'down' } }) }
  const g = buildCoachDnaGovernanceSummary({ gateway: refusingGateway })
  assert.equal(g.pipelineComplete, true)
  assert.equal(g.governanceValid, true)
  assert.ok(g.blockingReasons.some((r) => /certificate did not pass/.test(r)))
  assert.equal(g.activationGranted, false)
})

test('a malformed / missing pack fails safe — never activates', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, { type: 'wrong' }]) {
    const g = buildCoachDnaGovernanceSummary({ pack: bad })
    assert.equal(g.pipelineComplete, false)
    assert.equal(g.governanceValid, false)
    assert.equal(g.approvalRequired, true)
    assert.equal(g.auditFingerprint, null)
    assert.equal(g.statistics.artifactsPresent, 0)
    assert.equal(g.activationGranted, false)
    assert.ok(g.blockingReasons.some((r) => /missing or malformed/.test(r)))
  }
})

test('activationGranted is always false — across every input', () => {
  assert.equal(buildCoachDnaGovernanceSummary().activationGranted, false)
  assert.equal(buildCoachDnaGovernanceSummary({ pack: null }).activationGranted, false)
  assert.equal(buildCoachDnaGovernanceSummary({ overrides: { ledger: null } }).activationGranted, false)
  // even a forged "valid + granted" pack cannot flip the summary's activation
  const forged = { ...buildCoachDnaActivationAuditPack(), activationGranted: true, valid: true }
  assert.equal(buildCoachDnaGovernanceSummary({ pack: forged }).activationGranted, false)
})

test('repeated output is byte-identical and the governance fingerprint is stable', () => {
  assert.equal(serializeCoachDnaGovernanceSummary(), serializeCoachDnaGovernanceSummary())
  assert.equal(buildCoachDnaGovernanceSummary().governanceFingerprint, GOV.governanceFingerprint)
  const pack = buildCoachDnaActivationAuditPack()
  assert.equal(
    buildCoachDnaGovernanceSummary({ pack }).governanceFingerprint,
    buildCoachDnaGovernanceSummary({ pack }).governanceFingerprint,
  )
})

test('the supplied pack input is never mutated', () => {
  const pack = buildCoachDnaActivationAuditPack()
  const before = JSON.parse(JSON.stringify(pack))
  buildCoachDnaGovernanceSummary({ pack })
  assert.deepEqual(JSON.parse(JSON.stringify(pack)), before)
})

test('the governance summary is deeply frozen (no runtime side effects)', () => {
  assert.ok(Object.isFrozen(GOV))
  assert.ok(Object.isFrozen(GOV.provenance))
  assert.ok(Object.isFrozen(GOV.statistics))
  assert.ok(Object.isFrozen(GOV.blockingReasons))
  assert.ok(Object.isFrozen(GOV.warnings))
})

test('malformed options are tolerated and never throw', () => {
  for (const bad of [null, undefined, 'x', 7, true]) {
    assert.doesNotThrow(() => buildCoachDnaGovernanceSummary(bad))
    assert.equal(buildCoachDnaGovernanceSummary(bad).activationGranted, false)
  }
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaGovernanceSummary({}, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-governance-summary')
  const line = serializeCoachDnaGovernanceSummary({}, { format: 'line' })
  assert.match(line, /^coach-dna-governance-summary governanceValid=true pipelineComplete=true activationGranted=false /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaGovernanceSummary({}, { format: 'xml' }), /unsupported/)
})

test('the summary carries no recommendation or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaGovernanceSummary(), ADVICE_LANG)
  assert.doesNotMatch(summarizeCoachDnaGovernanceSummary(), ADVICE_LANG)
  assert.match(summarizeCoachDnaGovernanceSummary(), /governance: VALID/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaGovernanceSummary, 'function')
  assert.equal(typeof summarizeCoachDnaGovernanceSummary, 'function')
  assert.equal(typeof serializeCoachDnaGovernanceSummary, 'function')
})
