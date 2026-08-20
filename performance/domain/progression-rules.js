// CoachEasier Performance — deterministic progression rules (SC6).
//
// Converts prescriptions + evidence into bounded, explainable progression
// decisions. Progression is EARNED: repeated evidence, never one good day;
// one bad day never dismantles a programme; safety always outranks
// progression. Every numeric table is PROVISIONAL_REQUIRES_SNC_REVIEW.
//
// Pure module: no DOM, no fetch, no clock (asOf is an input), no
// randomness, no AI.

import {
  BREAK_RULES, DELOAD_RULES, EXPOSURE_REQUIREMENTS, LOAD_INCREASE_BOUNDS,
  METHOD_EXPOSURE_OVERRIDES, OVERRIDE_TYPES, PLATEAU_RULES,
  PROGRESSION_BUDGET, PROGRESSION_ENGINE_VERSION, progressionFlagDef,
  progressionReason, TIME_DISTANCE_BOUNDS,
} from '../types/progression.js';
import { equipmentIncrement, loadUnit } from './load-model.js';
import { analyseHistory, analyseReadiness } from './progression-evidence.js';

// ── Baseline prescription resolution (Part 4) — PROVISIONAL ─────────────────

const BASE_SETS_BY_VOLUME = { very_low: 2, low: 2, moderate: 3, high: 4 };
const BASE_SCHEME_BY_INTENSITY = {
  technique: { repRange: [6, 8],  rpeTarget: 5 },
  low:       { repRange: [8, 12], rpeTarget: 6 },
  moderate:  { repRange: [6, 10], rpeTarget: 7 },
  high:      { repRange: [3, 6],  rpeTarget: 8 },
};
const BASE_DURATION_BY_INTENSITY = { technique: 20, low: 30, moderate: 40, high: 45 }; // seconds per work bout

/**
 * Convert SC5 categorical dose into a bounded structural baseline for one
 * exercise. Categories in, structure out — still no loads: load resolution
 * is load-model.js's job.
 */
export function resolveBaselinePrescription({ volumeCategory, intensityCategory, exercise, experience = 'beginner', context = 'unknown', isAccessory = false }) {
  const reasons = [];
  let sets = BASE_SETS_BY_VOLUME[volumeCategory] ?? 2;
  if (isAccessory) sets = Math.max(1, sets - 1);
  let scheme = BASE_SCHEME_BY_INTENSITY[intensityCategory] ?? BASE_SCHEME_BY_INTENSITY.moderate;

  // Youth ceilings outrank the phase's wishes.
  if (context === 'youth_u16' || context === 'unknown') {
    sets = Math.min(sets, 3);
    if (scheme.rpeTarget > 7) scheme = { repRange: [5, 8], rpeTarget: 7 };
  }
  const declares = new Set(exercise?.prescription || []);
  const out = { sets, exerciseId: exercise?.id || null };
  const holdBased = declares.has('hold') || declares.has('duration');
  if (holdBased) out.durationSec = BASE_DURATION_BY_INTENSITY[intensityCategory] ?? 30;
  if (declares.has('sets_reps') && !holdBased) out.repRange = [...scheme.repRange];
  if (declares.has('rpe')) out.rpeTarget = scheme.rpeTarget;
  reasons.push(progressionReason('baseline_resolved', {
    sets, reps: out.repRange ? out.repRange.join('–') : (out.durationSec ? `${out.durationSec}s` : '—'),
    intensity: intensityCategory, volume: volumeCategory, experience,
  }));
  return { prescription: out, reasons };
}

// ── Coach overrides (Part 21) ───────────────────────────────────────────────

export function makeCoachOverride({ type, value = null, author, reason: text = '', effectiveFrom, effectiveTo = null, now = null }) {
  if (!OVERRIDE_TYPES.includes(type)) throw new Error(`bad_override_type:${type}`);
  if (!author) throw new Error('override_requires_author');
  if (!text) throw new Error('override_requires_reason');
  return {
    kind: 'coach_override', type, value, author, reason: text,
    effectiveFrom, effectiveTo, createdAt: now,
    audit: [{ action: 'created', actor: author, at: now }],
  };
}

export function activeOverrides(overrides = [], asOf) {
  const t = new Date(asOf).getTime();
  return overrides.filter((o) => {
    const from = o.effectiveFrom ? new Date(o.effectiveFrom).getTime() : -Infinity;
    const to = o.effectiveTo ? new Date(o.effectiveTo).getTime() : Infinity;
    return t >= from && t <= to;
  });
}

