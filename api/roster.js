// api/roster.js — Coach roster persistence (Redis-backed).
//
// The roster was previously device-local (coach's localStorage only), so a
// second coach device — or a reinstalled browser — started empty. This stores
// the canonical roster server-side. The coach device remains the editor; the
// server holds the single source of truth between devices.
//
// GET  /api/roster        → coach/admin only (roster carries phone + medical
//                           data, so players cannot read it); { players, updatedAt }
// POST /api/roster        → coach/admin only; { players: [...] } replaces the roster
//
// Player photos (base64 data-URLs) are intentionally stripped: they can be
// hundreds of KB each and stay device-local. Everything else round-trips.

import { kvGet, kvSet, kvConfigured } from './_kv.js';
import { key } from './_keys.js';
import { setCors } from './_http.js';
import { requireTenantRole } from './_tenant.js';

function sendAuthError(res, error) {
  return res.status(error?.status || 403).json({ ok: false, error: error?.message || 'Not authorized' });
}

const ROSTER_KEY = key('roster');
const MAX_PLAYERS = 200;

function sanitisePlayers(raw) {
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, MAX_PLAYERS).map(p => {
    if (!p || typeof p !== 'object') return null;
    const { photo, ...rest } = p;
    return { ...rest, id: String(p.id || ''), name: String(p.name || '') };
  }).filter(p => p && p.id && p.name);
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ error: 'Storage not configured' });

  let session;
  try {
    session = await requireTenantRole(req, ['coach', 'admin']);
  } catch (error) {
    return sendAuthError(res, error);
  }

  if (req.method === 'GET') {
    const stored = (await kvGet(ROSTER_KEY)) || null;
    return res.status(200).json({
      ok: true,
      players:   stored?.players || [],
      updatedAt: stored?.updatedAt || null,
      updatedBy: stored?.updatedBy || null,
    });
  }

  if (req.method === 'POST') {
    const players = sanitisePlayers(req.body?.players);
    if (!players) return res.status(400).json({ error: 'players array required' });
    const record = {
      players,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.id,
    };
    await kvSet(ROSTER_KEY, record);
    return res.status(200).json({ ok: true, count: players.length, updatedAt: record.updatedAt });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
