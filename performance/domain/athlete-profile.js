// CoachEasier Performance — athlete profile domain rules (SC2).
//
// Pure, tested business rules for the athlete profile and onboarding.
// No DOM, no fetch, no localStorage. No programme generation, no exercise
// prescription and no medical judgement lives here: rules may *request a
// review* or *flag stale data* — they never diagnose.

import {
  AGE_BANDS,
  EQUIPMENT_ITEMS,
  EQUIPMENT_LOCATIONS,
  GOAL_IMPORTANCE,
  GOAL_TYPES,
  ONBOARDING_STEPS,
  ONBOARDING_VERSION,
  PROFILE_VERSION,
  RESULT_STATUSES,
  STRENGTH_TESTS,
  UNKNOWN,
  WEEK_DAYS,
  WELLNESS_KEYS,
  WELLNESS_LOG_MAX,
  WELLNESS_SCALE,
} from '../types/athlete-profile.js';

// ── Answered / unknown semantics ────────────────────────────────────────────

/** True when a field has been answered — UNKNOWN counts as answered. */
export function isAnswered(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

// ── Empty profile ───────────────────────────────────────────────────────────

/**
 * Create a new, empty athlete profile. References existing CoachEasier
 * identities — never copies of their records.
 * @param {{userId:string, teamId?:string, clubId?:string, now?:string}} refs
 */
export function createEmptyProfile({ userId, teamId = null, clubId = null, now = null } = {}) {
  const ts = now || null;
  return {
    version: PROFILE_VERSION,
    onboardingVersion: ONBOARDING_VERSION,
    id: userId ? `perf-profile-${userId}` : null,
    userRef: userId || null,
    teamRef: teamId,
    clubRef: clubId,
    sport: 'rugby_union',
    status: 'draft',
    createdAt: ts,
    updatedAt: ts,

    personal: {
      dateOfBirth: null,       // optional; only ever reduced to ageBand for engine use
      ageBand: null,
      sex: null,
      dominantSide: null,
      units: { weight: 'kg', height: 'cm' },
      language: null,
      timezone: null,
    },

    rugby: {
      primaryPosition: null,
      secondaryPosition: null,
      playingLevel: null,
      yearsPlaying: null,
      typicalMatchMinutes: null,
      matchDay: null,
      rugbySessionsPerWeek: null,
      otherSports: [],
      seasonPhase: null,
    },

    body: {
      heightCm: null,
      weightKg: null,
      targetWeightKg: null,
      bodyComposition: null,   // optional {method, bodyFatPct, notes}
      weightTrend: null,       // 'gaining' | 'stable' | 'losing' | UNKNOWN
      measurementSource: null, // 'self_reported' | 'coach_measured'
      measuredAt: null,
    },

    training: {
      experience: null,
      yearsResistanceTraining: null,
      consistency: null,
      currentProgramme: null,
      preferredStyles: [],
      techConfidence: null,
      preferredSessionMinutes: null,
    },

    strength: {
      results: [],             // StrengthResult[] — see recordStrengthResult
    },

    equipment: {
      locations: [],
      items: [],
      notes: '',
    },

    schedule: {
      availableDays: [],
      preferredDays: [],
      maxSessionMinutes: null,
      rugbyDays: [],           // [{day, kind:'training'|'match', time?}]
      matchDay: null,
      workRestrictions: '',
      travelRestrictions: '',
      temporaryChanges: [],    // [{from, to, detail}]
    },

    goals: [],                 // Goal[] — see validateGoal

    // A + B — player-reported. Wellness lives in a capped rolling log kept in
    // profile-state (not here) so one entry can never permanently alter the
    // profile. `pain` is the athlete's CURRENT self-report, replaceable at
    // any time, and is not a diagnosis.
    pain: {
      present: null,           // null (unanswered) | false | true
      area: null,
      movementAffected: null,
      severity: null,          // 1–5 player-perceived
      trainingRestricted: null,
      note: '',
      reportedAt: null,
    },

    // C — restricted health-related information. Administrative records under
    // explicit permission; empty by default and never required for onboarding.
    health: {
      injuryHistory: [],       // [{area, detail, when}] — free-form summaries
      medicalRestrictions: '', // staff-entered administrative text
      movementsToAvoid: [],
      physioInstructions: '',
      medicalClearanceRequired: null,
      returnToTrainingStatus: null,
    },

    // D — coach-entered restrictions with audit metadata.
    coachRestrictions: [],     // [{id, restriction, reason, author, createdAt, effectiveFrom, effectiveTo, reviewDate, visibility, overriddenBy?, overriddenAt?}]

    sharing: {
      consentVersion: null,
      consentAcceptedAt: null,
      consentAcceptedBy: null,
      grants: [],              // [{role, category, level, grantedBy, grantedAt, revokedAt}]
      audit: [],               // visibility/consent change log — see appendAudit
    },
  };
}

// ── Required fields & completion ────────────────────────────────────────────

// Minimum-viable onboarding: these paths must be ANSWERED (unknown allowed)
// for the profile to be submittable. Strength testing and health data are
// deliberately absent — they never block onboarding.
export const REQUIRED_PATHS = [
  'personal.ageBand',
  'rugby.primaryPosition',
  'rugby.playingLevel',
  'rugby.seasonPhase',
  'training.experience',
  'training.preferredSessionMinutes',
  'schedule.availableDays',
  'equipment.locations',
  'goals',
  'sharing.consentAcceptedAt',
];

export function getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Required paths not yet answered. */
export function missingRequiredFields(profile) {
  return REQUIRED_PATHS.filter((p) => !isAnswered(getByPath(profile, p)));
}

// Optional sections that count toward "profile richness" beyond the minimum.
const OPTIONAL_SECTION_CHECKS = {
  body:      (p) => isAnswered(p.body?.heightCm) && isAnswered(p.body?.weightKg),
  strength:  (p) => (p.strength?.results || []).some((r) => r.status !== UNKNOWN),
  readiness: (p) => p.pain?.present !== null && p.pain?.present !== undefined,
  secondary: (p) => isAnswered(p.rugby?.secondaryPosition),
  schedule_detail: (p) => (p.schedule?.rugbyDays || []).length > 0,
  goals_detail: (p) => (p.goals || []).some((g) => isAnswered(g.targetDate) || isAnswered(g.targetValue)),
};

/**
 * Profile completion: required minimum contributes 70%, optional richness 30%.
 * @returns {{pct:number, requiredComplete:boolean, missingRequired:string[], optionalDone:number, optionalTotal:number}}
 */
export function profileCompletion(profile) {
  if (!profile) return { pct: 0, requiredComplete: false, missingRequired: REQUIRED_PATHS.slice(), optionalDone: 0, optionalTotal: Object.keys(OPTIONAL_SECTION_CHECKS).length };
  const missing = missingRequiredFields(profile);
  const requiredDone = REQUIRED_PATHS.length - missing.length;
  const optionalChecks = Object.values(OPTIONAL_SECTION_CHECKS);
  const optionalDone = optionalChecks.filter((fn) => { try { return !!fn(profile); } catch { return false; } }).length;
  const pct = Math.round(
    (requiredDone / REQUIRED_PATHS.length) * 70 +
    (optionalDone / optionalChecks.length) * 30
  );
  return {
    pct: Math.min(pct, 100),
    requiredComplete: missing.length === 0,
    missingRequired: missing,
    optionalDone,
    optionalTotal: optionalChecks.length,
  };
}

// ── Onboarding steps ────────────────────────────────────────────────────────

const STEP_REQUIRED_PATHS = {
  welcome:   [],
  rugby:     ['rugby.primaryPosition', 'rugby.playingLevel', 'rugby.seasonPhase', 'personal.ageBand'],
  training:  ['training.experience', 'training.preferredSessionMinutes'],
  schedule:  ['schedule.availableDays'],
  equipment: ['equipment.locations'],
  goals:     ['goals'],
  strength:  [],   // optional — never blocks
  readiness: [],   // optional — never blocks
  privacy:   ['sharing.consentAcceptedAt'],
  review:    [],
  done:      [],
};

export function requiredPathsForStep(stepId) {
  return STEP_REQUIRED_PATHS[stepId] ? STEP_REQUIRED_PATHS[stepId].slice() : [];
}

export function isStepComplete(profile, stepId) {
  return requiredPathsForStep(stepId).every((p) => isAnswered(getByPath(profile, p)));
}

/**
 * Onboarding progress over the data-collecting steps.
 * @returns {{doneSteps:string[], remainingRequired:string[], canSubmit:boolean, pct:number}}
 */
export function onboardingProgress(profile) {
  const dataSteps = ONBOARDING_STEPS.filter((s) => !['welcome', 'review', 'done'].includes(s.id));
  const doneSteps = dataSteps.filter((s) => isStepComplete(profile, s.id) && requiredPathsForStep(s.id).length > 0).map((s) => s.id);
  const requiredSteps = dataSteps.filter((s) => s.required);
  const remainingRequired = requiredSteps.filter((s) => !isStepComplete(profile, s.id)).map((s) => s.id);
  const pct = Math.round(((requiredSteps.length - remainingRequired.length) / requiredSteps.length) * 100);
  return { doneSteps, remainingRequired, canSubmit: remainingRequired.length === 0, pct };
}

// ── Age bands ───────────────────────────────────────────────────────────────

/**
 * Reduce a date of birth to a programming age band. Returns null when the
 * date is missing/invalid — the athlete can always pick a band directly.
 * @param {string} dob ISO date
 * @param {Date} [now]
 */
export function ageBandFromDOB(dob, now = new Date()) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getFullYear() - d.getFullYear();
  const beforeBirthday = now.getMonth() < d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (beforeBirthday) age -= 1;
  if (age < 0 || age > 100) return null;
  if (age < 16) return 'under_16';
  if (age <= 17) return '16_17';
  if (age <= 20) return '18_20';
  if (age <= 29) return '21_29';
  if (age <= 34) return '30_34';
  return '35_plus';
}

