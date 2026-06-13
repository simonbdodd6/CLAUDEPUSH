/**
 * Coach Products — Match Readiness Intelligence (M21)
 *
 * The coach-facing answer to one question: "Are we genuinely ready for this match?"
 *
 * Composes the CoachAI integration layer (M17) into a presentation-ready
 * readiness report: a weighted overall score, three component scores
 * (availability / fitness / cohesion), selection risk, training load,
 * key concerns, critical players, recommended actions, training focus,
 * a plain-language explanation, and (optionally) CoachProfile-driven emphasis.
 *
 * Dependency: ONLY the CoachAI integration layer + pure learning-type constants.
 * Never imports Brain internals (workflow/memory/api/products/policy/planning/…).
 * Never modifies Coach's Eye Core. No LLM. Fully deterministic.
 *
 * Usage:
 *   import { getMatchReadiness } from 'coach-products/match-readiness/index.js'
 *   const r = await getMatchReadiness({ user, team, fixtureId, generatedAt })
 *   if (r.available) renderReadiness(r); else renderUpgradePrompt(r.reason)
 *
 * Context shape:
 *   {
 *     user:        { coachId?, clubId?, tier, flags? }  — required
 *     team:        { teamId }                           — required for a real report
 *     fixtureId:   string                               — optional, echoed back
 *     generatedAt: ISO string                           — optional, caller stamps
 *   }
 */

import CoachAI from '../../ai-brain/integration/index.js'
import { REASON } from '../../ai-brain/integration/integration-types.js'
import {
  MR_ID, MR_VERSION, MATCH_READINESS_FLAG, PERSONALISATION_FLAG,
  SELECTION_RISK, LOAD_STATUS, SEVERITY, VERDICT,
  LOAD_TARGET_MINUTES_PER_ACTION, LOAD_ON_TRACK_THRESHOLD, LOAD_BEHIND_THRESHOLD,
  NEUTRAL_BASELINE, WEIGHT, VERDICT_READY_THRESHOLD, VERDICT_RISK_THRESHOLD,
  INJURY_FITNESS_PENALTY, MAX_INJURY_FITNESS_PENALTY,
  MISSING_COHESION_PENALTY, MAX_MISSING_COHESION_PENALTY,
  MAX_KEY_CONCERNS, MAX_CRITICAL_PLAYERS, MAX_RECOMMENDED_ACTIONS, MAX_TRAINING_FOCUS,
  MIN_PROFILE_OBSERVATIONS,
} from './match-readiness-types.js'
import { personalise, emptyPersonalisation } from './personaliser.js'

// ── Small pure helpers ────────────────────────────────────────────────────────

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))
const round = (n) => Math.round(n)
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const DONE_STATES = new Set(['done', 'complete', 'completed'])
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 }

function isFlagEnabled(flagName, flags = {}) {
  if (!flags || !(flagName in flags)) return true
  return Boolean(flags[flagName])
}

function sortBySeverity(arr) {
  return arr
    .map((item, i) => ({ item, i }))
    .sort((a, b) =>
      (SEVERITY_RANK[a.item.severity ?? 'low'] - SEVERITY_RANK[b.item.severity ?? 'low']) || (a.i - b.i))
    .map(x => x.item)
}

function sortByPriority(arr) {
  return arr
    .map((item, i) => ({ item, i }))
    .sort((a, b) =>
      (SEVERITY_RANK[a.item.priority ?? 'low'] - SEVERITY_RANK[b.item.priority ?? 'low']) || (a.i - b.i))
    .map(x => x.item)
}

// ── Component scores ──────────────────────────────────────────────────────────

function computeAvailabilityScore(read) {
  return isNum(read?.availabilityPct) ? clamp(round(read.availabilityPct)) : null
}

function computeFitnessScore(read) {
  const tc = read?.trainingCompletion
  const injuries = read?.injuryConcerns ?? []
  let trainingPct = null
  if (tc && tc.total > 0) {
    trainingPct = clamp(round((tc.estimatedMinutes / (tc.total * LOAD_TARGET_MINUTES_PER_ACTION)) * 100))
  }
  const squad = isNum(read?.squadReadinessPct) ? read.squadReadinessPct : null
  let base = trainingPct ?? squad
  if (base == null && injuries.length === 0) return null   // no signal at all
  if (base == null) base = NEUTRAL_BASELINE                // partial signal → neutral
  const penalty = Math.min(MAX_INJURY_FITNESS_PENALTY, injuries.length * INJURY_FITNESS_PENALTY)
  return clamp(round(base - penalty))
}

