import { randomUUID } from 'crypto';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export class InMemoryDestinationRepository {
  constructor(seed = {}) {
    this.destinations = new Map();
    this.auditEvents = [];

    for (const destination of seed.destinations ?? []) {
      this.destinations.set(destination.destinationId, clone(destination));
    }

    for (const event of seed.auditEvents ?? []) {
      this.auditEvents.push(clone(event));
    }
  }

  async create(destination) {
    this.destinations.set(destination.destinationId, clone(destination));
    return clone(destination);
  }

  async get(destinationId) {
    return clone(this.destinations.get(destinationId) ?? null);
  }

  async update(destinationId, updater) {
    const current = this.destinations.get(destinationId);
    if (!current) return null;
    const next = await updater(clone(current));
    this.destinations.set(destinationId, clone(next));
    return clone(next);
  }

  async listByCountry(country) {
    const normalized = String(country ?? '').trim().toLowerCase();
    return [...this.destinations.values()]
      .filter(destination => destination.country.toLowerCase() === normalized)
      .map(clone)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listActive() {
    return [...this.destinations.values()]
      .filter(destination => destination.status === 'active')
      .map(clone)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async searchByName(query) {
    const normalized = String(query ?? '').trim().toLowerCase();
    if (!normalized) return [];
    return [...this.destinations.values()]
      .filter(destination => destination.name.toLowerCase().includes(normalized))
      .map(clone)
      .sort((a, b) => {
        const aExact = a.name.toLowerCase() === normalized ? 0 : 1;
        const bExact = b.name.toLowerCase() === normalized ? 0 : 1;
        return aExact - bExact || a.name.localeCompare(b.name);
      });
  }

  async appendAudit(event) {
    const auditEvent = {
      id: event.id ?? `destination_audit_${randomUUID()}`,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      ...event,
    };
    this.auditEvents.push(clone(auditEvent));
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.auditEvents
      .filter(event => !filter.destinationId || event.destinationId === filter.destinationId)
      .filter(event => !filter.action || event.action === filter.action)
      .map(clone);
  }
}

