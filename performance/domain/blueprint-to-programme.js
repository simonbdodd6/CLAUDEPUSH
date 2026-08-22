// CoachEasier Performance — SC5 blueprint → SC4 programme draft (SC8).
//
// The controlled seam between the deterministic coaching engine and the
// authored programme structure a coach reviews, edits and publishes.
//
// WHAT THIS DOES NOT DO
// It does not decide anything. Every training decision — frequency, session
// archetypes, exercise selection, dose category, match-week placement — was
// already made by SC5 and arrives in the blueprint with reason codes. This
// module only expresses those decisions in SC4's node structure.
//
// It also never invents a load. A blueprint is structurally forbidden from
// carrying kilograms, and nothing here adds any: prescriptions are expressed
// as sets, reps and EFFORT (RPE), which is what an athlete can execute on day
// one without a tested 1RM. SC6 resolves real loads later, from real evidence.
//
// Pure module: no DOM, no fetch, no clock, no randomness.

import {
  createProgramme, createProgrammeVersion, createPhase, createWeek,
  createTrainingDay, createSession, createBlock, createExercisePrescription,
  createSetPrescription,
} from './programme.js';
import { SET_FIELDS } from '../types/programme.js';

const FIELD_MAP = Object.fromEntries(SET_FIELDS.map((f) => [f.id, f.maps]));

/**
 * PROVISIONAL dose table (SC8). Categorical only — the same categories SC5
 * emits — turned into executable structure. Reviewed by a coach before any
 * athlete sees it, and marked provisional everywhere it surfaces.
 *
 * Sets come from the VOLUME category; reps and effort from INTENSITY.
 */
const SETS_BY_VOLUME = { low: 2, moderate: 3, high: 4 };

const BLOCK_DOSE = {
  power:         { technique: { reps: 3, rpe: 6 }, moderate: { reps: 3, rpe: 7 }, high: { reps: 3, rpe: 8 } },
  main_strength: { technique: { reps: 5, rpe: 6 }, moderate: { reps: 5, rpe: 7 }, high: { reps: 5, rpe: 8 } },
  accessory:     { technique: { reps: 10, rpe: 6 }, moderate: { reps: 10, rpe: 7 }, high: { reps: 8, rpe: 8 } },
  conditioning:  { technique: { durationSec: 30, rpe: 6 }, moderate: { durationSec: 40, rpe: 7 }, high: { durationSec: 45, rpe: 8 } },
};

const REST_BY_BLOCK = { power: 180, main_strength: 180, accessory: 90, conditioning: 60 };

/** Blocks that are preparation, not prescribed work: no effort targets. */
const PREP_BLOCKS = new Set(['warmup', 'activation', 'mobility', 'cooldown']);

/**
 * SC5 plans in coaching language; SC4 stores a fixed block vocabulary. The one
 * genuine mismatch is `trunk`, which SC4 has never had — it is expressed as
 * accessory work, which is what it is structurally. Mapping it HERE (rather
 * than loosening SC4's enum) keeps the stored vocabulary closed.
 */
const BLOCK_TYPE_MAP = { trunk: 'accessory' };
const mapBlockType = (t) => BLOCK_TYPE_MAP[t] || t;

/**
 * Build the set fields for one exercise, keeping only fields the exercise
 * actually declares support for (SC4 validates this, and an exercise that
 * cannot take reps must never be given reps).
 */
function fieldsFor(exercise, blockType, dose) {
  const supported = new Set(exercise?.prescription || []);
  const allow = (id, value) => (value !== undefined && supported.has(FIELD_MAP[id]) ? { [id]: value } : {});

  if (PREP_BLOCKS.has(blockType)) {
    // Preparation work is time- or rep-based and deliberately un-graded.
    return { ...allow('reps', 8), ...allow('durationSec', 30), ...allow('holdSec', 20) };
  }
  const table = BLOCK_DOSE[blockType] || BLOCK_DOSE.accessory;
  const d = table[dose.intensity] || table.moderate;
  return {
    ...allow('reps', d.reps),
    ...allow('durationSec', d.durationSec),
    ...allow('rpe', d.rpe),
    ...allow('restSec', REST_BY_BLOCK[blockType] ?? 90),
  };
}

const SESSION_PURPOSE_BY_ARCHETYPE = {
  full_body_strength: 'strength',
  lower_strength: 'strength',
  upper_strength: 'strength',
  power_speed: 'power',
  conditioning: 'conditioning',
  technique: 'technique',
};

