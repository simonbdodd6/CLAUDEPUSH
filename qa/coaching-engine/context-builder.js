/**
 * Context builder — assembles a complete EngineContext object from request inputs.
 * EngineContext is the single source of truth passed to prompt-builder.js.
 * Rich context → better output regardless of which provider is used.
 */

import { buildPlayerProfile, getPositionProfile } from './player-profile.js';
import { buildTeamProfile } from './team-profile.js';
import { buildCoachProfile, defaultCoachProfile } from './coach-profile.js';
import { resolveObjectives, getEquipmentProfile, SEASON_PHASES } from './training-objectives.js';
import { searchForPlayer, searchForTeam, searchForRehab } from './knowledge-search.js';

// ── Age guidelines ─────────────────────────────────────────────────────────

const AGE_GUIDELINES = {
  U8: {
    maxContactLoad:  'none — tag or touch only',
    sessionDuration: 45,
    primaryEmphasis: 'fun, fundamental movement skills, handling, spatial awareness',
    keyNote:         'Every session must end with every player smiling. Fun IS the curriculum at U8.',
    strengthNote:    'Bodyweight only. No external loading. Focus on movement quality.',
    loadingNote:     'Zero tolerance for heavy loading. Jumping and landing mechanics only.',
  },
  U10: {
    maxContactLoad:  'modified contact only — no scrummaging',
    sessionDuration: 60,
    primaryEmphasis: 'skill development, game understanding, handling and movement',
    keyNote:         'Introduce game principles through small-sided games, not drills.',
    strengthNote:    'Bodyweight only. Core stability and agility focus.',
    loadingNote:     'No external loading. Relative strength via bodyweight progressions.',
  },
  U12: {
    maxContactLoad:  'supervised contact introduction — no contested scrums',
    sessionDuration: 75,
    primaryEmphasis: 'technique before intensity, introduce contact safely',
    keyNote:         'Contact technique must be taught and reinforced every session. Correct before contact.',
    strengthNote:    'Light external loading allowed (60–70% bodyweight equivalent). Technique priority.',
    loadingNote:     'Begin progressive loading with bodyweight and resistance bands. Introduce barbell technique.',
  },
  U14: {
    maxContactLoad:  'full tackling, no contested scrums',
    sessionDuration: 90,
    primaryEmphasis: 'technical refinement and physical development beginning',
    keyNote:         'Players are entering puberty — huge variation in physical development. Group by stage, not age.',
    strengthNote:    'Progressive barbell training appropriate. Technique before load. 2–3 sessions/week max.',
    loadingNote:     'Structured S&C appropriate. Avoid maximal loading. Volume over intensity.',
  },
  U16: {
    maxContactLoad:  'full contact — contested scrums and lineouts introduced',
    sessionDuration: 90,
    primaryEmphasis: 'set-piece introduction, physical development, game intelligence',
    keyNote:         'Contested set-piece is new — technique and safety must be coached explicitly every session.',
    strengthNote:    'Full S&C programme appropriate. Progressive intensity over time.',
    loadingNote:     'Near-adult loading protocols with careful monitoring of growth-plate considerations.',
  },
  U18: {
    maxContactLoad:  'full adult contact',
    sessionDuration: 90,
    primaryEmphasis: 'performance development, high physical demands manageable',
    keyNote:         'Near-adult physiology. Can train at high intensity, but recovery is still sub-adult.',
    strengthNote:    'Full adult S&C programme appropriate. Monitor for overtraining.',
    loadingNote:     'Near-adult loads. Allow full recovery between heavy sessions.',
  },
  Senior: {
    maxContactLoad:  'full contact',
    sessionDuration: 90,
    primaryEmphasis: 'performance, maintenance, position-specific development',
    keyNote:         'Manage cumulative load — most senior amateurs have work and family commitments.',
    strengthNote:    'Full S&C programme. Periodise to peaks and match schedule.',
    loadingNote:     'Full loading protocols based on goals and season phase.',
  },
  Masters: {
    maxContactLoad:  'full contact (modified laws in some competitions)',
    sessionDuration: 75,
    primaryEmphasis: 'joint health, relative strength maintenance, recovery management',
    keyNote:         'Recovery capacity drops significantly after 35. Training age matters more than chronological age.',
    strengthNote:    'Maintain strength through lower volume, higher frequency. Avoid excessive DOMS.',
    loadingNote:     'Reduce volume 20–30% vs Senior programmes. Prioritise recovery protocols.',
  },
};

