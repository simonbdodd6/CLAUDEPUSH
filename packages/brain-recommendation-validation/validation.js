/**
 * @brain/recommendation-validation — deterministic recommendation validation (M49, DORMANT)
 *
 * Proves a recommendation is safe to expose LATER through the façade: it has a
 * stable id + tenant context, cites at least one evidence id, every cited id
 * validates through @brain/evidence-citation (exists, same tenant, no duplicates),
 * and carries a finite confidence score/status. Duplicate recommendation ids and
 * cross-tenant / missing / empty evidence all invalidate it.
 *
 * Pure + deterministic: no Date, no Math.random, no side effects, no storage of its
 * own (citation checks read through an INJECTED @brain/evidence-store), no network,
 * no files, no engine/gateway/Experience imports. Results are frozen; caller input
 * is never mutated. No recommendation generation, reasoning or prediction.
 *
 * Depends only on the evidence layer:
 *   @brain/evidence-store     — assertTenant / sameTenant (pure) + the injected store
 *   @brain/evidence-citation  — validateEvidenceCitation (the citation gate)
 *   @brain/evidence-weighting — combineEvidenceConfidence (informational cross-check)
 */

import { assertTenant } from '@brain/evidence-store'
import { validateEvidenceCitation } from '@brain/evidence-citation'
import { combineEvidenceConfidence } from '@brain/evidence-weighting'
import { RecommendationValidationError, REC_VALIDATION_ERROR, REC_REASON, CONFIDENCE_STATUS } from './errors.js'

const isStr = (v) => typeof v === 'string' && v.length > 0
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v)

const HIGH = 0.75
const MEDIUM = 0.5

function assertObject(rec, label = 'recommendation') {
  if (!isObj(rec)) throw new RecommendationValidationError(REC_VALIDATION_ERROR.INVALID_INPUT, `${label} must be an object`)
  return rec
}
function assertStore(store) {
  if (!store || typeof store.getEvidenceById !== 'function') {
    throw new RecommendationValidationError(REC_VALIDATION_ERROR.INVALID_INPUT, 'a store with getEvidenceById(tenant,id) is required')
  }
  return store
}
function tenantOk(tenant) {
  try { assertTenant(tenant); return true } catch { return false }
}

// ── confidence ──────────────────────────────────────────────────────────────────

/**
 * Classify a confidence score into a status band (pure).
 * @returns {Readonly<{ confidence:number|null, status:string, valid:boolean }>}
 */
export function recommendationConfidenceStatus(confidence) {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return Object.freeze({ confidence: null, status: CONFIDENCE_STATUS.INVALID, valid: false })
  }
  const status = confidence >= HIGH ? CONFIDENCE_STATUS.HIGH
    : confidence >= MEDIUM ? CONFIDENCE_STATUS.MEDIUM
    : confidence > 0 ? CONFIDENCE_STATUS.LOW
    : CONFIDENCE_STATUS.INSUFFICIENT
  return Object.freeze({ confidence, status, valid: true })
}

// ── duplicate recommendation ids (pure) ──────────────────────────────────────────

/** Recommendation ids that appear more than once, first-duplicate-detection order. */
export function duplicateRecommendations(recommendations) {
  if (!Array.isArray(recommendations)) throw new RecommendationValidationError(REC_VALIDATION_ERROR.INVALID_INPUT, 'recommendations must be an array')
  const seen = new Set(), dup = new Set()
  for (const r of recommendations) {
    const id = isObj(r) ? r.id : undefined
    if (!isStr(id)) continue
    ;(seen.has(id) ? dup : seen).add(id)
  }
  const duplicates = [...dup]
  return Object.freeze({ duplicates: Object.freeze(duplicates), hasDuplicates: duplicates.length > 0 })
}

// ── store-backed coverage / missing (compose the citation gate) ───────────────────

/** Evidence coverage for one recommendation (via the citation gate). */
export async function recommendationEvidenceCoverage(recommendation, { store } = {}) {
  assertObject(recommendation); assertStore(store)
  const ids = Array.isArray(recommendation.evidence) ? recommendation.evidence : []
  if (!ids.every(isStr)) throw new RecommendationValidationError(REC_VALIDATION_ERROR.INVALID_INPUT, 'recommendation.evidence must be a string[]')
  if (ids.length === 0) return Object.freeze({ cited: 0, resolved: 0, missing: 0, coverage: 0 })
  const r = await validateEvidenceCitation(ids, { store, tenant: recommendation.tenant })
  return r.coverage
}

