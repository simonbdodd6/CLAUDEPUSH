// Availability replies from notification actions or the player app.
// Also handles dev-only seed/reset actions when DEV_LOGIN=true.
import { load } from './_lib.js';
import { loadAvailability, saveAvailability } from './_availabilityStore.js';
import { setCors } from './_http.js';
import { kvConfigured, kvGet } from './_kv.js';
import { key } from './_keys.js';
import { DEFAULT_TEAM, resolveSessionFromRequest } from './_identityStore.js';
import { requireTenantRole } from './_tenant.js';

function sendAuthError(res, error) {
  return res.status(error?.status || 403).json({ ok: false, error: error?.message || 'Not authorized' });
}

const RESPONSES = new Set(['available', 'unavailable', 'maybe']);
const REASONS   = new Set(['injury', 'work', 'holiday', 'family', 'other', '']);
const DEMO_SESSIONS = ['tue', 'thu', 'game'];

const DEMO_PLAYERS = [
  { name: 'Simon Test Player', userId: 'player-simon-test', playerId: 'player-simon-test', legacyPlayerId: 'inv-YxnjxnQa', response: 'available',   reason: '' },
  { name: 'Jake Smith',        userId: 'jake-smith',        playerId: 'jake-smith',        legacyPlayerId: '',           response: 'unavailable', reason: 'injury' },
  { name: 'Tom Williams',      userId: 'tom-williams',      playerId: 'tom-williams',       legacyPlayerId: '',           response: 'maybe',       reason: 'work' },
  { name: 'Ben Jones',         userId: 'ben-jones',         playerId: 'ben-jones',          legacyPlayerId: '',           response: 'no-reply',    reason: '' },
];

function validSessionId(sessionId) {
  return /^[a-z0-9_-]{1,80}$/i.test(String(sessionId || ''));
}

// Session IDs the coach has saved via /api/publish, scoped by team with a
// fallback to the pre-scoping legacy key for the default team. Falls back
// to the historic tue/thu/game trio when nothing is published yet, so
// behaviour is unchanged for existing deployments.
async function activeSessionIds(teamId = DEFAULT_TEAM.id) {
  let published = await kvGet(key(`publish:${teamId}:sessions`));
  if (!Array.isArray(published) && teamId === DEFAULT_TEAM.id) {
    published = await kvGet(key('publish:sessions'));
  }
  const ids = (Array.isArray(published) ? published : [])
    .map(s => String(s?.id || ''))
    .filter(id => validSessionId(id))
    .slice(0, 30);
  return ids.length ? ids : DEMO_SESSIONS;
}

function availabilityIdentityFromSession(sessionContext = {}) {
  const user = sessionContext?.user || {};
  const profile = sessionContext?.playerProfile || {};
  const userId = user.id || '';
  if (!userId) return null;
  return {
    key: userId,
    userId,
    playerId: profile.userId || userId,
    legacyPlayerId: profile.legacyPlayerId || '',
    label: profile.displayName || user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.name || user.email || userId,
  };
}

