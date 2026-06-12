/**
 * AI Brain — Planning Rules (M14)
 *
 * Deterministic rules that govern which plans are created and what scope they use.
 *
 * Rule 1 — Policy gate:
 *   blocked      → no plan (null)
 *   needs_review → DRAFT plan (coach must approve before action)
 *   allowed      → ACTIVE plan
 *
 * Rule 2 — Scope resolution:
 *   Keywords in title/description/action take priority over category.
 *   Category is the fallback.
 *
 * No LLM, no randomness, no predictions.
 */

import { PLAN_STATUS, PLAN_SCOPE } from './planning-types.js'

// ── Rule 1: Policy gate ───────────────────────────────────────────────────────

/**
 * Map a policy status to a plan status (or null = no plan).
 *
 * @param {string} policyStatus  - 'allowed' | 'needs_review' | 'blocked'
 * @returns {'active'|'draft'|null}
 */
export function resolvePlanStatus(policyStatus) {
  if (policyStatus === 'blocked')      return null
  if (policyStatus === 'needs_review') return PLAN_STATUS.DRAFT
  return PLAN_STATUS.ACTIVE
}

// ── Rule 2: Scope resolution ──────────────────────────────────────────────────

function textContains(str, ...terms) {
  const lower = String(str ?? '').toLowerCase()
  return terms.some(t => lower.includes(t))
}

/**
 * Resolve the plan scope from a recommendation.
 * Keyword matches take priority over category.
 *
 * @param {object} rec
 * @returns {string}  - one of PLAN_SCOPE.*
 */
export function resolveScope(rec) {
  const text = [rec.title, rec.description, rec.action].join(' ')
  const cat  = rec.category ?? ''

  // Keyword priority — specific phrases first
  if (textContains(text, 'attendance'))
    return PLAN_SCOPE.ATTENDANCE

  if (textContains(text, 'load reduction', 'session load', 'load management', 'overload', 'training load'))
    return PLAN_SCOPE.LOAD

  if (textContains(text, 'match prep', 'match preparation', 'preparation checklist'))
    return PLAN_SCOPE.PREPARATION

  if (textContains(text, 'availability', 'available for'))
    return PLAN_SCOPE.AVAILABILITY

  // Category fallback
  if (cat === 'Medical' || cat === 'Player Welfare') return PLAN_SCOPE.WELFARE
  if (cat === 'Selection')                           return PLAN_SCOPE.SELECTION
  if (cat === 'Logistics')                           return PLAN_SCOPE.LOGISTICS
  if (cat === 'Club')                                return PLAN_SCOPE.CLUB
  if (cat === 'Training')                            return PLAN_SCOPE.LOAD

  return PLAN_SCOPE.PERFORMANCE
}
