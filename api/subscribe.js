// api/subscribe.js — Player push subscription management (Redis-backed)
// POST  { subscription: PushSubscription, label: string } → saves / updates
// GET   → returns { count }
// DELETE { endpoint: string } → removes

import { load, save } from './_lib.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

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
    const entry = { subscription, label: label || 'Player', savedAt: new Date().toISOString() };
    if (idx >= 0) subs[idx] = entry; else subs.push(entry);
    await save(subs);
    return res.status(201).json({ ok: true, count: subs.length });
  }

  // ── DELETE: remove subscription ──────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
    const subs = (await load()).filter(s => s.subscription.endpoint !== endpoint);
    await save(subs);
    return res.status(200).json({ ok: true, count: subs.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