function availabilityIdentityFromSubscription(subscription = {}) {
  const userId = subscription.userId || '';
  const playerId = subscription.playerId || userId || '';
  const label = subscription.label || 'Player';
  return {
    key: userId || playerId || label,
    userId,
    playerId,
    legacyPlayerId: subscription.legacyPlayerId || '',
    label,
  };
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet' });

  // ── Dev-only seed/reset actions ─────────────────────────────────────────────
  if (req.method === 'POST' && process.env.DEV_LOGIN === 'true') {
    const { action, sessions: rawSessions, players: rawPlayers } = req.body || {};
    if (action === 'reset_availability' || action === 'seed_availability') {
      const sessions = Array.isArray(rawSessions) && rawSessions.length ? rawSessions : DEMO_SESSIONS;
      const players  = Array.isArray(rawPlayers) && rawPlayers.length ? rawPlayers : DEMO_PLAYERS;

      if (action === 'reset_availability') {
        await Promise.all(sessions.map(sid => saveAvailability(sid, {})));
        return res.status(200).json({ ok: true, action: 'reset_availability', cleared: sessions });
      }

      if (action === 'seed_availability') {
        const counts = {};
        for (const sid of sessions) {
          const existing = await loadAvailability(sid);
          for (const p of players) {
            if (p.response === 'no-reply') continue;
            const k = p.userId || p.name;
            if (!k) continue;
            existing[k] = {
              response:       p.response || 'available',
              reason:         p.reason   || '',
              respondedAt:    new Date().toISOString(),
              label:          p.name || k,
              userId:         p.userId         || '',
              playerId:       p.playerId        || p.userId || '',
              legacyPlayerId: p.legacyPlayerId  || '',
            };
          }
          await saveAvailability(sid, existing);
          counts[sid] = Object.keys(existing).length;
        }
        return res.status(200).json({ ok: true, action: 'seed_availability', sessions: counts });
      }
    }
  }

  // ── Dev-only seed GET status ────────────────────────────────────────────────
  if (req.method === 'GET' && req.query?._dev === 'status' && process.env.DEV_LOGIN === 'true') {
    const sessions = String(req.query.sessions || DEMO_SESSIONS.join(',')).split(',').filter(Boolean);
    const data = {};
    await Promise.all(sessions.map(async sid => {
      const entries = await loadAvailability(sid);
      data[sid] = Object.entries(entries).map(([k, val]) => ({
        key: k,
        label:       typeof val === 'string' ? k : (val.label || k),
        response:    typeof val === 'string' ? val : (val.response || ''),
        reason:      typeof val === 'string' ? '' : (val.reason || ''),
        respondedAt: typeof val === 'string' ? null : (val.respondedAt || null),
      }));
    }));
    return res.status(200).json({ ok: true, sessions: data });
  }

  if (req.method === 'GET') {
    // Player self-GET: returns the logged-in player's own responses across all sessions.
    if (req.query?.myResponse === '1') {
      const sessionContext = await resolveSessionFromRequest(req).catch(() => null);
      const identity = availabilityIdentityFromSession(sessionContext);
      if (!identity) return res.status(200).json({ responses: {} });
      const result = {};
      const sessionIds = await activeSessionIds(sessionContext?.teamMember?.teamId || sessionContext?.session?.teamId);
      await Promise.all(sessionIds.map(async sid => {
        const data = await loadAvailability(sid);
        const entry = Object.values(data).find(v =>
          (v.userId && v.userId === identity.userId) ||
          (v.playerId && v.playerId === identity.playerId) ||
          (v.legacyPlayerId && v.legacyPlayerId === identity.legacyPlayerId)
        );
        if (entry) result[sid] = { response: entry.response, reason: entry.reason || '' };
      }));
      return res.status(200).json({ responses: result });
    }

    try {
      await requireTenantRole(req, ['coach', 'admin']);
    } catch (error) {
      return sendAuthError(res, error);
    }
    const sessionId = req.query?.sessionId || 'game';
    if (!validSessionId(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });
    const responses = await loadAvailability(sessionId);
    const list = Object.entries(responses).map(([k, value]) => ({
      key:         k,
      label:       typeof value === 'string' ? k     : value?.label       || k,
      userId:      typeof value === 'string' ? ''    : value?.userId      || '',
      playerId:    typeof value === 'string' ? ''    : value?.playerId    || '',
      response:    typeof value === 'string' ? value : value?.response,
      reason:      typeof value === 'string' ? ''    : value?.reason      || '',
      respondedAt: typeof value === 'string' ? null  : value?.respondedAt,
    }));
    return res.status(200).json({ sessionId, responses: list, count: list.length });
  }

  if (req.method === 'POST') {
    const sessionContext = await resolveSessionFromRequest(req).catch(() => null);
    const { action: postAction, endpoint, response, sessionId, reason, sessions: clearSessions } = req.body || {};

    // ── Coach-gated clear_week action ──────────────────────────────────────────
    if (postAction === 'clear_week') {
      let coachSession;
      try { coachSession = await requireTenantRole(req, ['coach', 'admin']); }
      catch (error) { return sendAuthError(res, error); }
      const ids = Array.isArray(clearSessions) && clearSessions.length ? clearSessions : await activeSessionIds(coachSession.teamId);
      const validIds = ids.filter(id => validSessionId(id));
      await Promise.all(validIds.map(sid => saveAvailability(sid, {})));
      return res.status(200).json({ ok: true, action: 'clear_week', cleared: validIds });
    }

    if (!validSessionId(sessionId) || !RESPONSES.has(response)) {
      return res.status(400).json({ error: 'valid sessionId and response (available, unavailable or maybe) are required' });
    }
    const safeReason = REASONS.has(reason) ? (reason || '') : '';

    let identity = availabilityIdentityFromSession(sessionContext);
    if (!identity) {
      if (!endpoint) return res.status(400).json({ error: 'endpoint is required without an authenticated session' });
      const subscription = (await load()).find(item => item.subscription?.endpoint === endpoint);
      if (!subscription) return res.status(404).json({ error: 'Subscription not registered' });
      identity = availabilityIdentityFromSubscription(subscription);
    }

    const responses = await loadAvailability(sessionId);
    responses[identity.key] = {
      response,
      reason: safeReason,
      respondedAt: new Date().toISOString(),
      label: identity.label,
      userId: identity.userId,
      playerId: identity.playerId,
      legacyPlayerId: identity.legacyPlayerId,
    };
    await saveAvailability(sessionId, responses);
    return res.status(200).json({ ok: true, label: identity.label, userId: identity.userId, playerId: identity.playerId, response, reason: safeReason, sessionId });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
