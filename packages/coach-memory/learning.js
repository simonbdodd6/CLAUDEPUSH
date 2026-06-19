/**
 * @coach-memory — Coach Memory learning assessment (M111, DORMANT)
 *
 * The first Coach DNA learning step: decide whether a coaching decision is important enough
 * to become a permanent coach memory. It only ASSESSES a candidate against a declarative
 * policy — it stores nothing, calls no LLM, generates no ids or timestamps, and is pure,
 * deterministic, and side-effect free (no persistence, filesystem, network, vector search,
 * embeddings, clock or randomness).
 */

import { COACH_MEMORY_TYPES, COACH_MEMORY_SOURCES, ONTOLOGY_KINDS } from './model.js'

const isObj = (v) => v !== null && typeof v === 'object'
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const isUnitNumber = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)
const clamp01 = (x) => Math.min(1, Math.max(0, x))

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Validate the candidate; return normalised optional arrays (defaulted to []). */
function validateCandidate(candidate) {
  if (!isObj(candidate) || Array.isArray(candidate)) throw new TypeError('coach memory candidate must be an object')

  if (!COACH_MEMORY_TYPES.includes(candidate.type)) throw new TypeError(`coach memory candidate has invalid type "${candidate.type}"`)
  if (!isNonEmptyString(candidate.statement)) throw new TypeError('coach memory candidate requires a non-empty statement')
  if (!isUnitNumber(candidate.confidence)) throw new TypeError('coach memory candidate confidence must be a number in [0,1]')
  if (!isUnitNumber(candidate.weight)) throw new TypeError('coach memory candidate weight must be a number in [0,1]')
  if (!COACH_MEMORY_SOURCES.includes(candidate.source)) throw new TypeError(`coach memory candidate has invalid source "${candidate.source}"`)

  const tags = candidate.tags === undefined ? [] : candidate.tags
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string')) throw new TypeError('coach memory candidate tags must be an array of strings')

  const evidenceRefs = candidate.evidenceRefs === undefined ? [] : candidate.evidenceRefs
  if (!Array.isArray(evidenceRefs) || !evidenceRefs.every((r) => typeof r === 'string')) throw new TypeError('coach memory candidate evidenceRefs must be an array of strings')

  const ontologyLinks = candidate.ontologyLinks === undefined ? [] : candidate.ontologyLinks
  if (!Array.isArray(ontologyLinks)) throw new TypeError('coach memory candidate ontologyLinks must be an array')
  for (const link of ontologyLinks) {
    if (!isObj(link) || !ONTOLOGY_KINDS.includes(link.kind) || !isNonEmptyString(link.id)) {
      throw new TypeError('coach memory candidate ontologyLinks must be { kind, id } with a valid kind and non-empty id')
    }
  }

  return { tags, evidenceRefs, ontologyLinks }
}

/** Validate + normalise the policy, applying defaults. */
function normalizePolicy(policy) {
  if (!isObj(policy) || Array.isArray(policy)) throw new TypeError('assessCoachMemoryCandidate: policy must be an object')

  let minimumImportance = 0.6
  if (policy.minimumImportance !== undefined) {
    if (!isFiniteNumber(policy.minimumImportance)) throw new TypeError('assessCoachMemoryCandidate: minimumImportance must be a number')
    minimumImportance = policy.minimumImportance
  }

  let requireEvidence = false
  if (policy.requireEvidence !== undefined) {
    if (typeof policy.requireEvidence !== 'boolean') throw new TypeError('assessCoachMemoryCandidate: requireEvidence must be a boolean')
    requireEvidence = policy.requireEvidence
  }

  let requireOntologyLink = false
  if (policy.requireOntologyLink !== undefined) {
    if (typeof policy.requireOntologyLink !== 'boolean') throw new TypeError('assessCoachMemoryCandidate: requireOntologyLink must be a boolean')
    requireOntologyLink = policy.requireOntologyLink
  }

  const assertTypeList = (name, v) => {
    if (!Array.isArray(v) || !v.every((t) => COACH_MEMORY_TYPES.includes(t))) {
      throw new TypeError(`assessCoachMemoryCandidate: ${name} must be an array of valid coach memory types`)
    }
    return v
  }
  const boostTypes = policy.boostTypes === undefined ? [] : assertTypeList('boostTypes', policy.boostTypes)
  const suppressTypes = policy.suppressTypes === undefined ? [] : assertTypeList('suppressTypes', policy.suppressTypes)

  return { minimumImportance, requireEvidence, requireOntologyLink, boostTypes, suppressTypes }
}

/**
 * Assess whether a coaching decision should become a permanent coach memory.
 *
 * @param {{ type:string, statement:string, confidence:number, weight:number, source:string,
 *           tags?:string[], ontologyLinks?:{kind:string,id:string}[], evidenceRefs?:string[] }} candidate
 * @param {{ minimumImportance?:number, requireEvidence?:boolean, requireOntologyLink?:boolean,
 *           boostTypes?:string[], suppressTypes?:string[] }} [policy]
 * @returns {Readonly<{ shouldRemember:boolean, importance:number, reasons:ReadonlyArray<string> }>}
 */
export function assessCoachMemoryCandidate(candidate, policy = {}) {
  const { tags, evidenceRefs, ontologyLinks } = validateCandidate(candidate)
  const p = normalizePolicy(policy)

  const boosted = p.boostTypes.includes(candidate.type)
  const suppressed = p.suppressTypes.includes(candidate.type)
  const typeAdjustment = (boosted ? 0.1 : 0) + (suppressed ? -0.1 : 0)

  const importance = clamp01(
    candidate.confidence * 0.45
    + candidate.weight * 0.25
    + Math.min(evidenceRefs.length, 5) / 5 * 0.1
    + Math.min(ontologyLinks.length, 5) / 5 * 0.1
    + Math.min(tags.length, 5) / 5 * 0.05
    + typeAdjustment,
  )

  const meetsThreshold = importance >= p.minimumImportance
  const evidenceOk = !p.requireEvidence || evidenceRefs.length > 0
  const ontologyOk = !p.requireOntologyLink || ontologyLinks.length > 0
  const shouldRemember = meetsThreshold && evidenceOk && ontologyOk

  const reasons = []
  if (shouldRemember) {
    reasons.push('Importance meets policy threshold.')
  } else {
    if (!meetsThreshold) reasons.push('Importance below policy threshold.')
    if (!evidenceOk) reasons.push('Evidence is required.')
    if (!ontologyOk) reasons.push('Ontology link is required.')
  }
  if (boosted) reasons.push('Type boost applied.')
  if (suppressed) reasons.push('Type suppression applied.')

  return deepFreeze({ shouldRemember, importance, reasons })
}
