// api/subscribe.js — Player push subscription management (Redis-backed)
// POST  { subscription: PushSubscription } → saves / updates the caller's device (session required)
// GET   → returns { count }
// DELETE { endpoint: string } → removes

import { load, save } from './_lib.js';
import { setCors } from './_http.js';
import { kvConfigured } from './_kv.js';
import { requireSession } from './_identityStore.js';

function displayNameFromSession(sessionContext = {}) {
  const user = sessionContext?.user || {};
  const profile = sessionContext?.playerProfile || {};
  return profile.displayName || user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.name || user.email || '';
}

function messagingPlayerIdFromSession(sessionContext = {}) {
  const userId = String(sessionContext?.user?.id || '').trim();
  const legacyPlayerId = String(sessionContext?.playerProfile?.legacyPlayerId || '').trim();
  if (!userId) return '';
  // Permanent accounts use userId for new DM conversation IDs. The remaining
  // legacy compatibility player keeps the historic participant ID so old
  // Simon Test Player subscriptions still map to dm:coach-demo:inv-YxnjxnQa.
  if (legacyPlayerId && userId.startsWith('player-')) return legacyPlayerId;
  return userId;
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet' });

  // ── GET: subscription count (or full debug list in dev mode) ─────────────
  if (req.method === 'GET') {
    const subs = await load();
    if (req.query?.debug === '1' && process.env.DEV_LOGIN === 'true') {
      return res.status(200).json({
        count: subs.length,
        subscriptions: subs.map(s => ({
          label:          s.label || '',
          userId:         s.userId || '',
          playerId:       s.playerId || '',
          legacyPlayerId: s.legacyPlayerId || '',
          role:           s.role || '',
          savedAt:        s.savedAt || null,
          endpointTail:   s.subscription?.endpoint ? s.subscription.endpoint.slice(-40) : null,
          endpointFull:   s.subscription?.endpoint || null,
          hasP256dh:      Boolean(s.subscription?.keys?.p256dh),
          hasAuth:        Boolean(s.subscription?.keys?.auth),
        })),
      });
    }
    return res.status(200).json({ count: subs.length });
  }

  // ── POST: add / refresh subscription ────────────────────────────────────
  if (req.method === 'POST') {
    // The stored ids and label are what push.js and chat.js deliver by, so they
    // come from the authenticated session and nowhere else. Identity fields in
    // the body (userId, playerId, legacyPlayerId, label, role) are ignored: a
    // caller could otherwise register a device as someone else and receive
    // their notifications. No session means no subscription.
    let sessionContext;
    try {
      sessionContext = await requireSession(req);
    } catch {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const { subscription } = req.body || {};
    if (!subscription?.endpoint) {
      return res.status(400).json({ error: 'Missing subscription endpoint' });
    }
    const subs  = await load();
    const idx   = subs.findIndex(s => s.subscription.endpoint === subscription.endpoint);
    // The row is rebuilt wholly from the session: re-saving an endpoint another
    // user registered (a shared device) rebinds it to the caller, and none of
    // the previous owner's ids survive onto it.
    const sessionUserId = sessionContext.user.id;
    const entry = {
      subscription,
      label:         displayNameFromSession(sessionContext) || 'Player',
      userId:        sessionUserId,
      playerId:      messagingPlayerIdFromSession(sessionContext) || sessionUserId,
      legacyPlayerId: sessionContext.playerProfile?.legacyPlayerId || '',
      role:          sessionContext.teamMember?.role || sessionContext.user?.role || '',
      savedAt:       new Date().toISOString(),
    };
    if (idx >= 0) subs[idx] = entry; else subs.push(entry);
    await save(subs);
    return res.status(201).json({ ok: true, count: subs.length });
  }

  // ── DELETE: remove subscription ──────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { endpoint, action } = req.body || {};
    // Dev-only: purge all subscriptions that have empty userId, playerId, AND legacyPlayerId
    // so they can be cleanly re-registered with correct IDs.
    if (action === 'purge_empty' && process.env.DEV_LOGIN === 'true') {
      const subs = await load();
      const before = subs.length;
      const cleaned = subs.filter(s => s.userId || s.playerId || s.legacyPlayerId);
      await save(cleaned);
      return res.status(200).json({ ok: true, purged: before - cleaned.length, remaining: cleaned.length });
    }
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
    const subs = (await load()).filter(s => s.subscription.endpoint !== endpoint);
    await save(subs);
    return res.status(200).json({ ok: true, count: subs.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
