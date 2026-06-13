/**
 * Coach Products — AI Selection Assistant (M22)
 *
 * The coach-facing answer to: "Is this the strongest squad I can realistically select?"
 *
 * Deterministically derives the best-available rugby-union XV from a squad
 * snapshot, then reports bench balance, positional coverage (front row,
 * lineout, backline), missing positions, injury risks, selection warnings,
 * and recommended changes — with a plain-language explanation.
 *
 * Dependency: ONLY the CoachAI integration layer (Match Readiness for injury /
 * availability / evidence context, CoachProfile for read-only emphasis) plus
 * pure learning-type constants. Never imports Brain internals. Never reads or
 * modifies Coach's Eye Core — the squad snapshot is supplied by the caller.
 * No LLM. Fully deterministic.
 *
 * Context shape:
 *   {
 *     user:  { coachId?, tier, flags? }   — required
 *     team:  { teamId }                   — required for AI context
 *     squad: Player[]                     — required for a real assessment
 *     fixtureId?:   string
 *     generatedAt?: ISO string
 *   }
 *
 * Player shape (caller-owned; never fetched from Core):
 *   {
 *     playerId, name?,
 *     positions: number[],   // jerseys the player can fill; positions[0] = primary
 *     available?: boolean,   // default true
 *     status?:   'fit'|'doubtful'|'injured'|'unavailable'|'suspended',
 *     form?:        number,  // 0–100
 *     minutesLoad?: number,  // 0–100 (recent load / fatigue)
 *     welfareFlag?: boolean,
 *     lastSelected?: boolean,
 *   }
 */

import CoachAI from '../../ai-brain/integration/index.js'
import { REASON } from '../../ai-brain/integration/integration-types.js'
import {
  SA_ID, SA_VERSION, SELECTION_FLAG, PERSONALISATION_FLAG, MIN_PROFILE_OBSERVATIONS,
  SQUAD_SIZE, BENCH_SIZE, GROUP, POSITIONS, JERSEYS, POSITION_BY_JERSEY,
  FRONT_ROW_JERSEYS, LOCK_JERSEYS, BACK_ROW_JERSEYS, JUMPER_JERSEYS,
  BACK_THREE_JERSEYS, CENTRE_JERSEYS, FILL_PRIORITY,
  PLAYER_STATUS, COVERAGE, SEVERITY,
  MERIT_PRIMARY, MERIT_SECONDARY, MERIT_GROUP, FORM_WEIGHT, LOAD_PENALTY,
  FIT_BONUS, DOUBTFUL_PENALTY, HIGH_LOAD_THRESHOLD,
  MAX_WARNINGS, MAX_CHANGES, MAX_RISKS,
} from './selection-assistant-types.js'
import { personalise, emptyPersonalisation } from './personaliser.js'

// ── Pure helpers ──────────────────────────────────────────────────────────────

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const round2 = (n) => Math.round(n * 100) / 100
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 }
const groupOf = (j) => POSITION_BY_JERSEY[j]?.group ?? null

function isFlagEnabled(flagName, flags = {}) {
  if (!flags || !(flagName in flags)) return true
  return Boolean(flags[flagName])
}

function isSelectable(p) {
  const s = p?.status ?? PLAYER_STATUS.FIT
  return p?.available !== false &&
    s !== PLAYER_STATUS.INJURED &&
    s !== PLAYER_STATUS.UNAVAILABLE &&
    s !== PLAYER_STATUS.SUSPENDED
}

function canPlay(p, j) {
  return Array.isArray(p?.positions) && p.positions.includes(j)
}

function countCanPlay(players, jerseys) {
  const set = Array.isArray(jerseys) ? jerseys : [jerseys]
  return players.filter(p => set.some(j => canPlay(p, j))).length
}

