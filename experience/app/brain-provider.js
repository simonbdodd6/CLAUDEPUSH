// ─────────────────────────────────────────────────────────────────────────────
// Brain provider injection point (Experience Layer app, M34)
//
// The standalone-safe seam through which the Experience Layer is activated. A host
// shell (Node side, experience-host/createLiveExperienceProvider) may set
//   globalThis.__COACHES_EYE_BRAIN__ = { facade, runtime }
// to flip the app from placeholder to live. When it is absent — the default, and
// the entire standalone browser build — this returns null and every panel stays a
// placeholder.
//
// This file imports NOTHING (no @brain, no engine, no adapter) so the browser
// bundle remains standalone. It only reads an optional, externally-injected global.
// ─────────────────────────────────────────────────────────────────────────────

/** The global key a host shell uses to inject the brain provider. */
export const BRAIN_INJECTION_KEY = '__COACHES_EYE_BRAIN__'

/**
 * @returns {{ facade: object, runtime?: object|null }|null}
 *   the injected brain provider, or null (→ placeholder) when none is present.
 */
export function resolveInjectedBrain() {
  const g = typeof globalThis !== 'undefined' ? globalThis[BRAIN_INJECTION_KEY] : null
  if (!g || typeof g !== 'object') return null
  if (typeof g.facade !== 'object' || g.facade == null) return null
  return { facade: g.facade, runtime: g.runtime ?? null }
}
