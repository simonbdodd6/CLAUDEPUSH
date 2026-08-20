// CoachEasier Performance — progression-engine vocabularies (SC6).
//
// Controlled vocabularies, bounds tables, flags and reason templates for
// the DETERMINISTIC progression engine. No language model decides
// progression; every table here is explicit, versioned data.
//
// PROVISIONAL_REQUIRES_SNC_REVIEW: every numeric threshold and mapping in
// this module is a beta default awaiting qualified S&C review (medical /
// safeguarding where flagged in progression-review-requirements.md).
// Automated tests passing is NOT professional validation.
//
// Pure module: no DOM, no fetch, no localStorage, no clock, no randomness.

export const PROGRESSION_ENGINE_VERSION = '2026.08-sc6-beta.1';
export { PROVISIONAL } from './coaching.js';

// ── Decision outcomes ───────────────────────────────────────────────────────

export const PROGRESSION_OUTCOMES = [
  'maintain',
  'progress_load', 'progress_reps', 'progress_sets',
  'progress_duration', 'progress_distance', 'progress_density',
  'progress_complexity',
  'regress_load', 'regress_reps', 'regress_sets',
  'reduce_effort',
  'hold_due_to_uncertainty', 'repeat_exposure',
  'deload', 'coach_review', 'blocked',
];

// ── Load representation ─────────────────────────────────────────────────────
// Every load carries a type — 60 never silently means kg.

export const LOAD_TYPES = [
  'kg', 'lb', 'percentage', 'bodyweight', 'bodyweight_plus_kg',
  'assistance_kg', 'machine_stack', 'band_level', 'unknown',
];

// Baseline-evidence sources for initial loads, strongest first.
export const LOAD_EVIDENCE_SOURCES = [
  'recent_completed_set', 'coach_entered_working_load', 'athlete_reported_recent_load',
  'historical_session', 'estimated_1rm', 'submaximal_rep_test', 'training_history', 'unknown',
];

export const LOAD_CONFIDENCE = ['high', 'medium', 'low', 'none'];

// ── e1RM policy — PROVISIONAL_REQUIRES_SNC_REVIEW ───────────────────────────
// Deterministic Epley: e1RM = load × (1 + reps/30). Valid for 2–10 reps;
// single-rep inputs pass through; >10 reps rejected (confidence too poor).
// An estimate is NEVER labelled as a tested 1RM.

export const E1RM_FORMULAS = {
  epley_v1: { label: 'Epley (v1)', minReps: 1, maxReps: 10 },
};
export const DEFAULT_E1RM_FORMULA = 'epley_v1';

// ── Set / session result classification ─────────────────────────────────────

export const SET_RESULTS = [
  'completed', 'partial', 'technical_failure', 'effort_failure',
  'missed_target', 'aborted', 'pain_stop',
];

export const EXPOSURE_OUTCOMES = ['successful', 'partial', 'failed', 'missed', 'pain_stop'];

// ── Exposure requirements — PROVISIONAL_REQUIRES_SNC_REVIEW ─────────────────
// Repeated evidence before meaningful progression: one good day is not a
// trend. Counts are CONSECUTIVE successful exposures of the same
// prescription.

export const EXPOSURE_REQUIREMENTS = {
  new: 3,
  beginner: 3,
  intermediate: 2,
  advanced: 2,          // method-specific overrides below
};
export const METHOD_EXPOSURE_OVERRIDES = {
  percentage: { advanced: 2, intermediate: 2, beginner: 3, new: 3 },
  complexity: { advanced: 4, intermediate: 4, beginner: 6, new: 6 },
};

// ── Progression bounds — PROVISIONAL_REQUIRES_SNC_REVIEW ────────────────────
// Max single-step load increase, whichever of relative/absolute is SMALLER.
// Youth ceilings are tighter; a coach ceiling always overrides everything.