/** Merit of player p at jersey j. 0 means cannot/should not play there. */
function meritAt(p, j) {
  if (!Array.isArray(p.positions) || p.positions.length === 0) return 0
  let base
  if (p.positions[0] === j) base = MERIT_PRIMARY
  else if (p.positions.includes(j)) base = MERIT_SECONDARY
  else if (p.positions.some(pos => groupOf(pos) === groupOf(j))) base = MERIT_GROUP
  else return 0
  const form = isNum(p.form) ? p.form : 50
  const load = isNum(p.minutesLoad) ? p.minutesLoad : 50
  let score = base + form * FORM_WEIGHT - load * LOAD_PENALTY
  if ((p.status ?? PLAYER_STATUS.FIT) === PLAYER_STATUS.FIT) score += FIT_BONUS
  if ((p.status ?? PLAYER_STATUS.FIT) === PLAYER_STATUS.DOUBTFUL) score -= DOUBTFUL_PENALTY
  return score
}

/** Deterministic candidate comparison: higher merit, then lower load, then id. */
function betterCandidate(a, b, j) {
  const ma = meritAt(a, j), mb = meritAt(b, j)
  if (mb !== ma) return mb - ma
  const la = isNum(a.minutesLoad) ? a.minutesLoad : 50
  const lb = isNum(b.minutesLoad) ? b.minutesLoad : 50
  if (la !== lb) return la - lb
  return String(a.playerId) < String(b.playerId) ? -1 : 1
}

// ── Best available XV ─────────────────────────────────────────────────────────

function buildBestXV(selectable) {
  // Order jerseys by specialist scarcity, tie-broken by the fixed priority list.
  const fillOrder = [...JERSEYS].sort((j1, j2) => {
    const c1 = countCanPlay(selectable, j1)
    const c2 = countCanPlay(selectable, j2)
    if (c1 !== c2) return c1 - c2
    return FILL_PRIORITY.indexOf(j1) - FILL_PRIORITY.indexOf(j2)
  })

  const used = new Set()
  const assigned = {}
  for (const j of fillOrder) {
    const cand = selectable
      .filter(p => !used.has(p.playerId) && meritAt(p, j) > 0)
      .sort((a, b) => betterCandidate(a, b, j))
    if (cand.length) {
      assigned[j] = cand[0]
      used.add(cand[0].playerId)
    } else {
      assigned[j] = null
    }
  }

  const xv = POSITIONS.map(pos => {
    const p = assigned[pos.jersey]
    return {
      jersey:        pos.jersey,
      code:          pos.code,
      name:          pos.name,
      group:         pos.group,
      playerId:      p?.playerId ?? null,
      playerName:    p?.name ?? null,
      specialist:    p ? p.positions[0] === pos.jersey : false,
      outOfPosition: p ? !p.positions.includes(pos.jersey) : false,
      status:        p?.status ?? null,
    }
  })
  return xv
}

// ── Coverage reports ──────────────────────────────────────────────────────────

function buildFrontRowCoverage(selectable) {
  const lh = countCanPlay(selectable, 1)
  const hk = countCanPlay(selectable, 2)
  const th = countCanPlay(selectable, 3)
  const startersCovered = lh >= 1 && hk >= 1 && th >= 1
  let status
  if (!startersCovered) status = COVERAGE.EXPOSED
  else if (hk >= 2 && lh >= 2 && th >= 2) status = COVERAGE.SECURE
  else status = COVERAGE.THIN
  return {
    loosehead: lh, hooker: hk, tighthead: th,
    startersCovered,
    hookerCover: hk >= 2,
    benchCover: startersCovered ? Math.max(0, (lh - 1) + (hk - 1) + (th - 1)) : 0,
    status,
  }
}

function buildLineoutCoverage(selectable) {
  const jumpers = countCanPlay(selectable, JUMPER_JERSEYS)
  const dedicatedLocks = countCanPlay(selectable, LOCK_JERSEYS)
  const throwers = countCanPlay(selectable, 2)
  let status
  if (throwers < 1 || jumpers < 2 || dedicatedLocks < 2) status = COVERAGE.EXPOSED
  else if (jumpers >= 4 && throwers >= 2) status = COVERAGE.SECURE
  else status = COVERAGE.THIN
  return { jumpers, dedicatedLocks, throwers, status }
}

