// CoachEasier Performance — progression plans & SC4 versioning seam (SC6).
//
// Assembles per-exercise decisions into a session/programme-level plan and
// defines how approved progression reaches SC4 programmes WITHOUT ever
// touching published history.
//
//   Progression Plan != Completed Workout
//   Progression Plan != Automatically Published Programme
//
// A plan is a proposal. Future orchestration (SC7+) decides when an
// approved plan becomes a new programme version; this module only writes
// into an SC4 DRAFT created through beginEdit, preserving every published
// version byte-for-byte.
//
// Pure module: no DOM, no fetch, no clock (asOf passed in), no randomness.

import { PROGRESSION_ENGINE_VERSION, progressionFlagDef } from '../types/progression.js';
import { applyProgressionBudget, decideProgression } from './progression-rules.js';
import { beginEdit, appendProgrammeAudit } from './programme-versioning.js';
import { iteratePrescriptions } from './programme-versioning.js';

// ── Plan generation (Part 24/25) ────────────────────────────────────────────

/**
 * Build a deterministic progression plan for one session's prescriptions.
 * @param {Array} items  [{ids, exercise, prescription, equipmentKind, history,
 *                         readiness, match, athlete, restrictions, overrides, ...}]
 *                       in block-priority order (main lifts first).
 * @param {{volumeCategory?:string, rugbyLoad?:number, context?:string, asOf:string}} session
 */
export function buildProgressionPlan(items = [], session = {}) {
  const { volumeCategory = 'moderate', rugbyLoad = 0, context = 'unknown', asOf } = session;
  const raw = items.map((item) => decideProgression({ ...item, asOf }));
  const { decisions, budget, used } = applyProgressionBudget(raw, { volumeCategory, rugbyLoad, context });

  const flagIds = new Set();
  for (const d of decisions) for (const f of d.flags) flagIds.add(f.id);
  const flags = [...flagIds].sort().map((id) => {
    const def = progressionFlagDef(id);
    return { id, severity: def?.severity || 'warning', label: def?.label || id };
  });
  const requiresReview = decisions.some((d) => d.requiresReview);
  const blocked = decisions.some((d) => d.outcome === 'blocked');

  return {
    kind: 'progression_plan',
    engineVersion: PROGRESSION_ENGINE_VERSION,
    provisional: true,
    asOf,
    context,
    budget: { allowed: budget, used },
    decisions,
    flags,
    requiresReview,
    blocked,
    // Contract, restated in data: nothing here executes or publishes.
    isCompletedWorkout: false,
    isPublishedProgramme: false,
    coachApprovalRequired: requiresReview || blocked || decisions.some((d) => d.outcome === 'progress_complexity'),
  };
}

// ── SC4 versioning seam (Part 23) ───────────────────────────────────────────

/**
 * Apply an APPROVED progression plan's proposed set-field changes to an SC4
 * programme as a new/updated DRAFT version. Published and superseded
 * versions are frozen by SC4 and are never touched; historical assignment
 * snapshots are untouched by construction.
 *
 * Only numeric kg loads and structural fields translate onto SC4 set
 * prescriptions; anything else (percentages of unresolved references,
 * effort-only targets) is left for coach completion and reported back.
 *
 * @returns {{draft:object, applied:Array, skipped:Array}}
 */
export function applyPlanToProgrammeDraft(programme, plan, { actor = null, now = null } = {}) {
  if (plan.kind !== 'progression_plan') throw new Error('not_a_progression_plan');
  if (plan.blocked) throw new Error('plan_blocked');
  const draft = beginEdit(programme, { actor, now });

  const byExercise = new Map();
  for (const d of plan.decisions) {
    if (d.proposedPrescription && d.outcome !== 'blocked') byExercise.set(d.exerciseId, d);
  }
  const applied = [];
  const skipped = [];
  for (const p of iteratePrescriptions(draft)) {
    const d = byExercise.get(p.exerciseId);
    if (!d) continue;
    const proposed = d.proposedPrescription;
    let touched = false;
    for (const set of p.sets || []) {
      if (proposed.sets != null && set.fields.sets != null) { set.fields.sets = proposed.sets; touched = true; }
      if (proposed.repRange && set.fields.reps != null) { set.fields.reps = `${proposed.repRange[0]}-${proposed.repRange[1]}`; touched = true; }
      // Absolute kg loads never overwrite percentage-based sets — those keep
      // their scheme until a coach resolves the reference.
      if (proposed.load?.type === 'kg' && Number.isFinite(proposed.load.value) && set.fields.percentage == null) {
        set.fields.load = proposed.load.value; touched = true;
      }
      if (proposed.rpeTarget != null && set.fields.rpe != null) { set.fields.rpe = proposed.rpeTarget; touched = true; }
      if (proposed.durationSec != null && set.fields.durationSec != null) { set.fields.durationSec = proposed.durationSec; touched = true; }
    }
    if (touched) applied.push({ exerciseId: p.exerciseId, outcome: d.outcome });
    else skipped.push({ exerciseId: p.exerciseId, cause: 'no_translatable_fields' });
  }
  draft.audit = appendProgrammeAudit(draft.audit, {
    action: 'progression_applied', actor, at: now,
    detail: `plan ${plan.asOf}: ${applied.length} applied, ${skipped.length} skipped`,
  });
  programme.audit = appendProgrammeAudit(programme.audit, {
    action: 'progression_draft_updated', actor, at: now, detail: `v${draft.versionNumber}`,
  });
  return { draft, applied, skipped };
}
