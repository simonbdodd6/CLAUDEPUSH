/**
 * @brain/evidence-normalization (M50)
 *
 * The dormant common language for the AI Brain's `normalize` stage (M42 §3): the
 * contract every future source normalizer (Frame Sports, GPS, coach observations,
 * video tags, …) must speak BEFORE its evidence enters the Brain — the
 * NormalizerContract interface, the deterministic NormalizationContext, the
 * canonical signal-key grammar, and pure NormalizedSignal validators.
 *
 * Pure + deterministic: no normalizers, no registry, no providers, no storage, no
 * network, no files, no clock, no randomness; results immutable; caller input never
 * mutated. No normalization actually happens here — only the rules that future
 * normalizers must satisfy. Depends solely on @brain/evidence-contracts. Imported by
 * nobody yet (dormant).
 */

export {
  NORMALIZATION_CONTRACT_VERSION,
  isIsoTimestamp,
  isNormalizerContract,
  assertNormalizerContract,
  normalizerKey,
  assertNormalizationContext,
  validateSignal,
  validateSignals,
} from './contracts.js'
export {
  SIGNAL_KEY_MAX_LENGTH,
  SIGNAL_KEY_MAX_SEGMENTS,
  SIGNAL_KEY_SEGMENT,
  isValidSignalKey,
  assertSignalKey,
  signalKeySegments,
  signalKeyNamespace,
} from './keys.js'
export {
  createNormalizerRegistry,
  compareVersions,
} from './registry.js'
export {
  INVOCATION_STATUS,
  invokeNormalizer,
} from './invocation.js'
export {
  planBatchNormalization,
} from './batch.js'
export {
  planNormalizationApplication,
} from './application.js'
export { NormalizationError, NORMALIZATION_ERROR } from './errors.js'
export * from './types.js'   // JSDoc typedefs only (no runtime values)
