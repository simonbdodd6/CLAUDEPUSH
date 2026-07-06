/**
 * web/brain-coach-dna-cross-domain-intelligence-query.js - Coach DNA Cross-Domain Intelligence Query Surface (M280, DORMANT)
 *
 * The stable read API for the cross-domain chapter — the cross-domain analogue of the M255/M264/M272 query
 * surfaces. It completes the cross-domain read stack (M277 inputs → M278 profile → M279 index → M280 query) and
 * is the interface future Cross-Domain Intelligence modules must consume, instead of reading M278/M279
 * internals directly.
 *
 * It critically creates NO new intelligence: it does NOT compare the domains, does NOT combine or reconcile
 * their figures, makes NO recommendation and gives NO coaching advice. It selects/ranks/scores/evaluates NO
 * players, recommends NO training and contains NO player data. Every helper returns only information already
 * present in the M278 profile / M279 index, re-keyed for convenient lookup. Lookups are total and safe: an
 * unknown or missing domain returns a deterministic null answer rather than throwing; unknown remains unknown.
 *
 * Pure functions. They reuse ONLY the M278/M279 shapes (building the index on demand when only a profile is
 * supplied), mutate no input, perform no writes, make no recommendation, call no AI/LLM, and use no
 * DOM/network/storage/env/database/clock/randomness. Same input → same answer, byte for byte.
 */

import { buildCoachDnaCrossDomainIntelligenceIndex } from './brain-coach-dna-cross-domain-intelligence-index.js' // M279

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

// The two domains — the canonical query vocabulary, fixed order (never sorted).
const DOMAIN_KEYS = Object.freeze(['selection', 'training'])

const normKey = (key) => (typeof key === 'string' && DOMAIN_KEYS.includes(key) ? key : null)

// Resolve a { profile, index } pair from whatever the caller supplies.
function resolve(input) {
  if (isObj(input) && (isObj(input.profile) || isObj(input.index))) {
    const profile = isObj(input.profile) && input.profile.type === 'coach-dna-cross-domain-intelligence-profile' ? input.profile : null
    let index = isObj(input.index) && input.index.type === 'coach-dna-cross-domain-intelligence-index' ? input.index : null
    if (!index && profile) index = buildCoachDnaCrossDomainIntelligenceIndex(profile)
    return { profile, index }
  }
  if (isObj(input) && input.type === 'coach-dna-cross-domain-intelligence-index') return { profile: null, index: input }
  if (isObj(input) && input.type === 'coach-dna-cross-domain-intelligence-profile') {
    return { profile: input, index: buildCoachDnaCrossDomainIntelligenceIndex(input) }
  }
  return { profile: null, index: null }
}

/**
 * Build a reusable cross-domain query surface bound to a profile/index. Each method is deterministic and
 * side-effect free.
 *
 * @param {object} input an M278 profile, an M279 index, or a { profile, index } pair
 * @returns {object} frozen query surface
 */
