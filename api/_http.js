// Exact origins allowed for cross-origin requests.
// APP_ORIGIN must be set in production env vars. VERCEL_URL covers preview deployments.
const ALLOWED_ORIGINS = new Set([
  process.env.APP_ORIGIN || 'https://www.coacheasier.com',
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

/**
 * The shared operational secret, read from the Authorization header ONLY.
 *
 * This used to fall back to `req.query.secret`. A secret in a URL travels into
 * server access logs, proxy logs, browser history and Referer headers, and into
 * whatever third-party scheduler holds the URL. It gates the cron dispatcher and
 * the production account-recovery actions, so it is worth keeping out of URLs.
 *
 * Callers must send `Authorization: Bearer <secret>`.
 */
export function readSecret(req) {
  const authorization = String(req.headers?.authorization || '');
  return authorization.replace(/^Bearer\s+/i, '').trim();
}

// ── Notification deep-link routing ─────────────────────────────────────────
// Single source of truth mapping a push notification `type` to the in-app
// destination it should open. The server encodes the destination as a
// view-agnostic `to` token in the notification URL (`/?to=<token>`); the app
// (index.html handleDeepLink + the service-worker navigate message) resolves
// that token to the concrete coach/player section it maps to.
//
// Adding a new notification type here — and nowhere else — is enough to route
// it straight to the right page instead of dumping the user on the dashboard.
const NOTIFICATION_TARGETS = {
  dm:                      'messages',
  message:                 'messages',
  availability:            'availability',
  'availability-reminder': 'availability',
  training:                'training',
  selection:               'matchcentre',
  squad:                   'matchcentre',
};

// The `to` token for a notification type, or '' when the type has no specific
// destination (the notification opens the app home/dashboard).
export function notificationTarget(type) {
  return NOTIFICATION_TARGETS[String(type || '').toLowerCase()] || '';
}

// Full in-app URL for a notification of the given type. Falls back to '/'.
export function notificationUrl(type) {
  const to = notificationTarget(type);
  return to ? `/?to=${to}` : '/';
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
