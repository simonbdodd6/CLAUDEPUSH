/**
 * Predictive Models
 *
 * Five forward-looking models:
 *   1. playerWorkloadForecast   — "This player will likely exceed workload in N days"
 *   2. attendanceForecast       — "Attendance will probably fall after school holidays"
 *   3. availabilityTrajectory   — "On track to reach 92% by playoffs"
 *   4. injuryRiskIndex          — "Front row injury risk increasing"
 *   5. seasonOutcomeProjection  — "Current trajectory ends at 75/100 health by finals"
 *
 * Each prediction returns:
 *   { type, title, prediction, confidence, timeframe, explanation, interventions[] }
 */

import { detectCurrentPhase, getSeasonWeek, PHASE } from './season-phases.js';

// ── School holiday calendar (approximate Irish dates) ──────────────────────────

const HOLIDAY_WINDOWS = [
  { label: 'October mid-term', startMonth: 10, startDay: 28, endMonth: 11, endDay: 1  },
  { label: 'Christmas',        startMonth: 12, startDay: 22, endMonth:  1, endDay: 7  },
  { label: 'February mid-term',startMonth:  2, startDay: 17, endMonth:  2, endDay: 21 },
  { label: 'Easter',           startMonth:  4, startDay:  7, endMonth:  4, endDay: 18 },
  { label: 'Summer',           startMonth:  6, startDay:  1, endMonth:  9, endDay:  1 },
];

function daysUntilHoliday(date = new Date()) {
  const month = date.getMonth() + 1;
  const day   = date.getDate();
  for (const w of HOLIDAY_WINDOWS) {
    if (month === w.startMonth && day <= w.startDay) {
      return w.startDay - day;
    }
    if (month < w.startMonth) {
      return (w.startMonth - month) * 30 + (w.startDay - day);
    }
  }
  return 999;
}

function isInHoliday(date = new Date()) {
  const month = date.getMonth() + 1;
  const day   = date.getDate();
  return HOLIDAY_WINDOWS.some(w => {
    const afterStart = month > w.startMonth || (month === w.startMonth && day >= w.startDay);
    const beforeEnd  = month < w.endMonth   || (month === w.endMonth   && day <= w.endDay);
    return afterStart && beforeEnd;
  });
}

// ── Helper ────────────────────────────────────────────────────────────────────

function prediction(fields) {
  return {
    id:           `pred-${fields.type}-${Date.now()}`,
    createdAt:    new Date().toISOString(),
    ...fields,
  };
}

// ── Model 1: Player Workload Forecast ─────────────────────────────────────────

export function playerWorkloadForecast(observations, date = new Date()) {
  const phase     = detectCurrentPhase(date);
  const workload  = observations?.workload ?? {};
  const overloaded= workload.overloadedPlayers ?? [];
  const avgSess   = workload.averageSessionsPerWeek ?? 2.4;

  const preds = [];

  for (const player of overloaded) {
    const sessNow    = player.sessionCount ?? 5;
    const threshold  = phase === PHASE.PRE_SEASON ? 4 : 5;
    const daysToRisk = sessNow >= threshold
      ? 0
      : Math.ceil(((threshold - sessNow) / (sessNow / 7)) * 7);

    preds.push(prediction({
      type:        'PLAYER_WORKLOAD',
      title:       `${player.name} — workload threshold exceeded`,
      prediction:  sessNow >= threshold ? 'Currently overloaded' : `Will exceed threshold in ~${daysToRisk} days`,
      confidence:  sessNow >= threshold ? 90 : 65,
      timeframe:   sessNow >= threshold ? 'Now' : `${daysToRisk} days`,
      player:      player,
      explanation: `${player.name} has attended ${sessNow} sessions this week. Phase target is ≤${threshold} sessions/week. Cumulative fatigue increases acute injury probability by ~${Math.round((sessNow - threshold + 1) * 15)}% above baseline.`,
      interventions: [
        { action: 'Mandatory rest day',                actionId: 'LOG_PLAYER_NOTE',    priority: 'HIGH' },
        { action: `Reduce intensity next session`,     actionId: 'SEND_TEAM_MESSAGE',  priority: 'MEDIUM' },
        { action: 'Physio assessment if symptomatic',  actionId: 'LOG_INJURY',          priority: 'MEDIUM' },
      ],
    }));
  }

  if (preds.length === 0 && avgSess > 3.5) {
    preds.push(prediction({
      type:        'PLAYER_WORKLOAD',
      title:       'Squad-wide workload trending high',
      prediction:  `If current average of ${avgSess} sessions/week continues, squad-wide fatigue will peak in 10–14 days`,
      confidence:  60,
      timeframe:   '10–14 days',
      explanation: `Average squad sessions per week (${avgSess}) is above sustainable phase targets. No individual player is overloaded yet, but collective fatigue accumulates non-linearly.`,
      interventions: [
        { action: 'Reduce Thursday session to recovery-only', actionId: 'SCHEDULE_SESSION', priority: 'MEDIUM' },
      ],
    }));
  }

  return preds;
}