function buildBacklineBalance(selectable) {
  const scrumHalf = countCanPlay(selectable, 9)
  const flyHalf   = countCanPlay(selectable, 10)
  const centres   = countCanPlay(selectable, CENTRE_JERSEYS)
  const backThree = countCanPlay(selectable, BACK_THREE_JERSEYS)
  let status
  if (scrumHalf < 1 || flyHalf < 1 || centres < 2 || backThree < 3) status = COVERAGE.EXPOSED
  else if (scrumHalf >= 2 && flyHalf >= 2 && backThree >= 4) status = COVERAGE.SECURE
  else status = COVERAGE.THIN
  return { scrumHalf, flyHalf, centres, backThree, status }
}

function buildBenchBalance(selectable, xv) {
  const usedIds = new Set(xv.filter(s => s.playerId).map(s => s.playerId))
  const remaining = selectable.filter(p => !usedIds.has(p.playerId))
  const has = (jerseys) => countCanPlay(remaining, jerseys) > 0
  const rolesCovered = {
    frontRow:  countCanPlay(remaining, [1, 3]) > 0 && countCanPlay(remaining, 2) > 0,
    lock:      has(LOCK_JERSEYS),
    backRow:   has(BACK_ROW_JERSEYS),
    scrumHalf: has(9),
    flyHalf:   has(10),
    back:      has([11, 12, 13, 14, 15]),
  }
  const coveredCount = Object.values(rolesCovered).filter(Boolean).length
  let status
  if (coveredCount >= 6) status = COVERAGE.SECURE
  else if (coveredCount >= 4) status = COVERAGE.THIN
  else status = COVERAGE.EXPOSED
  return {
    available: remaining.length,
    recommendedSize: BENCH_SIZE,
    rolesCovered,
    coveredCount,
    impactPlayers: remaining.length,
    status,
  }
}

// ── Derived lists ─────────────────────────────────────────────────────────────

function buildMissingPositions(xv) {
  return xv
    .filter(s => s.playerId === null || s.outOfPosition)
    .map(s => ({
      jersey: s.jersey, code: s.code, name: s.name,
      reason: s.playerId === null ? 'No available specialist' : 'Filled out of position',
    }))
}

function buildInjuryRisks(xv, byId, mr) {
  const out = []
  const seen = new Set()
  const push = (playerId, jersey, reason, severity, source, evidenceId = null) => {
    const key = `${reason}`
    if (!reason || seen.has(key)) return
    seen.add(key)
    out.push({ playerId, jersey, reason, severity, source, evidenceId })
  }
  for (const s of xv) {
    if (!s.playerId) continue
    const p = byId.get(s.playerId)
    if (!p) continue
    if ((p.status ?? '') === PLAYER_STATUS.DOUBTFUL) {
      push(p.playerId, s.jersey, `${p.name ?? p.playerId} selected but rated doubtful`, SEVERITY.HIGH, 'squad')
    } else if (p.welfareFlag) {
      push(p.playerId, s.jersey, `${p.name ?? p.playerId} has an active welfare flag`, SEVERITY.MEDIUM, 'welfare')
    }
    if (isNum(p.minutesLoad) && p.minutesLoad >= HIGH_LOAD_THRESHOLD) {
      push(p.playerId, s.jersey, `${p.name ?? p.playerId} carrying a high training load (${p.minutesLoad})`, SEVERITY.MEDIUM, 'load')
    }
  }
  for (const c of (mr?.injuryConcerns ?? [])) {
    push(null, null, c.summary, SEVERITY.HIGH, c.source ?? 'readiness', c.recommendationId ?? null)
  }
  return out.slice(0, MAX_RISKS)
}

