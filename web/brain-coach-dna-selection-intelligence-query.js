/**
 * web/brain-coach-dna-selection-intelligence-query.js - Coach DNA Selection Intelligence Query Surface (M264, DORMANT)
 *
 * The stable read API for the selection domain — the selection-domain analogue of the M255 core query surface.
 * It completes the selection read stack (M261 inputs → M262 profile → M263 index → M264 query) and is the
 * interface future Selection Intelligence modules must consume, instead of reading M262/M263 internals directly.
 *
 * It is critically NOT player selection: it contains NO player data, performs NO player scoring, NO player
 * ranking and makes NO recommendation. Every helper returns only information already present in the M262
 * profile / M263 index, re-keyed for convenient lookup. Lookups are total and safe: an unknown or missing lens
 * returns a deterministic null-shaped answer rather than throwing.
 *
 * Pure functions. They reuse ONLY the M262/M263 shapes (building the index on demand when only a profile is
 * supplied), mutate no input, perform no writes, make no recommendation, call no AI/LLM, and use no
 * DOM/network/storage/env/database/clock/randomness. Same input → same answer, byte for byte.
 */

import { buildCoachDnaSelectionIntelligenceIndex } from './brain-coach-dna-selection-intelligence-index.js' // M263

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
const frozenCopy = (v) => deepFreeze(isObj(v) ? JSON.parse(JSON.stringify(v)) : (Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : v))

// The five selection lenses and their source categories — the canonical query vocabulary.
const LENS_SOURCE = Object.freeze({
  selectionSignals: 'selection-preference',
  playerTrustSignals: 'player-management',
  continuitySignals: 'philosophy',
  rotationSignals: 'tactical-preference',
  availabilitySignals: 'risk-warning',
})
const LENS_FIELDS = Object.freeze(Object.keys(LENS_SOURCE))
const CATEGORY_TO_LENS = Object.freeze(Object.fromEntries(Object.entries(LENS_SOURCE).map(([lens, cat]) => [cat, lens])))

const normKey = (key) => {
  if (typeof key !== 'string') return null
  if (LENS_SOURCE[key]) return key                  // already a lens name
  if (CATEGORY_TO_LENS[key]) return CATEGORY_TO_LENS[key] // a source category → its lens
  return null
}

// Resolve a frozen { profile, index } pair from whatever the caller supplies.
function resolve(input) {
  if (isObj(input) && (isObj(input.profile) || isObj(input.index))) {
    const profile = isObj(input.profile) && input.profile.type === 'coach-dna-selection-intelligence-profile' ? input.profile : null
    let index = isObj(input.index) && input.index.type === 'coach-dna-selection-intelligence-index' ? input.index : null
    if (!index && profile) index = buildCoachDnaSelectionIntelligenceIndex(profile)
    return { profile, index }
  }
  if (isObj(input) && input.type === 'coach-dna-selection-intelligence-index') return { profile: null, index: input }
  if (isObj(input) && input.type === 'coach-dna-selection-intelligence-profile') {
    return { profile: input, index: buildCoachDnaSelectionIntelligenceIndex(input) }
  }
  return { profile: null, index: null }
}

/**
 * Build a reusable selection query surface bound to a profile/index. Each method is deterministic and
 * side-effect free.
 *
 * @param {object} input an M262 profile, an M263 index, or a { profile, index } pair
 * @returns {object} frozen query surface
 */
export function createCoachDnaSelectionIntelligenceQuery(input) {
  const { index } = resolve(input)
  const lensIndex = isObj(index) && isObj(index.lensIndex) ? index.lensIndex : {}
  const evidenceIndex = isObj(index) && isObj(index.evidenceIndex) ? index.evidenceIndex : {}
  const confidenceIndex = isObj(index) && isObj(index.confidenceIndex) ? index.confidenceIndex : {}
  const usable = isObj(index) && isObj(index.validationState) && index.validationState.profileUsable === true

  const surface = {
    /** @returns {boolean} whether the bound selection intelligence is usable. */
    isUsable() { return usable },

    /**
     * Look up one selection lens by lens name ('selectionSignals') or source category ('selection-preference').
     * @returns {object|null} a frozen lens entry, or null for an unknown key.
     */
    getSelectionLens(key) {
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

    /** @returns {object} a frozen copy of the provenance index (selection lineage back to M230). */
    getProvenance() {
      const p = isObj(index) && isObj(index.provenanceIndex) ? index.provenanceIndex : {}
      return frozenCopy({ ...p })
    },

    /** @returns {object} a frozen validation state for the bound selection intelligence. */
    getValidationState() {
      const v = isObj(index) && isObj(index.validationState) ? index.validationState : { profileRecognized: false, profileUsable: false, issues: ['no selection index available'] }
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
export function isUsable(input) { return createCoachDnaSelectionIntelligenceQuery(input).isUsable() }
export function getSelectionLens(input, key) { return createCoachDnaSelectionIntelligenceQuery(input).getSelectionLens(key) }
export function getEvidence(input, key) { return createCoachDnaSelectionIntelligenceQuery(input).getEvidence(key) }
export function getConfidence(input, key) { return createCoachDnaSelectionIntelligenceQuery(input).getConfidence(key) }
export function getCoverage(input) { return createCoachDnaSelectionIntelligenceQuery(input).getCoverage() }
export function getProvenance(input) { return createCoachDnaSelectionIntelligenceQuery(input).getProvenance() }
export function getValidationState(input) { return createCoachDnaSelectionIntelligenceQuery(input).getValidationState() }
export function listAvailableLenses(input) { return createCoachDnaSelectionIntelligenceQuery(input).listAvailableLenses() }