export function isYouthBand(bandId) {
  return !!AGE_BANDS.find((b) => b.id === bandId)?.youth;
}

// ── Units ───────────────────────────────────────────────────────────────────

const LB_PER_KG = 2.2046226218;
const IN_PER_CM = 0.3937007874;

/** Convert a weight entry to canonical kg. Returns null for bad input. */
export function toKg(value, unit = 'kg') {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const kg = unit === 'lb' ? n / LB_PER_KG : n;
  return Math.round(kg * 10) / 10;
}

/** Convert a height entry to canonical cm. Returns null for bad input. */
export function toCm(value, unit = 'cm') {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const cm = unit === 'in' ? n / IN_PER_CM : n;
  return Math.round(cm * 10) / 10;
}

/** Display a canonical kg value in the athlete's preferred unit. */
export function displayWeight(kg, unit = 'kg') {
  const n = Number(kg);
  if (!Number.isFinite(n)) return null;
  const v = unit === 'lb' ? n * LB_PER_KG : n;
  return { value: Math.round(v * 10) / 10, unit };
}

// ── Goals ───────────────────────────────────────────────────────────────────

/**
 * Validate a goal. Unknown/absent optional fields are fine; type and
 * importance must be legal when present.
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateGoal(goal, now = new Date()) {
  const errors = [];
  if (!goal || typeof goal !== 'object') return { ok: false, errors: ['missing_goal'] };
  if (!GOAL_TYPES.some((t) => t.id === goal.type)) errors.push('invalid_type');
  if (goal.importance != null && !GOAL_IMPORTANCE.includes(Number(goal.importance))) errors.push('invalid_importance');
  if (goal.targetDate) {
    const d = new Date(goal.targetDate);
    if (Number.isNaN(d.getTime())) errors.push('invalid_target_date');
    else if (d.getTime() < now.getTime() - 86400000) errors.push('target_date_in_past');
  }
  if (goal.targetValue != null && !Number.isFinite(Number(goal.targetValue))) errors.push('invalid_target_value');
  return { ok: errors.length === 0, errors };
}

/** Build a well-formed goal object; primary is the first active goal. */
export function makeGoal({ type, importance = 3, targetDate = null, targetValue = null, targetUnit = null, outcome = '', reason = '', now = null }) {
  return {
    id: `goal-${type}-${Math.abs(hashString(`${type}|${targetDate}|${outcome}`))}`,
    type, importance, targetDate, targetValue, targetUnit,
    outcome, reason,
    status: 'active',
    createdAt: now,
  };
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return h;
}

