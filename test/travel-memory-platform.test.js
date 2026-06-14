import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMORY_AUDIT_ACTIONS,
  MEMORY_DEFAULTS,
  MEMORY_ORIGIN,
  MEMORY_POLARITY,
  createTravelMemoryPlatform,
} from '../lib/travel-memory-platform/index.js';

const TRAVELLER = 'idn_traveller_1';

function explicit(platform, overrides = {}) {
  return platform.recordExplicitMemory({
    travellerIdentityId: TRAVELLER,
    key: 'cuisine',
    value: 'spicy',
    polarity: MEMORY_POLARITY.POSITIVE,
    ...overrides,
  });
}

test('records an explicit positive memory with authoritative confidence', async () => {
  const platform = createTravelMemoryPlatform();
  const memory = await explicit(platform);

  assert.ok(memory.memoryId.startsWith('memory_'));
  assert.equal(memory.origin, MEMORY_ORIGIN.EXPLICIT);
  assert.equal(memory.polarity, MEMORY_POLARITY.POSITIVE);
  assert.equal(memory.confidence, MEMORY_DEFAULTS.EXPLICIT_BASE_CONFIDENCE);
  assert.equal(memory.observationCount, 1);
  assert.equal(memory.decayScore, 1);
  assert.equal(memory.locked, false);
  assert.equal(memory.deterministic, true);
  assert.equal(memory.aiUsed, false);
  assert.equal(memory.version, 1);
});

test('learned observations reinforce confidence and observation count', async () => {
  const platform = createTravelMemoryPlatform();
  const first = await platform.observeLearnedMemory({
    travellerIdentityId: TRAVELLER, key: 'activity', value: 'surfing', polarity: MEMORY_POLARITY.POSITIVE,
  });
  assert.equal(first.origin, MEMORY_ORIGIN.LEARNED);
  assert.equal(first.confidence, MEMORY_DEFAULTS.LEARNED_BASE_CONFIDENCE);

  const second = await platform.observeLearnedMemory({
    travellerIdentityId: TRAVELLER, key: 'activity', value: 'surfing', polarity: MEMORY_POLARITY.POSITIVE,
  });
  assert.equal(second.observationCount, 2);
  assert.equal(second.confidence, 0.5);
});

test('contradicting observations weaken and eventually flip polarity', async () => {
  const platform = createTravelMemoryPlatform();
  let memory = await platform.observeLearnedMemory({
    travellerIdentityId: TRAVELLER, key: 'climate', value: 'cold', polarity: MEMORY_POLARITY.POSITIVE,
  });
  // base 0.4 -> contradict to 0.3 -> 0.2 (flip threshold) flips.
  memory = await platform.observeLearnedMemory({
    travellerIdentityId: TRAVELLER, key: 'climate', value: 'cold', polarity: MEMORY_POLARITY.NEGATIVE,
  });
  assert.equal(memory.polarity, MEMORY_POLARITY.POSITIVE);
  assert.equal(memory.confidence, 0.3);

  memory = await platform.observeLearnedMemory({
    travellerIdentityId: TRAVELLER, key: 'climate', value: 'cold', polarity: MEMORY_POLARITY.NEGATIVE,
  });
  assert.equal(memory.polarity, MEMORY_POLARITY.NEGATIVE);
  assert.equal(memory.confidence, MEMORY_DEFAULTS.LEARNED_BASE_CONFIDENCE);
  assert.equal(memory.observationCount, 1);

  const audit = await platform.getAuditEvents({ memoryId: memory.memoryId });
  assert.ok(audit.some(e => e.action === MEMORY_AUDIT_ACTIONS.POLARITY_FLIPPED));
});