// ── Injury modification library ─────────────────────────────────────────────

const INJURY_MODIFICATIONS = {
  'shoulder': {
    avoidMovements:  ['overhead pressing', 'behind-neck press', 'wide-grip upright row'],
    modifyMovements: ['bench press → close-grip or neutral-grip', 'pull-up → lat pulldown with neutral grip'],
    prioritise:      ['external rotation strengthening', 'rotator cuff exercises', 'shoulder retraction'],
    returnToPlayNote: 'Cleared by physio for overhead work before progressing to pressing',
    consideration:   'Shoulder injury history — avoid overhead pressing; prioritise rotator cuff prehab',
  },
  'knee': {
    avoidMovements:  ['deep squats with heavy load initially', 'heavy leg press end-range', 'high-impact plyometrics'],
    modifyMovements: ['squat → box squat or leg press', 'lunges → step-ups', 'depth jumps → box jumps (low)'],
    prioritise:      ['single-leg exercises for symmetry', 'glute and hip strengthening', 'VMO development'],
    returnToPlayNote: 'Single-leg squat quality check before progressing to bilateral loading',
    consideration:   'Knee injury history — monitor load and avoid end-range loading early in programme',
  },
  'lower back': {
    avoidMovements:  ['heavy deadlift from floor initially', 'good mornings', 'Jefferson curl (until cleared)'],
    modifyMovements: ['deadlift → rack pull or trap bar', 'squats → goblet squat', 'Romanian DL with shortened range'],
    prioritise:      ['anterior core stability (deadbugs, planks)', 'hip hinge pattern quality', 'glute strengthening'],
    returnToPlayNote: 'Pain-free movement in all planes before loading',
    consideration:   'Lower back history — prioritise hip hinge quality over load; start with rack pulls',
  },
  'hamstring': {
    avoidMovements:  ['sprint volume in early return', 'heavy Nordic curls in acute phase'],
    modifyMovements: ['Nordic curl → slider leg curl → Nordic (graduated)', 'sprinting → tempo runs until cleared'],
    prioritise:      ['isometric hamstring loading in early phase', 'progressive Nordic curl programme', 'sprint mechanics'],
    returnToPlayNote: 'Full sprint speed at 100% with no pain before return to contact training',
    consideration:   'Hamstring history — start with isometric loading, progress Nordic curl programme carefully',
  },
  'ankle': {
    avoidMovements:  ['single-leg plyometrics until proprioception established'],
    modifyMovements: ['single-leg squat → bilateral until stable', 'bounding → walking lunges'],
    prioritise:      ['proprioception and balance training', 'calf and peroneal strengthening', 'ankle mobility'],
    returnToPlayNote: 'Single-leg balance under 15 seconds before returning to reactive work',
    consideration:   'Ankle history — prioritise proprioception and stability before loading',
  },
  'concussion': {
    avoidMovements:  ['all contact', 'heavy lifting during acute phase'],
    modifyMovements: ['all training → graduated return-to-play protocol'],
    prioritise:      ['graduated return-to-play protocol (GRTP)', 'symptom monitoring'],
    returnToPlayNote: 'Follow World Rugby GRTP — 6 graduated stages, minimum 7 days. Medical clearance required.',
    consideration:   'Recent concussion — follow World Rugby GRTP. No contact until medically cleared.',
  },
};

export function getInjuryModifications(injuries = []) {
  const mods = [];
  for (const injury of injuries) {
    const key = injury.toLowerCase().trim();
    const match = Object.keys(INJURY_MODIFICATIONS).find(k => key.includes(k));
    if (match) {
      mods.push({ injury: key, ...INJURY_MODIFICATIONS[match] });
    } else {
      mods.push({
        injury: key,
        avoidMovements:  [],
        modifyMovements: [],
        prioritise:      ['work with physiotherapist for specific modifications'],
        consideration:   `Declared injury: "${injury}" — seek specific physiotherapist guidance`,
      });
    }
  }
  return mods;
}

