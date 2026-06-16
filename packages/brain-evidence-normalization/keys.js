/**
 * @brain/evidence-normalization — canonical signal-key grammar (M50, DORMANT)
 *
 * Every normalizer, whatever its source, must emit `NormalizedSignal.key`s drawn
 * from ONE shared namespace so the engines read a single common language (M42 §2/§3,
 * e.g. `lineout.winRate`). This module is the pure, deterministic grammar for that
 * namespace — no enum of allowed keys (sources are additive), just the shape rules:
 *
 *   key      := segment ('.' segment){1,}        // at least namespace + leaf
 *   segment  := [a-z][a-zA-Z0-9]*                 // lowerCamelCase, starts a-z
 *
 * Bounded so a key can never be unbounded or degenerate. No I/O, no clock, no
 * randomness — string maths only.
 */

import { NormalizationError, NORMALIZATION_ERROR } from './errors.js'

/** Max characters in a whole signal key. */
export const SIGNAL_KEY_MAX_LENGTH = 120

/** Max dot-separated segments in a signal key (namespace + up to 5 deeper). */
export const SIGNAL_KEY_MAX_SEGMENTS = 6

/** A single namespace/leaf segment: lowerCamelCase, starts with a letter. */
export const SIGNAL_KEY_SEGMENT = /^[a-z][a-zA-Z0-9]*$/

const isStr = (v) => typeof v === 'string' && v.length > 0

/**
 * True iff `key` is a well-formed canonical signal key: a bounded-length,
 * dot-joined run of 2..{@link SIGNAL_KEY_MAX_SEGMENTS} lowerCamelCase segments
 * (namespace + at least one leaf). Pure; never throws.
 * @param {unknown} key
 * @returns {boolean}
 */
export function isValidSignalKey(key) {
  if (!isStr(key) || key.length > SIGNAL_KEY_MAX_LENGTH) return false
  const segments = key.split('.')
  if (segments.length < 2 || segments.length > SIGNAL_KEY_MAX_SEGMENTS) return false
  return segments.every((s) => SIGNAL_KEY_SEGMENT.test(s))
}

/**
 * Assert `key` is a valid signal key, returning it. Malformed input throws
 * `invalid_input` (this is an input-assertion helper; signal validation REPORTS
 * key problems as data instead — see contracts.js).
 * @param {unknown} key @returns {string}
 */
export function assertSignalKey(key) {
  if (!isValidSignalKey(key)) {
    throw new NormalizationError(NORMALIZATION_ERROR.INVALID_INPUT, `invalid signal key: ${String(key)}`)
  }
  return key
}

/** The dot-separated segments of a valid signal key (frozen). @param {unknown} key */
export function signalKeySegments(key) {
  return Object.freeze(assertSignalKey(key).split('.'))
}

/** The leading namespace (first segment) of a valid signal key. @param {unknown} key */
export function signalKeyNamespace(key) {
  return assertSignalKey(key).split('.', 1)[0]
}
