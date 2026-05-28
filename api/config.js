// Browser-safe public configuration. Never send private VAPID or Redis values.
import { setCors } from './_http.js';
import { kvConfigured } from './_kv.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
  const storageConfigured = kvConfigured();
  return res.status(200).json({
    vapidPublicKey,
    pushConfigured: Boolean(vapidPublicKey && process.env.VAPID_PRIVATE_KEY && storageConfigured),
    storageConfigured,
  });
}
