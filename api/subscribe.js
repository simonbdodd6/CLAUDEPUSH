// api/subscribe.js — Player push subscription management (Redis-backed)
// POST  { subscription: PushSubscription, label: string } → saves / updates
// GET   → returns { count }
// DELETE { endpoint: string } → removes

import { load, save } from './_lib.js';
import { setCors } from './_http.js';
import { kvConfigured } from './_kv.js';
import { resolveSessionFromRequest } from './_identityStore.js';

function displayNameFromSession(sessionContext = {}) {
  const user = sessionContext?.user || {};
  const profile = sessionContext?.playerProfile || {};
  return profile.displayName || user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.name || user.email || '';
}

export default async function handler(req, res) {
  setCors(res);
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
    const sessionContext = await resolveSessionFromRequest(req).catch(() => null);
    const { subscription, label, userId, playerId, legacyPlayerId: clientLegacyId } = req.body || {};
    if (!subscription?.endpoint) {
      return res.status(400).json({ error: 'Missing subscription endpoint' });
    }
    const subs  = await load();
    const idx   = subs.findIndex(s => s.subscription.endpoint === subscription.endpoint);
    // Preserve any IDs already stored for this endpoint so that a session-less
    // save (e.g. iOS PWA where the cookie is not forwarded) cannot overwrite
    // previously-known routing IDs with empty strings.
    const existing = idx >= 0 ? subs[idx] : null;
    const sessionUserId   = sessionContext?.user?.id || '';
    const sessionLegacyId = sessionContext?.playerProfile?.legacyPlayerId || '';
    const sessionProfileId = sessionContext?.playerProfile?.userId || '';
    // playerId should be the messaging participant ID (legacyPlayerId when available)
    // so that DM push subscriptions can be found by convId participant.
    const resolvedPlayerId = sessionLegacyId || sessionProfileId || sessionUserId;
    const entry = {
      subscription,
      label:         displayNameFromSession(sessionContext) || label || existing?.label || 'Player',
      userId:        sessionUserId || userId || existing?.userId || '',
      playerId:      resolvedPlayerId || playerId || existing?.playerId || sessionUserId || '',
      legacyPlayerId: sessionLegacyId || clientLegacyId || existing?.legacyPlayerId || '',
      role:          sessionContext?.teamMember?.role || sessionContext?.user?.role || existing?.role || '',
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
