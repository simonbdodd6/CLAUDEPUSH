/**
 * Season Simulation
 *
 * Compares three trajectories across 4 key metrics over the next 8 weeks:
 *
 *   current  → what happens if nothing changes
 *   expected → what the platform targets for this phase
 *   ideal    → perfectly-run season benchmark
 *
 * Metrics: availability · attendance · injuryBurden · workloadBalance
 *
 * When the gap between current and expected exceeds the threshold,
 * the simulation generates an intervention recommendation.
 */

import { detectCurrentPhase, getPhaseMeta } from './season-phases.js';
import { getPrescription }                  from './phase-prescriptions.js';

const METRICS = ['availability', 'attendance', 'injuryBurden', 'workloadBalance'];

// ── Ideal benchmarks (perfectly-run season) ────────────────────────────────────

const IDEAL = {
  availability:    { peak: 92, minimum: 82, label: 'Player availability' },
  attendance:      { peak: 88, minimum: 78, label: 'Training attendance' },
  injuryBurden:    { peak: 90, minimum: 80, label: 'Injury health score' },
  workloadBalance: { peak: 88, minimum: 78, label: 'Workload balance' },
};

// ── Phase-specific expected baselines ─────────────────────────────────────────

const EXPECTED_BY_PHASE = {
  PRE_SEASON:   { availability: 80, attendance: 85, injuryBurden: 88, workloadBalance: 82 },
  EARLY_SEASON: { availability: 82, attendance: 82, injuryBurden: 82, workloadBalance: 80 },
  MID_SEASON:   { availability: 80, attendance: 80, injuryBurden: 78, workloadBalance: 78 },
  REP_WINDOWS:  { availability: 72, attendance: 75, injuryBurden: 82, workloadBalance: 80 },
  PLAYOFF_PREP: { availability: 86, attendance: 88, injuryBurden: 84, workloadBalance: 82 },
  FINALS:       { availability: 90, attendance: 93, injuryBurden: 86, workloadBalance: 85 },
  OFF_SEASON:   { availability: 60, attendance: 45, injuryBurden: 92, workloadBalance: 88 },
};

// ── Current state extraction from observations ─────────────────────────────────

function extractCurrentValues(observations, clubHealth) {
  const injuries = observations?.injuries?.total ?? 3;
  const playerCount = observations?.twinStatus?.playerCount ?? 40;
  const unavailable = injuries + Math.ceil(playerCount * 0.05);
  const availability = Math.round(((playerCount - unavailable) / playerCount) * 100);

  return {
    availability:    Math.min(100, availability),
    attendance:      observations?.attendance?.averageRate ?? 68,
    injuryBurden:    clubHealth?.dimensions?.injuryBurden?.score ?? Math.max(0, 100 - (injuries * 8)),
    workloadBalance: clubHealth?.dimensions?.workloadBalance?.score ?? 72,
  };
}

// ── Weekly projection ─────────────────────────────────────────────────────────

function projectWeeks(startValue, trend, weeks) {
  const points = [];
  let val = startValue;
  for (let w = 0; w <= weeks; w++) {
    points.push(Math.round(Math.min(100, Math.max(0, val))));
    val += trend;
  }
  return points;
}

// ── Build simulation for one metric ───────────────────────────────────────────

function simulateMetric(metric, currentValue, phase, weeks = 8) {
  const expected       = EXPECTED_BY_PHASE[phase]?.[metric] ?? 75;
  const ideal          = IDEAL[metric]?.peak ?? 85;
  const label          = IDEAL[metric]?.label ?? metric;

  // Trends: current moves slowly, expected converges toward ideal, ideal is constant
  const currentTrend  = currentValue < expected ? +0.4 : currentValue > expected + 5 ? -0.3 : 0;
  const expectedTrend = 0.3; // slowly improving
  const idealTrend    = 0.1;

  const currentSeries  = projectWeeks(currentValue, currentTrend,  weeks);
  const expectedSeries = projectWeeks(expected,      expectedTrend, weeks);
  const idealSeries    = projectWeeks(ideal,         idealTrend,    weeks);

  const gap           = expected - currentValue;
  const gapSeverity   = gap > 15 ? 'HIGH' : gap > 8 ? 'MEDIUM' : gap > 3 ? 'LOW' : 'NONE';
  const trend         = currentTrend > 0 ? 'improving' : currentTrend < 0 ? 'declining' : 'stable';

  return {
    metric,
    label,
    phase,
    current:  currentValue,
    expected,
    ideal,
    gap:      Math.round(gap),
    gapSeverity,
    trend,
    series: {
      weeks:    Array.from({ length: weeks + 1 }, (_, i) => `+${i}w`),
      current:  currentSeries,
      expected: expectedSeries,
      ideal:    idealSeries,
    },
    endOfWindow: {
      current:  currentSeries[weeks],
      expected: expectedSeries[weeks],
      ideal:    idealSeries[weeks],
    },
  };
}

