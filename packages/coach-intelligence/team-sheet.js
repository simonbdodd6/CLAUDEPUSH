/**
 * @coach-intelligence — Team Sheet Composer (M127, DORMANT)
 *
 * Pure deterministic presenter that combines the M123 Starting XV, the M124 selection-risk
 * report, and the M126 sign-off verdict into one coach-facing team sheet. It reuses ONLY those
 * existing outputs — it rescoring nothing, generates no new risks, changes no approval logic,
 * and produces no language. Four formats: "line", "text" (default), "markdown", "json".
 *
 * Reads only — no mutation, filesystem, persistence, APIs, network, randomness or clock.
 */

import { canonicalStringify } from '@brain/evidence-gateway'

const SUPPORTED_FORMATS = Object.freeze(['line', 'text', 'markdown', 'json'])

const isObj = (v) => v !== null && typeof v === 'object'

function assertInputs(parts) {
  if (!isObj(parts) || Array.isArray(parts)) throw new TypeError('composeTeamSheet requires { startingXV, riskReport, signOff }')
  const { startingXV, riskReport, signOff } = parts

  if (!isObj(startingXV) || Array.isArray(startingXV) || !Array.isArray(startingXV.startingXV) ||
      !Array.isArray(startingXV.benchCandidates) || !Array.isArray(startingXV.unavailable) || !isObj(startingXV.metadata)) {
    throw new TypeError('composeTeamSheet: invalid startingXV (M123)')
  }
  if (!isObj(riskReport) || Array.isArray(riskReport) || typeof riskReport.overallRisk !== 'string' ||
      !Array.isArray(riskReport.risks) || !isObj(riskReport.metadata)) {
    throw new TypeError('composeTeamSheet: invalid riskReport (M124)')
  }
  if (!isObj(signOff) || Array.isArray(signOff) || typeof signOff.approved !== 'boolean' ||
      !Array.isArray(signOff.blockers) || typeof signOff.requiresReview !== 'boolean' || !isObj(signOff.metadata)) {
    throw new TypeError('composeTeamSheet: invalid signOff (M126)')
  }
}

const playerLabel = (s) => (s.player ? s.player.playerId : 'VACANT')

/**
 * Compose a coach-facing team sheet from existing selection outputs.
 *
 * @param {{ startingXV:object, riskReport:object, signOff:object }} parts  M123 + M124 + M126 outputs
 * @param {{ format?: ('line'|'text'|'markdown'|'json') }} [options]  default format: "text"
 * @returns {string}
 */
export function composeTeamSheet(parts, options = {}) {
  assertInputs(parts)
  const format = (options && options.format !== undefined) ? options.format : 'text'
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`composeTeamSheet: unknown format "${format}" (expected one of: ${SUPPORTED_FORMATS.join(', ')})`)
  }

  const { startingXV, riskReport, signOff } = parts
  const xv = startingXV.startingXV
  const bench = startingXV.benchCandidates

  // derive everything from the existing outputs — no rescoring, no new risks
  const filled = xv.filter((s) => s.status === 'filled').length
  const vacant = xv.filter((s) => s.status === 'vacant').length
  const unavailableCount = startingXV.unavailable.reduce((sum, u) => sum + (Number(u.ineligibleCount) || 0), 0)
  const totalRisks = riskReport.risks.length
  const blockerCount = signOff.blockers.length

  const statusText = !signOff.approved ? 'BLOCKED' : (signOff.requiresReview ? 'REVIEW NEEDED' : 'APPROVED')
  const statusToken = statusText.replace(/ /g, '_')   // REVIEW_NEEDED — keeps the line format parseable

  if (format === 'json') return canonicalStringify({ startingXV, riskReport, signOff })

  if (format === 'line') {
    return `team-sheet status=${statusToken} filled=${filled} vacant=${vacant} bench=${bench.length} risk=${riskReport.overallRisk} blockers=${blockerCount} review=${signOff.requiresReview}`
  }

  const xvLines = xv.map((s) => `${s.jersey}. ${s.position} — ${playerLabel(s)}`)
  const benchLines = bench.length ? bench.map((b) => `- ${b.playerId}`) : ['- (none)']

  if (format === 'text') {
    return [
      'Team Sheet',
      `Status: ${statusText}`,
      '',
      'Starting XV:',
      ...xvLines,
      '',
      'Bench Candidates:',
      ...benchLines,
      '',
      'Risk:',
      `Overall: ${riskReport.overallRisk}`,
      `Total risks: ${totalRisks}`,
      `Unavailable players: ${unavailableCount}`,
      '',
      'Sign-off:',
      `Approved: ${signOff.approved}`,
      `Requires review: ${signOff.requiresReview}`,
      `Blockers: ${blockerCount}`,
    ].join('\n')
  }

  // markdown
  return [
    '# Team Sheet',
    `**Status:** ${statusText}`,
    ['## Starting XV', ...xvLines].join('\n'),
    ['## Bench Candidates', ...benchLines].join('\n'),
    ['## Risk', `- Overall: ${riskReport.overallRisk}`, `- Total risks: ${totalRisks}`, `- Unavailable players: ${unavailableCount}`].join('\n'),
    ['## Sign-off', `- Approved: ${signOff.approved}`, `- Requires review: ${signOff.requiresReview}`, `- Blockers: ${blockerCount}`].join('\n'),
  ].join('\n\n')
}
