#!/usr/bin/env node
// Coach's Eye Command Centre — API Server
// Bridges the Node.js platform layer to the React frontend over HTTP.
// Start: node app/api-server.js
// Port:  3001

import { createServer } from 'http'
import { URL } from 'url'

// Feature-flag gate — the ONLY place intelligence features are checked.
// Pure, side-effect-free lookup module (imports nothing from Core or engines).
import {
  defaultConfig, isFeatureEnabled, isIntelligenceEnabled, degradedEnvelope, getTier, TIER,
} from '../brain/config.js'

const PORT = process.env.PORT ?? 3001

// Resolve the per-club IntelligenceConfig for this server process.
// Production: Core supplies the config object. Here it is derived from env so the
// existing intelligence.features schema governs every gate below.
function resolveConfig() {
  const tier = process.env.INTELLIGENCE_TIER ?? TIER.PROFESSIONAL
  return defaultConfig(process.env.CLUB_ID ?? 'demo', tier)
}

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

    // ── Proactive Intelligence ───────────────────────────────────────────────
    if (method === 'GET' && path === '/api/proactive/briefings') {
      const { runProactiveIntelligence } = await import('../lib/ai/proactive-intelligence/index.js')
      const result = await runProactiveIntelligence({ persist: true, useMock: url.searchParams.get('mock') === '1' })
      json(res, { briefings: result.briefings, inbox: result.inbox })
      return
    }

    if (method === 'GET' && path === '/api/proactive/dashboard') {
      const { runProactiveIntelligence } = await import('../lib/ai/proactive-intelligence/index.js')
      const result = await runProactiveIntelligence({ persist: true, useMock: url.searchParams.get('mock') === '1' })
      json(res, result.dashboard)
      return
    }

    if (method === 'GET' && path === '/api/proactive/morning-briefing') {
      const { runProactiveIntelligence } = await import('../lib/ai/proactive-intelligence/index.js')
      const result = await runProactiveIntelligence({ persist: true, useMock: url.searchParams.get('mock') === '1' })
      json(res, result.morningBriefing)
      return
    }

    if (method === 'POST' && path.startsWith('/api/proactive/briefings/') && path.endsWith('/status')) {
      const briefingId = path.split('/')[4]
      const body = await readBody(req)
      const { updateBriefingStatus } = await import('../lib/ai/proactive-intelligence/index.js')
      const updated = updateBriefingStatus(briefingId, body.status, {
        snoozedUntil: body.snoozedUntil,
        note: body.note,
      })
      json(res, { briefing: updated })
      return
    }

    // ── Approvals ─────────────────────────────────────────────────────────────
    // Read the live pending queue (reuses dashboard/approval-centre via dashboard/index.js).
    if (method === 'GET' && path === '/api/approvals') {
      const { getPending, approvalStats } = await import('../dashboard/index.js')
      const items = getPending()
      json(res, { items, count: items.length, stats: approvalStats() })
      return
    }

    // Read-only audit trail of coach decisions (PIF-2). Flag-gated like other
    // intelligence read surfaces. Reads the durable ledger; no mock fabricated.
    if (method === 'GET' && path === '/api/approvals/audit') {
      const config = resolveConfig()
      if (!isIntelligenceEnabled(config)) {
        json(res, degradedEnvelope('approvalsAudit', 'disabled', getTier(config)))
        return
      }
      const limitRaw = parseInt(url.searchParams.get('limit') ?? '100', 10)
      const limit    = Number.isFinite(limitRaw) ? limitRaw : 100
      const { readAudit } = await import('../dashboard/index.js')
      const records = readAudit({ limit })
      json(res, { records, count: records.length })
      return
    }

    // ── Recommendation Inspector (Executive Reasoning Layer, PIF-3) ─────────────
    // Generic: explain ANY domain's recommendation posted in the body. Flag-gated.
    // The explanation is composed from the supplied signals — no engine call, no
    // model invocation, nothing recomputed.
    if (method === 'POST' && path === '/api/recommendations/explain') {
      const config = resolveConfig()
      if (!isIntelligenceEnabled(config)) {
        json(res, degradedEnvelope('recommendationInspector', 'disabled', getTier(config)))
        return
      }
      const body = await readBody(req).catch(() => ({}))
      const recommendation = body.recommendation ?? body.input ?? body
      const wantPanel = url.searchParams.get('panel') === '1' || body.panel === true
      const { createExecutiveReasoningPlatform } = await import('../lib/executive-reasoning/index.js')
      const reasoning = createExecutiveReasoningPlatform()
      const explanation = reasoning.explain(recommendation)
      json(res, wantPanel ? { explanation, panel: reasoning.panel(explanation) } : { explanation })
      return
    }

    // Inspect a DURABLE approval item by id — composes the PIF-2 ledger (approval +
    // audit + learning outcome) into an ExecutiveExplanation. Real persisted data
    // only; never fabricated. Flag-gated.
    if (method === 'GET' && path === '/api/recommendations/explain') {
      const config = resolveConfig()
      if (!isIntelligenceEnabled(config)) {
        json(res, degradedEnvelope('recommendationInspector', 'disabled', getTier(config)))
        return
      }
      const approvalId = url.searchParams.get('approvalId')
      if (!approvalId) { err(res, 'approvalId query parameter is required', 400); return }

      const dash = await import('../dashboard/index.js')
      const item = dash.getById(approvalId)
      if (!item) { err(res, `approval ${approvalId} not found`, 404); return }

      // Gather this decision's audit trail from the durable ledger.
      const audits = dash.readAudit({ limit: 1000 }).filter(a => a.decisionId === approvalId)
      const latest = audits[audits.length - 1] ?? null

      // Map the Coach's Eye approval record onto the neutral ReasoningInput. This
      // binding is the ONLY place domain knowledge lives; the layer itself is pure.
      const input = {
        id:        item.approvalId,
        type:      'recommendation',
        source:    item.generatedBy ?? null,
        subject:   { title: item.title ?? item.type, summary: item.type ?? null },
        createdAt: item.createdAt ?? null,
        confidence: { value: item.confidence ?? 0 },
        evidence:  (Array.isArray(item.evidence) ? item.evidence : []).map(f => ({ fact: f, source: item.generatedBy ?? null })),
        decision:  { owner: item.requiresRole ?? null, rationale: latest?.reason ?? null },
        approval:  {
          state:      item.status ?? null,
          approvalId: item.approvalId,
          reviewer:   item.approvedBy ?? item.rejectedBy ?? null,
          reviewedAt: item.reviewedAt ?? null,
          reason:     item.rejectionReason ?? null,
          auditId:    latest?.auditId ?? null,
        },
        learningOutcome: latest?.learningOutcome ?? null,
        timelineEvents: audits.map(a => ({ at: a.recordedAt, event: `decision_${a.action}`, by: a.humanDecision ?? null })),
        featureFlags: [{ key: 'intelligence', enabled: true }],
        dataQuality: { mock: Boolean(item.isMock) },
      }

      const { createExecutiveReasoningPlatform } = await import('../lib/executive-reasoning/index.js')
      const reasoning = createExecutiveReasoningPlatform()
      const explanation = reasoning.explain(input)
      const wantPanel = url.searchParams.get('panel') === '1'
      json(res, wantPanel ? { explanation, panel: reasoning.panel(explanation) } : { explanation })
      return
    }

    // Approve / reject a queued item, then close the learning feedback loop.
    // The queue mutation is always coach-triggered; the learning record is flag-gated.
    if (method === 'POST' && /^\/api\/approvals\/[^/]+\/(approve|reject)$/.test(path)) {
      const parts      = path.split('/')                 // ['', 'api', 'approvals', :id, :action]
      const approvalId = decodeURIComponent(parts[3])
      const action     = parts[4]
      const body       = await readBody(req).catch(() => ({}))
      const reviewer   = body.reviewer ?? 'coach'

      const dash   = await import('../dashboard/index.js')
      const result = action === 'approve'
        ? dash.approve(approvalId, reviewer)
        : dash.reject(approvalId, reviewer, body.reason ?? '')

      if (!result.ok) { err(res, result.reason ?? 'approval not found', 404); return }

      // Feedback loop — record the real coach decision in the existing Learning Engine.
      // The coach's approve/reject IS the human-validated signal (not a simulated outcome).
      const config = resolveConfig()
      let learning = { recorded: false, reason: 'intelligence disabled' }
      if (isIntelligenceEnabled(config)) {
        try {
          const { recordOutcome, COACH_DECISION } = await import('../learning-engine/index.js')
          const item = result.item
          const outcome = recordOutcome({
            recommendationId:   item.approvalId,
            recommendationType: item.type ?? 'approval_item',
            recommendation:     item.title ?? item.type,
            coachDecision:      action === 'approve' ? COACH_DECISION.ACCEPTED : COACH_DECISION.REJECTED,
            // The coach's decision is the ground-truth judgement at this point in the lifecycle.
            predictionCorrect:  action === 'approve',
            interventionWorked: null,
            confidenceAtTime:   item.confidence ?? null,
            outcomeNotes:       'Coach approval decision captured at review time; real-world outcome observed separately.',
          })
          learning = { recorded: true, outcomeId: outcome.id, outcomeType: outcome.outcomeType }
        } catch (e) {
          learning = { recorded: false, reason: e.message }
        }
      }

      // Durable audit trail (PIF-2) — always written: a coach decision is an
      // accountability event, not an optional intelligence feature. Evidence and
      // learning-outcome fields are included when available.
      let audit = null
      try {
        const { appendAudit } = await import('../dashboard/index.js')
        const item = result.item
        audit = appendAudit({
          decisionId:      item.approvalId,
          action,
          timestamp:       item.reviewedAt,
          sourceEngine:    item.generatedBy ?? null,
          evidenceIds:     Array.isArray(item.evidence) ? item.evidence : [],
          citationIds:     Array.isArray(item.citationIds) ? item.citationIds : [],
          humanDecision:   reviewer,
          reason:          action === 'reject' ? (body.reason ?? '') : null,
          learningOutcome: learning,
        })
      } catch (e) {
        audit = { recorded: false, reason: e.message }
      }

      json(res, { ok: true, item: result.item, learning, audit: { auditId: audit?.auditId ?? null } })
      return
    }

    // Route Decision-Engine output into the approval queue via the existing router.
    // Flag-gated behind autonomousAssistant so no unattended/low-provenance items
    // reach the queue unless a club has explicitly enabled autonomous behaviour.
    if (method === 'POST' && path === '/api/approvals/route') {
      const config = resolveConfig()
      if (!isFeatureEnabled(config, 'autonomousAssistant')) {
        json(res, degradedEnvelope('autonomousAssistant', 'disabled', getTier(config)))
        return
      }
      const body  = await readBody(req).catch(() => ({}))
      const items = Array.isArray(body.items) ? body.items : []
      const { routeGeneric } = await import('../dashboard/index.js')
      const routed = items.map(it => routeGeneric({
        type:        it.type ?? 'recommendation',
        title:       it.title ?? it.recommendation ?? it.type,
        generatedBy: it.generatedBy ?? 'decision-engine',
        confidence:  it.confidence ?? 70,
        evidence:    it.evidence ?? [],
        preview:     it.preview ?? {},
        riskLevel:   it.riskLevel ?? 'medium',
        requiresRole: it.requiresRole ?? 'coach',
      }))
      json(res, { routed: routed.length, items: routed })
      return
    }

    // ── Evidence view ─────────────────────────────────────────────────────────
    // Read-only explainability: composes Knowledge Engine citations with Memory
    // entity links. No new store, no new reasoning — pure composition.
    if (method === 'GET' && path === '/api/evidence') {
      const config = resolveConfig()
      if (!isIntelligenceEnabled(config)) {
        json(res, degradedEnvelope('evidence', 'disabled', getTier(config)))
        return
      }
      const q        = url.searchParams.get('q') ?? ''
      const entityId = url.searchParams.get('entityId') ?? null
      const { buildEvidence } = await import('../knowledge-engine/evidence-view.js')
      const evidence = await buildEvidence({ question: q, entityId, role: 'coach' })
      json(res, evidence)
      return
    }

    // ── Simulation (read-only) ─────────────────────────────────────────────────
    // runSimulation() exists in season-intelligence, but every code path currently
    // feeds it MOCK observations. Per platform rules we do NOT surface mock data as
    // truth, so this endpoint reports the capability as available-but-deferred until
    // a live observation feed is wired. No mock is fabricated or duplicated here.
    if (method === 'GET' && path === '/api/simulation') {
      const config = resolveConfig()
      if (!isIntelligenceEnabled(config)) {
        json(res, degradedEnvelope('simulation', 'disabled', getTier(config)))
        return
      }
      json(res, {
        available:   false,
        feature:     'simulation',
        reason:      'awaiting-live-observations',
        note:        'season-intelligence runSimulation() is implemented but only has mock observation inputs today. It will be surfaced once a live observation feed is connected.',
        tier:        getTier(config),
        generatedAt: new Date().toISOString(),
        data:        null,
      })
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
