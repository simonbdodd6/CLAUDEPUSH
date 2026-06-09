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
      const { getClubHealth, getInsights, getRecommendations } = await import('../qa/club-intelligence/index.js')
      const [health, insights] = await Promise.all([
        getClubHealth().catch(() => ({ overallScore: 52, trend: 'stable', isMock: true })),
        getInsights().catch(() => []),
      ])
      json(res, { health, insights })
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
      const { getRecommendations } = await import('../qa/club-intelligence/index.js')
      const recs = await getRecommendations().catch(() => [])
      json(res, { recommendations: recs.slice(0, 6) })
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
      const role = url.searchParams.get('role') ?? 'coach'
      const { buildMorningBriefing } = await import('../dashboard/index.js')
      const briefing = await buildMorningBriefing(role).catch(() => ({ isMock: true, headline: 'Briefing unavailable' }))
      json(res, briefing)
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
