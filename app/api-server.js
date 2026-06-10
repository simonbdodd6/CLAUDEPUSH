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
      const { getActiveRecommendations, runCheck } = await import('../autonomous-assistant/index.js')
      let recs = await getActiveRecommendations().catch(() => [])
      if (recs.length === 0) {
        const result = await runCheck({ saveToState: true }).catch(() => ({ recommendations: [] }))
        recs = result.recommendations ?? []
      }
      const urgencyToEffort = u => (u === 'CRITICAL' || u === 'HIGH') ? 'high' : u === 'MEDIUM' ? 'medium' : 'low'
      const normalized = recs.slice(0, 6).map((r, i) => ({
        id:         r.id,
        action:     r.title,
        why:        r.reason,
        effort:     urgencyToEffort(r.urgency),
        priority:   i + 1,
        confidence: r.confidence,
        tier:       r.tier,
        type:       r.type,
        category:   r.category,
        timeSaved:  r.timeSaved,
      }))
      json(res, { recommendations: normalized })
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
