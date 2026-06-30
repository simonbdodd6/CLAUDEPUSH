/**
 * web/brain-coach-dna-intelligence-query.js - Coach DNA Intelligence Query Surface (M255, DORMANT)
 *
 * The stable read API over the Coach's Eye Intelligence subsystem. Where M253 produces the profile and M254
 * indexes it, this module exposes pure deterministic QUERY helpers so downstream Brain modules (Match
 * Intelligence, Selection Intelligence, Season Memory, Opposition Analysis, Coach Evolution, ...) can ask for
 * one signal group, one category, the coverage, the evidence, the confidence, the provenance or the validation
 * state — WITHOUT understanding the internal profile/index structures.
 *
 * It is NOT an inference engine. It derives no new intelligence, predicts nothing and recommends nothing: every
 * helper returns only information already present in the M253 profile or M254 index, re-keyed for convenient
 * lookup. Lookups are total and safe: an unknown or missing category returns a deterministic null-shaped
 * answer rather than throwing, so callers never need existence checks.
 *
 * Pure functions. They reuse ONLY the M253/M254 shapes, build the index on demand when only a profile is
 * supplied, mutate no input, perform no writes, make no recommendation, call no AI/LLM, and use no
 * DOM/network/storage/env/database/clock/randomness. They touch no engine, prior milestone, index.html,
 * runtime, or API. Same input → same answer, byte for byte.
 */

import { buildCoachDnaIntelligenceIndex } from './brain-coach-dna-intelligence-index.js' // M254

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

// The eight category↔field bindings, fixed order — the canonical query vocabulary.
const SIGNAL_FIELDS = Object.freeze([
  { field: 'coachingStyleSignals', category: 'philosophy' },
  { field: 'communicationSignals', category: 'communication-style' },
  { field: 'trainingSignals', category: 'training-preference' },
  { field: 'playerDevelopmentSignals', category: 'player-management' },
  { field: 'selectionSignals', category: 'selection-preference' },
  { field: 'tacticalSignals', category: 'tactical-preference' },
  { field: 'planningSignals', category: 'learned-pattern' },
  { field: 'riskSignals', category: 'risk-warning' },
])
const FIELD_BY_CATEGORY = Object.freeze(Object.fromEntries(SIGNAL_FIELDS.map(({ field, category }) => [category, field])))
const CATEGORY_BY_FIELD = Object.freeze(Object.fromEntries(SIGNAL_FIELDS.map(({ field, category }) => [field, category])))

/**
 * Resolve a frozen { profile, index } pair from whatever the caller supplies. Accepts:
 *   - an M255 context ({ profile, index }) — used as-is
 *   - an M254 index alone ({ type:'coach-dna-intelligence-index' })
 *   - an M253 profile alone ({ type:'coach-dna-intelligence-profile' }) — index built on demand
 * Always returns an object; profile/index may be null when the input is unrecognized.
 */
function resolve(input) {
  if (isObj(input) && (isObj(input.profile) || isObj(input.index))) {
    const profile = isObj(input.profile) && input.profile.type === 'coach-dna-intelligence-profile' ? input.profile : null
    let index = isObj(input.index) && input.index.type === 'coach-dna-intelligence-index' ? input.index : null
    if (!index && profile) index = buildCoachDnaIntelligenceIndex(profile)
    return { profile, index }
  }
  if (isObj(input) && input.type === 'coach-dna-intelligence-index') return { profile: null, index: input }
  if (isObj(input) && input.type === 'coach-dna-intelligence-profile') {
    return { profile: input, index: buildCoachDnaIntelligenceIndex(input) }
  }
  return { profile: null, index: null }
}

const normCategory = (key) => {
  if (typeof key !== 'string') return null
  if (FIELD_BY_CATEGORY[key]) return key            // already a category
  if (CATEGORY_BY_FIELD[key]) return CATEGORY_BY_FIELD[key] // a field name → its category
  return null
}

/**
 * Build a reusable query surface bound to a profile/index. Each method is deterministic and side-effect free.
 *
 * @param {object} input an M253 profile, an M254 index, or a { profile, index } pair
 * @returns {object} frozen query surface
 */
