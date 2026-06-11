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
import { requireTenantRole, requireTenantSession } from './_tenant.js';

function sendAuthError(res, error) {
  return res.status(error?.status || 403).json({ ok: false, error: error?.message || 'Not authorized' });
}

const SESSIONS_KEY = key('publish:sessions');
const SQUAD_KEY    = key('publish:squad');

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

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ error: 'Storage not configured' });

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
      result.sessions = (await kvGet(SESSIONS_KEY)) || [];
    }
    if (type === 'all' || type === 'squad') {
      result.squad = (await kvGet(SQUAD_KEY)) || null;
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
      await kvSet(SESSIONS_KEY, sessions);
      return res.status(200).json({ ok: true, sessions });
    }

    if (type === 'squad') {
      const squad = sanitiseSquad(data);
      if (!squad) return res.status(400).json({ error: 'data must be an object' });
      if (!squad.published) {
        await kvSet(SQUAD_KEY, null);
        return res.status(200).json({ ok: true, squad: null });
      }
      squad.publishedAt = squad.publishedAt || new Date().toISOString();
      await kvSet(SQUAD_KEY, squad);
      return res.status(200).json({ ok: true, squad });
    }

    return res.status(400).json({ error: 'type must be sessions or squad' });
  }

  // ── DELETE: coach clears published state ──────────────────────────────────
  if (req.method === 'DELETE') {
    try {
      await requireTenantRole(req, ['coach', 'admin']);
    } catch (error) {
      return sendAuthError(res, error);
    }

    const type = req.body?.type || req.query?.type;
    if (type === 'squad') {
      await kvSet(SQUAD_KEY, null);
      return res.status(200).json({ ok: true });
    }
    if (type === 'sessions') {
      await kvSet(SESSIONS_KEY, []);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'type must be sessions or squad' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