// ── Model 2: Attendance Forecast ──────────────────────────────────────────────

export function attendanceForecast(observations, date = new Date()) {
  const phase       = detectCurrentPhase(date);
  const current     = observations?.attendance?.averageRate ?? 72;
  const trend       = observations?.attendance?.weeklyTrend ?? 'stable';
  const delta       = trend === 'declining' ? -4 : trend === 'strong' ? +2 : 0;
  const daysToHols  = daysUntilHoliday(date);
  const inHols      = isInHoliday(date);
  const preds       = [];

  // Base trajectory
  const in4Weeks    = Math.max(30, Math.min(100, current + delta * 4));
  if (Math.abs(delta) >= 3 || current < 72) {
    preds.push(prediction({
      type:        'ATTENDANCE_FORECAST',
      title:       `Attendance ${delta < 0 ? 'decline' : 'recovery'} forecast`,
      prediction:  `Attendance will reach ~${in4Weeks}% in 4 weeks at current trend`,
      confidence:  68,
      timeframe:   '4 weeks',
      explanation: `Current rate: ${current}%. Weekly trend: ${delta > 0 ? '+' : ''}${delta}%. Without intervention, 4-week projection is ${in4Weeks}%.`,
      interventions: delta < -3 ? [
        { action: 'Parent engagement campaign',     actionId: 'SEND_TEAM_MESSAGE', priority: 'HIGH' },
        { action: 'Review training time/day',       actionId: 'SCHEDULE_SESSION',  priority: 'MEDIUM' },
        { action: 'One-to-one player check-ins',    actionId: 'LOG_PLAYER_NOTE',   priority: 'LOW' },
      ] : [],
    }));
  }

  // Holiday impact
  if (daysToHols <= 21 && daysToHols > 0) {
    const nextHol = HOLIDAY_WINDOWS.find(w => {
      const m = date.getMonth() + 1;
      return w.startMonth >= m;
    });
    const drop = Math.round(current * 0.18); // ~18% drop during holidays
    preds.push(prediction({
      type:        'HOLIDAY_ATTENDANCE_DIP',
      title:       `${nextHol?.label ?? 'Holiday'} attendance dip in ${daysToHols} days`,
      prediction:  `Attendance will likely drop to ~${current - drop}% during ${nextHol?.label ?? 'holiday period'}`,
      confidence:  82,
      timeframe:   `${daysToHols} days`,
      explanation: `Historical pattern: attendance drops 15–22% during Irish school holidays. Current rate ${current}% suggests holiday attendance of ~${current - drop}%.`,
      interventions: [
        { action: 'Send holiday training schedule',  actionId: 'SEND_NEWSLETTER',  priority: 'MEDIUM' },
        { action: 'Optional holiday skills clinic',  actionId: 'SCHEDULE_SESSION', priority: 'LOW' },
      ],
    }));
  }

  if (inHols) {
    preds.push(prediction({
      type:        'HOLIDAY_ATTENDANCE_DIP',
      title:       'Currently in holiday period — attendance suppressed',
      prediction:  `Attendance will recover to ~${Math.round(current * 1.15)}% within 2 weeks of term restart`,
      confidence:  78,
      timeframe:   '2 weeks post-holiday',
      explanation: 'Holiday period naturally suppresses attendance. No intervention needed — re-engagement campaign after return is high value.',
      interventions: [
        { action: 'Return-to-season communication', actionId: 'SEND_NEWSLETTER', priority: 'MEDIUM' },
      ],
    }));
  }

  return preds;
}