// ── Schedule ────────────────────────────────────────────────────────────────

/**
 * Detect schedule conflicts between gym availability and rugby commitments.
 * Conflicts are advisory — the future engine decides how to handle them.
 * @returns {Array<{day:string, kind:string, detail:string}>}
 */
export function detectScheduleConflicts(schedule) {
  const out = [];
  if (!schedule) return out;
  const rugbyByDay = new Map((schedule.rugbyDays || []).map((r) => [r.day, r]));
  const matchDay = schedule.matchDay || (schedule.rugbyDays || []).find((r) => r.kind === 'match')?.day || null;

  for (const day of schedule.availableDays || []) {
    if (!WEEK_DAYS.includes(day)) continue;
    if (matchDay && day === matchDay) {
      out.push({ day, kind: 'match_day', detail: 'Gym day is also match day' });
      continue;
    }
    const rugby = rugbyByDay.get(day);
    if (rugby && rugby.kind === 'training') {
      out.push({ day, kind: 'double_session', detail: 'Gym day is also a rugby training day' });
    }
  }
  for (const day of schedule.preferredDays || []) {
    if (!(schedule.availableDays || []).includes(day)) {
      out.push({ day, kind: 'preferred_not_available', detail: 'Preferred day is not marked available' });
    }
  }
  return out;
}

