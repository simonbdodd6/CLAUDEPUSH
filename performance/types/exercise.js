// CoachEasier Performance — canonical exercise model & taxonomies (SC3).
//
// Controlled vocabularies and data shapes for the validated exercise
// library. Pure module: no DOM, no fetch, no localStorage.
//
// The future programme engine may select ONLY exercises whose tier is
// 'validated' and whose approval status is 'approved' (see
// domain/exercise-visibility.js). Nothing in this model diagnoses,
// treats, or clears anyone for play.

export const EXERCISE_SCHEMA_VERSION = 1;

// ── Lifecycle ───────────────────────────────────────────────────────────────

export const EXERCISE_STATUSES = ['draft', 'in_review', 'approved', 'archived'];

export const CONTENT_TIERS = [
  { id: 'validated', label: 'CoachEasier Validated', engineEligible: true },
  { id: 'draft',     label: 'CoachEasier Draft',     engineEligible: false },
  { id: 'club',      label: 'Club Exercise',         engineEligible: false },
  { id: 'private',   label: 'Coach Private',         engineEligible: false },
];

// ── Classification taxonomies ───────────────────────────────────────────────

export const EXERCISE_CATEGORIES = [
  { id: 'warmup',       label: 'Warm-up' },
  { id: 'activation',   label: 'Activation' },
  { id: 'mobility',     label: 'Mobility' },
  { id: 'power',        label: 'Power' },
  { id: 'strength',     label: 'Strength' },
  { id: 'hypertrophy',  label: 'Hypertrophy' },
  { id: 'accessory',    label: 'Accessory' },
  { id: 'trunk',        label: 'Trunk' },
  { id: 'neck',         label: 'Neck' },
  { id: 'sprint',       label: 'Sprint' },
  { id: 'agility',      label: 'Agility' },
  { id: 'plyometric',   label: 'Plyometric' },
  { id: 'conditioning', label: 'Conditioning' },
  { id: 'contact_prep', label: 'Contact Prep' },
  { id: 'recovery',     label: 'Recovery' },
  { id: 'cooldown',     label: 'Cooldown' },
  { id: 'testing',      label: 'Testing' },
];

export const MOVEMENT_PATTERNS = [
  { id: 'squat',              label: 'Squat' },
  { id: 'hinge',              label: 'Hinge' },
  { id: 'horizontal_push',    label: 'Horizontal Push' },
  { id: 'vertical_push',      label: 'Vertical Push' },
  { id: 'horizontal_pull',    label: 'Horizontal Pull' },
  { id: 'vertical_pull',      label: 'Vertical Pull' },
  { id: 'lunge',              label: 'Lunge' },
  { id: 'step',               label: 'Step' },
  { id: 'carry',              label: 'Carry' },
  { id: 'rotation',           label: 'Rotation' },
  { id: 'anti_rotation',      label: 'Anti-rotation' },
  { id: 'anti_extension',     label: 'Anti-extension' },
  { id: 'anti_lateral_flexion', label: 'Anti-lateral-flexion' },
  { id: 'locomotion',         label: 'Locomotion' },
  { id: 'acceleration',       label: 'Acceleration' },
  { id: 'max_velocity',       label: 'Maximum Velocity' },
  { id: 'deceleration',       label: 'Deceleration' },
  { id: 'jump',               label: 'Jump' },
  { id: 'land',               label: 'Landing' },
  { id: 'throw',              label: 'Throw' },
  { id: 'neck_flexion',       label: 'Neck Flexion' },
  { id: 'neck_extension',     label: 'Neck Extension' },
  { id: 'neck_lateral',       label: 'Neck Lateral Flexion' },
  { id: 'isometric_contact',  label: 'Isometric Contact Position' },
];

