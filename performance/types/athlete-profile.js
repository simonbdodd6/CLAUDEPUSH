// CoachEasier Performance — canonical athlete profile model (SC2).
//
// Data shapes and enumerations only. The profile REFERENCES existing
// CoachEasier identities (user/member id, team id, club id) — it never
// duplicates roster, account or club records. Pure module: no DOM, no
// fetch, no localStorage.
//
// Terminology note: nothing in this model is a medical diagnosis. Player
// reports (wellness, pain) are self-reported context; restricted health
// fields are administrative records entered under explicit permissions.

export const PROFILE_VERSION = 1;

export const PROFILE_STATUSES = ['draft', 'active', 'archived'];

/** Answered-but-unknown sentinel. `null`/undefined means "not answered yet";
 *  UNKNOWN means the athlete chose "don't know / prefer not to say", which is
 *  always a valid, completion-counting answer. */
export const UNKNOWN = 'unknown';

// ── Identity & rugby ────────────────────────────────────────────────────────

export const RUGBY_POSITIONS = [
  { id: 'loosehead_prop',   label: 'Loosehead Prop',   unit: 'forwards' },
  { id: 'hooker',           label: 'Hooker',           unit: 'forwards' },
  { id: 'tighthead_prop',   label: 'Tighthead Prop',   unit: 'forwards' },
  { id: 'lock',             label: 'Lock',             unit: 'forwards' },
  { id: 'blindside_flanker',label: 'Blindside Flanker',unit: 'forwards' },
  { id: 'openside_flanker', label: 'Openside Flanker', unit: 'forwards' },
  { id: 'number_8',         label: 'Number 8',         unit: 'forwards' },
  { id: 'scrum_half',       label: 'Scrum-half',       unit: 'backs' },
  { id: 'fly_half',         label: 'Fly-half',         unit: 'backs' },
  { id: 'inside_centre',    label: 'Inside Centre',    unit: 'backs' },
  { id: 'outside_centre',   label: 'Outside Centre',   unit: 'backs' },
  { id: 'wing',             label: 'Wing',             unit: 'backs' },
  { id: 'full_back',        label: 'Full-back',        unit: 'backs' },
  { id: 'utility_forward',  label: 'Utility Forward',  unit: 'forwards' },
  { id: 'utility_back',     label: 'Utility Back',     unit: 'backs' },
];

export const PLAYING_LEVELS = [
  { id: 'youth',        label: 'Youth / Age grade' },
  { id: 'school',       label: 'School' },
  { id: 'amateur_club', label: 'Amateur club' },
  { id: 'semi_pro',     label: 'Semi-professional' },
  { id: 'professional', label: 'Professional' },
  { id: 'representative', label: 'Representative / Academy' },
];

export const SEASON_PHASES = [
  { id: 'off_season',  label: 'Off-season' },
  { id: 'pre_season',  label: 'Pre-season' },
  { id: 'in_season',   label: 'In-season' },
  { id: 'post_season', label: 'Post-season break' },
];

// ── Personal programming data ───────────────────────────────────────────────

// Age bands are the programming-safe representation; date of birth is
// optional and, when present, is only ever reduced to a band for engine use.
export const AGE_BANDS = [
  { id: 'under_16', label: 'Under 16', youth: true },
  { id: '16_17',    label: '16–17',    youth: true },
  { id: '18_20',    label: '18–20',    youth: false },
  { id: '21_29',    label: '21–29',    youth: false },
  { id: '30_34',    label: '30–34',    youth: false },
  { id: '35_plus',  label: '35+',      youth: false },
];

export const SEX_OPTIONS = [
  { id: 'male',   label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: UNKNOWN,  label: 'Prefer not to say' },
];

export const DOMINANT_SIDES = [
  { id: 'right', label: 'Right' },
  { id: 'left',  label: 'Left' },
  { id: 'mixed', label: 'Mixed' },
  { id: UNKNOWN, label: 'Not sure' },
];

export const WEIGHT_UNITS = ['kg', 'lb'];
export const HEIGHT_UNITS = ['cm', 'in'];

// ── Training profile ────────────────────────────────────────────────────────

export const TRAINING_EXPERIENCE_LEVELS = [
  { id: 'new',          label: 'New to gym training',        detail: 'Little or no structured resistance training' },
  { id: 'beginner',     label: 'Beginner',                   detail: 'Under a year of consistent training' },
  { id: 'intermediate', label: 'Intermediate',               detail: '1–3 years, comfortable with main lifts' },
  { id: 'advanced',     label: 'Advanced',                   detail: '3+ years of structured programming' },
];

export const TRAINING_CONSISTENCY = [
  { id: 'consistent',   label: 'Training regularly now' },
  { id: 'intermittent', label: 'On and off recently' },
  { id: 'returning',    label: 'Returning after a break' },
  { id: 'not_training', label: 'Not currently training' },
];

export const PROGRAMME_CURRENT_STATUS = [
  { id: 'none',        label: 'No programme at the moment' },
  { id: 'own_plan',    label: 'Following my own plan' },
  { id: 'club_plan',   label: 'Following a club/team plan' },
  { id: 'other_coach', label: 'Working with another coach' },
];