// ── Method selection (Part 2/7) ─────────────────────────────────────────────

export function selectProgressionMethod(exercise, prescription) {
  const declares = new Set(exercise?.prescription || []);
  const p = prescription || {};
  if (p.load?.type === 'percentage' && declares.has('percentage')) return 'percentage';
  if (p.load && p.load.type !== 'bodyweight' && p.repRange && declares.has('load')) return 'double_progression';
  if ((p.rpeTarget != null && declares.has('rpe')) || (p.rirTarget != null && declares.has('rir'))) return 'effort_based';
  if (p.densityMin != null && declares.has('density')) return 'density';
  if (p.distanceM != null && declares.has('distance')) return 'distance';
  if ((p.durationSec != null || p.holdSec != null) && (declares.has('duration') || declares.has('hold'))) return 'duration';
  if (p.repRange || p.reps != null) return 'fixed_load_reps';
  return 'maintain_only';
}

// ── Core decision (Parts 7–20) ──────────────────────────────────────────────

function requiredExposures(experience, method) {
  const override = METHOD_EXPOSURE_OVERRIDES[method === 'complexity' ? 'complexity' : method === 'percentage' ? 'percentage' : ''];
  return (override && override[experience]) ?? EXPOSURE_REQUIREMENTS[experience] ?? 3;
}

const LOWER_PATTERNS = new Set(['squat', 'hinge', 'lunge', 'step']);

/**
 * Decide the next step for one prescription. Deterministic; every path
 * returns a fully-auditable decision object.
 */
