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

import { REASON, TIER } from '@brain/contracts'
import { COACHES_EYE_MANIFEST, getManifest as _getManifest, tierIncludes } from '@brain/products'
import { negotiate } from '@brain/versioning'

export const PRODUCT_ID = 'coaches-eye'

/** Known tiers + capability keys — used to validate and normalise input. */
const KNOWN_TIERS = new Set(Object.values(TIER))
const CAPABILITY_KEYS = new Set(COACHES_EYE_MANIFEST.capabilities.map(c => c.key))

/** The default tier when none/unknown is supplied — the AI-off baseline. */
const DEFAULT_TIER = TIER.FREE

/**
 * Normalise an arbitrary caller context into a safe { tier, flags } shape.
 * Unknown or missing tier → `free` (the AI-off baseline, mirroring the engines'
 * resolveTier). A non-object context or non-object flags → empty.
 */
function normaliseContext(context) {
  const raw = context && typeof context === 'object' && !Array.isArray(context) ? context : {}
  const tier = KNOWN_TIERS.has(raw.tier) ? raw.tier : DEFAULT_TIER
  const flags = raw.flags && typeof raw.flags === 'object' && !Array.isArray(raw.flags) ? raw.flags : {}
  return { tier, flags }
}

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
 * Resolve the gate reason. Precedence (most fundamental first):
 *   invalid capability → global kill-switch → per-capability flag → tier.
 * @returns {string|null} a REASON, or null when permitted.
 */
function gateReason(manifest, capabilityKey, tier, flags) {
  if (!CAPABILITY_KEYS.has(capabilityKey)) return REASON.INVALID_INPUT
  if (!flagEnabled(flags, manifest.globalKillFlag)) return REASON.AI_NOT_ENABLED
  const f = pluginFlagFor(manifest, capabilityKey)
  if (f && !flagEnabled(flags, f)) return REASON.FEATURE_DISABLED
  if (!tierIncludes(manifest, capabilityKey, tier)) return REASON.INSUFFICIENT_TIER
  return null
}

/**
 * Pure capability gate — the engine-independent part of the façade. Never throws
 * for any input; returns a FROZEN result.
 * @param {string} capabilityKey
 * @param {{tier?: string, flags?: Record<string, boolean>}} [context]
 * @returns {Readonly<{capability: string, available: boolean, reason: string|null, version: string|null}>}
 */
export function gateCapability(capabilityKey, context = {}) {
  const m = COACHES_EYE_MANIFEST
  const { tier, flags } = normaliseContext(context)
  const reason = gateReason(m, capabilityKey, tier, flags)
  return Object.freeze({
    capability: capabilityKey,
    available: reason === null,
    reason,
    version: negotiate(capabilityKey),
  })
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
 * Never throws for any input; returns a FROZEN envelope whose keys are always
 * exactly { available, ok, reason, data, version }.
 *
 * @param {string} capabilityKey
 * @param {object} [context]
 * @returns {Readonly<{available: boolean, ok: boolean, reason: string|null, data: null, version: string|null}>}
 */
export function request(capabilityKey, context = {}) {
  const gate = gateCapability(capabilityKey, context)
  return Object.freeze({
    available: gate.available,
    ok: false,                                   // dormant: no engine wired → no successful data
    reason: gate.available ? null : gate.reason,
    data: null,
    version: gate.version,
  })
}

// ─── live wiring via an injected runtime port (M31.4) ────────────────────────
//
// The façade NEVER imports an engine. A live capability is reached only through
// an injected `runtime` port — an object exposing the wired method(s):
//
//   const runtime = { getMatchReadiness: async (payload) => <engine output> }
//
// The host (e.g. the integration layer) builds that port around the real engine;
// the façade only calls runtime[method](payload). In M31.4 exactly one capability
// is wired — coach.matchReadiness — everything else stays dormant. Without a port
// (Core's default), even a wired capability resolves dormant, so Core needs no
// change and no flag activation.
//
// @typedef {Object} CoachesEyeRuntimePort
// @property {(payload: any) => (Promise<any>|any)} [getMatchReadiness]  the match-readiness engine adapter

/** Capability → runtime port. M31.4: match readiness; M35: +DNA; M36: +season; M37: +opponent. */
export const WIRED_CAPABILITIES = Object.freeze({
  'coach.matchReadiness': 'getMatchReadiness',
  'coach.coachDna': 'getCoachDna',
  'coach.seasonIntelligence': 'getSeasonIntelligence',
  'coach.opponentIntelligence': 'getOpponentIntelligence',
})

/** Is this capability wired to a runtime port? */
export function isWired(capabilityKey) {
  return Object.prototype.hasOwnProperty.call(WIRED_CAPABILITIES, capabilityKey)
}

function envelope(available, ok, reason, data, version) {
  return Object.freeze({ available, ok, reason, data, version })
}

/** The payload handed to the port: context.payload when present, else the context. */
function payloadOf(context) {
  if (context && typeof context === 'object' && !Array.isArray(context) && 'payload' in context) return context.payload
  return context
}

/**
 * Live invocation through an injected runtime port (ASYNC). Preserves the
 * request() envelope shape exactly: { available, ok, reason, data, version }.
 *
 *   - gate denied/disabled  → denied envelope; the port is NEVER called
 *   - allowed but not wired  → dormant envelope (ok:false, data:null); no port call
 *   - allowed + wired + no port → dormant envelope; no port call
 *   - allowed + wired + port → await port(payload) → { ok:true, data, … }
 *   - the port throws        → { ok:false, reason:'brain_unavailable', data:null, … }
 *
 * The gate is always evaluated FIRST, so a disabled/denied/invalid request can
 * never reach the runtime port.
 *
 * @param {string} capabilityKey
 * @param {{tier?: string, flags?: Record<string, boolean>, payload?: any}} [context]
 * @param {CoachesEyeRuntimePort|null} [runtime]
 * @returns {Promise<Readonly<{available: boolean, ok: boolean, reason: string|null, data: any, version: string|null}>>}
 */
export async function invoke(capabilityKey, context = {}, runtime = null) {
  const gate = gateCapability(capabilityKey, context)
  if (!gate.available) {
    return envelope(false, false, gate.reason, null, gate.version)   // denied → never calls the port
  }
  const method = WIRED_CAPABILITIES[capabilityKey]
  if (!method) {
    return envelope(true, false, null, null, gate.version)            // permitted but not wired → dormant
  }
  const port = runtime && typeof runtime[method] === 'function' ? runtime[method] : null
  if (!port) {
    return envelope(true, false, null, null, gate.version)            // no port supplied → dormant (Core default)
  }
  try {
    const data = await port(payloadOf(context))
    return envelope(true, true, null, data ?? null, gate.version)
  } catch {
    return envelope(true, false, REASON.BRAIN_UNAVAILABLE, null, gate.version)
  }
}
