/**
 * AI Brain — Squad Reasoner
 *
 * Domain: player welfare, injuries, medical alerts, squad depth.
 * Reads: bundle.platform.fixture, bundle.platform.digitalTwin, bundle.episodicMemory.
 * Rules: no external calls, no provider access, pure reasoning over the ContextBundle.
 *
 * M9: Also accepts an optional observations array from the Memory/Observation layer.
 * When observations = [] (default), behaviour is identical to M4.
 * Observation types consumed: ATTENDANCE_TREND, PLAYER_AVAILABILITY_TREND, REPEATED_ABSENCE.
 */

import { makeRec, CATEGORY, PRIORITY } from './shared.js'

export const name = 'squad'

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

  const platform = bundle?.platform ?? {}
  const em       = bundle?.episodicMemory ?? {}

  const noLiveData =
    platform.fixture     == null &&
    platform.digitalTwin == null &&
    (em.playerCount ?? 0) === 0

  if (noLiveData) {
    recommendations.push(makeRec({
      category:       CATEGORY.MEDICAL,
      priority:       PRIORITY.LOW,
      confidence:     50,
      title:          'No squad data — connect player records to unlock welfare monitoring',
      description:    'Squad health and welfare recommendations require player records and digital twin data.',
      action:         'Go to Settings > Players and import or connect your squad management system.',
      source:         'squad-reasoner/mock',
      explainability: 'No live squad, digital twin, or episodic memory data was available.',
    }))
    return { reasoner: name, recommendations, insights, warnings, evidence, durationMs: Date.now() - t0 }
  }

  const digitalTwin = platform.digitalTwin ?? null
  const fixture     = platform.fixture     ?? null

  // ── Concurrent injuries: systemic risk signal ─────────────────────────────
  const injured = digitalTwin?.injured ?? []
  if (injured.length >= 3) {
    const ev = { type: 'injury-count', value: `${injured.length} active injuries`, source: 'platform.digitalTwin' }
    evidence.push(ev)
    recommendations.push(makeRec({
      category:       CATEGORY.MEDICAL,
      priority:       injured.length >= 5 ? PRIORITY.HIGH : PRIORITY.MEDIUM,
      confidence:     80,
      title:          `${injured.length} active injuries — medical review recommended`,
      description:    `The digital twin is tracking ${injured.length} concurrent injuries. Elevated counts may indicate systemic training load or surface issues.`,
      action:         'Schedule a review with the medical team. Check training load data for contributing factors.',
      source:         'squad-reasoner',
      explainability: `${injured.length} simultaneous injuries exceeds the threshold of 3, triggering a systemic review.`,
      evidence:       [ev],
    }))
  }

  // ── High-severity medical alerts ──────────────────────────────────────────
  const medAlerts = (fixture?.medicalAlerts ?? []).filter(a => a.severity === 'HIGH')
  if (medAlerts.length > 0) {
    const ev = { type: 'medical-alert', value: `${medAlerts.length} HIGH alert(s)`, source: 'platform.fixture' }
    evidence.push(ev)
    recommendations.push(makeRec({
      category:       CATEGORY.MEDICAL,
      priority:       PRIORITY.HIGH,
      confidence:     90,
      title:          `${medAlerts.length} high-severity medical alert${medAlerts.length > 1 ? 's' : ''} — immediate review required`,
      description:    `Players with active HIGH alerts: ${medAlerts.map(a => a.name ?? a.playerId).join(', ')}.`,
      action:         'Confirm clearance status with medical officer before naming squad.',
      source:         'squad-reasoner',
      explainability: 'HIGH severity medical alerts require immediate coach and medical officer review.',
      evidence:       [ev],
    }))
  }

  // ── Squad depth below safe threshold ─────────────────────────────────────
  const squadStatus = fixture?.squadStatus ?? null
  if (squadStatus) {
    const available = squadStatus.available?.length ?? 0
    const uncertain = squadStatus.uncertain?.length ?? 0
    const total     = available + uncertain
    if (total < 20) {
      const ev = { type: 'squad-depth', value: `${total} available/uncertain`, source: 'platform.fixture' }
      evidence.push(ev)
      recommendations.push(makeRec({
        category:       CATEGORY.SELECTION,
        priority:       total < 15 ? PRIORITY.HIGH : PRIORITY.MEDIUM,
        confidence:     75,
        title:          `Squad depth low — ${total} confirmed or likely available`,
        description:    `${available} confirmed + ${uncertain} uncertain puts total depth below the 20-player minimum.`,
        action:         'Contact reserve or development squad to identify emergency cover.',
        source:         'squad-reasoner',
        explainability: 'Squads below 20 carry high late-withdrawal risk heading into match week.',
        evidence:       [ev],
      }))
    }
  }

  // ── Welfare: at-risk players ──────────────────────────────────────────────
  const atRisk = digitalTwin?.atRisk ?? []
  if (atRisk.length > 0) {
    const ev = { type: 'welfare-risk', value: `${atRisk.length} at-risk player(s)`, source: 'platform.digitalTwin' }
    evidence.push(ev)
    recommendations.push(makeRec({
      category:       CATEGORY.PLAYER_WELFARE,
      priority:       atRisk.length >= 3 ? PRIORITY.HIGH : PRIORITY.MEDIUM,
      confidence:     70,
      title:          `${atRisk.length} player${atRisk.length > 1 ? 's' : ''} flagged at welfare risk`,
      description:    `The digital twin has identified ${atRisk.length} player(s) with elevated welfare risk signals.`,
      action:         'Make direct contact with flagged players this week and log welfare notes.',
      source:         'squad-reasoner',
      explainability: 'Digital twin welfare scoring considers attendance, load, and engagement patterns.',
      evidence:       [ev],
    }))
  }

  // ── Episodic memory: enrich insights ─────────────────────────────────────
  if ((em.playerCount ?? 0) > 0) {
    insights.push({ key: 'tracked-players', value: em.playerCount, confidence: 95 })
  }
  if ((em.teamCount ?? 0) > 0) {
    insights.push({ key: 'tracked-teams', value: em.teamCount, confidence: 95 })
  }

  // ── M9: Observation-based enrichment (additive only) ─────────────────────
  if (observations.length > 0) {
    const absenceObs      = observations.filter(o => o.observationType === 'REPEATED_ABSENCE')
    const attendanceObs   = observations.filter(o => o.observationType === 'ATTENDANCE_TREND')
    const availabilityObs = observations.filter(o => o.observationType === 'PLAYER_AVAILABILITY_TREND')

    // REPEATED_ABSENCE: warning + recommendation per affected entity
    for (const obs of absenceObs) {
      const ev = obsEvidence(obs)
      evidence.push(ev)
      warnings.push({
        message:       `Repeated absence signal for ${obs.entity.id}: ${obs.explanation}`,
        severity:      'low',
        observationId: obs.id,
      })
      recommendations.push(makeRec({
        category:       CATEGORY.PLAYER_WELFARE,
        priority:       PRIORITY.LOW,
        confidence:     obs.confidence,
        title:          `Check multi-session attendance for ${obs.entity.id}`,
        description:    obs.explanation,
        action:         'Review attendance records and make direct contact with the player.',
        source:         'squad-reasoner/observation',
        explainability: `Memory observation (${obs.id}) flagged limited multi-session presence for this entity.`,
        evidence:       [ev],
      }))
    }

    // ATTENDANCE_TREND: insight (regular/occasional) or warning (infrequent)
    for (const obs of attendanceObs) {
      const ev     = obsEvidence(obs)
      const signal = obs.metadata?.attendanceSignal
      evidence.push(ev)
      if (signal === 'infrequent') {
        warnings.push({
          message:       `Infrequent attendance pattern for ${obs.entity.id}`,
          severity:      'low',
          observationId: obs.id,
        })
      } else {
        insights.push({
          key:           `attendance-${obs.entity.id}`,
          value:         signal ?? 'observed',
          confidence:    obs.confidence,
          observationId: obs.id,
        })
      }
    }

    // PLAYER_AVAILABILITY_TREND: aggregate insight across all players with data
    if (availabilityObs.length > 0) {
      const avgConf = Math.round(
        availabilityObs.reduce((sum, o) => sum + o.confidence, 0) / availabilityObs.length
      )
      for (const obs of availabilityObs) {
        evidence.push(obsEvidence(obs))
      }
      insights.push({
        key:        'player-availability-observations',
        value:      availabilityObs.length,
        confidence: avgConf,
      })
    }
  }

  return { reasoner: name, recommendations, insights, warnings, evidence, durationMs: Date.now() - t0 }
}
