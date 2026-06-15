import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileStore } from '../persistence/file-store.js';
import { createTravelApi } from '../index.js';
import { loadConfig } from '../config.js';
import { selectAppleVerifier } from '../apple-verifier.js';

function freshDir() { return mkdtempSync(join(tmpdir(), 'travel-health-')); }

test('health: durable store + configured apple → status ok', async () => {
  const config = loadConfig({ APPLE_VERIFIER_MODE: 'fake', TRAVEL_STORE_DIR: freshDir() });
  const appleVerifier = selectAppleVerifier(config);
  const api = createTravelApi({ store: new FileStore(config.store.dir), config, appleVerifier });

  const health = await api.getHealth();
  assert.equal(health.status, 'ok');
  assert.equal(health.env, 'development');
  assert.equal(typeof health.time, 'string');
  assert.equal(health.checks.api.ok, true);
  assert.equal(health.checks.config.ok, true);
  assert.equal(health.checks.store.ok, true);
  assert.equal(health.checks.store.driver, 'file');
  assert.equal(health.checks.apple.ok, true);
  assert.equal(health.checks.apple.mode, 'fake');
  assert.equal(health.checks.apple.configured, true);
});

test('health: store probe actually round-trips (priorWrites grows)', async () => {
  const config = loadConfig({ APPLE_VERIFIER_MODE: 'fake', TRAVEL_STORE_DIR: freshDir() });
  const api = createTravelApi({ store: new FileStore(config.store.dir), config, appleVerifier: selectAppleVerifier(config) });
  const first = await api.getHealth();
  const second = await api.getHealth();
  assert.equal(first.checks.store.priorWrites, 0);
  assert.equal(second.checks.store.priorWrites, 1); // the first probe wrote one record
});

test('health: apple disabled → degraded (store still ok)', async () => {
  const config = loadConfig({ TRAVEL_STORE_DIR: freshDir() }); // mode defaults to disabled in dev
  const api = createTravelApi({ store: new FileStore(config.store.dir), config }); // no verifier
  const health = await api.getHealth();
  assert.equal(health.checks.store.ok, true);
  assert.equal(health.checks.apple.ok, false);
  assert.equal(health.checks.apple.mode, 'disabled');
  assert.equal(health.status, 'degraded');
});

test('health: no config (ad-hoc options) → live + store-ready, but degraded', async () => {
  const api = createTravelApi({ store: new FileStore(freshDir()) });
  const health = await api.getHealth();
  assert.equal(health.checks.api.ok, true);
  assert.equal(health.checks.store.ok, true); // store is the hard readiness dependency
  assert.equal(health.checks.config.ok, false); // no config object loaded
  assert.equal(health.status, 'degraded'); // not 'error' — the probe still answers
});

test('health: requires no authentication', async () => {
  const api = createTravelApi({ store: new FileStore(freshDir()), config: loadConfig({ TRAVEL_STORE_DIR: freshDir() }) });
  // getHealth takes no token and must not throw an auth error
  await assert.doesNotReject(() => api.getHealth());
});
