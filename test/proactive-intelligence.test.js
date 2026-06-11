import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  EVENT_CATEGORIES,
  INBOX_STATUS,
  buildExecutiveDashboard,
  buildExecutiveInbox,
  buildMorningBriefing,
  detectSignificantEvents,
  runProactiveIntelligence,
  updateBriefingStatus,
} from '../lib/ai/proactive-intelligence/index.js';
import { clearInboxForTest } from '../lib/ai/proactive-intelligence/inbox-state.js';

function mockSnapshot() {
  return {
    platformHealth: {
      status: 'unhealthy',
      dependencyIssues: ['ai-copilot depends on memory-engine which is unhealthy'],
      engines: [
        { engineId: 'memory-engine', name: 'Memory Engine', status: 'unhealthy', optional: false, error: 'provider outage' },
        { engineId: 'club-intelligence', name: 'Club Intelligence', status: 'healthy', optional: true },
      ],
    },
    executiveDashboard: {
      summary: { healthScore: 52, headline: 'Health under threshold' },
      approvalQueue: { items: [{ id: 'approval-1' }] },
    },
    assistant: {
      observations: { source: 'live', confidence: 82, twinStatus: { healthScore: 52 } },
      summary: { total: 4, critical: 0, high: 3, medium: 1, low: 0 },
      recommendations: [
        {
          id: 'rec-1',
          type: 'COMMUNICATION_GAP',
          title: 'Marketing campaign outperforming expectations',
          reason: 'Open rates and member response are above normal.',
          urgency: 'HIGH',
          impact: 'HIGH',
          confidence: 81,
          riskIfIgnored: 'Opportunity momentum may fade.',
          timeSaved: 40,
          supportingData: { openRate: 0.44 },
          actions: [{ id: 'mission', label: 'Launch follow-up mission', actionId: 'SEND_NEWSLETTER' }],
        },
      ],
      automation: { autoCount: 1, approveCount: 4, humanCount: 3 },
      classified: { approve: [{ id: 'a' }], human: [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }] },
    },
  };
}

test('detectSignificantEvents creates ranked explainable executive briefings', () => {
  const briefings = detectSignificantEvents(mockSnapshot());
  assert.ok(briefings.length >= 4);
  assert.equal(briefings[0].category, EVENT_CATEGORIES.HIGH);
  assert.equal(briefings[0].requiresHumanApproval, true);
  assert.equal(briefings[0].autonomousExternalExecutionAllowed, false);
  assert.ok(briefings.every(b => b.headline && b.executiveSummary && b.whyThisMatters));
  assert.ok(briefings.every(b => Array.isArray(b.evidence)));
});

test('detectSignificantEvents deduplicates repeated signals', () => {
  const first = detectSignificantEvents(mockSnapshot());
  const second = detectSignificantEvents(mockSnapshot());
  assert.deepEqual(first.map(b => b.id), second.map(b => b.id));
  assert.equal(new Set(first.map(b => b.dedupeKey)).size, first.length);
});

test('Executive Inbox groups statuses and supports updates', () => {
  const stateFile = join(tmpdir(), `proactive-intel-${Date.now()}.jsonl`);
  clearInboxForTest(stateFile);

  const briefings = detectSignificantEvents(mockSnapshot()).slice(0, 2);
  const inbox = buildExecutiveInbox(briefings);
  assert.equal(inbox.unread.length, 2);

  const updated = updateBriefingStatus(briefings[0].id, INBOX_STATUS.ACKNOWLEDGED, { file: stateFile });
  assert.equal(updated.status, INBOX_STATUS.ACKNOWLEDGED);
});

test('Executive Dashboard exposes urgent, newest, owner, resolved, and trend views', () => {
  const briefings = detectSignificantEvents(mockSnapshot());
  const dashboard = buildExecutiveDashboard(briefings);
  assert.ok(Array.isArray(dashboard.mostUrgent));
  assert.ok(Array.isArray(dashboard.newest));
  assert.ok(Array.isArray(dashboard.highestImpact));
  assert.ok(Array.isArray(dashboard.awaitingOwner));
  assert.ok(Array.isArray(dashboard.resolved));
  assert.ok(Array.isArray(dashboard.trendOverTime));
});

test('Morning Briefing includes required CEO sections and approval guardrails', () => {
  const snapshot = mockSnapshot();
  const briefings = detectSignificantEvents(snapshot);
  const briefing = buildMorningBriefing(snapshot, briefings, []);
  assert.ok(briefing.companyHealth);
  assert.ok(briefing.biggestOpportunity);
  assert.ok(briefing.biggestRisk);
  assert.ok(briefing.aiWorkforceSummary);
  assert.ok(Array.isArray(briefing.requiredApprovals));
  assert.ok(briefing.predictedRevenueImpact);
  assert.ok(briefing.confidence >= 0);
  assert.equal(briefing.topThreeActions[0].requiresHumanApproval, true);
  assert.equal(briefing.topThreeActions[0].autonomousExternalExecutionAllowed, false);
});

test('runProactiveIntelligence can run against injected snapshots without executing actions', async () => {
  const stateFile = join(tmpdir(), `proactive-intel-run-${Date.now()}.jsonl`);
  clearInboxForTest(stateFile);

  const result = await runProactiveIntelligence({
    persist: true,
    stateFile,
    platformHealth: mockSnapshot().platformHealth,
    assistant: mockSnapshot().assistant,
    executiveDashboard: mockSnapshot().executiveDashboard,
  });

  assert.ok(result.briefings.length > 0);
  assert.ok(result.inbox.unread.length > 0);
  assert.ok(result.dashboard.awaitingOwner.length > 0);
  assert.equal(result.morningBriefing.explainability.note.includes('No autonomous external execution'), true);
});

