// Matchday selection persistence.
// GET  /api/matchday           → current selection (coach or authenticated player)
// POST /api/matchday           → save/publish selection (coach only)
// DELETE /api/matchday         → clear selection (coach only)
import { kvGet, kvSet, kvDel, kvConfigured } from './_kv.js';
import { key } from './_keys.js';
import { setCors } from './_http.js';
import { requireTenantRole, requireTenantSession } from './_tenant.js';

const MATCHDAY_KEY = key('matchday:current');

function sendAuthError(res, error) {
  return res.status(error?.status || 403).json({ ok: false, error: error?.message || 'Not authorized' });
}

function sanitizeSlots(slots) {
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) return {};
  const out = {};
  for (const [k, v] of Object.entries(slots)) {
    if (/^\d{1,2}$/.test(String(k))) out[String(k)] = String(v || '').slice(0, 80);
  }
  return out;
}

function sanitizeIds(ids) {
  if (!ids || typeof ids !== 'object' || Array.isArray(ids)) return {};
  const out = {};
  for (const [k, v] of Object.entries(ids)) {
    if (/^\d{1,2}$/.test(String(k))) out[String(k)] = String(v || '').slice(0, 64);
  }
  return out;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ error: 'Storage not configured' });

  if (req.method === 'GET') {
    // Both coaches and players can read the selection — players see their own slot.
    // No auth required: published selection is intended to be visible.
    const selection = (await kvGet(MATCHDAY_KEY)) || null;
    return res.status(200).json({ ok: true, selection });
  }

  if (req.method === 'POST') {
    try {
      await requireTenantRole(req, ['coach', 'admin']);
    } catch (error) {
      return sendAuthError(res, error);
    }

    const {
      slots, slotPlayerIds,
      bench, benchPlayerIds,
      fixtureOpponent, fixtureVenue, fixtureDate,
      publish,
    } = req.body || {};

    if (!slots || typeof slots !== 'object') {
      return res.status(400).json({ error: 'slots object is required' });
    }

    const now = new Date().toISOString();
    const existing = (await kvGet(MATCHDAY_KEY)) || {};

    const selection = {
      slots:           sanitizeSlots(slots),
      slotPlayerIds:   sanitizeIds(slotPlayerIds || {}),
      bench:           Array.isArray(bench) ? bench.slice(0, 23).map(n => String(n || '').slice(0, 80)) : [],
      benchPlayerIds:  Array.isArray(benchPlayerIds) ? benchPlayerIds.slice(0, 23).map(id => String(id || '').slice(0, 64)) : [],
      fixtureOpponent: String(fixtureOpponent || existing.fixtureOpponent || '').slice(0, 100),
      fixtureVenue:    String(fixtureVenue    || existing.fixtureVenue    || '').slice(0, 100),
      fixtureDate:     String(fixtureDate     || existing.fixtureDate     || '').slice(0, 100),
      savedAt:         now,
      publishedAt:     publish ? now : (existing.publishedAt || null),
    };

    await kvSet(MATCHDAY_KEY, selection);
    return res.status(200).json({ ok: true, selection });
  }

  if (req.method === 'DELETE') {
    try {
      await requireTenantRole(req, ['coach', 'admin']);
    } catch (error) {
      return sendAuthError(res, error);
    }
    await kvDel(MATCHDAY_KEY);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
