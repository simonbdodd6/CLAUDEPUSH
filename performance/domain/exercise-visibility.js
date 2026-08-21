// CoachEasier Performance — exercise ownership, tiers & approval (SC3).
//
// Product-level rules for who sees, edits, approves and publishes exercise
// content, and what the future programme engine may select from. Pure
// module: no DOM, no fetch, no localStorage.

import { CONTENT_TIERS } from '../types/exercise.js';

// Viewer roles reuse the SC2 visibility vocabulary (domain/visibility.js):
// player, team_coach, snc_coach, club_admin, system_admin. Medical/parent
// roles have no exercise-library powers beyond viewing validated content.

// ── Visibility ──────────────────────────────────────────────────────────────

/**
 * Can `viewer` see this exercise in the library?
 * @param {object} ex        exercise record
 * @param {{role:string, userId?:string, clubId?:string}} viewer
 */
export function canViewExercise(ex, viewer = {}) {
  if (!ex) return false;
  const role = viewer.role || 'player';
  if (role === 'system_admin') return true;

  if (ex.status === 'archived') {
    // Archived content is hidden everywhere except owner/coach management views.
    return isOwner(ex, viewer) || role === 'snc_coach' || role === 'club_admin';
  }
  switch (ex.tier) {
    case 'validated':
      return ex.status === 'approved' || role === 'snc_coach'; // drafts of validated tier stay staff-side
    case 'draft':
      return role === 'snc_coach'; // internal/beta only
    case 'club':
      return sameClub(ex, viewer) && (ex.status === 'approved' || role === 'snc_coach' || role === 'club_admin');
    case 'private':
      return isOwner(ex, viewer) || isSharedWith(ex, viewer);
    default:
      return false;
  }
}

function isOwner(ex, viewer) {
  return !!viewer.userId && ex.ownership?.ownerCoach === viewer.userId;
}
function sameClub(ex, viewer) {
  return !!viewer.clubId && ex.ownership?.ownerClub === viewer.clubId;
}
function isSharedWith(ex, viewer) {
  return !!viewer.userId && (ex.ownership?.sharedWith || []).includes(viewer.userId);
}

/** Filter a catalogue down to what a viewer may see. */
export function visibleExercises(list, viewer) {
  return (list || []).filter((ex) => canViewExercise(ex, viewer));
}

// ── Action permissions ──────────────────────────────────────────────────────
// Matrix: create/edit/approve/archive/restore/publish per tier.

const ACTIONS = ['create', 'edit', 'approve', 'archive', 'restore', 'publish'];

/**
 * Can `viewer` perform `action` on content of `tier`?
 * CoachEasier-tier actions belong to the platform (system_admin) — clubs and
 * coaches manage only their own tiers. Approval always requires someone
 * OTHER than the author (enforced in canApproveRecord).
 */
export function canPerformAction(action, tier, viewer = {}) {
  if (!ACTIONS.includes(action)) return false;
  const role = viewer.role || 'player';
  if (role === 'system_admin') return true;
  if (role === 'player' || role === 'medical' || role === 'parent' || role === 'team_coach') return false;

  if (tier === 'validated' || tier === 'draft') return false; // platform-owned tiers
  if (tier === 'club') {
    if (role === 'club_admin') return true;                    // full lifecycle for their club
    if (role === 'snc_coach') return action !== 'approve';     // coaches author; club admin approves
    return false;
  }
  if (tier === 'private') {
    return role === 'snc_coach';                               // own private content, all actions
  }
  return false;
}

/** Approval additionally requires an independent reviewer. */
export function canApproveRecord(ex, viewer = {}) {
  if (!canPerformAction('approve', ex.tier, viewer)) return false;
  return ex.ownership?.author !== viewer.userId;
}

// ── Engine eligibility ──────────────────────────────────────────────────────

/**
 * May the future programme engine AUTOMATICALLY select this exercise?
 * Only approved, non-archived, CoachEasier-validated records qualify.
 * Club and private content reaches athletes only through explicit
 * coach assignment — never through automatic selection.
 */
export function isEngineEligible(ex) {
  const tier = CONTENT_TIERS.find((t) => t.id === ex?.tier);
  return !!tier && tier.engineEligible && ex.status === 'approved';
}

/** May a coach explicitly assign this exercise to their athletes? */
export function isAssignableByCoach(ex, viewer = {}) {
  if (!canViewExercise(ex, viewer)) return false;
  if (ex.status === 'archived') return false;
  if (ex.tier === 'draft') return false;         // never assignable pre-review
  if (ex.tier === 'private') return isOwner(ex, viewer);
  return ex.status === 'approved';
}

// ── Update & snapshot rules ─────────────────────────────────────────────────

/**
 * What a historical workout must snapshot at assignment time so that later
 * edits to the exercise definition never silently change past
 * prescriptions. Returns a frozen, minimal copy.
 */
export function snapshotForAssignment(ex, now = null) {
  return Object.freeze({
    exerciseId: ex.id,
    version: ex.version,
    name: ex.name,
    displayName: ex.displayName || ex.name,
    tier: ex.tier,
    classification: {
      category: ex.classification?.category || null,
      pattern: ex.classification?.pattern || null,
    },
    prescription: [...(ex.prescription || [])],
    safetyNotes: [...(ex.safety?.notes || [])],
    painStop: ex.safety?.painStop || null,
    snapshotAt: now,
  });
}

/**
 * Editing an exercise that has ever been assigned must bump its version;
 * existing assignments keep their snapshot (old version), new assignments
 * pick up the new version. This rule states the contract for the future
 * store — SC3 has no assignment storage yet.
 */
export function nextVersionOnEdit(ex, { hasBeenAssigned = false } = {}) {
  return hasBeenAssigned ? (Number(ex.version) || 1) + 1 : (Number(ex.version) || 1);
}
