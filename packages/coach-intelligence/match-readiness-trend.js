/**
 * @coach-intelligence — Squad Readiness Trend (M210, DORMANT, observational-only)
 *
 * Compares a chronological list of M209 squad readiness summaries (oldest → newest) and reports the
 * direction of travel between the latest two — purely observational. It NEVER selects/drops/ranks
 * players, generates a team, calls AI, or touches a database/network/filesystem/CLOCK. It reuses the
 * M209 outputs (reads their fields) rather than recomputing anything.
 *
 * Pure and deterministic; inputs never mutated; output deeply frozen.
 *
 * Input: a chronological array of M209 summaries: [{ readinessLevel, confidence:{level}, counts:{...} }, ...]
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const signed = (n) => (n > 0 ? `+${n}` : `${n}`)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

const RANK = Object.freeze({ NO_SQUAD: 0, NOT_READY: 1, UNDERSTRENGTH: 2, MATCH_READY: 3, FULLY_READY: 4 })
const rank = (lvl) => (Object.prototype.hasOwnProperty.call(RANK, lvl) ? RANK[lvl] : -1)
const CONF_RANK = Object.freeze({ NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 })
const confRank = (lvl) => (Object.prototype.hasOwnProperty.call(CONF_RANK, lvl) ? CONF_RANK[lvl] : -1)

const DIR_LABEL = Object.freeze({ IMPROVING: 'improving', STABLE: 'stable', DECLINING: 'declining' })

/** Read the trend-relevant fields out of one M209 summary (missing data defaults safely). */
function extract(summary) {
  const counts = isObj(summary.counts) ? summary.counts : {}
  return {
    level: typeof summary.readinessLevel === 'string' ? summary.readinessLevel : null,
    avail: num(counts.availableForSelection),
    injury: num(counts.injuryConcern),
    unavail: num(counts.unavailableOrSuspended),
    limited: num(counts.limitedTraining),
    conf: isObj(summary.confidence) && typeof summary.confidence.level === 'string' ? summary.confidence.level : null,
  }
}

/** Direction by readiness rank, then availability, then total concerns. */
function directionOf(prev, curr) {
  const pr = rank(prev.level)
  const cr = rank(curr.level)
  if (pr >= 0 && cr >= 0 && cr !== pr) return cr > pr ? 'IMPROVING' : 'DECLINING'
  const availDelta = curr.avail - prev.avail
  if (availDelta !== 0) return availDelta > 0 ? 'IMPROVING' : 'DECLINING'
  const concernDelta = (curr.injury + curr.unavail + curr.limited) - (prev.injury + prev.unavail + prev.limited)
  if (concernDelta !== 0) return concernDelta < 0 ? 'IMPROVING' : 'DECLINING'
  return 'STABLE'
}

function confidenceTrendOf(prev, curr) {
  const pr = confRank(prev.conf)
  const cr = confRank(curr.conf)
  if (pr < 0 || cr < 0 || pr === cr) return 'STABLE'
  return cr > pr ? 'IMPROVING' : 'DECLINING'
}

const NO_CHANGES = Object.freeze({ availability: null, injuries: null, unavailableOrSuspended: null, limitedTraining: null })

/**
 * Analyse the readiness trend across a chronological list of M209 summaries.
 *
 * @param {Array<object>} history  oldest → newest M209 summaries
 * @returns {Readonly<{ currentReadinessLevel:(string|null), previousReadinessLevel:(string|null),
 *   direction:string, comparable:boolean, changes:object, confidenceTrend:string, summary:string }>}
 */
export function analyzeSquadReadinessTrend(history) {
  if (!Array.isArray(history)) throw new TypeError('analyzeSquadReadinessTrend requires an array of M209 summaries')
  for (const s of history) {
    if (!isObj(s)) throw new TypeError('analyzeSquadReadinessTrend: each snapshot must be an object')
  }

  const n = history.length
  if (n === 0) {
    return deepFreeze({
      currentReadinessLevel: null, previousReadinessLevel: null, direction: 'STABLE', comparable: false,
      changes: { ...NO_CHANGES }, confidenceTrend: 'STABLE', summary: 'No readiness history supplied.',
    })
  }

  const curr = extract(history[n - 1])
  if (n === 1) {
    return deepFreeze({
      currentReadinessLevel: curr.level, previousReadinessLevel: null, direction: 'STABLE', comparable: false,
      changes: { ...NO_CHANGES }, confidenceTrend: 'STABLE',
      summary: `First snapshot (${curr.level || 'unknown'}) — no trend established yet.`,
    })
  }

  const prev = extract(history[n - 2])
  const direction = directionOf(prev, curr)
  const confidenceTrend = confidenceTrendOf(prev, curr)
  const changes = {
    availability: curr.avail - prev.avail,
    injuries: curr.injury - prev.injury,
    unavailableOrSuspended: curr.unavail - prev.unavail,
    limitedTraining: curr.limited - prev.limited,
  }

  const summary = `Readiness ${DIR_LABEL[direction]} (${prev.level || 'unknown'} → ${curr.level || 'unknown'}). `
    + `Availability ${signed(changes.availability)}, injuries ${signed(changes.injuries)}, `
    + `unavailable/suspended ${signed(changes.unavailableOrSuspended)}, limited training ${signed(changes.limitedTraining)}. `
    + `Confidence ${DIR_LABEL[confidenceTrend]}.`

  return deepFreeze({
    currentReadinessLevel: curr.level,
    previousReadinessLevel: prev.level,
    direction,
    comparable: true,
    changes,
    confidenceTrend,
    summary,
  })
}
