/**
 * @brain/evidence-contracts — Confidence-weight contract (M43)
 *
 * The DECLARED parameters for deterministic confidence weighting (§6 of the M42
 * architecture). This is pure DATA only — it is the contract a future reweighting
 * function (the Evidence Gateway, a later milestone) must read. There is NO
 * weighting logic here, no computation, no I/O. Frozen + versioned like the
 * capability version contracts.
 *
 * Aggregate confidence per (subject, signal.key) is a fixed function of: source
 * trust, recency decay, corroboration, conflict, and saturating volume.
 */

import { DISPUTED_FLAG } from './enums.js'

export const CONFIDENCE_WEIGHT_CONTRACT = Object.freeze({
  version: '1.0',

  // Source trust ceilings (0..1): verified provider > verified manual >
  // unverified (provider that fails verification is treated as manual-grade).
  sourceTrust: Object.freeze({
    providerVerified:   1.00,
    manualVerified:     0.70,
    manualUnverified:   0.45,
    providerUnverified: 0.45,
  }),

  // Recency decay toward `validTo`: confidence halves every `halfLifeDays`,
  // never falling below `floor`.
  recency: Object.freeze({
    halfLifeDays: 30,
    floor:        0.20,
  }),

  // Independent corroborating sources raise confidence, capped.
  corroboration: Object.freeze({
    perIndependentSource: 0.08,
    cap:                  0.95,
  }),

  // Disagreement applies a penalty and raises the conflict flag (never hidden).
  conflict: Object.freeze({
    penalty: 0.25,
    flag:    DISPUTED_FLAG,
  }),

  // Volume gives saturating (diminishing) returns — never unbounded.
  volume: Object.freeze({
    saturationK: 5,
  }),
})
