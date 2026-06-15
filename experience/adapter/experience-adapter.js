// ─────────────────────────────────────────────────────────────────────────────
// Experience Adapter (M33)
//
// The seam between the AI Brain façade and the Experience Layer's view layer.
// It produces a VisualModel / VisualBrainState from:
//   • an injected `facade`  — @brain/product-coaches-eye (or null) — consumed ONLY
//     through its documented surface (see facade-contract.js); NEVER imported here
//   • an injected `runtime` — the host-built port for wired capabilities (or null);
//     building it needs the engine, which lives outside the Experience Layer
//   • an injected `fallbackModel` — a complete placeholder VisualModel supplied by
//     the app bootstrap; every non-wired (or unavailable) slice stays as this
//
// It contains NO business logic, no scoring, no recommendations, no predictions,
// no reasoning — only gating-through-the-façade and pure, guarded field mapping.
//
// M33 reality: the standalone app injects `facade: null` (so it builds without the
// platform), which means every slice resolves to the placeholder fallback. The
// wiring for the one approved capability — coach.matchReadiness — is fully built;
// it activates the instant a composition root injects the façade + runtime port.
//
// @typedef {import('./facade-contract.js').CoachesEyeFacade} CoachesEyeFacade
// @typedef {import('./facade-contract.js').CoachesEyeRuntimePort} CoachesEyeRuntimePort
// ─────────────────────────────────────────────────────────────────────────────

import { isObj } from './shape-guards.js'
import { CAP_MATCH_READINESS, CAP_COACH_DNA } from './facade-contract.js'
import { mapMatchReadiness } from './mappers/match-readiness.js'
import { mapCoachDna } from './mappers/coach-dna.js'

/**
 * @param {Object}  deps
 * @param {CoachesEyeFacade|null} [deps.facade]    injected @brain/product-coaches-eye façade
 * @param {CoachesEyeRuntimePort|null} [deps.runtime]  injected host runtime port
 * @param {object}  deps.fallbackModel             complete placeholder VisualModel (from app)
 * @returns {{ getVisualModel: (context?:object) => Promise<object>, getBrainState: (t:number, base:object) => object }}
 */
export function createExperienceAdapter({ facade = null, runtime = null, fallbackModel } = {}) {
  const fallback = isObj(fallbackModel) ? fallbackModel : {}

  async function getVisualModel(context = {}) {
    // No façade injected (M33 standalone) → everything stays placeholder.
    if (!facade || typeof facade.invoke !== 'function') {
      return fallback
    }

    // System slice reflects how many capabilities the façade gates online (pure count).
    let system = fallback.system
    if (typeof facade.getCapabilities === 'function') {
      const caps = facade.getCapabilities(context)
      const online = Array.isArray(caps) ? caps.filter(c => c && c.available).length : 0
      system = {
        ...(isObj(fallback.system) ? fallback.system : {}),
        state: 'live',
        capabilitiesOnline: online,
        tier: typeof context.tier === 'string' ? context.tier : (fallback.system?.tier ?? 'free'),
      }
    }

    // The wired capabilities, each through the façade only. Every other slice
    // stays as the placeholder fallback.
    const [matchReadiness, coachDna] = await Promise.all([
      resolveSlice(CAP_MATCH_READINESS, fallback.matchReadiness, mapMatchReadiness, context),
      resolveSlice(CAP_COACH_DNA, fallback.coachDna, mapCoachDna, context),
    ])

    return { ...fallback, system, matchReadiness, coachDna }
  }

  // Invoke one capability through the façade and map its envelope to a view slice.
  // ok+data → 'live' (mapped); available:false → 'locked'; dormant / no port /
  // façade error → the placeholder fallback is preserved.
  async function resolveSlice(capability, fb, mapper, context) {
    let env
    try {
      env = await facade.invoke(capability, context, runtime)
    } catch {
      return withState(fb, 'placeholder')
    }
    if (!isObj(env)) return withState(fb, 'placeholder')
    if (env.ok && env.data != null) return mapper(env.data, fb)
    if (env.available === false) return withState(fb, 'locked')
    return withState(fb, 'placeholder')
  }

  // Activity-stream seam for the brain. M33: pure passthrough of the placeholder
  // breathing state (the brain is not a wired capability). M34 can blend real AI
  // activity here without touching the render layer.
  function getBrainState(_t, base) {
    return base
  }

  return { getVisualModel, getBrainState }
}

function withState(slice, state) {
  return isObj(slice) ? { ...slice, state } : { state }
}
