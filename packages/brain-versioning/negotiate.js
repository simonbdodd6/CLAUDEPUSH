/**
 * @brain/versioning — Pure version negotiation (M31.0)
 *
 * Deterministic helpers to resolve which output version a consumer receives.
 * No state, no I/O, no LLM, no randomness. Dormant in M31.0.
 *
 * @typedef {import('@brain/contracts').VersionContract} VersionContract
 */

import { VERSION_CONTRACT_BY_CAPABILITY } from './version-contracts.js'

/** Is `version` currently served for this contract? */
export function isSupported(contract, version) {
  return !!contract && Array.isArray(contract.supports) && contract.supports.includes(version)
}

/**
 * Negotiate the served version for a capability given a pinned request.
 *   - pinned '*' or null/undefined → the current outputVersion
 *   - pinned exact version in `supports` → that version
 *   - otherwise → null (unsupported)
 * @param {string} capability
 * @param {string} [pinned]
 * @returns {string|null}
 */
export function negotiate(capability, pinned = '*') {
  const contract = VERSION_CONTRACT_BY_CAPABILITY[capability]
  if (!contract) return null
  if (pinned == null || pinned === '*') return contract.outputVersion
  return isSupported(contract, pinned) ? pinned : null
}

/** Get the version contract for a capability, or null. */
export function getVersionContract(capability) {
  return VERSION_CONTRACT_BY_CAPABILITY[capability] ?? null
}
