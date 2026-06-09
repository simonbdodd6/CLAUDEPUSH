/**
 * Club Digital Twin — HTTP API Server
 *
 * Exposes the Digital Twin as a REST API.
 * Port 3002 (separate from the Command Centre API on 3001).
 *
 * All endpoints return JSON. All heavy work is lazy — on first request.
 * CORS is open for local development.
 */

import { createServer } from 'http';
import { buildClubModel, getClubSummary } from './club-model.js';
import { buildHealthReport, getHealthHistory } from './club-health.js';
import { buildRiskRegister, getCriticalRisks } from './club-risk.js';
import { computeTrends, saveSnapshot, narrateTrends } from './club-trends.js';
import { generateExecutiveSummary, generateBoardReport, generateMorningBriefing, answerClubQuestion } from './club-summary.js';
import { generatePredictions } from './club-predictions.js';

const PORT = process.env.TWIN_PORT ?? 3002;

// ── Route handlers ────────────────────────────────────────────────────────────

const routes = [
  // Full Digital Twin model
  ['GET', '/twin',                 handleGetTwin],
  ['GET', '/twin/summary',         handleGetSummary],
  ['GET', '/twin/health',          handleGetHealth],
  ['GET', '/twin/health/history',  handleGetHealthHistory],
  ['GET', '/twin/risks',           handleGetRisks],
  ['GET', '/twin/risks/critical',  handleGetCriticalRisks],
  ['GET', '/twin/trends',          handleGetTrends],
  ['GET', '/twin/predictions',     handleGetPredictions],
  ['GET', '/twin/briefing',        handleGetBriefing],
  ['POST','/twin/summary/weekly',  handleGenerateWeekly],
  ['POST','/twin/summary/board',   handleGenerateBoard],
  ['POST','/twin/ask',             handleAsk],
  ['GET', '/twin/status',          handleStatus],
  ['GET', '/health',               handlePing],
];

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleGetTwin(req, res) {
  const model = await buildClubModel();
  return json(res, model);
}

async function handleGetSummary(req, res) {
  const summary = await getClubSummary();
  return json(res, summary);
}

async function handleGetHealth(req, res) {
  const model  = await buildClubModel();
  const health = buildHealthReport(model);
  return json(res, health);
}

async function handleGetHealthHistory(req, res, params) {
  const n = parseInt(params.get('n') ?? '30');
  return json(res, { history: getHealthHistory(n) });
}

async function handleGetRisks(req, res) {
  const model = await buildClubModel();
  const risks = buildRiskRegister(model);
  return json(res, risks);
}

async function handleGetCriticalRisks(req, res) {
  const model = await buildClubModel();
  const risks = getCriticalRisks(model);
  return json(res, { count: risks.length, risks });
}

async function handleGetTrends(req, res) {
  const trends = computeTrends();
  return json(res, { ...trends, narrative: narrateTrends(trends) });
}

async function handleGetPredictions(req, res) {
  const model   = await buildClubModel();
  const trends  = computeTrends();
  const preds   = await generatePredictions(model, trends);
  return json(res, preds);
}

async function handleGetBriefing(req, res) {
  const model  = await buildClubModel();
  const risks  = buildRiskRegister(model);
  const brief  = await generateMorningBriefing(model, risks);
  return json(res, brief);
}

async function handleGenerateWeekly(req, res) {
  const model   = await buildClubModel();
  const risks   = buildRiskRegister(model);
  const trends  = computeTrends();
  const summary = await generateExecutiveSummary(model, risks, trends);
  return json(res, summary);
}

async function handleGenerateBoard(req, res) {
  const model   = await buildClubModel();
  const risks   = buildRiskRegister(model);
  const trends  = computeTrends();
  const report  = await generateBoardReport(model, risks, trends);
  return json(res, report);
}

async function handleAsk(req, res) {
  const body     = await parseBody(req);
  const question = body?.question ?? body?.q ?? '';
  if (!question) return json(res, { error: 'question is required' }, 400);
  const model    = await buildClubModel();
  const risks    = buildRiskRegister(model);
  const trends   = computeTrends();
  const answer   = await answerClubQuestion(question, model, risks, trends);
  return json(res, answer);
}

async function handleStatus(req, res) {
  const model = await buildClubModel();
  return json(res, {
    status:      'operational',
    healthScore: model.health?.score ?? null,
    playerCount: model.players?.activeCount ?? 0,
    lastUpdated: model.lastUpdated,
    buildTimeMs: model.buildTimeMs,
    dataCompleteness: model.dataCompleteness,
  });
}

function handlePing(_req, res) {
  return json(res, { status: 'ok', service: 'club-digital-twin', port: PORT, ts: new Date().toISOString() });
}

// ── Server ────────────────────────────────────────────────────────────────────

export function startApiServer() {
  const server = createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url    = new URL(req.url, `http://localhost:${PORT}`);
    const path   = url.pathname;
    const params = url.searchParams;

    const route = routes.find(([m, p]) => m === req.method && p === path);
    if (!route) {
      return json(res, { error: 'Not found', path }, 404);
    }

    try {
      await route[2](req, res, params);
    } catch (err) {
      console.error(`[twin-api] ${req.method} ${path} →`, err.message);
      json(res, { error: err.message }, 500);
    }
  });

  server.listen(PORT, () => {
    console.log(`[Club Digital Twin API] http://localhost:${PORT}`);
    console.log(`  GET  /twin                  — Full Digital Twin model`);
    console.log(`  GET  /twin/summary          — Quick summary`);
    console.log(`  GET  /twin/health           — Health score + dimensions`);
    console.log(`  GET  /twin/risks            — Risk register`);
    console.log(`  GET  /twin/risks/critical   — Critical + high risks only`);
    console.log(`  GET  /twin/trends           — Trend data + narrative`);
    console.log(`  GET  /twin/predictions      — 30/90 day forecasts`);
    console.log(`  GET  /twin/briefing         — Morning briefing`);
    console.log(`  POST /twin/summary/weekly   — Generate weekly executive summary`);
    console.log(`  POST /twin/summary/board    — Generate monthly board report`);
    console.log(`  POST /twin/ask              — Ask any question about the club`);
    console.log(`  GET  /twin/status           — API status check`);
  });

  return server;
}

// ── Utility ───────────────────────────────────────────────────────────────────

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

async function parseBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}
