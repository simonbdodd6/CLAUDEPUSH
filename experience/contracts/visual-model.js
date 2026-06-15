// ─────────────────────────────────────────────────────────────────────────────
// VisualModel — the single view-contract the Experience Layer renders (M32)
//
// SHAPES ONLY. Presentation data shapes — no business logic, no calculations,
// no feature flags, no engine/Core/@brain imports. Render layers consume a
// VisualModel via PROPS ONLY; they never fetch, compute, or import an adapter.
// The `app/` bootstrap is the only injector — synthetic in M32, a real adapter
// from M33 onward.
//
// In M32 every slice's `state` is 'placeholder'.
// See `experience/contracts/visual-brain-state.js` for the `brain` slice.
// ─────────────────────────────────────────────────────────────────────────────

/** Lifecycle of a visual slice. */
export const VISUAL_STATES = Object.freeze(['live', 'placeholder', 'locked', 'idle'])

/**
 * @typedef {import('./visual-brain-state.js').VisualBrainState} VisualBrainState
 */

/**
 * @typedef {Object} SystemSlice
 * @property {'live'|'placeholder'|'locked'|'idle'} state
 * @property {number} capabilitiesOnline
 * @property {number} confidence  0..1
 * @property {string} tier
 * @property {number} latencyMs
 */

/**
 * @typedef {Object} MatchReadinessSlice
 * @property {'live'|'placeholder'|'locked'|'idle'} state
 * @property {number} confidence  0..1
 * @property {string} verdict
 * @property {{ overall:number, availability:number, fitness:number, cohesion:number }} gauges  each 0..100
 * @property {{ label:string, severity:'high'|'medium'|'low' }[]} risks
 * @property {{ label:string }[]} evidence
 */

/**
 * @typedef {Object} CoachDnaTrait
 * @property {string} key
 * @property {string} label
 * @property {number} score       0..100
 * @property {number} confidence  0..1
 * @property {string} descriptor
 */

/**
 * @typedef {Object} CoachDnaSlice
 * @property {'live'|'placeholder'|'locked'|'idle'} state
 * @property {number} maturity  0..1
 * @property {string} summary
 * @property {CoachDnaTrait[]} traits
 */

/**
 * @typedef {Object} SeasonSlice
 * @property {'live'|'placeholder'|'locked'|'idle'} state
 * @property {{ round:number, value:number }[]} trajectory
 * @property {{ points:number, position:number }} projection
 * @property {{ title:number, playoff:number, relegation:number }} probabilities  each 0..100
 */

/**
 * @typedef {Object} MemoryNode
 * @property {string}  id
 * @property {string}  label
 * @property {string}  cluster
 * @property {boolean} activated
 */

/**
 * @typedef {Object} MemoryEdge
 * @property {string} from
 * @property {string} to
 * @property {number} weight  0..1
 */

/**
 * @typedef {Object} MemorySlice
 * @property {'live'|'placeholder'|'locked'|'idle'} state
 * @property {MemoryNode[]} nodes
 * @property {MemoryEdge[]} edges
 * @property {string[]} recentlyActivated  node ids
 */

/**
 * @typedef {Object} VisualModel
 * @property {SystemSlice}         system
 * @property {VisualBrainState}    brain
 * @property {MatchReadinessSlice} matchReadiness
 * @property {CoachDnaSlice}       coachDna
 * @property {SeasonSlice}         season
 * @property {MemorySlice}         memory
 */

export {}
