import { createHash } from 'crypto';
import {
  ACTION_CANDIDATE_ENTITY_TYPE,
  ORCHESTRATOR_REQUESTED_BY,
  ORCHESTRATOR_SOURCE_PLATFORM,
  REQUEST_ID_PREFIX,
  ROUTE_OUTCOME,
} from './constants.js';
import { configurationError, validationError } from './errors.js';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw validationError(`${field} is required`, { field });
  return value.trim();
}

// Deterministic, idempotent request id derived from the candidate's stable
// cooldownKey (which excludes context version), so re-runs across context
// refreshes map to the SAME approval request.
function deriveRequestId(candidate) {
  const seed = candidate.cooldownKey ?? `fallback:${candidate.travellerIdentityId}:${candidate.actionCandidateId}`;
  return `${REQUEST_ID_PREFIX}_${createHash('sha256').update(seed).digest('hex').slice(0, 16)}`;
}

export function createTravelIntelligenceOrchestrator(options = {}) {
  const travelActionCandidateEngine = options.travelActionCandidateEngine;
  if (!travelActionCandidateEngine || typeof travelActionCandidateEngine.generateTravellerActionCandidates !== 'function') {
    throw configurationError('createTravelIntelligenceOrchestrator requires a travelActionCandidateEngine with generateTravellerActionCandidates()');
  }
  const approvalPlatform = options.approvalPlatform;
  if (!approvalPlatform
    || typeof approvalPlatform.submitApprovalRequest !== 'function'
    || typeof approvalPlatform.getRequest !== 'function') {
    throw configurationError('createTravelIntelligenceOrchestrator requires an approvalPlatform with submitApprovalRequest() and getRequest()');
  }

  /**
   * Pure mapping: candidate -> approval-request payload. No side effects.
   * The approval request references the candidate (reference-only) and carries
   * its evidence/risk so the decision is explainable.
   */
  function buildApprovalRequestFromCandidate(candidate, viewOptions = {}) {
    if (!candidate || typeof candidate !== 'object' || typeof candidate.actionCandidateId !== 'string') {
      throw validationError('candidate must be an action candidate object');
    }
    const requestId = deriveRequestId(candidate);
    const payload = {
      requestId,
      sourcePlatform: ORCHESTRATOR_SOURCE_PLATFORM,
      sourceEntity: { type: ACTION_CANDIDATE_ENTITY_TYPE, id: candidate.actionCandidateId },
      actionType: candidate.candidateType,
      priority: candidate.priority,
      confidence: candidate.confidence ?? null,
      evidenceRefs: clone(candidate.evidenceRefs ?? []),
      summary: candidate.summary ?? '',
      riskSignals: clone(candidate.riskSignals ?? []),
      requestedBy: ORCHESTRATOR_REQUESTED_BY,
      createdFrom: {
        actionCandidateId: candidate.actionCandidateId,
        sourceInsightIds: clone(candidate.sourceInsightIds ?? []),
        sourceContextVersion: candidate.sourceContextVersion ?? null,
      },
    };
    // Policy is the approval platform's concern; allow an optional caller hook.
    if (typeof viewOptions.approvalPolicyFor === 'function') {
      const policy = viewOptions.approvalPolicyFor(candidate);
      if (policy) payload.approvalPolicy = policy;
    }
    return payload;
  }

  async function getExistingRequest(requestId) {
    try {
      return await approvalPlatform.getRequest(requestId);
    } catch (error) {
      if (error && error.code === 'REQUEST_NOT_FOUND') return null;
      throw error;
    }
  }

  /**
   * Route a list of candidates into the approval platform. Only candidates with
   * approvalRequired === true are routed. Idempotent: a candidate whose derived
   * requestId already exists is skipped, not re-submitted.
   */
  async function routeCandidates(candidates, viewOptions = {}) {
    if (!Array.isArray(candidates)) throw validationError('candidates must be an array');
    const approvalRequests = [];
    for (const candidate of candidates) {
      if (candidate.approvalRequired !== true) continue;
      const payload = buildApprovalRequestFromCandidate(candidate, viewOptions);
      const existing = await getExistingRequest(payload.requestId);
      if (existing) {
        approvalRequests.push({
          requestId: payload.requestId,
          actionCandidateId: candidate.actionCandidateId,
          candidateType: candidate.candidateType,
          priority: candidate.priority,
          outcome: ROUTE_OUTCOME.SKIPPED_EXISTING,
          existingStatus: existing.status,
        });
        continue;
      }
      await approvalPlatform.submitApprovalRequest(payload);
      approvalRequests.push({
        requestId: payload.requestId,
        actionCandidateId: candidate.actionCandidateId,
        candidateType: candidate.candidateType,
        priority: candidate.priority,
        outcome: ROUTE_OUTCOME.SUBMITTED,
      });
    }
    return approvalRequests;
  }

  /**
   * The integration entry point. Generates action candidates for a traveller
   * (the M17 engine encapsulates context → insight → action-candidate) and
   * routes the approval-required ones into the Universal Approval Platform.
   * Returns the full candidate list plus a deterministic routing summary.
   * Never approves or executes anything.
   */
  async function generateAndRoute(travellerIdentityId, viewOptions = {}) {
    const id = assertNonEmptyString(travellerIdentityId, 'travellerIdentityId');
    const candidates = await travelActionCandidateEngine.generateTravellerActionCandidates(id, viewOptions.candidateOptions ?? {});
    const approvalRequests = await routeCandidates(candidates, viewOptions);
    return { candidates, approvalRequests };
  }

  return {
    generateAndRoute,
    routeCandidates,
    buildApprovalRequestFromCandidate,
  };
}
