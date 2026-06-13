// Executive Reasoning Layer — tests.
// Verifies the 10 deliverables compose correctly, that the layer is domain-agnostic
// (works unmodified for Coach's Eye AND Website Lead shapes), and that it never
// fabricates data (pure composition of provided signals).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createExecutiveReasoningPlatform,
  buildExecutiveExplanation,
  buildConfidence,
  buildEvidenceGraph,
  traverse,
  detectMissingEvidence,
  buildReasoningTrace,
  toExplainabilityPanel,
  normalizeReasoningInput,
  CONFIDENCE_BAND,
  DECISION_TIER,
} from '../lib/executive-reasoning/index.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────────

// A Coach's Eye recommendation (recommendation-engine shape) with calibration.
function coachRec(overrides = {}) {
  return {
    id: 'rec-attendance-1',
    type: 'recommendation',
    source: 'autonomous-assistant',
    subject: { title: 'Attendance declining for U16', summary: 'Average rate fell to 58%.' },
    createdAt: '2026-06-10T08:00:00.000Z',
    confidence: { value: 72, calibrated: true, originalValue: 60, sampleSize: 7, observedAccuracy: 71, trend: 'improving' },
    ranking: { score: 64, components: [
      { name: 'urgency', value: 75, weight: 0.40 },
      { name: 'impact', value: 60, weight: 0.25 },
      { name: 'confidence', value: 72, weight: 0.20 },
      { name: 'time_saved', value: 33, weight: 0.15 },
    ] },
    conditions: [
      { description: 'Average attendance below 65%', observed: '58%', met: true },
      { description: 'Decline sustained 2+ weeks', observed: '3 weeks', met: true },
    ],
    evidence: [
      { id: 'cit-1', engine: 'memory-engine', fact: 'U16 attendance 58% (last 3 weeks)', entityId: 'team-u16', field: 'attendance' },
      { id: 'cit-2', engine: 'data-integration', fact: '4 sessions ran in window' },
    ],
    links: [{ relation: 'teams', ref: 'team-u16', label: 'U16 Squad' }],
    assumptions: [{ statement: 'Current trend continues if no action is taken', basis: 'projection-engine' }],
    alternatives: [
      { rank: 2, title: 'Send fixture reminder', score: 58, reasonNotChosen: 'Lower impact than attendance review' },
    ],
    decision: { tier: DECISION_TIER.APPROVE, owner: 'coach', rationale: 'Confidence 72%, non-critical impact' },
    approval: { state: 'approved', approvalId: 'apr-9', reviewer: 'coach_simon', reviewedAt: '2026-06-11T09:00:00.000Z' },
    learningOutcome: { recorded: true, outcomeType: 'PREDICTION_CORRECT', outcomeId: 'out-3', recordedAt: '2026-06-12T09:00:00.000Z' },
    timelineEvents: [{ at: '2026-06-10T08:05:00.000Z', event: 'routed_to_approval', by: 'decision-engine' }],
    featureFlags: [{ key: 'autonomousAssistant', enabled: true }],
    dataQuality: {},
    ...overrides,
  };
}

// A Website Lead recommendation — a DIFFERENT domain, same layer, no code changes.
function leadRec(overrides = {}) {
  return {
    id: 'lead-club-42',
    type: 'lead',
    source: 'lead-personalisation',
    title: 'High-fit lead: Naas RFC',
    confidence: 81,                                  // bare number — normaliser handles it
    rankScore: 88,
    evidence: ['Squad size 240 players', 'No current video tool', 'Expressed interest at expo'],
    decision: { tier: DECISION_TIER.HUMAN },         // no owner → generic fallback
    dataQuality: { mock: true, mockFields: ['revenue'] },
    ...overrides,
  };
}

// ── Deliverable #1: Executive Explanation object ──────────────────────────────────

test('builds a complete ExecutiveExplanation with every required field', () => {
  const x = buildExecutiveExplanation(normalizeReasoningInput(coachRec()));
  for (const field of [
    'confidence', 'evidence', 'reasoning', 'assumptions', 'uncertainty',
    'missingInformation', 'alternatives', 'decisionOwner', 'approvalState',
    'featureFlags', 'timeline', 'provenance',
  ]) {
    assert.ok(field in x, `missing field: ${field}`);
  }
  assert.equal(x.schemaVersion, '1.0.0');
  assert.ok(x.id.startsWith('xpl-'));
  assert.equal(x.subjectId, 'rec-attendance-1');
});

// ── Deliverable #2: Reasoning Trace ───────────────────────────────────────────────

test('reasoning trace narrates conditions, confidence, ranking, decision (no model)', () => {
  const conf = buildConfidence(normalizeReasoningInput(coachRec()));
  const trace = buildReasoningTrace(normalizeReasoningInput(coachRec()), conf);
  const kinds = trace.steps.map(s => s.kind);
  assert.ok(kinds.includes('condition'));
  assert.ok(kinds.includes('confidence'));
  assert.ok(kinds.includes('ranking'));
  assert.ok(kinds.includes('decision'));
  assert.ok(trace.steps.every(s => typeof s.statement === 'string' && s.statement.length));
});

// ── Deliverable #3: Evidence Graph traversal ──────────────────────────────────────

test('evidence graph links subject → citations → entities, and traverse() reaches them', () => {
  const g = buildEvidenceGraph(normalizeReasoningInput(coachRec()));
  assert.equal(g.rootId, 'subject');
  assert.ok(g.stats.citations >= 2);
  assert.ok(g.stats.entities >= 1);                 // team-u16 from citation + link
  const reachable = traverse(g, 'subject').map(n => n.id);
  assert.ok(reachable.includes('cit-1'));
  assert.ok(reachable.includes('team-u16'));        // reached via citation edge
});