export const LOAD_INCREASE_BOUNDS = {
  adult: {
    new:          { maxPercent: 2.5, maxKg: 2.5 },
    beginner:     { maxPercent: 5,   maxKg: 5 },
    intermediate: { maxPercent: 5,   maxKg: 5 },
    advanced:     { maxPercent: 2.5, maxKg: 5 },
  },
  youth_u18: {
    new:          { maxPercent: 2.5, maxKg: 2.5 },
    beginner:     { maxPercent: 2.5, maxKg: 2.5 },
    intermediate: { maxPercent: 5,   maxKg: 2.5 },
    advanced:     { maxPercent: 5,   maxKg: 2.5 },
  },
  youth_u16: {
    new:          { maxPercent: 2.5, maxKg: 1.25 },
    beginner:     { maxPercent: 2.5, maxKg: 2.5 },
    intermediate: { maxPercent: 2.5, maxKg: 2.5 },
    advanced:     { maxPercent: 2.5, maxKg: 2.5 },
  },
  unknown: {
    new:          { maxPercent: 2.5, maxKg: 1.25 },
    beginner:     { maxPercent: 2.5, maxKg: 2.5 },
    intermediate: { maxPercent: 2.5, maxKg: 2.5 },
    advanced:     { maxPercent: 2.5, maxKg: 2.5 },
  },
};

// Duration/distance/density single-step bounds (relative).
export const TIME_DISTANCE_BOUNDS = { maxPercent: 10 };

// ── Equipment increments — PROVISIONAL_REQUIRES_SNC_REVIEW ──────────────────
// Smallest realistic jump per load context. Bands are ordinal (level), and
// bodyweight progresses via reps/tempo/leverage, never invented kilograms.
//
// CONVENTION (documented, test-enforced): load values for hand-held
// implements are PER IMPLEMENT — how athletes naturally log them ("20 kg
// dumbbells" means 20 each hand). Loads carry {per, implements} metadata
// and totalExternalLoad() derives the combined figure; progression bounds
// and increments apply to the per-implement value the athlete changes.
// The dumbbell/kettlebell increments below are therefore per implement.

export const EQUIPMENT_INCREMENTS = {
  barbell: 2.5,        // 1.25 kg per side
  trap_bar: 2.5,
  dumbbells: 2,        // typical fixed-pair jump
  kettlebells: 4,
  machines: 5,         // stack pin
  bodyweight: null,
  bands: null,         // ordinal levels
};

// ── Readiness modification — PROVISIONAL_REQUIRES_SNC_REVIEW ────────────────
// 1–5 wellness scales (SC2). Low = average of provided scores ≤ 2.
// One low entry is noise; a sustained trend earns conservative action.

export const READINESS_RULES = {
  lowScoreThreshold: 2,
  sustainedCount: 3,        // low entries within the window to count as sustained
  windowEntries: 5,
};
export const READINESS_STATUSES = ['no_data', 'normal', 'one_low', 'sustained_low'];

// ── Missed sessions / breaks — PROVISIONAL_REQUIRES_SNC_REVIEW ──────────────

export const BREAK_RULES = {
  missedWeekDays: 7,        // ≥7 days without exposure → missed week: repeat + modest reduction
  prolongedBreakDays: 21,   // ≥21 days → reduced return dose + coach review
  // Exposure continuity: successes separated by more than this many days
  // no longer form one progression-ready streak. Historical evidence is
  // kept (totals), but stale success can never earn progression on the
  // strength of an old streak.
  streakGapDays: 14,
};

// ── Deload — PROVISIONAL_REQUIRES_SNC_REVIEW ────────────────────────────────
// Never from one signal, never from one hard session.

export const DELOAD_RULES = {
  accumulationExposures: 12,   // successful exposures since last deload
  repeatedFailureCount: 3,     // failed exposures in recent window
  sustainedLowReadiness: true, // sustained_low readiness contributes
  signalsRequired: 1,          // planned/coach-forced count alone; rule-triggered needs a qualifying signal below
};

// ── Plateau — PROVISIONAL_REQUIRES_SNC_REVIEW ───────────────────────────────

export const PLATEAU_RULES = {
  minExposures: 4,             // completed exposures with no progression
  minFailedAttempts: 2,        // failed progression attempts
};

// ── Programme-wide progression budget — PROVISIONAL ─────────────────────────
// Prevents everything progressing at once regardless of total dose.

