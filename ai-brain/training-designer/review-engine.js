/**
 * AI Brain — Training Review Engine (M25)
 *
 * Builds the review block and the coach messages that wrap the session. Both
 * reference the objectives (and their evidence) so the "why" is explicit.
 * Pure + deterministic.
 */

import { PHASE, WELFARE_IMPACT } from './training-types.js'

export function buildReview(objectives, constraints, theme, durationMin) {
  const keyPoints = objectives.slice(0, 3).map(o => o.outcome)
  return {
    label: 'Review',
    durationMin,
    activities: [{
      id: 'session-review',
      name: 'Session review & feedback',
      phase: PHASE.REVIEW,
      purpose: 'Consolidate learning and set the standard for the week',
      estimatedDuration: durationMin,
      coachingFocus: `Reinforce the theme — ${theme}`,
      equipment: ['whiteboard'],
      constraints: ['whole squad', 'cool-down alongside'],
      workload: 0,
      intensity: 1,
      welfareImpact: WELFARE_IMPACT.LOW,
      learningObjective: 'Players can articulate the session focus and next steps',
      decisionComplexity: 1,
      confidence: 0.8,
      why: 'Closes the loop on the session objectives and embeds learning',
      evidence: objectives.slice(0, 3).flatMap(o => o.evidence).filter((v, i, a) => v && a.indexOf(v) === i),
      keyPoints,
    }],
  }
}

/** Coach messages: pre-session, welfare, and opponent focus — each evidence-aware. */
export function buildCoachMessages(objectives, constraints, theme, context = {}) {
  const messages = []
  messages.push({
    id: 'msg-theme', audience: 'squad', timing: 'pre-session',
    message: `Today's focus: ${theme}. ${objectives[0]?.outcome ?? 'Bring energy and standards.'}`,
    evidence: objectives[0]?.evidence ?? [],
  })

  if (constraints.welfareFlagIds.length || constraints.highLoadIds.length) {
    const ids = [...new Set([...constraints.welfareFlagIds, ...constraints.highLoadIds])]
    messages.push({
      id: 'msg-welfare', audience: 'individual', timing: 'pre-session',
      message: `Check in with ${ids.join(', ')} — manage load and wellbeing before involving them.`,
      evidence: [],
    })
  }

  const oppObjective = objectives.find(o => o.sources.includes('opponent-opportunity') || o.sources.includes('opponent-threat'))
  if (oppObjective) {
    messages.push({
      id: 'msg-opponent', audience: 'squad', timing: 'pre-match-week',
      message: `Opposition focus: ${oppObjective.label} — ${oppObjective.outcome}.`,
      evidence: oppObjective.evidence,
    })
  }

  return messages
}
