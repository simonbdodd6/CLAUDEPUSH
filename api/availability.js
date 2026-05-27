// api/availability.js — Player availability responses
//
// POST { endpoint, response, sessionId }
//   → called by the service worker when a player taps ✅/❌ on a notification
//   → looks up the subscriber label (player name) from the subscriptions list
//   → stores the response in Redis
//
// GET ?sessionId=tue
//   → returns all responses for a session so the coach dashboard can show them

import { kvGet, kvSet } from './_kv.js';

const SUBS_KEY   = 'ce:subscriptions';
const AVAIL_KEY  = (id) => `ce:availability:${id}`;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: fetch all responses for a session ────────────────────────────────
  if (req.method === 'GET') {
    const sessionId = req.query?.sessionId || 'game';
    const responses = (await kvGet(AVAIL_KEY(sessionId))) || {};
    // Normalise: old format stores a plain string, new format stores { response, respondedAt }
    const list = Object.entries(responses).map(([label, val]) => ({
      label,
      response:    typeof val === 'string' ? val : val?.response,
      respondedAt: typeof val === 'string' ? null : val?.respondedAt,
    }));
    return res.status(200).json({ sessionId, responses: list, count: list.length });
  }

  // ── POST: record a player's response from notification action ─────────────
  if (req.method === 'POST') {
    const { endpoint, response, sessionId } = req.body || {};

    if (!endpoint || !response || !sessionId) {
      return res.status(400).json({ error: 'endpoint, response and sessionId are required' });
    }

    const validResponses = ['available', 'unavailable', 'maybe'];
    if (!validResponses.includes(response)) {
      return res.status(400).json({ error: `response must be one of: ${validResponses.join(', ')}` });
    }

    // Look up this endpoint to get the player's label
    const subs  = (await kvGet(SUBS_KEY)) || [];
    const match = subs.find(s => s.subscription?.endpoint === endpoint);
    const label = match?.label || 'Unknown player';

    // Store/update their response (with timestamp so no-reply cron can filter by recency)
    const existing = (await kvGet(AVAIL_KEY(sessionId))) || {};
    existing[label] = { response, respondedAt: new Date().toISOString() };
    await kvSet(AVAIL_KEY(sessionId), existing);

    console.log(`[availability] ${label} → ${response} for ${sessionId}`);

    return res.status(200).json({ ok: true, label, response, sessionId });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
