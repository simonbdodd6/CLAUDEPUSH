// Travel App — durable repositories (M23.0 bridge).
//
// These implement the EXACT async surface of the frozen platform repositories
// (InMemoryTripRepository / InMemoryEventRepository /
// InMemoryTravelTimelineRepository) but persist via the file store, so a real
// app survives restarts. They are product infrastructure injected into the
// frozen `create*Platform({ repository })` factories — no platform contract is
// changed and no business logic is duplicated (services stay authoritative).

import { randomUUID } from 'crypto';
import { clone, createAuditEvent } from '../../../lib/platform-kernel/index.js';

// Shared upsert helper: replace an item matching keyField, else append.
function upsert(items, item, keyField) {
  const next = items.filter(x => x[keyField] !== item[keyField]);
  next.push(clone(item));
  return next;
}

// --- trip-platform: CRUD + listByOwner + audit ---
export class FileTripRepository {
  constructor(store, { tripsCollection = 'trips', auditCollection = 'trip_audit' } = {}) {
    this.store = store;
    this.C = tripsCollection;
    this.A = auditCollection;
  }

  async create(trip) {
    const trips = this.store.read(this.C).filter(t => t.tripId !== trip.tripId); // upsert (Map semantics)
    trips.push(clone(trip));
    this.store.write(this.C, trips);
    return clone(trip);
  }

  async get(tripId) {
    const trip = this.store.read(this.C).find(t => t.tripId === tripId);
    return trip ? clone(trip) : null;
  }

  async update(tripId, updater) {
    const trips = this.store.read(this.C);
    const index = trips.findIndex(t => t.tripId === tripId);
    if (index < 0) return null;
    const next = await updater(clone(trips[index]));
    trips[index] = clone(next);
    this.store.write(this.C, trips);
    return clone(next);
  }

  async listByOwner(ownerIdentityId) {
    return this.store.read(this.C)
      .filter(trip => trip.ownerIdentityId === ownerIdentityId)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .map(clone);
  }

  async appendAudit(event) {
    const audit = this.store.read(this.A);
    const auditEvent = createAuditEvent(event, { idPrefix: 'trip_audit' });
    audit.push(auditEvent);
    this.store.write(this.A, audit);
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.store.read(this.A)
      .filter(event => !filter.tripId || event.tripId === filter.tripId)
      .filter(event => !filter.action || event.action === filter.action)
      .map(clone);
  }
}

// --- event-platform: append-only log + id index (derived) ---
export class FileEventRepository {
  constructor(store, { collection = 'events' } = {}) {
    this.store = store;
    this.C = collection;
  }

  async size() {
    return this.store.read(this.C).length;
  }

  async has(eventId) {
    return this.store.read(this.C).some(e => e.eventId === eventId);
  }

  async append(event) {
    const events = this.store.read(this.C);
    events.push(clone(event));
    this.store.write(this.C, events);
    return clone(event);
  }

  async getById(eventId) {
    const event = this.store.read(this.C).find(e => e.eventId === eventId);
    return event ? clone(event) : null;
  }

  async list() {
    return this.store.read(this.C).map(clone);
  }
}

// --- travel-timeline-platform: append-only + traveller/trip/idempotency indexes (derived) + audit ---
export class FileTimelineRepository {
  constructor(store, { eventsCollection = 'timeline_events', keysCollection = 'timeline_idem_keys', auditCollection = 'timeline_audit' } = {}) {
    this.store = store;
    this.C = eventsCollection;
    this.K = keysCollection;
    this.A = auditCollection;
  }

  async append(event, { idempotencyKey = null } = {}) {
    const events = this.store.read(this.C);
    events.push(clone(event));
    this.store.write(this.C, events);
    if (idempotencyKey != null) {
      const keys = this.store.read(this.K);
      keys.push({ key: idempotencyKey, id: event.timelineEventId });
      this.store.write(this.K, keys);
    }
    return clone(event);
  }

  async get(timelineEventId) {
    const event = this.store.read(this.C).find(e => e.timelineEventId === timelineEventId);
    return event ? clone(event) : null;
  }

  async getIdByIdempotencyKey(idempotencyKey) {
    const match = this.store.read(this.K).find(k => k.key === idempotencyKey);
    return match ? match.id : null;
  }

  async listAll() {
    return this.store.read(this.C).map(clone);
  }

  async listByTraveller(travellerIdentityId) {
    return this.store.read(this.C).filter(e => e.travellerIdentityId === travellerIdentityId).map(clone);
  }

  async listByTrip(tripId) {
    return this.store.read(this.C).filter(e => e.tripId === tripId).map(clone);
  }

