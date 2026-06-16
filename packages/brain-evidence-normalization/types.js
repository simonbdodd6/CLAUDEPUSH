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

export {}
