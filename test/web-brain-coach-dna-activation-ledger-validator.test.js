/**
 * web/brain-coach-dna-activation-ledger-validator - Coach DNA Activation Ledger Validator (M249) tests
 *
 * Verifies the dormant M249 validator: it contract-checks the M248 ledger (schema, fingerprint integrity,
 * M242-M248 provenance, readiness-fingerprint consistency, dormant invariants, approval/blocking/warnings
 * consistency), reports deterministic errors, and — the headline guarantee — never activates and rejects any
 * forged activationGranted. Tampered ledgers are detected; output is byte-deterministic and inputs are never
 * mutated.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  validateCoachDnaActivationLedger,
  summarizeCoachDnaActivationLedgerValidation,
  serializeCoachDnaActivationLedgerValidation,
} from '../web/brain-coach-dna-activation-ledger-validator.js'
import { buildCoachDnaActivationLedger } from '../web/brain-coach-dna-activation-ledger.js'

const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

// Local mirrors of the repo fingerprint convention, so tests can reseal a tampered ledger to isolate one error.
function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`
}
function fingerprint(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`
}
// Deep-clone a frozen ledger into a mutable copy.
const clone = (l) => JSON.parse(JSON.stringify(l))
// Recompute the self-fingerprint exactly as M248 does (hash all fields except the fingerprint).
function reseal(ledger) {
  const out = clone(ledger)
  delete out.ledgerFingerprint
  ledger = { ...out }
  const fp = fingerprint(canonicalStringify(out))
  return { ...out, ledgerFingerprint: fp }
}

const VALID_LEDGER = buildCoachDnaActivationLedger()
const RESULT = validateCoachDnaActivationLedger()

test('a live ledger validates and the result has the dormant shape, referencing M248 + M249', () => {
  assert.equal(RESULT.type, 'coach-dna-activation-ledger-validation')
  assert.equal(RESULT.schemaVersion, 1)
  assert.equal(RESULT.milestone, 'M249')
  assert.equal(RESULT.validates, 'M248')
  assert.equal(RESULT.valid, true)
  assert.equal(RESULT.activationGranted, false)
  assert.equal(RESULT.ledgerFingerprint, VALID_LEDGER.ledgerFingerprint)
  assert.deepEqual(RESULT.validationErrors, [])
  assert.match(RESULT.validationFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('a supplied valid ledger passes with no errors', () => {
  const v = validateCoachDnaActivationLedger({ ledger: VALID_LEDGER })
  assert.equal(v.valid, true)
  assert.deepEqual(v.validationErrors, [])
})

test('a malformed ledger is rejected with errors', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, { type: 'wrong' }]) {
    const v = validateCoachDnaActivationLedger({ ledger: bad })
    assert.equal(v.valid, false)
    assert.ok(v.validationErrors.length >= 1)
    assert.equal(v.activationGranted, false)
  }
})

test('a fingerprint mismatch is detected (tampered or stale ledger)', () => {
  const tampered = clone(VALID_LEDGER)
  tampered.ledgerFingerprint = 'fnv1a32:deadbeef' // valid format, wrong value
  const v = validateCoachDnaActivationLedger({ ledger: tampered })
  assert.equal(v.valid, false)
  assert.ok(v.validationErrors.some((e) => /does not match a fresh hash/.test(e)))
})

test('a tampered field without reseal is caught via the fingerprint', () => {
  const tampered = clone(VALID_LEDGER)
  tampered.readinessState = 'totally-different' // body changed but fingerprint left stale
  const v = validateCoachDnaActivationLedger({ ledger: tampered })
  assert.equal(v.valid, false)
  assert.ok(v.validationErrors.some((e) => /does not match a fresh hash/.test(e)))
})

test('a provenance mismatch is detected (isolated via reseal)', () => {
  const tampered = clone(VALID_LEDGER)
  tampered.milestones = tampered.milestones.slice(0, 6) // drops M248 from the chain
  const v = validateCoachDnaActivationLedger({ ledger: reseal(tampered) })
  assert.equal(v.valid, false)
  assert.ok(v.validationErrors.some((e) => /provenance/.test(e)))
  // resealed, so the fingerprint itself is NOT the failing reason
  assert.ok(!v.validationErrors.some((e) => /does not match a fresh hash/.test(e)))
})

test('a forged activationGranted is rejected (isolated via reseal)', () => {
  const forged = clone(VALID_LEDGER)
  forged.activationGranted = true
  const v = validateCoachDnaActivationLedger({ ledger: reseal(forged) })
  assert.equal(v.valid, false)
  assert.ok(v.validationErrors.some((e) => /activationGranted/.test(e)))
  // the validator's own result still never activates
  assert.equal(v.activationGranted, false)
})

test('a forged humanApproved is rejected (isolated via reseal)', () => {
  const forged = clone(VALID_LEDGER)
  forged.humanApproved = true
  const v = validateCoachDnaActivationLedger({ ledger: reseal(forged) })
  assert.equal(v.valid, false)
  assert.ok(v.validationErrors.some((e) => /humanApproved/.test(e)))
})

test('an inconsistent readiness fingerprint vs envelopeValid is detected', () => {
  const bad = clone(VALID_LEDGER)
  bad.envelopeValid = false // but readinessFingerprint is still a present string
  const v = validateCoachDnaActivationLedger({ ledger: reseal(bad) })
  assert.equal(v.valid, false)
  assert.ok(v.validationErrors.some((e) => /readinessFingerprint is present but envelopeValid/.test(e)))
})

test('readinessPassed=false with empty blockingReasons is rejected', () => {
  const bad = clone(VALID_LEDGER)
  bad.readinessPassed = false
  bad.blockingReasons = []
  const v = validateCoachDnaActivationLedger({ ledger: reseal(bad) })
  assert.equal(v.valid, false)
  assert.ok(v.validationErrors.some((e) => /blockingReasons is empty/.test(e)))
})

test('a malformed-envelope ledger is structurally valid but warns', () => {
  const v = validateCoachDnaActivationLedger({ ledger: buildCoachDnaActivationLedger({ envelope: null }) })
  assert.equal(v.valid, true)
  assert.ok(v.validationWarnings.some((w) => /missing or malformed readiness envelope/.test(w)))
})

test('repeated output is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaActivationLedgerValidation(), serializeCoachDnaActivationLedgerValidation())
  assert.equal(validateCoachDnaActivationLedger().validationFingerprint, RESULT.validationFingerprint)
  assert.equal(
    validateCoachDnaActivationLedger({ ledger: VALID_LEDGER }).validationFingerprint,
    validateCoachDnaActivationLedger({ ledger: VALID_LEDGER }).validationFingerprint,
  )
})

test('the supplied ledger input is never mutated', () => {
  const led = buildCoachDnaActivationLedger()
  const before = JSON.parse(JSON.stringify(led))
  validateCoachDnaActivationLedger({ ledger: led })
  assert.deepEqual(JSON.parse(JSON.stringify(led)), before)
})

test('the validation result is deeply frozen', () => {
  assert.ok(Object.isFrozen(RESULT))
  assert.ok(Object.isFrozen(RESULT.validationErrors))
  assert.ok(Object.isFrozen(RESULT.validationWarnings))
})

test('malformed options are tolerated and never throw', () => {
  for (const bad of [null, undefined, 'x', 7, true]) {
    assert.doesNotThrow(() => validateCoachDnaActivationLedger(bad))
    assert.equal(validateCoachDnaActivationLedger(bad).activationGranted, false)
  }
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaActivationLedgerValidation({}, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-activation-ledger-validation')
  const line = serializeCoachDnaActivationLedgerValidation({}, { format: 'line' })
  assert.match(line, /^coach-dna-activation-ledger-validation valid=true activationGranted=false /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaActivationLedgerValidation({}, { format: 'xml' }), /unsupported/)
})

test('the result and summary carry no recommendation or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaActivationLedgerValidation(), ADVICE_LANG)
  assert.doesNotMatch(summarizeCoachDnaActivationLedgerValidation(), ADVICE_LANG)
  assert.match(summarizeCoachDnaActivationLedgerValidation(), /ledger validation: VALID/)
})

test('exports exist', () => {
  assert.equal(typeof validateCoachDnaActivationLedger, 'function')
  assert.equal(typeof summarizeCoachDnaActivationLedgerValidation, 'function')
  assert.equal(typeof serializeCoachDnaActivationLedgerValidation, 'function')
})
