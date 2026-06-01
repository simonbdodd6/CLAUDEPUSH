// api/subscribe.js — Player push subscription management (Redis-backed)
// POST  { subscription: PushSubscription, label: string } → saves / updates
// GET   → returns { count }
// DELETE { endpoint: string } → removes

import { load, save } from './_lib.js';
import { setCors } from './_http.js';
import { kvConfigured } from './_kv.js';
import { requireAuth } from './_auth.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet' });

  const auth = await requireAuth(req, res);
  if (!auth) return;

  // ── GET: subscription count ──────────────────────────────────────────────
  if (req.method === 'GET') {
    const subs = await load();
    return res.status(200).json({ count: subs.length });
  }

  // ── POST: add / refresh subscription ────────────────────────────────────
  if (req.method === 'POST') {
    const { subscription, label } = req.body || {};
    if (!subscription?.endpoint) {
      return res.status(400).json({ error: 'Missing subscription endpoint' });
    }
    const subs  = await load();
    const idx   = subs.findIndex(s => s.subscription.endpoint === subscription.endpoint);
    const entry = {
      userId: auth.uid,
      role: auth.role,
      subscription,
      label: label || 'Player',
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
    const subs = await load();
    const existing = subs.find(s => s.subscription.endpoint === endpoint);
    if (!existing) return res.status(404).json({ error: 'Subscription not found' });
    if (existing.userId !== auth.uid) {
      return res.status(403).json({ error: 'Cannot remove another user\'s subscription' });
    }
    const filtered = subs.filter(s => s.subscription.endpoint !== endpoint);
    await save(filtered);
    return res.status(200).json({ ok: true, count: filtered.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