export const PROGRESSION_BUDGET = {
  very_low: 1, low: 1, moderate: 2, high: 3,   // max progressions per session by volume category
  congestedPenalty: 1,                          // rugbyLoad ≥ 3 removes one slot
  youthCap: 2,
};

// ── Coach overrides ─────────────────────────────────────────────────────────

export const OVERRIDE_TYPES = [
  'freeze_progression', 'max_load', 'max_percentage', 'force_maintain',
  'force_deload', 'cap_sets', 'cap_complexity', 'manual_next_target',
  'require_review',
];

// ── Review flags ────────────────────────────────────────────────────────────

export const PROGRESSION_FLAGS = [
  { id: 'progression_rules_provisional',   severity: 'info',            label: 'Beta progression rules — awaiting qualified S&C review' },
  { id: 'insufficient_exposure_history',   severity: 'info',            label: 'Not enough successful exposures yet — progression held' },
  { id: 'load_confidence_low',             severity: 'warning',         label: 'Load baseline uncertain — effort-based targets used' },
  { id: 'manual_load_selection_required',  severity: 'warning',         label: 'No usable load evidence — coach/athlete selects the load' },
  { id: 'equipment_increment_too_large',   severity: 'info',            label: 'Next equipment jump exceeds the safe bound — reps progressed instead' },
  { id: 'repeated_failure',                severity: 'requires_review', label: 'Repeated failed work — target reduced, coach review suggested' },
  { id: 'technical_review_required',       severity: 'requires_review', label: 'Technique review needed before further progression' },
  { id: 'pain_stop',                       severity: 'blocking',        label: 'Pain stop reported — progression blocked, route to review' },
  { id: 'sustained_low_readiness',         severity: 'warning',         label: 'Sustained low readiness — conservative adjustment applied' },
  { id: 'prolonged_training_break',        severity: 'requires_review', label: 'Prolonged break — reduced return dose, coach review' },
  { id: 'plateau_review',                  severity: 'requires_review', label: 'Repeated plateau evidence — strategy review suggested' },
  { id: 'youth_progression_review',        severity: 'requires_review', label: 'Youth progression at a ceiling — coach review required' },
  { id: 'coach_ceiling_active',            severity: 'info',            label: 'A coach-defined ceiling constrains this progression' },
  { id: 'deload_recommended',              severity: 'warning',         label: 'Deload recommended from accumulated evidence' },
  { id: 'prescription_conflict',           severity: 'warning',         label: 'Conflicting progression signals — conservative option chosen' },
  { id: 'match_proximity_hold',            severity: 'info',            label: 'Progression held for match proximity' },
  { id: 'complexity_gate_not_met',         severity: 'info',            label: 'Complexity progression gates not met — staying on current exercise' },
];

export function progressionFlagDef(id) {
  return PROGRESSION_FLAGS.find((f) => f.id === id) || null;
}

// ── Reason templates (deterministic — no free text, no AI) ──────────────────

const t = (s) => s.replace(/_/g, ' ');

