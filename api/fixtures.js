// Season fixture CRUD.
// GET    /api/fixtures   → list all fixtures (public — players and coaches)
// POST   /api/fixtures   → create or update fixture (coach only)
// DELETE /api/fixtures   → delete fixture by id (coach only)
import { kvGet, kvSet, kvConfigured } from './_kv.js';
import { key } from './_keys.js';
import { setCors } from './_http.js';
import { requireTenantRole } from './_tenant.js';

const FIXTURES_KEY = key('fixtures');
const MAX_FIXTURES = 200;
const VALID_VENUES = new Set(['Home', 'Away', 'Neutral']);

function sendAuthError(res, error) {
  return res.status(error?.status || 403).json({ ok: false, error: error?.message || 'Not authorized' });
}

function makeId() {
  return `fix_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function validate(body = {}) {
  const { opponent, date, venue, kickoff } = body;
  if (!String(opponent || '').trim()) return 'opponent is required';
  if (!String(date    || '').trim()) return 'date is required';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date).trim())) return 'date must be YYYY-MM-DD';
  if (isNaN(new Date(String(date).trim()).getTime())) return 'date is not valid';
  if (venue   && !VALID_VENUES.has(String(venue)))  return 'venue must be Home, Away, or Neutral';
  if (kickoff && !/^\d{2}:\d{2}$/.test(String(kickoff))) return 'kickoff must be HH:MM';
  return null;
}

async function readFixtures() {
  return (await kvGet(FIXTURES_KEY)) || [];
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ error: 'Storage not configured' });

  if (req.method === 'GET') {
    const fixtures = await readFixtures();
    return res.status(200).json({ ok: true, fixtures });
  }

  if (req.method === 'POST') {
    try {
      await requireTenantRole(req, ['coach', 'admin']);
    } catch (error) {
      return sendAuthError(res, error);
    }

    const error = validate(req.body);
    if (error) return res.status(400).json({ error });

    const { id, opponent, date, venue, kickoff, competition, notes } = req.body;
    const now      = new Date().toISOString();
    const fixtures = await readFixtures();
    const existing = fixtures.find(f => f.id === id);

    if (!existing && fixtures.length >= MAX_FIXTURES) {
      return res.status(400).json({ error: `Maximum ${MAX_FIXTURES} fixtures per season` });
    }

    const fixture = {
      id:          String(id || makeId()),
      opponent:    String(opponent).trim().slice(0, 100),
      venue:       VALID_VENUES.has(String(venue || '')) ? String(venue) : 'Home',
      date:        String(date).trim(),
      kickoff:     /^\d{2}:\d{2}$/.test(String(kickoff || '')) ? String(kickoff) : '',
      competition: String(competition || '').trim().slice(0, 100),
      notes:       String(notes || '').trim().slice(0, 500),
      createdAt:   existing?.createdAt || now,
      updatedAt:   now,
    };

    const next = existing
      ? fixtures.map(f => f.id === fixture.id ? fixture : f)
      : [...fixtures, fixture];

    await kvSet(FIXTURES_KEY, next);
    return res.status(200).json({ ok: true, fixture });
  }

  if (req.method === 'DELETE') {
    try {
      await requireTenantRole(req, ['coach', 'admin']);
    } catch (error) {
      return sendAuthError(res, error);
    }
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    const fixtures = (await readFixtures()).filter(f => f.id !== id);
    await kvSet(FIXTURES_KEY, fixtures);
    return res.status(200).json({ ok: true, count: fixtures.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
