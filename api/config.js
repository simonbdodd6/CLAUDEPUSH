// Browser-safe public configuration. Never send private VAPID or Redis values.
// Also handles ?log=1 for authenticated coach activity log reads.
import { setCors, vapidKeyStatus } from './_http.js';
import { kvConfigured, kvLrange } from './_kv.js';
import { key, legacyKey } from './_keys.js';
import { requireTenantRole } from './_tenant.js';

function sendAuthError(res, error) {
  return res.status(error?.status || 403).json({ ok: false, error: error?.message || 'Not authorized' });
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Activity log sub-route — requires coach auth.
  if (req.query?.log === '1') {
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

  const vapidPublicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const storageConfigured = kvConfigured();
  const vapidStatus = vapidKeyStatus();
  return res.status(200).json({
    vapidPublicKey,
    pushConfigured: Boolean(vapidStatus.ok && storageConfigured),
    // Why push is unavailable, so the coach UI can show an actionable message
    // instead of a silent failure. Key *values* are never exposed.
    pushConfigError: vapidStatus.ok ? (storageConfigured ? null : 'Message storage not configured') : vapidStatus.error,
    storageConfigured,
    devLogin: process.env.DEV_LOGIN === 'true',
  });
}
