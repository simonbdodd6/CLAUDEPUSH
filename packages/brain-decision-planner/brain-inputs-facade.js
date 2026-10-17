/**
 * @brain-decision-planner — Unified Brain Inputs Facade (DORMANT, composition-only)
 *
 * Composes the two validated read boundaries into the complete pair of Brain pipeline inputs:
 *   squadLoader        → M165 loaderToSelectionInputs                 → squadInput
 *   decisionPlanSource → M169 completeDecisionPlanningInput (M168→M135→M140) → decisionInput
 *
 * Thin composition ONLY — it reuses the existing boundary functions, transforms nothing, derives
 * no fields, generates no timestamps/IDs, runs no AI/recommendations, and does no runtime wiring,
 * networking, persistence, or Core mutation. Inputs are not mutated; the returned wrapper is frozen
 * (its parts are already frozen by M165 / M140).
 *
 * NOTE: `boundaries` is an OPTIONAL second argument defaulting to the real production functions.
 * The single-argument call `buildBrainInputs({ squadLoader, decisionPlanSource })` runs the real
 * boundaries; the optional argument exists solely for the required call-order / call-once tests.
 */

import { loaderToSelectionInputs } from '../coach-core-adapter/loader-to-selection-inputs.js'
import { completeDecisionPlanningInput } from './intelligence-boundary-harness.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const DEFAULT_BOUNDARIES = Object.freeze({ loaderToSelectionInputs, completeDecisionPlanningInput })

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/**
 * Build the complete pair of Brain pipeline inputs from two validated read-only providers.
 *
 * @param {{ squadLoader: object, decisionPlanSource: object }} input
 * @param {{ loaderToSelectionInputs: Function, completeDecisionPlanningInput: Function }} [boundaries]
 *   defaults to the real M165 / M169 — injectable only for testing call order / call-once
 * @returns {Readonly<{ squadInput: object, decisionInput: object }>}
 */
export function buildBrainInputs(input, boundaries = DEFAULT_BOUNDARIES) {
  if (!isObj(input)) throw new TypeError('buildBrainInputs requires an input object { squadLoader, decisionPlanSource }')
  if (!isObj(boundaries) || typeof boundaries.loaderToSelectionInputs !== 'function' || typeof boundaries.completeDecisionPlanningInput !== 'function') {
    throw new TypeError('buildBrainInputs: boundaries must provide loaderToSelectionInputs and completeDecisionPlanningInput')
  }

  // selection/squad boundary (M164→M165) — validates squadLoader internally
  const squadInput = boundaries.loaderToSelectionInputs(input.squadLoader)
  // decision-planning boundary (M167→M168→M135→M140) — validates decisionPlanSource internally
  const decisionInput = boundaries.completeDecisionPlanningInput(input.decisionPlanSource)

  return deepFreeze({ squadInput, decisionInput })
}
