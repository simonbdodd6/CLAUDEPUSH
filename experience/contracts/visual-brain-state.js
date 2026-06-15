// ─────────────────────────────────────────────────────────────────────────────
// VisualBrainState — view-contract for the Living Neural Brain (M32)
//
// SHAPES ONLY. No business logic, no calculations, no engine/Core/@brain imports.
// The brain renderer knows ONLY this shape — never rugby, coaching, or any domain
// concept. M32 feeds it a synthetic, gently-breathing state from
// `experience/placeholders/brain-state.js`. M34 will feed it real AI activity.
// ─────────────────────────────────────────────────────────────────────────────

/** Lifecycle of a visual surface. */
export const VISUAL_BRAIN_STATES = Object.freeze(['live', 'placeholder', 'idle'])

/**
 * @typedef {Object} VisualBrainRegion
 * @property {string}  id          stable region id
 * @property {string}  label       human label (presentation only)
 * @property {number}  weight      0..1 — relative prominence
 * @property {number}  hue         0..360 — region colour
 * @property {number}  confidence  0..1 — how "sure" the region looks
 * @property {boolean} awake       whether the region is currently active
 */

/**
 * @typedef {Object} VisualBrainPulse
 * @property {string} from       source region id
 * @property {string} to         target region id
 * @property {number} intensity  0..1
 * @property {number} hue        0..360
 */

/**
 * @typedef {Object} VisualBrainState
 * @property {'live'|'placeholder'|'idle'} state
 * @property {number} firingRate  0..1 — drives pulse frequency / energy
 * @property {number} globalHue   0..360 — overall mood / posture colour
 * @property {number} maturity    0..1 — how "formed" the brain looks
 * @property {VisualBrainRegion[]} regions
 * @property {VisualBrainPulse[]}  pulses
 */

export {}
