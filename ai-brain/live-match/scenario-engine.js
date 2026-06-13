/**
 * AI Brain — Live Scenario Engine (M27)
 *
 * Opportunity detection and danger detection. Combines state, momentum,
 * pressure, discipline, patterns and the opponent profile into actionable
 * opportunities (attack now) and dangers (batten down). Deterministic.
 */

import { rec } from './match-state.js'

const WEAK_DIM = 40, STRONG_DIM = 65
const oppScore = (context, key) => {
  const e = context.opponent?.dimensions?.[key]
  return e && typeof e.score === 'number' ? e.score : null
}
const oppEv = (context, key) => context.opponent?.dimensions?.[key]?.evidence ?? []

export function buildOpportunities(state, signals, context = {}) {
  const { momentum, pressure, patterns } = signals
  const recs = []

  if (state.numericalAdvantage > 0) {
    recs.push(rec('opp-extra', 'Attack now with the extra man — go through the hands and stretch them wide',
      `We have a numerical advantage (${state.playersOnField.us} v ${state.playersOnField.them})`, [],
      { priority: 'high', confidence: 0.8, fallback: 'Use the extra player before it expires' }))
  }
  if (momentum.side === 'us' && momentum.score >= 30) {
    recs.push(rec('opp-momentum', 'Ride the momentum — keep tempo high and force the next score',
      `Momentum strongly with us (${momentum.score})`, momentum.evidence,
      { priority: 'high', confidence: 0.7, fallback: 'Press while we are on top' }))
  }
  if (pressure.side === 'attacking') {
    const disc = oppScore(context, 'disciplineProfile')
    recs.push(rec('opp-pressure', disc != null && disc <= WEAK_DIM
      ? 'Keep squeezing in their 22 — they are penalty-prone, take the points on offer'
      : 'Keep the pressure on in their 22 — patience for the breakthrough',
      'We are camped in their 22', [...pressure.evidence, ...oppEv(context, 'disciplineProfile')],
      { priority: 'high', confidence: 0.7, fallback: 'Build phases and take the points if offered' }))
  }
  const oppFitness = oppScore(context, 'fitnessTrends')
  if (state.phase !== 'opening' && oppFitness != null && oppFitness <= WEAK_DIM) {
    recs.push(rec('opp-fade', 'Lift the tempo — the opponent fades late and is tiring',
      `Opponent fades late (fitness ${oppFitness}/100)`, oppEv(context, 'fitnessTrends'),
      { priority: 'medium', confidence: 0.65, fallback: 'Push the pace in the closing phase' }))
  }
  for (const p of patterns.patterns) {
    if (p.type === 'penalty_streak' && p.side === 'them') {
      recs.push(rec('opp-pen', 'They are conceding repeatedly — take the points and keep them under the posts',
        p.detail, p.evidence, { priority: 'medium', confidence: 0.7, fallback: 'Take kickable penalties' }))
    }
  }

  if (!recs.length) recs.push(rec('opp-none', 'No clear opportunity — stay patient and accurate',
    'No opportunity trigger', [], { priority: 'low', confidence: 0.5, fallback: 'Hold structure and wait for the chance' }))
  return { recommendations: recs, summary: recs[0].recommendation, confidence: 0.65, fallback: 'Stay patient for opportunities' }
}

export function buildDangers(state, signals, context = {}) {
  const { momentum, pressure, discipline, patterns } = signals
  const recs = []

  if (state.numericalAdvantage < 0) {
    recs.push(rec('dgr-14', `Down to ${state.playersOnField.us} — tighten up, keep ball, reduce time defending`,
      'Numerical disadvantage is the biggest live danger', [],
      { priority: 'high', confidence: 0.8, fallback: 'Play territory and protect the line until back to full strength' }))
  }
  if (pressure.side === 'defending') {
    recs.push(rec('dgr-pressure', 'Under pressure in our 22 — exit at the first opportunity, no cheap penalties',
      'We are defending sustained pressure', pressure.evidence,
      { priority: 'high', confidence: 0.7, fallback: 'Prioritise a clean exit and reset' }))
  }
  if (discipline.level === 'high') {
    recs.push(rec('dgr-card', 'Card risk is high — captain to manage the referee and stop the penalty count',
      `Discipline risk ${discipline.level}`, discipline.evidence,
      { priority: 'high', confidence: 0.75, fallback: 'Cut out penalties immediately' }))
  }
  if (momentum.side === 'them' && momentum.score <= -30) {
    recs.push(rec('dgr-momentum', 'Momentum is against us — slow the game, reset with a box-kick or set-piece',
      `Momentum strongly against us (${momentum.score})`, momentum.evidence,
      { priority: 'medium', confidence: 0.7, fallback: 'Disrupt their rhythm and steady the game' }))
  }
  for (const p of patterns.patterns) {
    if (p.type === 'sustained_pressure' && p.side === 'us') continue
    if (p.type === 'scrum_struggle' || p.type === 'lineout_struggle') {
      recs.push(rec(`dgr-${p.type}`, `Shore up our ${p.type.split('_')[0]} — it is leaking ball`,
        p.detail, p.evidence, { priority: 'medium', confidence: 0.65, fallback: 'Simplify the set-piece call' }))
    }
  }

  if (!recs.length) recs.push(rec('dgr-none', 'No major danger — keep executing and stay disciplined',
    'No danger trigger', [], { priority: 'low', confidence: 0.5, fallback: 'Maintain structure and discipline' }))
  return { recommendations: recs, summary: recs[0].recommendation, confidence: 0.65, fallback: 'Stay disciplined and protect the result' }
}
