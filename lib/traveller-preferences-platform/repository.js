import { randomUUID } from 'crypto';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export class InMemoryTravellerPreferencesRepository {
  constructor(seed = {}) {
    this.preferencesByTravellerIdentityId = new Map();
    this.auditEvents = [];

    for (const preferences of seed.preferences ?? []) {
      this.preferencesByTravellerIdentityId.set(preferences.travellerIdentityId, clone(preferences));
    }

    for (const event of seed.auditEvents ?? []) {
      this.auditEvents.push(clone(event));
    }
  }

  async create(preferences) {
    if (this.preferencesByTravellerIdentityId.has(preferences.travellerIdentityId)) return null;
    this.preferencesByTravellerIdentityId.set(preferences.travellerIdentityId, clone(preferences));
    return clone(preferences);
  }

  async getByTravellerIdentityId(travellerIdentityId) {
    return clone(this.preferencesByTravellerIdentityId.get(travellerIdentityId) ?? null);
  }

  async update(travellerIdentityId, updater) {
    const current = this.preferencesByTravellerIdentityId.get(travellerIdentityId);
    if (!current) return null;
    const next = await updater(clone(current));
    this.preferencesByTravellerIdentityId.set(travellerIdentityId, clone(next));
    return clone(next);
  }

  async delete(travellerIdentityId, updater) {
    const current = this.preferencesByTravellerIdentityId.get(travellerIdentityId);
    if (!current) return null;
    const next = await updater(clone(current));
    this.preferencesByTravellerIdentityId.set(travellerIdentityId, clone(next));
    return clone(next);
  }

  async appendAudit(event) {
    const auditEvent = {
      id: event.id ?? `traveller_preferences_audit_${randomUUID()}`,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      ...event,
    };
    this.auditEvents.push(clone(auditEvent));
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.auditEvents
      .filter(event => !filter.travellerIdentityId || event.travellerIdentityId === filter.travellerIdentityId)
      .filter(event => !filter.action || event.action === filter.action)
      .map(clone);
  }
}