export function decideProgression(input) {
  const {
    ids = {}, exercise, prescription, equipmentKind = 'barbell',
    history = [], readiness = [], match = {}, athlete = {},
    restrictions = {}, overrides = [], phase = 'in_season',
    plannedDeload = false, progressionAttemptFailures = 0,
    exposuresSinceProgress = 0, sinceDeloadExposures = 0,
    personalRecords = [], allowComplexity = false, catalogue = [],
    asOf,
  } = input;
  const { context = 'unknown', experience = 'beginner', techConfidence = null, supervisionAvailable = false } = athlete;

  const reasons = [];
  const flags = new Set(['progression_rules_provisional']);
  const constraints = { boundsApplied: [], capsApplied: [], overridesApplied: [] };
  const h = analyseHistory(history, { asOf });
  const r = analyseReadiness(readiness);
  const method = selectProgressionMethod(exercise, prescription);
  const required = requiredExposures(experience, method);
  const youth = context !== 'adult';

  const finish = (outcome, proposed, extra = {}) => buildDecision({
    ids, exercise, prescription, outcome, proposed, reasons, flags, constraints,
    evidence: { ...h, readiness: r, personalRecords: personalRecords.length, requiredExposures: required, method },
    context, match, asOf, ...extra,
  });

  // 1. Hard safety: pain-stop / active restriction — progression blocked.
  if (h.painStop || restrictions.painReported) {
    flags.add('pain_stop');
    reasons.push(progressionReason('pain_stop_blocked', {}));
    return finish('blocked', null);
  }
  if (restrictions.active) {
    flags.add('technical_review_required');
    reasons.push(progressionReason('hold_uncertainty', { cause: 'active_restriction' }));
    return finish('coach_review', null);
  }

  // 2. Coach overrides. Two classes with different powers:
  //    A. DECISION overrides (force maintain/deload, manual target) may
  //       alter normal progression — but never bypass pain-stop (checked
  //       above), youth step ceilings, or class-B safety ceilings.
  //    B. SAFETY CEILINGS (max_load, max_percentage, cap_sets,
  //       cap_complexity, require_review) only ever restrict.
  // Ceilings are extracted FIRST so every decision path — including manual
  // targets — is clamped by them. Never silent: every application is
  // recorded in constraints and reasons.
  const act = activeOverrides(overrides, asOf);
  for (const o of act) constraints.overridesApplied.push({ type: o.type, value: o.value, author: o.author });
  if (act.some((o) => o.type === 'require_review')) flags.add('technical_review_required');
  const maxLoadCap = act.find((o) => o.type === 'max_load')?.value ?? null;
  const maxPctCap = act.find((o) => o.type === 'max_percentage')?.value ?? null;
  const setsCap = act.find((o) => o.type === 'cap_sets')?.value ?? null;

  const forced = act.find((o) => o.type === 'freeze_progression' || o.type === 'force_maintain');
  if (forced) {
    flags.add('coach_ceiling_active');
    reasons.push(progressionReason('coach_force', { type: forced.type }));
    return finish('maintain', clone(prescription));
  }
  const forcedDeload = act.find((o) => o.type === 'force_deload');
  if (forcedDeload) {
    reasons.push(progressionReason('coach_force', { type: 'force_deload' }));
    return finish('deload', deloadPrescription(prescription, setsCap));
  }
  const manual = act.find((o) => o.type === 'manual_next_target');
  if (manual) {
    flags.add('coach_ceiling_active');
    reasons.push(progressionReason('coach_force', { type: 'manual_next_target' }));
    const proposed = { ...clone(prescription), ...clone(manual.value || {}) };
    clampManualTarget(proposed, prescription, { context, maxLoadCap, maxPctCap, setsCap, reasons, flags, constraints });
    return finish('maintain', proposed);
  }

  // 3. Missed sessions & breaks (never cram, never advance as if done).
  if (h.prolongedBreak) {
    flags.add('prolonged_training_break');
    reasons.push(progressionReason('prolonged_break', { days: h.daysSinceLast }));
    return finish('regress_sets', reduceSets(prescription, setsCap));
  }
  if (h.missedWeek) {
    reasons.push(progressionReason('missed_week_reduce', {}));
    return finish('repeat_exposure', reduceSets(prescription, setsCap));
  }
  if (h.trailingMisses === 1) {
    reasons.push(progressionReason('missed_once_repeat', {}));
    return finish('repeat_exposure', clone(prescription));
  }

  // 4. Deload (planned, or multiple accumulated signals — never one bad day).
  if (plannedDeload) {
    reasons.push(progressionReason('deload_planned', {}));
    return finish('deload', deloadPrescription(prescription, setsCap));
  }
  const deloadSignals = [];
  if (sinceDeloadExposures >= DELOAD_RULES.accumulationExposures) deloadSignals.push('long_accumulation');
  if (h.recentFailures >= DELOAD_RULES.repeatedFailureCount) deloadSignals.push('repeated_failure');
  if (r.status === 'sustained_low') deloadSignals.push('sustained_low_readiness');
  if (deloadSignals.length >= 2) {
    flags.add('deload_recommended');
    reasons.push(progressionReason('deload_triggered', { signals: deloadSignals }));
    return finish('deload', deloadPrescription(prescription, setsCap));
  }

  // 5. Failure handling (before any progression can be considered).
  if (h.technicalFailureRecent) {
    flags.add('technical_review_required');
    reasons.push(progressionReason('technical_failure_review', {}));
    return finish('hold_due_to_uncertainty', clone(prescription));
  }
  const lastOutcome = lastPerformedOutcome(history);
  if (h.recentFailures >= 2) {
    flags.add('repeated_failure');
    reasons.push(progressionReason('repeated_failure_regress', { failures: h.recentFailures }));
    return finish(regressOutcome(method), regressPrescription(prescription, method, equipmentKind));
  }
  if (h.recentFailures === 1 && (lastOutcome === 'failed' || lastOutcome === 'partial')) {
    reasons.push(progressionReason('single_failure_hold', {}));
    return finish('repeat_exposure', clone(prescription));
  }

  // 6. Match proximity (SC5 rules consumed as constraints).
  if (match.md === 'MD-1' || match.isPrimer) {
    flags.add('match_proximity_hold');
    reasons.push(progressionReason('md1_primer', {}));
    return finish('maintain', clone(prescription));
  }
  if (match.md === 'MD' || match.md === 'MD+1' || match.postMatch) {
    flags.add('match_proximity_hold');
    reasons.push(progressionReason('postmatch_no_progress', {}));
    return finish('maintain', clone(prescription));
  }
  const lowerBody = LOWER_PATTERNS.has(exercise?.classification?.pattern);
  if (match.md === 'MD-2' && lowerBody) {
    flags.add('match_proximity_hold');
    reasons.push(progressionReason('match_hold', { md: 'MD-2' }));
    return finish('maintain', clone(prescription));
  }

  // 7. Readiness modifier (anti-overreaction; trends only).
  if (r.status === 'sustained_low') {
    flags.add('sustained_low_readiness');
    reasons.push(progressionReason('readiness_sustained', { action: 'one_set_removed', count: r.lowCount }));
    return finish('regress_sets', reduceSets(prescription, setsCap));
  }
  if (r.status === 'one_low') reasons.push(progressionReason('readiness_single_low', {}));
  if (r.status === 'no_data') reasons.push(progressionReason('readiness_no_data', {}));

  // 8. Evidence gate — progression is earned (PRs never bypass it), and
  // only RECENT, CONTINUOUS success counts: a streak broken by a calendar
  // gap restarts from the return session, however good the old work was.
  if (h.consecutiveSuccesses < required) {
    if (personalRecords.length) reasons.push(progressionReason('pr_maintain', {}));
    flags.add('insufficient_exposure_history');
    if (h.streakBrokenByGap) reasons.push(progressionReason('stale_streak', { gapDays: h.streakGapDays }));
    reasons.push(progressionReason('insufficient_exposures', { successes: h.consecutiveSuccesses, required }));
    return finish('repeat_exposure', clone(prescription));
  }
  if (h.lastEffortAbove) {
    reasons.push(progressionReason('effort_excessive', { kind: prescription.rirTarget != null ? 'rir' : 'rpe', achieved: 'above', target: 'prescribed' }));
    return finish('maintain', clone(prescription));
  }

  // 9. Plateau (repeated evidence only — a PR is never plateau evidence).
  if (exposuresSinceProgress >= PLATEAU_RULES.minExposures && progressionAttemptFailures >= PLATEAU_RULES.minFailedAttempts) {
    flags.add('plateau_review');
    reasons.push(progressionReason('plateau_hold', { exposures: exposuresSinceProgress, attempts: progressionAttemptFailures }));
    return finish('coach_review', clone(prescription));
  }

  // 10. Complexity progression — extremely constrained, never automatic.
  if (allowComplexity) {
    return decideComplexity({ input, h, reasons, flags, constraints, finish, required: requiredExposures(experience, 'complexity'), catalogue });
  }

  // 11. Method progression, bounded.
  return progressByMethod({
    method, prescription, exercise, equipmentKind, h, context, experience,
    maxLoadCap, maxPctCap, setsCap, reasons, flags, constraints, finish, youth,
  });
}