function computeCohesionScore(read) {
  const prep    = read?.preparationChecklist ?? []
  const missing = read?.missingActions ?? []
  const squad   = isNum(read?.squadReadinessPct) ? read.squadReadinessPct : null
  const prepTotal = prep.length
  const prepDone  = prep.filter(p => DONE_STATES.has(String(p.status ?? '').toLowerCase())).length
  const prepPct   = prepTotal > 0 ? round((prepDone / prepTotal) * 100) : null
  const signals = [squad, prepPct].filter(isNum)
  if (signals.length === 0) return null
  const base = signals.reduce((a, b) => a + b, 0) / signals.length
  const penalty = Math.min(MAX_MISSING_COHESION_PENALTY, missing.length * MISSING_COHESION_PENALTY)
  return clamp(round(base - penalty))
}

function computeTrainingLoadStatus(read) {
  const tc = read?.trainingCompletion
  if (!tc || !tc.total) return LOAD_STATUS.UNKNOWN
  const pct = Math.min(100, round((tc.estimatedMinutes / (tc.total * LOAD_TARGET_MINUTES_PER_ACTION)) * 100))
  if (pct >= LOAD_ON_TRACK_THRESHOLD) return LOAD_STATUS.ON_TRACK
  if (pct >= LOAD_BEHIND_THRESHOLD)   return LOAD_STATUS.BEHIND
  return LOAD_STATUS.AT_RISK
}

function computeOverall(av, fit, coh) {
  const parts = [[av, WEIGHT.AVAILABILITY], [fit, WEIGHT.FITNESS], [coh, WEIGHT.COHESION]]
    .filter(([v]) => v != null)
  if (!parts.length) return null
  const wsum  = parts.reduce((s, [, w]) => s + w, 0)
  const total = parts.reduce((s, [v, w]) => s + v * w, 0)
  return clamp(round(total / wsum))
}

function computeSelectionRisk(availabilityScore, read) {
  const injuries = read?.injuryConcerns ?? []
  const missing  = read?.missingActions ?? []
  const overdue  = missing.filter(m => m.overdue).length
  if (availabilityScore == null && injuries.length === 0 && missing.length === 0) {
    return SELECTION_RISK.UNKNOWN
  }
  let pts = 0
  if (availabilityScore != null) {
    if (availabilityScore < 60) pts += 2
    else if (availabilityScore < 80) pts += 1
  }
  pts += Math.min(3, injuries.length)
  pts += Math.min(2, overdue)
  if (pts >= 4) return SELECTION_RISK.HIGH
  if (pts >= 2) return SELECTION_RISK.MEDIUM
  return SELECTION_RISK.LOW
}

function computeConfidence(read, knownComponents) {
  const coverage = knownComponents / 3
  const brain = isNum(read?.confidence) ? clamp(read.confidence, 0, 100) / 100 : null
  const c = brain != null ? (brain * 0.6 + coverage * 0.4) : (coverage * 0.7)
  return Math.round(c * 100) / 100
}

function computeVerdict(overallScore) {
  if (overallScore == null) return VERDICT.INSUFFICIENT_DATA
  if (overallScore >= VERDICT_READY_THRESHOLD) return VERDICT.READY
  if (overallScore >= VERDICT_RISK_THRESHOLD)  return VERDICT.READY_WITH_RISKS
  return VERDICT.NOT_READY
}

// ── List builders ─────────────────────────────────────────────────────────────

function buildKeyConcerns(read, dash, scores) {
  const out = []
  const push = (type, severity, summary, source, evidenceId = null) => {
    if (summary) out.push({ type, severity, summary, source, evidenceId })
  }

  if (scores.availabilityScore != null && scores.availabilityScore < 70) {
    push('availability', scores.availabilityScore < 55 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
      `Squad availability at ${scores.availabilityScore}%`, 'readiness')
  }
  for (const c of (read?.injuryConcerns ?? [])) {
    push('injury', SEVERITY.HIGH, c.summary ?? 'Injury concern', c.source ?? 'readiness', c.recommendationId ?? null)
  }
  if (scores.cohesionScore != null && scores.cohesionScore < 65) {
    push('cohesion', scores.cohesionScore < 50 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
      `Squad cohesion still developing (${scores.cohesionScore}%)`, 'readiness')
  }
  if (scores.trainingLoadStatus === LOAD_STATUS.AT_RISK) {
    push('training_load', SEVERITY.HIGH, 'Training load significantly behind for match week', 'readiness')
  } else if (scores.trainingLoadStatus === LOAD_STATUS.BEHIND) {
    push('training_load', SEVERITY.MEDIUM, 'Training load behind schedule', 'readiness')
  }
  for (const m of (read?.missingActions ?? []).filter(m => m.overdue).slice(0, 2)) {
    push('preparation', SEVERITY.MEDIUM, `Overdue: ${m.title ?? 'preparation action'}`, 'planning', m.recommendationId ?? null)
  }
  for (const r of (dash?.biggestRisks ?? [])) {
    push('risk', r.riskLevel === 'high' ? SEVERITY.HIGH : SEVERITY.MEDIUM,
      r.title ?? r.description ?? '', 'dashboard')
  }
  return sortBySeverity(out).slice(0, MAX_KEY_CONCERNS)
}

