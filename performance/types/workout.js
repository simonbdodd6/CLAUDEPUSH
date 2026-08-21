// CoachEasier Performance — workout execution vocabularies (SC7).
//
// Controlled vocabularies for workout sessions, exercise/set logs,
// persistence and audit. SC7 EXECUTES prescriptions — it never invents
// programme logic (SC5 decides structure, SC6 decides progression).
//
// Pure module: no DOM, no fetch, no localStorage, no clock, no randomness.

export const WORKOUT_SCHEMA_VERSION = 1;
export { PROVISIONAL } from './coaching.js';

// ── Session lifecycle ───────────────────────────────────────────────────────

export const SESSION_STATUSES = [
  'not_started', 'in_progress', 'paused', 'completed', 'abandoned', 'stopped_for_review',
];

// ── Set log statuses (aligned with the SC6 failure taxonomy) ────────────────

export const SET_LOG_STATUSES = [
  'pending', 'completed', 'partial', 'failed_effort', 'failed_technical',
  'aborted', 'pain_stop', 'skipped',
];

// Map SC7 set statuses onto SC6 set-result vocabulary for exposure records.
export const SET_STATUS_TO_SC6 = {
  completed: 'completed',
  partial: 'partial',
  failed_effort: 'effort_failure',
  failed_technical: 'technical_failure',
  aborted: 'aborted',
  pain_stop: 'pain_stop',
  skipped: 'missed_target',
};

export const TECHNIQUE_STATUSES = ['good', 'okay', 'broke_down', null];

// ── Exercise log completion states ──────────────────────────────────────────

export const EXERCISE_LOG_STATUSES = ['pending', 'in_progress', 'completed', 'partial', 'skipped', 'substituted', 'pain_stopped'];

// ── Substitution reasons (player-facing; pain is NOT one of them) ───────────

export const SUBSTITUTION_REQUEST_REASONS = [
  { id: 'equipment_unavailable', label: 'Equipment unavailable' },
  { id: 'exercise_unavailable',  label: 'Station/space unavailable' },
  { id: 'time_constraint',       label: 'Short on time' },
  { id: 'preference',            label: 'Preference' },
];

// ── Sync status (honest — no false "synced" claims in the prototype) ────────

export const SYNC_STATUSES = [
  { id: 'device',  label: 'Saved on device' },
  { id: 'pending', label: 'Sync pending' },
  { id: 'synced',  label: 'Synced' },
];

// ── Audit actions ───────────────────────────────────────────────────────────

export const WORKOUT_AUDIT_ACTIONS = [
  'workout_started', 'workout_resumed', 'workout_paused', 'exercise_substituted',
  'set_completed', 'set_failed', 'set_skipped', 'exercise_stopped_pain',
  'session_completed', 'session_abandoned', 'progression_preview_generated',
  'readiness_recorded',
];
export const WORKOUT_AUDIT_MAX = 200;

// ── Rest timer defaults ─────────────────────────────────────────────────────

export const DEFAULT_REST_SEC = 120;

// ── Plate calculator — PROVISIONAL equipment assumptions ────────────────────

export const BAR_WEIGHTS_KG = [20, 15, 10];
export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];

// ── Warm-up suggestions — PROVISIONAL_REQUIRES_SNC_REVIEW ───────────────────
// Conservative ramp derived from the working target. Suggestions only:
// clearly labelled, never counted as prescribed work, always skippable,
// never required to use the product.

export const WARMUP_RAMP = [
  { percent: 40, reps: 5 },
  { percent: 60, reps: 3 },
  { percent: 80, reps: 2 },
];
export const WARMUP_MIN_WORKING_KG = 40; // below this a general warm-up note suffices

// ── Pain-stop guidance (fixed wording; strictly non-medical) ────────────────

export const PAIN_STOP_GUIDANCE =
  'Exercise stopped. Do not train through pain — this is not something the app can assess. ' +
  'Flag it to an appropriate member of staff for review before loading this movement again. ' +
  'You can continue with unrelated exercises if they feel completely fine.';
