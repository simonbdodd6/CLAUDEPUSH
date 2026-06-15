// Travel App — Apple identity-token verifier (M23.4).
//
// Production-ready structure for verifying a "Sign in with Apple" identity token
// against Apple's PUBLIC JWKS. It contains NO Apple secrets: verification needs
// only Apple's public keys (fetched at runtime) plus your own client id (bundle
// id), which is configuration, not a secret.
//
// The verifier is the same injectable seam the API already uses (auth.js accepts
// `appleVerifier`). `selectAppleVerifier(config)` returns the right verifier for
// the configured mode:
//   - 'disabled' -> null  (auth.js then fails closed with AUTH_NOT_CONFIGURED)
//   - 'fake'     -> a deterministic non-production verifier (tests / local)
//   - 'jwks'     -> the real Apple JWKS verifier below
//
// The JWKS fetch + RSA-SHA256 signature check use only node:crypto + global
// fetch (Node 18+), so there is no third-party dependency. `fetchJwks` is
// injectable so tests verify the full path against a locally generated keypair
// without any network access.

import { createPublicKey, verify as cryptoVerify } from 'crypto';

export class AppleVerifierError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AppleVerifierError';
    this.code = code;
    this.details = details;
  }
}

const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

function base64UrlToBuffer(part) {
  const pad = part.length % 4 === 0 ? '' : '='.repeat(4 - (part.length % 4));
  return Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function decodeSegment(part) {
  try {
    return JSON.parse(base64UrlToBuffer(part).toString('utf8'));
  } catch {
    throw new AppleVerifierError('AUTH_INVALID_TOKEN', 'Apple token segment is not valid JSON');
  }
}

// Decompose a compact JWS into its parts + the bytes that were signed.
function parseJwt(token) {
  if (typeof token !== 'string') throw new AppleVerifierError('AUTH_INVALID_TOKEN', 'token must be a string');
  const segments = token.split('.');
  if (segments.length !== 3) throw new AppleVerifierError('AUTH_INVALID_TOKEN', 'token must have three segments');
  const [headerB64, payloadB64, signatureB64] = segments;
  return {
    header: decodeSegment(headerB64),
    payload: decodeSegment(payloadB64),
    signature: base64UrlToBuffer(signatureB64),
    signingInput: Buffer.from(`${headerB64}.${payloadB64}`, 'utf8'),
  };
}

// Default JWKS fetcher — Apple's public keys, with a small in-memory TTL cache so
// we don't refetch on every sign-in. Injectable for tests.
function createDefaultJwksFetcher({ url = APPLE_JWKS_URL, ttlMs = 10 * 60 * 1000, clock = () => Date.now() } = {}) {
  let cache = null; // { keys, fetchedAt }
  return async function fetchJwks() {
    if (cache && clock() - cache.fetchedAt < ttlMs) return cache.keys;
    let res;
    try {
      res = await fetch(url);
    } catch (cause) {
      throw new AppleVerifierError('AUTH_JWKS_UNAVAILABLE', `Could not reach Apple JWKS (${url})`, { cause: String(cause) });
    }
    if (!res.ok) throw new AppleVerifierError('AUTH_JWKS_UNAVAILABLE', `Apple JWKS responded ${res.status}`);
    const body = await res.json();
    const keys = Array.isArray(body?.keys) ? body.keys : [];
    cache = { keys, fetchedAt: clock() };
    return keys;
  };
}

/**
 * Build the real Apple identity-token verifier.
 *
 * @param {object} opts
 * @param {string} opts.clientId  Your app bundle id / services id (the `aud`).
 * @param {string} [opts.issuer]  Expected issuer (default Apple).
 * @param {() => Promise<Array>} [opts.fetchJwks]  Injectable JWKS source.
 * @param {() => number} [opts.clock]  Injectable clock (ms) for exp checks/tests.
 * @returns {(identityToken: string) => Promise<{ sub: string, email: string|null, emailVerified: boolean }>}
 */
export function createAppleJwksVerifier(opts = {}) {
  const clientId = opts.clientId;
  if (!clientId) throw new AppleVerifierError('CONFIGURATION_ERROR', 'createAppleJwksVerifier requires clientId');
  const issuer = opts.issuer ?? 'https://appleid.apple.com';
  const clock = opts.clock ?? (() => Date.now());
  const fetchJwks = opts.fetchJwks ?? createDefaultJwksFetcher({ clock });

  return async function verifyAppleToken(identityToken) {
    const { header, payload, signature, signingInput } = parseJwt(identityToken);

    if (header.alg !== 'RS256') {
      throw new AppleVerifierError('AUTH_INVALID_TOKEN', `unsupported token alg "${header.alg}" (expected RS256)`);
    }

    const keys = await fetchJwks();
    const jwk = keys.find(k => k.kid === header.kid) ?? null;
    if (!jwk) throw new AppleVerifierError('AUTH_INVALID_TOKEN', `no Apple key matches kid "${header.kid}"`);

    let publicKey;
    try {
      publicKey = createPublicKey({ key: jwk, format: 'jwk' });
    } catch {
      throw new AppleVerifierError('AUTH_INVALID_TOKEN', 'Apple key is not a usable RSA public key');
    }

    const signatureValid = cryptoVerify('RSA-SHA256', signingInput, publicKey, signature);
    if (!signatureValid) throw new AppleVerifierError('AUTH_INVALID_TOKEN', 'Apple token signature is invalid');

    // Claim checks (signature already proven).
    if (payload.iss !== issuer) {
      throw new AppleVerifierError('AUTH_INVALID_TOKEN', `unexpected issuer "${payload.iss}"`);
    }
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(clientId)) {
      throw new AppleVerifierError('AUTH_INVALID_TOKEN', 'token audience does not match clientId');
    }
    const nowSec = Math.floor(clock() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < nowSec) {
      throw new AppleVerifierError('AUTH_TOKEN_EXPIRED', 'Apple token has expired');
    }
    const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
    if (!sub) throw new AppleVerifierError('AUTH_INVALID_TOKEN', 'Apple token has no subject');

    return {
      sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    };
  };
}

// A deterministic, NON-PRODUCTION verifier: "apple:<sub>:<email>" -> claims.
// Mirrors the fake used throughout the tests; selected only for mode 'fake'.
export function createFakeVerifier() {
  return async function fakeVerify(token) {
    if (typeof token !== 'string' || !token.startsWith('apple:')) {
      throw new AppleVerifierError('AUTH_INVALID_TOKEN', 'fake verifier expects "apple:<sub>:<email>"');
    }
    const [, sub, email] = token.split(':');
    if (!sub) throw new AppleVerifierError('AUTH_INVALID_TOKEN', 'fake token has no subject');
    return { sub, email: email || null, emailVerified: true };
  };
}

/**
 * Choose the verifier for a config (see config.js apple.mode).
 * Returns null for 'disabled' so auth.js fails closed.
 * @param {{apple: {mode: string, clientId: string|null, issuer: string}}} config
 * @param {{fetchJwks?: Function, clock?: Function}} [deps]  test injection
 */
export function selectAppleVerifier(config, deps = {}) {
  const { mode, clientId, issuer } = config.apple;
  if (mode === 'disabled') return null;
  if (mode === 'fake') return createFakeVerifier();
  if (mode === 'jwks') {
    return createAppleJwksVerifier({ clientId, issuer, fetchJwks: deps.fetchJwks, clock: deps.clock });
  }
  throw new AppleVerifierError('CONFIGURATION_ERROR', `unknown apple verifier mode "${mode}"`);
}