function buildCriticalPlayers(read, dash) {
  const out = []
  const seen = new Set()
  const add = (reason, severity, source, suggestedAction = null) => {
    if (!reason || seen.has(reason)) return
    seen.add(reason)
    out.push({ playerId: null, reason, severity, source, suggestedAction })
  }
  for (const c of (read?.injuryConcerns ?? [])) {
    add(c.summary, SEVERITY.HIGH, c.source ?? 'readiness', 'Confirm fitness before selection')
  }
  for (const c of (dash?.medicalSummary?.concerns ?? [])) {
    const t = typeof c === 'string' ? c : (c?.text ?? c?.description ?? '')
    add(t, SEVERITY.HIGH, 'medical', 'Review player welfare')
  }
  const WELFARE = new Set(['welfare', 'medical', 'Medical', 'Player Welfare'])
  for (const p of (dash?.topPriorities ?? [])) {
    if (WELFARE.has(p.category)) add(p.title, p.urgency === 'high' ? SEVERITY.HIGH : SEVERITY.MEDIUM, 'priority', p.action ?? null)
  }
  return out.slice(0, MAX_CRITICAL_PLAYERS)
}

function buildRecommendedActions(read, dash, scores) {
  const items = []
  for (const m of (read?.missingActions ?? [])) {
    items.push({
      action: m.title ?? 'Complete preparation action',
      priority: m.overdue ? SEVERITY.HIGH : SEVERITY.MEDIUM,
      category: 'preparation', source: 'planning',
      evidenceId: m.recommendationId ?? null, suggestedDate: m.suggestedDate ?? null, done: false,
    })
  }
  if (scores.selectionRisk === SELECTION_RISK.HIGH ||
      (scores.availabilityScore != null && scores.availabilityScore < 60)) {
    items.push({ action: 'Identify cover for unavailable players', priority: SEVERITY.HIGH,
      category: 'selection', source: 'derived', evidenceId: null, suggestedDate: null, done: false })
  }
  if (scores.trainingLoadStatus === LOAD_STATUS.AT_RISK || scores.trainingLoadStatus === LOAD_STATUS.BEHIND) {
    items.push({ action: 'Add a focused session to close the training gap',
      priority: scores.trainingLoadStatus === LOAD_STATUS.AT_RISK ? SEVERITY.HIGH : SEVERITY.MEDIUM,
      category: 'training', source: 'derived', evidenceId: null, suggestedDate: null, done: false })
  }
  if (scores.cohesionScore != null && scores.cohesionScore < 65) {
    items.push({ action: 'Rehearse team shape and set pieces', priority: SEVERITY.MEDIUM,
      category: 'cohesion', source: 'derived', evidenceId: null, suggestedDate: null, done: false })
  }
  for (const a of (dash?.recommendedActions ?? [])) {
    items.push({ action: a.action ?? '', priority: a.priority ?? SEVERITY.MEDIUM,
      category: a.category ?? 'general', source: 'dashboard',
      evidenceId: a.evidenceId ?? null, suggestedDate: null, done: a.done ?? false })
  }
  const seen = new Set()
  const dedup = items.filter(i => {
    if (!i.action || seen.has(i.action)) return false
    seen.add(i.action)
    return true
  })
  return sortByPriority(dedup).slice(0, MAX_RECOMMENDED_ACTIONS).map((i, idx) => ({ rank: idx + 1, ...i }))
}

