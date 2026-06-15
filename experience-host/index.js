/**
 * experience-host (M34) — live composition root for the Experience Layer.
 *
 * This is where the standalone Experience Layer is ACTIVATED against the real AI
 * Brain. It composes three already-approved pieces and NOTHING else:
 *
 *   • @brain/product-coaches-eye        — the approved façade (the only Brain surface)
 *   • host-coaches-eye/createCoachesEyeRuntime  — the approved runtime-port builder
 *       (wraps the integration layer; built in M31.5; used here, NOT modified)
 *   • experience/adapter/createExperienceAdapter — the existing M33 adapter seam
 *
 * It does NOT import an AI engine, Coach's Eye Core, or any internal @brain package
 * directly — the engine is reached ONLY transitively through the approved host
 * runtime port. It is deliberately OUTSIDE experience/ so the browser app stays
 * standalone (it never bundles @brain); a host shell injects the provider this
 * module builds into the app at runtime.
 *
 * No business logic, no recommendations, no predictions, no reasoning — pure
 * composition. The one live capability is coach.matchReadiness (the rest stay
 * placeholder, handled by the adapter + the app's fallback model).
 */

import * as facade from '@brain/product-coaches-eye'
import { createCoachesEyeRuntime } from '../host-coaches-eye/index.js'
import { createExperienceAdapter } from '../experience/adapter/index.js'

/**
 * Build the injectable brain provider: the approved façade + a host runtime port.
 * A host shell sets this on the app's injection point (e.g. globalThis) to flip
 * the Experience Layer from placeholder to live — without the app importing @brain.
 *
 * @param {object} [opts]  forwarded to createCoachesEyeRuntime (e.g. { coachAI } for tests)
 * @returns {Readonly<{ facade: typeof facade, runtime: { getMatchReadiness: (payload:any)=>Promise<any> } }>}
 */
export function createLiveExperienceProvider(opts = {}) {
  return Object.freeze({ facade, runtime: createCoachesEyeRuntime(opts) })
}

/**
 * Convenience for headless/host use: compose the live provider with the existing
 * Experience Adapter and resolve a VisualModel. The caller supplies the placeholder
 * `fallbackModel` (every non-wired slice stays as it). When no runtime/façade is
 * reachable the adapter already preserves the placeholder fallback.
 *
 * @param {object} context        gating + payload context, e.g. { tier, payload }
 * @param {object} fallbackModel  complete placeholder VisualModel (non-wired slices)
 * @param {object} [opts]         forwarded to createCoachesEyeRuntime
 * @returns {Promise<object>}     VisualModel with a LIVE matchReadiness slice
 */
export async function getLiveVisualModel(context, fallbackModel, opts = {}) {
  const { facade: f, runtime } = createLiveExperienceProvider(opts)
  const adapter = createExperienceAdapter({ facade: f, runtime, fallbackModel })
  return adapter.getVisualModel(context)
}