// ── Equipment ───────────────────────────────────────────────────────────────

const KNOWN_ITEM_IDS = new Set(EQUIPMENT_ITEMS.map((i) => i.id));
const KNOWN_LOCATION_IDS = new Set(EQUIPMENT_LOCATIONS.map((l) => l.id));

/**
 * Summarise what the athlete's access supports. Pure capability summary —
 * not a prescription.
 * @returns {{level:'full'|'moderate'|'minimal'|'bodyweight', canBarbell:boolean, canJump:boolean, canSprint:boolean, canSled:boolean, unknownItems:string[]}}
 */
export function equipmentCapability(equipment) {
  const locations = (equipment?.locations || []).filter((l) => KNOWN_LOCATION_IDS.has(l));
  const items = new Set((equipment?.items || []).filter((i) => KNOWN_ITEM_IDS.has(i)));
  const unknownItems = (equipment?.items || []).filter((i) => !KNOWN_ITEM_IDS.has(i));
  const gymLocation = locations.some((l) => l === 'commercial_gym' || l === 'team_gym');
  if (gymLocation) ['barbell', 'rack', 'bench', 'dumbbells', 'machines', 'cardio'].forEach((i) => items.add(i));

  const canBarbell = items.has('barbell') && items.has('rack');
  const canJump = items.has('turf') || items.has('med_balls') || gymLocation || locations.includes('home_gym');
  const canSprint = items.has('sprint_space') || items.has('turf');
  const canSled = items.has('sled');

  let level = 'bodyweight';
  if (locations.includes('bodyweight_only') && items.size === 0) level = 'bodyweight';
  else if (canBarbell) level = 'full';
  else if (items.has('dumbbells') || items.has('kettlebells') || items.has('machines')) level = 'moderate';
  else if (items.size > 0) level = 'minimal';

  return { level, canBarbell, canJump, canSprint, canSled, unknownItems };
}

// ── Strength results ────────────────────────────────────────────────────────

/** Build a well-formed strength/performance result entry. */
export function makeStrengthResult({ testId, variation = null, measurementType = null, value = null, unit = null, status = UNKNOWN, source = 'self_reported', date = null, notes = '' }) {
  return {
    testId,
    variation,
    measurementType,
    value: value == null ? null : Number(value),
    unit,
    status: RESULT_STATUSES.includes(status) ? status : UNKNOWN,
    source,
    date,
    notes,
  };
}

export function isKnownTest(testId) {
  return STRENGTH_TESTS.some((t) => t.id === testId);
}

/**
 * Confidence in a recorded result for future engine use.
 * unknown → 'none'; estimated/self-reported → 'low'|'medium'; coach-measured
 * recent actuals → 'high'. Age of the measurement degrades confidence.
 */
export function strengthResultConfidence(result, now = new Date()) {
  if (!result || result.status === UNKNOWN || result.value == null) return 'none';
  const ageDays = result.date ? Math.floor((now - new Date(result.date)) / 86400000) : null;
  const stale = ageDays != null && ageDays > 180;
  if (result.status === 'actual' && result.source === 'coach_measured') return stale ? 'medium' : 'high';
  if (result.status === 'actual') return stale ? 'low' : 'medium';
  return stale ? 'low' : 'medium'; // estimated
}

/** True 1RM data is never required: submitting with zero results is valid. */
export function strengthBaselineBlocksOnboarding() {
  return false;
}

