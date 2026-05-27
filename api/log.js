// api/log.js — Message delivery log reader
// GET ?limit=N  → { log: [...], count: N }
// DELETE        → clears entire log (coach use only)

import { kvLrange, kvDel } from './_kv.js';

const LOG_KEY = 'ce:message_log';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const limit = Math.min(parseInt(req.query?.limit || '50', 10), 500);
    const log   = await kvLrange(LOG_KEY, 0, limit - 1);
    return res.status(200).json({ log, count: log.length });
  }

  if (req.method === 'DELETE') {
    await kvDel(LOG_KEY);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
