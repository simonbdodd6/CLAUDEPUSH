/**
 * @brain/evidence-citation — error model (M48)
 *
 * Pure, deterministic error carrying a stable `code`. No I/O.
 *
 * NOTE: "missing" and "duplicate" citations are REPORTED as result data (so the
 * caller can show them), not thrown. Only malformed INPUT throws.
 */

export const CITATION_ERROR = Object.freeze({
  INVALID_INPUT: 'invalid_input',
})

export class CitationError extends Error {
  /** @param {string} code @param {string} [message] */
  constructor(code, message) {
    super(message ?? code)
    this.name = 'CitationError'
    this.code = code
  }
}