// ── Interventions for gaps ─────────────────────────────────────────────────────

const GAP_INTERVENTIONS = {
  availability: [
    { action: 'Physio review all current injuries',     actionId: 'LOG_INJURY',        priority: 'HIGH'   },
    { action: 'Return-to-train programme',              actionId: 'LOG_PLAYER_NOTE',   priority: 'HIGH'   },
    { action: 'Reduce contact training this week',      actionId: 'SCHEDULE_SESSION',  priority: 'MEDIUM' },
  ],
  attendance: [
    { action: 'Parent engagement message',              actionId: 'SEND_TEAM_MESSAGE', priority: 'HIGH'   },
    { action: 'Review session time/day with players',   actionId: 'SCHEDULE_SESSION',  priority: 'MEDIUM' },
    { action: 'One-to-one check-ins for absent players',actionId: 'LOG_PLAYER_NOTE',   priority: 'MEDIUM' },
  ],
  injuryBurden: [
    { action: 'Modify high-contact drill intensity',    actionId: 'SCHEDULE_SESSION',  priority: 'HIGH'   },
    { action: 'Physio session for all injury-risk players',actionId: 'LOG_INJURY',     priority: 'HIGH'   },
    { action: 'Injury pattern audit with coaching staff',actionId: 'SEND_TEAM_MESSAGE', priority: 'MEDIUM'},
  ],
  workloadBalance: [
    { action: 'Rest day mandate for overloaded players',actionId: 'LOG_PLAYER_NOTE',   priority: 'HIGH'   },
    { action: 'Session load review',                    actionId: 'SCHEDULE_SESSION',  priority: 'MEDIUM' },
  ],
};

// ── Public API ─────────────────────────────────────────────────────────────────

export function runSimulation(observations, clubHealth, date = new Date(), weeks = 8) {
  const phase      = detectCurrentPhase(date);
  const phaseMeta  = getPhaseMeta(phase);
  const current    = extractCurrentValues(observations, clubHealth);
  const expected   = EXPECTED_BY_PHASE[phase] ?? EXPECTED_BY_PHASE.EARLY_SEASON;
  const ideal      = Object.fromEntries(METRICS.map(m => [m, IDEAL[m]?.peak ?? 85]));

  const metrics    = METRICS.map(m => simulateMetric(m, current[m], phase, weeks));

  const overallGap = Math.round(metrics.reduce((s, m) => s + Math.max(0, m.gap), 0) / metrics.length);
  const highGaps   = metrics.filter(m => m.gapSeverity === 'HIGH' || m.gapSeverity === 'MEDIUM');

  const interventions = highGaps.flatMap(m =>
    (GAP_INTERVENTIONS[m.metric] ?? []).map(i => ({
      ...i,
      metric:    m.metric,
      metricLabel: m.label,
      gap:       m.gap,
      gapSeverity: m.gapSeverity,
    }))
  );

  const overallStatus = overallGap > 10 ? 'BEHIND_PLAN' : overallGap > 4 ? 'SLIGHTLY_BEHIND' : 'ON_TRACK';
  const summary = overallStatus === 'ON_TRACK'
    ? `Club is on track for ${phaseMeta.label}. All key metrics within expected range.`
    : overallStatus === 'BEHIND_PLAN'
      ? `Club is behind plan in ${highGaps.length} area${highGaps.length > 1 ? 's' : ''}. Immediate interventions recommended.`
      : `Club is slightly behind plan. Monitor trends and action recommendations.`;

  return {
    generatedAt:    new Date().toISOString(),
    phase,
    phaseLabel:     phaseMeta.label,
    weeks,
    overallStatus,
    overallGap,
    summary,
    metrics,
    current,
    expected,
    ideal,
    interventions,
    highGapCount:   highGaps.length,
    onTrackCount:   metrics.filter(m => m.gapSeverity === 'NONE' || m.gapSeverity === 'LOW').length,
  };
}

export function getGapSummary(simulation) {
  return simulation.metrics.map(m => ({
    metric:   m.metric,
    label:    m.label,
    current:  m.current,
    expected: m.expected,
    gap:      m.gap,
    severity: m.gapSeverity,
    trend:    m.trend,
    inWeeks8: m.endOfWindow.current,
  }));
}

export function compareSimulations(sim1, sim2) {
  return {
    overallGapDelta: sim2.overallGap - sim1.overallGap,
    improved: sim2.metrics.filter(m => {
      const prev = sim1.metrics.find(p => p.metric === m.metric);
      return prev && m.gap < prev.gap;
    }).map(m => m.metric),
    worsened: sim2.metrics.filter(m => {
      const prev = sim1.metrics.find(p => p.metric === m.metric);
      return prev && m.gap > prev.gap;
    }).map(m => m.metric),
  };
}