// ── Method implementations ──────────────────────────────────────────────────

function progressByMethod({ method, prescription, equipmentKind, h, context, experience, maxLoadCap, maxPctCap, setsCap, reasons, flags, constraints, finish, youth }) {
  const p = prescription;
  const bounds = (LOAD_INCREASE_BOUNDS[context] || LOAD_INCREASE_BOUNDS.unknown)[experience] || { maxPercent: 2.5, maxKg: 2.5 };

  if (method === 'double_progression' || method === 'effort_based' || method === 'fixed_load_reps') {
    const atTop = h.consecutiveTopOfRange >= (method === 'fixed_load_reps' ? 1 : 1);
    const effortEarned = method === 'effort_based' && h.effortBelowStreak >= 1;
    // Not yet at the top of the range → progress reps inside the range.
    if (p.repRange && !atTop && !effortEarned) {
      reasons.push(progressionReason('progress_reps', { range: p.repRange.join('–') }));
      return finish('progress_reps', clone(p));
    }
    // Top of range (or repeatedly easy): consider a load step.
    const loadKgLike = p.load && (p.load.type === 'kg' || p.load.type === 'bodyweight_plus_kg' || p.load.type === 'machine_stack' || p.load.type === 'lb');
    if (!loadKgLike) {
      // Bodyweight/band contexts progress reps or sets, never invented load.
      if (p.repRange) {
        reasons.push(progressionReason('progress_reps', { range: p.repRange.join('–') }));
        return finish('progress_reps', clone(p));
      }
      reasons.push(progressionReason('hold_uncertainty', { cause: 'no_load_dimension' }));
      return finish('maintain', clone(p));
    }
    const unit = loadUnit(p.load);
    const inc = equipmentIncrement(equipmentKind);
    const allowedMax = Math.min(bounds.maxKg, Math.round(p.load.value * bounds.maxPercent) / 100 || bounds.maxKg);
    constraints.boundsApplied.push({ maxPercent: bounds.maxPercent, maxKg: bounds.maxKg, allowedMax });
    if (youth) reasons.push(progressionReason('youth_technique_bias', {}));

    if (inc === null || inc > allowedMax) {
      // Equipment jump too coarse for a safe step → reps/sets before load.
      flags.add('equipment_increment_too_large');
      if (inc !== null) reasons.push(progressionReason('reps_before_load_increment', { equipment: equipmentKind, increment: inc, unit, bound: allowedMax }));
      if (p.repRange) return finish('progress_reps', widenReps(p));
      return finish('progress_sets', addSet(p, setsCap, reasons, flags));
    }
    let amount = Math.floor(allowedMax / inc) * inc;
    if (amount < inc) amount = 0;
    if (youth) {
      const cap = bounds.maxKg;
      if (amount > cap) amount = Math.floor(cap / inc) * inc;
      reasons.push(progressionReason('youth_ceiling', { context, cap, unit }));
    }
    let next = p.load.value + amount;
    if (maxLoadCap !== null && next > maxLoadCap) {
      flags.add('coach_ceiling_active');
      constraints.capsApplied.push({ type: 'max_load', value: maxLoadCap });
      if (p.load.value >= maxLoadCap) {
        reasons.push(progressionReason('coach_ceiling', { type: 'max_load', value: maxLoadCap }));
        return finish('maintain', clone(p));
      }
      next = maxLoadCap;
      amount = next - p.load.value;
    }
    if (amount <= 0) {
      reasons.push(progressionReason('hold_uncertainty', { cause: 'no_safe_increment' }));
      return finish('maintain', clone(p));
    }
    const proposed = clone(p);
    proposed.load = { ...p.load, value: next };
    if (p.repRange) {
      proposed.repRange = [...p.repRange];
      reasons.push(progressionReason('load_after_top_range', { resetTo: p.repRange[0] }));
    }
    reasons.push(progressionReason('progress_load', { amount, unit, successes: h.consecutiveSuccesses }));
    return finish('progress_load', proposed);
  }

  if (method === 'percentage') {
    let nextPct = Math.min((p.load.value ?? 0) + 2.5, 100);
    if (maxPctCap !== null && nextPct > maxPctCap) {
      flags.add('coach_ceiling_active');
      constraints.capsApplied.push({ type: 'max_percentage', value: maxPctCap });
      reasons.push(progressionReason('coach_ceiling', { type: 'max_percentage', value: maxPctCap }));
      return finish('maintain', clone(p));
    }
    const proposed = clone(p);
    proposed.load = { ...p.load, value: nextPct };
    reasons.push(progressionReason('progress_load', { amount: 2.5, unit: '%', successes: h.consecutiveSuccesses }));
    return finish('progress_load', proposed);
  }

  if (method === 'duration' || method === 'distance' || method === 'density') {
    const key = method === 'duration' ? (p.durationSec != null ? 'durationSec' : 'holdSec') : method === 'distance' ? 'distanceM' : 'densityMin';
    const current = p[key] ?? 0;
    const bump = Math.max(1, Math.round(current * TIME_DISTANCE_BOUNDS.maxPercent / 100));
    constraints.boundsApplied.push({ maxPercent: TIME_DISTANCE_BOUNDS.maxPercent });
    const proposed = clone(p);
    proposed[key] = current + bump;
    const outcome = method === 'duration' ? 'progress_duration' : method === 'distance' ? 'progress_distance' : 'progress_density';
    reasons.push(progressionReason('progress_load', { amount: bump, unit: key === 'distanceM' ? 'm' : key === 'densityMin' ? 'min' : 's', successes: h.consecutiveSuccesses }));
    return finish(outcome, proposed);
  }

  reasons.push(progressionReason('hold_uncertainty', { cause: 'no_progression_method' }));
  return finish('maintain', clone(prescription));
}

