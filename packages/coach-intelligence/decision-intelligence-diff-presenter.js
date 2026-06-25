/**
 * @coach-intelligence — Decision Intelligence Diff Presenter (M193, DORMANT)
 *
 * A pure, deterministic presenter for an M192 decision diff. It makes the change codes readable for
 * engineering/debug review ONLY — not user-facing coaching advice, not live AI. It reads only the
 * passed diff: it never calls diffDecisions, selects/scores/ranks, runs a pipeline, inspects a
 * provider, or derives new conclusions. No timestamps, randomness, network, persistence, or Core
 * changes. Object output is deeply frozen.
 *
 * Formats: 'object' (default), 'text', 'json'. JSON uses the shared canonical key-sorted serializer
 * (already permitted for coach-intelligence by dependency-cruiser, as in M125/M127/M185).
 */

import { canonicalStringify } from '@brain/evidence-gateway'

const SUPPORTED_FORMATS = Object.freeze(['object', 'text', 'json'])

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const arr = (v) => (Array.isArray(v) ? v : [])
const strOrNull = (v) => (typeof v === 'string' ? v : null)
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const codesOf = (v) => arr(v).filter((c) => typeof c === 'string')

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Validate the M192 diff shape this presenter reads. */
function assertDiff(diff) {
  if (!isObj(diff) || !isObj(diff.summary) || !Array.isArray(diff.playerChanges) || !Array.isArray(diff.captainChanges) ||
      !isObj(diff.benchChanges) || !isObj(diff.riskChanges) || !Array.isArray(diff.explanationChanges) || !isObj(diff.coverageChanges)) {
    throw new TypeError('summarizeDecisionDiff requires an M192 decision diff')
  }
}

/** Normalize the diff into a stable, presenter-friendly object with a flat change count. */
function normalize(diff) {
  const playerChanges = arr(diff.playerChanges).map((c) => ({ playerId: isObj(c) ? strOrNull(c.playerId) : null, code: isObj(c) ? strOrNull(c.code) : null }))
  const captainChanges = arr(diff.captainChanges).map((c) => ({ code: isObj(c) ? strOrNull(c.code) : null, from: isObj(c) ? strOrNull(c.from) : null, to: isObj(c) ? strOrNull(c.to) : null }))
  const explanationChanges = arr(diff.explanationChanges).map((c) => ({ playerId: isObj(c) ? strOrNull(c.playerId) : null, gained: isObj(c) ? codesOf(c.gained) : [], lost: isObj(c) ? codesOf(c.lost) : [] }))
  const bc = isObj(diff.benchChanges) ? diff.benchChanges : {}
  const benchChanges = { beforeCount: numOrNull(bc.beforeCount), afterCount: numOrNull(bc.afterCount), delta: numOrNull(bc.delta), entered: codesOf(bc.entered), left: codesOf(bc.left) }
  const rc = isObj(diff.riskChanges) ? diff.riskChanges : {}
  const riskChanges = { before: numOrNull(rc.before), after: numOrNull(rc.after), delta: numOrNull(rc.delta), code: strOrNull(rc.code) }
  const cc = isObj(diff.coverageChanges) ? diff.coverageChanges : {}
  const coverageChanges = { before: numOrNull(cc.before), after: numOrNull(cc.after), delta: numOrNull(cc.delta), code: strOrNull(cc.code) }

  const changeCount = playerChanges.length + captainChanges.length + explanationChanges.length +
    (riskChanges.code ? 1 : 0) + (coverageChanges.code ? 1 : 0)

  return {
    changed: diff.summary.changed === true,
    changeCount,
    codes: codesOf(diff.summary.codes),
    playerChanges,
    captainChanges,
    benchChanges,
    riskChanges,
    explanationChanges,
    coverageChanges,
  }
}

/** Render the normalized diff as a deterministic multi-line debug string. */
function renderText(n) {
  const lines = [`DecisionDiff changed=${n.changed} changes=${n.changeCount} codes=${n.codes.join(',')}`]
  for (const c of n.playerChanges) lines.push(`player ${c.playerId} ${c.code}`)
  for (const c of n.captainChanges) lines.push(`captain ${c.code} from=${c.from} to=${c.to}`)
  if (n.riskChanges.code) lines.push(`risk before=${n.riskChanges.before} after=${n.riskChanges.after} ${n.riskChanges.code}`)
  if (n.coverageChanges.code) lines.push(`coverage before=${n.coverageChanges.before} after=${n.coverageChanges.after} ${n.coverageChanges.code}`)
  for (const c of n.explanationChanges) lines.push(`explanation ${c.playerId} gained=${c.gained.join(',')} lost=${c.lost.join(',')}`)
  if (n.benchChanges.entered.length || n.benchChanges.left.length) lines.push(`bench delta=${n.benchChanges.delta} entered=${n.benchChanges.entered.join(',')} left=${n.benchChanges.left.join(',')}`)
  return lines.join('\n')
}

/**
 * Present an M192 decision diff for engineering/debug review.
 *
 * @param {object} diff  a diffDecisions (M192) result
 * @param {('object'|'text'|'json')} [format='object']
 * @returns {(Readonly<object>|string)}  frozen normalized object ('object'), or a string ('text'/'json')
 */
export function summarizeDecisionDiff(diff, format = 'object') {
  if (typeof format !== 'string' || !SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`summarizeDecisionDiff: unsupported format "${format}" (expected object | text | json)`)
  }
  assertDiff(diff)

  const n = normalize(diff)
  if (format === 'text') return renderText(n)
  if (format === 'json') return canonicalStringify(n)
  return deepFreeze(n)
}
