import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDestinationPlatform } from '../lib/destination-platform/index.js';
import { MEMORY_POLARITY, createTravelMemoryPlatform } from '../lib/travel-memory-platform/index.js';
import { createTravelTimelinePlatform } from '../lib/travel-timeline-platform/index.js';
import { createTravelRelationshipGraph } from '../lib/travel-relationship-graph/index.js';

const admin = { id: 'idn_admin_1', type: 'ADMINISTRATOR' };
const TRAVELLER = 'idn_traveller_1';

function wiredDestination() {
  const timelinePublisher = createTravelTimelinePlatform();
  const relationshipPublisher = createTravelRelationshipGraph();
  return { platform: createDestinationPlatform({ timelinePublisher, relationshipPublisher }), timelinePublisher, relationshipPublisher };
}
function wiredMemory() {
  const timelinePublisher = createTravelTimelinePlatform();
  const relationshipPublisher = createTravelRelationshipGraph();
  return { platform: createTravelMemoryPlatform({ timelinePublisher, relationshipPublisher }), timelinePublisher, relationshipPublisher };
}
function destinationInput(overrides = {}) {
  return { name: 'Bali', type: 'island', country: 'Indonesia', timezone: 'Asia/Makassar', currency: 'IDR', ...overrides };
}

// ---------------------------------------------------------------------------
// Destination publishing
// ---------------------------------------------------------------------------

test('destination create/update/transition publish system timeline events', async () => {
  const { platform, timelinePublisher } = wiredDestination();
  const dest = await platform.createDestination(destinationInput(), admin);
  await platform.updateDestination(dest.destinationId, { region: 'Lesser Sunda' }, admin);
  await platform.activateDestination(dest.destinationId, admin);

  const events = await timelinePublisher.listByTraveller('system');
  const names = events.map(e => e.metadata.eventName);
  assert.ok(names.includes('destination_created'));
  assert.ok(names.includes('destination_updated'));
  assert.ok(events.every(e => e.sourcePlatform === 'destination-platform'));
  assert.ok(events.every(e => e.sourceEntityId === dest.destinationId));
  assert.ok(events.every(e => e.visibility === 'system'));
});

test('destination publishes graph edges: parent located_in + name-slug alias bridge', async () => {
  const { platform, relationshipPublisher } = wiredDestination();
  const parent = await platform.createDestination(destinationInput({ name: 'Indonesia Region', type: 'region' }), admin);
  const child = await platform.createDestination(destinationInput({ name: 'Bali', parentDestinationId: parent.destinationId }), admin);

  // Child LOCATED_IN parent (canonical ids).
  const located = await relationshipPublisher.queryNeighbours({ type: 'destination', id: child.destinationId }, { relationshipType: 'located_in' });
  assert.ok(located.some(n => n.entity.id === parent.destinationId));

  // Alias bridge: canonical id RELATED_TO the name-slug id Phase 1 used ('bali').
  const alias = await relationshipPublisher.queryNeighbours({ type: 'destination', id: child.destinationId }, { relationshipType: 'related_to' });
  assert.ok(alias.some(n => n.entity.id === 'bali'), 'expected name-slug alias edge to "bali"');
});

test('destination edges hold no business data (references only)', async () => {
  const { platform, relationshipPublisher } = wiredDestination();
  const dest = await platform.createDestination(destinationInput(), admin);
  const edges = await relationshipPublisher.queryByRelationshipType('related_to');
  for (const e of edges) {
    for (const banned of ['currency', 'timezone', 'country', 'safetyNotes', 'languages']) {
      assert.ok(!JSON.stringify(e).includes(banned), `edge must not carry ${banned}`);
    }
  }
  assert.ok(dest.destinationId.startsWith('dest_'));
});

// ---------------------------------------------------------------------------
// Memory publishing
// ---------------------------------------------------------------------------

test('memory create publishes memory_created; updates publish memory_updated', async () => {
  const { platform, timelinePublisher } = wiredMemory();
  await platform.recordExplicitMemory({ travellerIdentityId: TRAVELLER, key: 'cuisine', value: 'spicy', polarity: MEMORY_POLARITY.POSITIVE });
  // Reinforce same memory -> commit -> memory_updated.
  await platform.observeLearnedMemory({ travellerIdentityId: TRAVELLER, key: 'cuisine', value: 'spicy', polarity: MEMORY_POLARITY.POSITIVE });

  const events = await timelinePublisher.listByTraveller(TRAVELLER);
  const names = events.map(e => e.metadata.eventName);
  assert.ok(names.includes('memory_created'));
  assert.ok(names.includes('memory_updated'));
  assert.ok(events.every(e => e.sourcePlatform === 'travel-memory-platform'));
});

test('memory publishes graph edges: traveller remembered memory; memory references destination', async () => {
  const { platform, relationshipPublisher } = wiredMemory();
  const mem = await platform.recordExplicitMemory({ travellerIdentityId: TRAVELLER, key: 'destination', value: 'Bali', polarity: MEMORY_POLARITY.POSITIVE });

  const remembered = await relationshipPublisher.queryNeighbours({ type: 'traveller', id: TRAVELLER }, { relationshipType: 'remembered' });
  assert.ok(remembered.some(n => n.entity.id === mem.memoryId));

  const refs = await relationshipPublisher.queryNeighbours({ type: 'memory', id: mem.memoryId }, { relationshipType: 'references' });
  // key 'destination' -> references destination by the same name-slug ('bali') the destination alias bridges to canonical.
  assert.ok(refs.some(n => n.entity.type === 'destination' && n.entity.id === 'bali'));
});

