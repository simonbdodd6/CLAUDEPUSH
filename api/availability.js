// Availability replies from notification actions or the player app.
import { load } from './_lib.js';
import { loadAvailability, saveAvailability } from './_availabilityStore.js';
import { setCors } from './_http.js';
import { kvConfigured } from './_kv.js';
import { resolveSessionFromRequest } from './_identityStore.js';
import { requireTenantRole } from './_tenant.js';

function sendAuthError(res, error) {
  return res.status(error?.status || 403).json({ ok: false, error: error?.message || 'Not authorized' });
}

const RESPONSES = new Set(['available', 'unavailable', 'maybe']);
const REASONS   = new Set(['injury', 'work', 'holiday', 'family', 'other', '']);

function validSessionId(sessionId) {
  return /^[a-z0-9_-]{1,80}$/i.test(String(sessionId || ''));
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
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet' });

  if (req.method === 'GET') {
    // Player self-GET: returns the logged-in player's own responses across all sessions.
    // Does not expose other players' data.
    if (req.query?.myResponse === '1') {
      const sessionContext = await resolveSessionFromRequest(req).catch(() => null);
      const identity = availabilityIdentityFromSession(sessionContext);
      if (!identity) return res.status(200).json({ responses: {} });
      const SESSION_IDS = ['tue', 'thu', 'game'];
      const result = {};
      await Promise.all(SESSION_IDS.map(async sid => {
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
    const list = Object.entries(responses).map(([key, value]) => ({
      key,
      label:       typeof value === 'string' ? key  : value?.label       || key,
      userId:      typeof value === 'string' ? ''   : value?.userId      || '',
      playerId:    typeof value === 'string' ? ''   : value?.playerId    || '',
      response:    typeof value === 'string' ? value : value?.response,
      reason:      typeof value === 'string' ? ''   : value?.reason      || '',
      respondedAt: typeof value === 'string' ? null : value?.respondedAt,
    }));
    return res.status(200).json({ sessionId, responses: list, count: list.length });
  }

  if (req.method === 'POST') {
    const sessionContext = await resolveSessionFromRequest(req).catch(() => null);
    const { endpoint, response, sessionId, reason } = req.body || {};
    if (!validSessionId(sessionId) || !RESPONSES.has(response)) {
      return res.status(400).json({ error: 'valid sessionId and response (available, unavailable or maybe) are required' });
    }
    const safeReason = REASONS.has(reason) ? (reason || '') : '';

    let identity = availabilityIdentityFromSession(sessionContext);
    if (!identity) {
      if (!endpoint) return res.status(400).json({ error: 'endpoint is required without an authenticated session' });
      // The endpoint-to-player lookup prevents a device inventing replies for
      // another player name. Authenticated accounts now use their permanent userId.
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