export function createCoachDnaIntelligenceQuery(input) {
  const { profile, index } = resolve(input)
  const usable = !!index && isObj(index.validationState) && index.validationState.profileUsable === true

  const surface = {
    /** @returns {boolean} whether the bound intelligence is usable (recognized + valid source). */
    isUsable() { return usable },

    /**
     * Look up one signal group by category (e.g. 'philosophy') or field (e.g. 'coachingStyleSignals').
     * @returns {object|null} a frozen signal entry, or a frozen not-present entry for a known-but-absent
     *          category, or null for an unknown key.
     */
    getSignalGroup(key) {
      const category = normCategory(key)
      if (!category || !index || !isObj(index.signalIndex)) return null
      const field = FIELD_BY_CATEGORY[category]
      const entry = isObj(index.signalIndex[field]) ? index.signalIndex[field] : null
      return entry ? deepFreeze({ ...entry }) : null
    },

    /**
     * Look up one category's navigation entry.
     * @returns {object|null} a frozen category entry, or null for an unknown key.
     */
    getCategory(key) {
      const category = normCategory(key)
      if (!category || !index || !isObj(index.categoryIndex)) return null
      const entry = isObj(index.categoryIndex[category]) ? index.categoryIndex[category] : null
      return entry ? deepFreeze({ ...entry }) : null
    },

    /** @returns {string[]} the categories present in this profile (deterministic order). */
    listPresentCategories() {
      if (!index || !isObj(index.categoryIndex)) return deepFreeze([])
      return deepFreeze(SIGNAL_FIELDS.map(({ category }) => category).filter((c) => index.categoryIndex[c] && index.categoryIndex[c].present === true))
    },

    /** @returns {object} a frozen copy of the coverage summary. */
    getCoverage() {
      const c = index && isObj(index.coverageSummary) ? index.coverageSummary : {}
      return deepFreeze({ ...c })
    },

    /** @returns {object} a frozen copy of the evidence index (totals + per-category map). */
    getEvidence() {
      const e = index && isObj(index.evidenceIndex) ? index.evidenceIndex : {}
      return deepFreeze(JSON.parse(JSON.stringify(e)))
    },

    /** @returns {object} a frozen confidence view, preferring the profile's confidence summary. */
    getConfidence() {
      const fromProfile = profile && isObj(profile.confidenceSummary) ? profile.confidenceSummary : null
      if (fromProfile) return deepFreeze({ ...fromProfile })
      const level = index && isObj(index.coverageSummary) ? index.coverageSummary.confidenceLevel : null
      return deepFreeze({ level: typeof level === 'string' ? level : 'LOW' })
    },

    /** @returns {object} a frozen copy of the provenance index (lineage back to M230). */
    getProvenance() {
      const p = index && isObj(index.provenanceIndex) ? index.provenanceIndex : {}
      return deepFreeze(JSON.parse(JSON.stringify(p)))
    },

    /** @returns {object} a frozen validation state for the bound intelligence. */
    getValidationState() {
      const v = index && isObj(index.validationState) ? index.validationState : { profileRecognized: false, profileUsable: false, issues: ['no intelligence index available'] }
      return deepFreeze(JSON.parse(JSON.stringify(v)))
    },
  }

  return deepFreeze(surface)
}

// Convenience one-shot helpers (stateless) — same answers as the bound surface, for callers that don't want to
// hold a query object. Each resolves its own profile/index.
export function getSignalGroup(input, key) { return createCoachDnaIntelligenceQuery(input).getSignalGroup(key) }
export function getCategory(input, key) { return createCoachDnaIntelligenceQuery(input).getCategory(key) }
export function getCoverage(input) { return createCoachDnaIntelligenceQuery(input).getCoverage() }
export function getEvidence(input) { return createCoachDnaIntelligenceQuery(input).getEvidence() }
export function getConfidence(input) { return createCoachDnaIntelligenceQuery(input).getConfidence() }
export function getProvenance(input) { return createCoachDnaIntelligenceQuery(input).getProvenance() }
export function getValidationState(input) { return createCoachDnaIntelligenceQuery(input).getValidationState() }
