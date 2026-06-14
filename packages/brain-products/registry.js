/**
 * @brain/products — Product registry (M31.0)
 *
 * Pure, deterministic helpers over product manifests. No state, no I/O, no LLM,
 * no randomness. These do NOT call any engine and change no runtime behaviour;
 * they simply read the declarative manifest. In later phases the product façade
 * will use these to resolve capability/tier — for now they are dormant.
 *
 * @typedef {import('@brain/contracts').ProductManifest} ProductManifest
 */

import { COACHES_EYE_MANIFEST } from './coaches-eye.manifest.js'

const MANIFESTS = Object.freeze({ 'coaches-eye': COACHES_EYE_MANIFEST })

/** Return the manifest for a product id, or null. */
export function getManifest(productId) {
  return MANIFESTS[productId] ?? null
}

/** List registered product ids. */
export function listProducts() {
  return Object.keys(MANIFESTS)
}

/** Find a capability entry by key within a manifest, or null. */
export function getCapability(manifest, capabilityKey) {
  if (!manifest) return null
  return manifest.capabilities.find(c => c.key === capabilityKey) ?? null
}

/**
 * Does the given tier include the given capability?
 * Pure lookup against the manifest's capability tier-set. Mirrors today's
 * M17 `hasCapability` semantics exactly (a tier SET, not a linear minimum).
 */
export function tierIncludes(manifest, capabilityKey, tier) {
  const cap = getCapability(manifest, capabilityKey)
  return cap ? cap.tiers.includes(tier) : false
}

/**
 * Resolve whether a capability is available for a tier, honouring the global
 * kill-switch flag (default-on / opt-out, like the live engines).
 * @param {ProductManifest} manifest
 * @param {string} capabilityKey
 * @param {string} tier
 * @param {Record<string, boolean>} [flags]
 * @returns {boolean}
 */
export function resolveCapability(manifest, capabilityKey, tier, flags = {}) {
  if (!manifest) return false
  // Global kill-switch: explicit false disables everything.
  const kill = manifest.globalKillFlag
  if (kill in flags && flags[kill] === false) return false
  return tierIncludes(manifest, capabilityKey, tier)
}

/** Flag keys declared by a manifest. */
export function listFlags(manifest) {
  return (manifest?.flags ?? []).map(f => f.key)
}

/** Namespace names declared by a manifest. */
export function listNamespaces(manifest) {
  return [...(manifest?.namespaces ?? [])]
}
