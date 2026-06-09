/**
 * Fixture Engine — HTTP API Server
 *
 * Exposes all fixture management as a REST API.
 * Port 3003 (alongside Digital Twin API on 3002).
 *
 * All responses are JSON. CORS open for local dev.
 */

import { createServer } from 'http';
import {
  listUpcomingFixtures, listAllFixtures, listRecentFixtures,
  getFixture, fixtureStats,
} from './fixture-store.js';
import { createFixture, serializeFixture } from './fixture-schema.js';
import { generateTimeline, getActionableTasks, getUpcomingTasks, timelineProgress } from './fixture-timeline.js';
import { prepareFixture, analyseOpposition } from './fixture-prep.js';
import { generateMatchPack } from './fixture-pack.js';
import { completeFixture, generatePostMatchReview, updateDigitalTwin } from './fixture-review.js';
import { updateSeasonTimeline, getSeasonStandings, getTeamSeasonSummary } from './fixture-standings.js';
import { scheduleFixture } from './index.js';

const PORT = process.env.FIXTURE_PORT ?? 3003;

// ── Routes ────────────────────────────────────────────────────────────────────

const routes = [
  ['GET',  '/fixtures',                     handleList],
  ['GET',  '/fixtures/upcoming',            handleUpcoming],
  ['GET',  '/fixtures/recent',              handleRecent],
  ['GET',  '/fixtures/stats',               handleStats],
  ['POST', '/fixtures',                     handleCreate],
  ['GET',  '/fixtures/:id',                 handleGetOne],
  ['POST', '/fixtures/:id/prepare',         handlePrepare],
  ['GET',  '/fixtures/:id/timeline',        handleTimeline],
  ['GET',  '/fixtures/:id/pack',            handleGetPack],
  ['POST', '/fixtures/:id/pack/generate',   handleGeneratePack],
  ['POST', '/fixtures/:id/complete',        handleComplete],
  ['POST', '/fixtures/:id/review',          handleReview],
  ['POST', '/fixtures/:id/twin-update',     handleTwinUpdate],
  ['GET',  '/fixtures/:id/opposition',      handleOpposition],
  ['GET',  '/season/timeline',              handleSeasonTimeline],
  ['GET',  '/season/standings',             handleStandings],
  ['GET',  '/season/team/:teamId',          handleTeamSeason],
  ['GET',  '/health',                       handlePing],
];

// ── Handlers ──────────────────────────────────────────────────────────────────

function handleList(req, res, { params, query }) {
  const all = listAllFixtures().map(serializeFixture);
  return json(res, { count: all.length, fixtures: all });
}

function handleUpcoming(req, res, { params, query }) {
  const limit = parseInt(query.get('limit') ?? '10');
  return json(res, { fixtures: listUpcomingFixtures(limit).map(serializeFixture) });
}

function handleRecent(req, res, { params, query }) {
  const limit = parseInt(query.get('limit') ?? '5');
  return json(res, { fixtures: listRecentFixtures(limit).map(serializeFixture) });
}

function handleStats(_req, res) {
  return json(res, fixtureStats());
}

async function handleCreate(req, res) {
  const body    = await parseBody(req);
  const fixture = await scheduleFixture(body);
  return json(res, serializeFixture(fixture), 201);
}

function handleGetOne(req, res, { params }) {
  const fixture = getFixture(params.id);
  if (!fixture) return json(res, { error: 'Not found' }, 404);
  return json(res, serializeFixture(fixture));
}

async function handlePrepare(req, res, { params }) {
  try {
    const fixture = await prepareFixture(params.id);
    return json(res, serializeFixture(fixture));
  } catch (e) { return json(res, { error: e.message }, 404); }
}

function handleTimeline(req, res, { params }) {
  const fixture = getFixture(params.id);
  if (!fixture) return json(res, { error: 'Not found' }, 404);
  const progress  = timelineProgress(fixture);
  const actionable = getActionableTasks(fixture);
  const upcoming  = getUpcomingTasks(fixture);
  return json(res, { fixtureId: params.id, progress, actionable, upcoming, checklist: fixture.preparationChecklist });
}

function handleGetPack(req, res, { params }) {
  const fixture = getFixture(params.id);
  if (!fixture) return json(res, { error: 'Not found' }, 404);
  if (!fixture.matchPack) return json(res, { error: 'Match pack not yet generated. POST /fixtures/:id/pack/generate' }, 404);
  return json(res, fixture.matchPack);
}