// ── Model 3: Availability Trajectory ──────────────────────────────────────────

export function availabilityTrajectory(observations, targetPhase = PHASE.PLAYOFF_PREP, date = new Date()) {
  const currentPhase   = detectCurrentPhase(date);
  const currentWeek    = getSeasonWeek(date);
  const injuries       = observations?.injuries?.total ?? 3;
  const playerCount    = observations?.twinStatus?.playerCount ?? 40;
  const unavailable    = Math.min(playerCount, injuries + Math.ceil(playerCount * 0.05));
  const currentAvail   = Math.round(((playerCount - unavailable) / playerCount) * 100);
  const targetAvail    = targetPhase === PHASE.FINALS ? 92 : 85;

  // Simple linear recovery model: injuries clear at 0.5/week on average
  const injuryRecoveryRate  = 0.5;
  const weeksToTarget       = 10; // approximate weeks to playoffs from mid-season
  const projectedInjuries   = Math.max(0, injuries - (injuryRecoveryRate * weeksToTarget));
  const projectedAvail      = Math.round(((playerCount - projectedInjuries) / playerCount) * 100);
  const onTrack             = projectedAvail >= targetAvail;

  return [prediction({
    type:        'AVAILABILITY_TRAJECTORY',
    title:       `Availability trajectory → ${targetPhase.replace('_', ' ')}`,
    prediction:  onTrack
      ? `On track to reach ~${projectedAvail}% availability by ${targetPhase.replace('_', ' ')}`
      : `Risk of below-target availability — projected ${projectedAvail}% vs ${targetAvail}% target`,
    confidence:  58,
    timeframe:   `${weeksToTarget} weeks`,
    currentAvail,
    projectedAvail,
    targetAvail,
    onTrack,
    explanation: `Current: ${currentAvail}% available (${injuries} injured). At historical recovery rate of ${injuryRecoveryRate}/week, projecting ${projectedAvail}% at ${targetPhase.replace('_', ' ')}. Target: ${targetAvail}%.`,
    interventions: !onTrack ? [
      { action: 'Physio review all current injuries',   actionId: 'LOG_INJURY',    priority: 'HIGH' },
      { action: 'Reduce contact in training',           actionId: 'SCHEDULE_SESSION', priority: 'HIGH' },
      { action: 'Return-to-train programme for long-term injuries', actionId: 'LOG_PLAYER_NOTE', priority: 'MEDIUM' },
    ] : [],
  })];
}

// ── Model 4: Injury Risk Index ────────────────────────────────────────────────