// ── Complexity progression (Part 7) — never automatic ───────────────────────

function decideComplexity({ input, h, reasons, flags, finish, required, catalogue }) {
  const { exercise, prescription, athlete = {} } = input;
  const missing = [];
  if (athlete.techConfidence !== 'high') missing.push('high_technical_confidence');
  if (h.consecutiveSuccesses < required) missing.push('repeated_competent_exposures');
  const rel = (exercise?.relationships || []).find((x) => x.kind === 'progression');
  const target = rel ? (catalogue.find((e) => e.id === rel.target) || null) : null;
  if (!rel || !target) missing.push('declared_progression_relationship');
  if (target) {
    const ceiling = { adult: { advanced: 'advanced', intermediate: 'intermediate' }, youth_u18: { advanced: 'intermediate' } };
    const rank = { beginner: 0, intermediate: 1, advanced: 2 };
    const ctxCeil = (ceiling[athlete.context] || {})[athlete.experience] || 'beginner';
    if (rank[target.classification.difficulty] > rank[ctxCeil]) missing.push('development_context_eligibility');
    if (target.safety?.highSkill && !athlete.supervisionAvailable) missing.push('supervision');
  }
  if (missing.length) {
    flags.add('complexity_gate_not_met');
    reasons.push(progressionReason('complexity_gates', { missing }));
    return finish('maintain', clone(prescription));
  }
  reasons.push(progressionReason('complexity_progress', { exposures: h.consecutiveSuccesses }));
  return finish('progress_complexity', { ...clone(prescription), exerciseId: target.id });
}

