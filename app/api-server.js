#!/usr/bin/env node
// Coach's Eye Command Centre — API Server
// Bridges the Node.js platform layer to the React frontend over HTTP.
// Start: node app/api-server.js
// Port:  3001

import { createServer } from 'http'
import { URL } from 'url'

const PORT = process.env.PORT ?? 3001

function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(data))
}

function err(res, message, status = 500) {
  json(res, { error: message }, status)
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}) }
      catch { reject(new Error('Invalid JSON')) }
    })
    req.on('error', reject)
  })
}

// ── Route table ───────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') { json(res, {}, 204); return; }

  const url    = new URL(req.url, `http://localhost:${PORT}`)
  const path   = url.pathname
  const method = req.method

  try {
    // ── Health ────────────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/health') {
      json(res, { status: 'ok', platform: 'Coach\'s Eye', timestamp: new Date().toISOString() })
      return
    }

    // ── Actions ───────────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/actions') {
      const { ALL_ACTIONS } = await import('../actions/action-registry.js')
      const safe = ALL_ACTIONS.map(a => ({
        id: a.id, name: a.name, category: a.category, description: a.description,
        requiredEngines: a.requiredEngines, requiredPermissions: a.requiredPermissions,
        estimatedRuntimeMs: a.estimatedRuntimeMs, sendsComms: a.sendsComms ?? false,
        requiresApproval: a.requiresApproval ?? false, tags: a.tags ?? [], inputs: a.inputs ?? [],
        nlTriggers: a.nlTriggers.map(r => r.toString()),
      }))
      json(res, safe)
      return
    }

    if (method === 'POST' && path === '/api/actions/run') {
      const body = await readBody(req)
      const { actionId, params = {}, context = {} } = body
      const { run } = await import('../actions/action-runner.js')
      const result = await run(actionId, params, { role: 'coach', ...context })
      json(res, result)
      return
    }

    if (method === 'POST' && path === '/api/actions/preview') {
      const body = await readBody(req)
      const { actionId, params = {}, context = {} } = body
      const { preview } = await import('../actions/action-runner.js')
      const result = await preview(actionId, params, { role: 'coach', ...context })
      json(res, result)
      return
    }

    if (method === 'POST' && path === '/api/nl') {
      const body = await readBody(req)
      const { text, role = 'coach' } = body
      const { runFromNL } = await import('../actions/action-runner.js')
      const result = await runFromNL(text, { role })
      json(res, result)
      return
    }

    if (method === 'GET' && path === '/api/actions/resolve') {
      const text = url.searchParams.get('q') ?? ''
      const { resolveFromNL, ALL_ACTIONS } = await import('../actions/action-registry.js')
      const match = resolveFromNL(text)
      if (match) {
        const a = match.action
        json(res, { resolved: true, actionId: a.id, name: a.name, category: a.category, confidence: match.confidence })
      } else {
        json(res, { resolved: false })
      }
      return
    }

    // ── Club health ───────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/club/health') {
      try {
        const { buildClubHealthScore } = await import('../season-intelligence/index.js')
        const clubScore = buildClubHealthScore([], {})
        const domains = {}
        for (const [key, dim] of Object.entries(clubScore.clubDimensions ?? {})) {
          domains[key] = dim.score ?? 0
        }
        json(res, {
          health: {
            overallScore: clubScore.overall,
            trend:        clubScore.trend,
            grade:        clubScore.grade,
            status:       clubScore.status,
            phase:        clubScore.phase,
            phaseLabel:   clubScore.phaseLabel,
            domains,
            notes:          clubScore.notes,
            weakDimensions: clubScore.weakDimensions,
          },
          insights: (clubScore.weakDimensions ?? []).slice(0, 3).map(w => ({
            title:       w.note ?? w.dimension,
            description: `${w.dimension} score: ${w.score}/100`,
            priority:    1,
          })),
        })
      } catch {
        const { getClubHealth, getInsights } = await import('../qa/club-intelligence/index.js')
        const [health, insights] = await Promise.all([
          getClubHealth().catch(() => ({ overallScore: 52, trend: 'stable', isMock: true })),
          getInsights().catch(() => []),
        ])
        json(res, { health, insights })
      }
      return
    }

    // ── Season phase ──────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/season/phase') {
      const { detectCurrentPhase, getPhaseMeta, getPrescription } = await import('../season-intelligence/index.js')
      const phase = detectCurrentPhase()
      const meta  = getPhaseMeta(phase)
      const presc = getPrescription(phase)
      json(res, { phase, meta, prescription: presc })
      return
    }

    // ── Knowledge ─────────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/knowledge/ask') {
      const q = url.searchParams.get('q') ?? ''
      const { ask } = await import('../knowledge-engine/index.js')
      const result = await ask(q, { role: 'coach' })
      json(res, result)
      return
    }

    // ── Alerts ────────────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/alerts/injuries') {
      const { ask } = await import('../knowledge-engine/index.js')
      const result = await ask('Show all injured players.', { role: 'coach' })
      json(res, { injuries: result.data ?? [], summary: result.answer, count: result.count ?? 0 })
      return
    }

    if (method === 'GET' && path === '/api/alerts/attendance') {
      const { ask } = await import('../knowledge-engine/index.js')
      const result = await ask('Who has missed the most training this season?', { role: 'coach' })
      json(res, { absentees: result.data ?? [], summary: result.answer, count: result.count ?? 0 })
      return
    }

    // ── Recommendations ───────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/recommendations') {
      try {
        const { generate, buildContext } = await import('../recommendation-engine/index.js')

        // Assemble context from all available engines — each import is best-effort
        const [fixtureResult, twinResult, seasonResult, attendanceResult] = await Promise.allSettled([
          Promise.all([
            import('../fixture-engine/fixture-store.js'),
            import('../fixture-engine/fixture-schema.js'),
          ]).then(([store, schema]) => {
            const f = store.listUpcomingFixtures?.(1)?.[0] ?? null
            return f ? schema.serializeFixture(f) : null
          }),
          import('../club-digital-twin/index.js').then(async m => {
            const club = await m.getClub().catch(() => null)
            return club ? { injured: club.players?.injured ?? [], atRisk: club.players?.atRisk ?? [] } : null
          }),
          import('../season-intelligence/index.js').then(m => m.detectCurrentPhase?.() ?? null),
          import('../autonomous-assistant/observation-engine.js').then(async m => {
            const obs = await m.observe().catch(() => null)
            return obs?.attendance ?? null
          }),
        ])

        const ctx = buildContext({
          fixture:        fixtureResult.status  === 'fulfilled' ? fixtureResult.value  : null,
          digitalTwin:    twinResult.status     === 'fulfilled' ? twinResult.value     : null,
          seasonData:     seasonResult.status   === 'fulfilled' ? seasonResult.value   : null,
          attendanceData: attendanceResult.status === 'fulfilled' ? attendanceResult.value : null,
        })

        const { recommendations, meta } = generate(ctx, { maxResults: 8 })
        json(res, { recommendations, meta })
      } catch (e) {
        // Hard fallback: run the engine in mock mode so the UI always has data
        const { generate } = await import('../recommendation-engine/index.js').catch(() => ({ generate: () => ({ recommendations: [], meta: {} }) }))
        const { recommendations, meta } = generate({}, { useMockFallback: true })
        json(res, { recommendations, meta, error: e.message })
      }
      return
    }

    // ── Recommendation decisions ───────────────────────────────────────────────
    const recMatch = path.match(/^\/api\/recommendations\/([^/]+)\/(accept|snooze|dismiss)$/)
    if (method === 'POST' && recMatch) {
      const [, id, action] = recMatch
      const body = await readBody(req)
      const { getActiveRecommendations, resolve, snooze, dismiss } = await import('../autonomous-assistant/index.js')
      const { recordOutcome, COACH_DECISION } = await import('../learning-engine/index.js')
      const recs = await getActiveRecommendations().catch(() => [])
      const rec  = recs.find(r => r.id === id)
      if (action === 'accept') {
        resolve(id)
        if (rec) recordOutcome({ recommendationId: id, recommendationType: rec.type, coachDecision: COACH_DECISION.ACCEPTED, confidenceAtTime: rec.confidence, predictionCorrect: body.predictionCorrect ?? null })
      } else if (action === 'snooze') {
        snooze(id, body.hours ?? 24)
        if (rec) recordOutcome({ recommendationId: id, recommendationType: rec.type, coachDecision: COACH_DECISION.SNOOZED, confidenceAtTime: rec.confidence })
      } else {
        dismiss(id)
        if (rec) recordOutcome({ recommendationId: id, recommendationType: rec.type, coachDecision: COACH_DECISION.REJECTED, confidenceAtTime: rec.confidence })
      }
      json(res, { ok: true, id, action })
      return
    }

    // ── Action history ────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/history') {
      const { getHistory, historyStats } = await import('../actions/action-history.js')
      const history = getHistory(20)
      const stats   = historyStats()
      json(res, { history, stats })
      return
    }

    // ── Platform diagnostics ──────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/platform/status') {
      const { boot, listEngines, registryStats } = await import('../platform/platform-registry.js')
      boot()
      json(res, { engines: listEngines().length, stats: registryStats() })
      return
    }

    // ── Dashboard (full briefing) ─────────────────────────────────────────────
    if (method === 'GET' && path === '/api/dashboard/briefing') {
      const { runMorningBriefing } = await import('../autonomous-assistant/index.js')
      const result = await runMorningBriefing().catch(() => null)
      if (!result) {
        const role = url.searchParams.get('role') ?? 'coach'
        const { buildMorningBriefing } = await import('../dashboard/index.js')
        const fallback = await buildMorningBriefing(role).catch(() => ({ isMock: true, headline: 'Briefing unavailable' }))
        json(res, fallback)
        return
      }
      const urgencyLevel = u => (u === 'CRITICAL' || u === 'HIGH') ? 'high' : u === 'MEDIUM' ? 'medium' : 'low'
      const priorities = (result.topRecs ?? []).map(r => ({
        text:       r.title,
        urgency:    urgencyLevel(r.urgency),
        tag:        r.category ?? r.type,
        id:         r.id,
        confidence: r.confidence,
      }))
      json(res, {
        headline:   result.briefing?.headline ?? '',
        summary:    result.briefing?.summary  ?? '',
        severity:   result.briefing?.severity ?? 'NORMAL',
        priorities,
        stats:      result.briefing?.stats ?? {},
        lines:      result.briefing?.lines ?? [],
      })
      return
    }

    // ── Approvals ─────────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/approvals') {
      const { getPending, approvalStats } = await import('../dashboard/approval-centre/approval-manager.js')
        .catch(() => import('../dashboard/index.js').then(m => ({ getPending: () => [], approvalStats: () => ({ pending: 0 }) })))
      const items = getPending?.() ?? []
      json(res, { items, count: items.length })
      return
    }

    if (method === 'POST' && path === '/api/approvals/decide') {
      const body = await readBody(req)
      const { id, decision } = body
      const { resolve } = await import('../autonomous-assistant/index.js')
      resolve(id)
      json(res, { ok: true, id, decision })
      return
    }

    // ── Fixtures ─────────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/fixtures/upcoming') {
      const limit = parseInt(url.searchParams.get('limit') ?? '8', 10)
      const { getUpcomingFixtures } = await import('../fixture-engine/index.js')
      const fixtures = await getUpcomingFixtures(limit).catch(() => [])
      json(res, { fixtures })
      return
    }

    if (method === 'GET' && path === '/api/fixtures/next') {
      const { getNextFixture }    = await import('../fixture-engine/fixture-store.js')
      const { serializeFixture }  = await import('../fixture-engine/fixture-schema.js')
      const f = getNextFixture()
      json(res, f ? serializeFixture(f) : null)
      return
    }

    const fixtureIdMatch = path.match(/^\/api\/fixtures\/([^/]+)$/)
    if (method === 'GET' && fixtureIdMatch) {
      const [, id] = fixtureIdMatch
      const { getFixture }        = await import('../fixture-engine/fixture-store.js')
      const { serializeFixture }  = await import('../fixture-engine/fixture-schema.js')
      const f = getFixture(id)
      if (!f) { err(res, 'Fixture not found', 404); return }
      json(res, serializeFixture(f))
      return
    }

    const fixturePrepMatch = path.match(/^\/api\/fixtures\/([^/]+)\/prepare$/)
    if (method === 'POST' && fixturePrepMatch) {
      const [, id] = fixturePrepMatch
      const { prepareFixture }    = await import('../fixture-engine/index.js')
      const { serializeFixture }  = await import('../fixture-engine/fixture-schema.js')
      const f = await prepareFixture(id).catch(e => null)
      if (!f) { err(res, 'Prepare failed — fixture not found or engine unavailable', 404); return }
      json(res, serializeFixture(f))
      return
    }

    const fixturePackGenMatch = path.match(/^\/api\/fixtures\/([^/]+)\/pack\/generate$/)
    if (method === 'POST' && fixturePackGenMatch) {
      const [, id] = fixturePackGenMatch
      const { getFixture, saveFixture } = await import('../fixture-engine/fixture-store.js')
      const { generateMatchPack }       = await import('../fixture-engine/index.js')
      const { serializeFixture }        = await import('../fixture-engine/fixture-schema.js')
      const f = getFixture(id)
      if (!f) { err(res, 'Fixture not found', 404); return }
      const pack = await generateMatchPack(f).catch(e => ({ error: e.message, generated: false }))
      if (!pack.error) { f.matchPack = pack; saveFixture(f) }
      json(res, pack)
      return
    }

    const fixturePackMatch = path.match(/^\/api\/fixtures\/([^/]+)\/pack$/)
    if (method === 'GET' && fixturePackMatch) {
      const [, id] = fixturePackMatch
      const { getFixture }       = await import('../fixture-engine/fixture-store.js')
      const { serializeFixture } = await import('../fixture-engine/fixture-schema.js')
      const f = getFixture(id)
      if (!f) { err(res, 'Fixture not found', 404); return }
      const s = serializeFixture(f)
      if (!s.matchPack) { err(res, 'No match pack. POST /api/fixtures/:id/pack/generate first', 404); return }
      json(res, s.matchPack)
      return
    }

    // ── Availability Intelligence ─────────────────────────────────────────────
    if (method === 'GET' && path === '/api/availability/intelligence') {
      try {
        const [{ observe }, { detectCurrentPhase, getPrescription }, { ask }] = await Promise.all([
          import('../autonomous-assistant/observation-engine.js'),
          import('../season-intelligence/index.js'),
          import('../knowledge-engine/index.js'),
        ])

        const phase = detectCurrentPhase()
        const presc = getPrescription(phase)
        const target = presc.attendanceExpectation?.target ?? 80
        const minimum = presc.attendanceExpectation?.minimum ?? 70
        const phaseNote = presc.attendanceExpectation?.note ?? ''

        // Observation engine gives us aggregate attendance + declining teams
        const obs = await observe().catch(() => null)
        const attObs = obs?.attendance ?? null
        const averageRate = attObs?.averageRate ?? null
        const trend = attObs?.weeklyTrend ?? 'unknown'
        const decliningTeams = attObs?.decliningTeams ?? []

        // Per-player at-risk data from digital twin
        let atRisk = []
        try {
          const { runDigitalTwin } = await import('../club-digital-twin/index.js')
          const twin = await runDigitalTwin({ lightweight: true }).catch(() => null)
          const players = twin?.club?.players?.list ?? twin?.players ?? []
          // Build per-player at-risk list from attendanceRate
          atRisk = players
            .filter(p => p.attendanceRate != null && p.attendanceRate < 70)
            .map(p => ({
              id:            p.id,
              name:          p.name,
              ageGroup:      p.ageGroup ?? null,
              attendanceRate: p.attendanceRate,
              retentionRisk: p.retentionRisk ?? 'unknown',
              risk:          (p.attendanceRate < 50 || p.retentionRisk === 'high') ? 'high' : 'medium',
              reason:        p.attendanceRate < 50
                ? 'Critical attendance — below 50%'
                : p.retentionRisk === 'high'
                  ? 'Flagged at retention risk'
                  : 'Attendance below session minimum',
            }))
            .sort((a, b) => a.attendanceRate - b.attendanceRate)
            .slice(0, 10)
        } catch { /* atRisk stays empty — graceful */ }

        // Session prediction: extrapolate from current rate + trend
        const predictedRate = trend === 'declining'
          ? Math.max(0, (averageRate ?? minimum) - 5)
          : trend === 'strong'
            ? Math.min(100, (averageRate ?? target) + 3)
            : averageRate ?? target
        const sessionPrediction = {
          label:      'Next Training Session',
          predicted:  Math.round(predictedRate),
          basis:      trend === 'declining' ? 'Current declining trend' : trend === 'strong' ? 'Positive attendance momentum' : 'Stable attendance pattern',
          confidence: attObs?.confidence ?? 45,
          warning:    predictedRate < minimum ? `Predicted below ${minimum}% minimum` : null,
        }

        // AI recommendations filtered for availability/welfare
        let recommendations = []
        try {
          const { getActiveRecommendations } = await import('../autonomous-assistant/index.js')
          const recs = await getActiveRecommendations().catch(() => [])
          const AVAILABILITY_KEYWORDS = ['attendance', 'availability', 'welfare', 'player', 'engagement', 'training', 'turnout']
          const urgencyToEffort = u => (u === 'CRITICAL' || u === 'HIGH') ? 'high' : u === 'MEDIUM' ? 'medium' : 'low'
          recommendations = recs
            .filter(r => {
              const text = ((r.title ?? '') + ' ' + (r.reason ?? '') + ' ' + (r.category ?? '')).toLowerCase()
              return AVAILABILITY_KEYWORDS.some(k => text.includes(k))
            })
            .slice(0, 4)
            .map((r, i) => ({
              id:       r.id,
              action:   r.title,
              why:      r.reason,
              effort:   urgencyToEffort(r.urgency),
              priority: i + 1,
            }))
        } catch { /* no recommendations */ }

        // AI narrative via knowledge engine
        let narrative = null
        if (averageRate != null) {
          const q = `Squad attendance is currently ${averageRate}% (target: ${target}%). Trend is ${trend}. ` +
            `${atRisk.length} players are below threshold. ` +
            `Write 1–2 sentences of actionable coaching advice for improving attendance.`
          const nr = await ask(q, { maxTokens: 150 }).catch(() => null)
          narrative = nr?.answer ?? null
        }

        json(res, {
          summary: {
            averageRate,
            trend,
            vsTarget: {
              current: averageRate,
              target,
              gap:     averageRate != null ? averageRate - target : null,
              status:  averageRate == null ? 'unknown' : averageRate >= target ? 'on-target' : averageRate >= minimum ? 'below-target' : 'critical',
            },
            atRiskCount: atRisk.length,
            decliningTeamCount: decliningTeams.length,
            phase,
            phaseLabel: presc.label ?? phase,
            confidence: attObs?.confidence ?? 45,
          },
          phaseTarget: { target, minimum, note: phaseNote, label: presc.label },
          atRisk,
          decliningTeams,
          sessionPrediction,
          recommendations,
          narrative,
          generatedAt: new Date().toISOString(),
        })
      } catch (e) {
        // Graceful fallback — return mock intelligence so UI always renders
        json(res, {
          summary: { averageRate: null, trend: 'unknown', vsTarget: { status: 'unknown' }, atRiskCount: 0, confidence: 0, phase: 'UNKNOWN' },
          phaseTarget: { target: 80, minimum: 70, note: 'Data unavailable', label: 'Unknown' },
          atRisk: [],
          decliningTeams: [],
          sessionPrediction: { label: 'Next Training Session', predicted: null, confidence: 0, warning: null },
          recommendations: [],
          narrative: null,
          error: e.message,
        })
      }
      return
    }

    // ── AI Timeline ───────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/timeline') {
      const { runCheck } = await import('../autonomous-assistant/index.js')
      const result = await runCheck({ saveToState: false }).catch(() => null)
      const timeline = result?.timeline ?? { byDay: [], totalEvents: 0, automatableCount: 0 }
      json(res, timeline)
      return
    }

    // ── Learning / CIS status ─────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/learning/status') {
      const { computeClubIntelligenceScore } = await import('../learning-engine/index.js')
      const { getPredictionAccuracy }         = await import('../learning-engine/index.js')
      const [cis, accuracy] = await Promise.all([
        Promise.resolve().then(() => computeClubIntelligenceScore()).catch(() => ({ score: 0, grade: 'N/A', stage: 'COLD_START', components: {} })),
        Promise.resolve().then(() => getPredictionAccuracy()).catch(() => ({ overall: { f1: 0, grade: 'N/A', precision: 0, recall: 0 } })),
      ])
      json(res, { cis, accuracy })
      return
    }

    // ── 404 ───────────────────────────────────────────────────────────────────
    err(res, `Route not found: ${method} ${path}`, 404)

  } catch (e) {
    console.error(`[api-server] ${method} ${path}:`, e.message)
    err(res, e.message)
  }
})

server.listen(PORT, () => {
  console.log(`\n🏉 Coach's Eye API Server`)
  console.log(`   Listening on http://localhost:${PORT}/api`)
  console.log(`   React UI at    http://localhost:5173\n`)
})