  async appendAudit(event) {
    const audit = this.store.read(this.A);
    const auditEvent = createAuditEvent(event, { idPrefix: 'timeline_audit' });
    audit.push(auditEvent);
    this.store.write(this.A, audit);
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.store.read(this.A)
      .filter(event => !filter.timelineEventId || event.timelineEventId === filter.timelineEventId)
      .filter(event => !filter.travellerIdentityId || event.travellerIdentityId === filter.travellerIdentityId)
      .filter(event => !filter.action || event.action === filter.action)
      .map(clone);
  }
}

// --- identity-platform: identities (create/get/update) + audit ---
export class FileIdentityRepository {
  constructor(store, { collection = 'identities', auditCollection = 'identity_audit' } = {}) {
    this.store = store; this.C = collection; this.A = auditCollection;
  }

  async create(identity) {
    this.store.write(this.C, upsert(this.store.read(this.C), identity, 'id'));
    return clone(identity);
  }

  async get(identityId) {
    const found = this.store.read(this.C).find(i => i.id === identityId);
    return found ? clone(found) : null;
  }

  async update(identityId, updater) {
    const items = this.store.read(this.C);
    const index = items.findIndex(i => i.id === identityId);
    if (index < 0) return null;
    const next = await updater(clone(items[index]));
    items[index] = clone(next);
    this.store.write(this.C, items);
    return clone(next);
  }

  async appendAudit(event) {
    const audit = this.store.read(this.A);
    const auditEvent = createAuditEvent(event, { idPrefix: 'audit' });
    audit.push(auditEvent);
    this.store.write(this.A, audit);
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.store.read(this.A)
      .filter(e => !filter.identityId || e.identityId === filter.identityId)
      .filter(e => !filter.action || e.action === filter.action)
      .map(clone);
  }
}

// --- itinerary-platform: itineraries + version history + audit ---
export class FileItineraryRepository {
  constructor(store, { collection = 'itineraries', versionsCollection = 'itinerary_versions', auditCollection = 'itinerary_audit' } = {}) {
    this.store = store; this.C = collection; this.V = versionsCollection; this.A = auditCollection;
  }

  async saveItinerary(itinerary) {
    this.store.write(this.C, upsert(this.store.read(this.C), itinerary, 'itineraryId'));
    return clone(itinerary);
  }

  async getItinerary(itineraryId) {
    const found = this.store.read(this.C).find(i => i.itineraryId === itineraryId);
    return found ? clone(found) : null;
  }

  async listItinerariesForTrip(tripId) {
    return this.store.read(this.C).filter(i => i.tripId === tripId)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(clone);
  }

  async listItinerariesForOwner(ownerIdentityId) {
    return this.store.read(this.C).filter(i => i.ownerIdentityId === ownerIdentityId)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(clone);
  }

  async appendVersion(itineraryId, snapshot) {
    const rows = this.store.read(this.V);
    rows.push({ itineraryId, snapshot: clone(snapshot) });
    this.store.write(this.V, rows);
    return clone(snapshot);
  }

  async listVersions(itineraryId) {
    return this.store.read(this.V).filter(r => r.itineraryId === itineraryId).map(r => clone(r.snapshot));
  }

  async getVersion(itineraryId, version) {
    const row = this.store.read(this.V).find(r => r.itineraryId === itineraryId && r.snapshot.version === version);
    return row ? clone(row.snapshot) : null;
  }

  async appendAudit(event) {
    const audit = this.store.read(this.A);
    const auditEvent = createAuditEvent(event, { idPrefix: 'itinerary_audit' });
    audit.push(auditEvent);
    this.store.write(this.A, audit);
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.store.read(this.A)
      .filter(e => !filter.itineraryId || e.itineraryId === filter.itineraryId)
      .filter(e => !filter.action || e.action === filter.action)
      .map(clone);
  }
}

// --- travel-memory-platform: memories + version history + audit ---
export class FileTravelMemoryRepository {
  constructor(store, { collection = 'memories', versionsCollection = 'memory_versions', auditCollection = 'travel_memory_audit' } = {}) {
    this.store = store; this.C = collection; this.V = versionsCollection; this.A = auditCollection;
  }

  async saveMemory(memory) {
    this.store.write(this.C, upsert(this.store.read(this.C), memory, 'memoryId'));
    return clone(memory);
  }

  async getMemory(memoryId) {
    const found = this.store.read(this.C).find(m => m.memoryId === memoryId);
    return found ? clone(found) : null;
  }

  async findMemory(travellerIdentityId, key, value) {
    const found = this.store.read(this.C).find(m =>
      m.travellerIdentityId === travellerIdentityId && m.key === key && m.value === value);
    return found ? clone(found) : null;
  }

  async listMemoriesForTraveller(travellerIdentityId) {
    return this.store.read(this.C).filter(m => m.travellerIdentityId === travellerIdentityId)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(clone);
  }

