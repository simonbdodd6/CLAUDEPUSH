import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileStore } from '../persistence/file-store.js';
import { createTravelApi } from '../index.js';

function freshDir() { return mkdtempSync(join(tmpdir(), 'travel-capture-')); }
const appleVerifier = async (t) => { const [, sub, email] = t.split(':'); return { sub, email }; };

async function signedInApp(dir = freshDir()) {
  const app = createTravelApi({ store: new FileStore(dir), appleVerifier });
  const { token } = await app.signIn({ identityToken: 'apple:simon:s@e.com', displayName: 'Simon' });
  await app.putTrip(token, { tripName: 'Indonesia', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-11', endDate: '2026-07-25' });
  return { app, token, dir };
}

// Fields a consumer DTO must NEVER expose (raw platform ids / backend terms).
const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'recordedAt', 'effectiveStatus', 'superseded', 'metadata', 'eventType', 'travellerIdentityId'];

// A premium consumer entry (M24.0) — clean fields only, no backend leakage.
const ENTRY_KEYS = ['accent', 'detail', 'id', 'kind', 'partOfDay', 'photoRef', 'subtitle', 'time', 'timestamp', 'title'];

function assertNoBackendLeak(obj) {
  for (const k of FORBIDDEN_KEYS) assert.ok(!(k in obj), `must not expose "${k}"`);
}

function assertCleanEntry(entry) {
  assertNoBackendLeak(entry);
  assert.deepEqual(Object.keys(entry).sort(), ENTRY_KEYS);
}

test('capture: journal entry returns a clean DTO and appears on the timeline', async () => {
  const { app, token } = await signedInApp();
  const { capture } = await app.capture(token, { note: 'Arrived in Canggu, the air smells of salt and frangipani.', day: 1, timestamp: '2026-07-11T09:30:00.000Z' });
  assert.equal(capture.kind, 'journal');
  assert.match(capture.title, /Arrived in Canggu/);
  assert.equal(capture.time, '09:30');
  assert.equal(capture.photoRef, null);

  const { days } = await app.getTimeline(token);
  const journal = days.flatMap(d => d.entries).find(e => e.kind === 'journal');
  assert.ok(journal);
  assertCleanEntry(journal);
});

test('capture: photo reference returns kind photo with the reference (no binary)', async () => {
  const { app, token } = await signedInApp();
  const { capture } = await app.capture(token, { photoRef: 'photo_abc', note: 'Echo Beach sunset', timestamp: '2026-07-11T18:05:00.000Z' });
  assert.equal(capture.kind, 'photo');
  assert.equal(capture.photoRef, 'photo_abc');
  assert.equal(capture.time, '18:05');
  // premium fields present + emotional framing; capture adds `day`, no backend leak
  assert.equal(capture.accent, 'sunset');
  assert.equal(capture.partOfDay, 'Evening');
  assert.equal(capture.subtitle, 'Evening · Photo memory');
  assertNoBackendLeak(capture);
  assert.deepEqual(Object.keys(capture).sort(), [...ENTRY_KEYS, 'day', 'with'].sort());
});

test('capture requires a note or a photo', async () => {
  const { app, token } = await signedInApp();
  await assert.rejects(() => app.capture(token, {}), err => err.status === 400 && err.code === 'VALIDATION_FAILED');
  await assert.rejects(() => app.capture(token, { note: '   ' }), err => err.status === 400);
});

test('timeline returns days newest-first with human titles and chronological entries', async () => {
  const { app, token } = await signedInApp();
  await app.capture(token, { note: 'Day one morning', timestamp: '2026-07-11T08:00:00.000Z' });
  await app.capture(token, { note: 'Day one evening', timestamp: '2026-07-11T20:00:00.000Z' });
  await app.capture(token, { note: 'Day two', timestamp: '2026-07-12T10:00:00.000Z' });

  const { days } = await app.getTimeline(token);
  // newest day first
  assert.equal(days[0].date, '2026-07-12');
  assert.equal(days[0].title, 'Sunday, 12 July 2026');
  const dayOne = days.find(d => d.date === '2026-07-11');
  assert.equal(dayOne.title, 'Saturday, 11 July 2026');
  // entries within a day are chronological (morning before evening)
  const notes = dayOne.entries.map(e => e.detail);
  assert.ok(notes.indexOf('Day one morning') < notes.indexOf('Day one evening'));
  // every entry is consumer-clean
  days.flatMap(d => d.entries).forEach(assertCleanEntry);
});

test('captures + timeline survive a restart (durable)', async () => {
  const { app, token, dir } = await signedInApp();
  await app.capture(token, { note: 'Persisted journal', photoRef: 'photo_x', timestamp: '2026-07-13T12:00:00.000Z' });

  const app2 = createTravelApi({ store: new FileStore(dir), appleVerifier }); // restart
  const { days } = await app2.getTimeline(token);
  const photo = days.flatMap(d => d.entries).find(e => e.kind === 'photo');
  assert.ok(photo, 'capture should survive restart');
  assert.equal(photo.photoRef, 'photo_x');
});

test('unauthenticated capture and timeline are rejected', async () => {
  const { app } = await signedInApp();
  await assert.rejects(() => app.capture('bad-token', { note: 'x' }), err => err.status === 401);
  await assert.rejects(() => app.getTimeline(undefined), err => err.status === 401);
});
