import { randomUUID } from 'crypto';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export class InMemoryIdentityRepository {
  constructor(seed = {}) {
    this.identities = new Map();
    this.auditEvents = [];

    for (const identity of seed.identities ?? []) {
      this.identities.set(identity.id, clone(identity));
    }
    for (const event of seed.auditEvents ?? []) {
      this.auditEvents.push(clone(event));
    }
  }

  async create(identity) {
    this.identities.set(identity.id, clone(identity));
    return clone(identity);
  }

  async get(identityId) {
    return clone(this.identities.get(identityId) ?? null);
  }

  async update(identityId, updater) {
    const current = this.identities.get(identityId);
    if (!current) return null;
    const next = await updater(clone(current));
    this.identities.set(identityId, clone(next));
    return clone(next);
  }

  async appendAudit(event) {
    const auditEvent = {
      id: event.id ?? `audit_${randomUUID()}`,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      ...event,
    };
    this.auditEvents.push(clone(auditEvent));
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.auditEvents
      .filter(event => !filter.identityId || event.identityId === filter.identityId)
      .filter(event => !filter.action || event.action === filter.action)
      .map(clone);
  }
}