export const PHYSICAL_QUALITIES = [
  { id: 'max_strength',     label: 'Maximal Strength' },
  { id: 'relative_strength',label: 'Relative Strength' },
  { id: 'hypertrophy',      label: 'Hypertrophy' },
  { id: 'rfd',              label: 'Rate of Force Development' },
  { id: 'power',            label: 'Power' },
  { id: 'acceleration',     label: 'Acceleration' },
  { id: 'max_velocity',     label: 'Maximum Velocity' },
  { id: 'repeat_sprint',    label: 'Repeat Sprint Ability' },
  { id: 'aerobic',          label: 'Aerobic Capacity' },
  { id: 'anaerobic',        label: 'Anaerobic Capacity' },
  { id: 'trunk_capacity',   label: 'Trunk Capacity' },
  { id: 'neck_capacity',    label: 'Neck Capacity' },
  { id: 'mobility',         label: 'Mobility' },
  { id: 'stability',        label: 'Stability' },
  { id: 'robustness',       label: 'Robustness' },
  { id: 'coordination',     label: 'Coordination' },
  { id: 'technical_skill',  label: 'Technical Skill' },
];

export const BODY_REGIONS = ['lower', 'upper', 'trunk', 'neck', 'full_body'];
export const PLANES = ['sagittal', 'frontal', 'transverse', 'multi'];
export const LATERALITY = ['bilateral', 'unilateral', 'alternating'];
export const CHAIN_TYPES = ['open', 'closed', 'mixed', 'na'];
export const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced'];
export const IMPACT_LEVELS = ['low', 'moderate', 'high'];
export const COMPLEXITY_LEVELS = ['simple', 'moderate', 'complex'];

// ── Equipment taxonomy ──────────────────────────────────────────────────────
// Normalised catalogue aligned with the SC2 athlete equipment model
// (performance/types/athlete-profile.js EQUIPMENT_ITEMS / _LOCATIONS).
// `athleteItem` maps to the athlete-profile item id that satisfies it;
// null means the requirement is a facility/space attribute instead.

export const EQUIPMENT_CATALOGUE = [
  { id: 'barbell',      label: 'Barbell & plates',   athleteItem: 'barbell' },
  { id: 'rack',         label: 'Squat rack',         athleteItem: 'rack' },
  { id: 'bench',        label: 'Bench',              athleteItem: 'bench' },
  { id: 'dumbbells',    label: 'Dumbbells',          athleteItem: 'dumbbells' },
  { id: 'kettlebells',  label: 'Kettlebells',        athleteItem: 'kettlebells' },
  { id: 'machines',     label: 'Machine / cable',    athleteItem: 'machines' },
  { id: 'bands',        label: 'Resistance bands',   athleteItem: 'bands' },
  { id: 'med_balls',    label: 'Medicine ball',      athleteItem: 'med_balls' },
  { id: 'sled',         label: 'Sled',               athleteItem: 'sled' },
  { id: 'turf',         label: 'Turf / open floor',  athleteItem: 'turf' },
  { id: 'sprint_space', label: 'Sprint space',       athleteItem: 'sprint_space' },
  { id: 'cardio',       label: 'Cardio machine',     athleteItem: 'cardio' },
  { id: 'plyo_box',     label: 'Plyo box',           athleteItem: null },
  { id: 'trap_bar',     label: 'Trap bar',           athleteItem: 'barbell' },
  { id: 'pullup_bar',   label: 'Pull-up bar',        athleteItem: null },
  { id: 'partner',      label: 'Partner',            athleteItem: null },
  { id: 'wall',         label: 'Wall',               athleteItem: null },
  { id: 'none',         label: 'No equipment',       athleteItem: null },
];

export const SPACE_REQUIREMENTS = ['spot', 'small_area', 'open_area', 'track_20m', 'track_40m'];
export const SURFACE_REQUIREMENTS = ['any', 'gym_floor', 'turf_or_grass', 'track'];
export const SETUP_COMPLEXITY = ['none', 'quick', 'involved'];

// ── Prescription capability taxonomy ────────────────────────────────────────

