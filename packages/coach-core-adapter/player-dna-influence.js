/**
 * @coach-core-adapter — Player DNA Influence (DORMANT)
 *
 * A pure deterministic layer that adjusts a candidate's confidence using a Coach DNA profile
 * (M114). It is a STANDALONE helper — it does not modify M120 or any existing engine, runs no
 * AI inference, generates no text, and touches no Core/Redis/network/clock. A future milestone
 * could fold this into the scoring path; today it is opt-in composition only.
 *
 * Influence is opt-in per candidate: a candidate carries `dnaSignals` (signed affinities toward
 * coaching signal categories); the profile supplies per-category strengths. The adjustment is a
 * scaled, clamped dot-product of the candidate's affinities and the profile's signal strengths.
 * A plain candidate (no dnaSignals), an empty/absent profile, or no matched signals → no
 * adjustment, original confidence preserved. Inputs are never mutated; output is deeply frozen.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)
const clamp01 = (x) => Math.min(1, Math.max(0, x))
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function assertCandidate(candidate) {
  if (!isObj(candidate) || !isNonEmptyString(candidate.playerId) || !isFiniteNumber(candidate.confidence)) {
    throw new TypeError('applyPlayerDnaInfluence requires a candidate { playerId, confidence, dnaSignals? }')
  }
  if (candidate.dnaSignals !== undefined) {
    if (!Array.isArray(candidate.dnaSignals)) throw new TypeError('applyPlayerDnaInfluence: candidate.dnaSignals must be an array')
    for (const s of candidate.dnaSignals) {
      if (!isObj(s) || !isNonEmptyString(s.category) || !isFiniteNumber(s.weight)) {
        throw new TypeError('applyPlayerDnaInfluence: each dnaSignal must be { category, weight }')
      }
    }
  }
}

/** A null/undefined profile is allowed (no influence); otherwise it must be an M114-shaped profile. */
function assertProfile(profile) {
  if (profile === null || profile === undefined) return
  if (!isObj(profile) || !Array.isArray(profile.dominantSignals)) {
    throw new TypeError('applyPlayerDnaInfluence requires an M114 Coach DNA profile or null')
  }
  for (const s of profile.dominantSignals) {
    if (!isObj(s) || !isNonEmptyString(s.category) || !isFiniteNumber(s.strength)) {
      throw new TypeError('applyPlayerDnaInfluence: malformed dominant signal (requires { category, strength })')
    }
  }
}

/**
 * Adjust a candidate's confidence by its alignment with a Coach DNA profile.
 *
 * @param {{ playerId:string, confidence:number, dnaSignals?: Array<{category:string, weight:number}> }} candidate
 * @param {(object|null)} coachDnaProfile  an M114 profile, or null for no influence
 * @param {{ adjustmentWeight?: number, maxAdjustment?: number, enabled?: boolean }} [options]
 * @returns {Readonly<{ playerId:string, baseConfidence:number, dnaAdjustment:number, finalConfidence:number, metadata:object }>}
 */
export function applyPlayerDnaInfluence(candidate, coachDnaProfile, options = {}) {
  assertCandidate(candidate)
  assertProfile(coachDnaProfile)
  if (!isObj(options)) throw new TypeError('applyPlayerDnaInfluence: options must be an object')

  const adjustmentWeight = options.adjustmentWeight !== undefined ? options.adjustmentWeight : 0.2
  if (!isFiniteNumber(adjustmentWeight)) throw new TypeError('applyPlayerDnaInfluence: adjustmentWeight must be a finite number')
  const maxAdjustment = options.maxAdjustment !== undefined ? options.maxAdjustment : Math.abs(adjustmentWeight)
  if (!isFiniteNumber(maxAdjustment) || maxAdjustment < 0) throw new TypeError('applyPlayerDnaInfluence: maxAdjustment must be a non-negative number')
  const enabled = options.enabled !== false   // DNA influence optional; default on

  const baseConfidence = clamp01(candidate.confidence)   // original confidence preserved

  // per-category strengths from the profile
  const strengthByCategory = new Map()
  if (coachDnaProfile && Array.isArray(coachDnaProfile.dominantSignals)) {
    for (const s of coachDnaProfile.dominantSignals) strengthByCategory.set(s.category, s.strength)
  }

  // matched affinities: candidate signal categories that the profile considers dominant
  const matchedSignals = []
  let rawScore = 0
  if (enabled && Array.isArray(candidate.dnaSignals)) {
    for (const s of candidate.dnaSignals) {
      if (strengthByCategory.has(s.category)) {
        const strength = strengthByCategory.get(s.category)
        const contribution = s.weight * strength
        rawScore += contribution
        matchedSignals.push({ category: s.category, weight: s.weight, strength, contribution })
      }
    }
  }

  const dnaAdjustment = clamp(adjustmentWeight * rawScore, -maxAdjustment, maxAdjustment)
  const finalConfidence = clamp01(baseConfidence + dnaAdjustment)

  return deepFreeze({
    playerId: candidate.playerId,
    baseConfidence,
    dnaAdjustment,
    finalConfidence,
    metadata: {
      influenceApplied: enabled && matchedSignals.length > 0,
      matchedSignals,
      adjustmentWeight,
      maxAdjustment,
      rawScore,
      deterministic: true,
      adapterLayer: true,
    },
  })
}
