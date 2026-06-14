/**
 * @brain/versioning (M31.0)
 *
 * Version contracts + pure negotiation. Depends only on @brain/contracts.
 * Dormant in M31.0 — no engine or Core imports it.
 */

export { VERSION_CONTRACTS, VERSION_CONTRACT_BY_CAPABILITY } from './version-contracts.js'
export { isSupported, negotiate, getVersionContract } from './negotiate.js'
