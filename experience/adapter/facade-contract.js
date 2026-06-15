// ─────────────────────────────────────────────────────────────────────────────
// Façade contract (Experience Adapter, M33)
//
// The Experience Adapter consumes the AI Brain ONLY through the approved
// `@brain/product-coaches-eye` façade — and it does so by DEPENDENCY INJECTION,
// never a static import. That keeps the Experience Layer fully standalone (no
// @brain in its node_modules; it builds without the platform) while still being
// able to consume the façade when a composition root injects it.
//
// This file documents the exact, minimal slice of the façade surface the adapter
// uses. The injected object MUST be `@brain/product-coaches-eye` (or a faithful
// test double of it). The adapter NEVER reaches past these methods — no engine,
// no Core, no internal @brain package.
//
// @typedef {Object} CoachesEyeFacade
// @property {(key:string, ctx?:object) => Readonly<{capability:string, available:boolean, reason:string|null, version:string|null}>} gateCapability
// @property {(ctx?:object) => Array<Readonly<{capability:string, available:boolean, reason:string|null, version:string|null}>>} getCapabilities
// @property {(key:string, ctx?:object, runtime?:object|null) => Promise<Readonly<{available:boolean, ok:boolean, reason:string|null, data:any, version:string|null}>>} invoke
// @property {Readonly<Record<string,string>>} WIRED_CAPABILITIES
//
// The optional runtime port injected alongside the façade (built by a host layer
// from the real engine — outside the Experience Layer, never imported here):
//
// @typedef {Object} CoachesEyeRuntimePort
// @property {(payload:any) => (Promise<any>|any)} [getMatchReadiness]
// @property {(payload:any) => (Promise<any>|any)} [getCoachDna]
// @property {(payload:any) => (Promise<any>|any)} [getSeasonIntelligence]
// @property {(payload:any) => (Promise<any>|any)} [getOpponentIntelligence]
// ─────────────────────────────────────────────────────────────────────────────

/** The capabilities the adapter knows how to map. Mirror façade.WIRED_CAPABILITIES. */
export const CAP_MATCH_READINESS = 'coach.matchReadiness'
export const CAP_COACH_DNA = 'coach.coachDna'
export const CAP_SEASON_INTELLIGENCE = 'coach.seasonIntelligence'
export const CAP_OPPONENT_INTELLIGENCE = 'coach.opponentIntelligence'

export {}
