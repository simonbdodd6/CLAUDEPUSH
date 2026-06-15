import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as cryptoSign } from 'crypto';
import { createAppleJwksVerifier, createFakeVerifier, selectAppleVerifier, AppleVerifierError } from '../apple-verifier.js';

// --- Helpers: mint a real RS256 token + matching JWK (no network) -----------

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function makeKeyMaterial(kid = 'test-key-1') {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
  return { privateKey, jwk, kid };
}

function mintToken({ privateKey, kid }, claims) {
  const header = b64url(JSON.stringify({ alg: 'RS256', kid }));
  const payload = b64url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const signature = b64url(cryptoSign('RSA-SHA256', Buffer.from(signingInput), privateKey));
  return `${signingInput}.${signature}`;
}

const CLIENT_ID = 'com.simon.travel';
const ISSUER = 'https://appleid.apple.com';
const NOW = 1_750_000_000_000; // fixed clock (ms)
const validClaims = (over = {}) => ({
  iss: ISSUER, aud: CLIENT_ID, sub: 'apple-sub-123', email: 'simon@example.com',
  email_verified: 'true', iat: Math.floor(NOW / 1000) - 10, exp: Math.floor(NOW / 1000) + 3600, ...over,
});

function verifierFor(km, over = {}) {
  return createAppleJwksVerifier({
    clientId: CLIENT_ID, issuer: ISSUER, clock: () => NOW,
    fetchJwks: async () => [km.jwk], ...over,
  });
}

// --- Tests ------------------------------------------------------------------

test('verifies a correctly signed Apple token and returns claims', async () => {
  const km = makeKeyMaterial();
  const verify = verifierFor(km);
  const claims = await verify(mintToken(km, validClaims()));
  assert.equal(claims.sub, 'apple-sub-123');
  assert.equal(claims.email, 'simon@example.com');
  assert.equal(claims.emailVerified, true);
});

test('rejects a token whose signature does not match the key', async () => {
  const km = makeKeyMaterial();
  const otherKm = makeKeyMaterial('test-key-1'); // same kid, different key
  const verify = verifierFor(km); // JWKS serves km.jwk
  const token = mintToken(otherKm, validClaims()); // but token signed by the other key
  await assert.rejects(() => verify(token), e => e instanceof AppleVerifierError && e.code === 'AUTH_INVALID_TOKEN');
});

test('rejects when no JWKS key matches the kid', async () => {
  const km = makeKeyMaterial('kid-A');
  const verify = createAppleJwksVerifier({ clientId: CLIENT_ID, clock: () => NOW, fetchJwks: async () => [{ ...km.jwk, kid: 'kid-B' }] });
  await assert.rejects(() => verify(mintToken(km, validClaims())), /no Apple key matches kid/);
});

test('rejects wrong audience', async () => {
  const km = makeKeyMaterial();
  const verify = verifierFor(km);
  await assert.rejects(() => verify(mintToken(km, validClaims({ aud: 'com.someone.else' }))), /audience/);
});

test('rejects wrong issuer', async () => {
  const km = makeKeyMaterial();
  const verify = verifierFor(km);
  await assert.rejects(() => verify(mintToken(km, validClaims({ iss: 'https://evil.example.com' }))), /issuer/);
});

test('rejects an expired token', async () => {
  const km = makeKeyMaterial();
  const verify = verifierFor(km);
  const expired = validClaims({ exp: Math.floor(NOW / 1000) - 60 });
  await assert.rejects(() => verify(mintToken(km, expired)), e => e.code === 'AUTH_TOKEN_EXPIRED');
});

test('rejects malformed tokens and non-RS256 algs', async () => {
  const km = makeKeyMaterial();
  const verify = verifierFor(km);
  await assert.rejects(() => verify('not-a-jwt'), /three segments/);
  const hsHeader = b64url(JSON.stringify({ alg: 'HS256', kid: km.kid }));
  const payload = b64url(JSON.stringify(validClaims()));
  await assert.rejects(() => verify(`${hsHeader}.${payload}.sig`), /unsupported token alg/);
});

test('createAppleJwksVerifier requires a clientId', () => {
  assert.throws(() => createAppleJwksVerifier({}), /requires clientId/);
});

test('fake verifier parses apple:<sub>:<email> and rejects junk', async () => {
  const fake = createFakeVerifier();
  const claims = await fake('apple:sub9:me@example.com');
  assert.equal(claims.sub, 'sub9');
  assert.equal(claims.email, 'me@example.com');
  await assert.rejects(() => fake('garbage'), /apple:/);
});

test('selectAppleVerifier honours config mode', async () => {
  assert.equal(selectAppleVerifier({ apple: { mode: 'disabled', clientId: null, issuer: ISSUER } }), null);
  assert.equal(typeof selectAppleVerifier({ apple: { mode: 'fake', clientId: null, issuer: ISSUER } }), 'function');
  const km = makeKeyMaterial();
  const jwksVerifier = selectAppleVerifier(
    { apple: { mode: 'jwks', clientId: CLIENT_ID, issuer: ISSUER } },
    { fetchJwks: async () => [km.jwk], clock: () => NOW },
  );
  const claims = await jwksVerifier(mintToken(km, validClaims()));
  assert.equal(claims.sub, 'apple-sub-123');
});
