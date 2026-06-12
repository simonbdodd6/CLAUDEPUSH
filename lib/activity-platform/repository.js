import { randomUUID } from 'crypto';
import { ACTIVITY_STATUS, ACTIVITY_VISIBILITY } from './constants.js';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export class InMemoryActivityRepository {
  constructor(seed = {}) {
    this.activities = new Map();
    this.auditEvents = [];

    for (const activity of seed.activities ?? []) {
      this.activities.set(activity.activityId, clone(activity));
    }

    for (const event of seed.auditEvents ?? []) {
      this.auditEvents.push(clone(event));
    }
  }

  async create(activity) {
    this.activities.set(activity.activityId, clone(activity));
    return clone(activity);
  }

  async get(activityId) {
    return clone(this.activities.get(activityId) ?? null);
  }

  async update(activityId, updater) {
    const current = this.activities.get(activityId);
    if (!current) return null;
    const next = await updater(clone(current));
    this.activities.set(activityId, clone(next));
    return clone(next);
  }

  async listByDestination(destinationId) {
    return [...this.activities.values()]
      .filter(activity => activity.destinationId === destinationId)
      .map(clone)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listActiveByDestination(destinationId) {
    return [...this.activities.values()]
      .filter(activity => activity.destinationId === destinationId)
      .filter(activity => activity.status === ACTIVITY_STATUS.ACTIVE)
      .filter(activity => activity.visibility === ACTIVITY_VISIBILITY.PUBLIC)
      .map(clone)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listByOwner(ownerIdentityId) {
    return [...this.activities.values()]
      .filter(activity => activity.ownerIdentityId === ownerIdentityId)
      .map(clone)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async searchByName(query) {
    const normalized = String(query ?? '').trim().toLowerCase();
    if (!normalized) return [];
    return [...this.activities.values()]
      .filter(activity => activity.name.toLowerCase().includes(normalized))
      .filter(activity => activity.status === ACTIVITY_STATUS.ACTIVE)
      .filter(activity => activity.visibility === ACTIVITY_VISIBILITY.PUBLIC)
      .map(clone)
      .sort((a, b) => {
        const aExact = a.name.toLowerCase() === normalized ? 0 : 1;
        const bExact = b.name.toLowerCase() === normalized ? 0 : 1;
        return aExact - bExact || a.name.localeCompare(b.name);
      });
  }

  async appendAudit(event) {
    const auditEvent = {
      id: event.id ?? `activity_audit_${randomUUID()}`,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      ...event,
    };
    this.auditEvents.push(clone(auditEvent));
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.auditEvents
      .filter(event => !filter.activityId || event.activityId === filter.activityId)
      .filter(event => !filter.action || event.action === filter.action)
      .map(clone);
  }
}