/** The missing (unresolved) evidence ids for one recommendation. */
export async function missingRecommendationEvidence(recommendation, { store } = {}) {
  assertObject(recommendation); assertStore(store)
  const ids = Array.isArray(recommendation.evidence) ? recommendation.evidence : []
  if (!ids.every(isStr)) throw new RecommendationValidationError(REC_VALIDATION_ERROR.INVALID_INPUT, 'recommendation.evidence must be a string[]')
  if (ids.length === 0) return Object.freeze([])
  const r = await validateEvidenceCitation(ids, { store, tenant: recommendation.tenant })
  return r.missing
}

// ── the gate ──────────────────────────────────────────────────────────────────────

/**
 * Validate one recommendation. Reports every failure reason; never throws for
 * field-level invalidity (only for structurally-unusable input).
 *
 * @returns {Promise<Readonly<{ valid:boolean, id:string|null, reasons:string[], confidence:object, citation:object|null, evidenceConfidence:object|null }>>}
 */
export async function validateRecommendation(recommendation, { store } = {}) {
  assertObject(recommendation); assertStore(store)
  const reasons = []

  const id = isStr(recommendation.id) ? recommendation.id : null
  if (!id) reasons.push(REC_REASON.INVALID_ID)

  const tenantValid = tenantOk(recommendation.tenant)
  if (!tenantValid) reasons.push(REC_REASON.INVALID_TENANT)

  const ids = recommendation.evidence
  const evidenceIsArray = Array.isArray(ids)
  const evidenceIsStrings = evidenceIsArray && ids.every(isStr)
  if (!evidenceIsArray || !evidenceIsStrings) reasons.push(REC_REASON.INVALID_EVIDENCE)
  else if (ids.length === 0) reasons.push(REC_REASON.EMPTY_EVIDENCE)

  const confidence = recommendationConfidenceStatus(recommendation.confidence)
  if (!confidence.valid) reasons.push(REC_REASON.INVALID_CONFIDENCE)

  // Citation gate — only runnable with a valid tenant + non-empty string[] evidence.
  let citation = null
  let evidenceConfidence = null
  if (tenantValid && evidenceIsStrings && ids.length > 0) {
    citation = await validateEvidenceCitation(ids, { store, tenant: recommendation.tenant })
    if (citation.missing.length) reasons.push(REC_REASON.MISSING_EVIDENCE)
    if (citation.duplicates.length) reasons.push(REC_REASON.DUPLICATE_EVIDENCE)
    if (citation.crossTenant.length) reasons.push(REC_REASON.CROSS_TENANT_EVIDENCE)
    if (citation.valid) {
      // informational cross-check: aggregate confidence the cited evidence supports
      evidenceConfidence = combineEvidenceConfidence(citation.resolved.map(r => ({ confidence: r.confidence, stance: 'agree' })))
    }
  }

  return Object.freeze({
    valid: reasons.length === 0,
    id,
    reasons: Object.freeze(reasons),
    confidence,
    citation,
    evidenceConfidence,
  })
}

/**
 * Validate a set of recommendations: each individually, plus duplicate-id detection
 * across the set (a duplicated id invalidates the offending recommendations + the set).
 *
 * @returns {Promise<Readonly<{ valid:boolean, results:object[], duplicateIds:string[] }>>}
 */
export async function validateRecommendationSet(recommendations, { store } = {}) {
  if (!Array.isArray(recommendations)) throw new RecommendationValidationError(REC_VALIDATION_ERROR.INVALID_INPUT, 'recommendations must be an array')
  assertStore(store)
  const dup = duplicateRecommendations(recommendations)
  const dupSet = new Set(dup.duplicates)

  const results = []
  for (const rec of recommendations) {                // sequential → deterministic
    const base = await validateRecommendation(rec, { store })
    if (base.id && dupSet.has(base.id)) {
      results.push(Object.freeze({
        ...base,
        valid: false,
        reasons: Object.freeze([...base.reasons, REC_REASON.DUPLICATE_RECOMMENDATION]),
      }))
    } else {
      results.push(base)
    }
  }

  return Object.freeze({
    valid: results.every(r => r.valid),
    results: Object.freeze(results),
    duplicateIds: dup.duplicates,
  })
}
