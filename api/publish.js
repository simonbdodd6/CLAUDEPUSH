// api/publish.js — Published player-facing state: sessions list + squad sheet.
//
// The coach's editing state stays in their browser localStorage. When they
// explicitly publish (sessions saved or squad published), the player-visible
// subset is written here so every player device can fetch it on load.
//
// GET  /api/publish?type=all|sessions|squad
//   → any authenticated user; returns { sessions, squad }
//
// POST /api/publish { type: 'sessions', data: [...] }
//   → coach/admin only; upserts the full sessions list
//
// POST /api/publish { type: 'squad', data: { ...matchCentre, formationNames, benchPlayers } }
//   → coach/admin only; saves or clears the published squad
//
// DELETE /api/publish { type: 'squad'|'sessions' }
//   → coach/admin only; clears the named store

import { kvGet, kvSet } from './_kv.js';
import { key } from './_keys.js';
import { setCors } from './_http.js';
import { kvConfigured } from './_kv.js';
import { DEFAULT_TEAM } from './_identityStore.js';
import { requireTenantRole, requireTenantSession } from './_tenant.js';

function sendAuthError(res, error) {
  return res.status(error?.status || 403).json({ ok: false, error: error?.message || 'Not authorized' });
}

// All published state and the roster are namespaced by the session's teamId
// so one club's coach can never read or overwrite another club's data.
// The un-scoped legacy keys (publish:sessions / publish:squad / roster) held
// the default team's data before scoping — reads fall back to them for the
// default team only; writes always go to the scoped key. No migration needed.
const MAX_PLAYERS = 200;

function sessionsKey(teamId) { return key(`publish:${teamId}:sessions`); }
function squadKey(teamId)    { return key(`publish:${teamId}:squad`); }
function rosterKey(teamId)   { return key(`roster:${teamId}`); }
function clubKey(teamId)     { return key(`club:${teamId}`); }

async function readScoped(scopedKey, legacyName, teamId) {
  const scoped = await kvGet(scopedKey);
  if (scoped !== null && scoped !== undefined) return scoped;
  if (teamId === DEFAULT_TEAM.id) return kvGet(key(legacyName));
  return null;
}

function sanitiseSessions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(s => ({
    id:          String(s.id          || ''),
    title:       String(s.title       || ''),
    type:        String(s.type        || 'Training'),
    date:        String(s.date        || ''),
    focus:       String(s.focus       || ''),
    deadline:    String(s.deadline    || ''),
    published:   Boolean(s.published),
    publishedAt: s.publishedAt || null,
  })).filter(s => s.id);
}

function sanitiseSquad(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const formationNames = raw.formationNames && typeof raw.formationNames === 'object'
    ? Object.fromEntries(
        Object.entries(raw.formationNames)
          .map(([k, v]) => [String(k), String(v || '')])
          .filter(([, v]) => v)
      )
    : {};
  const benchPlayers = Array.isArray(raw.benchPlayers)
    ? raw.benchPlayers.map(n => String(n || ''))
    : [];
  return {
    published:     Boolean(raw.published),
    publishedAt:   raw.publishedAt  || null,
    opposition:    String(raw.opposition    || ''),
    competition:   String(raw.competition   || ''),
    kickoffDate:   String(raw.kickoffDate   || ''),
    kickoffTime:   String(raw.kickoffTime   || ''),
    arrivalTime:   String(raw.arrivalTime   || ''),
    venue:         String(raw.venue         || ''),
    kit:           String(raw.kit           || ''),
    announcement:  String(raw.announcement  || ''),
    gamePlan:      String(raw.gamePlan      || ''),
    formationNames,
    benchPlayers,
  };
}

// ── Roster sub-resource (formerly /api/roster, folded in to stay under the
// Vercel Hobby 12-function limit; /api/roster rewrites here with
// ?resource=roster). Coach/admin only in BOTH directions — the roster
// carries phone + medical data, so players never read it. Photos (base64
// data-URLs) are stripped and stay device-local.

function sanitiseRosterPlayers(raw) {
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, MAX_PLAYERS).map(p => {
    if (!p || typeof p !== 'object') return null;
    const { photo, ...rest } = p;
    return { ...rest, id: String(p.id || ''), name: String(p.name || '') };
  }).filter(p => p && p.id && p.name);
}