/** Weekday order used to place sessions on the athlete's available days. */
const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Choose training days: the athlete's own available days, minus rugby days
 * and match day, spread across the week. If they have not told us their
 * availability we do NOT guess a schedule — the days come back 'unscheduled'
 * and the coach places them, which is honest rather than convenient.
 */
export function chooseTrainingDays(blueprint, { availableDays = [], rugbyDays = [], matchDay = null } = {}) {
  const frequency = blueprint.frequency || 0;
  if (frequency === 0) return [];
  const busy = new Set([...(rugbyDays || []), ...(matchDay ? [matchDay] : [])]);
  const free = DAY_ORDER.filter((d) => (availableDays || []).includes(d) && !busy.has(d));
  if (free.length < frequency) return Array(frequency).fill('unscheduled');
  // Spread evenly rather than clumping onto consecutive days.
  const step = free.length / frequency;
  const chosen = [];
  for (let i = 0; i < frequency; i++) chosen.push(free[Math.floor(i * step)]);
  return chosen;
}

/**
 * Turn one SC5 blueprint into an SC4 programme with a DRAFT version.
 *
 * @param {object} blueprint            SC5 output (validated by caller)
 * @param {object} opts
 * @param {Array}  opts.catalogue       SC3 exercises (for prescription types)
 * @param {number} opts.weeks           how many weeks to lay out (default 4)
 * @returns {{programme, version, provenance}}
 */
