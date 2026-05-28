export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function setCors(res) {
  Object.entries(CORS).forEach(([header, value]) => res.setHeader(header, value));
}

export function readSecret(req) {
  const authorization = String(req.headers?.authorization || '');
  return authorization.replace(/^Bearer\s+/i, '').trim() || req.query?.secret || '';
}

export function vapidContact() {
  const configured = String(process.env.VAPID_CONTACT || 'mailto:coach@example.com');
  return configured.startsWith('mailto:') ? configured : `mailto:${configured}`;
}
