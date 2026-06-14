# Universal Approval Platform

The first shared platform capability across every product (Milestone M18).

## Purpose

This platform owns **approval workflows — and nothing else**. It is no longer a
travel-only module: Travel Intelligence, Coach's Eye Intelligence, the Website
Lead Agent, Executive Intelligence, Wedding Intelligence, Hospitality
Intelligence, and future products all submit approval requests here.

Every platform may produce action candidates, approval requests, or decision
requests. **Nothing executes directly — everything passes through Approval.**

## Approval philosophy

- **Deterministic.** No AI, no randomness, no wall-clock in compared output
  (timestamps may be supplied for reproducibility).
- **Never auto-approves.** There is no code path that approves a request without
  a human `approve()` call. `requireManual` is always on and cannot be configured
  away. The platform **never executes** the underlying action — it only records
  the decision.
- **Append-only, immutable history.** Every decision and audit event is appended
  and never rewritten. The request's `status` is a current-state projection; the
  decision log is the immutable record.

## Input — an approval request

Any platform submits:

`requestId` (caller-supplied, idempotent), `sourcePlatform`, `sourceEntity`,
`actionType`, `priority`, `confidence`, `evidenceRefs`, `summary`, `riskSignals`,
`approvalPolicy`, `requestedBy`, `createdFrom`.

## Output — a decision

`approved`, `rejected`, `expired`, `deferred`, `cancelled`, `needsMoreEvidence`.
Requests start `pending`; `approved`/`rejected`/`expired`/`cancelled` are
terminal; `deferred`/`needs_more_evidence` remain actionable.

## Policies (configurable per request)

- **Always manual / auto-approve never** — structural; always enforced.
- **Confidence threshold** — `minConfidence`; approval blocked below it.
- **Risk threshold** — `blockedRiskSignals`; approval blocked if present.
- **Evidence requirements** — `requireEvidence`; approval blocked without evidence.
- **Two-person approval** — `minApprovers: 2`; status becomes `approved` only once
  two *distinct* actors have approved (votes recorded in between, history intact).
- **Time expiry** — `expiresAt`; approving at/after it expires the request
  (checked against a supplied `asOf`, keeping it deterministic).

## Service API

`createApprovalPlatform({ repository?, defaultPolicy? })` →
`submitApprovalRequest`, `approve`, `reject`, `defer`, `expire`, `cancel`,
`requestMoreEvidence`, `queryPending`, `queryHistory`, `getRequest`,
`getAuditEvents`.

The repository is dumb (request projection + append-only decision and audit
logs); all policy, transition, and two-person logic lives in the service.

## Relationship with AI

AI never approves anything. AI (and the deterministic insight/action-candidate
engines) may *produce* requests and *summarise* them, but the decision is always
a recorded human action routed through this platform. Any future AI reasoning
sits upstream (producing candidates) or alongside (explaining), never in the
approve path.

## Relationship with notifications

This platform does not send notifications. A notification engine consumes pending
approval requests (`queryPending`) and surfaces them to approvers; the approver's
response comes back as `approve()`/`reject()`/etc. Notifications are delivery;
Approval is the decision system of record.

## Future consumers

Eventually this approves booking actions, travel recommendations, Coach's Eye
selections, website changes, business decisions, executive approvals — every
consequential action across every product, with one immutable decision trail.
