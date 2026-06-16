/**
 * @brain/evidence-normalization — error model (M50)
 *
 * Pure, deterministic error carrying a stable `code`. No I/O.
 *
 * NOTE: signal-shape problems (bad key / value / confidence / back-reference) are
 * REPORTED as result data (so a caller can surface them), not thrown. Only malformed
 * INPUT (`invalid_input`) or a malformed normalizer object (`invalid_contract`) throw.
 */

export const NORMALIZATION_ERROR = Object.freeze({
  INVALID_INPUT:    'invalid_input',     // malformed arguments to a helper
  INVALID_CONTRACT: 'invalid_contract',  // a normalizer object fails the NormalizerContract
})

export class NormalizationError extends Error {
  /** @param {string} code @param {string} [message] */
  constructor(code, message) {
    super(message ?? code)
    this.name = 'NormalizationError'
    this.code = code
  }
}
