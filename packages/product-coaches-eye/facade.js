/**
 * @brain/product-coaches-eye — Coach's Eye product façade (M31.3, DORMANT)
 *
 * The single, stable surface a Coach's Eye host would import to reach the AI
 * Brain — generalised from the M17 CoachAI boundary. In M31.3 it is DORMANT:
 *
 *   - It imports ONLY @brain/contracts, @brain/products and @brain/versioning
 *     (pure data + types). It has NO import path to any engine or to Core, so it
 *     cannot invoke or change AI runtime behaviour.
 *   - It performs NO engine call (no live wiring). `request()` resolves the
 *     capability gate and returns the stable Envelope shape with `data: null`.
 *   - Nothing imports it yet (Core included).
 *
 * Deterministic, no LLM, no randomness, no feature-flag activation (flag
 * semantics are evaluated read-only, exactly mirroring the engines: a flag that
 * is absent is treated as enabled / opt-out).
 */

import { REASON } from '@brain/contracts'
import { COACHES_EYE_MANIFEST, getManifest as _getManifest, tierIncludes } from '@brain/products'
import { negotiate } from '@brain/versioning'

export const PRODUCT_ID = 'coaches-eye'

/** Flag is enabled unless explicitly set to false (opt-out — mirrors engines). */
function flagEnabled(flags, key) {
  if (!flags || !(key in flags)) return true
  return Boolean(flags[key])
}

/** The per-capability flag declared by the manifest plugin registration, if any. */
function pluginFlagFor(manifest, capabilityKey) {
  return manifest.plugins.find(p => p.slot === capabilityKey)?.flag ?? null
}

/**
 * Resolve the gate reason in the same order the engines use:
 * global kill-switch → per-capability flag → subscription tier.
 * @returns {string|null} a REASON, or null when permitted.
 */
function gateReason(manifest, capabilityKey, tier, flags) {
  if (!flagEnabled(flags, manifest.globalKillFlag)) return REASON.AI_NOT_ENABLED
  const f = pluginFlagFor(manifest, capabilityKey)
  if (f && !flagEnabled(flags, f)) return REASON.FEATURE_DISABLED
  if (!tierIncludes(manifest, capabilityKey, tier)) return REASON.INSUFFICIENT_TIER
  return null
}

/**
 * Pure capability gate — the engine-independent part of the façade.
 * @param {string} capabilityKey
 * @param {{tier?: string, flags?: Record<string, boolean>}} [context]
 * @returns {{capability: string, available: boolean, reason: string|null, version: string|null}}
 */
export function gateCapability(capabilityKey, context = {}) {
  const m = COACHES_EYE_MANIFEST
  const reason = gateReason(m, capabilityKey, context.tier, context.flags ?? {})
  return {
    capability: capabilityKey,
    available: reason === null,
    reason,
    version: negotiate(capabilityKey),
  }
}

/** Gate every declared capability for the given context. */
export function getCapabilities(context = {}) {
  return COACHES_EYE_MANIFEST.capabilities.map(c => gateCapability(c.key, context))
}

/** The coaches-eye product manifest (convenience re-export). */
export function getManifest() {
  return _getManifest(PRODUCT_ID)
}

/**
 * Dormant façade request. Resolves the capability gate but performs NO engine
 * call (no live wiring in M31.3). Returns the stable Envelope shape:
 *   - denied  → { available:false, ok:false, reason, data:null, version }
 *   - allowed → { available:true,  ok:false, reason:null, data:null, version }
 *               (permitted, but no data because the façade is not wired yet)
 *
 * When the façade is wired to the engines (M31.4) the allowed branch will set
 * `ok:true` and `data:<engine output>`; the denied branch is already exactly
 * what Core will receive in production.
 *
 * @param {string} capabilityKey
 * @param {object} [context]
 * @returns {{available: boolean, ok: boolean, reason: string|null, data: null, version: string|null}}
 */
export function request(capabilityKey, context = {}) {
  const gate = gateCapability(capabilityKey, context)
  return {
    available: gate.available,
    ok: false,                                   // dormant: no engine wired → no successful data
    reason: gate.available ? null : gate.reason,
    data: null,
    version: gate.version,
  }
}
