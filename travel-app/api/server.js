// Travel App — minimal HTTP host (M23.0 Phase 3).
//
// A thin node:http wrapper over the handlers in index.js — no framework, no new
// logic. It parses JSON, extracts the bearer token, routes to a handler, and
// maps ApiError -> status code. Production would put this behind a real host
// (Fastify/Vercel) + the Postgres-backed store; the handlers are unchanged.

import { createServer } from 'http';
import { FileStore } from './persistence/file-store.js';
import { createTravelApi, ApiError } from './index.js';
import { loadConfig, describeConfig } from './config.js';
import { selectAppleVerifier } from './apple-verifier.js';

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
    if (m === 'GET' && (pathname === '/health' || pathname === '/healthz')) return api.getHealth();
    if (m === 'POST' && pathname === '/auth/apple') return api.signIn(body);
    if (m === 'GET' && pathname === '/today') return api.getToday(token);
    if (m === 'GET' && pathname === '/trip') return api.getTrip(token);
    if (m === 'PUT' && pathname === '/trip') return api.putTrip(token, body);
    if (m === 'GET' && pathname === '/itinerary') return api.getItinerary(token);
    if (m === 'PUT' && pathname === '/itinerary') return api.putItinerary(token, body);
    if (m === 'POST' && pathname === '/capture') return api.capture(token, body);
    if (m === 'GET' && pathname === '/timeline') return api.getTimeline(token);
    if (m === 'GET' && pathname === '/feed') return api.getFeed(token);
    if (m === 'GET' && pathname === '/stats') return api.getStats(token);
    if (m === 'GET' && pathname === '/intelligence') return api.getIntelligence(token);
    if (m === 'GET' && pathname === '/relationships') return api.getRelationships(token);
    if (m === 'GET' && pathname === '/memories') return api.getMemories(token);
    if (m === 'GET' && pathname === '/life-story') return api.getLifeStory(token);
    if (m === 'GET' && pathname === '/travel-dna') return api.getTravelDna(token);
    if (m === 'GET' && pathname === '/predictions') return api.getPredictions(token);
    if (m === 'GET' && pathname === '/journey') return api.getJourney(token);
    if (m === 'GET' && pathname === '/journey/replay') return api.getJourneyReplay(token);
    if (m === 'GET' && pathname === '/globe') return api.getGlobe(token);
    if (m === 'GET' && pathname === '/world') return api.getWorld(token);
    if (m === 'GET' && pathname === '/achievements') return api.getAchievements(token);
    if (m === 'GET' && pathname === '/lifetime-timeline') return api.getLifetimeTimeline(token);
    if (m === 'GET' && pathname === '/travel-wrapped') return api.getTravelWrapped(token);
    if (m === 'GET' && pathname === '/on-this-day') return api.getOnThisDay(token, { date: url.searchParams.get('date') || undefined });
    if (m === 'GET' && pathname === '/collections') return api.getCollections(token);
    if (m === 'GET' && pathname === '/story') return api.getStory(token);
    if (m === 'GET' && pathname === '/cinematic') return api.getCinematic(token);
    if (m === 'GET' && pathname === '/experiences') return api.getExperiences(token);
    if (m === 'GET' && pathname === '/experience') return api.getExperience(token, { name: url.searchParams.get('name') || undefined, date: url.searchParams.get('date') || undefined });
    if (m === 'GET' && pathname === '/design-tokens') return api.getDesignTokens(token);
    if (m === 'GET' && pathname === '/experience-tokens') return api.getExperienceTokens(token, { name: url.searchParams.get('name') || undefined });
    if (m === 'GET' && pathname === '/navigation') return api.getNavigation(token, { current: url.searchParams.get('current') || undefined });
    if (m === 'GET' && pathname === '/recommendations') return api.getRecommendations(token, { date: url.searchParams.get('date') || undefined, current: url.searchParams.get('current') || undefined });
    if (m === 'GET' && pathname === '/home') return api.getHome(token, { date: url.searchParams.get('date') || undefined, current: url.searchParams.get('current') || undefined });
    if (m === 'GET' && pathname === '/search') return api.getSearch(token, { q: url.searchParams.get('q') || '' });
    if (m === 'GET' && pathname === '/profile') return api.getProfile(token, { date: url.searchParams.get('date') || undefined });
    if (m === 'GET' && pathname === '/traveller-timeline') return api.getTravellerTimeline(token);
    if (m === 'GET' && pathname === '/passport') return api.getPassport(token);
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
      // Readiness probes get a real status code: 503 when a hard check fails.
      const isHealth = url.pathname === '/health' || url.pathname === '/healthz';
      const code = isHealth && result?.status === 'error' ? 503 : 200;
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result ?? {}));
    } catch (error) {
      const status = error instanceof ApiError ? error.status : (error.code ? 400 : 500);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: error.code ?? 'INTERNAL', message: error.message } }));
    }
  });
}

// Start only when run directly (never during tests). Wires everything from the
// validated config: durable store dir, Apple verifier mode, session TTL.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig(process.env);
  const store = new FileStore(config.store.dir);
  const appleVerifier = selectAppleVerifier(config) ?? undefined;
  createHttpServer({ store, config, appleVerifier }).listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`travel-app api listening on ${config.baseUrl}`);
    // eslint-disable-next-line no-console
    console.log('config:', JSON.stringify(describeConfig(config)));
  });
}