function buildSelectionWarnings(selectable, xv, frontRow, lineout, backline, bench, missing) {
  const out = []
  const push = (type, severity, message) => out.push({ type, severity, message })

  if (selectable.length < SQUAD_SIZE) {
    push('squad_size', SEVERITY.HIGH,
      `Only ${selectable.length} players available — cannot field a full XV`)
  }
  if (frontRow.status === COVERAGE.EXPOSED) {
    const gaps = FRONT_ROW_JERSEYS.filter(j => countCanPlay(selectable, j) === 0)
      .map(j => POSITION_BY_JERSEY[j].name)
    push('front_row', SEVERITY.HIGH,
      gaps.length
        ? `No specialist cover at ${gaps.join(', ')} — uncontested-scrum risk`
        : 'Front-row cover is exposed — uncontested-scrum risk')
  }
  if (lineout.status === COVERAGE.EXPOSED) {
    push('lineout', SEVERITY.HIGH,
      lineout.throwers < 1 ? 'No specialist hooker to throw at the lineout'
        : 'Insufficient lineout jumping options')
  }
  if (backline.status === COVERAGE.EXPOSED) {
    push('backline', SEVERITY.HIGH,
      backline.flyHalf < 1 ? 'No specialist fly-half available'
        : backline.scrumHalf < 1 ? 'No specialist scrum-half available'
          : 'Backline cover is exposed')
  }
  for (const m of missing) {
    push('missing_position', SEVERITY.MEDIUM, `No specialist for ${m.name} (#${m.jersey})`)
  }
  for (const s of xv) {
    if (s.status === PLAYER_STATUS.DOUBTFUL) {
      push('doubtful_starter', SEVERITY.MEDIUM, `${s.playerName ?? 'Player'} at ${s.name} is rated doubtful`)
    }
  }
  if (bench.status === COVERAGE.EXPOSED) {
    push('bench', SEVERITY.MEDIUM, 'Bench cover is thin across key roles')
  }
  return out
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (SEVERITY_RANK[a.item.severity] - SEVERITY_RANK[b.item.severity]) || (a.i - b.i))
    .map(x => x.item)
    .slice(0, MAX_WARNINGS)
}

function buildRecommendedChanges(selectable, xv, byId, frontRow, lineout, backline, missing) {
  const items = []
  const push = (action, priority, category, rationale) => items.push({ action, priority, category, rationale })

  if (frontRow.status === COVERAGE.EXPOSED) {
    const gaps = FRONT_ROW_JERSEYS.filter(j => countCanPlay(selectable, j) === 0).map(j => POSITION_BY_JERSEY[j].name)
    push(`Secure specialist cover at ${gaps.join(', ') || 'front row'}`, SEVERITY.HIGH, 'recruitment',
      'Front row must be covered to avoid uncontested scrums')
  } else if (!frontRow.hookerCover) {
    push('Name a replacement hooker on the bench', SEVERITY.HIGH, 'bench',
      'A single hooker risks uncontested scrums if injured')
  }
  if (lineout.status === COVERAGE.EXPOSED && lineout.throwers < 1) {
    push('Develop or recruit a lineout thrower (hooker)', SEVERITY.HIGH, 'recruitment',
      'No specialist thrower available for set-piece')
  }
  if (backline.status === COVERAGE.EXPOSED && backline.flyHalf < 1) {
    push('Identify fly-half cover', SEVERITY.HIGH, 'recruitment', 'No specialist 10 available')
  } else if (backline.flyHalf < 2) {
    push('Develop a back-up fly-half', SEVERITY.MEDIUM, 'development', 'Only one specialist 10 in the squad')
  }
  for (const s of xv) {
    if (!s.playerId) continue
    const p = byId.get(s.playerId)
    if (p && isNum(p.minutesLoad) && p.minutesLoad >= HIGH_LOAD_THRESHOLD) {
      push(`Consider resting ${p.name ?? p.playerId} (load ${p.minutesLoad})`, SEVERITY.MEDIUM, 'rotation',
        'High recent load increases injury risk')
    }
  }
  for (const m of missing) {
    push(`Find a specialist for ${m.name} (#${m.jersey})`, SEVERITY.MEDIUM, 'development',
      `Currently ${m.reason.toLowerCase()}`)
  }

  const seen = new Set()
  return items
    .filter(i => i.action && !seen.has(i.action) && seen.add(i.action))
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (SEVERITY_RANK[a.item.priority] - SEVERITY_RANK[b.item.priority]) || (a.i - b.i))
    .map((x, idx) => ({ rank: idx + 1, ...x.item }))
    .slice(0, MAX_CHANGES)
}

function buildEvidenceIds(mr, injuryRisks) {
  const ids = new Set()
  for (const id of (mr?.explanationIds ?? [])) if (id) ids.add(id)
  for (const c of (mr?.injuryConcerns ?? [])) if (c.recommendationId) ids.add(c.recommendationId)
  for (const m of (mr?.missingActions ?? [])) if (m.recommendationId) ids.add(m.recommendationId)
  for (const r of injuryRisks) if (r.evidenceId) ids.add(r.evidenceId)
  return [...ids]
}

