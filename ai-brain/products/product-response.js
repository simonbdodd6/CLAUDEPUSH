/**
 * AI Brain — Coach Intelligence Product Response Builders (M16)
 *
 * Every product method returns a ProductResponse envelope.
 * Core checks `response.ok` before reading `response.data`.
 *
 * Shape:
 *   {
 *     productId:      string,       — e.g. 'weekly-brief'
 *     productVersion: '1.0',
 *     ok:             boolean,
 *     generatedAt:    ISO string,
 *     durationMs:     number,
 *     data:           object | null,
 *     error:          { message, code } | null,
 *   }
 *
 * The product envelope is distinct from ApiResponse (M15):
 *   ApiResponse uses apiVersion + status; ProductResponse uses productId + productVersion.
 * The two layers have separate envelopes so Core can differentiate them.
 */

import { PRODUCT_VERSION, PRODUCT_ERROR } from './product-types.js'

export function toProduct(productId, data, ctx = {}) {
  return {
    productId,
    productVersion: PRODUCT_VERSION,
    ok:             true,
    generatedAt:    new Date().toISOString(),
    durationMs:     typeof ctx.t0 === 'number' ? Date.now() - ctx.t0 : 0,
    data:           data ?? null,
    error:          null,
  }
}

export function toProductError(productId, err, ctx = {}) {
  const message = err instanceof Error ? err.message : String(err ?? 'Unknown error')
  return {
    productId,
    productVersion: PRODUCT_VERSION,
    ok:             false,
    generatedAt:    new Date().toISOString(),
    durationMs:     typeof ctx.t0 === 'number' ? Date.now() - ctx.t0 : 0,
    data:           null,
    error:          { message, code: ctx.code ?? PRODUCT_ERROR.INTERNAL },
  }
}

export function toProductDisabled(productId, flagName, ctx = {}) {
  return {
    productId,
    productVersion: PRODUCT_VERSION,
    ok:             false,
    generatedAt:    new Date().toISOString(),
    durationMs:     typeof ctx.t0 === 'number' ? Date.now() - ctx.t0 : 0,
    data:           null,
    error: {
      message: `Product '${flagName}' is disabled`,
      code:    PRODUCT_ERROR.DISABLED,
    },
  }
}

/**
 * Check whether a product flag is enabled.
 * Flags default to enabled unless explicitly set to false in opts.flags.
 */
export function isProductEnabled(flagName, opts = {}) {
  const flags = opts?.flags ?? {}
  return flagName in flags ? Boolean(flags[flagName]) : true
}

/**
 * Strip product-layer flags from opts before passing down to API layer.
 * Prevents product flags from accidentally disabling API endpoints.
 * API-layer flags ('ai.*') are passed through unchanged.
 */
export function apiOpts(opts = {}) {
  if (!opts?.flags) return opts
  const apiFlags = Object.fromEntries(
    Object.entries(opts.flags).filter(([k]) => !k.startsWith('ai.product.'))
  )
  return { ...opts, flags: apiFlags }
}
