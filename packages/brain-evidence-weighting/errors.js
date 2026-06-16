/**
 * @brain/evidence-weighting — error model (M47)
 *
 * Pure, deterministic error carrying a stable `code`. No I/O.
 */

export const WEIGHTING_ERROR = Object.freeze({
  INVALID_INPUT: 'invalid_input',
})

export class WeightingError extends Error {
  /** @param {string} code @param {string} [message] */
  constructor(code, message) {
    super(message ?? code)
    this.name = 'WeightingError'
    this.code = code
  }
}
