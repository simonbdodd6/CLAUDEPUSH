// Universal Approval Platform (M18).
//
// The first platform capability shared across every product (Travel, Coach's
// Eye, Website Lead Agent, Executive, Wedding, Hospitality, ...). It owns
// approval workflows and NOTHING else. It is deterministic, never executes
// actions, and NEVER auto-approves — an approval only happens when a human
// actor calls approve().

export const APPROVAL_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  DEFERRED: 'deferred',
  CANCELLED: 'cancelled',
  NEEDS_MORE_EVIDENCE: 'needs_more_evidence',
});

// Terminal states accept no further decisions.
export const TERMINAL_STATUSES = Object.freeze([
  APPROVAL_STATUS.APPROVED,
  APPROVAL_STATUS.REJECTED,
  APPROVAL_STATUS.EXPIRED,
  APPROVAL_STATUS.CANCELLED,
]);

// States from which a request can still be acted on.
export const ACTIONABLE_STATUSES = Object.freeze([
  APPROVAL_STATUS.PENDING,
  APPROVAL_STATUS.DEFERRED,
  APPROVAL_STATUS.NEEDS_MORE_EVIDENCE,
]);

// Decision-log entry types. The six headline decisions plus an internal
// vote-recorded entry used for two-person approval.
export const APPROVAL_DECISION = Object.freeze({
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  DEFERRED: 'deferred',
  CANCELLED: 'cancelled',
  NEEDS_MORE_EVIDENCE: 'needs_more_evidence',
  APPROVAL_RECORDED: 'approval_recorded', // a single approver's vote (pre-threshold)
});

export const APPROVAL_AUDIT_ACTIONS = Object.freeze({
  REQUEST_SUBMITTED: 'REQUEST_SUBMITTED',
  APPROVAL_RECORDED: 'APPROVAL_RECORDED',
  REQUEST_APPROVED: 'REQUEST_APPROVED',
  REQUEST_REJECTED: 'REQUEST_REJECTED',
  REQUEST_DEFERRED: 'REQUEST_DEFERRED',
  REQUEST_EXPIRED: 'REQUEST_EXPIRED',
  REQUEST_CANCELLED: 'REQUEST_CANCELLED',
  MORE_EVIDENCE_REQUESTED: 'MORE_EVIDENCE_REQUESTED',
});

export const PRIORITY_RANK = Object.freeze({ low: 1, medium: 2, high: 3, critical: 4 });

// Policy codes returned when a policy blocks an approval.
export const POLICY_CODE = Object.freeze({
  EXPIRED: 'POLICY_EXPIRED',
  EVIDENCE_REQUIRED: 'POLICY_EVIDENCE_REQUIRED',
  CONFIDENCE_BELOW_THRESHOLD: 'POLICY_CONFIDENCE_BELOW_THRESHOLD',
  RISK_BLOCKED: 'POLICY_RISK_BLOCKED',
});

// Default policy. Auto-approval is NEVER available — `requireManual` is always
// true and there is no code path that approves without a human approve() call.
export const DEFAULT_APPROVAL_POLICY = Object.freeze({
  requireManual: true,
  minConfidence: null, // require request.confidence >= this to allow approval
  requireEvidence: false, // approval blocked if evidenceRefs is empty
  blockedRiskSignals: [], // approval blocked if any of these risk signals is present
  minApprovers: 1, // 2 = two-person approval
  expiresAt: null, // ISO timestamp after which the request may not be approved
});