function computeConfidence(selectable, mr) {
  if (selectable.length === 0) return 0   // no players → no basis for a selection
  const completeness = clamp(selectable.length / SQUAD_SIZE, 0, 1)
  const posCoverage = selectable.length
    ? selectable.filter(p => Array.isArray(p.positions) && p.positions.length).length / selectable.length
    : 0
  const dataConf = completeness * 0.6 + posCoverage * 0.4
  const mrConf = isNum(mr?.confidence) ? clamp(mr.confidence, 0, 100) / 100 : null
  const c = mrConf != null ? dataConf * 0.7 + mrConf * 0.3 : dataConf
  return round2(clamp(c, 0, 1))
}

function buildExplanation(xv, frontRow, lineout, backline, warnings, confidence) {
  const filled = xv.filter(s => s.playerId).length
  const specialists = xv.filter(s => s.specialist).length
  const parts = []
  parts.push(`${filled}/15 jerseys filled (${specialists} by specialists)`)
  const cov = []
  cov.push(`front row ${frontRow.status}`)
  cov.push(`lineout ${lineout.status}`)
  cov.push(`backline ${backline.status}`)
  parts.push(`coverage — ${cov.join(', ')}`)
  const highs = warnings.filter(w => w.severity === SEVERITY.HIGH).length
  parts.push(highs ? `${highs} critical warning${highs === 1 ? '' : 's'} to resolve` : 'no critical warnings')
  return parts.join('; ') + `. Confidence ${Math.round(confidence * 100)}%.`
}

// ── Assemblers ────────────────────────────────────────────────────────────────

function buildAssessment(caps, squad, mrRes, opts = {}) {
  const mr = mrRes?.data ?? null
  const mrOk = mrRes?.ok === true
  const players = Array.isArray(squad) ? squad : []
  const selectable = players.filter(isSelectable)
  const byId = new Map(players.map(p => [p.playerId, p]))

  // No selectable players (missing/empty squad, or everyone unavailable) →
  // a graceful, valid, but empty assessment. Available (tier permits), not ok.
  if (selectable.length === 0) {
    return {
      productId:      SA_ID,
      productVersion: SA_VERSION,
      ok:             false,
      available:      true,
      tier:           caps.tier,
      teamId:         opts.teamId ?? mr?.teamId ?? null,
      fixtureId:      opts.fixtureId ?? null,
      generatedAt:    opts.generatedAt ?? null,
      isMock:         !mrOk || Boolean(mr?.isMock),
      ...emptyCoverage(),
      confidence:      0,
      evidenceIds:     buildEvidenceIds(mr, []),
      explanation:     'No selectable players available to assess a selection.',
      personalisation: emptyPersonalisation(),
      reason:          null,
      limitations:     caps.limitations ?? [],
    }
  }

  const bestAvailableXV = buildBestXV(selectable)
  const frontRowCoverage = buildFrontRowCoverage(selectable)
  const lineoutCoverage  = buildLineoutCoverage(selectable)
  const backlineBalance  = buildBacklineBalance(selectable)
  const benchBalance     = buildBenchBalance(selectable, bestAvailableXV)
  const missingPositions = buildMissingPositions(bestAvailableXV)
  const injuryRisks      = buildInjuryRisks(bestAvailableXV, byId, mr)
  const selectionWarnings = buildSelectionWarnings(selectable, bestAvailableXV, frontRowCoverage, lineoutCoverage, backlineBalance, benchBalance, missingPositions)
  const recommendedChanges = buildRecommendedChanges(selectable, bestAvailableXV, byId, frontRowCoverage, lineoutCoverage, backlineBalance, missingPositions)
  const evidenceIds = buildEvidenceIds(mr, injuryRisks)
  const confidence  = computeConfidence(selectable, mr)
  const explanation = buildExplanation(bestAvailableXV, frontRowCoverage, lineoutCoverage, backlineBalance, selectionWarnings, confidence)

  return {
    productId:      SA_ID,
    productVersion: SA_VERSION,
    ok:             selectable.length > 0,
    available:      true,
    tier:           caps.tier,
    teamId:         opts.teamId ?? mr?.teamId ?? null,
    fixtureId:      opts.fixtureId ?? null,
    generatedAt:    opts.generatedAt ?? null,
    isMock:         !mrOk || Boolean(mr?.isMock),

    bestAvailableXV,
    benchBalance,
    missingPositions,
    frontRowCoverage,
    lineoutCoverage,
    backlineBalance,
    injuryRisks,
    selectionWarnings,
    recommendedChanges,
    confidence,
    evidenceIds,
    explanation,

    personalisation: emptyPersonalisation(),
    reason:      null,
    limitations: caps.limitations ?? [],
  }
}

