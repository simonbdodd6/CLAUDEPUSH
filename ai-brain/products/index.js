/**
 * AI Brain — Coach Intelligence Product Library (M16)
 *
 * Four coaching products built by composing the Coach Experience API (M15).
 * Core imports these four functions only. No Brain internals are ever visible.
 *
 * Every function returns a ProductResponse:
 *   { productId, productVersion, ok, generatedAt, durationMs, data, error }
 *
 * Core checks `response.ok` before reading `response.data`.
 * Pass `opts.flags` to disable individual products.
 *
 * Product flags use the 'ai.product.*' prefix:
 *   'ai.product.weeklyBrief'    → getWeeklyBrief
 *   'ai.product.matchReadiness' → getMatchReadiness
 *   'ai.product.playerCard'     → getPlayerCard
 *   'ai.product.clubSnapshot'   → getClubSnapshot
 */

export { getWeeklyBrief }    from './weekly-brief.js'
export { getMatchReadiness } from './match-readiness.js'
export { getPlayerCard }     from './player-card.js'
export { getClubSnapshot }   from './club-snapshot.js'

// Constants re-exported for Core consumers
export { PRODUCT_ID, PRODUCT_VERSION, PRODUCT_FEATURE_FLAG, PRODUCT_ERROR } from './product-types.js'
