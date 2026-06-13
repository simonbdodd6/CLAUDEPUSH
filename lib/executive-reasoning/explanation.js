// Executive Reasoning — the Executive Explanation object + panel projection.
//
// This is the composition root. It takes a normalized ReasoningInput and assembles
// the universal ExecutiveExplanation: confidence, evidence graph, reasoning chain,
// assumptions, uncertainty, missing information, alternatives, decision owner,
// approval state, feature flags, timeline and provenance.
//
// Every field is COMPOSED from inputs the platform already produced. No engine is
// called, no model is invoked, nothing is recomputed.

import { randomUUID } from 'crypto';
import { EXPLANATION_SCHEMA_VERSION, DEFAULT_OWNER_BY_TIER, bandFor } from './constants.js';
import { buildConfidence } from './confidence.js';
import { buildEvidenceGraph } from './evidence-graph.js';
import { detectMissingEvidence } from './missing-evidence.js';
import { buildReasoningTrace } from './reasoning-trace.js';
import { buildTimeline, buildProvenance, buildApprovalLinkage } from './timeline.js';

/**
 * Compose an ExecutiveExplanation from a normalized ReasoningInput.
 * @param {object} input
 * @param {object} [context]  { generatedBy?, now? }  now is an ISO string for determinism
 * @returns {object} ExecutiveExplanation
 */
export function buildExecutiveExplanation(input = {}, context = {}) {
  const confidence = buildConfidence(input);
  const evidence   = buildEvidenceGraph(input);
  const missing    = detectMissingEvidence(input);
  const reasoning  = buildReasoningTrace(input, confidence);
  const timeline   = buildTimeline(input);
  const provenance = buildProvenance(input);
  const approval   = buildApprovalLinkage(input);

  const uncertainty = buildUncertainty(confidence, missing);
  const decisionOwner = buildDecisionOwner(input);
  const alternatives = (input.alternatives ?? []).map((a, i) => ({
    rank:            a.rank ?? i + 2,           // the subject itself is rank 1
    title:           a.title ?? a.subject?.title ?? `alternative ${i + 1}`,
    score:           Number.isFinite(a.score) ? a.score : null,
    reasonNotChosen: a.reasonNotChosen ?? a.reason ?? null,
  }));

  const featureFlags = (input.featureFlags ?? []).map(f => ({
    key: f.key, enabled: Boolean(f.enabled),
  }));

  return {
    schemaVersion: EXPLANATION_SCHEMA_VERSION,
    id:        `xpl-${randomUUID()}`,
    subjectId: input.id ?? null,
    type:      input.type ?? 'recommendation',
    source:    input.source ?? null,
    headline:  buildHeadline(input, confidence),

    confidence,
    evidence,
    reasoning,
    assumptions: (input.assumptions ?? []).map(a => ({
      statement:   a.statement ?? String(a),
      basis:       a.basis ?? null,
      sensitivity: a.sensitivity ?? null,
    })),
    uncertainty,
    missingInformation: missing,
    alternatives,
    decisionOwner,
    approvalState: approval,
    featureFlags,
    timeline,
    provenance,

    generatedAt: context.now ?? new Date().toISOString(),
    generatedBy: context.generatedBy ?? 'executive-reasoning',
  };
}

function buildHeadline(input, confidence) {
  const title = input.subject?.title ?? input.id ?? 'Recommendation';
  return `${title} — ${confidence.value}% confidence (${confidence.band}).`;
}

function buildUncertainty(confidence, missing) {
  const reasons = new Set(missing.uncertaintyReasons ?? []);
  if (confidence.band === 'low' || confidence.band === 'very_low') reasons.add('low_confidence');
  return {
    band: confidence.band,
    confidenceValue: confidence.value,
    reasons: [...reasons],
    sampleSize: confidence.sampleSize,
    // A transparent qualitative width — NOT a statistical interval. Wider when the
    // value is low, the sample is thin, or evidence is missing/mock.
    qualitativeRange: qualitativeRange(confidence, missing),
  };
}

