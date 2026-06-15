import { clone, createAuditEvent } from '../platform-kernel/index.js';

/**
 * In-memory timeline repository behind a stable adapter boundary.
 *
 * It is deliberately DUMB: append-only storage plus simple indexes. There is no
 * `update` method — timeline events are immutable, so the storage layer offers
 * no way to mutate one. All business rules (validation, dedup decisions,
 * effective-view derivation, ordering) live in the service. A production adapter
 * (Postgres/Kafka/event store) can implement the same async surface unchanged.
 */
export class InMemoryTravelTimelineRepository {
  constructor(seed = {}) {
    this.events = new Map(); // timelineEventId -> event
    this.byTraveller = new Map(); // travellerIdentityId -> id[]
    this.byTrip = new Map(); // tripId -> id[]
    this.byIdempotencyKey = new Map(); // idempotencyKey -> id
    this.auditEvents = [];

    for (const event of seed.events ?? []) {
      this.#index(event, event.idempotencyKey ?? null);
    }
    for (const auditEvent of seed.auditEvents ?? []) {
      this.auditEvents.push(clone(auditEvent));
    }
  }

  #pushIndex(map, key, id) {
    if (key == null) return;
    const list = map.get(key) ?? [];
    list.push(id);
    map.set(key, list);
  }

  #index(event, idempotencyKey) {
    this.events.set(event.timelineEventId, clone(event));
    this.#pushIndex(this.byTraveller, event.travellerIdentityId, event.timelineEventId);
    this.#pushIndex(this.byTrip, event.tripId, event.timelineEventId);
    if (idempotencyKey != null) this.byIdempotencyKey.set(idempotencyKey, event.timelineEventId);
  }

  // Append a new immutable event. There is intentionally no update/delete.
  async append(event, { idempotencyKey = null } = {}) {
    this.#index(event, idempotencyKey);
    return clone(event);
  }

  async get(timelineEventId) {
    return clone(this.events.get(timelineEventId) ?? null);
  }

  async getIdByIdempotencyKey(idempotencyKey) {
    return this.byIdempotencyKey.get(idempotencyKey) ?? null;
  }

  async listAll() {
    return [...this.events.values()].map(clone);
  }

  async listByTraveller(travellerIdentityId) {
    return (this.byTraveller.get(travellerIdentityId) ?? []).map(id => clone(this.events.get(id)));
  }

  async listByTrip(tripId) {
    return (this.byTrip.get(tripId) ?? []).map(id => clone(this.events.get(id)));
  }

  async appendAudit(event) {
    const auditEvent = createAuditEvent(event, { idPrefix: 'timeline_audit' });
    this.auditEvents.push(clone(auditEvent));
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.auditEvents
      .filter(event => !filter.timelineEventId || event.timelineEventId === filter.timelineEventId)
      .filter(event => !filter.travellerIdentityId || event.travellerIdentityId === filter.travellerIdentityId)
      .filter(event => !filter.action || event.action === filter.action)
      .map(clone);
  }
}
