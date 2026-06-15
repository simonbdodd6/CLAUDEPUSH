// Travel App — minimal HTTP host (M23.0 Phase 3).
//
// A thin node:http wrapper over the handlers in index.js — no framework, no new
// logic. It parses JSON, extracts the bearer token, routes to a handler, and
// maps ApiError -> status code. Production would put this behind a real host
// (Fastify/Vercel) + the Postgres-backed store; the handlers are unchanged.

import { createServer } from 'http';
import { FileStore } from './persistence/file-store.js';
import { createTravelApi, ApiError } from './index.js';

export function createHttpServer(apiOptions = {}) {
  const api = createTravelApi(apiOptions);

  function bearer(req) {
    const h = req.headers.authorization ?? '';
    return h.startsWith('Bearer ') ? h.slice(7) : undefined;
  }

  async function readBody(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
  }

  async function route(req, body, token, url) {
    const { pathname } = url;
    const m = req.method;
    if (m === 'POST' && pathname === '/auth/apple') return api.signIn(body);
    if (m === 'GET' && pathname === '/today') return api.getToday(token);
    if (m === 'GET' && pathname === '/trip') return api.getTrip(token);
    if (m === 'PUT' && pathname === '/trip') return api.putTrip(token, body);
    if (m === 'GET' && pathname === '/itinerary') return api.getItinerary(token);
    if (m === 'PUT' && pathname === '/itinerary') return api.putItinerary(token, body);
    if (m === 'POST' && pathname === '/capture') return api.capture(token, body);
    if (m === 'GET' && pathname === '/timeline') return api.getTimeline(token);
    if (m === 'GET' && pathname === '/trip-readiness') return api.getTripReadiness(token);
    if (m === 'GET' && pathname === '/approvals') return api.getApprovals(token);
    const approvalMatch = pathname.match(/^\/approvals\/([^/]+)$/);
    if (m === 'POST' && approvalMatch) return api.resolveApproval(token, decodeURIComponent(approvalMatch[1]), body);
    throw new ApiError(404, 'NOT_FOUND', `No route for ${m} ${pathname}`);
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : {};
      const result = await route(req, body, bearer(req), url);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result ?? {}));
    } catch (error) {
      const status = error instanceof ApiError ? error.status : (error.code ? 400 : 500);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: error.code ?? 'INTERNAL', message: error.message } }));
    }
  });
}

// Start only when run directly (never during tests).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  const store = process.env.TRAVEL_STORE_DIR ? new FileStore(process.env.TRAVEL_STORE_DIR) : null;
  createHttpServer({ store }).listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`travel-app api listening on http://localhost:${port}`);
  });
}
