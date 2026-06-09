// api/seed.js — dev-only demo data seeding for availability tests.
// All actions require DEV_LOGIN=true. Never exposed in production.
import { loadAvailability, saveAvailability } from './_availabilityStore.js';
import { setCors } from './_http.js';
import { kvConfigured } from './_kv.js';

const DEMO_SESSIONS = ['tue', 'thu', 'game'];

// Default demo roster — mirrors the rugby demo players in the client
const DEMO_PLAYERS = [
  { name: 'Simon Test Player', userId: 'player-simon-test', playerId: 'player-simon-test', legacyPlayerId: 'inv-YxnjxnQa', response: 'available',   reason: '' },
  { name: 'Jake Smith',        userId: 'jake-smith',        playerId: 'jake-smith',        legacyPlayerId: '',           response: 'unavailable', reason: 'injury' },
  { name: 'Tom Williams',      userId: 'tom-williams',      playerId: 'tom-williams',       legacyPlayerId: '',           response: 'maybe',       reason: 'work' },
  { name: 'Ben Jones',         userId: 'ben-jones',         playerId: 'ben-jones',          legacyPlayerId: '',           response: 'no-reply',    reason: '' },
];

function devOnly(res) {
  return res.status(403).json({ error: 'dev-only: set DEV_LOGIN=true to use seed API' });
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (process.env.DEV_LOGIN !== 'true') return devOnly(res);
  if (!kvConfigured()) return res.status(503).json({ error: 'Storage not configured' });

  // Allow GET for status checks
  if (req.method === 'GET') {
    const sessions = String(req.query.sessions || DEMO_SESSIONS.join(',')).split(',').filter(Boolean);
    const data = {};
    await Promise.all(sessions.map(async sid => {
      const entries = await loadAvailability(sid);
      data[sid] = Object.entries(entries).map(([key, val]) => ({
        key,
        label:       typeof val === 'string' ? key : (val.label || key),
        response:    typeof val === 'string' ? val : (val.response || ''),
        reason:      typeof val === 'string' ? '' : (val.reason || ''),
        respondedAt: typeof val === 'string' ? null : (val.respondedAt || null),
      }));
    }));
    return res.status(200).json({ ok: true, sessions: data });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, sessions: rawSessions, players: rawPlayers } = req.body || {};
  const sessions = Array.isArray(rawSessions) && rawSessions.length ? rawSessions : DEMO_SESSIONS;
  const players  = Array.isArray(rawPlayers) && rawPlayers.length ? rawPlayers : DEMO_PLAYERS;

  // ── reset: wipe availability for named sessions ───────────────────────────
  if (action === 'reset_availability') {
    await Promise.all(sessions.map(sid => saveAvailability(sid, {})));
    return res.status(200).json({ ok: true, action: 'reset_availability', cleared: sessions });
  }

  // ── seed: write demo responses for each player × session ─────────────────
  if (action === 'seed_availability') {
    const counts = {};
    for (const sid of sessions) {
      const existing = await loadAvailability(sid);
      for (const p of players) {
        if (p.response === 'no-reply') continue; // no-reply means "don't write anything"
        const key = p.userId || p.name;
        if (!key) continue;
        existing[key] = {
          response:      p.response || 'available',
          reason:        p.reason   || '',
          respondedAt:   new Date().toISOString(),
          label:         p.name || key,
          userId:        p.userId        || '',
          playerId:      p.playerId      || p.userId || '',
          legacyPlayerId: p.legacyPlayerId || '',
        };
      }
      await saveAvailability(sid, existing);
      counts[sid] = Object.keys(existing).length;
    }
    return res.status(200).json({ ok: true, action: 'seed_availability', sessions: counts });
  }

  return res.status(400).json({
    error: 'Unknown action',
    validActions: ['reset_availability', 'seed_availability'],
  });
}