  async appendVersion(memoryId, snapshot) {
    const rows = this.store.read(this.V);
    rows.push({ memoryId, snapshot: clone(snapshot) });
    this.store.write(this.V, rows);
    return clone(snapshot);
  }

  async listVersions(memoryId) {
    return this.store.read(this.V).filter(r => r.memoryId === memoryId).map(r => clone(r.snapshot));
  }

  async getVersion(memoryId, version) {
    const row = this.store.read(this.V).find(r => r.memoryId === memoryId && r.snapshot.version === version);
    return row ? clone(row.snapshot) : null;
  }

  async appendAudit(event) {
    const audit = this.store.read(this.A);
    const auditEvent = createAuditEvent(event, { idPrefix: 'travel_memory_audit' });
    audit.push(auditEvent);
    this.store.write(this.A, audit);
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.store.read(this.A)
      .filter(e => !filter.memoryId || e.memoryId === filter.memoryId)
      .filter(e => !filter.travellerIdentityId || e.travellerIdentityId === filter.travellerIdentityId)
      .filter(e => !filter.action || e.action === filter.action)
      .map(clone);
  }
}

// --- relationship-graph: edges (indexes derived by scan) + audit ---
export class FileRelationshipRepository {
  constructor(store, { collection = 'relationships', auditCollection = 'graph_audit' } = {}) {
    this.store = store; this.C = collection; this.A = auditCollection;
  }

  async addRelationship(edge) {
    const edges = this.store.read(this.C);
    edges.push(clone(edge));
    this.store.write(this.C, edges);
    return clone(edge);
  }

  async removeRelationship(relationshipId) {
    const edges = this.store.read(this.C);
    const removed = edges.find(e => e.relationshipId === relationshipId);
    if (!removed) return null;
    this.store.write(this.C, edges.filter(e => e.relationshipId !== relationshipId));
    return clone(removed);
  }

  async getRelationship(relationshipId) {
    const found = this.store.read(this.C).find(e => e.relationshipId === relationshipId);
    return found ? clone(found) : null;
  }

  async listOutByNode(nodeKey) {
    return this.store.read(this.C).filter(e => e.fromKey === nodeKey).map(clone);
  }

  async listInByNode(nodeKey) {
    return this.store.read(this.C).filter(e => e.toKey === nodeKey).map(clone);
  }

  async listAll() {
    return this.store.read(this.C).map(clone);
  }

  async appendAudit(event) {
    const audit = this.store.read(this.A);
    const auditEvent = createAuditEvent(event, { idPrefix: 'graph_audit' });
    audit.push(auditEvent);
    this.store.write(this.A, audit);
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.store.read(this.A)
      .filter(e => !filter.relationshipId || e.relationshipId === filter.relationshipId)
      .filter(e => !filter.action || e.action === filter.action)
      .map(clone);
  }
}

// --- approval-platform: request projections + append-only decisions + audit ---
export class FileApprovalRepository {
  constructor(store, { requestsCollection = 'approval_requests', decisionsCollection = 'approval_decisions', auditCollection = 'approval_audit' } = {}) {
    this.store = store; this.R = requestsCollection; this.D = decisionsCollection; this.A = auditCollection;
  }

  async saveRequest(request) {
    this.store.write(this.R, upsert(this.store.read(this.R), request, 'requestId'));
    return clone(request);
  }

  async getRequest(requestId) {
    const found = this.store.read(this.R).find(r => r.requestId === requestId);
    return found ? clone(found) : null;
  }

  async listRequests() {
    return this.store.read(this.R).map(clone);
  }

  async appendDecision(decision) {
    const decisions = this.store.read(this.D);
    decisions.push(clone(decision));
    this.store.write(this.D, decisions);
    return clone(decision);
  }

  async listDecisions(filter = {}) {
    return this.store.read(this.D)
      .filter(d => !filter.requestId || d.requestId === filter.requestId)
      .filter(d => !filter.sourcePlatform || d.sourcePlatform === filter.sourcePlatform)
      .filter(d => !filter.decision || d.decision === filter.decision)
      .map(clone);
  }

  async decisionSeq(requestId) {
    return this.store.read(this.D).filter(d => d.requestId === requestId).length;
  }

  async appendAudit(event) {
    const audit = this.store.read(this.A);
    // Approval's audit shape omits a default occurredAt (matches the frozen repo).
    const auditEvent = { id: event.id ?? `approval_audit_${randomUUID()}`, ...event };
    audit.push(clone(auditEvent));
    this.store.write(this.A, audit);
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.store.read(this.A)
      .filter(e => !filter.requestId || e.requestId === filter.requestId)
      .filter(e => !filter.action || e.action === filter.action)
      .map(clone);
  }
}
