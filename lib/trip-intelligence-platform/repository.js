import { randomUUID } from 'crypto';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export class InMemoryTripIntelligenceRepository {
  constructor(seed = {}) {
    this.tripPlans = new Map();
    this.auditEvents = [];

    for (const plan of seed.tripPlans ?? []) {
      this.tripPlans.set(plan.tripPlanId, clone(plan));
    }

    for (const event of seed.auditEvents ?? []) {
      this.auditEvents.push(clone(event));
    }
  }

  async savePlan(plan) {
    this.tripPlans.set(plan.tripPlanId, clone(plan));
    return clone(plan);
  }

  async getPlan(tripPlanId) {
    return clone(this.tripPlans.get(tripPlanId) ?? null);
  }

  async listPlansForTrip(tripId) {
    return [...this.tripPlans.values()]
      .filter(plan => plan.tripId === tripId)
      .map(clone)
      .sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
  }

  async appendAudit(event) {
    const auditEvent = {
      id: event.id ?? `trip_intelligence_audit_${randomUUID()}`,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      ...event,
    };
    this.auditEvents.push(clone(auditEvent));
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.auditEvents
      .filter(event => !filter.tripPlanId || event.tripPlanId === filter.tripPlanId)
      .filter(event => !filter.action || event.action === filter.action)
      .map(clone);
  }
}
