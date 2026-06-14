import { randomUUID } from 'crypto';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/**
 * In-memory itinerary repository behind a stable adapter boundary.
 *
 * A future production adapter (Postgres/Supabase/etc.) can implement the same
 * async surface without changing the domain service. The service never reaches
 * into the data structures directly; it only calls these methods.
 */
export class InMemoryItineraryRepository {
  constructor(seed = {}) {
    this.itineraries = new Map();
    this.versions = new Map(); // itineraryId -> version snapshot[]
    this.auditEvents = [];

    for (const itinerary of seed.itineraries ?? []) {
      this.itineraries.set(itinerary.itineraryId, clone(itinerary));
    }
    for (const [itineraryId, snapshots] of Object.entries(seed.versions ?? {})) {
      this.versions.set(itineraryId, (snapshots ?? []).map(clone));
    }
    for (const event of seed.auditEvents ?? []) {
      this.auditEvents.push(clone(event));
    }
  }

  async saveItinerary(itinerary) {
    this.itineraries.set(itinerary.itineraryId, clone(itinerary));
    return clone(itinerary);
  }

  async getItinerary(itineraryId) {
    return clone(this.itineraries.get(itineraryId) ?? null);
  }

  async listItinerariesForTrip(tripId) {
    return [...this.itineraries.values()]
      .filter(itinerary => itinerary.tripId === tripId)
      .map(clone)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async listItinerariesForOwner(ownerIdentityId) {
    return [...this.itineraries.values()]
      .filter(itinerary => itinerary.ownerIdentityId === ownerIdentityId)
      .map(clone)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async appendVersion(itineraryId, snapshot) {
    const history = this.versions.get(itineraryId) ?? [];
    history.push(clone(snapshot));
    this.versions.set(itineraryId, history);
    return clone(snapshot);
  }

  async listVersions(itineraryId) {
    return (this.versions.get(itineraryId) ?? []).map(clone);
  }

  async getVersion(itineraryId, version) {
    return clone((this.versions.get(itineraryId) ?? []).find(entry => entry.version === version) ?? null);
  }

  async appendAudit(event) {
    const auditEvent = {
      id: event.id ?? `itinerary_audit_${randomUUID()}`,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      ...event,
    };
    this.auditEvents.push(clone(auditEvent));
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.auditEvents
      .filter(event => !filter.itineraryId || event.itineraryId === filter.itineraryId)
      .filter(event => !filter.action || event.action === filter.action)
      .map(clone);
  }
}