// ── Deliverable #4: Confidence calculation (composition, not recomputation) ────────

test('confidence is normalised from upstream value + calibration, never recomputed', () => {
  const conf = buildConfidence(normalizeReasoningInput(coachRec()));
  assert.equal(conf.value, 72);                     // exactly the upstream value
  assert.equal(conf.band, CONFIDENCE_BAND.MODERATE);
  assert.equal(conf.calibrated, true);
  assert.equal(conf.calibrationDelta, 12);          // 72 - 60, surfaced from provenance
  assert.equal(conf.factors.length, 4);
  assert.ok(conf.basis.includes('not recomputed'));
});

// ── Deliverable #5: Missing Evidence detector ─────────────────────────────────────

test('missing-evidence detects mock data and thin samples from real signals only', () => {
  const m = detectMissingEvidence(normalizeReasoningInput(leadRec()));
  assert.ok(m.gaps.some(g => g.field === 'real_data'));
  assert.ok(m.uncertaintyReasons.includes('mock_data'));

  const none = detectMissingEvidence(normalizeReasoningInput(coachRec()));
  assert.equal(none.gaps.length, 0);                // clean coach rec has no gaps
});

// ── Deliverable #7: Explainability panel data model ───────────────────────────────

test('panel projection is flat, ordered, UI-agnostic data', () => {
  const x = buildExecutiveExplanation(normalizeReasoningInput(coachRec()));
  const panel = toExplainabilityPanel(x);
  const ids = panel.sections.map(s => s.id);
  for (const id of ['confidence', 'reasoning', 'evidence', 'assumptions', 'uncertainty',
    'missing', 'alternatives', 'decision', 'approval', 'flags', 'timeline']) {
    assert.ok(ids.includes(id), `panel missing section: ${id}`);
  }
});

// ── Deliverable #8 + #9: Timeline + provenance ────────────────────────────────────

test('timeline is chronologically ordered and provenance traces origin', () => {
  const x = buildExecutiveExplanation(normalizeReasoningInput(coachRec()));
  const times = x.timeline.map(e => e.at).filter(Boolean).map(Date.parse);
  const sorted = [...times].sort((a, b) => a - b);
  assert.deepEqual(times, sorted);
  assert.ok(x.timeline.some(e => e.event === 'created'));
  assert.ok(x.timeline.some(e => e.event.startsWith('approval_')));
  assert.equal(x.provenance.origin, 'autonomous-assistant');
  assert.ok(x.provenance.evidenceSources.includes('memory-engine'));
});

// ── Deliverable #10: Human approval linkage ───────────────────────────────────────

test('approval linkage connects to the durable approval record', () => {
  const x = buildExecutiveExplanation(normalizeReasoningInput(coachRec()));
  assert.equal(x.approvalState.linked, true);
  assert.equal(x.approvalState.approvalId, 'apr-9');
  assert.equal(x.approvalState.reviewer, 'coach_simon');
});

// ── Decision owner falls back generically when domain omits it ─────────────────────

test('decision owner uses generic fallback when the domain supplies no role', () => {
  const x = buildExecutiveExplanation(normalizeReasoningInput(leadRec()));
  assert.equal(x.decisionOwner.tier, DECISION_TIER.HUMAN);
  assert.equal(x.decisionOwner.owner, 'human decision-maker');   // generic, not "coach"
});

// ── Cross-domain reuse guarantee ──────────────────────────────────────────────────

test('the SAME layer explains a Website Lead recommendation with no code changes', () => {
  const x = buildExecutiveExplanation(normalizeReasoningInput(leadRec()));
  assert.equal(x.type, 'lead');
  assert.equal(x.source, 'lead-personalisation');
  assert.equal(x.confidence.value, 81);             // bare-number confidence normalised
  assert.equal(x.evidence.stats.citations, 3);      // string evidence normalised to citations
  assert.ok(x.missingInformation.gaps.length > 0);  // mock revenue flagged
});

// ── Service factory: explain / record / panel / retrieval ─────────────────────────

test('service records explanations and retrieves them by subject', () => {
  const reasoning = createExecutiveReasoningPlatform();
  const x = reasoning.record(coachRec());
  assert.equal(reasoning.getById(x.id).id, x.id);
  assert.equal(reasoning.getBySubject('rec-attendance-1').id, x.id);
  assert.ok(reasoning.panel(x).sections.length > 0);
});

test('service mirrors to a durable sink without owning persistence', () => {
  const written = [];
  const reasoning = createExecutiveReasoningPlatform({ sink: { append: (r) => written.push(r) } });
  reasoning.record(coachRec());
  assert.equal(written.length, 1);
  assert.equal(written[0].kind, 'executive-explanation');
  assert.equal(written[0].subjectId, 'rec-attendance-1');
});

// ── Determinism + safety ──────────────────────────────────────────────────────────

test('explanation is deterministic given a fixed timestamp', () => {
  const a = buildExecutiveExplanation(normalizeReasoningInput(coachRec()), { now: '2026-06-13T00:00:00.000Z' });
  const b = buildExecutiveExplanation(normalizeReasoningInput(coachRec()), { now: '2026-06-13T00:00:00.000Z' });
  // Ids differ (uuid) but the composed content is identical.
  const strip = (x) => { const { id, ...rest } = x; return rest; };
  assert.deepEqual(strip(a), strip(b));
});

test('never throws on empty/malformed input — degrades safely', () => {
  for (const bad of [{}, { confidence: null }, { evidence: 'nope' }, { id: 'x' }]) {
    const x = buildExecutiveExplanation(normalizeReasoningInput(bad));
    assert.ok(x.confidence);
    assert.ok(Array.isArray(x.timeline));
  }
});
