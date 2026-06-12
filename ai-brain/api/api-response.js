/**
 * AI Brain — Coach Experience API Response Builders (M15)
 *
 * Every public API method returns an ApiResponse envelope.
 * Core checks `response.ok` before reading `response.data`.
 * Core checks `response.apiVersion` to version-gate behaviour.
 *
 * Shape:
 *   {
 *     apiVersion:  'v1',
 *     status:      'ok' | 'error' | 'disabled',
 *     ok:          boolean,
 *     generatedAt: ISO string,
 *     durationMs:  number,
 *     data:        object | null,
 *     error:       { message, code } | null,
 *   }
 *
 * Core MUST only read documented fields.
 * Internal Brain fields never appear in ApiResponse.data.
 */

import { API_VERSION, API_STATUS, API_ERROR } from './api-types.js'

/**
 * Wrap a successful data payload in the standard envelope.
 *
 * @param {object} data       - the shaped payload for Core
 * @param {object} ctx        - { t0: number } — start timestamp for durationMs
 * @returns {ApiResponse}
 */
export function toSuccess(data, ctx = {}) {
  return {
    apiVersion:  API_VERSION,
    status:      API_STATUS.OK,
    ok:          true,
    generatedAt: new Date().toISOString(),
    durationMs:  typeof ctx.t0 === 'number' ? Date.now() - ctx.t0 : 0,
    data:        data ?? null,
    error:       null,
  }
}

/**
 * Wrap an error condition in the standard envelope.
 *
 * @param {Error|string} err  - error instance or message string
 * @param {object}       ctx  - { t0?, code? }
 * @returns {ApiResponse}
 */
export function toError(err, ctx = {}) {
  const message = err instanceof Error ? err.message : String(err ?? 'Unknown error')
  return {
    apiVersion:  API_VERSION,
    status:      API_STATUS.ERROR,
    ok:          false,
    generatedAt: new Date().toISOString(),
    durationMs:  typeof ctx.t0 === 'number' ? Date.now() - ctx.t0 : 0,
    data:        null,
    error: {
      message,
      code: ctx.code ?? API_ERROR.INTERNAL,
    },
  }
}

/**
 * Return a "feature disabled" envelope — Core renders a graceful fallback.
 * No Brain calls are made when a feature is disabled.
 *
 * @param {string} flagName   - the FEATURE_FLAG constant that is disabled
 * @param {object} ctx        - { t0? }
 * @returns {ApiResponse}
 */
export function toDisabled(flagName, ctx = {}) {
  return {
    apiVersion:  API_VERSION,
    status:      API_STATUS.DISABLED,
    ok:          false,
    generatedAt: new Date().toISOString(),
    durationMs:  typeof ctx.t0 === 'number' ? Date.now() - ctx.t0 : 0,
    data:        null,
    error: {
      message: `Feature '${flagName}' is disabled`,
      code:    API_ERROR.DISABLED,
    },
  }
}

/**
 * Check whether a feature flag is enabled in the opts object.
 * Flags default to enabled (true) unless explicitly set to false.
 *
 * @param {string} flagName
 * @param {object} opts     - { flags?: Record<string, boolean> }
 * @returns {boolean}
 */
export function isFlagEnabled(flagName, opts = {}) {
  const flags = opts?.flags ?? {}
  if (flagName in flags) return Boolean(flags[flagName])
  return true
}
