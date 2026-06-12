// season-intelligence/coach-experience.js
//
// THE COACH EXPERIENCE API — the only surface the Intelligence layer reads.
//
// This is a read-only consumer of Coach's Eye Core's PUBLISHED HTTP APIs. It
// imports nothing from Core, mutates nothing, and holds no Core internals. It
// turns the published endpoint responses into one normalized snapshot that
// Intelligence products (starting with the Weekly Brief) reason over.
//
// Boundary rules:
//   • Core never imports this module. Intelligence never imports Core.
//   • Every endpoint read is best-effort: a failure degrades that slice to
//     empty, never throws. Core staying up does not depend on this running.
//   • The snapshot shape below is the stable contract the dashboard and the
//     Brief are written against.
//
// Published Core endpoints consumed (all read-only GET):
//   GET /api/publish?resource=club          → club config (+ fixtures)
//   GET /api/publish?type=all               → published sessions + squad
//   GET /api/roster                         → roster (coach-permissioned)
//   GET /api/availability?sessionId=<id>    → per-session availability board

export const COACH_EXPERIENCE_VERSION = '1.0.0';

// Session ids the Core availability model uses today. Kept here (not imported)
// so the Brain has no compile-time coupling to Core.
export const DEFAULT_SESSION_IDS = ['tue', 'thu', 'game'];

/**
 * A fully-formed, empty snapshot. The Brief renders a valid (degraded) brief
 * from this without special-casing — every consumer can rely on the shape.
 */
export function emptyExperience(asOf = null) {
  return {
    version: COACH_EXPERIENCE_VERSION,
    asOf: asOf || null,
    team: { id: '', name: '', teamName: '', sport: 'Rugby' },
    club: null,
    sessions: [],          // [{ id, title, type, date, published, publishedAt }]
    squad: null,           // { published, opposition, kickoffDate, ..., formationNames, benchPlayers }
    roster: [],            // [{ id, name, position, ... }]
    fixtures: [],          // [{ id, opposition, date, time, venue, competition }]
    availability: {},      // { [sessionId]: [{ key, label, userId, response, reason, respondedAt }] }
    meta: { sources: {}, partial: false },
  };
}

function asArray(v) { return Array.isArray(v) ? v : []; }
function asObject(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }

/**
 * Normalize a raw snapshot (already-fetched, or hand-built for tests) into the
 * stable contract. Pure, total, never throws.
 */
export function normalizeExperience(raw = {}) {
  const base = emptyExperience(raw.asOf || null);
  const club = asObject(raw.club);
  return {
    ...base,
    team: { ...base.team, ...(asObject(raw.team) || {}) },
    club,
    sessions: asArray(raw.sessions).map(s => ({
      id: String(s?.id || ''),
      title: String(s?.title || ''),
      type: String(s?.type || 'Training'),
      date: String(s?.date || ''),
      published: Boolean(s?.published),
      publishedAt: s?.publishedAt || null,
    })).filter(s => s.id),
    squad: asObject(raw.squad),
    roster: asArray(raw.roster).map(p => ({ ...p, id: String(p?.id || ''), name: String(p?.name || '') }))
      .filter(p => p.id || p.name),
    fixtures: asArray(raw.fixtures).length ? asArray(raw.fixtures) : asArray(club?.fixtures),
    availability: asObject(raw.availability) || {},
    meta: { sources: asObject(raw.meta?.sources) || {}, partial: Boolean(raw.meta?.partial) },
  };
}

/**
 * Fetch a Coach Experience snapshot from the published Core APIs.
 *
 * @param {object} opts
 * @param {string} opts.baseUrl     e.g. 'https://boitsfort-coachseye.vercel.app'
 * @param {string} [opts.cookie]    the coach's session cookie (server-to-server)
 * @param {string[]} [opts.sessionIds]
 * @param {function} [opts.fetchImpl]  injectable fetch (tests / non-browser)
 * @param {string} [opts.asOf]      ISO timestamp to stamp the snapshot
 * @returns {Promise<object>} normalized snapshot (always — failures degrade to empty slices)
 */
export async function fetchCoachExperience(opts = {}) {
  const {
    baseUrl = '',
    cookie = '',
    sessionIds = DEFAULT_SESSION_IDS,
    fetchImpl,
    asOf = null,
  } = opts;
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return { ...emptyExperience(asOf), meta: { sources: {}, partial: true } };

  const headers = cookie ? { cookie } : {};
  const sources = {};
  const get = async (path, key) => {
    try {
      const res = await doFetch(`${baseUrl}${path}`, { headers });
      sources[key] = res.ok ? 'ok' : `http_${res.status}`;
      return res.ok ? await res.json() : null;
    } catch (e) {
      sources[key] = 'error';
      return null;
    }
  };

  const [clubRes, allRes, rosterRes] = await Promise.all([
    get('/api/publish?resource=club', 'club'),
    get('/api/publish?type=all', 'published'),
    get('/api/roster', 'roster'),
  ]);

  const availability = {};
  await Promise.all(sessionIds.map(async sid => {
    const data = await get(`/api/availability?sessionId=${encodeURIComponent(sid)}`, `availability:${sid}`);
    if (data?.responses) availability[sid] = data.responses;
  }));

  const partial = Object.values(sources).some(v => v !== 'ok');
  return normalizeExperience({
    asOf,
    club: clubRes?.club || null,
    sessions: allRes?.sessions || [],
    squad: allRes?.squad || null,
    roster: rosterRes?.players || [],
    fixtures: clubRes?.club?.fixtures || [],
    availability,
    meta: { sources, partial },
  });
}