// ── Programme-wide progression budget (Part 25) ─────────────────────────────

/**
 * Cap simultaneous progressions per session so load, reps and sets never
 * all surge at once across every exercise. Decisions arrive in block
 * priority order; excess progressions downgrade to maintain with a reason.
 */
export function applyProgressionBudget(decisions, { volumeCategory = 'moderate', rugbyLoad = 0, context = 'unknown' } = {}) {
  let budget = PROGRESSION_BUDGET[volumeCategory] ?? 2;
  if (rugbyLoad >= 3) budget = Math.max(1, budget - PROGRESSION_BUDGET.congestedPenalty);
  if (context !== 'adult') budget = Math.min(budget, PROGRESSION_BUDGET.youthCap);

  let used = 0;
  const out = decisions.map((d) => {
    if (!d.outcome.startsWith('progress_')) return d;
    if (used < budget) { used++; return d; }
    const downgraded = structuredClone(d);
    downgraded.outcome = 'maintain';
    downgraded.proposedPrescription = structuredClone(d.sourcePrescription);
    downgraded.reasons = [...d.reasons, progressionReason('budget_exhausted', { budget })];
    downgraded.constraints = { ...d.constraints, capsApplied: [...(d.constraints.capsApplied || []), { type: 'progression_budget', value: budget }] };
    return downgraded;
  });
  return { decisions: out, budget, used: Math.min(used, budget) };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const clone = (o) => structuredClone(o ?? null);

const KG_LIKE = new Set(['kg', 'lb', 'bodyweight_plus_kg', 'machine_stack']);

/**
 * Clamp a coach manual target by every applicable safety boundary:
 * class-B ceilings (max_load / max_percentage / cap_sets) and, for youth
 * contexts, the per-step increase bound relative to the current
 * prescription. Mutates `proposed`; records every clamp visibly.
 */
function clampManualTarget(proposed, current, { context, maxLoadCap, maxPctCap, setsCap, reasons, flags, constraints }) {
  const load = proposed.load;
  if (load && KG_LIKE.has(load.type) && Number.isFinite(load.value)) {
    const unit = loadUnit(load);
    if (maxLoadCap !== null && load.value > maxLoadCap) {
      constraints.capsApplied.push({ type: 'max_load', value: maxLoadCap });
      reasons.push(progressionReason('manual_clamped', { from: load.value, to: maxLoadCap, unit, by: 'the coach max load ceiling' }));
      load.value = maxLoadCap;
    }
    if (context !== 'adult' && current?.load && KG_LIKE.has(current.load.type) && Number.isFinite(current.load.value)) {
      const bounds = (LOAD_INCREASE_BOUNDS[context] || LOAD_INCREASE_BOUNDS.unknown);
      const maxKg = Math.max(...Object.values(bounds).map((b) => b.maxKg));
      const ceiling = current.load.value + maxKg;
      if (load.value > ceiling) {
        flags.add('youth_progression_review');
        constraints.capsApplied.push({ type: 'youth_step_ceiling', value: ceiling });
        reasons.push(progressionReason('manual_clamped', { from: load.value, to: ceiling, unit, by: 'the youth per-step ceiling' }));
        reasons.push(progressionReason('youth_ceiling', { context, cap: maxKg, unit }));
        load.value = ceiling;
      }
    }
  }
  if (load && load.type === 'percentage' && Number.isFinite(load.value) && maxPctCap !== null && load.value > maxPctCap) {
    constraints.capsApplied.push({ type: 'max_percentage', value: maxPctCap });
    reasons.push(progressionReason('manual_clamped', { from: load.value, to: maxPctCap, unit: '%', by: 'the coach max percentage ceiling' }));
    load.value = maxPctCap;
  }
  if (setsCap !== null && Number.isFinite(proposed.sets) && proposed.sets > setsCap) {
    constraints.capsApplied.push({ type: 'cap_sets', value: setsCap });
    reasons.push(progressionReason('manual_clamped', { from: proposed.sets, to: setsCap, unit: 'sets', by: 'the coach set cap' }));
    proposed.sets = setsCap;
  }
}

function lastPerformedOutcome(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].outcome !== 'missed') return history[i].outcome;
  }
  return null;
}

