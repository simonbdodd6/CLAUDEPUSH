/**
 * Coach Products — Weekly Brief (M18)
 *
 * The first complete Coach Intelligence product.
 * When a coach opens Coach's Eye on Monday morning, this tells them
 * exactly what deserves attention this week.
 *
 * Dependency: ONLY the CoachAI integration layer (M17).
 * Never imports from ai-brain internals directly.
 *
 * Usage:
 *   import { getWeeklyBrief } from 'coach-products/weekly-brief/index.js'
 *   const brief = await getWeeklyBrief({ user, team, date })
 *   if (brief.available) renderDashboard(brief)
 *   else renderUpgradePrompt(brief.reason, brief.limitations)
 *
 * Context shape:
 *   {
 *     user:         { coachId?, clubId?, tier, flags? }  — required
 *     team:         { teamId, tier?, flags? }            — optional, enables match readiness
 *     date:         'YYYY-MM-DD'                         — optional, determines weekOf
 *     generatedAt:  'ISO string'                         — optional, stamped by caller for determinism
 *   }
 */

import CoachAI from '../../ai-brain/integration/index.js'
import { REASON } from '../../ai-brain/integration/integration-types.js'
import {
  BRIEF_ID, BRIEF_VERSION, URGENCY, LOAD_STATUS,
  LOAD_TARGET_MINUTES_PER_ACTION, LOAD_ON_TRACK_THRESHOLD, LOAD_BEHIND_THRESHOLD,
} from './weekly-brief-types.js'

// ── Date helpers ──────────────────────────────────────────────────────────────

/**
 * Return the Monday of the ISO week containing the given date string.
 * Returns null when dateStr is absent or unparseable.
 * Pure function — no Date.now(), no side effects.
 *
 * @param {string|null} dateStr  'YYYY-MM-DD'
 * @returns {string|null}        'YYYY-MM-DD' Monday, or null
 */
