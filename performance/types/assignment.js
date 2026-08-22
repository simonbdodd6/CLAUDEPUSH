// CoachEasier Performance — programme assignment types (SC8).
//
// An ASSIGNMENT is the link between one athlete and one PUBLISHED programme
// version. It is the record that makes the engine real: SC7 executes what an
// assignment points at, and SC6 reads the exposures that come back.
//
// Two rules shape everything here:
//
//   1. An assignment pins an IMMUTABLE version snapshot. Editing a programme
//      later creates a new version; it never rewrites what an athlete was
//      given, and never rewrites the workouts they already logged.
//   2. Context is captured AT ASSIGNMENT TIME. A player who moves from U18 to
//      Seniors next season does not retroactively change the group, team or
//      development context their past assignments were made under.
//
// Pure module: no DOM, no fetch, no clock, no randomness.

export const ASSIGNMENT_SCHEMA_VERSION = 1;

/**
 * Lifecycle.
 *
 *   draft      — being prepared, not visible to the athlete
 *   scheduled  — approved and dated, startDate is in the future
 *   active     — the athlete's current programme; Today resolves from it
 *   paused     — deliberately suspended; NO Today workout, history preserved
 *   completed  — ran to its end date / final week
 *   replaced   — superseded by an explicit replacement assignment
 *   cancelled  — called off; never ran, or stopped early without replacement
 *
 * Terminal states (never reopen — create a new assignment instead):
 *   completed, replaced, cancelled
 */
export const ASSIGNMENT_STATUSES = [
  'draft', 'scheduled', 'active', 'paused', 'completed', 'replaced', 'cancelled',
];

export const TERMINAL_ASSIGNMENT_STATUSES = ['completed', 'replaced', 'cancelled'];

/** States in which an athlete may be served a Today workout. */
export const LIVE_ASSIGNMENT_STATUSES = ['scheduled', 'active'];

/** States that occupy the athlete's single primary slot. */
export const OCCUPYING_ASSIGNMENT_STATUSES = ['scheduled', 'active', 'paused'];

/** How the assigned programme came to exist. */
export const ASSIGNMENT_SOURCES = [
  'coach_authored',        // coach built it by hand
  'blueprint_generated',   // SC5 deterministic blueprint, coach-reviewed
  'template_instance',     // instantiated from an approved template
];

/** Why an assignment left its previous state — audit-grade, not free text. */
export const ASSIGNMENT_ACTIONS = [
  'assignment_created', 'assignment_scheduled', 'assignment_activated',
  'assignment_paused', 'assignment_resumed', 'assignment_completed',
  'assignment_replaced', 'assignment_cancelled', 'progression_suggested',
  'progression_reviewed',
];

/**
 * Progression review states (SC8 seam for SC6 output).
 * A suggestion is EVIDENCE presented to a coach. It never publishes itself
 * and never edits an active programme — see docs/progression-approval.md.
 */
export const PROGRESSION_REVIEW_STATUSES = ['pending', 'accepted', 'modified', 'rejected'];

export const ASSIGNMENT_AUDIT_MAX = 100;
