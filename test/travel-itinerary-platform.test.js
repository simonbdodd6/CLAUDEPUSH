import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ITINERARY_BLOCK_TYPE,
  ITINERARY_SECTION,
  ITINERARY_STATUS,
  createItineraryPlatform,
} from '../lib/itinerary-platform/index.js';

function suggestion(slot, overrides = {}) {
  return {
    slot,
    recommendationId: overrides.recommendationId ?? `rec_${slot}`,
    type: overrides.type ?? 'activity',
    itemId: overrides.itemId ?? `act_${slot}`,
    title: overrides.title ?? `${slot} activity`,
    score: overrides.score ?? 80,
    confidence: overrides.confidence ?? 0.8,
    explanation: overrides.explanation ?? `${slot} is a deterministic fit.`,
    sourceFactors: overrides.sourceFactors ?? [],
  };
}

function emptySuggestion(slot) {
  return {
    slot,
    recommendationId: null,
    type: null,
    itemId: null,
    title: 'No suitable suggestion yet',
    score: 0,
    confidence: 0,
    explanation: 'none',
    sourceFactors: [],
  };
}

function dailyPlan(day, overrides = {}) {
  return {
    day,
    date: overrides.date ?? `2026-06-${19 + day}`,
    destinationFocus: overrides.destinationFocus ?? 'Canggu',
    morningSuggestion: overrides.morningSuggestion ?? suggestion('morning'),
    afternoonSuggestion: overrides.afternoonSuggestion ?? suggestion('afternoon'),
    eveningSuggestion: overrides.eveningSuggestion ?? suggestion('evening'),
    backupRainyDayOption: overrides.backupRainyDayOption ?? suggestion('rainy_day_backup', {
      recommendationId: 'rec_backup',
      itemId: 'act_indoor',
      title: 'Indoor museum',
    }),
  };
}

function tripPlan(overrides = {}) {
  return {
    tripPlanId: overrides.tripPlanId ?? 'tripplan_1',
    tripId: overrides.tripId ?? 'trip_bali_1',
    travellerIdentityId: overrides.travellerIdentityId ?? 'idn_traveller_1',
    destinationFocus: overrides.destinationFocus ?? { name: 'Canggu' },
    dailyPlans: overrides.dailyPlans ?? [dailyPlan(1), dailyPlan(2)],
  };
}

test('creates a multi-day editable itinerary from a trip plan', async () => {
  const platform = createItineraryPlatform();
  const itinerary = await platform.createItineraryFromTripPlan({ tripPlan: tripPlan() });

  assert.ok(itinerary.itineraryId.startsWith('itinerary_'));
  assert.equal(itinerary.tripId, 'trip_bali_1');
  assert.equal(itinerary.tripPlanId, 'tripplan_1');
  assert.equal(itinerary.ownerIdentityId, 'idn_traveller_1');
  assert.equal(itinerary.status, ITINERARY_STATUS.DRAFT);
  assert.equal(itinerary.version, 1);
  assert.equal(itinerary.deterministic, true);
  assert.equal(itinerary.aiUsed, false);
  assert.equal(itinerary.days.length, 2);

  const day = itinerary.days[0];
  assert.equal(day.day, 1);
  assert.equal(day.date, '2026-06-20');
  assert.equal(day.destinationFocus, 'Canggu');
  assert.ok(day.morning.length && day.afternoon.length && day.evening.length);
  assert.ok(day.rainAlternatives.length);
});

test('generated day skeleton contains every supported block type', async () => {
  const platform = createItineraryPlatform();
  const itinerary = await platform.createItineraryFromTripPlan({ tripPlan: tripPlan() });
  const day = itinerary.days[0];
  const types = new Set([
    ...day.morning,
    ...day.afternoon,
    ...day.evening,
    ...day.rainAlternatives,
  ].map(block => block.type));

  assert.ok(types.has(ITINERARY_BLOCK_TYPE.ACTIVITY));
  assert.ok(types.has(ITINERARY_BLOCK_TYPE.TRANSPORT));
  assert.ok(types.has(ITINERARY_BLOCK_TYPE.MEAL));
  assert.ok(types.has(ITINERARY_BLOCK_TYPE.REST));
  assert.ok(types.has(ITINERARY_BLOCK_TYPE.RAIN_ALTERNATIVE));

  const activity = day.morning.find(block => block.type === ITINERARY_BLOCK_TYPE.ACTIVITY);
  assert.equal(activity.sourceRecommendationId, 'rec_morning');
  assert.match(activity.notes, /deterministic fit/);
});

