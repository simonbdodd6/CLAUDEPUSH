/**
 * web/brain-coach-dna-activation-ledger - Coach DNA Activation Ledger (M248) tests
 *
 * Verifies the dormant M248 ledger: it seals the M247 readiness envelope into one fingerprinted audit entry,
 * copies the readiness verdict / blocking reasons / warnings forward, references the full M242-M248 chain, and
 * — the headline guarantee — NEVER activates (activationGranted false on pass, fail and malformed alike). A
 * malformed envelope fails safe, output is byte-deterministic, and the supplied envelope input is never mutated.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaActivationLedger,
  summarizeCoachDnaActivationLedger,
  serializeCoachDnaActivationLedger,
} from '../web/brain-coach-dna-activation-ledger.js'
import { buildCoachDnaActivationReadiness } from '../web/brain-coach-dna-activation-readiness.js'

const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

// A gateway that refuses every request — drives the live M247 envelope to a FAILED certificate.
const refusingGateway = { request: () => Object.freeze({ ok: false, api: 'coach-dna-release', apiVersion: 1, mode: 'dormant', action: null, result: null, error: { code: 'down' } }) }

// Computed once and shared by the read-only shape assertions (the build is deterministic).
const LEDGER = buildCoachDnaActivationLedger()

test('the ledger has its version, constants and references the full M242-M248 chain', () => {
  assert.equal(LEDGER.type, 'coach-dna-activation-ledger')
  assert.equal(LEDGER.schemaVersion, 1)
  assert.equal(LEDGER.ledgerVersion, 1)
  assert.equal(LEDGER.milestone, 'M248')
  assert.equal(LEDGER.mode, 'dormant')
  assert.deepEqual(LEDGER.milestones.map((m) => m.milestone), ['M242', 'M243', 'M244', 'M245', 'M246', 'M247', 'M248'])
  assert.match(LEDGER.ledgerFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('a valid readiness envelope is recorded with its verdict copied forward', () => {
  const env = buildCoachDnaActivationReadiness()
  assert.equal(LEDGER.envelopeValid, true)
  assert.equal(LEDGER.readinessPassed, env.ready)
  assert.equal(LEDGER.readinessState, env.readinessState)
  assert.equal(LEDGER.readinessFingerprint, env.envelopeFingerprint)
  assert.equal(LEDGER.approvalRequired, env.approval.approvalRequired)
  assert.equal(LEDGER.humanApproved, env.approval.humanApproved)
  assert.deepEqual(LEDGER.blockingReasons, env.blockingReasons)
  assert.deepEqual(LEDGER.warnings, env.warnings)
  // today: technical gate clear, human gate open → not passed, not activated
  assert.equal(LEDGER.readinessPassed, false)
  assert.equal(LEDGER.readinessState, 'awaiting-human-approval')
  assert.equal(LEDGER.activationGranted, false)
})

test('a FAILED readiness envelope is recorded as blocked, never activated', () => {
  const l = buildCoachDnaActivationLedger({ gateway: refusingGateway })
  const env = buildCoachDnaActivationReadiness({ gateway: refusingGateway })
  assert.equal(l.envelopeValid, true)
  assert.equal(l.readinessPassed, false)
  assert.equal(l.readinessState, 'certificate-failed')
  assert.equal(l.readinessFingerprint, env.envelopeFingerprint)
  assert.deepEqual(l.blockingReasons, env.blockingReasons)
  assert.ok(l.blockingReasons.some((r) => /certificate did not pass/.test(r)))
  assert.equal(l.activationGranted, false)
})

test('a malformed / missing envelope fails safe — never activates', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, { type: 'wrong' }, { type: 'coach-dna-activation-readiness' }]) {
    const l = buildCoachDnaActivationLedger({ envelope: bad })
    assert.equal(l.envelopeValid, false)
    assert.equal(l.readinessPassed, false)
    assert.equal(l.readinessState, 'envelope-invalid')
    assert.equal(l.readinessFingerprint, null)
    assert.equal(l.approvalRequired, true)
    assert.equal(l.humanApproved, false)
    assert.equal(l.activationGranted, false)
    assert.ok(l.blockingReasons.some((r) => /missing or malformed/.test(r)))
  }
})

test('activationGranted is always false — across every input', () => {
  assert.equal(buildCoachDnaActivationLedger().activationGranted, false)
  assert.equal(buildCoachDnaActivationLedger({ gateway: refusingGateway }).activationGranted, false)
  assert.equal(buildCoachDnaActivationLedger({ envelope: null }).activationGranted, false)
  // even a forged "ready + granted" envelope cannot flip the ledger's activation
  const forged = { ...buildCoachDnaActivationReadiness(), ready: true, activationGranted: true }
  const l = buildCoachDnaActivationLedger({ envelope: forged })
  assert.equal(l.activationGranted, false)
})

test('repeated output is byte-identical and the ledger fingerprint is stable', () => {
  assert.equal(serializeCoachDnaActivationLedger(), serializeCoachDnaActivationLedger())
  assert.equal(buildCoachDnaActivationLedger().ledgerFingerprint, LEDGER.ledgerFingerprint)
  const env = buildCoachDnaActivationReadiness()
  assert.equal(
    buildCoachDnaActivationLedger({ envelope: env }).ledgerFingerprint,
    buildCoachDnaActivationLedger({ envelope: env }).ledgerFingerprint,
  )
})

test('the readiness fingerprint matches the source M247 envelope fingerprint', () => {
  const env = buildCoachDnaActivationReadiness()
  assert.equal(buildCoachDnaActivationLedger({ envelope: env }).readinessFingerprint, env.envelopeFingerprint)
})

test('the supplied envelope input is never mutated', () => {
  const env = buildCoachDnaActivationReadiness()
  const before = JSON.parse(JSON.stringify(env))
  buildCoachDnaActivationLedger({ envelope: env })
  assert.deepEqual(JSON.parse(JSON.stringify(env)), before)
  const opts = { envelope: { type: 'coach-dna-activation-readiness', ready: false, readinessState: 'awaiting-human-approval', envelopeFingerprint: 'fnv1a32:00000000', approval: { approvalRequired: true, humanApproved: false }, blockingReasons: [], warnings: [] } }
  const optsBefore = JSON.parse(JSON.stringify(opts))
  buildCoachDnaActivationLedger(opts)
  assert.deepEqual(opts, optsBefore)
})

test('the ledger entry is deeply frozen (no runtime side effects)', () => {
  assert.ok(Object.isFrozen(LEDGER))
  assert.ok(Object.isFrozen(LEDGER.milestones))
  assert.ok(Object.isFrozen(LEDGER.milestones[0]))
  assert.ok(Object.isFrozen(LEDGER.blockingReasons))
  assert.ok(Object.isFrozen(LEDGER.warnings))
})

test('malformed options are tolerated and never throw', () => {
  for (const bad of [null, undefined, 'x', 7, true]) {
    assert.doesNotThrow(() => buildCoachDnaActivationLedger(bad))
    assert.equal(buildCoachDnaActivationLedger(bad).activationGranted, false)
  }
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaActivationLedger({}, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-activation-ledger')
  const line = serializeCoachDnaActivationLedger({}, { format: 'line' })
  assert.match(line, /^coach-dna-activation-ledger state=awaiting-human-approval readinessPassed=false activationGranted=false /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaActivationLedger({}, { format: 'xml' }), /unsupported/)
})

test('the ledger and summary carry no recommendation or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaActivationLedger(), ADVICE_LANG)
  assert.doesNotMatch(summarizeCoachDnaActivationLedger(), ADVICE_LANG)
  assert.match(summarizeCoachDnaActivationLedger(), /activation ledger: awaiting-human-approval/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaActivationLedger, 'function')
  assert.equal(typeof summarizeCoachDnaActivationLedger, 'function')
  assert.equal(typeof serializeCoachDnaActivationLedger, 'function')
})