export const TRAINING_STYLES = [
  { id: 'gym_strength',      label: 'Gym strength work' },
  { id: 'athletic_power',    label: 'Explosive / athletic work' },
  { id: 'conditioning',      label: 'Conditioning focus' },
  { id: 'mixed',             label: 'A mix of everything' },
  { id: 'minimal_equipment', label: 'Minimal-equipment sessions' },
];

export const TECH_CONFIDENCE = [
  { id: 'low',    label: 'I want technique guidance' },
  { id: 'medium', label: 'Comfortable with the basics' },
  { id: 'high',   label: 'Confident with all main lifts' },
];

export const SESSION_DURATIONS = [30, 45, 60, 75, 90];

export const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Strength & performance testing ──────────────────────────────────────────

export const STRENGTH_TESTS = [
  { id: 'squat',          label: 'Squat',               kind: 'load',     variations: ['Back Squat', 'Front Squat', 'Goblet Squat', 'Box Squat'] },
  { id: 'deadlift',       label: 'Deadlift',            kind: 'load',     variations: ['Conventional Deadlift', 'Trap Bar Deadlift', 'Romanian Deadlift'] },
  { id: 'bench_press',    label: 'Bench Press',         kind: 'load',     variations: ['Barbell Bench Press', 'Dumbbell Bench Press', 'Incline Bench Press'] },
  { id: 'overhead_press', label: 'Overhead Press',      kind: 'load',     variations: ['Barbell Overhead Press', 'Dumbbell Shoulder Press', 'Push Press'] },
  { id: 'pull_up',        label: 'Pull-up',             kind: 'reps',     variations: ['Bodyweight Pull-up', 'Weighted Pull-up', 'Chin-up', 'Assisted Pull-up'] },
  { id: 'row',            label: 'Row',                 kind: 'load',     variations: ['Barbell Row', 'Dumbbell Row', 'Chest-supported Row'] },
  { id: 'split_squat',    label: 'Split Squat',         kind: 'load',     variations: ['Rear-foot-elevated Split Squat', 'Walking Lunge', 'Split Squat'] },
  { id: 'clean',          label: 'Clean / Power',       kind: 'load',     variations: ['Power Clean', 'Hang Clean', 'Trap Bar Jump', 'Med Ball Throw'] },
  { id: 'sprint_10m',     label: '10 m Sprint',         kind: 'time',     variations: ['10 m Sprint'] },
  { id: 'sprint_40m',     label: '40 m Sprint',         kind: 'time',     variations: ['40 m Sprint'] },
  { id: 'jump_cmj',       label: 'Countermovement Jump',kind: 'height',   variations: ['Countermovement Jump', 'Squat Jump'] },
  { id: 'jump_broad',     label: 'Broad Jump',          kind: 'distance', variations: ['Standing Broad Jump'] },
  { id: 'bronco',         label: 'Bronco',              kind: 'time',     variations: ['Bronco Test'] },
  { id: 'aerobic',        label: 'Aerobic Test',        kind: 'time',     variations: ['1.2 km Time Trial', '2 km Row', 'Yo-Yo IR1'] },
];

// True one-repetition-maximum testing is NEVER required. Estimates and
// unknowns are first-class values.
export const MEASUREMENT_TYPES = [
  { id: 'estimated_1rm', label: 'Estimated 1RM' },
  { id: 'rep_max',       label: 'Rep max (e.g. 5RM)' },
  { id: 'actual_1rm',    label: 'Tested 1RM' },
  { id: 'reps',          label: 'Max reps' },
  { id: 'time',          label: 'Time' },
  { id: 'distance',      label: 'Distance' },
  { id: 'height',        label: 'Height' },
];

export const RESULT_STATUSES = ['actual', 'estimated', UNKNOWN];

export const RESULT_SOURCES = [
  { id: 'self_reported',  label: 'Self-reported' },
  { id: 'coach_measured', label: 'Coach-measured' },
  { id: 'formula',        label: 'Estimated from reps' },
  { id: 'imported',       label: 'Imported' },
];

// ── Equipment ───────────────────────────────────────────────────────────────

export const EQUIPMENT_LOCATIONS = [
  { id: 'commercial_gym', label: 'Full commercial gym' },
  { id: 'team_gym',       label: 'Club / team gym' },
  { id: 'home_gym',       label: 'Home gym' },
  { id: 'bodyweight_only',label: 'No equipment — bodyweight only' },
];

export const EQUIPMENT_ITEMS = [
  { id: 'barbell',        label: 'Barbell & plates' },
  { id: 'rack',           label: 'Squat rack' },
  { id: 'bench',          label: 'Bench' },
  { id: 'dumbbells',      label: 'Dumbbells' },
  { id: 'kettlebells',    label: 'Kettlebells' },
  { id: 'machines',       label: 'Machines / cables' },
  { id: 'bands',          label: 'Resistance bands' },
  { id: 'med_balls',      label: 'Medicine balls' },
  { id: 'sled',           label: 'Sled' },
  { id: 'turf',           label: 'Turf / open floor' },
  { id: 'sprint_space',   label: 'Sprint space' },
  { id: 'cardio',         label: 'Cardio equipment' },
];