export function createCoachDnaCrossDomainIntelligenceQuery(input) {
  const { index } = resolve(input)
  const domainIndex = isObj(index) && isObj(index.domainIndex) ? index.domainIndex : {}
  const evidenceByDomain = isObj(index) && isObj(index.evidenceIndex) && isObj(index.evidenceIndex.byDomain) ? index.evidenceIndex.byDomain : {}
  const confidenceByDomain = isObj(index) && isObj(index.confidenceIndex) && isObj(index.confidenceIndex.byDomain) ? index.confidenceIndex.byDomain : {}
  const usable = isObj(index) && isObj(index.validationState) && index.validationState.profileUsable === true

  const surface = {
    /** @returns {boolean} whether the bound cross-domain intelligence is usable. */
    isUsable() { return usable },

    /**
     * Look up one domain entry by key ('selection' or 'training').
     * @returns {object|null} a frozen domain entry, or null for an unknown key.
     */
    getDomain(key) {
      const domain = normKey(key)
      if (!domain || !isObj(domainIndex[domain])) return null
      return frozenCopy(domainIndex[domain])
    },

    /**
     * Get evidence: with a domain key, that domain's own evidence overview (null when the domain is missing or
     * the key unknown); without a key, the full byDomain map.
     * @returns {object|null}
     */
    getEvidence(key) {
      if (key === undefined) {
        return frozenCopy(DOMAIN_KEYS.reduce((acc, k) => {
          acc[k] = isObj(evidenceByDomain[k]) ? { ...evidenceByDomain[k] } : null
          return acc
        }, {}))
      }
      const domain = normKey(key)
      if (!domain) return null
      return isObj(evidenceByDomain[domain]) ? frozenCopy(evidenceByDomain[domain]) : null
    },

    /**
     * Get confidence: with a domain key, that domain's own confidence overview (null when the domain is missing
     * or the key unknown); without a key, the full byDomain map.
     * @returns {object|null}
     */
    getConfidence(key) {
      if (key === undefined) {
        return frozenCopy(DOMAIN_KEYS.reduce((acc, k) => {
          acc[k] = isObj(confidenceByDomain[k]) ? { ...confidenceByDomain[k] } : null
          return acc
        }, {}))
      }
      const domain = normKey(key)
      if (!domain) return null
      return isObj(confidenceByDomain[domain]) ? frozenCopy(confidenceByDomain[domain]) : null
    },

    /** @returns {object} a frozen completeness summary (level + domain counts) for the bound assembly. */
    getCompleteness() {
      const vs = isObj(index) && isObj(index.validationState) ? index.validationState : {}
      const level = strOrNull(vs.completenessLevel) || 'empty'
      return frozenCopy({
        level,
        complete: level === 'complete',
        includedDomains: numOr0(vs.includedDomains),
        usableDomains: numOr0(vs.usableDomains),
        totalDomains: numOr0(vs.totalDomains) || DOMAIN_KEYS.length,
      })
    },

    /** @returns {object} a frozen copy of the provenance index (cross-domain chain + both domain lineages). */
    getProvenance() {
      const p = isObj(index) && isObj(index.provenanceIndex) ? index.provenanceIndex : {}
      return frozenCopy({ ...p })
    },

    /** @returns {object} a frozen validation state for the bound cross-domain intelligence. */
    getValidationState() {
      const v = isObj(index) && isObj(index.validationState) ? index.validationState : { profileRecognized: false, profileUsable: false, issues: ['no cross-domain index available'] }
      return frozenCopy({ ...v })
    },

    /** @returns {string[]} the usable domain keys (deterministic fixed order — never ranked). */
    listAvailableDomains() {
      return deepFreeze(DOMAIN_KEYS.filter((k) => isObj(domainIndex[k]) && domainIndex[k].usable === true))
    },
  }

  return deepFreeze(surface)
}

// Convenience one-shot helpers (stateless) — same answers as the bound surface.
export function isUsable(input) { return createCoachDnaCrossDomainIntelligenceQuery(input).isUsable() }
export function getDomain(input, key) { return createCoachDnaCrossDomainIntelligenceQuery(input).getDomain(key) }
export function getEvidence(input, key) { return createCoachDnaCrossDomainIntelligenceQuery(input).getEvidence(key) }
export function getConfidence(input, key) { return createCoachDnaCrossDomainIntelligenceQuery(input).getConfidence(key) }
export function getCompleteness(input) { return createCoachDnaCrossDomainIntelligenceQuery(input).getCompleteness() }
export function getProvenance(input) { return createCoachDnaCrossDomainIntelligenceQuery(input).getProvenance() }
export function getValidationState(input) { return createCoachDnaCrossDomainIntelligenceQuery(input).getValidationState() }
export function listAvailableDomains(input) { return createCoachDnaCrossDomainIntelligenceQuery(input).listAvailableDomains() }
