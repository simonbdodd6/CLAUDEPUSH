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
