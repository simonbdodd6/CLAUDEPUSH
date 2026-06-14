import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentityPlatform } from '../lib/identity-platform/index.js';
import { IdentityPlatformSourceAdapter, createTravellerIdentityPlatform } from '../lib/traveller-identity-platform/index.js';
import { createTravelTimelinePlatform } from '../lib/travel-timeline-platform/index.js';
import { createTravelRelationshipGraph } from '../lib/travel-relationship-graph/index.js';
import { createTravelMemoryPlatform } from '../lib/travel-memory-platform/index.js';
import { createTravellerPreferencesPlatform } from '../lib/traveller-preferences-platform/index.js';
import { createCompanionDiscoveryPlatform } from '../lib/companion-discovery-platform/index.js';
import { createTravelIntelligenceContext } from '../lib/travel-intelligence-context/index.js';
import { createTravelInsightEngine } from '../lib/travel-insight-engine/index.js';
import { createTravelActionCandidateEngine } from '../lib/travel-action-candidate-engine/index.js';
import { createApprovalPlatform, APPROVAL_STATUS } from '../lib/approval-platform/index.js';
import { ROUTE_OUTCOME, createTravelIntelligenceOrchestrator } from '../lib/travel-intelligence-orchestrator/index.js';

// Wire the entire chain M10/M12/M13/M8/prefs/discovery → M15 → M16 → M17 → M18 → M19.
async function buildFullStack() {
  const identityPlatform = createIdentityPlatform();
  const travellerIdentityPlatform = createTravellerIdentityPlatform({ identitySource: new IdentityPlatformSourceAdapter({ identityPlatform }) });
  const travelTimelinePlatform = createTravelTimelinePlatform();
  const travelRelationshipGraph = createTravelRelationshipGraph();
  const travelMemoryPlatform = createTravelMemoryPlatform();
  const travellerPreferencesPlatform = createTravellerPreferencesPlatform();
  const companionDiscoveryPlatform = createCompanionDiscoveryPlatform();

  const identity = await identityPlatform.createIdentity({ type: 'PERSON', roles: ['TRAVELLER'], publicProfile: { displayName: 'Mei', country: 'JP' } });
  const id = identity.id;
  // No timeline/graph/memory/prefs data -> empty context -> gap candidates
  // including high-impact (review_safety_gap, add_accommodation, create_itinerary)
  // which carry approvalRequired: true.

  const ctx = createTravelIntelligenceContext({
    travellerIdentityPlatform, travelTimelinePlatform, travelRelationshipGraph,
    travelMemoryPlatform, travellerPreferencesPlatform, companionDiscoveryPlatform,
  });
  const insightEngine = createTravelInsightEngine({ travelIntelligenceContext: ctx });
  const actionEngine = createTravelActionCandidateEngine({ travelInsightEngine: insightEngine });
  const approvalPlatform = createApprovalPlatform();
  const orchestrator = createTravelIntelligenceOrchestrator({ travelActionCandidateEngine: actionEngine, approvalPlatform });

  return { id, actionEngine, approvalPlatform, orchestrator };
}

test('generates candidates and routes approval-required ones into approval', async () => {
  const { id, approvalPlatform, orchestrator } = await buildFullStack();
  const { candidates, approvalRequests } = await orchestrator.generateAndRoute(id);

  assert.ok(candidates.length > 0);
  // Only approvalRequired candidates are routed.
  const requiredCount = candidates.filter(c => c.approvalRequired).length;
  assert.ok(requiredCount > 0);
  assert.equal(approvalRequests.length, requiredCount);
  assert.ok(approvalRequests.every(r => r.outcome === ROUTE_OUTCOME.SUBMITTED));

  // The approval platform now holds those requests, pending human decision.
  const pending = await approvalPlatform.queryPending();
  assert.equal(pending.length, requiredCount);
  assert.ok(pending.every(r => r.status === APPROVAL_STATUS.PENDING));
  assert.ok(pending.every(r => r.sourcePlatform === 'travel-action-candidate-engine'));
});

test('is idempotent: re-running skips already-submitted requests', async () => {
  const { id, approvalPlatform, orchestrator } = await buildFullStack();
  const first = await orchestrator.generateAndRoute(id);
  const second = await orchestrator.generateAndRoute(id);

  assert.ok(first.approvalRequests.every(r => r.outcome === ROUTE_OUTCOME.SUBMITTED));
  assert.ok(second.approvalRequests.every(r => r.outcome === ROUTE_OUTCOME.SKIPPED_EXISTING));
  // No duplicates created.
  const pendingAfter = await approvalPlatform.queryPending();
  assert.equal(pendingAfter.length, first.approvalRequests.length);
  // Same requestIds both runs (stable derivation).
  assert.deepEqual(first.approvalRequests.map(r => r.requestId).sort(), second.approvalRequests.map(r => r.requestId).sort());
});

