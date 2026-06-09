/**
 * Phase Prescriptions
 *
 * For each season phase, defines the coaching targets:
 * training emphasis, workload bands, injury tolerance, attendance expectations,
 * squad rotation policy, player development priorities, and recovery protocols.
 *
 * These are the "right" answers the platform compares against observations.
 */

import { PHASE } from './season-phases.js';

export const PRESCRIPTIONS = {

  [PHASE.PRE_SEASON]: {
    label:          'Pre-Season',
    trainingEmphasis: [
      'Aerobic base building',
      'Strength and conditioning',
      'Set piece foundations',
      'Team shape introduction',
      'Squad assessment — all players get minutes',
    ],
    intensity: {
      target:    65,   // % of match intensity
      max:       75,
      rampRate:  '+5%/week',
    },
    workload: {
      sessionsPerWeek:   { min: 3, target: 4, max: 5 },
      minutesPerSession: { min: 60, target: 75, max: 90 },
      restDaysBetween:   2,
    },
    injuryTolerance: 'CONSERVATIVE', // protect players entering the season
    attendanceExpectation: {
      target:  85,
      minimum: 75,
      note:    'Holidays expected. Track but don\'t penalise.',
    },
    squadRotation: {
      policy:  'BROAD',
      note:    'Every registered player should get 2+ sessions before cut-down.',
      targetPlayers: 'All',
    },
    playerDevelopment: [
      'Baseline fitness tests (40m dash, aerobic capacity)',
      'Position-specific skill certification',
      'Tackle technique refresh',
      'Core values alignment session',
    ],
    recoveryRecommendations: [
      'At least 2 full rest days per week',
      'Active recovery (swim/bike) day after high-intensity session',
      'Sleep target: 8 hours for youth, 7 for adults',
      'Hydration tracking at every session',
    ],
    keyMetrics: ['Fitness test scores', 'Squad size', 'Skill benchmark results'],
    alerts: ['Watch for early-season overuse injuries (hamstrings, calves)'],
  },

  [PHASE.EARLY_SEASON]: {
    label:          'Early Season',
    trainingEmphasis: [
      'Match-day rhythm and intensity',
      'Game system embedding',
      'Set piece competitive sharpening',
      'Tactical shape under pressure',
      'Character moments — winning habits',
    ],
    intensity: {
      target:    80,
      max:       90,
      rampRate:  '+2%/week',
    },
    workload: {
      sessionsPerWeek:   { min: 2, target: 3, max: 4 },
      minutesPerSession: { min: 60, target: 80, max: 100 },
      restDaysBetween:   2,
    },
    injuryTolerance: 'MODERATE',
    attendanceExpectation: {
      target:  82,
      minimum: 72,
      note:    'League results matter. Build attendance culture now.',
    },
    squadRotation: {
      policy:  'MERIT_WITH_DEVELOPMENT',
      note:    'Best 15 play, but development players get 20+ minutes per game.',
      targetPlayers: 'Core 20 + 5 development',
    },
    playerDevelopment: [
      'Individual skill sessions (pillar players)',
      'Position group meetings',
      'Video review 24h post-match',
      'Individual target cards for each player',
    ],
    recoveryRecommendations: [
      '48 hours between sessions post-match week',
      'Tuesday recovery session (light, no contact)',
      'Nutrition protocols published to parents',
    ],
    keyMetrics: ['League position', 'Win rate', 'Attendance rate', 'Injury count'],
    alerts: ['Shoulder and ankle injuries peak — monitor contact drill intensity'],
  },

  [PHASE.MID_SEASON]: {
    label:          'Mid-Season',
    trainingEmphasis: [
      'Tactical detail and execution',
      'Opposition-specific preparation',
      'Depth player readiness',
      'Mental resilience under pressure',
      'Load management for key players',
    ],
    intensity: {
      target:    85,
      max:       95,
      rampRate:  '0% — maintain',
    },
    workload: {
      sessionsPerWeek:   { min: 2, target: 3, max: 3 },
      minutesPerSession: { min: 60, target: 75, max: 90 },
      restDaysBetween:   2,
    },
    injuryTolerance: 'MODERATE',
    attendanceExpectation: {
      target:  80,
      minimum: 70,
      note:    'December pressure (exams, Christmas). Communicate early.',
    },
    squadRotation: {
      policy:  'MERIT_DOMINANT',
      note:    'Results critical. Rotate conservatively.',
      targetPlayers: 'Core 22',
    },
    playerDevelopment: [
      'Mid-season review 1:1 meetings',
      'Set goals for second half of season',
      'Identify players for rep squad consideration',
    ],
    recoveryRecommendations: [
      'Force at least 1 full rest week if 4 games in 3 weeks',
      'Ice bath protocol after contact sessions',
      'Wellbeing check-ins for youth players (exam stress)',
    ],
    keyMetrics: ['League position vs target', 'Injury count', 'Squad depth', 'Player retention'],
    alerts: ['December burn-out risk — watch absence and mood signals'],
  },

  [PHASE.REP_WINDOWS]: {
    label:          'Representative Windows',
    trainingEmphasis: [
      'Development player elevation',
      'Club identity vs representative pathway',
      'Depth squad building',
      'Tactical flexibility without key players',
    ],
    intensity: {
      target:    75,
      max:       85,
      rampRate:  '0%',
    },
    workload: {
      sessionsPerWeek:   { min: 2, target: 3, max: 3 },
      minutesPerSession: { min: 50, target: 70, max: 80 },
      restDaysBetween:   2,
    },
    injuryTolerance: 'CONSERVATIVE', // can\'t afford to lose rep players
    attendanceExpectation: {
      target:  75,
      minimum: 65,
      note:    'Rep players absent. Adjust team meeting expectations.',
    },
    squadRotation: {
      policy:  'DEVELOPMENT_FIRST',
      note:    'Development players must lead. Use windows as opportunity.',
      targetPlayers: 'Development 15 + returning reps',
    },
    playerDevelopment: [
      'Rep players: structured individual programmes',
      'Non-rep players: elevated roles and responsibility',
      'Scout potential rep squad players',
    ],
    recoveryRecommendations: [
      'Coordinate with provincial team on returning players\' load',
      'Return-to-train protocols for rep players',
    ],
    keyMetrics: ['Development player game time', 'Rep squad selections', 'Availability %'],
    alerts: ['Manage expectations with parents of non-rep players during window'],
  },

  [PHASE.PLAYOFF_PREP]: {
    label:          'Playoff Preparation',
    trainingEmphasis: [
      'Execution under pressure',
      'Set piece precision (lineout/scrum win rate targets)',
      'High-pressure scenario rehearsal',
      'Defensive system review and tightening',
      'Peak conditioning',
    ],
    intensity: {
      target:    90,
      max:       100,
      rampRate:  '+3%/week tapering to -5% final week',
    },
    workload: {
      sessionsPerWeek:   { min: 2, target: 3, max: 3 },
      minutesPerSession: { min: 50, target: 70, max: 80 },
      restDaysBetween:   2,
    },
    injuryTolerance: 'ZERO', // zero-tolerance — can\'t afford losses now
    attendanceExpectation: {
      target:  90,
      minimum: 80,
      note:    'Playoffs. This is the time. Non-attendance is a selection signal.',
    },
    squadRotation: {
      policy:  'MERIT_STRICT',
      note:    'Best 22 play. Development pathway resumes next pre-season.',
      targetPlayers: 'Core 22',
    },
    playerDevelopment: [
      'Performance reviews for all 22 match-day players',
      'Mental skills sessions (pre-match routine, pressure rehearsal)',
    ],
    recoveryRecommendations: [
      'Taper training volume 10 days before first playoff',
      'Match-day nutrition protocols locked in',
      'Sleep/recovery priority — no late nights',
    ],
    keyMetrics: ['Availability %', 'Set piece win rates', 'Training intensity completion', 'Attendance %'],
    alerts: ['Playoff pressure = increased injury risk. Controlled contact sessions only.'],
  },

  [PHASE.FINALS]: {
    label:          'Finals',
    trainingEmphasis: [
      'Match-day ritual and routine',
      'Opposition-specific detail',
      'Controlled intensity — trust the training',
      'Team culture at its peak',
    ],
    intensity: {
      target:    80, // taper down from playoff peak
      max:       90,
      rampRate:  '-5%/week',
    },
    workload: {
      sessionsPerWeek:   { min: 2, target: 2, max: 3 },
      minutesPerSession: { min: 45, target: 60, max: 75 },
      restDaysBetween:   3, // more recovery
    },
    injuryTolerance: 'ZERO',
    attendanceExpectation: {
      target:  95,
      minimum: 85,
      note:    'Finals month. Everyone must be present.',
    },
    squadRotation: {
      policy:  'LOCKED',
      note:    'Squad is set. Trust your selection.',
      targetPlayers: 'Final 22',
    },
    playerDevelopment: [
      'Seasonal reviews begin for off-season planning',
      'Identify players for next season\'s leadership group',
    ],
    recoveryRecommendations: [
      'Full rest day before Captain\'s run',
      'Post-match ice bath within 30 minutes',
      'Sleep 9h+ target the two nights before the final',
    ],
    keyMetrics: ['Final result', 'Player availability', 'Training completion rate'],
    alerts: ['Trust the preparation. Reduce intensity. Freshness wins finals.'],
  },

  [PHASE.OFF_SEASON]: {
    label:          'Off-Season',
    trainingEmphasis: [
      'Physical and mental recovery',
      'Optional skills clinics only',
      'Recruitment and retention conversations',
      'Next season planning',
    ],
    intensity: {
      target:    30,
      max:       50,
      rampRate:  'None — active rest',
    },
    workload: {
      sessionsPerWeek:   { min: 0, target: 1, max: 2 },
      minutesPerSession: { min: 0, target: 45, max: 60 },
      restDaysBetween:   3,
    },
    injuryTolerance: 'HIGH', // minor niggles heal now
    attendanceExpectation: {
      target:  50,
      minimum: 0,
      note:    'Off-season is voluntary. Don\'t pressure players.',
    },
    squadRotation: {
      policy:  'VOLUNTARY',
      note:    'All players equal. No pressure to attend.',
      targetPlayers: 'Whoever shows up',
    },
    playerDevelopment: [
      'Off-season personal development plans',
      'Cross-training and other sports encouraged',
      'School/work/life balance prioritised',
      'Club social events and community connection',
    ],
    recoveryRecommendations: [
      '4 weeks of full rest recommended after finals',
      'Physio review for any lingering injuries',
      'Mental health check-in (post-season lull is real)',
    ],
    keyMetrics: ['Retention rate', 'Recruitment pipeline', 'Player feedback score'],
    alerts: ['Re-engagement campaign 6 weeks before pre-season starts'],
  },
};

export function getPrescription(phase) {
  return PRESCRIPTIONS[phase] ?? PRESCRIPTIONS[PHASE.OFF_SEASON];
}

export function compareToPrescription(phase, observations) {
  const p = getPrescription(phase);
  const gaps = [];

  const att = observations?.attendance?.averageRate;
  if (att != null && att < p.attendanceExpectation.minimum) {
    gaps.push({
      dimension: 'attendance',
      current:   att,
      target:    p.attendanceExpectation.target,
      gap:       p.attendanceExpectation.target - att,
      severity:  att < p.attendanceExpectation.minimum - 10 ? 'HIGH' : 'MEDIUM',
      note:      p.attendanceExpectation.note,
    });
  }

  return { phase, prescription: p, gaps, compliant: gaps.length === 0 };
}
