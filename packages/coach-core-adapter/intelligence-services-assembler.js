/**
 * @coach-core-adapter — Intelligence Services Assembler (DORMANT, COMPOSITION ONLY)
 *
 * Builds the M118 `intelligenceServices` bundle by wiring the REAL M110–M117 functions from the
 * coach-memory package around an injected memoryProvider. This lets runPipelineBridge (M137)
 * drive M118 with the actual Coach Memory / Coach DNA engines instead of test stubs.
 *
 * Pure wiring only: it imports the real functions, applies per-key overrides, and bundles them
 * with the memoryProvider. It calls NOTHING (no service, no provider), implements no logic, and
 * mutates nothing. No Core, Redis, network, filesystem, clock, randomness, LLM or vector DB.
 *
 * Reuses the existing coach-core-adapter → coach-memory dependency (no new edge, no cycle).
 */

import {
  retrieveCoachMemories,
  synthesizeCoachMemories,
  extractCoachDnaSignals,
  buildCoachDnaProfile,
  buildDecisionExplanation,
  scoreDecisionAlignment,
  buildDecisionChallenge,
} from '../coach-memory/index.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// the real M110–M117 functions, keyed exactly as the M118 services contract expects
const REAL_SERVICES = {
  retrieveCoachMemories,       // M110
  synthesizeCoachMemories,     // M112
  extractCoachDnaSignals,      // M113
  buildCoachDnaProfile,        // M114
  buildDecisionExplanation,    // M115
  scoreDecisionAlignment,      // M116
  buildDecisionChallenge,      // M117
}

const SERVICE_KEYS = Object.freeze(Object.keys(REAL_SERVICES))

/**
 * Assemble the M118 intelligenceServices bundle.
 *
 * @param {object} memoryProvider  the provider M110 retrieveCoachMemories expects (preserved by reference)
 * @param {Partial<Record<string, Function>>} [overrides]  replace individual service functions
 * @returns {Readonly<{
 *   retrieveCoachMemories:Function, synthesizeCoachMemories:Function, extractCoachDnaSignals:Function,
 *   buildCoachDnaProfile:Function, buildDecisionExplanation:Function, scoreDecisionAlignment:Function,
 *   buildDecisionChallenge:Function, memoryProvider:object
 * }>}
 */
export function assembleIntelligenceServices(memoryProvider, overrides = {}) {
  if (!isObj(memoryProvider)) throw new TypeError('assembleIntelligenceServices requires a memoryProvider object')
  if (!isObj(overrides)) throw new TypeError('assembleIntelligenceServices: overrides must be an object')

  const services = {}
  for (const key of SERVICE_KEYS) {
    const fn = overrides[key] !== undefined ? overrides[key] : REAL_SERVICES[key]
    if (typeof fn !== 'function') throw new TypeError(`assembleIntelligenceServices: ${key} must be a function`)
    services[key] = fn   // wired, never called here
  }
  services.memoryProvider = memoryProvider   // preserved by reference; not frozen

  // freeze the wrapper only (shallow) — memoryProvider and the function refs are left untouched
  return Object.freeze(services)
}