function qualitativeRange(confidence, missing) {
  let spread = confidence.band === 'high' ? 8 : confidence.band === 'moderate' ? 14 : 22;
  if (Number.isFinite(confidence.sampleSize) && confidence.sampleSize < 3) spread += 8;
  if (missing.impact === 'major' || missing.impact === 'critical') spread += 8;
  const lo = Math.max(0, confidence.value - spread);
  const hi = Math.min(100, confidence.value + spread);
  return { low: lo, high: hi, spread, note: 'Qualitative, presentation-only — not a statistical confidence interval.' };
}

function buildDecisionOwner(input) {
  const tier = input.decision?.tier ?? null;
  const owner = input.decision?.owner ?? (tier ? DEFAULT_OWNER_BY_TIER[tier] : null) ?? null;
  return {
    owner,
    tier,
    rationale: input.decision?.rationale ?? null,
  };
}

/**
 * Project an ExecutiveExplanation into a flat, UI-agnostic panel data model (#7).
 * Returns ordered sections of { id, title, items } — purely data, no rendering.
 */
export function toExplainabilityPanel(explanation) {
  const x = explanation;
  return {
    schemaVersion: x.schemaVersion,
    subjectId: x.subjectId,
    headline: x.headline,
    sections: [
      {
        id: 'confidence', title: 'Confidence',
        items: [
          { label: 'Value', value: `${x.confidence.value}%` },
          { label: 'Band', value: x.confidence.band },
          ...(x.confidence.calibrated ? [{ label: 'Calibration', value: `${x.confidence.calibrationDelta >= 0 ? '+' : ''}${x.confidence.calibrationDelta} pts from ${x.confidence.originalValue}%` }] : []),
          ...x.confidence.factors.map(f => ({ label: f.name, value: f.contribution, meta: f.direction })),
        ],
      },
      {
        id: 'reasoning', title: 'Reasoning',
        items: x.reasoning.steps.map(s => ({ label: `${s.step}. ${s.kind}`, value: s.statement })),
      },
      {
        id: 'evidence', title: 'Evidence',
        items: x.evidence.evidenceForSubject.map(n => ({ label: n.kind, value: n.label, meta: n.isMock ? 'mock' : (n.source ?? null) })),
      },
      {
        id: 'assumptions', title: 'Assumptions',
        items: x.assumptions.map(a => ({ label: 'assumes', value: a.statement, meta: a.basis })),
      },
      {
        id: 'uncertainty', title: 'Uncertainty',
        items: [
          { label: 'Range', value: `${x.uncertainty.qualitativeRange.low}–${x.uncertainty.qualitativeRange.high}%` },
          ...x.uncertainty.reasons.map(r => ({ label: 'reason', value: r })),
        ],
      },
      {
        id: 'missing', title: 'Missing information',
        items: x.missingInformation.gaps.map(g => ({ label: g.impact, value: g.reason, meta: g.field })),
      },
      {
        id: 'alternatives', title: 'Alternatives considered',
        items: x.alternatives.map(a => ({ label: `#${a.rank}`, value: a.title, meta: a.reasonNotChosen })),
      },
      {
        id: 'decision', title: 'Decision owner',
        items: [
          { label: 'Owner', value: x.decisionOwner.owner },
          { label: 'Tier', value: x.decisionOwner.tier },
        ],
      },
      {
        id: 'approval', title: 'Approval',
        items: [
          { label: 'State', value: x.approvalState.state ?? 'none' },
          ...(x.approvalState.reviewer ? [{ label: 'Reviewer', value: x.approvalState.reviewer }] : []),
        ],
      },
      {
        id: 'flags', title: 'Feature flags',
        items: x.featureFlags.map(f => ({ label: f.key, value: f.enabled ? 'on' : 'off' })),
      },
      {
        id: 'timeline', title: 'Timeline',
        items: x.timeline.map(e => ({ label: e.event, value: e.at ?? '—', meta: e.by })),
      },
    ],
  };
}
