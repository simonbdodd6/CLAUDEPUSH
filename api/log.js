import { kvLrange, kvConfigured } from './_kv.js';
import { key, legacyKey } from './_keys.js';
import { setCors } from './_http.js';
import { requireTenantRole } from './_tenant.js';

function sendAuthError(res, error) {
  return res.status(error?.status || 403).json({ ok: false, error: error?.message || 'Not authorized' });
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet', log: [] });
  try {
    await requireTenantRole(req, ['coach', 'admin']);
  } catch (error) {
    return sendAuthError(res, error);
  }

  const requested = Number.parseInt(req.query?.limit || '10', 10);
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(requested, 100)) : 10;
  let log = await kvLrange(key('message_log'), 0, limit - 1);
  if (!log.length) log = await kvLrange(legacyKey('message_log'), 0, limit - 1);
  return res.status(200).json({ log });
}
