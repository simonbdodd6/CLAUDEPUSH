/**
 * @brain/evidence-normalization — Type surface (M50)
 *
 * JSDoc typedefs for the normalization contracts. DOCUMENTATION ONLY — no runtime
 * values are exported here (validators live in contracts.js / keys.js). Pure,
 * dormant, no logic.
 */

/**
 * The deterministic inputs a normalizer may read. There is NO clock inside the
 * Brain — `now` is passed in (M42 §3).
 * @typedef {Object} NormalizationContext
 * @property {string} now          ISO timestamp, caller-supplied
 * @property {string} ingestRunId  the ingest run that invoked the normalizer
 */

/**
 * The contract every source normalizer must satisfy. `normalize` is pure +
 * deterministic (no LLM, no clock, no randomness) and turns one record's verbatim
 * `raw` payload into zero or more canonical {@link NormalizedSignal}s.
 * @typedef {Object} NormalizerContract
 * @property {string}   sourceType   a SOURCE_TYPE value (e.g. 'provider.frameSports')
 * @property {string}   version      normalizer version, namespaced into `provenance.normalizer`
 * @property {(record: import('@brain/evidence-contracts').EvidenceRecord, ctx: NormalizationContext) => import('@brain/evidence-contracts').NormalizedSignal[]} normalize
 */

/**
 * Frozen descriptor returned by `assertNormalizerContract`.
 * @typedef {Object} NormalizerDescriptor
 * @property {string} sourceType
 * @property {string} sourceFamily  the `<family>.` prefix of `sourceType`
 * @property {string} version
 * @property {string} key           `sourceType@version`
 */

/**
 * Result of validating a single signal (problems are reported, never thrown).
 * @typedef {Object} SignalValidation
 * @property {boolean}  valid
 * @property {string[]} problems
 */

/**
 * Result of validating a normalizer's whole output.
 * @typedef {Object} SignalsValidation
 * @property {boolean} valid
 * @property {number}  count
 * @property {Array<{ index:number, problems:string[] }>} problems
 */

/**
 * An immutable normalizer registry (M51). Every mutating-looking operation
 * (`register`) returns a NEW registry; the original is never changed. Lookups report
 * misses as `null`. Listing/ordering is deterministic (sourceType, then version).
 * @typedef {Object} NormalizerRegistry
 * @property {number} size
 * @property {(sourceType:string, version?:string) => boolean} has
 * @property {(sourceType:string, version:string) => (object|null)} get          exact normalizer
 * @property {(sourceType:string, version?:string) => (object|null)} resolve     exact, or latest version
 * @property {(sourceType:string, version:string) => (NormalizerDescriptor|null)} describe
 * @property {() => ReadonlyArray<NormalizerDescriptor>} list
 * @property {() => ReadonlyArray<string>} keys                                   `sourceType@version`
 * @property {() => ReadonlyArray<string>} sourceTypes
 * @property {(normalizer:NormalizerContract) => NormalizerRegistry} register     returns a NEW registry
 */

/**
 * The frozen, deterministic outcome of invoking a normalizer for one record (M52).
 * Outcomes are reported as data — `status` + `problems` — never thrown.
 * @typedef {Object} NormalizationInvocation
 * @property {'ok'|'unknown_source'|'invalid_signals'} status
 * @property {boolean} ok                                 status === 'ok'
 * @property {string}  sourceType                         the record's sourceType
 * @property {string|null} normalizerKey                  `sourceType@version` of the normalizer that ran
 * @property {ReadonlyArray<import('@brain/evidence-contracts').NormalizedSignal>} signals
 * @property {SignalsValidation|null} validation          M50 validation result (null when unknown source)
 * @property {ReadonlyArray<string>} problems             human-readable problems, deterministic order
 */

/**
 * The frozen, deterministic result of planning normalization across a batch of
 * records (M53). Per-record envelopes are in input order; counts derive solely from
 * the M52 statuses; problems are collected as data (never thrown).
 * @typedef {Object} BatchNormalizationPlan
 * @property {number}  total
 * @property {boolean} allOk                              no unknown_source and no invalid_signals
 * @property {Readonly<{ total:number, ok:number, unknown_source:number, invalid_signals:number }>} counts
 * @property {ReadonlyArray<Readonly<{ index:number, recordId:string, invocation:NormalizationInvocation }>>} results
 * @property {ReadonlyArray<Readonly<{ index:number, recordId:string, problems:ReadonlyArray<string> }>>} problems
 */

/**
 * The frozen, deterministic description of what WOULD happen if the gateway applied a
 * batch plan to the Evidence Store (M54). Writes nothing. Ordering of the batch's
 * results is preserved within every partition.
 * @typedef {Object} ApplicationPlan
 * @property {number}  total
 * @property {boolean} willApply                          accepted.length > 0
 * @property {Readonly<{ total:number, accepted:number, unknown_source:number, invalid_signals:number, signals:number }>} counts
 * @property {ReadonlyArray<Readonly<{ index:number, recordId:string, normalizerKey:string|null, signals:ReadonlyArray<import('@brain/evidence-contracts').NormalizedSignal> }>>} accepted
 * @property {ReadonlyArray<Readonly<{ index:number, recordId:string, sourceType:string }>>} unknownSource
 * @property {ReadonlyArray<Readonly<{ index:number, recordId:string, problems:ReadonlyArray<string> }>>} invalidSignals
 */

export {}