function buildTrainingFocus(read, scores) {
  const out = []
  if (scores.trainingLoadStatus === LOAD_STATUS.AT_RISK || scores.trainingLoadStatus === LOAD_STATUS.BEHIND) {
    out.push({ focus: 'Physical conditioning', reason: 'Training load is behind schedule for match week',
      priority: scores.trainingLoadStatus === LOAD_STATUS.AT_RISK ? SEVERITY.HIGH : SEVERITY.MEDIUM, emphasis: 'physical' })
  }
  if (scores.cohesionScore != null && scores.cohesionScore < 70) {
    out.push({ focus: 'Team shape & set pieces', reason: 'Squad cohesion still developing',
      priority: SEVERITY.MEDIUM, emphasis: 'tactical' })
  }
  if ((read?.injuryConcerns ?? []).length) {
    out.push({ focus: 'Return-to-play & cover drills', reason: 'Injury concerns in the squad',
      priority: SEVERITY.MEDIUM, emphasis: 'physical' })
  }
  if (scores.availabilityScore != null && scores.availabilityScore < 80) {
    out.push({ focus: 'Squad depth & rotation', reason: 'Availability is limited this week',
      priority: SEVERITY.MEDIUM, emphasis: 'tactical' })
  }
  out.push({ focus: 'Match scenario rehearsal', reason: 'Sharpen decision-making before kickoff',
    priority: SEVERITY.LOW, emphasis: 'technical' })
  return out.slice(0, MAX_TRAINING_FOCUS)
}

function buildEvidenceIds(read, dash, keyConcerns) {
  const ids = new Set()
  for (const id of (read?.explanationIds ?? [])) if (id) ids.add(id)
  for (const id of (dash?.explanationIds ?? [])) if (id) ids.add(id)
  for (const c of keyConcerns) if (c.evidenceId) ids.add(c.evidenceId)
  for (const m of (read?.missingActions ?? [])) if (m.recommendationId) ids.add(m.recommendationId)
  for (const c of (read?.injuryConcerns ?? [])) if (c.recommendationId) ids.add(c.recommendationId)
  return [...ids]
}

function buildExplanation(scores, verdict, read, confidence) {
  if (verdict === VERDICT.INSUFFICIENT_DATA) {
    return 'Not enough data to assess match readiness yet.'
  }
  const parts = []
  const verdictText = {
    [VERDICT.READY]:            'Squad looks ready for this match',
    [VERDICT.READY_WITH_RISKS]: 'Squad is broadly ready, with risks to manage',
    [VERDICT.NOT_READY]:        'Squad is not yet ready for this match',
  }[verdict]
  parts.push(`${verdictText} (overall ${scores.overallScore}%)`)

  if (scores.availabilityScore != null) {
    parts.push(scores.availabilityScore >= 80 ? 'availability is strong'
      : scores.availabilityScore >= 60 ? 'availability is workable'
      : 'availability is limited')
  }
  const injuries = read?.injuryConcerns ?? []
  if (injuries.length) parts.push(`${injuries.length} injury concern${injuries.length === 1 ? '' : 's'} to clear`)

  if (scores.trainingLoadStatus === LOAD_STATUS.ON_TRACK) parts.push('training is on track')
  else if (scores.trainingLoadStatus === LOAD_STATUS.BEHIND) parts.push('training is slightly behind')
  else if (scores.trainingLoadStatus === LOAD_STATUS.AT_RISK) parts.push('training is well behind')

  if (scores.cohesionScore != null) {
    parts.push(scores.cohesionScore >= 70 ? 'cohesion is solid' : 'cohesion is still building')
  }
  parts.push(`selection risk is ${scores.selectionRisk}`)
  return parts.join('; ') + `. Confidence ${Math.round(confidence * 100)}%.`
}

// ── Assemblers ────────────────────────────────────────────────────────────────

function buildReadiness(caps, readinessRes, dashboardRes, opts = {}) {
  const read = readinessRes?.data ?? null
  const dash = dashboardRes?.data ?? null
  const ok   = readinessRes?.ok === true
  const isMock = !ok || Boolean(read?.isMock)

  const availabilityScore = computeAvailabilityScore(read)
  const fitnessScore      = computeFitnessScore(read)
  const cohesionScore     = computeCohesionScore(read)
  const trainingLoadStatus = computeTrainingLoadStatus(read)
  const overallScore      = computeOverall(availabilityScore, fitnessScore, cohesionScore)
  const selectionRisk     = computeSelectionRisk(availabilityScore, read)
  const knownComponents   = [availabilityScore, fitnessScore, cohesionScore].filter(v => v != null).length
  const confidence        = computeConfidence(read, knownComponents)
  const verdict           = computeVerdict(overallScore)

  const scores = { availabilityScore, fitnessScore, cohesionScore, trainingLoadStatus, selectionRisk, overallScore }

  const keyConcerns        = buildKeyConcerns(read, dash, scores)
  const criticalPlayers    = buildCriticalPlayers(read, dash)
  const recommendedActions = buildRecommendedActions(read, dash, scores)
  const trainingFocus      = buildTrainingFocus(read, scores)
  const evidenceIds        = buildEvidenceIds(read, dash, keyConcerns)
  const explanation        = buildExplanation(scores, verdict, read, confidence)

  return {
    productId:      MR_ID,
    productVersion: MR_VERSION,
    ok,
    available:      true,
    tier:           caps.tier,
    teamId:         opts.teamId ?? read?.teamId ?? null,
    fixtureId:      opts.fixtureId ?? null,
    generatedAt:    opts.generatedAt ?? null,
    isMock,

    overallScore,
    confidence,
    availabilityScore,
    fitnessScore,
    cohesionScore,
    selectionRisk,
    trainingLoadStatus,
    verdict,

    keyConcerns,
    criticalPlayers,
    recommendedActions,
    trainingFocus,

    evidenceIds,
    explanation,
    personalisation: emptyPersonalisation(),

    reason:      null,
    limitations: caps.limitations ?? [],
  }
}

