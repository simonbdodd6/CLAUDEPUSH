import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPROVAL_AUDIT_ACTIONS,
  APPROVAL_DECISION,
  APPROVAL_STATUS,
  POLICY_CODE,
  createApprovalPlatform,
} from '../lib/approval-platform/index.js';

const approver = { id: 'idn_approver_1', type: 'ADMINISTRATOR' };
const approver2 = { id: 'idn_approver_2', type: 'ADMINISTRATOR' };

function request(overrides = {}) {
  return {
    requestId: 'req_1',
    sourcePlatform: 'travel-action-candidate-engine',
    sourceEntity: { type: 'action_candidate', id: 'action_abc' },
    actionType: 'add_accommodation',
    priority: 'high',
    confidence: 0.8,
    evidenceRefs: [{ source: 'relationship', kind: 'relationships' }],
    summary: 'Add accommodation for trip',
    riskSignals: [],
    requestedBy: 'travel-action-candidate-engine',
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

test('submits an approval request as pending', async () => {
  const platform = createApprovalPlatform();
  const req = await platform.submitApprovalRequest(request());

  assert.equal(req.requestId, 'req_1');
  assert.equal(req.status, APPROVAL_STATUS.PENDING);
  assert.equal(req.approvalPolicy.requireManual, true);
  assert.equal(req.approvalPolicy.minApprovers, 1);

  const audit = await platform.getAuditEvents({ requestId: 'req_1' });
  assert.deepEqual(audit.map(a => a.action), [APPROVAL_AUDIT_ACTIONS.REQUEST_SUBMITTED]);

  await assert.rejects(() => platform.submitApprovalRequest(request()), err => err.code === 'DUPLICATE_REQUEST');
});

test('approves with a human actor and never auto-approves', async () => {
  const platform = createApprovalPlatform();
  await platform.submitApprovalRequest(request());

  await assert.rejects(() => platform.approve('req_1', null), err => err.code === 'PERMISSION_DENIED');

  const approved = await platform.approve('req_1', approver, { asOf: '2026-07-02T00:00:00.000Z' });
  assert.equal(approved.status, APPROVAL_STATUS.APPROVED);

  // Terminal -> no further decisions.
  await assert.rejects(() => platform.reject('req_1', approver), err => err.code === 'INVALID_TRANSITION');
});

test('rejects, defers, expires, cancels, and requests more evidence', async () => {
  const platform = createApprovalPlatform();

  await platform.submitApprovalRequest(request({ requestId: 'r_reject' }));
  assert.equal((await platform.reject('r_reject', approver, { reason: 'no' })).status, APPROVAL_STATUS.REJECTED);

  await platform.submitApprovalRequest(request({ requestId: 'r_defer' }));
  const deferred = await platform.defer('r_defer', approver, { reason: 'later' });
  assert.equal(deferred.status, APPROVAL_STATUS.DEFERRED);
  // Deferred is still actionable.
  assert.equal((await platform.approve('r_defer', approver)).status, APPROVAL_STATUS.APPROVED);

  await platform.submitApprovalRequest(request({ requestId: 'r_cancel' }));
  assert.equal((await platform.cancel('r_cancel', approver)).status, APPROVAL_STATUS.CANCELLED);

  await platform.submitApprovalRequest(request({ requestId: 'r_expire' }));
  assert.equal((await platform.expire('r_expire', approver, { asOf: '2026-07-05T00:00:00.000Z' })).status, APPROVAL_STATUS.EXPIRED);

  await platform.submitApprovalRequest(request({ requestId: 'r_evidence' }));
  const ne = await platform.requestMoreEvidence('r_evidence', approver, { note: 'need docs' });
  assert.equal(ne.status, APPROVAL_STATUS.NEEDS_MORE_EVIDENCE);
});

test('enforces evidence, confidence, and risk policies', async () => {
  const platform = createApprovalPlatform();

  await platform.submitApprovalRequest(request({ requestId: 'r_ev', evidenceRefs: [], approvalPolicy: { requireEvidence: true } }));
  await assert.rejects(() => platform.approve('r_ev', approver), err => err.code === POLICY_CODE.EVIDENCE_REQUIRED);

  await platform.submitApprovalRequest(request({ requestId: 'r_conf', confidence: 0.4, approvalPolicy: { minConfidence: 0.7 } }));
  await assert.rejects(() => platform.approve('r_conf', approver), err => err.code === POLICY_CODE.CONFIDENCE_BELOW_THRESHOLD);

  await platform.submitApprovalRequest(request({ requestId: 'r_risk', riskSignals: ['no_accommodation'], approvalPolicy: { blockedRiskSignals: ['no_accommodation'] } }));
  await assert.rejects(() => platform.approve('r_risk', approver), err => err.code === POLICY_CODE.RISK_BLOCKED);
});

test('two-person approval requires two distinct approvers', async () => {
  const platform = createApprovalPlatform();
  await platform.submitApprovalRequest(request({ requestId: 'r_2p', approvalPolicy: { minApprovers: 2 } }));

  const first = await platform.approve('r_2p', approver);
  assert.equal(first.status, APPROVAL_STATUS.PENDING); // one vote, not enough

  const sameAgain = await platform.approve('r_2p', approver);
  assert.equal(sameAgain.status, APPROVAL_STATUS.PENDING); // same actor doesn't count twice

  const second = await platform.approve('r_2p', approver2);
  assert.equal(second.status, APPROVAL_STATUS.APPROVED);

  const history = await platform.queryHistory({ requestId: 'r_2p' });
  assert.deepEqual(history.map(d => d.decision), [
    APPROVAL_DECISION.APPROVAL_RECORDED, APPROVAL_DECISION.APPROVAL_RECORDED, APPROVAL_DECISION.APPROVED,
  ]);
});

test('time expiry blocks approval after expiresAt', async () => {
  const platform = createApprovalPlatform();
  await platform.submitApprovalRequest(request({ requestId: 'r_exp', approvalPolicy: { expiresAt: '2026-07-10T00:00:00.000Z' } }));

  await assert.rejects(
    () => platform.approve('r_exp', approver, { asOf: '2026-07-11T00:00:00.000Z' }),
    err => err.code === POLICY_CODE.EXPIRED,
  );
  // The request is now expired (terminal).
  assert.equal((await platform.getRequest('r_exp')).status, APPROVAL_STATUS.EXPIRED);
});

test('queryPending returns only actionable requests, ranked by priority', async () => {
  const platform = createApprovalPlatform();
  await platform.submitApprovalRequest(request({ requestId: 'p_low', priority: 'low' }));
  await platform.submitApprovalRequest(request({ requestId: 'p_crit', priority: 'critical' }));
  await platform.submitApprovalRequest(request({ requestId: 'p_done' }));
  await platform.approve('p_done', approver);

  const pending = await platform.queryPending();
  assert.deepEqual(pending.map(r => r.requestId), ['p_crit', 'p_low']); // approved excluded, critical first
  const filtered = await platform.queryPending({ sourcePlatform: 'nope' });
  assert.equal(filtered.length, 0);
});

test('decision history is append-only and immutable', async () => {
  const platform = createApprovalPlatform();
  await platform.submitApprovalRequest(request({ requestId: 'r_imm' }));
  await platform.defer('r_imm', approver, { reason: 'later', asOf: '2026-07-02T00:00:00.000Z' });
  const afterDefer = await platform.queryHistory({ requestId: 'r_imm' });
  const firstDecisionSnapshot = JSON.stringify(afterDefer[0]);

  await platform.approve('r_imm', approver, { asOf: '2026-07-03T00:00:00.000Z' });
  const afterApprove = await platform.queryHistory({ requestId: 'r_imm' });

  assert.equal(afterApprove.length, 2); // history grew
  assert.equal(JSON.stringify(afterApprove[0]), firstDecisionSnapshot); // earlier record unchanged
  assert.deepEqual(afterApprove.map(d => d.seq), [1, 2]);
});

test('produces deterministic output for identical inputs and timestamps', async () => {
  async function run() {
    const platform = createApprovalPlatform();
    await platform.submitApprovalRequest(request({ requestId: 'r_det', createdAt: '2026-07-01T00:00:00.000Z' }));
    await platform.approve('r_det', approver, { asOf: '2026-07-02T00:00:00.000Z' });
    const req = await platform.getRequest('r_det');
    const history = await platform.queryHistory({ requestId: 'r_det' });
    return { req, history };
  }
  assert.deepEqual(await run(), await run());
});

test('validates required submission fields', async () => {
  const platform = createApprovalPlatform();
  await assert.rejects(() => platform.submitApprovalRequest(request({ requestId: '' })), /requestId is required/);
  await assert.rejects(() => platform.submitApprovalRequest(request({ sourcePlatform: '' })), /sourcePlatform is required/);
  await assert.rejects(() => platform.submitApprovalRequest(request({ actionType: '' })), /actionType is required/);
  await assert.rejects(() => platform.submitApprovalRequest(request({ requestedBy: '' })), /requestedBy is required/);
  await assert.rejects(() => platform.submitApprovalRequest(request({ confidence: 2 })), /confidence must be a number/);
  await assert.rejects(() => platform.approve('missing', approver), err => err.code === 'REQUEST_NOT_FOUND');
});
