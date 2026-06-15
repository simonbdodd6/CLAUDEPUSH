import { randomUUID } from 'crypto';
import { clone } from '../platform-kernel/index.js';

// NOTE (M22b): appendAudit is intentionally left local — approval's audit shape
// omits a default `occurredAt`, which differs from the kernel createAuditEvent
// helper, so it is deferred to avoid any behaviour change.

/**
 * In-memory approval repository behind a stable adapter boundary.
 *
 * Deliberately DUMB. It stores request projections and two APPEND-ONLY logs:
 * decisions and audit. There is no delete and no decision-log mutation — the
 * decision/audit history is immutable. The service holds all business logic
 * (policies, transitions, two-person counting). A production adapter (Postgres,
 * etc.) can implement the same async surface unchanged.
 */
export class InMemoryApprovalRepository {
  constructor(seed = {}) {
    this.requests = new Map(); // requestId -> request projection
    this.decisions = []; // append-only decision log
    this.auditEvents = []; // append-only audit log

    for (const request of seed.requests ?? []) this.requests.set(request.requestId, clone(request));
    for (const decision of seed.decisions ?? []) this.decisions.push(clone(decision));
    for (const event of seed.auditEvents ?? []) this.auditEvents.push(clone(event));
  }

  // Save / update the current-state projection of a request. The immutable
  // history lives in the decision and audit logs, never here.
  async saveRequest(request) {
    this.requests.set(request.requestId, clone(request));
    return clone(request);
  }

  async getRequest(requestId) {
    return clone(this.requests.get(requestId) ?? null);
  }

  async listRequests() {
    return [...this.requests.values()].map(clone);
  }

  async appendDecision(decision) {
    this.decisions.push(clone(decision));
    return clone(decision);
  }

  async listDecisions(filter = {}) {
    return this.decisions
      .filter(d => !filter.requestId || d.requestId === filter.requestId)
      .filter(d => !filter.sourcePlatform || d.sourcePlatform === filter.sourcePlatform)
      .filter(d => !filter.decision || d.decision === filter.decision)
      .map(clone);
  }

  // Count of prior decisions for a request — used to mint deterministic,
  // monotonic decision ids without wall-clock.
  async decisionSeq(requestId) {
    return this.decisions.filter(d => d.requestId === requestId).length;
  }

  async appendAudit(event) {
    const auditEvent = {
      id: event.id ?? `approval_audit_${randomUUID()}`,
      ...event,
    };
    this.auditEvents.push(clone(auditEvent));
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.auditEvents
      .filter(e => !filter.requestId || e.requestId === filter.requestId)
      .filter(e => !filter.action || e.action === filter.action)
      .map(clone);
  }
}