async function rosterHandler(req, res) {
  let session;
  try {
    session = await requireTenantRole(req, ['coach', 'admin']);
  } catch (error) {
    return sendAuthError(res, error);
  }

  if (req.method === 'GET') {
    const stored = (await readScoped(rosterKey(session.teamId), 'roster', session.teamId)) || null;
    return res.status(200).json({
      ok: true,
      players:   stored?.players || [],
      updatedAt: stored?.updatedAt || null,
      updatedBy: stored?.updatedBy || null,
    });
  }

  if (req.method === 'POST') {
    const players = sanitiseRosterPlayers(req.body?.players);
    if (!players) return res.status(400).json({ error: 'players array required' });
    const record = {
      players,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.id,
    };
    await kvSet(rosterKey(session.teamId), record);
    return res.status(200).json({ ok: true, count: players.length, updatedAt: record.updatedAt });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── Club config sub-resource (first-run setup) ────────────────────────────
// One record per team: club name, team name, season and first-fixture info
// captured by the coach's first-run wizard. Any team member can read it
// (players need the club name for their own UI); only coach/admin can write.

const VALID_DAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

function sanitiseClubConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const clubName = String(raw.clubName || '').trim().slice(0, 80);
  if (!clubName) return null;
  const trainingDays = (Array.isArray(raw.trainingDays) ? raw.trainingDays : [])
    .map(d => ({
      day:  String(d?.day || '').slice(0, 3),
      time: /^\d{2}:\d{2}$/.test(String(d?.time || '')) ? String(d.time) : '19:00',
    }))
    .filter(d => VALID_DAYS.has(d.day))
    .slice(0, 7);
  const sanitiseFixture = fx => ({
    id:          String(fx?.id || `fx_${Math.random().toString(36).slice(2, 9)}`).slice(0, 40),
    opposition: String(fx?.opposition || '').trim().slice(0, 80),
    date:       String(fx?.date       || '').trim().slice(0, 20),
    time:       /^\d{2}:\d{2}$/.test(String(fx?.time || '')) ? String(fx.time) : '',
    venue:      String(fx?.venue      || '').trim().slice(0, 120),
    competition: String(fx?.competition || '').trim().slice(0, 80),
    homeAway:   ['home', 'away'].includes(String(fx?.homeAway || '').toLowerCase()) ? String(fx.homeAway).toLowerCase() : '',
  });
  const fx = raw.firstFixture && typeof raw.firstFixture === 'object' ? raw.firstFixture : {};
  return {
    clubName,
    teamName:   String(raw.teamName   || '').trim().slice(0, 80),
    seasonName: String(raw.seasonName || '').trim().slice(0, 80),
    trainingDays,
    firstFixture: sanitiseFixture(fx),
    fixtures: (Array.isArray(raw.fixtures) ? raw.fixtures : [])
      .map(sanitiseFixture)
      .filter(f => f.opposition)
      .slice(0, 50),
  };
}

async function clubHandler(req, res) {
  if (req.method === 'GET') {
    let session;
    try {
      session = await requireTenantSession(req);
    } catch (error) {
      return sendAuthError(res, error);
    }
    const club = (await kvGet(clubKey(session.teamId))) || null;
    return res.status(200).json({ ok: true, club });
  }

  if (req.method === 'POST') {
    let session;
    try {
      session = await requireTenantRole(req, ['coach', 'admin']);
    } catch (error) {
      return sendAuthError(res, error);
    }
    const club = sanitiseClubConfig(req.body?.club);
    if (!club) return res.status(400).json({ error: 'club.clubName is required' });
    const existing = (await kvGet(clubKey(session.teamId))) || null;
    const record = {
      ...club,
      setupCompletedAt: existing?.setupCompletedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.id,
    };
    await kvSet(clubKey(session.teamId), record);
    return res.status(200).json({ ok: true, club: record });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ error: 'Storage not configured' });

  if (String(req.query?.resource || '') === 'roster') return rosterHandler(req, res);
  if (String(req.query?.resource || '') === 'club')   return clubHandler(req, res);

  // ── GET: any authenticated user reads published player-facing state ────────
  if (req.method === 'GET') {
    let session;
    try {
      session = await requireTenantSession(req);
    } catch (error) {
      return sendAuthError(res, error);
    }

    const type = String(req.query?.type || 'all');
    const result = { ok: true };

    if (type === 'all' || type === 'sessions') {
      result.sessions = (await readScoped(sessionsKey(session.teamId), 'publish:sessions', session.teamId)) || [];
    }
    if (type === 'all' || type === 'squad') {
      result.squad = (await readScoped(squadKey(session.teamId), 'publish:squad', session.teamId)) || null;
    }
    return res.status(200).json(result);
  }

  // ── POST: coach writes published state ────────────────────────────────────
  if (req.method === 'POST') {
    let session;
    try {
      session = await requireTenantRole(req, ['coach', 'admin']);
    } catch (error) {
      return sendAuthError(res, error);
    }

    const { type, data } = req.body || {};

    if (type === 'sessions') {
      const sessions = sanitiseSessions(data);
      await kvSet(sessionsKey(session.teamId), sessions);
      return res.status(200).json({ ok: true, sessions });
    }

    if (type === 'squad') {
      const squad = sanitiseSquad(data);
      if (!squad) return res.status(400).json({ error: 'data must be an object' });
      if (!squad.published) {
        await kvSet(squadKey(session.teamId), null);
        return res.status(200).json({ ok: true, squad: null });
      }
      squad.publishedAt = squad.publishedAt || new Date().toISOString();
      await kvSet(squadKey(session.teamId), squad);
      return res.status(200).json({ ok: true, squad });
    }

    return res.status(400).json({ error: 'type must be sessions or squad' });
  }

  // ── DELETE: coach clears published state ──────────────────────────────────
  if (req.method === 'DELETE') {
    let session;
    try {
      session = await requireTenantRole(req, ['coach', 'admin']);
    } catch (error) {
      return sendAuthError(res, error);
    }

    const type = req.body?.type || req.query?.type;
    if (type === 'squad') {
      await kvSet(squadKey(session.teamId), null);
      return res.status(200).json({ ok: true });
    }
    if (type === 'sessions') {
      await kvSet(sessionsKey(session.teamId), []);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'type must be sessions or squad' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