test('falls back to free-time blocks for empty activity slots', async () => {
  const platform = createItineraryPlatform();
  const plan = tripPlan({
    dailyPlans: [dailyPlan(1, {
      morningSuggestion: emptySuggestion('morning'),
      backupRainyDayOption: emptySuggestion('rainy_day_backup'),
    })],
  });
  const itinerary = await platform.createItineraryFromTripPlan({ tripPlan: plan });
  const day = itinerary.days[0];

  assert.ok(day.morning.some(block => block.type === ITINERARY_BLOCK_TYPE.FREE_TIME));
  assert.equal(day.rainAlternatives.length, 0);
});

test('creates a blank multi-day itinerary skeleton', async () => {
  const platform = createItineraryPlatform();
  const itinerary = await platform.createBlankItinerary({
    tripId: 'trip_x',
    ownerIdentityId: 'idn_1',
    startDate: '2026-07-01',
    days: 3,
  });

  assert.equal(itinerary.days.length, 3);
  assert.equal(itinerary.days[2].date, '2026-07-03');
  assert.equal(itinerary.days[0].morning.length, 0);
});

test('adds, updates, notes and removes blocks', async () => {
  const platform = createItineraryPlatform();
  const itinerary = await platform.createItineraryFromTripPlan({ tripPlan: tripPlan() });

  const added = await platform.addBlock({
    itineraryId: itinerary.itineraryId,
    day: 1,
    section: ITINERARY_SECTION.AFTERNOON,
    block: { type: ITINERARY_BLOCK_TYPE.FREE_TIME, title: 'Beach time' },
  });
  assert.equal(added.title, 'Beach time');

  const updated = await platform.updateBlock({
    itineraryId: itinerary.itineraryId,
    blockId: added.blockId,
    changes: { title: 'Sunset beach time', locked: true, details: { area: 'Batu Bolong' } },
  });
  assert.equal(updated.title, 'Sunset beach time');
  assert.equal(updated.locked, true);
  assert.equal(updated.details.area, 'Batu Bolong');

  const noted = await platform.setBlockNotes({
    itineraryId: itinerary.itineraryId,
    blockId: added.blockId,
    notes: 'Bring sunscreen',
  });
  assert.equal(noted.notes, 'Bring sunscreen');

  await platform.removeBlock({ itineraryId: itinerary.itineraryId, blockId: added.blockId });
  const after = await platform.getItinerary(itinerary.itineraryId);
  const stillThere = after.days[0].afternoon.find(block => block.blockId === added.blockId);
  assert.equal(stillThere, undefined);
});

test('moves a block between sections within a day', async () => {
  const platform = createItineraryPlatform();
  const itinerary = await platform.createItineraryFromTripPlan({ tripPlan: tripPlan() });
  const morningActivity = itinerary.days[0].morning.find(b => b.type === ITINERARY_BLOCK_TYPE.ACTIVITY);

  await platform.moveBlock({
    itineraryId: itinerary.itineraryId,
    blockId: morningActivity.blockId,
    toSection: ITINERARY_SECTION.EVENING,
    toIndex: 0,
  });

  const after = await platform.getItinerary(itinerary.itineraryId);
  assert.equal(after.days[0].morning.find(b => b.blockId === morningActivity.blockId), undefined);
  assert.equal(after.days[0].evening[0].blockId, morningActivity.blockId);
});

test('adds a rain-day alternative block', async () => {
  const platform = createItineraryPlatform();
  const itinerary = await platform.createItineraryFromTripPlan({ tripPlan: tripPlan() });
  const before = itinerary.days[0].rainAlternatives.length;

  const block = await platform.addRainAlternative({
    itineraryId: itinerary.itineraryId,
    day: 1,
    block: { title: 'Cooking class', notes: 'Good for storms' },
  });

  assert.equal(block.type, ITINERARY_BLOCK_TYPE.RAIN_ALTERNATIVE);
  const after = await platform.getItinerary(itinerary.itineraryId);
  assert.equal(after.days[0].rainAlternatives.length, before + 1);
});