export const PRESCRIPTION_TYPES = [
  { id: 'sets_reps',    label: 'Sets × reps' },
  { id: 'load',         label: 'Load (kg)' },
  { id: 'percentage',   label: '% of reference' },
  { id: 'rpe',          label: 'RPE' },
  { id: 'rir',          label: 'RIR' },
  { id: 'tempo',        label: 'Tempo' },
  { id: 'rest',         label: 'Rest' },
  { id: 'duration',     label: 'Duration' },
  { id: 'distance',     label: 'Distance' },
  { id: 'speed_target', label: 'Speed target' },
  { id: 'work_rest',    label: 'Work:rest ratio' },
  { id: 'hold',         label: 'Hold time' },
  { id: 'per_side',     label: 'Per side' },
  { id: 'rounds',       label: 'Rounds' },
  { id: 'density',      label: 'Density block' },
  { id: 'quality',      label: 'Technical-quality target' },
];

// ── Safety taxonomy ─────────────────────────────────────────────────────────
// Contraindication/precaution TAGS are routing signals for coach/staff
// review — they are never diagnoses and never drive automatic substitution.

export const CONTRAINDICATION_TAGS = [
  'acute_pain_reported', 'recent_concussion_protocol', 'unresolved_neck_issue',
  'unresolved_shoulder_issue', 'unresolved_knee_issue', 'unresolved_back_issue',
  'unresolved_hamstring_issue', 'load_restriction_in_place',
];
export const PRECAUTION_TAGS = [
  'requires_supervision', 'requires_spotter', 'youth_technique_first',
  'high_fatigue_sensitivity', 'grass_wet_surface_care',
];
export const YOUTH_SUITABILITY = ['suitable', 'technique_only', 'not_recommended', 'needs_review'];

// ── Relationships ───────────────────────────────────────────────────────────

export const RELATIONSHIP_KINDS = [
  'regression', 'progression', 'equipment_alternative', 'pattern_alternative',
  'lower_impact_alternative', 'time_saving_alternative', 'prerequisite',
];

// ── Sport & rugby relevance ─────────────────────────────────────────────────

export const RELEVANCE_LEVELS = ['core', 'high', 'medium', 'low'];

// Rugby positions (aligned with SC2 athlete profile position ids).
export const RUGBY_POSITION_IDS = [
  'loosehead_prop', 'hooker', 'tighthead_prop', 'lock',
  'blindside_flanker', 'openside_flanker', 'number_8',
  'scrum_half', 'fly_half', 'inside_centre', 'outside_centre', 'wing', 'full_back',
];

// Goal ids aligned with SC2 GOAL_TYPES, plus season phases.
export const GOAL_RELEVANCE_IDS = [
  'max_strength', 'power', 'body_mass_gain', 'body_fat_reduction',
  'acceleration', 'max_speed', 'conditioning', 'preseason_prep',
  'inseason_maintenance', 'return_to_training', 'position_development',
];
export const SEASON_PHASE_IDS = ['off_season', 'pre_season', 'in_season', 'post_season'];
export const DEVELOPMENT_LEVELS = ['beginner', 'intermediate', 'advanced'];

// ── Media ───────────────────────────────────────────────────────────────────

export const MEDIA_STATUSES = ['placeholder', 'in_production', 'review', 'published'];
export const MEDIA_KINDS = ['thumbnail', 'image', 'image_sequence', 'video', 'loop'];

// ── Human review gates ──────────────────────────────────────────────────────

export const REVIEW_GATES = [
  { id: 'snc',         label: 'Qualified S&C coach' },
  { id: 'medical',     label: 'Physio / sports-medicine adviser' },
  { id: 'safeguarding',label: 'Safeguarding adviser' },
  { id: 'privacy',     label: 'Privacy adviser' },
  { id: 'media',       label: 'Media / copyright owner' },
];

/**
 * @typedef {Object} Exercise — canonical record; see docs/exercise-library.md.
 * Field groups: identity, classification, equipment, prescription,
 * coaching, safety, relationships, relevance, media, ownership.
 * All list-type classification fields hold taxonomy ids from this module.
 */