test('memory references entities from provenance snapshots', async () => {
  const { platform, relationshipPublisher } = wiredMemory();
  const mem = await platform.recordExplicitMemory({
    travellerIdentityId: TRAVELLER, key: 'vibe', value: 'relaxed', polarity: MEMORY_POLARITY.POSITIVE,
    source: { snapshotType: 'trip', snapshotId: 'trip_1' },
  });
  const refs = await relationshipPublisher.queryNeighbours({ type: 'memory', id: mem.memoryId }, { relationshipType: 'references' });
  assert.ok(refs.some(n => n.entity.type === 'trip' && n.entity.id === 'trip_1'));
});

// ---------------------------------------------------------------------------
// Cross-cutting guarantees
// ---------------------------------------------------------------------------

test('no publishers = unchanged legacy behaviour', async () => {
  const timeline = createTravelTimelinePlatform();
  const graph = createTravelRelationshipGraph();
  const destination = createDestinationPlatform();
  const memory = createTravelMemoryPlatform();

  const d = await destination.createDestination(destinationInput(), admin);
  const m = await memory.recordExplicitMemory({ travellerIdentityId: TRAVELLER, key: 'cuisine', value: 'spicy', polarity: MEMORY_POLARITY.POSITIVE });
  assert.ok(d.destinationId && m.memoryId);
  assert.equal((await timeline.listByTraveller('system')).length, 0);
  assert.equal((await timeline.listByTraveller(TRAVELLER)).length, 0);
  assert.equal((await graph.queryNeighbours({ type: 'traveller', id: TRAVELLER })).length, 0);
});

test('publisher failures are isolated — business ops still succeed', async () => {
  const explodingTimeline = { appendEvent() { throw new Error('down'); } };
  const explodingGraph = { createRelationship() { throw new Error('down'); } };
  const destination = createDestinationPlatform({ timelinePublisher: explodingTimeline, relationshipPublisher: explodingGraph });
  const memory = createTravelMemoryPlatform({ timelinePublisher: explodingTimeline, relationshipPublisher: explodingGraph });

  const d = await destination.createDestination(destinationInput(), admin);
  assert.ok(d.destinationId);
  const m = await memory.recordExplicitMemory({ travellerIdentityId: TRAVELLER, key: 'cuisine', value: 'spicy', polarity: MEMORY_POLARITY.POSITIVE });
  assert.ok(m.memoryId);
});

test('deterministic idempotency — no duplicate events or edges on replay', async () => {
  const { platform, timelinePublisher, relationshipPublisher } = wiredMemory();
  const mem = await platform.recordExplicitMemory({ travellerIdentityId: TRAVELLER, key: 'destination', value: 'Bali', polarity: MEMORY_POLARITY.POSITIVE });

  // Re-publishing the same created event (same key) is rejected as duplicate.
  await assert.rejects(() => timelinePublisher.appendEvent({
    travellerIdentityId: TRAVELLER, eventType: 'memory_created', sourcePlatform: 'travel-memory-platform',
    sourceEntityId: mem.memoryId, timestamp: mem.createdAt, metadata: { eventName: 'memory_created' },
    idempotencyKey: `travel-memory-platform:memory_created:${mem.memoryId}`,
  }), err => err.code === 'DUPLICATE_TIMELINE_EVENT');
  const created = (await timelinePublisher.listByTraveller(TRAVELLER)).filter(e => e.metadata.eventName === 'memory_created');
  assert.equal(created.length, 1);

  // Re-publishing the same edge is rejected as duplicate.
  await assert.rejects(() => relationshipPublisher.createRelationship({
    from: { type: 'traveller', id: TRAVELLER }, to: { type: 'memory', id: mem.memoryId }, relationshipType: 'remembered',
  }), err => err.code === 'DUPLICATE_RELATIONSHIP');
  assert.equal((await relationshipPublisher.queryByRelationshipType('remembered')).length, 1);
});

test('destination and memory source import no Timeline or Relationship Graph directly', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  for (const mod of ['destination-platform', 'travel-memory-platform']) {
    const src = readFileSync(join(dir, '..', 'lib', mod, 'service.js'), 'utf8');
    assert.ok(!/from\s+['"][^'"]*travel-timeline-platform/.test(src), `${mod} must not import timeline directly`);
    assert.ok(!/from\s+['"][^'"]*travel-relationship-graph/.test(src), `${mod} must not import relationship graph directly`);
  }
});

test('rejects misconfigured publisher ports', () => {
  assert.throws(() => createDestinationPlatform({ timelinePublisher: {} }), /timelinePublisher must expose appendEvent/);
  assert.throws(() => createTravelMemoryPlatform({ relationshipPublisher: {} }), /relationshipPublisher must expose createRelationship/);
});