function buildUnavailable(caps, reason, teamId = null, fixtureId = null, available = false) {
  return {
    productId:      MR_ID,
    productVersion: MR_VERSION,
    ok:             false,
    available,
    tier:           caps?.tier ?? 'free',
    teamId,
    fixtureId,
    generatedAt:    null,
    isMock:         true,

    overallScore:       null,
    confidence:         0,
    availabilityScore:  null,
    fitnessScore:       null,
    cohesionScore:      null,
    selectionRisk:      SELECTION_RISK.UNKNOWN,
    trainingLoadStatus: LOAD_STATUS.UNKNOWN,
    verdict:            VERDICT.INSUFFICIENT_DATA,

    keyConcerns:        [],
    criticalPlayers:    [],
    recommendedActions: [],
    trainingFocus:      [],

    evidenceIds:     [],
    explanation:     'Match readiness is not available.',
    personalisation: emptyPersonalisation(),

    reason,
    limitations: caps?.limitations ?? [],
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Produce the Match Readiness report for a team's upcoming fixture.
 *
 * @param {object} context
 * @param {object}  context.user         - { coachId?, clubId?, tier, flags? }
 * @param {object}  [context.team]       - { teamId } — required for a real report
 * @param {string}  [context.fixtureId]  - echoed back into the response
 * @param {string}  [context.generatedAt]- ISO timestamp — caller stamps for determinism
 * @param {object}  [_coachAI]           - optional CoachAI override (for testing)
 * @returns {Promise<MatchReadinessResponse>}
 */
export async function getMatchReadiness(context = {}, _coachAI = CoachAI) {
  const { user = {}, team = null, fixtureId = null, generatedAt = null } = context ?? {}
  try {
    const caps = await _coachAI.getCapabilities(user)

    // Product-level feature flag (absent = enabled)
    if (!isFlagEnabled(MATCH_READINESS_FLAG, user?.flags)) {
      return buildUnavailable(caps, REASON.FEATURE_DISABLED, team?.teamId ?? null, fixtureId)
    }

    // Subscription gate
    if (!caps.isEnabled || !caps.features?.matchReadiness) {
      return buildUnavailable(caps, caps.reason ?? REASON.INSUFFICIENT_TIER, team?.teamId ?? null, fixtureId)
    }

    // Missing required input — safe, available (tier permits), empty
    const teamId = team?.teamId ?? null
    if (!teamId) {
      return buildUnavailable(caps, REASON.INVALID_INPUT, null, fixtureId, true)
    }

    const readinessRes = await _coachAI.getMatchReadiness({ teamId, tier: user.tier, flags: user.flags })
    const dashboardRes = await _coachAI.getDashboard(user)

    let report = buildReadiness(caps, readinessRes, dashboardRes, { teamId, fixtureId, generatedAt })

    // Personalisation — read-only CoachProfile, emphasis only, non-blocking
    if (isFlagEnabled(PERSONALISATION_FLAG, user?.flags)) {
      try {
        const coachId = user?.coachId ?? user?.userId ?? null
        if (coachId && typeof _coachAI.getProfile === 'function') {
          const profileRes = await _coachAI.getProfile(user)
          const profile = profileRes?.ok && profileRes?.data
            && (profileRes.data.observationCount ?? 0) >= MIN_PROFILE_OBSERVATIONS
            ? profileRes.data
            : null
          if (profile) {
            const { data, personalisation } = personalise(report, profile, { flags: user?.flags })
            report = { ...data, personalisation }
          }
        }
      } catch {
        // personalisation is always non-blocking — report returned as-is
      }
    }

    return report
  } catch {
    return buildUnavailable(
      { tier: 'free', limitations: [] },
      REASON.BRAIN_UNAVAILABLE,
      context?.team?.teamId ?? null,
      context?.fixtureId ?? null,
      true,
    )
  }
}
