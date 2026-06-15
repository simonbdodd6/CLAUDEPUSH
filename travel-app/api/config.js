// Travel App — deployment configuration (M23.4).
//
// One place that turns environment variables into a validated, typed config
// object. It holds NO secrets itself and never logs them; it only reads what the
// runtime provides. Pure and deterministic: `loadConfig(env)` takes the env map
// explicitly (defaults to process.env) so it is fully testable without touching
// the real environment.
//
// Apple Sign In is configured by MODE rather than by leaking key material into
// code:
//   - 'disabled' : no verifier wired — sign-in fails closed (safe default).
//   - 'fake'     : a deterministic test verifier ("apple:<sub>:<email>").
//                  Allowed ONLY outside production; refused when NODE_ENV=production.
//   - 'jwks'     : the real Apple verifier (validates the JWT against Apple's
//                  public JWKS). Requires APPLE_CLIENT_ID (your app's bundle id).

export class ConfigError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ConfigError';
    this.code = 'CONFIG_INVALID';
    this.details = details;
  }
}

const APPLE_MODES = new Set(['disabled', 'fake', 'jwks']);
const DEFAULT_PORT = 8787;
const DEFAULT_STORE_DIR = './.travel-data';
const DEFAULT_APPLE_ISSUER = 'https://appleid.apple.com';

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePort(raw) {
  if (raw === undefined || trimmed(raw) === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`PORT must be an integer 1-65535 (got "${raw}")`);
  }
  return port;
}

/**
 * Build a validated config object from an environment map.
 * @param {Record<string,string|undefined>} env
 * @returns {{
 *   env: 'production'|'development'|'test',
 *   isProduction: boolean,
 *   baseUrl: string,
 *   port: number,
 *   store: { driver: 'file', dir: string },
 *   apple: { mode: 'disabled'|'fake'|'jwks', clientId: string|null, issuer: string },
 *   session: { ttlMs: number },
 * }}
 */
export function loadConfig(env = process.env) {
  const nodeEnv = trimmed(env.NODE_ENV) || 'development';
  const isProduction = nodeEnv === 'production';

  const port = parsePort(env.PORT);
  const baseUrl = trimmed(env.TRAVEL_BASE_URL) || `http://localhost:${port}`;
  const storeDir = trimmed(env.TRAVEL_STORE_DIR) || DEFAULT_STORE_DIR;

  const appleMode = trimmed(env.APPLE_VERIFIER_MODE) || (isProduction ? 'jwks' : 'disabled');
  if (!APPLE_MODES.has(appleMode)) {
    throw new ConfigError(`APPLE_VERIFIER_MODE must be one of ${[...APPLE_MODES].join(' | ')} (got "${appleMode}")`);
  }
  if (appleMode === 'fake' && isProduction) {
    throw new ConfigError('APPLE_VERIFIER_MODE=fake is not allowed when NODE_ENV=production');
  }
  const appleClientId = trimmed(env.APPLE_CLIENT_ID) || null;
  if (appleMode === 'jwks' && !appleClientId) {
    throw new ConfigError('APPLE_VERIFIER_MODE=jwks requires APPLE_CLIENT_ID (your app bundle id / services id)');
  }
  const appleIssuer = trimmed(env.APPLE_ISSUER) || DEFAULT_APPLE_ISSUER;

  const ttlRaw = trimmed(env.SESSION_TTL_HOURS);
  const ttlHours = ttlRaw === '' ? 24 * 30 : Number(ttlRaw); // default 30 days
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
    throw new ConfigError(`SESSION_TTL_HOURS must be a positive number (got "${ttlRaw}")`);
  }

  return {
    env: nodeEnv,
    isProduction,
    baseUrl,
    port,
    store: { driver: 'file', dir: storeDir },
    apple: { mode: appleMode, clientId: appleClientId, issuer: appleIssuer },
    session: { ttlMs: Math.round(ttlHours * 60 * 60 * 1000) },
  };
}

// A redacted, log-safe view of the config (never prints secrets — there are
// none here, but clientId is treated as sensitive-ish and partially masked).
export function describeConfig(config) {
  const maskedClient = config.apple.clientId
    ? `${config.apple.clientId.slice(0, 6)}…`
    : '(none)';
  return {
    env: config.env,
    baseUrl: config.baseUrl,
    port: config.port,
    store: `${config.store.driver}:${config.store.dir}`,
    appleMode: config.apple.mode,
    appleClientId: maskedClient,
    sessionTtlHours: Math.round(config.session.ttlMs / 3_600_000),
  };
}
