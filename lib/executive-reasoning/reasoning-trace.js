// Executive Reasoning — reasoning trace.
//
// Composes a step-by-step, human-inspectable trace of WHY a conclusion exists,
// using only structured signals the platform already produced:
//   • the conditions a detector evaluated (observed vs threshold),
//   • the ranking factors and their contributions,
//   • whether the learning engine adjusted confidence,
//   • how the decision was classified (AUTO / APPROVE / HUMAN),
//   • the current approval state.
//
// It performs NO new inference and calls NO model. It narrates existing facts.

import { DECISION_TIER } from './constants.js';

/**
 * @param {object} input  normalized ReasoningInput
 * @param {object} confidence  output of buildConfidence()
 * @returns {object} { steps:[{ step, kind, statement, detail }], summary }
 */
export function buildReasoningTrace(input = {}, confidence = {}) {
  const steps = [];
  let n = 0;
  const add = (kind, statement, detail) => steps.push({ step: ++n, kind, statement, detail: detail ?? null });

  // 1. What triggered it — the evaluated conditions.
  const conditions = input.conditions ?? [];
  if (conditions.length) {
    for (const c of conditions) {
      const met = c.met === true ? 'met' : c.met === false ? 'not met' : 'evaluated';
      add('condition',
        `${c.description ?? 'Condition'} — ${met}.`,
        c.observed != null ? { observed: c.observed } : null);
    }
  } else {
    add('trigger', `Raised by ${input.source ?? 'an engine'}: ${input.subject?.title ?? input.id ?? 'item'}.`);
  }

  // 2. The confidence and how it was reached.
  if (Number.isFinite(confidence.value)) {
    if (confidence.calibrated && Number.isFinite(confidence.calibrationDelta)) {
      const dir = confidence.calibrationDelta >= 0 ? 'raised' : 'lowered';
      add('confidence',
        `Confidence ${confidence.value}% (${confidence.band}) — learning engine ${dir} it by ${Math.abs(confidence.calibrationDelta)} pts from ${confidence.originalValue}% based on ${confidence.sampleSize ?? 'prior'} outcome(s).`);
    } else {
      add('confidence', `Confidence ${confidence.value}% (${confidence.band}), as reported by the originating engine.`);
    }
  }

  // 3. The ranking factors, strongest first.
  const factors = (confidence.factors ?? []).filter(f => Number.isFinite(f.contribution));
  if (factors.length) {
    const sorted = [...factors].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    add('ranking',
      `Ranked by ${sorted.length} weighted factor(s); strongest: ${sorted[0].name} (${sorted[0].contribution}).`,
      { factors: sorted });
  }

  // 4. Assumptions actually in play.
  for (const a of input.assumptions ?? []) {
    add('assumption', a.statement ?? String(a), a.basis ? { basis: a.basis } : null);
  }

  // 5. Decision classification + owner.
  const tier = input.decision?.tier;
  if (tier) {
    const owner = input.decision?.owner ?? null;
    const why = tier === DECISION_TIER.HUMAN
      ? 'requires human judgement (sensitive type, critical urgency, or low confidence)'
      : tier === DECISION_TIER.APPROVE
        ? 'needs one-tap human confirmation'
        : 'is eligible for automatic execution';
    add('decision',
      `Classified ${tier} — ${why}${owner ? `; owner: ${owner}` : ''}.`,
      input.decision?.rationale ? { rationale: input.decision.rationale } : null);
  }

  // 6. Approval state, if any.
  if (input.approval?.state) {
    add('approval',
      `Approval state: ${input.approval.state}${input.approval.reviewer ? ` by ${input.approval.reviewer}` : ''}.`,
      input.approval.reviewedAt ? { reviewedAt: input.approval.reviewedAt } : null);
  }

  return {
    steps,
    summary: `${steps.length}-step reasoning trace composed from existing signals (no model invoked).`,
  };
}
