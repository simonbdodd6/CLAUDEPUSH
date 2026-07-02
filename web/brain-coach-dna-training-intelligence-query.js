/**
 * web/brain-coach-dna-training-intelligence-query.js - Coach DNA Training Intelligence Query Surface (M272, DORMANT)
 *
 * The stable read API for the training domain — the training-domain analogue of the M255 core and M264
 * selection query surfaces. It completes the training read stack (M269 inputs → M270 profile → M271 index →
 * M272 query) and is the interface future Training Intelligence modules must consume, instead of reading
 * M270/M271 internals directly.
 *
 * It is critically NOT a training engine: it does NOT analyse sessions, does NOT evaluate players, does NOT
 * generate training content and makes NO recommendation. It contains NO player data. Every helper returns only
 * information already present in the M270 profile / M271 index, re-keyed for convenient lookup. Lookups are
 * total and safe: an unknown or missing lens returns a deterministic null-shaped answer rather than throwing;
 * unknown remains unknown.
 *
 * Key vocabulary note: lenses can be looked up by lens name (e.g. 'sessionStructureSignals') or by source
 * category (e.g. 'tactical-preference'). One category — 'training-preference' — feeds TWO lenses
 * (sessionStructureSignals and technicalSignals, which carry identical data by design); a category lookup for
 * it resolves deterministically to the first declared lens (sessionStructureSignals).
 *
 * Pure functions. They reuse ONLY the M270/M271 shapes (building the index on demand when only a profile is
 * supplied), mutate no input, perform no writes, make no recommendation, call no AI/LLM, and use no
 * DOM/network/storage/env/database/clock/randomness. Same input → same answer, byte for byte.
 */

import { buildCoachDnaTrainingIntelligenceIndex } from './brain-coach-dna-training-intelligence-index.js' // M271

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const numOr0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const strOrNull = (v) => (typeof v === 'string' && v.length > 0 ? v : null)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}
const frozenCopy = (v) => deepFreeze(v !== null && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v)

// The six training lenses and their source categories — the canonical query vocabulary. Fixed order matters:
// the ambiguous 'training-preference' category resolves to the FIRST lens that declares it.
const LENS_SOURCE = Object.freeze({
  planningSignals: 'learned-pattern',
  sessionStructureSignals: 'training-preference',
  developmentSignals: 'player-management',
  technicalSignals: 'training-preference',
  tacticalSignals: 'tactical-preference',
  feedbackSignals: 'communication-style',
})
const LENS_FIELDS = Object.freeze(Object.keys(LENS_SOURCE))
// category → first lens declaring it (deterministic resolution of the shared training-preference source).
const CATEGORY_TO_LENS = Object.freeze(LENS_FIELDS.reduce((acc, lens) => {
  const cat = LENS_SOURCE[lens]
  if (!(cat in acc)) acc[cat] = lens
  return acc
}, {}))

const normKey = (key) => {
  if (typeof key !== 'string') return null
  if (LENS_SOURCE[key]) return key                     // already a lens name
  if (CATEGORY_TO_LENS[key]) return CATEGORY_TO_LENS[key] // a source category → its (first) lens
  return null
}

// Resolve a { profile, index } pair from whatever the caller supplies.
function resolve(input) {
  if (isObj(input) && (isObj(input.profile) || isObj(input.index))) {
    const profile = isObj(input.profile) && input.profile.type === 'coach-dna-training-intelligence-profile' ? input.profile : null
    let index = isObj(input.index) && input.index.type === 'coach-dna-training-intelligence-index' ? input.index : null
    if (!index && profile) index = buildCoachDnaTrainingIntelligenceIndex(profile)
    return { profile, index }
  }
  if (isObj(input) && input.type === 'coach-dna-training-intelligence-index') return { profile: null, index: input }
  if (isObj(input) && input.type === 'coach-dna-training-intelligence-profile') {
    return { profile: input, index: buildCoachDnaTrainingIntelligenceIndex(input) }
  }
  return { profile: null, index: null }
}

/**
 * Build a reusable training query surface bound to a profile/index. Each method is deterministic and
 * side-effect free.
 *
 * @param {object} input an M270 profile, an M271 index, or a { profile, index } pair
 * @returns {object} frozen query surface
 */
