// CoachEasier Performance — programme domain model & taxonomies (SC4).
//
// The complete programme hierarchy every future S&C feature builds on:
//
//   Programme → ProgrammeVersion → Phase → Week → TrainingDay → Session
//     → Block → (ExerciseCollection ref, optional) → ExercisePrescription
//     → SetPrescription
//
// This module defines SHAPES and CONTROLLED VOCABULARIES only. It creates
// no programmes, generates no workouts and prescribes no loads. Pure
// module: no DOM, no fetch, no localStorage.

export const PROGRAMME_SCHEMA_VERSION = 1;

// ── Node kinds (hierarchy levels) ───────────────────────────────────────────

export const NODE_KINDS = [
  'programme', 'programme_version', 'phase', 'week', 'training_day',
  'session', 'block', 'exercise_prescription', 'set_prescription',
];

// ── Lifecycle ───────────────────────────────────────────────────────────────

export const PROGRAMME_STATUSES = ['draft', 'in_review', 'approved', 'archived'];
export const VERSION_STATUSES = ['draft', 'published', 'superseded'];
// Node-level status: planning state only — never an execution/logging state.
export const NODE_STATUSES = ['planned', 'optional', 'removed'];

// ── Ownership & visibility (mirrors the SC3 exercise tiers) ─────────────────

export const PROGRAMME_OWNER_TYPES = [
  { id: 'coacheasier', label: 'CoachEasier' },   // platform templates/programmes
  { id: 'club',        label: 'Club' },
  { id: 'coach',       label: 'Coach (private)' },
];

// ── Programme-level vocabularies ────────────────────────────────────────────

export const PROGRAMME_SPORTS = ['rugby_union'];

// Goal ids align with the SC2 athlete goals / SC3 relevance ids.
export const PROGRAMME_GOALS = [
  'max_strength', 'power', 'body_mass_gain', 'body_fat_reduction',
  'acceleration', 'max_speed', 'conditioning', 'preseason_prep',
  'inseason_maintenance', 'return_to_training', 'position_development',
];

export const PROGRAMME_SEASONS = ['off_season', 'pre_season', 'in_season', 'post_season', 'year_round'];

// ── Phase types ─────────────────────────────────────────────────────────────
// return_to_general_training is a normal training phase for athletes coming
// back from a break. It is NOT rehabilitation — no rehab phase exists.

export const PHASE_TYPES = [
  { id: 'off_season',  label: 'Off-Season' },
  { id: 'pre_season',  label: 'Pre-Season' },
  { id: 'in_season',   label: 'In-Season' },
  { id: 'peak',        label: 'Peak' },
  { id: 'taper',       label: 'Taper' },
  { id: 'return_to_general_training', label: 'Return to General Training' },
];

// ── Training day ────────────────────────────────────────────────────────────

export const TRAINING_DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'unscheduled'];
export const DAY_PRIORITIES = ['primary', 'secondary', 'optional'];
// Relationship of a gym day to the rugby calendar — descriptive only.
export const RUGBY_RELATIONS = [
  'none', 'same_day_before_rugby', 'same_day_after_rugby',
  'day_before_match', 'match_day', 'day_after_match',
];

// ── Session ─────────────────────────────────────────────────────────────────

export const SESSION_PURPOSES = [
  'strength', 'power', 'speed', 'conditioning', 'mixed',
  'recovery', 'testing', 'primer',
];

// ── Blocks ──────────────────────────────────────────────────────────────────

export const BLOCK_TYPES = [
  { id: 'warmup',        label: 'Warm-up' },
  { id: 'activation',    label: 'Activation' },
  { id: 'power',         label: 'Power' },
  { id: 'main_strength', label: 'Main Strength' },
  { id: 'accessory',     label: 'Accessory' },
  { id: 'conditioning',  label: 'Conditioning' },
  { id: 'mobility',      label: 'Mobility' },
  { id: 'cooldown',      label: 'Cooldown' },
];

// ── Substitution policy on a prescription ───────────────────────────────────
// Controls what the FUTURE engine/coach tools may offer. Never medical.

export const SUBSTITUTION_POLICIES = [
  'coach_only',          // only a coach may substitute
  'structural_allowed',  // SC3 structural candidates may be offered
  'none',                // exercise is fixed (e.g. testing day)
];

// ── Set prescription fields ─────────────────────────────────────────────────
// STRUCTURE ONLY. Values are authored numbers/strings — nothing here is
// calculated, recommended or resolved (a percentage stays a number; no 1RM
// lookup exists). `maps` ties each field to the SC3 prescription-type id an
// exercise must declare before the field may be used for it.

export const SET_FIELDS = [
  { id: 'sets',       maps: 'sets_reps',    type: 'int' },
  { id: 'reps',       maps: 'sets_reps',    type: 'int_or_range' },
  { id: 'load',       maps: 'load',         type: 'number' },        // kg, authored
  { id: 'percentage', maps: 'percentage',   type: 'number' },        // % of a named reference, unresolved
  { id: 'rpe',        maps: 'rpe',          type: 'number' },
  { id: 'rir',        maps: 'rir',          type: 'number' },
  { id: 'tempo',      maps: 'tempo',        type: 'string' },        // e.g. "3-1-X-0"
  { id: 'restSec',    maps: 'rest',         type: 'int' },
  { id: 'distanceM',  maps: 'distance',     type: 'number' },
  { id: 'durationSec',maps: 'duration',     type: 'int' },
  { id: 'speed',      maps: 'speed_target', type: 'string' },        // authored target, e.g. "≥90% best"
  { id: 'holdSec',    maps: 'hold',         type: 'int' },
  { id: 'perSide',    maps: 'per_side',     type: 'bool' },
  { id: 'rounds',     maps: 'rounds',       type: 'int' },
  { id: 'densityMin', maps: 'density',      type: 'int' },
  { id: 'workRest',   maps: 'work_rest',    type: 'string' },        // e.g. "1:3"
];

export const SET_FIELD_IDS = SET_FIELDS.map((f) => f.id);
