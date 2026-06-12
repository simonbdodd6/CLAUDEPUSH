/**
 * AI Brain — Planning Engine (M14)
 *
 * Converts approved recommendations into structured, coach-actionable plans.
 * All output is deterministic: same rec + same date → same plan.
 *
 * Public API:
 *   createPlan(rec, context?)   → Plan | null
 *   createPlans(recs, context?) → Plan[]
 *
 * No LLM calls. No randomness. No automatic execution.
 */

import { randomUUID }                    from 'node:crypto'
import { PLAN_SCHEMA_VERSION, ACTION_STATUS } from './planning-types.js'
import { resolvePlanStatus, resolveScope }    from './planning-rules.js'
import { getTemplate }                        from './planning-library.js'

// ── Date helpers ──────────────────────────────────────────────────────────────

/**
 * Add `days` calendar days to `baseDate` and return a YYYY-MM-DD string.
 * baseDate may be a Date or an ISO string; days must be a non-negative integer.
 */
function addDays(baseDate, days) {
  const d = new Date(baseDate)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Action builder ────────────────────────────────────────────────────────────

function buildActions(template, baseDate) {
  return template.actions.map(a => ({
    actionId:         randomUUID(),
    title:            a.title,
    description:      a.description,
    owner:            'coach',
    suggestedDate:    addDays(baseDate, a.dayOffset),
    estimatedMinutes: a.estimatedMinutes,
    status:           ACTION_STATUS.PENDING,
  }))
}

// ── Checkpoint builder ────────────────────────────────────────────────────────

function buildCheckpoints(template, baseDate) {
  return template.checkpoints.map(c => ({
    label:       c.label,
    targetDate:  addDays(baseDate, c.dayOffset),
    description: c.description,
  }))
}

// ── Policy gate ───────────────────────────────────────────────────────────────

function getPolicyStatus(rec) {
  if (rec.policy?.status) return rec.policy.status
  return 'allowed'
}

// ── Core factory ─────────────────────────────────────────────────────────────

/**
 * Create a single Plan from a recommendation.
 *
 * @param {object} rec      - BrainRecommendation (must have at minimum: id, title)
 * @param {object} context  - { coachId?, clubId? }
 * @returns {object|null}   - Plan | null when blocked
 */
export function createPlan(rec, context = {}) {
  const policyStatus = getPolicyStatus(rec)
  const planStatus   = resolvePlanStatus(policyStatus)

  if (planStatus === null) return null

  const scope    = resolveScope(rec)
  const template = getTemplate(scope)
  const baseDate = new Date().toISOString()

  return {
    planId:            randomUUID(),
    schemaVersion:     PLAN_SCHEMA_VERSION,
    recommendationId:  rec.id,
    status:            planStatus,
    scope,
    goal:              template.goalTemplate(rec),
    priority:          rec.priority   ?? null,
    confidence:        rec.confidence ?? null,
    category:          rec.category   ?? null,
    estimatedDuration: `${template.estimatedDurationDays} days`,
    reviewDate:        addDays(baseDate, template.estimatedDurationDays),
    actions:           buildActions(template, baseDate),
    checkpoints:       buildCheckpoints(template, baseDate),
    evidence:          Array.isArray(rec.evidence) ? [...rec.evidence] : [],
    createdAt:         baseDate,
    context: {
      coachId: context.coachId ?? null,
      clubId:  context.clubId  ?? null,
    },
  }
}

/**
 * Create plans for an array of recommendations, skipping blocked ones.
 *
 * @param {object[]} recs   - array of BrainRecommendation
 * @param {object}   context
 * @returns {object[]}      - Plan[] (never contains null entries)
 */
export function createPlans(recs = [], context = {}) {
  return recs
    .map(rec => createPlan(rec, context))
    .filter(plan => plan !== null)
}
