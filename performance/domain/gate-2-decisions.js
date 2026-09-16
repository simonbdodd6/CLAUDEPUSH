// CoachEasier Performance — the Gate 2 decision record, as data (SC9.26).
//
// WHY THIS MODULE EXISTS
//
// SC9.25 recorded seven professional decisions and encoded four of them in the
// engine. It also wrote those decisions into `practitioner-review.js` — one
// surface out of three. The trace and the review package went on describing
// several of the same questions as undecided, and one of them described the
// engine's own behaviour incorrectly: main-strength slots were still said to
// "declare no quality requirement" after Gate 2 Q1 made them strength-only.
//
// The data was right and the prose was wrong, in the same artefact, three
// sections apart. That is a worse failure than either being wrong alone,
// because a reader cannot tell which half to believe.
//
// So the record lives here, once, and every surface that speaks about a Gate 2
// question reads it from here. A decision cannot now be updated in one place
// and left stale in another: there is only one place.
//
// WHAT THIS IS NOT
//
// It is not the decision record itself. The evidence, the evidence strength,
// the limitations and the alternatives rejected are in
// performance/docs/gate-2-professional-decisions.md, which is the document a
// practitioner reads and challenges. This module quotes its outcomes so the
// engine's own explanations can stay consistent with it.
//
// It encodes no coaching rule. The rules Gate 2 produced live where they act —
// `isCategoryAllowedInBlock`, `MAIN_STRENGTH_MAX_REPS`, `YOUTH_STRENGTH_MIN_REPS`,
// `CONTEXT_CEILING`, `PREFERRED_BUILD_RUN`. This is the record of who decided
// what, and where to read why.
//
// Pure: no DOM, no storage, no clock.

/** The document these outcomes are quoted from. Never restated, only cited. */
export const GATE_2_RECORD = 'performance/docs/gate-2-professional-decisions.md';

/** When they were recorded. One gate, one date, one reviewer. */
export const GATE_2_RECORDED_AT = 'gate-2';

/**
 * A decision's state. Only the engine-set values are defined here; what a
 * practitioner decides is their vocabulary, not one this module supplies.
 */
export const DECISION_STATE = { UNRESOLVED: 'unresolved', RECORDED: 'recorded' };

/**
 * Decisions recorded at Gate 2, keyed by the question code the engine raises.
 *
 * The per-programme observations elsewhere remain true and are still worth a
 * coach's attention for a given athlete — but the POLICY question behind each
 * has been decided, and continuing to report them as unresolved would be false.
 *
 * `outcome` is what was decided. `scope` is who it applies to and when it would
 * be reopened. `implementation` names the code that carries it, so a reader can
 * check the claim rather than take it.
 */
export const GATE_2_DECISIONS = {
  main_strength_intent: {
    outcome: 'A main-strength slot admits only strength-category exercises.',
    scope: 'All athletes, main_strength blocks only.',
    implementation: 'isCategoryAllowedInBlock requires category === strength for main_strength.',
  },
  positional_programming: {
    outcome: 'Position informs ranking and must not differentiate exercise selection. '
      + 'The differentiation the evidence supports is conditioning and recovery, which this engine does not prescribe.',
    scope: 'All athletes. Reopen if conditioning prescription is added.',
    implementation: 'No change; pinned by a test that varies position alone.',
  },
  tie_interchangeability: {
    outcome: 'Tied candidates are interchangeable on the axes the engine ranks. '
      + 'Alphabetical order is retained as the final discriminator and continues to be reported.',
    scope: 'All athletes.',
    implementation: 'No change; the trace already names the tie and its breaker.',
  },
  acceptable_weekly_increase: {
    outcome: 'No ceiling. The percentages were an artefact of small denominators: the wave adds '
      + 'one set per exercise and half an RPE point.',
    scope: 'All athletes.',
    implementation: 'No change; attribution reports absolute deltas alongside percentages.',
  },
  volume_substituting_for_effort: {
    outcome: 'The repetition fallback may not carry a main-strength lift beyond 8 repetitions.',
    scope: 'main_strength blocks, non-quality-dosed work. Accessory work is untouched.',
    implementation: 'MAIN_STRENGTH_MAX_REPS in blueprint-to-programme.js.',
  },
  youth_accumulated_volume: {
    outcome: 'Youth resistance work is prescribed inside the NSCA 6-15 repetition band, at generation '
      + 'and at the deload floor. No weekly total was invented — the position stand does not provide one.',
    scope: 'youth_u16 and youth_u18, strength-category work. Power work unchanged.',
    implementation: 'YOUTH_STRENGTH_MIN_REPS; CONTEXT_CEILING minReps = 6 for both youth contexts.',
  },
  max_build_run_conflict: {
    outcome: 'The declaration was made truthful rather than inventing a deload the evidence does not '
      + 'support. The run length is preferred, not enforced; no programme output changed.',
    scope: 'All block lengths.',
    implementation: 'MAX_BUILD_RUN renamed PREFERRED_BUILD_RUN in week-progression.js.',
  },
};

/** The question codes Gate 2 decided. Ordered, so callers can list them. */
export const GATE_2_CODES = Object.keys(GATE_2_DECISIONS).sort();

/**
 * The decision for a question: Gate 2's where one was recorded, otherwise an
 * empty set of fields for the reviewing practitioner.
 *
 * `reviewerNotes` is always null. The engine never writes a note on a
 * practitioner's behalf, recorded decision or not.
 */
export function decisionFor(code) {
  const g = GATE_2_DECISIONS[code];
  if (!g) {
    return {
      state: DECISION_STATE.UNRESOLVED,
      outcome: null, scope: null, rationale: null, implementation: null, reviewerNotes: null,
    };
  }
  return {
    state: DECISION_STATE.RECORDED,
    recordedAt: GATE_2_RECORDED_AT,
    record: GATE_2_RECORD,
    outcome: g.outcome,
    scope: g.scope,
    rationale: 'See the decision record: evidence, evidence strength, limitations and alternatives rejected.',
    implementation: g.implementation,
    reviewerNotes: null,
  };
}

/** True when Gate 2 settled the policy question behind this code. */
export const isRecorded = (code) => Object.hasOwn(GATE_2_DECISIONS, code);
