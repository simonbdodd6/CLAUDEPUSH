/**
 * @coach-intelligence — Squad Match Readiness Summary (M209, DORMANT, read-only)
 *
 * Aggregates individual player readiness records into ONE squad-level picture so a coach can grasp the
 * overall state of the squad at a glance. It reuses the M208 per-player explanation engine and rolls
 * the factors up into deterministic counts, a squad readiness level, a confidence note, position-group
 * summaries, and a plain-English (fixed-template) summary line.
 *
 * It NEVER selects, drops, ranks, or generates a starting XV, calls no AI/LLM, and touches no
 * database/network/filesystem. Pure, deterministic; inputs never mutated; output deeply frozen.
 *
 * Input: an array of per-player readiness records (the M208 shape, plus an optional `position`):
 *   [{ playerId, position?, availability?, fitness?, attendance?, suspended? }, ...]
 */

import { explainPlayerReadiness } from './match-readiness-explanations.js'

const sortStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Coarse position group, or null when there is no position data. */
function positionGroup(position) {
  const p = String(position || '').trim().toUpperCase()
  if (!p) return null
  if (/PROP|HOOKER|LOOSEHEAD|TIGHTHEAD|^LH$|^TH$/.test(p)) return 'FRONT_ROW'
  if (/LOCK|SECOND.?ROW/.test(p)) return 'SECOND_ROW'
  if (/FLANK|BLINDSIDE|OPENSIDE|NUMBER.?8|^N8$|BACK.?ROW/.test(p)) return 'BACK_ROW'
  if (/SCRUM.?HALF|^SH$|FLY.?HALF|^FH$|\bHALF\b/.test(p)) return 'HALF_BACKS'
  if (/CENTRE|CENTER|^IC$|^OC$|MIDFIELD/.test(p)) return 'MIDFIELD'
  if (/WING|FULL.?BACK|^FB$|^LW$|^RW$|BACK.?THREE/.test(p)) return 'BACK_THREE'
  return 'OTHER'
}

const READINESS_LABEL = Object.freeze({
  NO_SQUAD: 'No squad data',
  NOT_READY: 'Not ready',
  UNDERSTRENGTH: 'Understrength',
  MATCH_READY: 'Match ready',
  FULLY_READY: 'Fully ready',
})
const CONFIDENCE_LABEL = Object.freeze({
  HIGH: 'High confidence — readiness information is complete across the squad',
  MEDIUM: 'Moderate confidence — some players are missing readiness information',
  LOW: 'Low confidence — readiness information is missing for much of the squad',
  NONE: 'No confidence — no player readiness records supplied',
})

/** Derive the squad-relevant booleans for one player from its M208 explanation. */
function flagsFor(record) {
  const expl = explainPlayerReadiness(record)   // validates playerId, derives factors
  const pos = new Set(expl.positiveFactors.map((f) => f.code))
  const lim = new Set(expl.limitingFactors.map((f) => f.code))
  const available = pos.has('AVAILABLE')
  const suspended = lim.has('SUSPENDED')
  const unavailable = lim.has('UNAVAILABLE')
  return {
    available,
    suspended,
    unavailable,
    injuryConcern: lim.has('RETURNING_FROM_INJURY') || lim.has('INJURED'),
    limitedTraining: lim.has('POOR_ATTENDANCE'),
    missingInformation: expl.missingInformation.length > 0,
    fullyAvailable: available && expl.limitingFactors.length === 0 && expl.missingInformation.length === 0,
    availableForSelection: available && !suspended,
  }
}

const emptyGroup = () => ({ total: 0, available: 0, injuryConcern: 0, unavailableOrSuspended: 0, limitedTraining: 0, missingInformation: 0 })

/**
 * Summarise the readiness of a whole squad.
 *
 * @param {Array<object>} players  per-player readiness records
 * @returns {Readonly<{ readinessLevel:string, confidence:object, counts:object, positionGroups:object, summary:string }>}
 */
export function assessSquadReadiness(players) {
  if (!Array.isArray(players)) throw new TypeError('assessSquadReadiness requires an array of player readiness records')

  const total = players.length
  const counts = { total, fullyAvailable: 0, availableForSelection: 0, injuryConcern: 0, unavailableOrSuspended: 0, limitedTraining: 0, missingInformation: 0 }
  const groups = {}

  for (const record of players) {
    const f = flagsFor(record)
    if (f.fullyAvailable) counts.fullyAvailable += 1
    if (f.availableForSelection) counts.availableForSelection += 1
    if (f.injuryConcern) counts.injuryConcern += 1
    if (f.unavailable || f.suspended) counts.unavailableOrSuspended += 1
    if (f.limitedTraining) counts.limitedTraining += 1
    if (f.missingInformation) counts.missingInformation += 1

    const g = positionGroup(record && record.position)
    if (g) {
      if (!groups[g]) groups[g] = emptyGroup()
      const gg = groups[g]
      gg.total += 1
      if (f.availableForSelection) gg.available += 1
      if (f.injuryConcern) gg.injuryConcern += 1
      if (f.unavailable || f.suspended) gg.unavailableOrSuspended += 1
      if (f.limitedTraining) gg.limitedTraining += 1
      if (f.missingInformation) gg.missingInformation += 1
    }
  }

  // squad readiness level (no selection — just how many are available to field)
  let readinessLevel
  if (total === 0) readinessLevel = 'NO_SQUAD'
  else if (counts.availableForSelection >= 18) readinessLevel = 'FULLY_READY'
  else if (counts.availableForSelection >= 15) readinessLevel = 'MATCH_READY'
  else if (counts.availableForSelection >= 1) readinessLevel = 'UNDERSTRENGTH'
  else readinessLevel = 'NOT_READY'

  // squad confidence = completeness of the readiness inputs
  let confLevel
  if (total === 0) confLevel = 'NONE'
  else if (counts.missingInformation === 0) confLevel = 'HIGH'
  else if (counts.missingInformation >= Math.ceil(total / 2)) confLevel = 'LOW'
  else confLevel = 'MEDIUM'

  // position groups with sorted keys (deterministic)
  const positionGroups = {}
  for (const k of Object.keys(groups).sort(sortStr)) positionGroups[k] = groups[k]

  const summary = total === 0
    ? 'No player readiness records were supplied.'
    : `${READINESS_LABEL[readinessLevel]}: ${counts.availableForSelection} of ${total} available for selection. `
      + `${counts.injuryConcern} injury concern(s), ${counts.unavailableOrSuspended} unavailable or suspended, `
      + `${counts.limitedTraining} with limited recent training, ${counts.missingInformation} with missing information.`

  return deepFreeze({
    readinessLevel,
    confidence: { level: confLevel, label: CONFIDENCE_LABEL[confLevel] },
    counts,
    positionGroups,
    summary,
  })
}