export const PROGRESSION_REASON_TEMPLATES = {
  pr_maintain: () => 'Load maintained — a personal record is evidence, not a command; progression still requires repeated successful exposures.',
  insufficient_exposures: (p) => `Load maintained because only ${p.successes} successful exposure${p.successes === 1 ? '' : 's'} exist${p.successes === 1 ? 's' : ''} of the ${p.required} required.`,
  stale_streak: (p) => `Earlier successes are separated by a ${p.gapDays}-day gap — the progression streak restarts from recent, continuous work.`,
  manual_clamped: (p) => `Coach manual target adjusted from ${p.from} to ${p.to} ${p.unit} because ${t(p.by)} still applies — safety ceilings are never bypassed.`,
  progress_load: (p) => `Load increased by ${p.amount} ${p.unit} after ${p.successes} consecutive successful exposures within bounds.`,
  progress_reps: (p) => `Repetitions increased toward the top of the ${p.range} range after successful completion.`,
  reps_before_load_increment: (p) => `Repetitions increased before load because the next available ${t(p.equipment)} increment (${p.increment} ${p.unit}) exceeds the permitted progression bound (${p.bound} ${p.unit}).`,
  load_after_top_range: (p) => `Load increased and repetitions reset toward ${p.resetTo} after repeated top-of-range completion (double progression).`,
  effort_progress: (p) => `${p.kind.toUpperCase()} target adjusted from ${p.from} to ${p.to} after repeated below-target effort.`,
  effort_excessive: (p) => `Target held — achieved ${p.kind.toUpperCase()} ${p.achieved} exceeded the prescribed ${p.target}; earn it at the current dose first.`,
  match_hold: (p) => `Progression held because the session is ${p.md}.`,
  md1_primer: () => 'MD-1 primer — no volume or load progression is ever applied here.',
  postmatch_no_progress: () => 'Post-match exposure — recovery work never triggers strength progression.',
  readiness_single_low: () => 'One low readiness entry — no change applied; a single report never rewrites the programme.',
  readiness_sustained: (p) => `${t(p.action)} after ${p.count} low readiness reports — a conservative training adjustment only; nothing medical is implied.`,
  readiness_no_data: () => 'No readiness data — base prescription preserved; absence of check-ins is never treated as poor readiness.',
  single_failure_hold: () => 'One failed set — prescription repeated without change; a single miss is not a trend.',
  repeated_failure_regress: (p) => `Target reduced modestly after ${p.failures} failed exposures — small step back, not a rewrite.`,
  technical_failure_review: () => 'Technique broke down — complexity/load held and technique review requested. This is a coaching call, never a medical one.',
  pain_stop_blocked: () => 'Pain stop reported — progression blocked and routed to review. No substitution is chosen for pain.',
  missed_once_repeat: () => 'Missed session — the same prescription is repeated; missed work is never crammed into the next session.',
  missed_week_reduce: () => 'A week without exposure — prescription repeated with a modest dose reduction before resuming.',
  prolonged_break: (p) => `${p.days} days without training — reduced return dose and coach review before progression resumes.`,
  deload_planned: () => 'Planned deload week — volume and intensity reduced per programme phase.',
  deload_triggered: (p) => `Deload recommended: ${p.signals.map(t).join(' + ')} — multiple signals, never one hard session.`,
  deload_not_single_session: () => 'Difficult session noted — deload requires accumulated evidence, not one bad day.',
  plateau_hold: (p) => `Plateau after ${p.exposures} unchanged exposures and ${p.attempts} failed attempts — strategy review suggested rather than automatic exercise rotation.`,
  plateau_insufficient: () => 'Progress has slowed but history is too short to call a plateau.',
  youth_ceiling: (p) => `Youth ceiling applied (${t(p.context)}) — increase capped at ${p.cap} ${p.unit} regardless of successful history.`,
  youth_technique_bias: () => 'Youth progression favours repetition quality and gradual load — aggressive maximal loading is not applied.',
  coach_ceiling: (p) => `Progression blocked/limited because a coach-defined ${t(p.type)} of ${p.value} is active.`,
  coach_force: (p) => `Coach override active: ${t(p.type)}.`,
  budget_exhausted: (p) => `Held at maintain — the session's progression budget (${p.budget}) is already used by higher-priority lifts.`,
  effort_based_start: () => 'No reliable load baseline — starting with effort-based targets (RPE/RIR) instead of inventing a number.',
  manual_load: () => 'Load selection left to coach/athlete — no usable evidence exists and the engine never fabricates a load.',
  e1rm_used: (p) => `Baseline derived from estimated 1RM (${p.formula}, from ${p.reps} reps) — an estimate, never a tested max.`,
  complexity_gates: (p) => `Complexity progression requires ${p.missing.map(t).join(', ')} — staying on the current exercise.`,
  complexity_progress: (p) => `Progressed to the declared harder variation after ${p.exposures} competent exposures with gates met.`,
  hold_uncertainty: (p) => `Held due to uncertainty: ${t(p.cause)}.`,
  baseline_resolved: (p) => `Baseline ${p.sets}×${p.reps} at ${t(p.intensity)} intensity resolved from the ${t(p.volume)} volume category for a ${t(p.experience)} athlete.`,
};

export function progressionReason(code, params = {}) {
  const tpl = PROGRESSION_REASON_TEMPLATES[code];
  if (!tpl) throw new Error(`unknown_progression_reason:${code}`);
  return { code, text: tpl(params) };
}
