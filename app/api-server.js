#!/usr/bin/env node
// Coach's Eye Command Centre — API Server
// Bridges the Node.js platform layer to the React frontend over HTTP.
// Start: node app/api-server.js
// Port:  3001

import { createServer } from 'http'
import { URL } from 'url'

const PORT = process.env.PORT ?? 3001

// Debounce guard: prevent flooding timeline/graph on every page load.
// Recommendations are appended to the timeline at most once per 5 minutes.
let _lastTimelineAppend = 0
const TIMELINE_APPEND_INTERVAL_MS = 5 * 60 * 1000

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
  const params = Object.fromEntries(url.searchParams)

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

    if (method === 'POST' && path === '/api/knowledge/ask') {
      const body = await readBody(req)
      const { question = '', role = 'coach', useCache = true } = body
      if (!question.trim()) { res.writeHead(400); res.end(JSON.stringify({ error: 'question required' })); return }
      const { ask } = await import('../knowledge-engine/index.js')
      const result = await ask(question, { role, useCache })
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

    // ── Intelligence Dashboard ────────────────────────────────────────────────
    // Feature flag: aiDashboard  All six sections aggregated in one response.
    if (method === 'GET' && path === '/api/intelligence/dashboard') {
      try {
        const [recResult, healthResult, availResult, fixtureResult, twinResult, timelineResult] = await Promise.allSettled([
          // Recommendations — top 5
          import('../recommendation-engine/index.js').then(async m => {
            const { value: fixtureVal } = await Promise.allSettled([
              import('../fixture-engine/fixture-store.js').then(async s => {
                const { serializeFixture } = await import('../fixture-engine/fixture-schema.js')
                const f = s.listUpcomingFixtures?.(1)?.[0] ?? null
                return f ? serializeFixture(f) : null
              })
            ]).then(([r]) => r.status === 'fulfilled' ? { value: r.value } : { value: null })
            const ctx = m.buildContext({ fixture: fixtureVal })
            return m.generate(ctx, { maxResults: 5 })
          }),
          // Club health score
          import('../season-intelligence/index.js').then(async m => {
            const score = await m.buildClubHealthScore?.().catch(() => null)
            return score
          }),
          // Availability intelligence
          import('../autonomous-assistant/observation-engine.js').then(async m => {
            const obs = await m.observe().catch(() => null)
            return obs
          }),
          // Next fixture (serialized)
          import('../fixture-engine/fixture-store.js').then(async s => {
            const { serializeFixture } = await import('../fixture-engine/fixture-schema.js')
            const f = s.listUpcomingFixtures?.(1)?.[0] ?? null
            return f ? serializeFixture(f) : null
          }),
          // Digital twin
          import('../club-digital-twin/index.js').then(async m => {
            const club = await m.getClub().catch(() => null)
            return club
          }),
          // Timeline — last 10
          import('../intelligence-timeline/index.js').then(m => m.getTimeline({ limit: 10 })),
        ])

        const recs     = recResult.status     === 'fulfilled' ? recResult.value     : null
        const health   = healthResult.status  === 'fulfilled' ? healthResult.value  : null
        const obs      = availResult.status   === 'fulfilled' ? availResult.value   : null
        const fixture  = fixtureResult.status === 'fulfilled' ? fixtureResult.value : null
        const twin     = twinResult.status    === 'fulfilled' ? twinResult.value    : null
        const tl       = timelineResult.status === 'fulfilled' ? timelineResult.value : null

        // Section 1: Club Intelligence Score
        const clubScore = health ? {
          overall:    health.overallScore ?? health.overall ?? null,
          trend:      health.trend ?? 'stable',
          confidence: health.confidence ?? 65,
          components: health.domains ?? health.components ?? {},
          delta:      health.delta ?? null,
        } : null

        // Section 2: Observations (top 5 from observation engine)
        const obsItems = []
        if (obs?.attendance?.decliningTeams?.length) {
          const w = obs.attendance.decliningTeams[0]
          obsItems.push({ id: 'obs-att', engine: 'attendance-engine', severity: 'high',
            title: `${w.name} attendance ${w.rate}%`, description: `Declining ${Math.abs(w.trend ?? 0)}% per week.`, timestamp: new Date().toISOString() })
        }
        if (obs?.injuries?.total > 0) {
          obsItems.push({ id: 'obs-inj', engine: 'digital-twin', severity: obs.injuries.total >= 4 ? 'high' : 'medium',
            title: `${obs.injuries.total} active injuries`, description: obs.injuries.critical ? `${obs.injuries.critical} critical.` : 'Review injury register.', timestamp: new Date().toISOString() })
        }
        if (obs?.weather?.saturdayRisk && obs.weather.saturdayRisk !== 'CLEAR') {
          obsItems.push({ id: 'obs-wth', engine: 'weather-service', severity: 'low',
            title: `${obs.weather.saturdayRisk} forecast`, description: obs.weather.forecast ?? 'Adverse conditions this weekend.', timestamp: new Date().toISOString() })
        }
        if (obs?.approvals?.pending > 0) {
          obsItems.push({ id: 'obs-app', engine: 'governance-engine', severity: obs.approvals.overdue > 0 ? 'high' : 'medium',
            title: `${obs.approvals.pending} items awaiting approval`, description: `${obs.approvals.overdue ?? 0} overdue.`, timestamp: new Date().toISOString() })
        }
        if (obs?.memberships?.expiringThisWeek > 0) {
          obsItems.push({ id: 'obs-mem', engine: 'membership-engine', severity: 'medium',
            title: `${obs.memberships.expiringThisWeek} memberships expiring`, description: 'Renewal window active.', timestamp: new Date().toISOString() })
        }

        // Section 3: Top Recommendations
        const topRecs = recs?.recommendations?.slice(0, 5) ?? []

        // Section 4: Squad Health
        const squadHealth = {
          availabilityPct: null,
          injuryCount:     obs?.injuries?.total ?? (twin?.players?.injuredCount ?? 0),
          uncertainCount:  fixture?.squadStatus?.uncertain?.length ?? 0,
          atRisk:          twin?.players?.atRisk?.slice(0, 3) ?? [],
          availableCount:  fixture?.squadStatus?.available?.length ?? null,
          unavailableCount: fixture?.squadStatus?.unavailable?.length ?? null,
        }
        const avail = fixture?.squadStatus?.available?.length ?? 0
        const total = avail + (fixture?.squadStatus?.unavailable?.length ?? 0) + (fixture?.squadStatus?.uncertain?.length ?? 0)
        if (total > 0) squadHealth.availabilityPct = Math.round((avail / total) * 100)

        // Section 5: Fixture Readiness
        const fixtureReadiness = fixture ? {
          nextFixture: {
            id:           fixture.id,
            opponent:     fixture.opponent ?? 'Unknown',
            competition:  fixture.competition ?? '',
            daysToKickoff: fixture.daysToKickoff,
            prepStage:    fixture.prepStage,
            kickoff:      fixture.kickoff ?? fixture.date,
          },
          readinessPct:         squadHealth.availabilityPct,
          selectionConfidence:  squadHealth.injuryCount === 0 ? 90 : squadHealth.injuryCount <= 2 ? 72 : 55,
          trainingConfidence:   obs?.attendance?.averageRate ? Math.min(95, obs.attendance.averageRate) : null,
          medicalAlertCount:    fixture.medicalAlerts?.filter(a => a.severity === 'HIGH')?.length ?? 0,
        } : null

        // Section 6: Timeline
        // Persist live recommendations to the timeline + knowledge graph (debounced).
        // This is what gives the AI Brain its memory over time.
        const now = Date.now()
        if (topRecs.length > 0 && (now - _lastTimelineAppend) > TIMELINE_APPEND_INTERVAL_MS) {
          _lastTimelineAppend = now
          Promise.allSettled([
            import('../intelligence-timeline/index.js').then(m =>
              m.appendFromRecommendations(topRecs, {
                teamId:      fixture?.teamId      ?? null,
                teamName:    fixture?.teamName    ?? null,
                seasonPhase: recs?.meta?.seasonPhase ?? null,
                fixture,
              })
            ),
            import('../knowledge-graph/index.js').then(m => {
              m.bootGraph()
              m.syncRecommendations(topRecs, { engineId: 'eng-rec', coachId: 'coach-simon' })
            }),
          ]).catch(() => {}) // non-blocking — never fail the response
        }

        const tlData = tl ?? { events: [], total: 0, stats: {} }

        json(res, {
          clubScore,
          observations:      obsItems.length ? obsItems : null,
          recommendations:   topRecs,
          squadHealth,
          fixtureReadiness,
          timeline:          tlData,
          generatedAt:       new Date().toISOString(),
          isMock:            recs?.meta?.isMock ?? false,
          recsMeta:          recs?.meta ?? null,
        })
      } catch (e) {
        // If aggregation fails entirely, serve a fully mocked dashboard
        const { generate } = await import('../recommendation-engine/index.js').catch(() => ({ generate: () => ({ recommendations: [], meta: {} }) }))
        const { getTimeline } = await import('../intelligence-timeline/index.js').catch(() => ({ getTimeline: () => ({ events: [], total: 0 }) }))
        const { recommendations, meta } = generate({}, { useMockFallback: true, maxResults: 5 })
        const tl = getTimeline({ limit: 10 })
        json(res, {
          clubScore:         { overall: 58, trend: 'declining', confidence: 68, components: { engagement: 52, attendance: 68, governance: 71, finance: 61 }, delta: -5 },
          observations:      [
            { id: 'mo1', engine: 'attendance-engine', severity: 'high',   title: 'Senior A attendance 63%', description: 'Below target for 3 consecutive sessions.', timestamp: new Date().toISOString() },
            { id: 'mo2', engine: 'digital-twin',      severity: 'high',   title: '3 active injuries',       description: 'Prop, Lock and Centre positions affected.', timestamp: new Date().toISOString() },
            { id: 'mo3', engine: 'fixture-engine',    severity: 'medium', title: '2 props unavailable',     description: '5 days to kickoff — selection action needed.', timestamp: new Date().toISOString() },
            { id: 'mo4', engine: 'weather-service',   severity: 'low',    title: 'Heavy rain forecast',     description: 'Thursday/Friday training windows affected.', timestamp: new Date().toISOString() },
            { id: 'mo5', engine: 'governance-engine', severity: 'medium', title: '2 approvals pending',     description: '0 overdue. Review this week.', timestamp: new Date().toISOString() },
          ],
          recommendations,
          squadHealth:       { availabilityPct: 73, injuryCount: 3, uncertainCount: 1, atRisk: [{ id: 'p1', name: 'Séan Hennessy', attendanceRate: 48 }], availableCount: 10, unavailableCount: 3 },
          fixtureReadiness:  { nextFixture: { opponent: 'Naas RFC', competition: 'League', daysToKickoff: 5, prepStage: 'BUILD' }, readinessPct: 73, selectionConfidence: 72, trainingConfidence: 63, medicalAlertCount: 1 },
          timeline:          tl,
          generatedAt:       new Date().toISOString(),
          isMock:            true,
          error:             e.message,
        })
      }
      return
    }

    // ── Decision Centre ───────────────────────────────────────────────────────
    // Feature flag: aiDecisionCentre
    // Returns high-priority recs, pending decisions, completed decisions, history.
    if (method === 'GET' && path === '/api/intelligence/decisions') {
      try {
        const [recResult, twinResult, fixtureResult, tlResult] = await Promise.allSettled([
          import('../recommendation-engine/index.js').then(async m => {
            const [fRes] = await Promise.allSettled([
              import('../fixture-engine/fixture-store.js').then(async s => {
                const { serializeFixture } = await import('../fixture-engine/fixture-schema.js')
                const f = s.listUpcomingFixtures?.(1)?.[0] ?? null
                return f ? serializeFixture(f) : null
              }),
            ])
            const ctx = m.buildContext({ fixture: fRes.status === 'fulfilled' ? fRes.value : null })
            return m.generate(ctx, { maxResults: 8 })
          }),
          import('../club-digital-twin/index.js').then(m => m.getClub().catch(() => null)),
          import('../fixture-engine/fixture-store.js').then(async s => {
            const { serializeFixture } = await import('../fixture-engine/fixture-schema.js')
            const f = s.listUpcomingFixtures?.(1)?.[0] ?? null
            return f ? serializeFixture(f) : null
          }),
          import('../intelligence-timeline/index.js').then(m => m.getTimeline({ status: 'completed', limit: 10 })),
        ])

        const recs    = recResult.status    === 'fulfilled' ? recResult.value    : null
        const fixture = fixtureResult.status === 'fulfilled' ? fixtureResult.value : null
        const tlData  = tlResult.status     === 'fulfilled' ? tlResult.value     : null

        // High priority: top 5 recommendations
        const highPriority = (recs?.recommendations ?? []).slice(0, 5)

        // Pending decisions — mock cards representing decisions awaiting coach action
        const pending = [
          { id: 'pd1', type: 'publish_squad',    urgency: 'HIGH',   icon: 'squad',
            title:       'Publish squad for Saturday',
            description: fixture ? `${fixture.squadStatus?.available?.length ?? '?'} players confirmed for vs ${fixture.opponent ?? 'upcoming fixture'}.` : 'Squad confirmation ready to send.',
            team: 'Senior A', fixture: fixture ? `vs ${fixture.opponent}` : null,
            dueBy: fixture?.daysToKickoff != null ? `${fixture.daysToKickoff}d` : '5d',
            action: 'Send squad notification to all confirmed players.' },
          { id: 'pd2', type: 'contact_players',  urgency: 'HIGH',   icon: 'contact',
            title:       'Contact unavailable players',
            description: '2 prop players listed unavailable. Confirm reasons and explore cover options.',
            team: 'Senior A', fixture: null, dueBy: '2d',
            action: 'Send personalised message to Jack O\'Sullivan and Conor Lynch.' },
          { id: 'pd3', type: 'medical_followup', urgency: 'HIGH',   icon: 'medical',
            title:       'Medical follow-up: Ross Dunne',
            description: 'Concussion protocol step 3 due today. Medical officer confirmation required before contact training.',
            team: 'Senior A', fixture: null, dueBy: 'Today',
            action: 'Contact medical officer and log update in player profile.' },
          { id: 'pd4', type: 'adjust_training',  urgency: 'MEDIUM', icon: 'training',
            title:       'Adjust Tuesday session intensity',
            description: 'Match week taper recommended. Current plan shows full-contact session — should reduce to shape work only.',
            team: 'Senior A', fixture: fixture ? `vs ${fixture.opponent}` : null, dueBy: '1d',
            action: 'Modify Tuesday session plan: cap at 60 min, no contact above 50%.' },
          { id: 'pd5', type: 'fixture_prep',     urgency: 'LOW',    icon: 'fixture',
            title:       'Update fixture preparation notes',
            description: 'Match pack not yet generated for Saturday\'s fixture. Opposition analysis incomplete.',
            team: 'Senior A', fixture: fixture ? `vs ${fixture.opponent}` : null, dueBy: '3d',
            action: 'Generate match pack and assign opposition analysis to assistant coach.' },
        ]

        // Recently completed — from timeline completed events or mock
        const completedEvents = tlData?.events ?? []
        const recentlyCompleted = completedEvents.length > 0 ? completedEvents.slice(0, 5).map(e => ({
          id:        e.id,
          coach:     'Head Coach',
          decision:  e.title,
          timestamp: e.completedAt ?? e.timestamp,
          outcome:   'Action completed',
          category:  e.category,
          notes:     e.notes,
        })) : [
          { id: 'cc1', coach: 'Head Coach', decision: 'Approved load reduction — Tuesday session capped', timestamp: new Date(Date.now() - 2*86400000).toISOString(), outcome: 'Session modified. Squad freshness maintained.', category: 'Training' },
          { id: 'cc2', coach: 'Head Coach', decision: 'Medical clearance issued: Conor Lynch', timestamp: new Date(Date.now() - 3*86400000).toISOString(), outcome: 'Conor started as sub vs Clontarf. No re-injury.', category: 'Medical' },
          { id: 'cc3', coach: 'Head Coach', decision: 'Approved A/B rotation for back-to-back fixtures', timestamp: new Date(Date.now() - 7*86400000).toISOString(), outcome: '6 players rotated. No fatigue injuries reported.', category: 'Logistics' },
          { id: 'cc4', coach: 'Head Coach', decision: 'Video review completed — defensive line speed', timestamp: new Date(Date.now() - 14*86400000).toISOString(), outcome: 'Defensive improvement visible in next match: won 23-10.', category: 'Performance' },
        ]

        // Decision history — full timeline for filter UI
        const histQuery   = Object.fromEntries(new URL('http://x?' + (req.url.split('?')[1] ?? '')).searchParams)
        const { getTimeline, parseFilters } = await import('../intelligence-timeline/index.js')
        const histFilters = parseFilters(histQuery)
        const history     = getTimeline({ ...histFilters, limit: histFilters.limit ?? 30 })

        json(res, { highPriority, pending, recentlyCompleted, history, generatedAt: new Date().toISOString(), isMock: recs?.meta?.isMock ?? false })
      } catch (e) {
        const { generate } = await import('../recommendation-engine/index.js').catch(() => ({ generate: () => ({ recommendations: [] }) }))
        const { recommendations } = generate({}, { useMockFallback: true, maxResults: 5 })
        json(res, {
          highPriority:      recommendations,
          pending:           [],
          recentlyCompleted: [],
          history:           { events: [], total: 0 },
          generatedAt:       new Date().toISOString(),
          isMock:            true, error: e.message,
        })
      }
      return
    }

    if (method === 'POST' && path.match(/^\/api\/intelligence\/decisions\/([^/]+)\/(approve|dismiss|snooze)$/)) {
      const [, id, action] = path.match(/^\/api\/intelligence\/decisions\/([^/]+)\/(approve|dismiss|snooze)$/)
      const body = await readBody(req)

      const timelineStatus = action === 'approve' ? 'completed' : action === 'dismiss' ? 'ignored' : 'acknowledged'
      const learnDecision  = action === 'approve' ? 'ACCEPTED'  : action === 'dismiss' ? 'REJECTED' : 'SNOOZED'

      // 1. Update timeline event status (find by recommendationId OR id)
      const { getTimeline, updateStatus } = await import('../intelligence-timeline/index.js')
      const { events } = getTimeline({ limit: 500 })
      const tlEvent = events.find(e => e.recommendationId === id || e.id === id)
      if (tlEvent) updateStatus(tlEvent.id, timelineStatus, body.notes ?? null)

      // 2. Record outcome in learning engine for confidence calibration
      const { recordOutcome, COACH_DECISION } = await import('../learning-engine/index.js')
      recordOutcome({
        recommendationId:   id,
        recommendationType: tlEvent?.category ?? 'Unknown',
        coachDecision:      COACH_DECISION[learnDecision],
        confidenceAtTime:   tlEvent?.confidence ?? null,
        predictionCorrect:  body.predictionCorrect ?? null,
        notes:              body.notes ?? null,
      })

      // 3. Sync decision to knowledge graph
      import('../knowledge-graph/index.js').then(m => {
        m.bootGraph()
        m.syncDecision(action, id, body.notes ?? `Coach ${action}d`, 'coach-simon')
      }).catch(() => {})

      json(res, { ok: true, id, action, notes: body.notes ?? null, timelineUpdated: !!tlEvent })
      return
    }

    // ── Intelligence Timeline ─────────────────────────────────────────────────
    // Feature flag: aiTimeline (checked client-side; server always serves data)
    if (method === 'GET' && path === '/api/intelligence/timeline') {
      const { getTimeline, summarise, parseFilters } = await import('../intelligence-timeline/index.js')
      const query   = Object.fromEntries(new URL('http://x?' + (req.url.split('?')[1] ?? '')).searchParams)
      const filters = parseFilters(query)
      const result  = getTimeline(filters)
      const stats   = summarise(filters)
      json(res, { ...result, stats })
      return
    }

    if (method === 'POST' && path.startsWith('/api/intelligence/timeline/') && path.endsWith('/status')) {
      const id   = path.split('/')[4]
      const body = await readBody(req)
      const { updateStatus } = await import('../intelligence-timeline/index.js')
      const updated = updateStatus(id, body.status, body.notes ?? null)
      if (!updated) { err(res, 'Timeline event not found', 404); return }
      json(res, { ok: true, event: updated })
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

    // ── Knowledge Upload ──────────────────────────────────────────────────────

    if (method === 'GET' && path === '/api/knowledge/library') {
      const { getLibrary } = await import('../knowledge-engine/upload-engine.js')
      const filters = {
        category:  url.searchParams.get('category')  ?? undefined,
        ageGroup:  url.searchParams.get('ageGroup')  ?? undefined,
        team:      url.searchParams.get('team')      ?? undefined,
        season:    url.searchParams.get('season')    ?? undefined,
        fileType:  url.searchParams.get('fileType')  ?? undefined,
        status:    url.searchParams.get('status')    ?? undefined,
        q:         url.searchParams.get('q')         ?? undefined,
      }
      json(res, { ...getLibrary(filters), isMock: true })
      return
    }

    if (method === 'POST' && path === '/api/knowledge/upload') {
      const { createDocument, processDocument } = await import('../knowledge-engine/upload-engine.js')
      const body = await readBody(req)
      const doc  = createDocument(body)
      // Simulate async extraction: mark extracting immediately, return id
      // Client polls or calls /process after a delay
      doc.processingStatus = 'extracting'
      json(res, { success: true, document: doc })
      // Process after brief delay (mock extraction)
      setTimeout(() => {
        try { processDocument(doc.id) } catch (_) {}
      }, 1800)
      return
    }

    if (method === 'GET' && path.startsWith('/api/knowledge/library/')) {
      const id = path.replace('/api/knowledge/library/', '').split('/')[0]
      const { getDocument } = await import('../knowledge-engine/upload-engine.js')
      const doc = getDocument(id)
      if (!doc) { err(res, 'Document not found', 404); return }
      json(res, { document: doc })
      return
    }

    if (method === 'POST' && path.match(/^\/api\/knowledge\/library\/[^/]+\/add-to-dna$/)) {
      const id = path.split('/')[4]
      const { updateDocumentStatus } = await import('../knowledge-engine/upload-engine.js')
      const doc = updateDocumentStatus(id, 'added_to_knowledge_base')
      if (!doc) { err(res, 'Document not found', 404); return }
      // Sync to knowledge graph — Coach DNA knowledge base
      import('../knowledge-graph/index.js').then(m => {
        m.bootGraph()
        m.syncDocument(doc, { coachId: 'coach-simon', kbId: 'kb-coach-dna' })
      }).catch(() => {})
      json(res, { success: true, document: doc })
      return
    }

    if (method === 'POST' && path.match(/^\/api\/knowledge\/library\/[^/]+\/add-to-club$/)) {
      const id = path.split('/')[4]
      const { updateDocumentStatus } = await import('../knowledge-engine/upload-engine.js')
      const doc = updateDocumentStatus(id, 'added_to_knowledge_base')
      if (!doc) { err(res, 'Document not found', 404); return }
      // Sync to knowledge graph — Club Knowledge knowledge base
      import('../knowledge-graph/index.js').then(m => {
        m.bootGraph()
        m.syncDocument(doc, { coachId: 'coach-simon', kbId: 'kb-club' })
      }).catch(() => {})
      json(res, { success: true, document: doc })
      return
    }

    if (method === 'POST' && path.match(/^\/api\/knowledge\/library\/[^/]+\/flag-review$/)) {
      const id   = path.split('/')[4]
      const body = await readBody(req)
      const { updateDocumentStatus } = await import('../knowledge-engine/upload-engine.js')
      const doc  = updateDocumentStatus(id, 'reviewed', body.notes)
      if (!doc) { err(res, 'Document not found', 404); return }
      json(res, { success: true, document: doc })
      return
    }

    if (method === 'POST' && path.match(/^\/api\/knowledge\/library\/[^/]+\/status$/)) {
      const id   = path.split('/')[4]
      const body = await readBody(req)
      const { updateDocumentStatus } = await import('../knowledge-engine/upload-engine.js')
      const doc  = updateDocumentStatus(id, body.status, body.notes)
      if (!doc) { err(res, 'Document not found', 404); return }
      json(res, { success: true, document: doc })
      return
    }

    // ── Knowledge Graph ───────────────────────────────────────────────────────

    if (method === 'GET' && path === '/api/graph/nodes') {
      const { getAllNodes, bootGraph } = await import('../knowledge-graph/index.js')
      bootGraph()
      const { type, clubId, q } = params
      const { findNodes, graphStats } = await import('../knowledge-graph/index.js')
      if (q) {
        const { search } = await import('../knowledge-graph/index.js')
        json(res, search(q, { type, clubId, limit: 50 }))
      } else {
        json(res, findNodes({ type, clubId }))
      }
      return
    }

    if (method === 'GET' && path.match(/^\/api\/graph\/nodes\/[^/]+$/)) {
      const id = path.split('/')[4]
      const { getNode, bootGraph } = await import('../knowledge-graph/index.js')
      bootGraph()
      const node = getNode(id)
      if (!node) { err(res, 'Node not found', 404); return }
      json(res, node)
      return
    }

    if (method === 'GET' && path === '/api/graph/edges') {
      const { findEdges, bootGraph } = await import('../knowledge-graph/index.js')
      bootGraph()
      json(res, findEdges({ type: params.type, from: params.from, to: params.to }))
      return
    }

    if (method === 'GET' && path === '/api/graph/stats') {
      const { graphStats, bootGraph } = await import('../knowledge-graph/index.js')
      bootGraph()
      json(res, graphStats())
      return
    }

    if (method === 'GET' && path.match(/^\/api\/graph\/expand\/[^/]+$/)) {
      const id    = path.split('/')[4]
      const depth = parseInt(params.depth ?? '2', 10)
      const { expand, bootGraph } = await import('../knowledge-graph/index.js')
      bootGraph()
      json(res, expand(id, depth, { type: params.type }))
      return
    }

    if (method === 'GET' && path === '/api/graph/query') {
      const { bootGraph } = await import('../knowledge-graph/index.js')
      bootGraph()
      const { q: queryName, ...qParams } = params
      const queries = await import('../knowledge-graph/index.js')
      const fn = queries[queryName]
      if (typeof fn !== 'function') { err(res, `Unknown query: ${queryName}`, 400); return }
      json(res, fn(qParams.id ?? qParams.nodeId, qParams))
      return
    }

    if (method === 'POST' && path === '/api/graph/nodes') {
      const body = await readBody(req)
      const { addNode, bootGraph } = await import('../knowledge-graph/index.js')
      bootGraph()
      json(res, addNode(body), 201)
      return
    }

    if (method === 'POST' && path === '/api/graph/edges') {
      const body = await readBody(req)
      const { addEdge, bootGraph } = await import('../knowledge-graph/index.js')
      bootGraph()
      json(res, addEdge(body), 201)
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