// ── Wellness log ────────────────────────────────────────────────────────────

/** Validate + normalise one wellness entry (1–5 scales, unknown allowed). */
export function makeWellnessEntry({ date, scores = {}, note = '' }) {
  const clean = {};
  for (const k of WELLNESS_KEYS) {
    const v = scores[k.id];
    clean[k.id] = WELLNESS_SCALE.includes(Number(v)) ? Number(v) : null;
  }
  return { date: date || null, scores: clean, note: String(note || '').slice(0, 280) };
}

/** Append to the rolling wellness log — capped, oldest dropped. Pure. */
export function appendWellness(log, entry) {
  const next = [...(log || []), entry];
  return next.length > WELLNESS_LOG_MAX ? next.slice(next.length - WELLNESS_LOG_MAX) : next;
}

export function latestWellness(log) {
  const l = log || [];
  return l.length ? l[l.length - 1] : null;
}

/** A wellness snapshot older than `hours` should not drive today's display. */
export function wellnessIsStale(entry, now = new Date(), hours = 48) {
  if (!entry?.date) return true;
  const t = new Date(entry.date).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > hours * 3600000;
}

// ── Restrictions & review requests ──────────────────────────────────────────

/**
 * Status of a coach-entered restriction at `now`.
 * @returns {'scheduled'|'active'|'expired'|'overridden'}
 */
export function restrictionStatus(restriction, now = new Date()) {
  if (!restriction) return 'expired';
  if (restriction.overriddenAt) return 'overridden';
  const t = now.getTime();
  const from = restriction.effectiveFrom ? new Date(restriction.effectiveFrom).getTime() : -Infinity;
  const to = restriction.effectiveTo ? new Date(restriction.effectiveTo).getTime() : Infinity;
  if (Number.isFinite(from) && t < from) return 'scheduled';
  if (t > to) return 'expired';
  return 'active';
}

export function activeRestrictions(profile, now = new Date()) {
  return (profile?.coachRestrictions || []).filter((r) => restrictionStatus(r, now) === 'active');
}

/** A restriction whose review date has passed needs coach attention. */
export function restrictionNeedsReview(restriction, now = new Date()) {
  if (!restriction?.reviewDate) return false;
  if (restrictionStatus(restriction, now) !== 'active') return false;
  return new Date(restriction.reviewDate).getTime() <= now.getTime();
}

/**
 * Whether the product should REQUEST a clearance/limitation review by an
 * appropriate person. This is a routing signal, not a diagnosis and not a
 * clearance decision.
 * @returns {{request:boolean, reasons:string[]}}
 */
export function shouldRequestClearanceReview(profile, now = new Date()) {
  const reasons = [];
  if (!profile) return { request: false, reasons };
  if (profile.health?.medicalClearanceRequired === true &&
      profile.health?.returnToTrainingStatus !== 'full') {
    reasons.push('clearance_required');
  }
  if (profile.pain?.present === true && profile.pain?.trainingRestricted === true) {
    reasons.push('player_reported_restriction');
  }
  if (Number(profile.pain?.severity) >= 4) {
    reasons.push('high_reported_severity');
  }
  for (const r of profile.coachRestrictions || []) {
    if (restrictionNeedsReview(r, now)) { reasons.push('restriction_review_due'); break; }
  }
  return { request: reasons.length > 0, reasons };
}

// ── Staleness ───────────────────────────────────────────────────────────────

/** Generic staleness check on an ISO date. */
export function isStale(isoDate, now = new Date(), days = 180) {
  if (!isoDate) return true;
  const t = new Date(isoDate).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > days * 86400000;
}

/**
 * Sections of a completed profile that look out of date.
 * @returns {Array<{section:string, days:number}>}
 */
export function staleSections(profile, now = new Date()) {
  const out = [];
  if (!profile) return out;
  const checks = [
    ['body',     profile.body?.measuredAt,  180],
    ['strength', latestResultDate(profile), 180],
    ['profile',  profile.updatedAt,         365],
  ];
  for (const [section, date, days] of checks) {
    if (date && isStale(date, now, days)) {
      out.push({ section, days: Math.floor((now.getTime() - new Date(date).getTime()) / 86400000) });
    }
  }
  return out;
}

function latestResultDate(profile) {
  const dates = (profile?.strength?.results || []).map((r) => r.date).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
}