test('publishes an itinerary and reopens as draft on further edits', async () => {
  const platform = createItineraryPlatform();
  const itinerary = await platform.createItineraryFromTripPlan({ tripPlan: tripPlan() });

  const published = await platform.publishItinerary(itinerary.itineraryId);
  assert.equal(published.status, ITINERARY_STATUS.PUBLISHED);
  assert.ok(published.publishedAt);

  const edited = await platform.addBlock({
    itineraryId: itinerary.itineraryId,
    day: 1,
    section: ITINERARY_SECTION.MORNING,
    block: { type: ITINERARY_BLOCK_TYPE.FREE_TIME, title: 'Late start' },
  });
  assert.ok(edited.blockId);
  const after = await platform.getItinerary(itinerary.itineraryId);
  assert.equal(after.status, ITINERARY_STATUS.DRAFT);
});

test('tracks version history and reverts append-only', async () => {
  const platform = createItineraryPlatform();
  const itinerary = await platform.createItineraryFromTripPlan({ tripPlan: tripPlan() });

  // version 1 = created. Add a block -> version 2.
  const added = await platform.addBlock({
    itineraryId: itinerary.itineraryId,
    day: 1,
    section: ITINERARY_SECTION.EVENING,
    block: { type: ITINERARY_BLOCK_TYPE.FREE_TIME, title: 'Night market' },
  });

  let history = await platform.getVersionHistory(itinerary.itineraryId);
  assert.equal(history.length, 2);
  assert.equal(history[0].version, 1);
  assert.equal(history[0].label, 'created');

  // Revert to version 1 (before the block existed).
  const reverted = await platform.revertToVersion({ itineraryId: itinerary.itineraryId, version: 1 });
  assert.equal(reverted.version, 3); // append-only: new version
  const stillThere = reverted.days[0].evening.find(b => b.blockId === added.blockId);
  assert.equal(stillThere, undefined);

  history = await platform.getVersionHistory(itinerary.itineraryId);
  assert.equal(history.length, 3);
  assert.equal(history[2].label, 'reverted-from-v1');
});

test('lists itineraries by trip and by owner and records audit events', async () => {
  const platform = createItineraryPlatform();
  const itinerary = await platform.createItineraryFromTripPlan({ tripPlan: tripPlan() });

  const byTrip = await platform.listItinerariesForTrip('trip_bali_1');
  const byOwner = await platform.listItinerariesForOwner('idn_traveller_1');
  assert.equal(byTrip.length, 1);
  assert.equal(byOwner.length, 1);

  const events = await platform.getAuditEvents({ itineraryId: itinerary.itineraryId });
  assert.deepEqual(events.map(e => e.action), ['ITINERARY_CREATED']);
});

test('rejects exact live location inputs', async () => {
  const platform = createItineraryPlatform();

  await assert.rejects(() => platform.createItineraryFromTripPlan({
    tripPlan: tripPlan(),
    latitude: -8.65,
  }), /must not include exact traveller location/);

  const itinerary = await platform.createItineraryFromTripPlan({ tripPlan: tripPlan() });
  await assert.rejects(() => platform.addBlock({
    itineraryId: itinerary.itineraryId,
    day: 1,
    section: ITINERARY_SECTION.MORNING,
    block: { type: ITINERARY_BLOCK_TYPE.ACTIVITY, title: 'X', exactLocation: 'villa 4' },
  }), /must not include exact traveller location/);
});

test('validates inputs and missing entities', async () => {
  const platform = createItineraryPlatform();

  await assert.rejects(() => platform.createItineraryFromTripPlan({ tripPlan: null }), /tripPlan must be an object/);
  await assert.rejects(
    () => platform.createItineraryFromTripPlan({ tripPlan: { tripPlanId: 'x', dailyPlans: [] } }),
    /at least one daily plan/,
  );
  await assert.rejects(() => platform.getItinerary('missing'), /Itinerary not found/);

  const itinerary = await platform.createItineraryFromTripPlan({ tripPlan: tripPlan() });
  await assert.rejects(() => platform.addBlock({
    itineraryId: itinerary.itineraryId,
    day: 1,
    section: 'midnight',
    block: { type: ITINERARY_BLOCK_TYPE.FREE_TIME },
  }), /section must be one of/);
  await assert.rejects(() => platform.addBlock({
    itineraryId: itinerary.itineraryId,
    day: 99,
    section: ITINERARY_SECTION.MORNING,
    block: { type: ITINERARY_BLOCK_TYPE.FREE_TIME },
  }), /Itinerary day not found/);
  await assert.rejects(() => platform.updateBlock({
    itineraryId: itinerary.itineraryId,
    blockId: 'nope',
    changes: { title: 'x' },
  }), /Itinerary block not found/);
  await assert.rejects(
    () => platform.revertToVersion({ itineraryId: itinerary.itineraryId, version: 999 }),
    /Itinerary version not found/,
  );
});