function reduceSets(p, setsCap) {
  const next = clone(p);
  next.sets = Math.max(1, (p.sets ?? 2) - 1);
  if (setsCap !== null && setsCap !== undefined) next.sets = Math.min(next.sets, setsCap);
  return next;
}

function addSet(p, setsCap, reasons, flags) {
  const next = clone(p);
  next.sets = (p.sets ?? 2) + 1;
  if (setsCap !== null && setsCap !== undefined && next.sets > setsCap) {
    next.sets = setsCap;
    flags.add('coach_ceiling_active');
    reasons.push(progressionReason('coach_ceiling', { type: 'cap_sets', value: setsCap }));
  }
  return next;
}

function widenReps(p) {
  const next = clone(p);
  next.repRange = [p.repRange[0], p.repRange[1] + 1];
  return next;
}

function regressOutcome(method) {
  if (method === 'duration' || method === 'distance' || method === 'density') return 'reduce_effort';
  return 'regress_load';
}

function regressPrescription(p, method, equipmentKind) {
  const next = clone(p);
  if (method === 'duration') { if (next.durationSec) next.durationSec = Math.max(5, Math.round(next.durationSec * 0.9)); return next; }
  if (method === 'distance') { if (next.distanceM) next.distanceM = Math.max(5, Math.round(next.distanceM * 0.9)); return next; }
  if (p.load && Number.isFinite(p.load.value) && (p.load.type === 'kg' || p.load.type === 'lb' || p.load.type === 'machine_stack')) {
    const inc = equipmentIncrement(equipmentKind) ?? 2.5;
    next.load = { ...p.load, value: Math.max(0, p.load.value - inc) };
    return next;
  }
  if (next.repRange) next.repRange = [Math.max(1, next.repRange[0] - 1), Math.max(2, next.repRange[1] - 1)];
  return next;
}

function deloadPrescription(p, setsCap = null) {
  const next = reduceSets(p, setsCap);
  if (next.rpeTarget != null) next.rpeTarget = Math.max(5, next.rpeTarget - 1);
  if (next.load && Number.isFinite(next.load.value) && next.load.type === 'percentage') next.load = { ...next.load, value: Math.max(50, next.load.value - 10) };
  if (next.durationSec) next.durationSec = Math.round(next.durationSec * 0.7);
  return next;
}

// ── Decision assembly (Part 1/22) ───────────────────────────────────────────

function buildDecision({ ids, exercise, prescription, outcome, proposed, reasons, flags, constraints, evidence, context, match, asOf }) {
  const flagObjs = [...flags].sort().map((id) => {
    const def = progressionFlagDef(id);
    return { id, severity: def?.severity || 'warning', label: def?.label || id };
  });
  return {
    kind: 'progression_decision',
    engineVersion: PROGRESSION_ENGINE_VERSION,
    provisional: true,
    id: `pd:${ids.programmeVersionRef || 'adhoc'}:${ids.exerciseId || exercise?.id || 'ex'}:${asOf}`,
    athleteRef: ids.athleteRef || null,
    programmeRef: ids.programmeRef || null,
    programmeVersionRef: ids.programmeVersionRef || null,
    exerciseId: ids.exerciseId || exercise?.id || null,
    exerciseVersion: ids.exerciseVersion ?? exercise?.version ?? null,
    outcome,
    sourcePrescription: structuredClone(prescription ?? null),
    proposedPrescription: proposed === null ? null : structuredClone(proposed),
    reasons: [...reasons],
    evidence,
    constraints,
    developmentContext: context,
    matchContext: match?.md || null,
    asOf,
    requiresReview: flagObjs.some((f) => f.severity === 'requires_review' || f.severity === 'blocking'),
    flags: flagObjs,
  };
}
