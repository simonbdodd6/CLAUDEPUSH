// api/subscribe.js — Player push subscription management (Redis-backed)
// POST  { subscription: PushSubscription } → saves / updates the caller's device (session required)
// GET   → returns { count }
// DELETE { endpoint: string } → removes the caller's own device (session required)

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

async function hasActiveSession(req) {
  try { await requireSession(req); return true; } catch { return false; }
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
    // The debug listing prints every device's endpoint, ids and label across
    // all clubs. DEV_LOGIN alone is not authorisation: it also needs a signed-in
    // caller, and an anonymous request gets the plain count like everyone else.
    if (req.query?.debug === '1' && process.env.DEV_LOGIN === 'true' && await hasActiveSession(req)) {
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
    const sessionUserId = String(sessionContext.user.id);
    // A row may only be written by the user it already belongs to. Re-saving an
    // endpoint used to rebind it wholly to the caller, which made possession of
    // an endpoint string — unguessable, but not a credential — enough to take
    // another member's device: the row became the attacker's, so DELETE would
    // then remove it legitimately and the victim silently lost notifications.
    //
    // An ownerless legacy row (empty userId, saved before this handler required
    // a session) is NOT free to claim: that is precisely the shape an attacker
    // would want to adopt, and the device behind it may be someone else's. It
    // is already undeliverable, and dev-only purge_empty remains the way out.
    //
    // The refusal names nobody — no id, label, club or role — and happens
    // before any write. A device that has genuinely changed hands gets a fresh
    // endpoint from the browser (the client rotates it on this response), which
    // creates a new row rather than seizing the old one.
    if (idx >= 0 && String(subs[idx].userId || '') !== sessionUserId) {
      return res.status(409).json({
        error: 'This device is registered to another account',
        code:  'endpoint_owned',
      });
    }
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

  // ── DELETE: remove the caller's own subscription ─────────────────────────
  if (req.method === 'DELETE') {
    // Removing a row silences a device. An endpoint URL is unguessable but it
    // is not a credential (the debug listing and push reports carry it), so
    // knowing one proves nothing. The caller must be signed in, and the only
    // row they may remove is one POST bound to their own session user. No
    // session means no deletion — and no write at all.
    let sessionContext;
    try {
      sessionContext = await requireSession(req);
    } catch {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const { endpoint, action } = req.body || {};
    // Dev-only: purge all subscriptions that have empty userId, playerId, AND legacyPlayerId
    // so they can be cleanly re-registered with correct IDs. DEV_LOGIN alone is
    // not authorisation (the session check above still applies).
    if (action === 'purge_empty' && process.env.DEV_LOGIN === 'true') {
      const subs = await load();
      const before = subs.length;
      const cleaned = subs.filter(s => s.userId || s.playerId || s.legacyPlayerId);
      await save(cleaned);
      return res.status(200).json({ ok: true, purged: before - cleaned.length, remaining: cleaned.length });
    }
    if (typeof endpoint !== 'string' || !endpoint) {
      return res.status(400).json({ error: 'Missing endpoint' });
    }
    // Ownership is the stored userId that POST derived from the session; body
    // and query identity are ignored. A row bound to someone else and a row
    // that does not exist get the same answer, so the response never confirms
    // whether a given endpoint is registered. A legacy row with an empty
    // userId has no owner and is removed by nobody through this path.
    const sessionUserId = String(sessionContext.user.id);
    const subs = await load();
    const kept = subs.filter(s =>
      !(s.subscription?.endpoint === endpoint && s.userId && String(s.userId) === sessionUserId)
    );
    const removed = subs.length - kept.length;
    if (removed > 0) await save(kept);
    return res.status(200).json({ ok: true, removed, count: kept.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