export function createCoachDnaTrainingIntelligenceQuery(input) {
  const { index } = resolve(input)
  const lensIndex = isObj(index) && isObj(index.trainingLensIndex) ? index.trainingLensIndex : {}
  const evidenceIndex = isObj(index) && isObj(index.evidenceIndex) ? index.evidenceIndex : {}
  const confidenceIndex = isObj(index) && isObj(index.confidenceIndex) ? index.confidenceIndex : {}
  const usable = isObj(index) && isObj(index.validationState) && index.validationState.profileUsable === true

  const surface = {
    /** @returns {boolean} whether the bound training intelligence is usable. */
    isUsable() { return usable },

    /**
     * Look up one training lens by lens name ('sessionStructureSignals') or source category
     * ('training-preference' — resolves to the first declaring lens).
     * @returns {object|null} a frozen lens entry, or null for an unknown key.
     */
    getTrainingLens(key) {
      const lens = normKey(key)
      if (!lens || !isObj(lensIndex[lens])) return null
      return frozenCopy(lensIndex[lens])
    },

    /**
     * Get evidence: with a lens key, the per-lens evidence entry (or null for an unknown key); without a key,
     * the full evidence roll-up.
     * @returns {object|null}
     */
    getEvidence(key) {
      if (key === undefined) return frozenCopy({ ...evidenceIndex })
      const lens = normKey(key)
      if (!lens) return null
      const byLens = isObj(evidenceIndex.byLens) ? evidenceIndex.byLens : {}
      return isObj(byLens[lens]) ? frozenCopy(byLens[lens]) : frozenCopy({ present: false, occurrences: 0, supportingCount: 0, themeCount: 0 })
    },

    /**
     * Get confidence: with a lens key, the per-lens confidence entry (or null for an unknown key); without a
     * key, the overall confidence summary.
     * @returns {object|null}
     */
    getConfidence(key) {
      if (key === undefined) {
        return frozenCopy({
          level: strOrNull(confidenceIndex.level) || 'LOW',
          value: numOr0(confidenceIndex.value),
          high: confidenceIndex.high === true,
          low: confidenceIndex.low === true,
        })
      }
      const lens = normKey(key)
      if (!lens) return null
      const byLens = isObj(confidenceIndex.byLens) ? confidenceIndex.byLens : {}
      return isObj(byLens[lens]) ? frozenCopy(byLens[lens]) : frozenCopy({ present: false, averageConfidence: 0 })
    },

    /** @returns {object} a frozen coverage summary (present/dominant/total lenses + confidence level). */
    getCoverage() {
      const vs = isObj(index) && isObj(index.validationState) ? index.validationState : {}
      return frozenCopy({
        presentLenses: numOr0(vs.presentLenses),
        dominantLenses: numOr0(vs.dominantLenses),
        totalLenses: numOr0(vs.totalLenses) || LENS_FIELDS.length,
        confidenceLevel: strOrNull(confidenceIndex.level) || 'LOW',
      })
    },

    /** @returns {object} a frozen copy of the provenance index (training lineage back to M230). */
    getProvenance() {
      const p = isObj(index) && isObj(index.provenanceIndex) ? index.provenanceIndex : {}
      return frozenCopy({ ...p })
    },

    /** @returns {object} a frozen validation state for the bound training intelligence. */
    getValidationState() {
      const v = isObj(index) && isObj(index.validationState) ? index.validationState : { profileRecognized: false, profileUsable: false, issues: ['no training index available'] }
      return frozenCopy({ ...v })
    },

    /** @returns {string[]} the lens names present in this profile (deterministic order). */
    listAvailableLenses() {
      return deepFreeze(LENS_FIELDS.filter((f) => isObj(lensIndex[f]) && lensIndex[f].present === true))
    },
  }

  return deepFreeze(surface)
}

// Convenience one-shot helpers (stateless) — same answers as the bound surface.
export function isUsable(input) { return createCoachDnaTrainingIntelligenceQuery(input).isUsable() }
export function getTrainingLens(input, key) { return createCoachDnaTrainingIntelligenceQuery(input).getTrainingLens(key) }
export function getEvidence(input, key) { return createCoachDnaTrainingIntelligenceQuery(input).getEvidence(key) }
export function getConfidence(input, key) { return createCoachDnaTrainingIntelligenceQuery(input).getConfidence(key) }
export function getCoverage(input) { return createCoachDnaTrainingIntelligenceQuery(input).getCoverage() }
export function getProvenance(input) { return createCoachDnaTrainingIntelligenceQuery(input).getProvenance() }
export function getValidationState(input) { return createCoachDnaTrainingIntelligenceQuery(input).getValidationState() }
export function listAvailableLenses(input) { return createCoachDnaTrainingIntelligenceQuery(input).listAvailableLenses() }