// ── Context assembly ─────────────────────────────────────────────────────────

/**
 * Build a complete EngineContext for a programme generation request.
 */
export function buildProgrammeContext(options = {}) {
  const player = buildPlayerProfile(options.player);
  const coach  = options.coach ? buildCoachProfile(options.coach) : defaultCoachProfile();

  const positionProfile = getPositionProfile(player.position);
  const ageGuidelines   = AGE_GUIDELINES[player.ageGroup]   ?? AGE_GUIDELINES['Senior'];
  const injuryMods      = getInjuryModifications(player.injuries);
  const equipmentProfile = getEquipmentProfile(player.equipment);

  const { objectives, seasonPhase: phaseData } = resolveObjectives(
    player.goals,
    positionProfile,
    player.seasonPhase,
  );

  const kbResult = searchForPlayer(player, { limit: 6 });

  return {
    requestType:     'programme',
    player,
    coach,
    positionProfile,
    ageGuidelines,
    injuryMods,
    equipmentProfile,
    objectives,
    seasonPhase:     player.seasonPhase,
    seasonPhaseData: phaseData,
    knowledgeBase:   kbResult,
    memoryContext:   options.memoryContext ?? null,
  };
}

/**
 * Build a complete EngineContext for a session generation request.
 */
export function buildSessionContext(options = {}) {
  const team  = buildTeamProfile(options.team);
  const coach = options.coach ? buildCoachProfile(options.coach) : defaultCoachProfile();
  const focus = options.focus ?? '';

  const ageGuidelines  = AGE_GUIDELINES[team.ageGroup] ?? AGE_GUIDELINES['Senior'];
  const equipmentProfile = getEquipmentProfile(team.equipment ?? []);
  const kbResult       = searchForTeam(team, focus, { limit: 5 });

  return {
    requestType:    'session',
    team,
    coach,
    focus,
    ageGuidelines,
    equipmentProfile,
    knowledgeBase:  kbResult,
    memoryContext:  options.memoryContext ?? null,
  };
}

/**
 * Build a complete EngineContext for a rehab plan request.
 */
export function buildRehabContext(options = {}) {
  const player      = buildPlayerProfile(options.player);
  const coach       = options.coach ? buildCoachProfile(options.coach) : defaultCoachProfile();
  const injuryDetail = options.injuryDetail ?? options.player?.injuries?.[0] ?? 'unspecified injury';

  const injuryMods      = getInjuryModifications(player.injuries);
  const ageGuidelines   = AGE_GUIDELINES[player.ageGroup] ?? AGE_GUIDELINES['Senior'];
  const equipmentProfile = getEquipmentProfile(player.equipment);
  const kbResult        = searchForRehab(injuryDetail, player, { limit: 4 });

  return {
    requestType:    'rehab',
    player,
    coach,
    injuryDetail,
    injuryMods,
    ageGuidelines,
    equipmentProfile,
    knowledgeBase:  kbResult,
  };
}

/**
 * Build a complete EngineContext for a season plan request.
 */
export function buildSeasonContext(options = {}) {
  const team  = buildTeamProfile(options.team);
  const coach = options.coach ? buildCoachProfile(options.coach) : defaultCoachProfile();

  const ageGuidelines   = AGE_GUIDELINES[team.ageGroup] ?? AGE_GUIDELINES['Senior'];
  const equipmentProfile = getEquipmentProfile(team.equipment ?? []);
  const kbResult        = searchForTeam(team, '', { limit: 4 });

  return {
    requestType:    'season-plan',
    team,
    coach,
    seasonLength:   options.seasonLength ?? 20,
    seasonStart:    options.seasonStart  ?? null,
    ageGuidelines,
    equipmentProfile,
    knowledgeBase:  kbResult,
  };
}