test('approval requests reference the candidate and carry its evidence', async () => {
  const { id, approvalPlatform, orchestrator } = await buildFullStack();
  const { candidates } = await orchestrator.generateAndRoute(id);
  const routedCandidate = candidates.find(c => c.approvalRequired);

  const requestId = orchestrator.buildApprovalRequestFromCandidate(routedCandidate).requestId;
  const stored = await approvalPlatform.getRequest(requestId);
  assert.equal(stored.sourceEntity.type, 'action_candidate');
  assert.equal(stored.sourceEntity.id, routedCandidate.actionCandidateId);
  assert.equal(stored.actionType, routedCandidate.candidateType);
  assert.equal(stored.createdFrom.actionCandidateId, routedCandidate.actionCandidateId);
});

test('orchestrator never approves or executes — requests stay pending', async () => {
  const { id, approvalPlatform, orchestrator } = await buildFullStack();
  await orchestrator.generateAndRoute(id);
  const pending = await approvalPlatform.queryPending();
  assert.ok(pending.length > 0);
  assert.ok(pending.every(r => r.status === APPROVAL_STATUS.PENDING)); // nothing auto-approved
  // History contains only submissions, no decisions.
  const history = await approvalPlatform.queryHistory();
  assert.equal(history.length, 0);
});

test('buildApprovalRequestFromCandidate is a pure deterministic mapping', async () => {
  const { id, orchestrator } = await buildFullStack();
  const { candidates } = await orchestrator.generateAndRoute(id);
  const c = candidates.find(x => x.approvalRequired);
  const a = orchestrator.buildApprovalRequestFromCandidate(c);
  const b = orchestrator.buildApprovalRequestFromCandidate(c);
  assert.deepEqual(a, b);
  assert.ok(a.requestId.startsWith('req_'));
  assert.equal(a.requestedBy, 'travel-intelligence-orchestrator');
});

test('requestId is stable across context refreshes (derived from cooldownKey)', async () => {
  const { id, orchestrator } = await buildFullStack();
  const stack2 = await buildFullStack();
  // Different traveller ids -> different requestIds; same candidate cooldownKey shape.
  const c1 = (await orchestrator.generateAndRoute(id)).candidates.find(c => c.approvalRequired);
  const reqId = orchestrator.buildApprovalRequestFromCandidate(c1).requestId;
  // Re-derive from the same candidate -> identical.
  assert.equal(orchestrator.buildApprovalRequestFromCandidate(c1).requestId, reqId);
  // A different traveller's same-type candidate derives a different id.
  const c2 = (await stack2.orchestrator.generateAndRoute(stack2.id)).candidates.find(c => c.approvalRequired && c.candidateType === c1.candidateType);
  assert.notEqual(stack2.orchestrator.buildApprovalRequestFromCandidate(c2).requestId, reqId);
});

test('routeCandidates routes a supplied list and ignores non-required', async () => {
  const { approvalPlatform, orchestrator } = await buildFullStack();
  const candidates = [
    { actionCandidateId: 'action_x', candidateType: 'review_safety_gap', priority: 'high', confidence: 0.5, approvalRequired: true, cooldownKey: 'cooldown:idn_z:review_safety_gap:emergency', evidenceRefs: [], riskSignals: [], sourceInsightIds: ['insight_x'], sourceContextVersion: 'ctxv1:zzzz' },
    { actionCandidateId: 'action_y', candidateType: 'improve_context_quality', priority: 'low', confidence: 0.5, approvalRequired: false, cooldownKey: 'cooldown:idn_z:improve_context_quality:x', evidenceRefs: [], riskSignals: [], sourceInsightIds: ['insight_y'], sourceContextVersion: 'ctxv1:zzzz' },
  ];
  const routed = await orchestrator.routeCandidates(candidates);
  assert.equal(routed.length, 1);
  assert.equal(routed[0].actionCandidateId, 'action_x');
  assert.equal((await approvalPlatform.queryPending()).length, 1);
});

test('validates construction and inputs', async () => {
  const { actionEngine, approvalPlatform } = await buildFullStack();
  assert.throws(() => createTravelIntelligenceOrchestrator({}), err => err.code === 'CONFIGURATION_ERROR');
  assert.throws(() => createTravelIntelligenceOrchestrator({ travelActionCandidateEngine: actionEngine }), err => err.code === 'CONFIGURATION_ERROR');
  const orch = createTravelIntelligenceOrchestrator({ travelActionCandidateEngine: actionEngine, approvalPlatform });
  await assert.rejects(() => orch.routeCandidates(null), err => err.code === 'VALIDATION_FAILED');
  assert.throws(() => orch.buildApprovalRequestFromCandidate({}), err => err.code === 'VALIDATION_FAILED');
});
