import { clone } from '../platform-kernel/index.js';
import {
  ACTIONABLE_STATUSES,
  APPROVAL_AUDIT_ACTIONS,
  APPROVAL_DECISION,
  APPROVAL_STATUS,
  DEFAULT_APPROVAL_POLICY,
  POLICY_CODE,
  PRIORITY_RANK,
  TERMINAL_STATUSES,
} from './constants.js';
import { InMemoryApprovalRepository } from './repository.js';
import {
  duplicateError,
  notFoundError,
  permissionError,
  policyError,
  transitionError,
  validationError,
} from './errors.js';

function now() {
  return new Date().toISOString();
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw validationError(`${field} is required`, { field });
  return value.trim();
}

function requireActor(actor, action) {
  if (!actor || !actor.id) throw permissionError(`Actor is required for ${action}`, { action });
  return actor;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeConfidence(value) {
  if (value == null) return null;
  const num = Number(value);
  if (Number.isNaN(num) || num < 0 || num > 1) throw validationError('confidence must be a number between 0 and 1', { confidence: value });
  return num;
}

function normalizePolicy(input, defaultPolicy) {
  const base = { ...DEFAULT_APPROVAL_POLICY, ...defaultPolicy, ...(input ?? {}) };
  const minApprovers = Number.isInteger(base.minApprovers) && base.minApprovers >= 1 ? base.minApprovers : 1;
  return {
    requireManual: true, // never configurable away — the platform never auto-approves
    minConfidence: base.minConfidence == null ? null : normalizeConfidence(base.minConfidence),
    requireEvidence: base.requireEvidence === true,
    blockedRiskSignals: asArray(base.blockedRiskSignals).map(String),
    minApprovers,
    expiresAt: base.expiresAt ?? null,
  };
}

export function createApprovalPlatform(options = {}) {
  const repository = options.repository ?? new InMemoryApprovalRepository();
  const defaultPolicy = options.defaultPolicy ?? {};

  async function loadActionable(requestId, action) {
    const request = await repository.getRequest(assertNonEmptyString(requestId, 'requestId'));
    if (!request) throw notFoundError(requestId);
    if (TERMINAL_STATUSES.includes(request.status)) {
      throw transitionError(`Cannot ${action} a ${request.status} request`, { requestId, status: request.status });
    }
    return request;
  }

  async function record(request, { decision, status, actor, details = {}, at, auditAction }) {
    const seq = (await repository.decisionSeq(request.requestId)) + 1;
    const occurredAt = at ?? now();
    const decisionRecord = {
      decisionId: `${request.requestId}#${seq}`,
      seq,
      requestId: request.requestId,
      sourcePlatform: request.sourcePlatform,
      decision,
      actorId: actor?.id ?? 'system',
      actorType: actor?.type ?? 'SYSTEM',
      details: clone(details),
      occurredAt,
    };
    await repository.appendDecision(decisionRecord); // append-only, immutable

    request.status = status;
    request.decisionCount = seq;
    request.updatedAt = occurredAt;
    await repository.saveRequest(request);

    await repository.appendAudit({
      action: auditAction,
      requestId: request.requestId,
      actorId: decisionRecord.actorId,
      actorType: decisionRecord.actorType,
      details: clone(details),
      occurredAt,
    });
    return clone(request);
  }

  /**
   * Submit an approval request from any platform. Stored as PENDING. The
   * requestId is caller-supplied (idempotency); a duplicate is rejected.
   */
  async function submitApprovalRequest(input = {}) {
    const requestId = assertNonEmptyString(input.requestId, 'requestId');
    const sourcePlatform = assertNonEmptyString(input.sourcePlatform, 'sourcePlatform');
    const actionType = assertNonEmptyString(input.actionType, 'actionType');
    const requestedBy = assertNonEmptyString(input.requestedBy, 'requestedBy');
    if (await repository.getRequest(requestId)) throw duplicateError(requestId);

    const createdAt = input.createdAt ?? now();
    const request = {
      requestId,
      sourcePlatform,
      sourceEntity: clone(input.sourceEntity ?? null),
      actionType,
      priority: input.priority ?? 'medium',
      confidence: normalizeConfidence(input.confidence),
      evidenceRefs: clone(asArray(input.evidenceRefs)),
      summary: input.summary ?? '',
      riskSignals: asArray(input.riskSignals).map(String),
      approvalPolicy: normalizePolicy(input.approvalPolicy, defaultPolicy),
      requestedBy,
      createdFrom: clone(input.createdFrom ?? null),
      status: APPROVAL_STATUS.PENDING,
      approvals: [], // distinct approver ids (two-person support)
      decisionCount: 0,
      createdAt,
      updatedAt: createdAt,
    };
    await repository.saveRequest(request);
    await repository.appendAudit({
      action: APPROVAL_AUDIT_ACTIONS.REQUEST_SUBMITTED,
      requestId,
      actorId: requestedBy,
      actorType: input.requestedByType ?? 'SYSTEM',
      details: { sourcePlatform, actionType, priority: request.priority },
      occurredAt: createdAt,
    });
    return clone(request);
  }

  function isExpired(request, asOf) {
    const expiresAt = request.approvalPolicy?.expiresAt;
    if (!expiresAt || !asOf) return false;
    return new Date(asOf).getTime() >= new Date(expiresAt).getTime();
  }

  function enforceApprovalPolicy(request) {
    const policy = request.approvalPolicy;
    if (policy.requireEvidence && asArray(request.evidenceRefs).length === 0) {
      throw policyError(POLICY_CODE.EVIDENCE_REQUIRED, 'Approval requires supporting evidence', { requestId: request.requestId });
    }
    if (policy.minConfidence != null && (request.confidence == null || request.confidence < policy.minConfidence)) {
      throw policyError(POLICY_CODE.CONFIDENCE_BELOW_THRESHOLD, 'Request confidence is below the policy threshold', {
        requestId: request.requestId, confidence: request.confidence, minConfidence: policy.minConfidence,
      });
    }
    const blocked = policy.blockedRiskSignals.filter(code => request.riskSignals.includes(code));
    if (blocked.length) {
      throw policyError(POLICY_CODE.RISK_BLOCKED, 'Request carries risk signals blocked by policy', { requestId: request.requestId, blocked });
    }
  }

  /**
   * Record a human approval. NEVER auto-approves: requires an actor. Enforces
   * policy (expiry, evidence, confidence, risk). With two-person policy the
   * status becomes APPROVED only once distinct approvers reach minApprovers.
   */
  async function approve(requestId, actor, decisionOptions = {}) {
    requireActor(actor, 'approve');
    const request = await loadActionable(requestId, 'approve');
    const asOf = decisionOptions.asOf;

    if (isExpired(request, asOf)) {
      await record(request, {
        decision: APPROVAL_DECISION.EXPIRED, status: APPROVAL_STATUS.EXPIRED, actor,
        details: { reason: 'expired_on_approve', asOf }, at: asOf, auditAction: APPROVAL_AUDIT_ACTIONS.REQUEST_EXPIRED,
      });
      throw policyError(POLICY_CODE.EXPIRED, 'Request has expired', { requestId });
    }
    enforceApprovalPolicy(request);

    const approverId = actor.id;
    if (!request.approvals.includes(approverId)) request.approvals.push(approverId);
    const reached = request.approvals.length >= request.approvalPolicy.minApprovers;

    if (!reached) {
      // Two-person: record the vote but stay PENDING until threshold is met.
      return record(request, {
        decision: APPROVAL_DECISION.APPROVAL_RECORDED, status: APPROVAL_STATUS.PENDING, actor,
        details: { approvals: request.approvals.length, minApprovers: request.approvalPolicy.minApprovers },
        at: asOf, auditAction: APPROVAL_AUDIT_ACTIONS.APPROVAL_RECORDED,
      });
    }
    return record(request, {
      decision: APPROVAL_DECISION.APPROVED, status: APPROVAL_STATUS.APPROVED, actor,
      details: { approvals: [...request.approvals], reason: decisionOptions.reason ?? null },
      at: asOf, auditAction: APPROVAL_AUDIT_ACTIONS.REQUEST_APPROVED,
    });
  }

  async function reject(requestId, actor, decisionOptions = {}) {
    requireActor(actor, 'reject');
    const request = await loadActionable(requestId, 'reject');
    return record(request, {
      decision: APPROVAL_DECISION.REJECTED, status: APPROVAL_STATUS.REJECTED, actor,
      details: { reason: decisionOptions.reason ?? null }, at: decisionOptions.asOf, auditAction: APPROVAL_AUDIT_ACTIONS.REQUEST_REJECTED,
    });
  }

  async function defer(requestId, actor, decisionOptions = {}) {
    requireActor(actor, 'defer');
    const request = await loadActionable(requestId, 'defer');
    return record(request, {
      decision: APPROVAL_DECISION.DEFERRED, status: APPROVAL_STATUS.DEFERRED, actor,
      details: { until: decisionOptions.until ?? null, reason: decisionOptions.reason ?? null },
      at: decisionOptions.asOf, auditAction: APPROVAL_AUDIT_ACTIONS.REQUEST_DEFERRED,
    });
  }

  async function expire(requestId, actor = { id: 'system', type: 'SYSTEM' }, decisionOptions = {}) {
    const request = await loadActionable(requestId, 'expire');
    return record(request, {
      decision: APPROVAL_DECISION.EXPIRED, status: APPROVAL_STATUS.EXPIRED, actor,
      details: { reason: decisionOptions.reason ?? 'expired', asOf: decisionOptions.asOf ?? null },
      at: decisionOptions.asOf, auditAction: APPROVAL_AUDIT_ACTIONS.REQUEST_EXPIRED,
    });
  }

  async function cancel(requestId, actor, decisionOptions = {}) {
    requireActor(actor, 'cancel');
    const request = await loadActionable(requestId, 'cancel');
    return record(request, {
      decision: APPROVAL_DECISION.CANCELLED, status: APPROVAL_STATUS.CANCELLED, actor,
      details: { reason: decisionOptions.reason ?? null }, at: decisionOptions.asOf, auditAction: APPROVAL_AUDIT_ACTIONS.REQUEST_CANCELLED,
    });
  }

  /**
   * Ask for more evidence. Resets recorded approvals (the basis changed) and
   * moves the request to NEEDS_MORE_EVIDENCE without rewriting history.
   */
  async function requestMoreEvidence(requestId, actor, decisionOptions = {}) {
    requireActor(actor, 'requestMoreEvidence');
    const request = await loadActionable(requestId, 'requestMoreEvidence');
    request.approvals = [];
    return record(request, {
      decision: APPROVAL_DECISION.NEEDS_MORE_EVIDENCE, status: APPROVAL_STATUS.NEEDS_MORE_EVIDENCE, actor,
      details: { note: decisionOptions.note ?? null }, at: decisionOptions.asOf, auditAction: APPROVAL_AUDIT_ACTIONS.MORE_EVIDENCE_REQUESTED,
    });
  }

  async function getRequest(requestId) {
    const request = await repository.getRequest(assertNonEmptyString(requestId, 'requestId'));
    if (!request) throw notFoundError(requestId);
    return request;
  }

  async function queryPending(filter = {}) {
    const requests = await repository.listRequests();
    return requests
      .filter(r => ACTIONABLE_STATUSES.includes(r.status))
      .filter(r => !filter.sourcePlatform || r.sourcePlatform === filter.sourcePlatform)
      .filter(r => !filter.status || r.status === filter.status)
      .filter(r => !filter.actionType || r.actionType === filter.actionType)
      .sort((a, b) => (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0)
        || String(a.createdAt).localeCompare(String(b.createdAt))
        || a.requestId.localeCompare(b.requestId));
  }

  async function queryHistory(filter = {}) {
    const decisions = await repository.listDecisions(filter);
    return decisions.sort((a, b) => String(a.requestId).localeCompare(String(b.requestId)) || a.seq - b.seq);
  }

  async function getAuditEvents(filter = {}) {
    return repository.listAuditEvents(filter);
  }

  return {
    repository,
    submitApprovalRequest,
    approve,
    reject,
    defer,
    expire,
    cancel,
    requestMoreEvidence,
    getRequest,
    queryPending,
    queryHistory,
    getAuditEvents,
  };
}
