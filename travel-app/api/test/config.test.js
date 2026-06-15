import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, describeConfig, ConfigError } from '../config.js';

test('defaults: dev env, port 8787, file store, apple disabled', () => {
  const c = loadConfig({});
  assert.equal(c.env, 'development');
  assert.equal(c.isProduction, false);
  assert.equal(c.port, 8787);
  assert.equal(c.baseUrl, 'http://localhost:8787');
  assert.equal(c.store.driver, 'file');
  assert.equal(c.store.dir, './.travel-data');
  assert.equal(c.apple.mode, 'disabled');
  assert.equal(c.apple.clientId, null);
  assert.equal(c.session.ttlMs, 30 * 24 * 60 * 60 * 1000);
});

test('reads PORT, base URL, store dir, session ttl from env', () => {
  const c = loadConfig({ PORT: '9090', TRAVEL_BASE_URL: 'https://api.example.com', TRAVEL_STORE_DIR: '/var/data/travel', SESSION_TTL_HOURS: '48' });
  assert.equal(c.port, 9090);
  assert.equal(c.baseUrl, 'https://api.example.com');
  assert.equal(c.store.dir, '/var/data/travel');
  assert.equal(c.session.ttlMs, 48 * 60 * 60 * 1000);
});

test('invalid PORT is rejected', () => {
  assert.throws(() => loadConfig({ PORT: '0' }), ConfigError);
  assert.throws(() => loadConfig({ PORT: '70000' }), ConfigError);
  assert.throws(() => loadConfig({ PORT: 'abc' }), ConfigError);
});

test('apple mode jwks requires a client id', () => {
  assert.throws(() => loadConfig({ APPLE_VERIFIER_MODE: 'jwks' }), /APPLE_CLIENT_ID/);
  const c = loadConfig({ APPLE_VERIFIER_MODE: 'jwks', APPLE_CLIENT_ID: 'com.simon.travel' });
  assert.equal(c.apple.mode, 'jwks');
  assert.equal(c.apple.clientId, 'com.simon.travel');
  assert.equal(c.apple.issuer, 'https://appleid.apple.com');
});

test('unknown apple mode is rejected', () => {
  assert.throws(() => loadConfig({ APPLE_VERIFIER_MODE: 'magic' }), /APPLE_VERIFIER_MODE/);
});

test('production defaults apple to jwks and forbids fake', () => {
  // production with no mode → defaults to jwks → needs client id
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /APPLE_CLIENT_ID/);
  // fake in production is refused outright
  assert.throws(() => loadConfig({ NODE_ENV: 'production', APPLE_VERIFIER_MODE: 'fake' }), /not allowed when NODE_ENV=production/);
  // a valid production config
  const c = loadConfig({ NODE_ENV: 'production', APPLE_CLIENT_ID: 'com.simon.travel' });
  assert.equal(c.isProduction, true);
  assert.equal(c.apple.mode, 'jwks');
});

test('describeConfig is log-safe (masks client id, no raw secrets)', () => {
  const c = loadConfig({ APPLE_VERIFIER_MODE: 'jwks', APPLE_CLIENT_ID: 'com.simon.travel.app' });
  const d = describeConfig(c);
  assert.equal(d.appleMode, 'jwks');
  assert.equal(d.appleClientId, 'com.si…');
  assert.ok(!JSON.stringify(d).includes('com.simon.travel.app'));
});