export function programmeDraftFromBlueprint(blueprint, {
  catalogue = [], athleteName = '', athleteUserId = null, author, clubId = null,
  weeks = 4, title = null, schedule = {}, now = null, slug = null,
} = {}) {
  if (!blueprint || blueprint.kind !== 'programme_blueprint') throw new Error('not_a_blueprint');
  if (!author) throw new Error('author_required');
  if (blueprint.frequency === 0) throw new Error('blueprint_has_no_sessions');

  const byId = new Map(catalogue.map((e) => [e.id, e]));
  const dose = { volume: blueprint.volumeCategory, intensity: blueprint.intensityCategory };
  const setCount = SETS_BY_VOLUME[dose.volume] ?? 3;
  const phaseType = blueprint.input?.phase || 'in_season';
  const goal = blueprint.input?.goals?.[0] || 'general_athleticism';

  const programme = createProgramme({
    slug: slug || `athlete-${String(athleteUserId || 'unknown')}-${phaseType}`,
    title: title || `${athleteName || 'Athlete'} — ${labelPhase(phaseType)} S&C`,
    description: `Generated from the deterministic coaching engine (${blueprint.engineVersion}) and reviewed by a coach before publication.`,
    goal, season: seasonFor(phaseType),
    ownerType: 'athlete', ownerClub: clubId, ownerCoach: author,
    author, now,
  });
  const version = createProgrammeVersion(programme, { versionNumber: 1, createdBy: author, now });
  programme.versions = [version];

  const phase = createPhase(version.id, {
    phaseType: mapPhase(phaseType), order: 1, name: labelPhase(phaseType),
    objective: `${dose.volume} volume · ${dose.intensity} intensity`, now,
  });
  version.phases = [phase];

  const days = chooseTrainingDays(blueprint, schedule);
  const matchDay = schedule.matchDay || blueprint.input?.matchDay || null;
  const placementByDay = matchWeekPlacements(blueprint, days, matchDay);

  phase.weeks = [];
  for (let w = 1; w <= weeks; w++) {
    const week = createWeek(phase.id, { weekNumber: w, objective: `Week ${w} of ${weeks}`, now });
    week.days = blueprint.sessions.map((bpSession, i) => {
      const dayName = days[i] || 'unscheduled';
      const day = createTrainingDay(week.id, {
        day: dayName, order: i + 1,
        priority: 'primary',
        rugbyRelation: placementByDay[dayName] || 'none',
        optional: false, now,
      });
      const session = createSession(day.id, {
        title: sessionTitle(bpSession, i),
        order: 1,
        purpose: SESSION_PURPOSE_BY_ARCHETYPE[bpSession.archetype] || 'mixed',
        estimatedMinutes: estimateMinutes(bpSession, setCount),
        objective: `${bpSession.archetype.replace(/_/g, ' ')} — ${dose.intensity} intensity`,
        coachNotes: '', now,
      });
      session.blocks = (bpSession.blocks || []).map((bpBlock, bi) => {
        const blockType = mapBlockType(bpBlock.blockType);
        const block = createBlock(session.id, {
          blockType, order: bi + 1,
          optional: false,
          coachNotes: bpBlock.unresolvedSlots?.length
            ? `${bpBlock.unresolvedSlots.length} slot(s) could not be filled from the eligible library — coach to complete.`
            : '',
          collectionRefs: bpBlock.collectionRef ? [{ collectionId: bpBlock.collectionRef, version: null }] : [],
          now,
        });
        block.prescriptions = (bpBlock.exercises || []).map((pick, pi) => {
          const ex = byId.get(pick.exerciseId);
          if (!ex) throw new Error(`unknown_exercise:${pick.exerciseId}`);
          const p = createExercisePrescription(block.id, {
            exerciseId: ex.id, exerciseVersion: ex.version, order: pi + 1,
            coachingNotes: '', substitutionPolicy: 'structural_allowed',
            collectionOrigin: bpBlock.collectionRef ? { collectionId: bpBlock.collectionRef, version: null } : null,
            now,
          });
          const fields = fieldsFor(ex, blockType, dose);
          const sets = PREP_BLOCKS.has(blockType) ? 1 : setCount;
          p.sets = Array.from({ length: sets }, (_, si) =>
            createSetPrescription(p.id, { order: si + 1, fields, now }));
          return p;
        });
        return block;
      }).filter((b) => b.prescriptions.length || (b.collectionRefs || []).length);
      day.sessions = [session];
      return day;
    });
    phase.weeks.push(week);
  }

  // Provenance travels WITH the draft so the review screen can explain itself
  // and the published version records why it looks the way it does.
  const provenance = {
    kind: 'blueprint_provenance',
    engineVersion: blueprint.engineVersion,
    provisional: true,
    generatedAt: now,
    developmentContext: structuredClone(blueprint.developmentContext),
    frequency: blueprint.frequency,
    volumeCategory: blueprint.volumeCategory,
    intensityCategory: blueprint.intensityCategory,
    qualityPriorities: [...(blueprint.qualityPriorities || [])],
    patternCoverage: structuredClone(blueprint.patternCoverage || {}),
    matchWeek: structuredClone(blueprint.matchWeek || {}),
    reasons: structuredClone(blueprint.reasons || []),
    flags: structuredClone(blueprint.flags || []),
    requiresReview: !!blueprint.requiresReview,
    unresolvedSlots: (blueprint.sessions || []).flatMap((s, i) =>
      (s.blocks || []).flatMap((b) => (b.unresolvedSlots || []).map((u) => ({ session: i + 1, blockType: b.blockType, ...u })))),
    daysChosen: days,
    weeks,
  };
  version.provenance = provenance;

  return { programme, version, provenance };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sessionTitle(bpSession, i) {
  const a = String(bpSession.archetype || 'session').replace(/_/g, ' ');
  return `${a.charAt(0).toUpperCase()}${a.slice(1)}`.slice(0, 60) || `Session ${i + 1}`;
}

function estimateMinutes(bpSession, setCount) {
  const working = (bpSession.blocks || []).reduce((n, b) =>
    n + (PREP_BLOCKS.has(mapBlockType(b.blockType)) ? (b.exercises || []).length * 2 : (b.exercises || []).length * setCount * 3), 0);
  return Math.max(20, Math.min(90, Math.round(working / 5) * 5));
}

const SC4_PHASE_TYPES = ['off_season', 'pre_season', 'in_season', 'peak', 'taper', 'return_to_general_training'];

/** SC5 and SC4 share the phase vocabulary; anything unknown fails safe. */
function mapPhase(phase) {
  return SC4_PHASE_TYPES.includes(phase) ? phase : 'in_season';
}

function seasonFor(phase) {
  return ['off_season', 'pre_season', 'in_season', 'post_season'].includes(phase) ? phase : 'year_round';
}

function labelPhase(phase) {
  return String(phase || 'in season').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Map SC5's match-week placements onto the chosen days so the SC4 tree keeps
 * the match relationship (MD-3, MD-1, MD+1 …) rather than losing it.
 */
function matchWeekPlacements(blueprint, days, matchDay) {
  const out = {};
  if (!matchDay) return out;
  const mdIndex = DAY_ORDER.indexOf(matchDay);
  if (mdIndex === -1) return out;
  for (const day of days) {
    const i = DAY_ORDER.indexOf(day);
    if (i === -1) continue;
    // SC4's relations are descriptive and deliberately coarse. Days with no
    // named relationship stay 'none' rather than being given an invented one.
    const delta = i - mdIndex;
    if (delta === 0) out[day] = 'match_day';
    else if (delta === -1) out[day] = 'day_before_match';
    else if (delta === 1) out[day] = 'day_after_match';
  }
  return out;
}
