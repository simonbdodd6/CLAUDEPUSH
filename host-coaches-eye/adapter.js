/**
 * Coach's Eye Intelligence — host adapter (M31.5, DORMANT)
 *
 * The composition root that wires the existing AI Brain into the Coach's Eye
 * façade's runtime port. UNLIKE the façade (which must never import an engine),
 * the host adapter MAY import BOTH the façade and the engine / integration layer
 * — it is the single place those two meet.
 *
 * Lives OUTSIDE packages/@brain/* on purpose: it is host-layer wiring, not a
 * platform package, so the platform ring rules (which forbid engine imports) do
 * not — and should not — apply to it.
 *
 * DORMANT: nothing imports this yet (Core included). It activates no feature
 * flag and changes no Core API/UI. In M31.5 it wires exactly one capability —
 * coach.matchReadiness — via the engine's own integration layer.
 */

import { invoke, WIRED_CAPABILITIES } from '@brain/product-coaches-eye'
import { getMatchReadiness } from '../coach-products/match-readiness/index.js'

/**
 * Build the Coach's Eye runtime port for the façade. The port exposes ONLY the
 * wired capability method(s) — M31.5: `getMatchReadiness` only.
 *
 * The engine (M21 match-readiness) consumes the AI Brain integration layer
 * (`CoachAI`) by default. `opts.coachAI` injects a CoachAI for deterministic
 * testing; when omitted the engine uses the real integration layer.
 *
 * @param {{ coachAI?: object }} [opts]
 * @returns {Readonly<{ getMatchReadiness: (payload: object) => Promise<object> }>}
 */
export function createCoachesEyeRuntime(opts = {}) {
  const coachAI = opts && typeof opts === 'object' ? opts.coachAI : undefined
  return Object.freeze({
    // `payload` is the engine context: { user, team, fixtureId?, generatedAt? }.
    getMatchReadiness: (payload) =>
      coachAI ? getMatchReadiness(payload, coachAI) : getMatchReadiness(payload),
  })
}

/**
 * Convenience: invoke a Coach's Eye capability through the façade using a runtime
 * built by this adapter. Other (unwired) capabilities resolve dormant.
 *
 * @param {string} capabilityKey
 * @param {{ tier?: string, flags?: object, payload?: object }} [context]
 * @param {{ coachAI?: object }} [opts]
 * @returns {Promise<object>} the façade Envelope
 */
export async function invokeCoachesEye(capabilityKey, context = {}, opts = {}) {
  return invoke(capabilityKey, context, createCoachesEyeRuntime(opts))
}

/** Capabilities this adapter can serve live (mirrors the façade's wired set). */
export const ADAPTER_WIRED_CAPABILITIES = WIRED_CAPABILITIES
