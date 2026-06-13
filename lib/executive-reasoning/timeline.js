// Executive Reasoning — timeline, provenance & approval linkage.
//
// Assembles the lifecycle of a conclusion (created → classified → routed → decided
// → outcome) from timestamped records the caller already holds (approval ledger,
// audit trail, learning outcomes). Pure ordering + normalisation; no I/O.

/**
 * Build an ordered timeline from provided lifecycle events plus any implicit
 * milestones present on the input (created / reviewed / outcome).
 * @returns {object[]} ordered [{ at, event, by, detail }]
 */
export function buildTimeline(input = {}) {
  const events = [];

  if (input.createdAt) events.push({ at: input.createdAt, event: 'created', by: input.source ?? null, detail: input.subject?.title ?? null });

  for (const e of input.timelineEvents ?? []) {
    events.push({ at: e.at ?? null, event: e.event ?? 'event', by: e.by ?? null, detail: e.detail ?? null });
  }

  const ap = input.approval ?? {};
  if (ap.reviewedAt) {
    events.push({ at: ap.reviewedAt, event: `approval_${ap.state ?? 'reviewed'}`, by: ap.reviewer ?? null, detail: ap.reason ?? null });
  }

  const lo = input.learningOutcome ?? {};
  if (lo.recordedAt || lo.outcomeId) {
    events.push({ at: lo.recordedAt ?? null, event: 'learning_outcome', by: 'learning-engine', detail: lo.outcomeType ?? null });
  }

  // Stable sort by timestamp (nulls last, preserving insertion order among equals).
  return events
    .map((e, i) => ({ ...e, _i: i }))
    .sort((a, b) => {
      const ta = a.at ? Date.parse(a.at) : Infinity;
      const tb = b.at ? Date.parse(b.at) : Infinity;
      return ta === tb ? a._i - b._i : ta - tb;
    })
    .map(({ _i, ...e }) => e);
}

/**
 * Decision provenance: where the conclusion and its decision came from.
 */
export function buildProvenance(input = {}) {
  const evidenceSources = [...new Set((input.evidence ?? []).map(e => e.source ?? e.engine).filter(Boolean))];
  return {
    origin:          input.source ?? null,
    evidenceSources,
    decisionTier:    input.decision?.tier ?? null,
    decisionOwner:   input.decision?.owner ?? null,
    approvalId:      input.approval?.approvalId ?? null,
    learningOutcomeId: input.learningOutcome?.outcomeId ?? null,
    auditId:         input.approval?.auditId ?? null,
  };
}

/**
 * Human approval linkage: connects the explanation to the durable approval record.
 */
export function buildApprovalLinkage(input = {}) {
  const ap = input.approval ?? {};
  return {
    linked:     Boolean(ap.approvalId),
    approvalId: ap.approvalId ?? null,
    state:      ap.state ?? null,
    reviewer:   ap.reviewer ?? null,
    reviewedAt: ap.reviewedAt ?? null,
    reason:     ap.reason ?? null,
  };
}
