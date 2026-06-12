/**
 * AI Brain — Policy Engine (M12)
 *
 * Applies all 8 safety rules to a recommendation or a full BrainResponse.
 * Runs deterministically — no LLM calls, no network, no randomness.
 *
 * Guarantees:
 *  - Recommendations are NEVER deleted (all pass through)
 *  - Evidence and confidence are NEVER modified
 *  - Each recommendation receives a `policy` field with full audit trail
 *  - The highest-severity rule determines each recommendation's status
 *  - `overallStatus` reflects the worst-case across all recommendations
 *
 * Severity order: allowed < needs_review < blocked
 */

import { POLICY_STATUS, POLICY_SCHEMA_VERSION, STATUS_RANK } from './policy-types.js'
import { RULES } from './policy-rules.js'

// ── Internal helpers ──────────────────────────────────────────────────────────

function higherStatus(a, b) {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b
}

// ── Public: single recommendation ────────────────────────────────────────────

/**
 * Apply all policy rules to one recommendation.
 * Returns a shallow copy of the rec with a `policy` field added.
 * Never mutates the original.
 *
 * @param {object} rec      - recommendation from AI.request()
 * @param {object} context  - { coachId?, clubId? } — used for cross-club rule
 * @returns {object}        - rec copy with rec.policy attached
 */
export function checkRecommendation(rec, context = {}) {
  if (rec == null || typeof rec !== 'object') {
    return rec
  }

  const results   = RULES.map(rule => rule(rec, context))
  const triggered = results.filter(r => r.triggered)

  const status = triggered.reduce(
    (worst, r) => higherStatus(worst, r.status),
    POLICY_STATUS.ALLOWED
  )

  const warnings = triggered.map(r => r.warning).filter(Boolean)

  const reasons = triggered
    .filter(r => r.reason)
    .map(r => ({ ruleId: r.ruleId, status: r.status, reason: r.reason }))

  const ruleAudit = results.map(r => ({
    ruleId:    r.ruleId,
    triggered: r.triggered,
    status:    r.status,
    reason:    r.reason ?? null,
  }))

  return {
    ...rec,
    policy: {
      status,
      blocked:        status === POLICY_STATUS.BLOCKED,
      requiresReview: status === POLICY_STATUS.NEEDS_REVIEW,
      rules:          ruleAudit,
      warnings,
      reasons,
    },
  }
}

// ── Public: full BrainResponse or recommendation array ────────────────────────

/**
 * Apply policy to an entire BrainResponse (or a raw recommendation array).
 *
 * Accepts either:
 *  - a BrainResponse object (from AI.request())
 *  - a plain array of recommendations
 *
 * Returns a PolicyCheckResult — a new object; the input is never modified.
 * All recommendations are preserved regardless of policy status.
 *
 * @param {object|object[]} responseOrRecs - BrainResponse or rec array
 * @param {object}          context        - { coachId?, clubId? }
 * @returns {PolicyCheckResult}
 */
export function checkPolicy(responseOrRecs, context = {}) {
  const recs = Array.isArray(responseOrRecs)
    ? responseOrRecs
    : Array.isArray(responseOrRecs?.recommendations)
    ? responseOrRecs.recommendations
    : []

  const checked = recs.map(rec => checkRecommendation(rec, context))

  const summary = {
    total:       checked.length,
    allowed:     checked.filter(r => r.policy?.status === POLICY_STATUS.ALLOWED).length,
    needsReview: checked.filter(r => r.policy?.status === POLICY_STATUS.NEEDS_REVIEW).length,
    blocked:     checked.filter(r => r.policy?.status === POLICY_STATUS.BLOCKED).length,
  }

  const overallStatus = checked.reduce(
    (worst, r) => higherStatus(worst, r.policy?.status ?? POLICY_STATUS.ALLOWED),
    POLICY_STATUS.ALLOWED
  )

  return {
    policySchemaVersion: POLICY_SCHEMA_VERSION,
    checkedAt:           new Date().toISOString(),
    overallStatus,
    recommendations:     checked,
    summary,
  }
}
