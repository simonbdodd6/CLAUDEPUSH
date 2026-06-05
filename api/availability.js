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
      label: typeof value === 'string' ? key : value?.label || key,
      userId: typeof value === 'string' ? '' : value?.userId || '',
      playerId: typeof value === 'string' ? '' : value?.playerId || '',
      response: typeof value === 'string' ? value : value?.response,
      respondedAt: typeof value === 'string' ? null : value?.respondedAt,
    }));
    return res.status(200).json({ sessionId, responses: list, count: list.length });
  }

  if (req.method === 'POST') {
    const sessionContext = await resolveSessionFromRequest(req).catch(() => null);
    const { endpoint, response, sessionId } = req.body || {};
    if (!validSessionId(sessionId) || !RESPONSES.has(response)) {
      return res.status(400).json({ error: 'valid sessionId and response (available, unavailable or maybe) are required' });
    }

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
      respondedAt: new Date().toISOString(),
      label: identity.label,
      userId: identity.userId,
      playerId: identity.playerId,
      legacyPlayerId: identity.legacyPlayerId,
    };
    await saveAvailability(sessionId, responses);
    return res.status(200).json({ ok: true, label: identity.label, userId: identity.userId, playerId: identity.playerId, response, sessionId });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
