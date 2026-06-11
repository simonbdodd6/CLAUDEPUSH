// Exact origins allowed for cross-origin requests.
// APP_ORIGIN must be set in production env vars. VERCEL_URL covers preview deployments.
const ALLOWED_ORIGINS = new Set([
  process.env.APP_ORIGIN || 'https://boitsfort-coachseye.vercel.app',
  'http://localhost:3000',
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
]);

export function setCors(res, req) {
  const requestOrigin = req?.headers?.origin || '';
  const origin = ALLOWED_ORIGINS.has(requestOrigin) ? requestOrigin : [...ALLOWED_ORIGINS][0];
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function readSecret(req) {
  const authorization = String(req.headers?.authorization || '');
  return authorization.replace(/^Bearer\s+/i, '').trim() || req.query?.secret || '';
}

export function vapidContact() {
  const configured = String(process.env.VAPID_CONTACT || 'mailto:coach@example.com');
  return configured.startsWith('mailto:') ? configured : `mailto:${configured}`;
}

// Format-level VAPID key validation shared by /api/config (reporting) and
// /api/push (enforcement). P-256 public key = 87 base64url chars, private = 43.
export function vapidKeyStatus() {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (!publicKey && !privateKey) return { ok: false, error: 'VAPID keys not configured — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY' };
  if (!publicKey) return { ok: false, error: 'VAPID_PUBLIC_KEY is missing' };
  if (!privateKey) return { ok: false, error: 'VAPID_PRIVATE_KEY is missing' };
  if (!/^[A-Za-z0-9_-]{87}$/.test(publicKey)) return { ok: false, error: `VAPID_PUBLIC_KEY malformed (expected 87 base64url chars, got ${publicKey.length})` };
  if (!/^[A-Za-z0-9_-]{43}$/.test(privateKey)) return { ok: false, error: `VAPID_PRIVATE_KEY malformed (expected 43 base64url chars, got ${privateKey.length})` };
  return { ok: true };
}
