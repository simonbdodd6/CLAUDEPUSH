/**
 * AI Brain — Policy Rules (M12)
 *
 * Eight deterministic, stateless safety rules.
 * Each rule function:
 *   - receives a recommendation object and an optional context
 *   - returns { ruleId, triggered, status, reason, warning? }
 *   - never modifies the recommendation
 *   - never throws (pure logic only)
 *
 * Rules:
 *  1. SELECTION_CHANGE  — player selection changes need coach review
 *  2. AUTO_MESSAGING    — automatic player messaging is blocked
 *  3. MEDICAL_ACTION    — medical/welfare recs need qualified review
 *  4. DISCIPLINE_ACTION — discipline/punishment recs need coach review
 *  5. PRIVATE_DATA      — recs citing private/medical evidence need review
 *  6. CROSS_CLUB_DATA   — evidence from another club is blocked
 *  7. MISSING_EVIDENCE  — recs with no evidence need review
 *  8. HIGH_IMPACT       — HIGH priority recs are coach-review-first
 */

import { POLICY_STATUS, RULE_ID } from './policy-types.js'

const { ALLOWED, NEEDS_REVIEW, BLOCKED } = POLICY_STATUS

// ── Helpers ───────────────────────────────────────────────────────────────────

function textContains(str, ...terms) {
  if (!str || typeof str !== 'string') return false
  const lower = str.toLowerCase()
  return terms.some(t => lower.includes(t.toLowerCase()))
}

function recText(rec, ...fields) {
  return fields.map(f => rec[f] ?? '').join(' ')
}

// ── Rule 1: No automatic player selection changes ─────────────────────────────

export function checkSelectionChange(rec) {
  const triggered = rec.category === 'Selection'
  return {
    ruleId:    RULE_ID.SELECTION_CHANGE,
    triggered,
    status:    triggered ? NEEDS_REVIEW : ALLOWED,
    reason:    triggered
      ? 'Player selection changes must be reviewed by the coach before any action is taken'
      : null,
  }
}

// ── Rule 2: No automatic messages sent to players ─────────────────────────────

const MESSAGING_PATTERNS = [
  'send message', 'message player', 'notify player', 'alert player',
  'send notification', 'auto-message', 'automated message', 'message the player',
  'message all players', 'send to player',
]

export function checkAutoMessaging(rec) {
  const triggered =
    textContains(recText(rec, 'action', 'title'), ...MESSAGING_PATTERNS) ||
    rec.category === 'Messaging' ||
    textContains(rec.source ?? '', 'auto-message', 'messenger', 'messaging')
  return {
    ruleId:    RULE_ID.AUTO_MESSAGING,
    triggered,
    status:    triggered ? BLOCKED : ALLOWED,
    reason:    triggered
      ? 'Automatic messaging to players is not permitted — coach must review and explicitly approve any communication'
      : null,
  }
}

// ── Rule 3: No automatic medical recommendations ──────────────────────────────

export function checkMedicalAction(rec) {
  const triggered = rec.category === 'Medical' || rec.category === 'Player Welfare'
  return {
    ruleId:    RULE_ID.MEDICAL_ACTION,
    triggered,
    status:    triggered ? NEEDS_REVIEW : ALLOWED,
    reason:    triggered
      ? 'Medical and player welfare recommendations must be reviewed by qualified staff before any action'
      : null,
  }
}

// ── Rule 4: No automatic punishment/discipline recommendations ────────────────

const DISCIPLINE_PATTERNS = [
  'disciplin', 'punish', 'fine ', 'suspend', 'sanction',
  'bench player', 'drop player', 'deselect player',
]

export function checkDisciplineAction(rec) {
  const text      = recText(rec, 'title', 'description', 'action', 'category')
  const triggered = textContains(text, ...DISCIPLINE_PATTERNS)
  return {
    ruleId:    RULE_ID.DISCIPLINE_ACTION,
    triggered,
    status:    triggered ? NEEDS_REVIEW : ALLOWED,
    reason:    triggered
      ? 'Discipline or punishment recommendations require explicit coach review before any action is taken'
      : null,
  }
}

// ── Rule 5: No exposing private player data unnecessarily ─────────────────────

const PRIVATE_DATA_TYPES = ['health_record', 'medical_record', 'personal_data', 'private']

export function checkPrivateData(rec) {
  const evidence  = Array.isArray(rec.evidence) ? rec.evidence : []
  const triggered = evidence.some(e =>
    textContains(e.type   ?? '', ...PRIVATE_DATA_TYPES) ||
    textContains(e.source ?? '', ...PRIVATE_DATA_TYPES)
  )
  return {
    ruleId:    RULE_ID.PRIVATE_DATA,
    triggered,
    status:    triggered ? NEEDS_REVIEW : ALLOWED,
    reason:    triggered
      ? 'Recommendation cites data classified as private or medical — confirm disclosure is necessary and appropriate'
      : null,
    warning:   triggered
      ? 'Private player data is referenced in the evidence; coach must verify disclosure is appropriate before acting'
      : null,
  }
}

// ── Rule 6: No cross-club data leakage ───────────────────────────────────────

export function checkCrossClubData(rec, context = {}) {
  const contextClubId = context.clubId ?? null
  if (!contextClubId) {
    return { ruleId: RULE_ID.CROSS_CLUB_DATA, triggered: false, status: ALLOWED, reason: null }
  }
  const evidence  = Array.isArray(rec.evidence) ? rec.evidence : []
  const triggered = evidence.some(e => {
    const evClub = e.clubId ?? e.metadata?.clubId ?? null
    return evClub != null && evClub !== contextClubId
  })
  return {
    ruleId:    RULE_ID.CROSS_CLUB_DATA,
    triggered,
    status:    triggered ? BLOCKED : ALLOWED,
    reason:    triggered
      ? 'Recommendation evidence contains data from a different club — cross-club data exposure is not permitted'
      : null,
  }
}

// ── Rule 7: No recommendation without evidence ────────────────────────────────

export function checkMissingEvidence(rec) {
  const evidence  = Array.isArray(rec.evidence) ? rec.evidence : []
  const triggered = evidence.length === 0
  return {
    ruleId:    RULE_ID.MISSING_EVIDENCE,
    triggered,
    status:    triggered ? NEEDS_REVIEW : ALLOWED,
    reason:    triggered
      ? 'Recommendation has no supporting evidence — coach should verify the basis before acting'
      : null,
  }
}

// ── Rule 8: High-impact recommendations must be coach-review-first ─────────────

export function checkHighImpact(rec) {
  const triggered = rec.priority === 'HIGH'
  return {
    ruleId:    RULE_ID.HIGH_IMPACT,
    triggered,
    status:    triggered ? NEEDS_REVIEW : ALLOWED,
    reason:    triggered
      ? 'High-priority recommendations require coach review before any automated action is taken'
      : null,
  }
}

// ── Rule registry (ordered for deterministic output) ─────────────────────────

export const RULES = [
  checkSelectionChange,
  checkAutoMessaging,
  checkMedicalAction,
  checkDisciplineAction,
  checkPrivateData,
  checkCrossClubData,
  checkMissingEvidence,
  checkHighImpact,
]
