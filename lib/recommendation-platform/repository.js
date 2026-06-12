import { randomUUID } from 'crypto';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export class InMemoryRecommendationRepository {
  constructor(seed = {}) {
    this.recommendationRuns = new Map();
    this.auditEvents = [];

    for (const run of seed.recommendationRuns ?? []) {
      this.recommendationRuns.set(run.recommendationRunId, clone(run));
    }

    for (const event of seed.auditEvents ?? []) {
      this.auditEvents.push(clone(event));
    }
  }

  async saveRun(run) {
    this.recommendationRuns.set(run.recommendationRunId, clone(run));
    return clone(run);
  }

  async getRun(recommendationRunId) {
    return clone(this.recommendationRuns.get(recommendationRunId) ?? null);
  }

  async listRunsForTraveller(travellerIdentityId) {
    return [...this.recommendationRuns.values()]
      .filter(run => run.travellerIdentityId === travellerIdentityId)
      .map(clone)
      .sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
  }

  async appendAudit(event) {
    const auditEvent = {
      id: event.id ?? `recommendation_audit_${randomUUID()}`,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      ...event,
    };
    this.auditEvents.push(clone(auditEvent));
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.auditEvents
      .filter(event => !filter.recommendationRunId || event.recommendationRunId === filter.recommendationRunId)
      .filter(event => !filter.action || event.action === filter.action)
      .map(clone);
  }
}
