import { randomUUID } from 'crypto';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export class InMemoryTripRepository {
  constructor(seed = {}) {
    this.trips = new Map();
    this.auditEvents = [];

    for (const trip of seed.trips ?? []) {
      this.trips.set(trip.tripId, clone(trip));
    }

    for (const event of seed.auditEvents ?? []) {
      this.auditEvents.push(clone(event));
    }
  }

  async create(trip) {
    this.trips.set(trip.tripId, clone(trip));
    return clone(trip);
  }

  async get(tripId) {
    return clone(this.trips.get(tripId) ?? null);
  }

  async update(tripId, updater) {
    const current = this.trips.get(tripId);
    if (!current) return null;
    const next = await updater(clone(current));
    this.trips.set(tripId, clone(next));
    return clone(next);
  }

  async listByOwner(ownerIdentityId) {
    return [...this.trips.values()]
      .filter(trip => trip.ownerIdentityId === ownerIdentityId)
      .map(clone)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async appendAudit(event) {
    const auditEvent = {
      id: event.id ?? `trip_audit_${randomUUID()}`,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      ...event,
    };
    this.auditEvents.push(clone(auditEvent));
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.auditEvents
      .filter(event => !filter.tripId || event.tripId === filter.tripId)
      .filter(event => !filter.action || event.action === filter.action)
      .map(clone);
  }
}