export function getMonday(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const [, y, mo, d] = m.map(Number)
  const date = new Date(Date.UTC(y, mo - 1, d))
  const dow = date.getUTCDay()         // 0 = Sunday, 1 = Monday, …
  const offset = dow === 0 ? -6 : 1 - dow   // steps back to Monday
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

// ── Section builders ──────────────────────────────────────────────────────────

function buildAttendanceSummary(data) {
  if (!data) {
    return { trend: 'unknown', observationCount: 0, headline: 'No attendance data', concerns: [] }
  }
  const trend = data.trend ?? 'unknown'
  const count = data.observationCount ?? 0
  const concerns = (data.observations ?? [])
    .map(o => typeof o === 'string' ? o : (o?.text ?? o?.description ?? ''))
    .filter(Boolean)

  let headline
  if (count === 0) {
    headline = 'No attendance issues recorded'
  } else if (trend === 'declining') {
    headline = `${count} attendance ${count === 1 ? 'concern' : 'concerns'} — declining trend`
  } else if (trend === 'improving') {
    headline = `${count} attendance ${count === 1 ? 'concern' : 'concerns'} — improving`
  } else {
    headline = `${count} attendance ${count === 1 ? 'concern' : 'concerns'} flagged`
  }

  return { trend, observationCount: count, headline, concerns }
}

function buildAvailabilitySummary(readData) {
  if (!readData) {
    return { available: null, total: null, pct: null, unavailableReasons: [], headline: 'Availability data unavailable' }
  }
  const pct = readData.availabilityPct ?? null
  const unavailableReasons = (readData.injuryConcerns ?? [])
    .map(c => typeof c === 'string' ? c : (c?.description ?? c?.text ?? ''))
    .filter(Boolean)
  const headline = pct != null
    ? `${Math.round(pct)}% of squad available`
    : 'Squad availability unknown'
  return { available: null, total: null, pct, unavailableReasons, headline }
}

function buildTrainingLoadSummary(readData) {
  const noData = { status: LOAD_STATUS.UNKNOWN, completionPct: null, headline: 'Training data unavailable', actionRequired: false }
  const tc = readData?.trainingCompletion
  if (!tc || !tc.total) return noData

  // Proxy: compare estimated session minutes against total × target minutes/action
  const completionPct = Math.min(100, Math.round(
    (tc.estimatedMinutes / (tc.total * LOAD_TARGET_MINUTES_PER_ACTION)) * 100,
  ))
  const status = completionPct >= LOAD_ON_TRACK_THRESHOLD ? LOAD_STATUS.ON_TRACK
    : completionPct >= LOAD_BEHIND_THRESHOLD ? LOAD_STATUS.BEHIND
    : LOAD_STATUS.AT_RISK

  const actionRequired = status !== LOAD_STATUS.ON_TRACK

  const headline = status === LOAD_STATUS.ON_TRACK
    ? `Training load on track (${completionPct}%)`
    : status === LOAD_STATUS.BEHIND
      ? `Training slightly behind schedule (${completionPct}%)`
      : `Training significantly behind — action required (${completionPct}%)`

  return { status, completionPct, headline, actionRequired }
}

function buildMatchPreparationStatus(readData) {
  const noData = {
    isMatchWeek: false, readinessPct: null,
    preparationItems: [], missingActions: [], headline: 'No match preparation data',
  }
  if (!readData) return noData

  const prep    = readData.preparationChecklist ?? []
  const missing = readData.missingActions ?? []
  const pct     = readData.squadReadinessPct ?? null
  const isMatchWeek = prep.length > 0 || missing.length > 0 || pct != null

  if (!isMatchWeek) return noData

  const preparationItems = prep
    .map(item => ({
      title: typeof item === 'string' ? item : (item?.title ?? item?.action ?? ''),
      done:  item?.done ?? false,
    }))
    .filter(i => i.title)

  const missingActions = missing
    .map(a => typeof a === 'string' ? a : (a?.title ?? a?.action ?? ''))
    .filter(Boolean)

  let headline
  if (pct != null) {
    headline = `Squad ${Math.round(pct)}% ready`
    if (missingActions.length) headline += ` — ${missingActions.length} action${missingActions.length === 1 ? '' : 's'} outstanding`
  } else if (missingActions.length) {
    headline = `${missingActions.length} preparation action${missingActions.length === 1 ? '' : 's'} outstanding`
  } else {
    headline = 'Preparation in progress'
  }

  return { isMatchWeek, readinessPct: pct, preparationItems, missingActions, headline }
}

function buildPlayersNeedingAttention(dashData, readData) {
  const players = []
  const seen    = new Set()

  function add(reason, urgency, suggestedAction) {
    if (!reason || seen.has(reason)) return
    seen.add(reason)
    players.push({ playerId: null, reason, urgency, suggestedAction: suggestedAction ?? null })
  }

  // Medical summary concerns → always HIGH urgency
  for (const concern of (dashData?.medicalSummary?.concerns ?? [])) {
    const text = typeof concern === 'string' ? concern : (concern?.text ?? concern?.description ?? '')
    add(text, URGENCY.HIGH, 'Review player welfare')
  }

  // Welfare/medical-category priorities
  const WELFARE_CATS = new Set(['welfare', 'medical', 'Medical', 'Player Welfare'])
  for (const p of (dashData?.topPriorities ?? [])) {
    if (WELFARE_CATS.has(p.category)) {
      add(p.title ?? '', p.urgency ?? URGENCY.MEDIUM, p.action ?? null)
    }
  }

  // Injury concerns from match readiness
  for (const concern of (readData?.injuryConcerns ?? [])) {
    const text = typeof concern === 'string' ? concern : (concern?.description ?? concern?.text ?? '')
    add(text, URGENCY.MEDIUM, 'Check player availability')
  }

  return players
}

function collectEvidenceIds(dashData, readData) {
  const ids = new Set()
  for (const id of (dashData?.explanationIds ?? []))            if (id) ids.add(id)
  for (const id of (readData?.explanationIds ?? []))            if (id) ids.add(id)
  for (const p of (dashData?.topPriorities ?? []))              if (p.evidenceId) ids.add(p.evidenceId)
  for (const a of (dashData?.recommendedActions ?? []))         if (a.evidenceId) ids.add(a.evidenceId)
  return [...ids]
}

// ── Response assemblers ───────────────────────────────────────────────────────

function buildBrief(caps, dashboardRes, readinessRes, opts = {}) {
  const dashData = dashboardRes?.data ?? null
  const readData  = readinessRes?.data ?? null
  const ok       = dashboardRes?.ok === true
  const isMock   = !ok || Boolean(dashData?.isMock)

  return {
    productId:      BRIEF_ID,
    productVersion: BRIEF_VERSION,
    ok,
    available:      true,
    tier:           caps.tier,
    weekOf:         getMonday(opts.date ?? null),
    generatedAt:    opts.generatedAt ?? null,
    isMock,

    topPriorities:           (dashData?.topPriorities ?? []).slice(0, 3),
    biggestRisks:            dashData?.biggestRisks ?? [],
    attendanceSummary:       buildAttendanceSummary(dashData?.attendanceSummary),
    availabilitySummary:     buildAvailabilitySummary(readData),
    trainingLoadSummary:     buildTrainingLoadSummary(readData),
    matchPreparationStatus:  buildMatchPreparationStatus(readData),
    playersNeedingAttention: buildPlayersNeedingAttention(dashData, readData),
    recommendedActions:      dashData?.recommendedActions ?? [],

    confidence:  dashData?.confidence ?? null,
    evidenceIds: collectEvidenceIds(dashData, readData),

    reason:      null,
    limitations: caps.limitations ?? [],
  }
}

function buildUnavailable(caps) {
  return {
    productId:      BRIEF_ID,
    productVersion: BRIEF_VERSION,
    ok:             false,
    available:      false,
    tier:           caps.tier ?? 'free',
    weekOf:         null,
    generatedAt:    null,
    isMock:         true,

    topPriorities:           [],
    biggestRisks:            [],
    attendanceSummary:       { trend: 'unknown', observationCount: 0, headline: 'Not available', concerns: [] },
    availabilitySummary:     { available: null, total: null, pct: null, unavailableReasons: [], headline: 'Not available' },
    trainingLoadSummary:     { status: LOAD_STATUS.UNKNOWN, completionPct: null, headline: 'Not available', actionRequired: false },
    matchPreparationStatus:  { isMatchWeek: false, readinessPct: null, preparationItems: [], missingActions: [], headline: 'Not available' },
    playersNeedingAttention: [],
    recommendedActions:      [],

    confidence:  null,
    evidenceIds: [],

    reason:      caps.reason ?? REASON.INSUFFICIENT_TIER,
    limitations: caps.limitations ?? [],
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Produce the Weekly Brief for a coach.
 *
 * @param {object} context
 * @param {object}  context.user         - { coachId?, clubId?, tier, flags? }
 * @param {object}  [context.team]       - { teamId, tier?, flags? } — enables match readiness section
 * @param {string}  [context.date]       - 'YYYY-MM-DD' — determines weekOf; caller stamps
 * @param {string}  [context.generatedAt]- ISO timestamp — caller stamps for determinism
 * @param {object}  [_coachAI]           - optional CoachAI override (for testing)
 * @returns {Promise<WeeklyBriefResponse>}
 */
export async function getWeeklyBrief(context = {}, _coachAI = CoachAI) {
  const { user = {}, team = null, date = null, generatedAt = null } = context ?? {}
  try {
    const caps = await _coachAI.getCapabilities(user)

    if (!caps.isEnabled || !caps.features?.weeklyBrief) {
      return buildUnavailable(caps)
    }

    const dashboardRes = await _coachAI.getDashboard(user)

    let readinessRes = null
    if (team?.teamId && caps.features?.matchReadiness) {
      readinessRes = await _coachAI.getMatchReadiness({
        teamId: team.teamId,
        tier:   user.tier,
        flags:  user.flags,
      })
    }

    return buildBrief(caps, dashboardRes, readinessRes, { date, generatedAt })
  } catch {
    return buildUnavailable({ tier: 'free', reason: REASON.BRAIN_UNAVAILABLE, limitations: [] })
  }
}
