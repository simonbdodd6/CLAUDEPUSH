/**
 * @brain/evidence-normalization — normalizer invocation contract (M52, DORMANT)
 *
 * The deterministic bridge between the M51 registry and the M50 contracts: given a
 * registry, an EvidenceRecord and a passed-in NormalizationContext, resolve the
 * normalizer for the record's `sourceType`, invoke it, validate the emitted
 * `NormalizedSignal[]`, and return ONE frozen, deterministic envelope describing the
 * outcome. Architecture only — it owns no normalizers, providers, storage, gateway
 * execution or runtime wiring; it simply calls the (caller-supplied, deterministic)
 * normalizer the registry hands back.
 *
 * Outcomes are REPORTED as data (status + problems), never thrown — an unknown
 * sourceType or a bad emission does not crash. The only throws are the existing
 * assertions for programmer errors: malformed input (`invalid_input`) and a malformed
 * resolved normalizer (`invalid_contract`, defence-in-depth via assertNormalizerContract).
 *
 * No clock, no randomness, no I/O. Imports only sibling modules (transitively only
 * @brain/evidence-contracts). Imported by nobody yet.
 */

import {
  assertNormalizationContext,
  assertNormalizerContract,
  validateSignals,
} from './contracts.js'
import { NormalizationError, NORMALIZATION_ERROR } from './errors.js'

/** The deterministic outcome statuses of an invocation. */
export const INVOCATION_STATUS = Object.freeze({
  OK:              'ok',               // a normalizer ran and every emitted signal is valid
  UNKNOWN_SOURCE:  'unknown_source',   // no normalizer is registered for the record's sourceType
  INVALID_SIGNALS: 'invalid_signals',  // a normalizer ran but emitted a malformed signal set
})

const isStr = (v) => typeof v === 'string' && v.length > 0

/** Minimal shape needed to resolve + back-reference; full EvidenceRecord validation is the gateway's job. */
function assertRecordRef(record) {
  if (!record || typeof record !== 'object') {
    throw new NormalizationError(NORMALIZATION_ERROR.INVALID_INPUT, 'record must be an object')
  }
  if (!isStr(record.sourceType)) {
    throw new NormalizationError(NORMALIZATION_ERROR.INVALID_INPUT, 'record.sourceType must be a non-empty string')
  }
  if (!isStr(record.id)) {
    throw new NormalizationError(NORMALIZATION_ERROR.INVALID_INPUT, 'record.id must be a non-empty string')
  }
  return record
}

function assertRegistry(registry) {
  if (!registry || typeof registry.resolve !== 'function') {
    throw new NormalizationError(NORMALIZATION_ERROR.INVALID_INPUT, 'a registry with resolve(sourceType) is required')
  }
  return registry
}

/** Flatten a validateSignals result into deterministic `signal[i]: message` problem strings. */
function flattenSignalProblems(validation) {
  const out = []
  for (const entry of validation.problems) {
    for (const p of entry.problems) out.push(`signal[${entry.index}]: ${p}`)
  }
  return out
}

const envelope = (o) => Object.freeze({
  status: o.status,
  ok: o.status === INVOCATION_STATUS.OK,
  sourceType: o.sourceType,
  normalizerKey: o.normalizerKey ?? null,
  signals: Object.freeze(o.signals ?? []),
  validation: o.validation ?? null,
  problems: Object.freeze(o.problems ?? []),
})

/**
 * Resolve + invoke the normalizer for `record.sourceType`, returning a frozen
 * invocation envelope. `version` (optional) pins an exact normalizer version;
 * otherwise the registry's latest is used.
 *
 * - unknown sourceType → `{ status: 'unknown_source', ok:false, problems:[…] }` (data, no throw);
 * - emitted signals validated against the owning record (M50) — any problem →
 *   `{ status: 'invalid_signals', ok:false, validation, problems:[…] }`;
 * - a non-array emission is reported the same way (graceful, never throws);
 * - all valid → `{ status: 'ok', ok:true, signals, validation }`.
 *
 * @param {{ resolve: Function }} registry  an M51 normalizer registry
 * @param {{ id:string, sourceType:string, confidence?:number }} record
 * @param {{ now:string, ingestRunId:string }} ctx  caller-supplied NormalizationContext
 * @param {{ version?: string }} [opts]
 * @returns {Readonly<{ status:string, ok:boolean, sourceType:string, normalizerKey:string|null, signals:ReadonlyArray<object>, validation:object|null, problems:ReadonlyArray<string> }>}
 */
export function invokeNormalizer(registry, record, ctx, { version } = {}) {
  assertRegistry(registry)
  assertRecordRef(record)
  const context = assertNormalizationContext(ctx)        // throws invalid_input if malformed

  const normalizer = registry.resolve(record.sourceType, version)
  if (!normalizer) {
    return envelope({
      status: INVOCATION_STATUS.UNKNOWN_SOURCE,
      sourceType: record.sourceType,
      problems: [`no normalizer registered for sourceType '${record.sourceType}'`],
    })
  }

  const descriptor = assertNormalizerContract(normalizer)  // defence-in-depth (registry already guarantees this)
  const emitted = normalizer.normalize(record, context)

  if (!Array.isArray(emitted)) {
    return envelope({
      status: INVOCATION_STATUS.INVALID_SIGNALS,
      sourceType: record.sourceType,
      normalizerKey: descriptor.key,
      problems: ['normalizer emitted a non-array result'],
    })
  }

  const validation = validateSignals(emitted, { record })
  return envelope({
    status: validation.valid ? INVOCATION_STATUS.OK : INVOCATION_STATUS.INVALID_SIGNALS,
    sourceType: record.sourceType,
    normalizerKey: descriptor.key,
    signals: emitted,
    validation,
    problems: validation.valid ? [] : flattenSignalProblems(validation),
  })
}