function emptyCoverage() {
  return {
    bestAvailableXV: POSITIONS.map(pos => ({
      jersey: pos.jersey, code: pos.code, name: pos.name, group: pos.group,
      playerId: null, playerName: null, specialist: false, outOfPosition: false, status: null,
    })),
    benchBalance: {
      available: 0, recommendedSize: BENCH_SIZE,
      rolesCovered: { frontRow: false, lock: false, backRow: false, scrumHalf: false, flyHalf: false, back: false },
      coveredCount: 0, impactPlayers: 0, status: COVERAGE.UNKNOWN,
    },
    missingPositions: POSITIONS.map(pos => ({ jersey: pos.jersey, code: pos.code, name: pos.name, reason: 'No squad data' })),
    frontRowCoverage: { loosehead: 0, hooker: 0, tighthead: 0, startersCovered: false, hookerCover: false, benchCover: 0, status: COVERAGE.UNKNOWN },
    lineoutCoverage:  { jumpers: 0, dedicatedLocks: 0, throwers: 0, status: COVERAGE.UNKNOWN },
    backlineBalance:  { scrumHalf: 0, flyHalf: 0, centres: 0, backThree: 0, status: COVERAGE.UNKNOWN },
    injuryRisks: [], selectionWarnings: [], recommendedChanges: [],
  }
}

function buildUnavailable(caps, reason, teamId = null, fixtureId = null, available = false) {
  return {
    productId:      SA_ID,
    productVersion: SA_VERSION,
    ok:             false,
    available,
    tier:           caps?.tier ?? 'free',
    teamId,
    fixtureId,
    generatedAt:    null,
    isMock:         true,
    ...emptyCoverage(),
    confidence:      0,
    evidenceIds:     [],
    explanation:     'Selection Assistant is not available.',
    personalisation: emptyPersonalisation(),
    reason,
    limitations: caps?.limitations ?? [],
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Produce the Selection Assistant assessment for a team's upcoming fixture.
 *
 * @param {object} context  - { user, team, squad, fixtureId?, generatedAt? }
 * @param {object} [_coachAI] - optional CoachAI override (for testing)
 * @returns {Promise<SelectionAssistantResponse>}
 */
export async function getSelectionAssistant(context = {}, _coachAI = CoachAI) {
  const { user = {}, team = null, squad = null, fixtureId = null, generatedAt = null } = context ?? {}
  try {
    const caps = await _coachAI.getCapabilities(user)

    // Product feature flag (absent = enabled)
    if (!isFlagEnabled(SELECTION_FLAG, user?.flags)) {
      return buildUnavailable(caps, REASON.FEATURE_DISABLED, team?.teamId ?? null, fixtureId)
    }

    // Subscription gate — bundled at the Match-Readiness capability tier (Performance+).
    if (!caps.isEnabled || !caps.features?.matchReadiness) {
      return buildUnavailable(caps, caps.reason ?? REASON.INSUFFICIENT_TIER, team?.teamId ?? null, fixtureId)
    }

    // Pull Match Readiness for injury / availability / evidence context (best-effort).
    let mrRes = null
    const teamId = team?.teamId ?? null
    if (teamId) {
      mrRes = await _coachAI.getMatchReadiness({ teamId, tier: user.tier, flags: user.flags })
    }

    let report = buildAssessment(caps, squad, mrRes, { teamId, fixtureId, generatedAt })

    // Personalisation — read-only CoachProfile, EMPHASIS ONLY, non-blocking.
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
