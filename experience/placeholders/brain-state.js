// ─── DEV-ONLY PLACEHOLDER ────────────────────────────────────────────────────
// Synthetic VisualBrainState with a gently "breathing" firing rate.
// No live data, no engine/Core/@brain imports, no business logic — animation only.
// Importable ONLY by experience/app/ (the bootstrap injector). Retired in M34 when
// the brain reacts to real AI activity.
//
// @typedef {import('../contracts/visual-brain-state.js').VisualBrainState} VisualBrainState
// ─────────────────────────────────────────────────────────────────────────────

const REGIONS = [
  { id: 'executive', label: 'Executive Core',  baseWeight: 0.92, hue: 205, confidence: 0.70 },
  { id: 'strategy',  label: 'Strategic Cortex', baseWeight: 0.74, hue: 192, confidence: 0.62 },
  { id: 'memory',    label: 'Pattern & Memory', baseWeight: 0.81, hue: 280, confidence: 0.66 },
  { id: 'spatial',   label: 'Spatial Sense',    baseWeight: 0.58, hue: 158, confidence: 0.55 },
  { id: 'perception',label: 'Perception',       baseWeight: 0.64, hue: 258, confidence: 0.58 },
  { id: 'coordination', label: 'Coordination',  baseWeight: 0.70, hue: 32,  confidence: 0.60 },
]

/**
 * Build a synthetic VisualBrainState for elapsed time `t` (seconds).
 * `t` is supplied by the caller's animation loop — this module owns no clock.
 * @param {number} [t] elapsed seconds
 * @returns {VisualBrainState}
 */
export function placeholderBrainState(t = 0) {
  const breathe = Math.sin(t * 0.6) * 0.5 + 0.5            // 0..1, ~10s cycle
  const firingRate = 0.32 + breathe * 0.36                 // hovers 0.32..0.68

  const regions = REGIONS.map((r, i) => {
    const wobble = Math.sin(t * 0.8 + i * 1.3) * 0.5 + 0.5
    return {
      id: r.id,
      label: r.label,
      weight: Math.min(1, r.baseWeight * (0.7 + wobble * 0.4)),
      hue: r.hue,
      confidence: r.confidence,
      awake: wobble > 0.35,
    }
  })

  // A couple of travelling pulses between regions, phased by time.
  const pulses = [
    { from: 'executive', to: 'strategy',  intensity: breathe,              hue: 200 },
    { from: 'memory',    to: 'executive', intensity: 1 - breathe,          hue: 278 },
    { from: 'spatial',   to: 'coordination', intensity: (breathe + 0.3) % 1, hue: 150 },
  ]

  return {
    state: 'placeholder',
    firingRate,
    globalHue: 206 + Math.sin(t * 0.15) * 8,
    maturity: 0.58,
    regions,
    pulses,
  }
}