test('manual lock blocks automatic learned updates but not explicit input', async () => {
  const platform = createTravelMemoryPlatform();
  const created = await platform.observeLearnedMemory({
    travellerIdentityId: TRAVELLER, key: 'food', value: 'street', polarity: MEMORY_POLARITY.POSITIVE,
  });
  await platform.lockMemory(created.memoryId);

  const afterObserve = await platform.observeLearnedMemory({
    travellerIdentityId: TRAVELLER, key: 'food', value: 'street', polarity: MEMORY_POLARITY.POSITIVE,
  });
  assert.equal(afterObserve.confidence, MEMORY_DEFAULTS.LEARNED_BASE_CONFIDENCE); // unchanged
  const audit = await platform.getAuditEvents({ memoryId: created.memoryId, action: MEMORY_AUDIT_ACTIONS.OBSERVATION_IGNORED_LOCKED });
  assert.equal(audit.length, 1);

  // Explicit traveller input still applies despite the lock.
  const explicitUpdate = await platform.recordExplicitMemory({
    travellerIdentityId: TRAVELLER, key: 'food', value: 'street', polarity: MEMORY_POLARITY.NEGATIVE,
  });
  assert.equal(explicitUpdate.polarity, MEMORY_POLARITY.NEGATIVE);
  assert.equal(explicitUpdate.origin, MEMORY_ORIGIN.EXPLICIT);
});

test('manual correction overrides lock and retains prior state', async () => {
  const platform = createTravelMemoryPlatform();
  const created = await explicit(platform);
  await platform.lockMemory(created.memoryId);

  const corrected = await platform.correctMemory({
    memoryId: created.memoryId,
    polarity: MEMORY_POLARITY.NEGATIVE,
    reason: 'traveller changed their mind',
  });
  assert.equal(corrected.polarity, MEMORY_POLARITY.NEGATIVE);
  assert.equal(corrected.correctionCount, 1);
  assert.equal(corrected.manualCorrection.previous.polarity, MEMORY_POLARITY.POSITIVE);
  assert.equal(corrected.manualCorrection.reason, 'traveller changed their mind');
  assert.equal(corrected.locked, true); // lock preserved
});

test('decay is deterministic from lastConfirmed and asOf, and skips locked memories', async () => {
  const platform = createTravelMemoryPlatform();
  const created = await platform.observeLearnedMemory({
    travellerIdentityId: TRAVELLER, key: 'pace', value: 'slow', polarity: MEMORY_POLARITY.POSITIVE,
    observedAt: '2026-01-01T00:00:00.000Z',
  });

  // 90 days into a 180-day window -> freshness 0.5.
  const [decayed] = await platform.applyDecay({ travellerIdentityId: TRAVELLER, asOf: '2026-04-01T00:00:00.000Z' });
  assert.equal(decayed.memoryId, created.memoryId);
  assert.equal(decayed.decayScore, 0.5);

  // Lock + decay again -> exempt, no change returned.
  await platform.lockMemory(created.memoryId);
  const none = await platform.applyDecay({ travellerIdentityId: TRAVELLER, asOf: '2026-12-01T00:00:00.000Z' });
  assert.equal(none.length, 0);
});

test('consumes an immutable snapshot into learned memory with provenance', async () => {
  const platform = createTravelMemoryPlatform();
  const snapshot = Object.freeze({ snapshotType: 'itinerary', snapshotId: 'itinerary_42' });
  const results = await platform.recordFromSnapshot({
    travellerIdentityId: TRAVELLER,
    snapshot,
    signals: [
      { key: 'activity', value: 'temple_walk', polarity: MEMORY_POLARITY.POSITIVE },
      { key: 'activity', value: 'nightclub', polarity: MEMORY_POLARITY.NEGATIVE },
    ],
  });

  assert.equal(results.length, 2);
  assert.equal(results[0].sources[0].snapshotType, 'itinerary');
  assert.equal(results[0].sources[0].snapshotId, 'itinerary_42');
  assert.equal(snapshot.snapshotId, 'itinerary_42'); // snapshot untouched
});

test('explain returns an explainable memory snapshot with effective confidence', async () => {
  const platform = createTravelMemoryPlatform();
  const created = await platform.observeLearnedMemory({
    travellerIdentityId: TRAVELLER, key: 'budget', value: 'mid', polarity: MEMORY_POLARITY.POSITIVE,
    observedAt: '2026-01-01T00:00:00.000Z',
  });
  await platform.applyDecay({ travellerIdentityId: TRAVELLER, asOf: '2026-04-01T00:00:00.000Z' });

  const explained = await platform.explainMemory(created.memoryId);
  assert.equal(explained.confidence, 0.4);
  assert.equal(explained.decayScore, 0.5);
  assert.equal(explained.effectiveConfidence, 0.2);
  assert.match(explained.explanation, /positive preference for budget=mid/);
});

