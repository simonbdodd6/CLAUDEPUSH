/**
 * AI Brain — Coach Reasoner
 *
 * Domain: match preparation, training load, selection decisions.
 * Reads: bundle.platform.fixture, bundle.platform.attendanceData, bundle.workingMemory.
 * Rules: no external calls, no provider access, pure reasoning over the ContextBundle.
 *
 * M9: Also accepts an optional observations array from the Memory/Observation layer.
 * When observations = [] (default), behaviour is identical to M4.
 * Observation types consumed: COACH_BEHAVIOUR, SESSION_LOAD.
 */

import { makeRec, CATEGORY, PRIORITY } from './shared.js'

export const name = 'coach'

// Evidence item helper for observation citations
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
  const wm       = bundle?.workingMemory ?? {}

  // Detect cold-start: no usable platform data at all
  const noLiveData =
    platform.fixture        == null &&
    platform.digitalTwin    == null &&
    platform.attendanceData == null

  if (noLiveData) {
    recommendations.push(makeRec({
      category:       CATEGORY.TRAINING,
      priority:       PRIORITY.MEDIUM,
      confidence:     50,
      title:          'No live match data — connect fixture feed to unlock coaching recommendations',
      description:    'Coaching recommendations are generated from live fixture, squad, and attendance data.',
      action:         'Go to Settings > Integrations and connect your fixture management system.',
      source:         'coach-reasoner/mock',
      explainability: 'No live fixture or attendance data was available in the Context Bundle.',
    }))
    return { reasoner: name, recommendations, insights, warnings, evidence, durationMs: Date.now() - t0 }
  }

  const fixture    = platform.fixture        ?? null
  const attendance = platform.attendanceData ?? null

  // ── Fixture proximity: reduce training load before kickoff ─────────────────
  if (fixture) {
    const daysOut = fixture.daysToKickoff ?? null
    if (daysOut != null && daysOut <= 3) {
      const ev = { type: 'fixture-proximity', value: `${daysOut}d to kickoff`, source: 'platform.fixture' }
      evidence.push(ev)
      recommendations.push(makeRec({
        category:       CATEGORY.TRAINING,
        priority:       PRIORITY.MEDIUM,
        confidence:     80,
        title:          'Match week: reduce training load to protect freshness',
        description:    `Kickoff is ${daysOut} day${daysOut === 1 ? '' : 's'} away — shift sessions to activation and pattern reinforcement.`,
        action:         'Cap intensity at 70% for remaining sessions. Remove contact drills.',
        source:         'coach-reasoner',
        explainability: `With ${daysOut}d to kickoff, a load reduction is recommended to protect player freshness.`,
        evidence:       [ev],
      }))
    }

    // ── Position shortage ─────────────────────────────────────────────────────
    const unavailable = fixture.squadStatus?.unavailable ?? []
    if (unavailable.length >= 2) {
      const byPos = {}
      for (const p of unavailable) {
        const pos = p.position ?? 'Unknown'
        byPos[pos] = (byPos[pos] ?? []).concat(p)
      }
      const crisis = Object.entries(byPos)
        .filter(([, ps]) => ps.length >= 2)
        .sort((a, b) => b[1].length - a[1].length)[0]
      if (crisis) {
        const [pos, players] = crisis
        const urgent = fixture.daysToKickoff != null && fixture.daysToKickoff <= 7
        const ev = { type: 'position-shortage', value: `${players.length} ${pos} unavailable`, source: 'platform.fixture' }
        evidence.push(ev)
        recommendations.push(makeRec({
          category:       CATEGORY.SELECTION,
          priority:       urgent ? PRIORITY.HIGH : PRIORITY.MEDIUM,
          confidence:     85,
          title:          `${players.length} ${pos} players unavailable — selection decision needed`,
          description:    `${players.map(p => p.name).join(', ')} are unavailable in the same position group.`,
          action:         'Review selection options and identify cover players.',
          source:         'coach-reasoner',
          explainability: `Multiple unavailabilities in ${pos} create selection risk.`,
          evidence:       [ev],
        }))
      }
    }
  }

  // ── Attendance below target ────────────────────────────────────────────────
  if (attendance) {
    const rate = attendance.averageRate ?? attendance.averageAttendance ?? attendance.rate ?? null
    if (rate != null && rate < 80) {
      const ev = { type: 'attendance-rate', value: `${rate}%`, source: 'platform.attendanceData' }
      evidence.push(ev)
      recommendations.push(makeRec({
        category:       CATEGORY.TRAINING,
        priority:       rate < 65 ? PRIORITY.HIGH : PRIORITY.MEDIUM,
        confidence:     70,
        title:          `Training attendance at ${rate}% — engagement intervention needed`,
        description:    `Average training turnout has fallen to ${rate}%, below the 80% target.`,
        action:         'Review training schedule. Speak directly with regularly-absent players.',
        source:         'coach-reasoner',
        explainability: 'Attendance below 80% triggers an engagement review recommendation.',
        evidence:       [ev],
      }))
    }
  }

  // ── Working memory: active high-priority intelligence items ───────────────
  const recentEvents = wm.recentEvents ?? []
  const activeHigh   = recentEvents.filter(e => e.priority === 'HIGH' || e.status === 'active')
  if (activeHigh.length > 0) {
    insights.push({ key: 'active-high-priority-events', value: activeHigh.length, confidence: 90 })
  }
  if (typeof wm.total === 'number' && wm.total > 20) {
    warnings.push({ message: `Intelligence timeline has ${wm.total} events — consider reviewing resolved items`, severity: 'low' })
  }

  // ── M9: Observation-based enrichment (additive only) ─────────────────────
  if (observations.length > 0) {
    const coachBehaviourObs = observations.filter(o => o.observationType === 'COACH_BEHAVIOUR')
    const sessionLoadObs    = observations.filter(o => o.observationType === 'SESSION_LOAD')

    // COACH_BEHAVIOUR: insight or warning depending on signal
    for (const obs of coachBehaviourObs) {
      const ev = obsEvidence(obs)
      evidence.push(ev)
      const signal = obs.metadata?.signal
      if (signal === 'receptive') {
        const pct = obs.metadata?.positiveRate != null
          ? Math.round(obs.metadata.positiveRate * 100) + '%'
          : 'positive'
        insights.push({
          key:           'coach-ai-engagement',
          value:         `receptive — ${pct} acceptance rate`,
          confidence:    obs.confidence,
          observationId: obs.id,
        })
      } else if (signal === 'dismissive') {
        warnings.push({
          message:       `Coach shows low AI acceptance: ${obs.explanation}`,
          severity:      'low',
          observationId: obs.id,
        })
      } else if (signal === 'mixed') {
        insights.push({
          key:           'coach-ai-engagement',
          value:         'mixed engagement',
          confidence:    obs.confidence,
          observationId: obs.id,
        })
      }
    }

    // SESSION_LOAD: insight about recent session intensity
    for (const obs of sessionLoadObs) {
      evidence.push(obsEvidence(obs))
      insights.push({
        key:           'session-load',
        value:         obs.metadata?.loadLevel ?? 'unknown',
        confidence:    obs.confidence,
        observationId: obs.id,
      })
    }
  }

  return { reasoner: name, recommendations, insights, warnings, evidence, durationMs: Date.now() - t0 }
}
