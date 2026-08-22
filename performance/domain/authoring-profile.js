// CoachEasier Performance — the athlete AUTHORING PROFILE (SC8).
//
// The problem this solves: a coach programming for an athlete needs that
// athlete's training inputs, on the coach's device. A full SC2 profile must
// never travel for that purpose — it carries wellness history, pain detail and
// health information that has nothing to do with choosing a squat variation.
//
// So the athlete's device publishes a deliberately SMALL projection:
//
//   CLASS A  programming inputs      → stored, coach-readable   (here)
//   CLASS B  wellness log            → never uploaded
//   CLASS C  pain detail             → only a non-identifying "restricted" flag
//   CLASS D  health / medical        → never uploaded, only "has restrictions"
//
// What is not stored cannot leak. A coach reading this projection learns that
// an athlete has a movement restriction and must have the programme reviewed —
// never what the injury is, where it is, or what a physio said about it.
//
// Pure module: no DOM, no fetch, no clock, no randomness.

import { ageBandFromDOB } from './athlete-profile.js';
import { engineInputFromProfile } from './programme-blueprint.js';

export const AUTHORING_PROFILE_VERSION = 1;

/**
 * Build the coach-readable projection from a full SC2 profile.
 *
 * Age is published as a BAND, never a date of birth: the band is the evidence
 * the coaching rules actually use, and a birth date is precision nobody
 * programming a session needs. If the athlete gave only a date, the band is
 * derived here and the date stays on their device.
 */
export function authoringProfileFrom(profile, { now = new Date(0) } = {}) {
  const p = profile || {};
  const ageBand = p.personal?.ageBand && p.personal.ageBand !== 'unknown'
    ? p.personal.ageBand
    : (p.personal?.dateOfBirth ? ageBandFromDOB(p.personal.dateOfBirth, now) : null);

  const hasMovementRestrictions = !!(p.health?.movementsToAvoid || []).length;
  const coachRestrictionCount = (p.coachRestrictions || []).filter(
    (r) => !r.overriddenAt && (!r.effectiveTo || String(r.effectiveTo) >= String(now.toISOString?.() || ''))).length;

  return {
    kind: 'authoring_profile',
    schemaVersion: AUTHORING_PROFILE_VERSION,
    sport: p.sport || 'rugby_union',
    // ── CLASS A: programming inputs ──
    personal: { ageBand: ageBand || null },
    rugby: {
      primaryPosition: p.rugby?.primaryPosition ?? null,
      secondaryPosition: p.rugby?.secondaryPosition ?? null,
      playingLevel: p.rugby?.playingLevel ?? null,
      seasonPhase: p.rugby?.seasonPhase ?? null,
      matchDay: p.rugby?.matchDay ?? null,
      rugbySessionsPerWeek: p.rugby?.rugbySessionsPerWeek ?? null,
    },
    training: {
      experience: p.training?.experience ?? null,
      techConfidence: p.training?.techConfidence ?? null,
      preferredSessionMinutes: p.training?.preferredSessionMinutes ?? null,
    },
    equipment: {
      locations: [...(p.equipment?.locations || [])],
      items: [...(p.equipment?.items || [])],
    },
    schedule: {
      availableDays: [...(p.schedule?.availableDays || [])],
      rugbyDays: [...(p.schedule?.rugbyDays || [])],
      matchDay: p.schedule?.matchDay ?? null,
      maxSessionMinutes: p.schedule?.maxSessionMinutes ?? null,
    },
    goals: (p.goals || []).map((g) => ({ type: g.type, importance: g.importance ?? 3 })),
    // ── CLASS C/D reduced to non-identifying FLAGS ──
    // A coach must know that a restriction exists (it changes the programme and
    // forces review). They must not learn what it is from a programming tool.
    restrictions: {
      restrictionsKnown: p.pain?.present !== null && p.pain?.present !== undefined,
      trainingRestricted: p.pain?.trainingRestricted === true,
      hasMovementRestrictions,
      coachRestrictionCount,
    },
    // ── Status ──
    profileComplete: !!(p.rugby?.primaryPosition && p.training?.experience),
    status: p.status || 'draft',
    updatedAt: p.updatedAt || null,
  };
}

/** Fields a coach's authoring tool may ever see. Anything else is a leak. */
export const AUTHORING_PROFILE_FIELDS = [
  'kind', 'schemaVersion', 'sport', 'personal', 'rugby', 'training',
  'equipment', 'schedule', 'goals', 'restrictions', 'profileComplete',
  'status', 'updatedAt',
];

/** Sections that must NEVER appear in a projection, asserted by test. */
export const FORBIDDEN_PROFILE_SECTIONS = [
  'wellnessLog', 'health', 'pain', 'body', 'strength', 'sharing',
  'coachRestrictions', 'dateOfBirth', 'injuryHistory', 'physioInstructions',
  'medicalRestrictions', 'movementsToAvoid', 'medicalClearanceRequired',
  'returnToTrainingStatus', 'heightCm', 'weightKg',
];

/** Is there enough here to generate honestly? */
export function authoringProfileUsable(ap) {
  return !!(ap && ap.kind === 'authoring_profile'
    && ap.rugby?.primaryPosition && ap.training?.experience);
}

/** What is missing, in words a coach can act on. */
export function missingAuthoringInputs(ap) {
  const missing = [];
  if (!ap || ap.kind !== 'authoring_profile') return ['a completed Performance profile'];
  if (!ap.rugby?.primaryPosition) missing.push('playing position');
  if (!ap.training?.experience) missing.push('training experience');
  if (!(ap.equipment?.locations || []).length) missing.push('available equipment');
  if (!(ap.schedule?.availableDays || []).length) missing.push('training availability');
  if (!(ap.goals || []).length) missing.push('training goals');
  return missing;
}

/**
 * Engine input from the PROJECTION — the only supported path for coach
 * authoring. It reuses SC5's own mapping for the shared fields and then
 * restores the restriction signals from the projection's explicit flags,
 * because the projection deliberately does not carry the underlying detail.
 */
export function engineInputFromAuthoringProfile(ap, { teamCategory = null, supervisionAvailable = false, matchCount = undefined } = {}) {
  if (!ap || ap.kind !== 'authoring_profile') throw new Error('not_an_authoring_profile');
  const base = engineInputFromProfile(ap, { teamCategory, supervisionAvailable, matchCount });
  return {
    ...base,
    // Never derived from a date of birth here: the projection carries a band.
    dateOfBirth: null,
    restrictionsKnown: ap.restrictions?.restrictionsKnown === true,
    hasActiveRestriction: ap.restrictions?.trainingRestricted === true
      || (ap.restrictions?.coachRestrictionCount || 0) > 0,
    restrictionTags: ap.restrictions?.trainingRestricted === true ? ['acute_pain_reported'] : [],
    profileComplete: ap.profileComplete === true,
  };
}