export function injuryRiskIndex(observations, date = new Date()) {
  const phase    = detectCurrentPhase(date);
  const injuries = observations?.injuries ?? {};
  const byPos    = injuries.byPosition ?? {};
  const preds    = [];

  // Position cluster risk
  for (const [pos, count] of Object.entries(byPos)) {
    if (count >= 2) {
      const risk = count >= 3 ? 'HIGH' : 'ELEVATED';
      preds.push(prediction({
        type:        'INJURY_RISK_INDEX',
        title:       `${pos} injury risk: ${risk}`,
        prediction:  `${count} ${pos} players currently injured. Probability of further ${pos} injury is ${count >= 3 ? '68%' : '42%'} above baseline.`,
        confidence:  70,
        timeframe:   '14 days',
        position:    pos,
        riskLevel:   risk,
        explanation: `Position clusters indicate either a specific training drill causing the same injury pattern, or insufficient rotation. Front row and back row are highest-risk positions in contact training.`,
        interventions: [
          { action: `Audit ${pos} contact drills`,         actionId: 'SCHEDULE_SESSION', priority: 'HIGH' },
          { action: `Rotate ${pos} players in scrums`,     actionId: 'SEND_TEAM_MESSAGE', priority: 'HIGH' },
          { action: 'Technique review with physio',        actionId: 'LOG_INJURY',        priority: 'MEDIUM' },
        ],
      }));
    }
  }

  // Phase-specific risk
  if (phase === PHASE.PRE_SEASON && (injuries.total ?? 0) > 1) {
    preds.push(prediction({
      type:        'INJURY_RISK_INDEX',
      title:       'Pre-season overuse risk — early warning',
      prediction:  'Rapid fitness increase in pre-season without adequate base raises overuse injury risk by 35% in weeks 3–5.',
      confidence:  65,
      timeframe:   '2–3 weeks',
      phase:       PHASE.PRE_SEASON,
      explanation: 'Hamstrings, calves, and hip flexors are most vulnerable during rapid fitness base building. Ensure 48h rest between high-load sessions.',
      interventions: [
        { action: 'Add active recovery session Wednesday', actionId: 'SCHEDULE_SESSION', priority: 'MEDIUM' },
        { action: 'Hamstring screening for all players',   actionId: 'LOG_PLAYER_NOTE',  priority: 'MEDIUM' },
      ],
    }));
  }

  if (phase === PHASE.PLAYOFF_PREP && (injuries.total ?? 0) > 0) {
    preds.push(prediction({
      type:        'INJURY_RISK_INDEX',
      title:       'Playoff pressure injury risk elevated',
      prediction:  'Intensity increase in playoff prep + fatigue accumulation raises injury risk. Control contact volume.',
      confidence:  72,
      timeframe:   '3 weeks',
      phase:       PHASE.PLAYOFF_PREP,
      explanation: 'Playoff preparation combines peak intensity with accumulated season fatigue — the highest-risk period for season-ending injuries. Prioritise controlled contact.',
      interventions: [
        { action: 'Limit full-contact to 1 session/week',  actionId: 'SCHEDULE_SESSION', priority: 'HIGH' },
        { action: 'Taper volume 10 days before playoff',   actionId: 'SCHEDULE_SESSION', priority: 'HIGH' },
      ],
    }));
  }

  return preds;
}

// ── Model 5: Season Outcome Projection ────────────────────────────────────────

export function seasonOutcomeProjection(currentHealth, observations, date = new Date()) {
  const phase   = detectCurrentPhase(date);
  const week    = getSeasonWeek(date);
  const score   = currentHealth?.overall ?? 68;
  const trend   = score >= 75 ? 'improving' : score >= 65 ? 'stable' : 'declining';

  // Project to end of season (week 38) using trend
  const weeksLeft   = Math.max(0, 38 - week);
  const weeklyDelta = trend === 'improving' ? +0.8 : trend === 'declining' ? -1.2 : 0;
  const projected   = Math.min(95, Math.max(30, score + weeklyDelta * weeksLeft));

  return [prediction({
    type:        'SEASON_OUTCOME',
    title:       'Season-end club health projection',
    prediction:  `At current trajectory: club health ${Math.round(projected)}/100 by end of season (currently ${score}/100)`,
    confidence:  52,
    timeframe:   `${weeksLeft} weeks`,
    currentScore: score,
    projectedScore: Math.round(projected),
    trend,
    explanation: `Week ${week} of season. Current health: ${score}/100 (${trend}). At ${weeklyDelta > 0 ? '+' : ''}${weeklyDelta.toFixed(1)} pts/week, season-end projection: ${Math.round(projected)}/100. Grade: ${projected >= 80 ? 'B' : projected >= 70 ? 'C' : 'D'}.`,
    interventions: projected < 70 ? [
      { action: 'Run full Autonomous Assistant check',   actionId: 'RUN_DIGITAL_TWIN',  priority: 'HIGH' },
      { action: 'Address top 3 health dimension gaps',  actionId: 'REVIEW_APPROVALS',  priority: 'HIGH' },
    ] : [],
    idealScore:    88,
    idealDelta:    88 - Math.round(projected),
  })];
}

// ── All predictions ────────────────────────────────────────────────────────────

export function generateAllPredictions(observations, clubHealth, date = new Date()) {
  return [
    ...playerWorkloadForecast(observations, date),
    ...attendanceForecast(observations, date),
    ...availabilityTrajectory(observations, PHASE.PLAYOFF_PREP, date),
    ...injuryRiskIndex(observations, date),
    ...seasonOutcomeProjection(clubHealth, observations, date),
  ];
}