// ── Goals ───────────────────────────────────────────────────────────────────

export const GOAL_TYPES = [
  { id: 'max_strength',        label: 'Maximal strength' },
  { id: 'power',               label: 'Power / explosiveness' },
  { id: 'body_mass_gain',      label: 'Body-mass gain' },
  { id: 'body_fat_reduction',  label: 'Body-fat reduction' },
  { id: 'acceleration',        label: 'Acceleration' },
  { id: 'max_speed',           label: 'Maximum speed' },
  { id: 'conditioning',        label: 'Conditioning / engine' },
  { id: 'preseason_prep',      label: 'Pre-season preparation' },
  { id: 'inseason_maintenance',label: 'In-season maintenance' },
  { id: 'return_to_training',  label: 'Return to training' },
  { id: 'position_development',label: 'Position-specific development' },
];

export const GOAL_STATUSES = ['proposed', 'active', 'achieved', 'paused', 'archived'];
export const GOAL_IMPORTANCE = [1, 2, 3, 4, 5]; // 5 = highest

// ── Readiness & limitations ─────────────────────────────────────────────────

// A. Player-reported wellness — 1–5 scales, appended to a rolling log.
// One entry is a snapshot in time; it never permanently alters the profile.
export const WELLNESS_KEYS = [
  { id: 'sleep',      label: 'Sleep quality',    low: 'Very poor', high: 'Excellent' },
  { id: 'fatigue',    label: 'Energy',           low: 'Exhausted', high: 'Fresh' },
  { id: 'soreness',   label: 'Muscle soreness',  low: 'Very sore', high: 'No soreness' },
  { id: 'stress',     label: 'Stress',           low: 'Very high', high: 'Relaxed' },
  { id: 'motivation', label: 'Motivation',       low: 'Very low',  high: 'Fired up' },
  { id: 'readiness',  label: 'Ready to train',   low: 'Not ready', high: 'Fully ready' },
];
export const WELLNESS_SCALE = [1, 2, 3, 4, 5];
export const WELLNESS_LOG_MAX = 30;

// B. Player-reported pain / limitation — self-reported context, NOT a
// diagnosis. Coarse areas only; anything clinical belongs with qualified
// staff outside this product surface.
export const BODY_AREAS = [
  { id: 'neck',      label: 'Neck' },
  { id: 'shoulder',  label: 'Shoulder' },
  { id: 'back',      label: 'Back' },
  { id: 'hip_groin', label: 'Hip / groin' },
  { id: 'hamstring', label: 'Hamstring' },
  { id: 'quad',      label: 'Quad' },
  { id: 'knee',      label: 'Knee' },
  { id: 'calf_ankle',label: 'Calf / ankle' },
  { id: 'foot',      label: 'Foot' },
  { id: 'arm_hand',  label: 'Arm / hand' },
  { id: 'other',     label: 'Other' },
];
export const PAIN_SEVERITY_SCALE = [1, 2, 3, 4, 5]; // player-perceived, 5 = worst

// C. Restricted health-related information — administrative records under
// explicit permissions (see domain/visibility.js). Not diagnosis data.
export const RETURN_TO_TRAINING_STATUSES = [
  { id: 'full',        label: 'Training fully' },
  { id: 'modified',    label: 'Training with modifications' },
  { id: 'restricted',  label: 'Restricted — awaiting review' },
  { id: UNKNOWN,       label: 'Not recorded' },
];

// D. Coach-entered restrictions.
export const RESTRICTION_VISIBILITY = ['player_and_staff', 'staff_only'];

// ── Onboarding ──────────────────────────────────────────────────────────────

export const ONBOARDING_VERSION = 1;

// `required: true` steps must be complete before submission. Optional steps
// may be skipped and finished later from the profile screen.
export const ONBOARDING_STEPS = [
  { id: 'welcome',   label: 'Welcome',                required: true,  minutes: 0.5 },
  { id: 'rugby',     label: 'Rugby profile',          required: true,  minutes: 1 },
  { id: 'training',  label: 'Training experience',    required: true,  minutes: 1 },
  { id: 'schedule',  label: 'Schedule & availability',required: true,  minutes: 1 },
  { id: 'equipment', label: 'Equipment access',       required: true,  minutes: 0.5 },
  { id: 'goals',     label: 'Goals',                  required: true,  minutes: 1 },
  { id: 'strength',  label: 'Strength baseline',      required: false, minutes: 2 },
  { id: 'readiness', label: 'Readiness & limitations',required: false, minutes: 1 },
  { id: 'privacy',   label: 'Privacy & sharing',      required: true,  minutes: 0.5 },
  { id: 'review',    label: 'Review & confirm',       required: true,  minutes: 0.5 },
  { id: 'done',      label: 'All set',                required: true,  minutes: 0 },
];
