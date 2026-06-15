// Travel App — durable repositories (M23.0 bridge).
//
// These implement the EXACT async surface of the frozen platform repositories
// (InMemoryTripRepository / InMemoryEventRepository /
// InMemoryTravelTimelineRepository) but persist via the file store, so a real
// app survives restarts. They are product infrastructure injected into the
// frozen `create*Platform({ repository })` factories — no platform contract is
// changed and no business logic is duplicated (services stay authoritative).

import { clone, createAuditEvent } from '../../../lib/platform-kernel/index.js';

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