async function handleGeneratePack(req, res, { params }) {
  try {
    const fixture  = getFixture(params.id);
    if (!fixture) return json(res, { error: 'Not found' }, 404);
    const prep     = fixture.status === 'scheduled' ? await prepareFixture(params.id) : fixture;
    const pack     = await generateMatchPack(prep);
    prep.matchPack = pack;
    const { saveFixture } = await import('./fixture-store.js');
    saveFixture(prep);
    return json(res, pack);
  } catch (e) { return json(res, { error: e.message }, 500); }
}

async function handleComplete(req, res, { params }) {
  try {
    const body    = await parseBody(req);
    const fixture = await completeFixture(params.id, body);
    return json(res, serializeFixture(fixture));
  } catch (e) { return json(res, { error: e.message }, 400); }
}

async function handleReview(req, res, { params }) {
  try {
    const body   = await parseBody(req);
    const review = await generatePostMatchReview(params.id, body);
    return json(res, review);
  } catch (e) { return json(res, { error: e.message }, 400); }
}

async function handleTwinUpdate(req, res, { params }) {
  try {
    const result = await updateDigitalTwin(params.id);
    return json(res, result);
  } catch (e) { return json(res, { error: e.message }, 400); }
}

async function handleOpposition(req, res, { params }) {
  const fixture = getFixture(params.id);
  if (!fixture) return json(res, { error: 'Not found' }, 404);
  const analysis = await analyseOpposition(fixture);
  return json(res, analysis);
}

function handleSeasonTimeline(req, res) {
  return json(res, updateSeasonTimeline());
}

function handleStandings(req, res, { params, query }) {
  const competition = query.get('competition') ?? null;
  return json(res, getSeasonStandings(competition));
}

function handleTeamSeason(req, res, { params }) {
  return json(res, getTeamSeasonSummary(params.teamId));
}

function handlePing(_req, res) {
  return json(res, { status: 'ok', service: 'fixture-engine', port: PORT, fixtures: fixtureStats().total });
}

// ── Server ────────────────────────────────────────────────────────────────────

export function startFixtureApiServer() {
  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url    = new URL(req.url, `http://localhost:${PORT}`);
    const path   = url.pathname;
    const query  = url.searchParams;

    // Match route with optional :param segments
    let handler = null, params = {};
    for (const [method, pattern, fn] of routes) {
      if (method !== req.method) continue;
      const match = matchRoute(pattern, path);
      if (match) { handler = fn; params = match; break; }
    }

    if (!handler) return json(res, { error: 'Not found', path }, 404);

    try {
      await handler(req, res, { params, query });
    } catch (err) {
      console.error(`[fixture-api] ${req.method} ${path} →`, err.message);
      json(res, { error: err.message }, 500);
    }
  });

  server.listen(PORT, () => {
    console.log(`[Fixture Engine API] http://localhost:${PORT}`);
    console.log(`  POST /fixtures              — Create fixture`);
    console.log(`  GET  /fixtures/upcoming     — Upcoming fixtures`);
    console.log(`  GET  /fixtures/:id          — Get fixture`);
    console.log(`  POST /fixtures/:id/prepare  — Prepare (enrich from Digital Twin)`);
    console.log(`  GET  /fixtures/:id/timeline — Preparation checklist`);
    console.log(`  POST /fixtures/:id/pack/generate — Generate match pack`);
    console.log(`  POST /fixtures/:id/complete — Record result`);
    console.log(`  POST /fixtures/:id/review   — Post-match review`);
    console.log(`  POST /fixtures/:id/twin-update — Update Digital Twin`);
    console.log(`  GET  /season/timeline       — Full season calendar`);
    console.log(`  GET  /season/standings      — League table`);
  });

  return server;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function matchRoute(pattern, path) {
  const pParts = pattern.split('/');
  const uParts = path.split('/');
  if (pParts.length !== uParts.length) return null;
  const params = {};
  for (let i = 0; i < pParts.length; i++) {
    if (pParts[i].startsWith(':')) {
      params[pParts[i].slice(1)] = uParts[i];
    } else if (pParts[i] !== uParts[i]) {
      return null;
    }
  }
  return params;
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

async function parseBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}
