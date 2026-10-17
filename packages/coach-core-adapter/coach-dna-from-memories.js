/**
 * @coach-core-adapter — Memories → Coach DNA Profile Bridge (DORMANT)
 *
 * Derives a coach DNA profile directly from the coach's memory entries by running the real
 * M113 extractCoachDnaSignals → M114 buildCoachDnaProfile (both INJECTED, not imported, so the
 * adapter stays decoupled and the M138 services bundle can be passed straight in). The result
 * is the M114 profile, whose `dominantSignals[].{category, strength}` are exactly what M152
 * applyPlayerDnaInfluence and M155 createDnaConfidenceProvider read — and shape-compatible with
 * M156 composeCoachDnaProfile — so a coach's memories can now drive the per-player DNA influence.
 *
 * Pure adapter composition: no engine / M120 / recommendation / pipeline / runPipelineBridge
 * edits, no Core/Redis/network/clock. Inputs are never mutated; output is deeply frozen.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/**
 * Build a coach DNA profile from memory entries via the injected M113 + M114 engines.
 *
 * @param {object[]} memories  M108 coach memory entries
 * @param {{ extractCoachDnaSignals: Function, buildCoachDnaProfile: Function }} services  the real M113 + M114
 * @returns {Readonly<object>}  the M114 coach DNA profile (dominantSignals: { category, strength, … })
 */
export function coachDnaProfileFromMemories(memories, services) {
  if (!Array.isArray(memories)) throw new TypeError('coachDnaProfileFromMemories requires an array of memories')
  if (!isObj(services) || typeof services.extractCoachDnaSignals !== 'function' || typeof services.buildCoachDnaProfile !== 'function') {
    throw new TypeError('coachDnaProfileFromMemories requires services { extractCoachDnaSignals, buildCoachDnaProfile }')
  }

  const signals = services.extractCoachDnaSignals(memories)   // M113 — exceptions propagate
  const profile = services.buildCoachDnaProfile(signals)       // M114

  if (!isObj(profile) || !Array.isArray(profile.dominantSignals)) {
    throw new TypeError('coachDnaProfileFromMemories: expected an M114 coach DNA profile { dominantSignals }')
  }

  return deepFreeze(profile)   // M114 already freezes; guarantees a frozen output for any injected builder
}
