import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileStore } from '../persistence/file-store.js';
import { createTravelApi } from '../index.js';
import { presentTimeline, partOfDay } from '../presenters.js';

function freshDir() { return mkdtempSync(join(tmpdir(), 'travel-xp-')); }
const appleVerifier = async (t) => { const [, sub, email] = t.split(':'); return { sub, email }; };

async function tripApp() {
  const app = createTravelApi({ store: new FileStore(freshDir()), appleVerifier });
  const { token } = await app.signIn({ identityToken: 'apple:simon:s@e.com', displayName: 'Simon' });
  await app.putTrip(token, { tripName: 'Indonesia', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-11', endDate: '2026-07-25' });
  return { app, token };
}

test('partOfDay maps hours to warm human bands', () => {
  assert.equal(partOfDay('2026-07-11T08:00:00.000Z'), 'Morning');
  assert.equal(partOfDay('2026-07-11T14:00:00.000Z'), 'Afternoon');
  assert.equal(partOfDay('2026-07-11T19:00:00.000Z'), 'Evening');
  assert.equal(partOfDay('2026-07-11T23:30:00.000Z'), 'Night');
});

test('timeline day cards carry a trip-relative label and an emotional story', async () => {
  const { app, token } = await tripApp();
  await app.capture(token, { note: 'Touchdown — the air smells of salt and frangipani', timestamp: '2026-07-11T09:30:00.000Z' });
  await app.capture(token, { photoRef: 'p1', note: 'Echo Beach sunset', timestamp: '2026-07-12T18:10:00.000Z' });
  await app.capture(token, { photoRef: 'p2', note: 'Rice terraces', timestamp: '2026-07-12T11:00:00.000Z' });

  const { days } = await app.getTimeline(token);
  const dayOne = days.find(d => d.date === '2026-07-11');
  const dayTwo = days.find(d => d.date === '2026-07-12');

  // Day 1 is the arrival; framed relative to the trip and the place.
  assert.equal(dayOne.label, 'Day 1');
  assert.equal(dayOne.story, 'Arrival in Bali');

  // Day 2 framed by journey + place, with a gentle summary of what happened.
  // (trip_created lands on the real server date, not inside the trip window.)
  assert.equal(dayTwo.label, 'Day 2');
  assert.equal(dayTwo.story, 'Day 2 in Bali');
  assert.equal(dayTwo.summary, '2 moments · 2 photos');
});

test('a photo entry is a premium memory card (accent + warm subtitle)', async () => {
  const { app, token } = await tripApp();
  const { capture } = await app.capture(token, { photoRef: 'p1', note: 'Golden hour', timestamp: '2026-07-13T18:30:00.000Z' });
  assert.equal(capture.kind, 'photo');
  assert.equal(capture.accent, 'sunset');
  assert.equal(capture.subtitle, 'Evening · Photo memory');
  assert.equal(capture.partOfDay, 'Evening');
});

test('story falls back gracefully without trip context', () => {
  const events = [
    { timelineEventId: 'e1', eventType: 'journal_entry', metadata: { eventName: 'journal_entry', note: 'hello' }, timestamp: '2026-01-01T08:00:00.000Z' },
  ];
  const [day] = presentTimeline(events); // no context
  assert.equal(day.label, null);
  assert.equal(day.story, 'A moment to remember');
  assert.equal(day.summary, '1 moment');
});

test('days remain newest-first and entries chronological (the day reads as a story)', async () => {
  const { app, token } = await tripApp();
  await app.capture(token, { note: 'Morning swim', timestamp: '2026-07-11T07:00:00.000Z' });
  await app.capture(token, { note: 'Late dinner', timestamp: '2026-07-11T21:30:00.000Z' });
  await app.capture(token, { note: 'Next day', timestamp: '2026-07-12T09:00:00.000Z' });

  const { days } = await app.getTimeline(token);
  assert.equal(days[0].date, '2026-07-12'); // newest first
  const dayOne = days.find(d => d.date === '2026-07-11');
  const details = dayOne.entries.map(e => e.detail);
  assert.ok(details.indexOf('Morning swim') < details.indexOf('Late dinner'));
});
