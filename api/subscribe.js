// api/subscribe.js — Player push subscription management (Redis-backed)
// POST  { subscription: PushSubscription, label: string } → saves / updates
// GET   → returns { count }
// DELETE { endpoint: string } → removes

import { load, save } from './_lib.js';
import { setCors } from './_http.js';
import { kvConfigured } from './_kv.js';
import { requireTenantSession } from './_tenant.js';

function displayNameFromSession(sessionContext = {}) {
  const user = sessionContext?.user || {};
  const profile = sessionContext?.playerProfile || {};
  return profile.displayName || user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.name || user.email || '';
}

function sessionIdentity(sessionContext = {}) {
  const userId = sessionContext?.user?.id || '';
  const playerIds = [
    sessionContext?.playerProfile?.userId,
    sessionContext?.playerProfile?.legacyPlayerId,
    userId,
  ].filter(Boolean).map(String);
  return { userId, playerIds };
}

function requestedIdentityAllowed(sessionContext = {}, { userId = '', playerId = '' } = {}) {
  const identity = sessionIdentity(sessionContext);
  if (!identity.userId) return false;
  if (userId && String(userId) !== identity.userId) return false;
  if (playerId && !identity.playerIds.includes(String(playerId))) return false;
  return true;
}

function subscriptionBelongsToSession(subscription = {}, sessionContext = {}) {
  const identity = sessionIdentity(sessionContext);
  if (!identity.userId) return false;
  const subUserId = String(subscription.userId || '');
  const subPlayerId = String(subscription.playerId || '');
  if (subUserId && subUserId === identity.userId) return true;
  if (subPlayerId && identity.playerIds.includes(subPlayerId)) return true;
  return false;
}

function authError(res, error) {
  return res.status(error?.status || 401).json({ error: error?.message || 'Authentication required' });
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet' });

  let sessionContext = null;
  try {
    sessionContext = await requireTenantSession(req);
  } catch (error) {
    return authError(res, error);
  }

  // ── GET: subscription count ──────────────────────────────────────────────
  if (req.method === 'GET') {
    const subs = await load();
    return res.status(200).json({ count: subs.length });
  }

  // ── POST: add / refresh subscription ────────────────────────────────────
  if (req.method === 'POST') {
    const { subscription, label, userId, playerId } = req.body || {};
    if (!requestedIdentityAllowed(sessionContext, { userId, playerId })) {
      return res.status(403).json({ error: 'Cannot subscribe another user' });
    }
    if (!subscription?.endpoint) {
      return res.status(400).json({ error: 'Missing subscription endpoint' });
    }
    const subs  = await load();
    const idx   = subs.findIndex(s => s.subscription.endpoint === subscription.endpoint);
    if (idx >= 0 && !subscriptionBelongsToSession(subs[idx], sessionContext)) {
      return res.status(403).json({ error: 'Cannot replace another user subscription' });
    }
    const sessionUserId = sessionContext?.user?.id || '';
    const sessionPlayerId = sessionContext?.playerProfile?.userId ||
      sessionContext?.playerProfile?.legacyPlayerId || '';
    const entry = {
      subscription,
      label: displayNameFromSession(sessionContext) || label || 'Player',
      userId: sessionUserId || userId || '',
      playerId: sessionPlayerId || playerId || sessionUserId || '',
      teamId: sessionContext?.teamId || '',
      role: sessionContext?.teamMember?.role || sessionContext?.user?.role || '',
      savedAt: new Date().toISOString(),
    };
    if (idx >= 0) subs[idx] = entry; else subs.push(entry);
    await save(subs);
    return res.status(201).json({ ok: true, count: subs.length });
  }

  // ── DELETE: remove subscription ──────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
    const current = await load();
    const target = current.find(s => s.subscription.endpoint === endpoint);
    if (!target) return res.status(404).json({ error: 'Subscription not found' });
    if (!subscriptionBelongsToSession(target, sessionContext)) {
      return res.status(403).json({ error: 'Cannot delete another user subscription' });
    }
    const subs = current.filter(s => s.subscription.endpoint !== endpoint);
    await save(subs);
    return res.status(200).json({ ok: true, count: subs.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
