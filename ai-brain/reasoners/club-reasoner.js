/**
 * AI Brain — Club Reasoner
 *
 * Domain: club health, long-term trends, administrative governance.
 * Reads: bundle.clubIntelligence, bundle.proceduralLearning, bundle.platform.seasonData.
 * Rules: no external calls, no provider access, pure reasoning over the ContextBundle.
 *
 * M9: Also accepts an optional observations array from the Memory/Observation layer.
 * When observations = [] (default), behaviour is identical to M4.
 * Observation types consumed: CLUB_ACTIVITY, PLAYER_IMPROVEMENT, SESSION_FREQUENCY.
 */

import { makeRec, CATEGORY, PRIORITY } from './shared.js'

export const name = 'club'

function obsEvidence(obs) {
  return {
    type:          'observation',
    value:         obs.observationType,
    source:        'observation-engine',
    observationId: obs.id,
    label:         obs.explanation,
  }
}

export function reason(bundle, observations = []) {
  const t0 = Date.now()
  const recommendations = []
  const insights        = []
  const warnings        = []
  const evidence        = []

  const ci       = bundle?.clubIntelligence    ?? {}
  const pl       = bundle?.proceduralLearning  ?? {}
  const platform = bundle?.platform            ?? {}

  const noLiveData =
    !ci.available &&
    !pl.available &&
    platform.seasonData == null

  if (noLiveData) {
    recommendations.push(makeRec({
      category:       CATEGORY.CLUB,
      priority:       PRIORITY.LOW,
      confidence:     50,
      title:          'No club intelligence data — club health monitoring not yet active',
      description:    'Club-level recommendations require club health data, season data, and learning history.',
      action:         'Ensure the club intelligence engine is running and season data is configured.',
      source:         'club-reasoner/mock',
      explainability: 'No live club intelligence, procedural learning, or season data was available.',
    }))
    return { reasoner: name, recommendations, insights, warnings, evidence, durationMs: Date.now() - t0 }
  }

  const health      = ci.health             ?? null
  const cis         = pl.cis                ?? null
  const calibration = pl.calibration        ?? null
  const season      = platform.seasonData   ?? null

  // ── Club health score below threshold ─────────────────────────────────────
  if (health) {
    const overall = health.overallScore ?? health.overall ?? health.score ?? null
    if (overall != null && overall < 65) {
      const weakest = health.components
        ? Object.entries(health.components)
            .filter(([, v]) => typeof v === 'number')
            .sort(([, a], [, b]) => a - b)[0]
        : null
      const ev = { type: 'club-health-score', value: `${overall}/100`, source: 'clubIntelligence.health' }
      evidence.push(ev)
      recommendations.push(makeRec({
        category:       CATEGORY.CLUB,
        priority:       overall < 50 ? PRIORITY.HIGH : PRIORITY.MEDIUM,
        confidence:     70,
        title:          `Club health score ${overall}/100 — below healthy threshold`,
        description:    `Overall club health is at ${overall}/100.${weakest ? ` Weakest dimension: ${weakest[0]} at ${weakest[1]}.` : ''}`,
        action:         `Review the Club Intelligence dashboard and prioritise the ${weakest?.[0] ?? 'lowest-scoring'} dimension.`,
        source:         'club-reasoner',
        explainability: 'Club scores below 65/100 indicate structural issues requiring coaching or committee attention.',
        evidence:       [ev],
      }))
    }

    // ── Engagement sub-score ─────────────────────────────────────────────────
    const engagement = health.components?.engagement ?? health.engagement ?? null
    if (engagement != null && engagement < 60) {
      const ev = { type: 'engagement-score', value: `${engagement}/100`, source: 'clubIntelligence.health' }
      evidence.push(ev)
      recommendations.push(makeRec({
        category:       CATEGORY.CLUB,
        priority:       PRIORITY.MEDIUM,
        confidence:     65,
        title:          `Member engagement score ${engagement}/100 — communication review needed`,
        description:    'Low engagement is a leading indicator for renewal and retention issues (typically 4–6 weeks ahead).',
        action:         'Schedule a newsletter, member survey, or community event to re-engage.',
        source:         'club-reasoner',
        explainability: 'Engagement below 60/100 typically precedes membership renewal drops.',
        evidence:       [ev],
      }))
    }
  }

  // ── Intelligence maturity insights ────────────────────────────────────────
  if (cis) {
    const grade = cis.grade ?? null
    const stage = cis.stage ?? null
    if (grade) insights.push({ key: 'cis-grade', value: grade, confidence: 80 })
    if (stage) insights.push({ key: 'cis-stage', value: stage, confidence: 80 })
  }

  if (calibration) {
    const maturity = calibration.calibrationMaturity ?? null
    const outcomes = calibration.totalOutcomesSeen   ?? 0
    if (maturity) {
      insights.push({ key: 'calibration-maturity', value: maturity, confidence: 90 })
    }
    if (maturity === 'COLD_START' && outcomes < 10) {
      warnings.push({
        message:  'Learning engine is in COLD_START — calibration improves as coach decisions are recorded',
        severity: 'low',
      })
    }
  }

  // ── Season phase context ──────────────────────────────────────────────────
  if (season) {
    const phase = season.phase ?? season.label ?? null
    if (phase) insights.push({ key: 'season-phase', value: phase, confidence: 95 })
  }

  // ── M9: Observation-based enrichment (additive only) ─────────────────────
  if (observations.length > 0) {
    const clubActivityObs = observations.filter(o => o.observationType === 'CLUB_ACTIVITY')
    const improvementObs  = observations.filter(o => o.observationType === 'PLAYER_IMPROVEMENT')
    const sessionFreqObs  = observations.filter(o => o.observationType === 'SESSION_FREQUENCY')

    // CLUB_ACTIVITY: insight about observed AI engagement level
    for (const obs of clubActivityObs) {
      evidence.push(obsEvidence(obs))
      insights.push({
        key:           'club-ai-activity-level',
        value:         obs.metadata?.activityLevel ?? 'observed',
        confidence:    obs.confidence,
        observationId: obs.id,
      })
    }

    // PLAYER_IMPROVEMENT: aggregate insight from all improvement signals
    if (improvementObs.length > 0) {
      const avgConf = Math.round(
        improvementObs.reduce((sum, o) => sum + o.confidence, 0) / improvementObs.length
      )
      for (const obs of improvementObs) {
        evidence.push(obsEvidence(obs))
      }
      insights.push({
        key:        'player-improvement-signals',
        value:      improvementObs.length,
        confidence: avgConf,
      })
    }

    // SESSION_FREQUENCY: insight about how often AI is used across sessions
    for (const obs of sessionFreqObs) {
      evidence.push(obsEvidence(obs))
      insights.push({
        key:           'session-frequency',
        value:         obs.metadata?.sessions ?? obs.metadata?.categoryCount ?? null,
        confidence:    obs.confidence,
        observationId: obs.id,
      })
    }
  }

  return { reasoner: name, recommendations, insights, warnings, evidence, durationMs: Date.now() - t0 }
}