test('lists memories by traveller with filters and separates positive/negative', async () => {
  const platform = createTravelMemoryPlatform();
  await explicit(platform); // cuisine spicy positive
  await platform.recordExplicitMemory({
    travellerIdentityId: TRAVELLER, key: 'noise', value: 'crowds', polarity: MEMORY_POLARITY.NEGATIVE,
  });
  await platform.observeLearnedMemory({
    travellerIdentityId: TRAVELLER, key: 'activity', value: 'hiking', polarity: MEMORY_POLARITY.POSITIVE,
  });

  const all = await platform.listMemoriesForTraveller(TRAVELLER);
  assert.equal(all.length, 3);
  const positives = await platform.listMemoriesForTraveller(TRAVELLER, { polarity: MEMORY_POLARITY.POSITIVE });
  assert.equal(positives.length, 2);
  const negatives = await platform.listMemoriesForTraveller(TRAVELLER, { polarity: MEMORY_POLARITY.NEGATIVE });
  assert.equal(negatives.length, 1);
  const explicitOnly = await platform.listMemoriesForTraveller(TRAVELLER, { origin: MEMORY_ORIGIN.EXPLICIT });
  assert.equal(explicitOnly.length, 2);
});

test('tracks append-only version history and audit history', async () => {
  const platform = createTravelMemoryPlatform();
  const created = await platform.observeLearnedMemory({
    travellerIdentityId: TRAVELLER, key: 'transport', value: 'walking', polarity: MEMORY_POLARITY.POSITIVE,
  });
  await platform.observeLearnedMemory({
    travellerIdentityId: TRAVELLER, key: 'transport', value: 'walking', polarity: MEMORY_POLARITY.POSITIVE,
  });
  await platform.lockMemory(created.memoryId);

  const history = await platform.getVersionHistory(created.memoryId);
  assert.equal(history.length, 3); // created + reinforced + locked
  assert.equal(history[0].label, 'created');
  assert.equal(history[0].version, 1);
  assert.equal(history[2].state.locked, true);

  const audit = await platform.getAuditEvents({ travellerIdentityId: TRAVELLER });
  assert.ok(audit.some(e => e.action === MEMORY_AUDIT_ACTIONS.MEMORY_CREATED));
  assert.ok(audit.some(e => e.action === MEMORY_AUDIT_ACTIONS.MEMORY_LOCKED));
});

test('rejects exact live location inputs and snapshots', async () => {
  const platform = createTravelMemoryPlatform();

  await assert.rejects(() => platform.recordExplicitMemory({
    travellerIdentityId: TRAVELLER, key: 'k', value: 'v', polarity: MEMORY_POLARITY.POSITIVE, latitude: -8.65,
  }), /must not include exact traveller location/);

  await assert.rejects(() => platform.recordFromSnapshot({
    travellerIdentityId: TRAVELLER,
    snapshot: { snapshotType: 'trip', liveLocation: 'villa 4' },
    signals: [{ key: 'a', value: 'b', polarity: MEMORY_POLARITY.POSITIVE }],
  }), /must not include exact traveller location/);
});

test('validates required fields and missing entities', async () => {
  const platform = createTravelMemoryPlatform();

  await assert.rejects(() => platform.recordExplicitMemory({
    travellerIdentityId: TRAVELLER, key: 'k', value: 'v', polarity: 'maybe',
  }), /polarity must be one of/);
  await assert.rejects(() => platform.observeLearnedMemory({
    travellerIdentityId: '', key: 'k', value: 'v', polarity: MEMORY_POLARITY.POSITIVE,
  }), /travellerIdentityId is required/);
  await assert.rejects(() => platform.getMemory('missing'), /Travel memory not found/);
  await assert.rejects(() => platform.recordFromSnapshot({
    travellerIdentityId: TRAVELLER, snapshot: { type: 'trip' }, signals: [],
  }), /signals must be a non-empty array/);

  const created = await explicit(platform);
  await assert.rejects(() => platform.getVersion(created.memoryId, 999), /Travel memory version not found/);
});
