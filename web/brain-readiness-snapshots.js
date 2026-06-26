/**
 * web/brain-readiness-snapshots.js — Readiness Coach View HTML Snapshot Suite (M223, DORMANT)
 *
 * Canonical, byte-for-byte-deterministic HTML snapshots of the readiness panel across representative
 * coachView scenarios — a stable reference of exactly what the future Phase-1 UI would render. It
 * REUSES the M221 renderer and the M222 theme helpers only; it adds no rendering logic, and changes no
 * engine, contract, index.html, runtime, or API.
 *
 * Pure and deterministic: no DOM, network, storage, AI, clock, or randomness. Inputs are fixed,
 * escaped output throughout, and the result is deeply frozen. Importing it changes nothing in production.
 */

import { renderReadinessCoachView } from './brain-readiness-view.js'
import { statusBadge, confidenceChip, trendBadge } from './brain-readiness-theme.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** One snapshot = an M222 theme strip (badges) + the M221 full panel. */
export function renderReadinessSnapshot(coachView) {
  if (!isObj(coachView)) throw new TypeError('renderReadinessSnapshot requires a coachView object')
  const strip = `<div class="readiness-snapshot__theme">${statusBadge(coachView.status)}${confidenceChip(coachView.confidence)}${trendBadge(coachView.trend)}</div>`
  return `<div class="readiness-snapshot">${strip}${renderReadinessCoachView(coachView)}</div>`
}

// ── canonical coachView fixtures (fixed values → byte-stable snapshots) ──────────────────

const groups = (over = {}) => ({ group: 'FRONT_ROW', total: 3, available: 3, injuryConcern: 0, unavailableOrSuspended: 0, limitedTraining: 0, missingInformation: 0, ...over })

const cv = (over = {}) => ({
  status: 'MATCH_READY',
  confidence: 'HIGH',
  gate: { status: 'PASS', reasons: [] },
  headline: 'Match ready — 16/20 available',
  keyNumbers: { total: 20, available: 16, injuries: 1, unavailableOrSuspended: 2, limitedTraining: 1, missing: 0 },
  warnings: [],
  playerReadiness: { count: 20, withLimitingFactors: 3, withMissingInformation: 0 },
  squad: { readinessLevel: 'MATCH_READY', confidence: 'HIGH', positionGroups: [groups()], summary: 'Match ready: 16 of 20 available for selection.' },
  trend: null,
  ...over,
})

const SCENARIOS = Object.freeze({
  fullyReady: cv({
    status: 'FULLY_READY', headline: 'Fully ready — 20/23 available',
    keyNumbers: { total: 23, available: 20, injuries: 0, unavailableOrSuspended: 1, limitedTraining: 0, missing: 0 },
    squad: { readinessLevel: 'FULLY_READY', confidence: 'HIGH', positionGroups: [groups()], summary: 'Fully ready: 20 of 23 available for selection.' },
  }),
  matchReady: cv(),
  understrength: cv({
    status: 'UNDERSTRENGTH', confidence: 'MEDIUM', gate: { status: 'WARN', reasons: ['LOW_PLAYER_NUMBERS'] },
    headline: 'Understrength — 12/20 available, 1 to review',
    keyNumbers: { total: 20, available: 12, injuries: 2, unavailableOrSuspended: 6, limitedTraining: 1, missing: 1 },
    warnings: ['LOW_PLAYER_NUMBERS'],
    squad: { readinessLevel: 'UNDERSTRENGTH', confidence: 'MEDIUM', positionGroups: [groups({ available: 1, unavailableOrSuspended: 2 })], summary: 'Understrength: 12 of 20 available for selection.' },
  }),
  noSquad: cv({
    status: 'NO_SQUAD', confidence: 'NONE', gate: { status: 'FAIL', reasons: ['NO_SQUAD'] },
    headline: 'No squad data — 0/0 available',
    keyNumbers: { total: 0, available: 0, injuries: 0, unavailableOrSuspended: 0, limitedTraining: 0, missing: 0 },
    warnings: ['NO_SQUAD'],
    playerReadiness: { count: 0, withLimitingFactors: 0, withMissingInformation: 0 },
    squad: null,
  }),
  lowConfidence: cv({
    confidence: 'LOW', gate: { status: 'WARN', reasons: ['LOW_CONFIDENCE'] },
    headline: 'Match ready — 16/20 available, 2 to review',
    keyNumbers: { total: 20, available: 16, injuries: 1, unavailableOrSuspended: 2, limitedTraining: 1, missing: 13 },
    warnings: ['LOW_CONFIDENCE', 'MISSING_PLAYER_INFORMATION'],
  }),
  warningHeavy: cv({
    confidence: 'LOW', gate: { status: 'WARN', reasons: ['CAPTAIN_UNAVAILABLE', 'INSUFFICIENT_FRONT_ROW', 'LOW_CONFIDENCE', 'VACANT_POSITIONS'] },
    headline: 'Match ready — 15/20 available, 5 to review',
    keyNumbers: { total: 20, available: 15, injuries: 3, unavailableOrSuspended: 4, limitedTraining: 2, missing: 9 },
    warnings: ['CAPTAIN_UNAVAILABLE', 'INSUFFICIENT_FRONT_ROW', 'LOW_CONFIDENCE', 'MISSING_PLAYER_INFORMATION', 'VACANT_POSITIONS'],
  }),
  trendImproving: cv({ trend: { direction: 'IMPROVING', comparable: true, changes: { availability: 4, injuries: 0, unavailableOrSuspended: 0, limitedTraining: 0 } } }),
  trendDeclining: cv({ trend: { direction: 'DECLINING', comparable: true, changes: { availability: -4, injuries: 3, unavailableOrSuspended: 2, limitedTraining: 0 } } }),
  trendUnavailable: cv({ trend: { direction: 'STABLE', comparable: false, changes: { availability: null, injuries: null, unavailableOrSuspended: null, limitedTraining: null } } }),
})

/** The named coachView scenarios (frozen) used to build the snapshots — for reference/inspection. */
export const READINESS_SNAPSHOT_SCENARIOS = deepFreeze(SCENARIOS)

/**
 * Build the canonical HTML snapshot for every scenario.
 * @returns {Readonly<Record<string,string>>}  scenario name → HTML
 */
export function buildReadinessSnapshots() {
  const out = {}
  for (const name of Object.keys(SCENARIOS)) out[name] = renderReadinessSnapshot(SCENARIOS[name])
  return deepFreeze(out)
}
