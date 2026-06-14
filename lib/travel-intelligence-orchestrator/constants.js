// Travel Intelligence Orchestrator (M19).
//
// A thin, deterministic INTEGRATION layer. It connects the already-built chain
// (context → insight → action-candidate, encapsulated by the M17 engine) to the
// Universal Approval Platform (M18) by routing approval-required candidates into
// approval requests. It composes everything through INJECTED PORTS only, owns no
// data, executes nothing, and uses no AI.

export const ORCHESTRATOR_SOURCE_PLATFORM = 'travel-action-candidate-engine';
export const ORCHESTRATOR_REQUESTED_BY = 'travel-intelligence-orchestrator';

// Prefix for the deterministic, idempotent approval requestId derived from a
// candidate's stable cooldownKey (which excludes context version).
export const REQUEST_ID_PREFIX = 'req';

export const ROUTE_OUTCOME = Object.freeze({
  SUBMITTED: 'submitted', // a new approval request was created
  SKIPPED_EXISTING: 'skipped_existing', // an approval request already existed (idempotent)
});

// Entity type used when referencing the source candidate in an approval request.
export const ACTION_CANDIDATE_ENTITY_TYPE = 'action_candidate';
