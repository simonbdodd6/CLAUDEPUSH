/**
 * Projection Engine
 * Predicts future development trajectory based on current scores and trends.
 * Answers: "Where will this player be in 4/8/12 weeks if current trends continue?"
 */

import { gradeFromScore } from './attendance-analysis.js';

// ── Rate of change estimation ─────────────────────────────────────────────────

function estimateWeeklyDelta(analysisResult) {
  if (!analysisResult?.score || !analysisResult?.trend) return 0;
  const { trend, score, confidence } = analysisResult;
  const multiplier = confidence === 'high' ? 1.0 : confidence === 'medium' ? 0.7 : 0.4;

  // Typical weekly improvement rates by trend
  if (trend === 'improving') return (score < 70 ? 0.8 : 0.4) * multiplier;
  if (trend === 'declining') return -0.5 * multiplier;
  if (trend === 'stable')    return 0.1 * multiplier;  // slight natural improvement
  return 0;
}

function projectScore(currentScore, weeklyDelta, weeks) {
  if (currentScore == null) return null;
  const projected = currentScore + (weeklyDelta * weeks);
  return Math.round(Math.max(0, Math.min(100, projected)));
}

// ── Phase progression prediction ─────────────────────────────────────────────

const PHASE_SEQUENCE = ['preseason', 'early-season', 'mid-season', 'late-season', 'off-season'];

function predictNextProgrammePhase(programmes = [], seasonPhase = null) {
  const completed = programmes
    .filter(p => p.status === 'completed')
    .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));

  const lastPhase = completed[0]?.input?.seasonPhase ?? seasonPhase ?? 'preseason';
  const currentIdx = PHASE_SEQUENCE.indexOf(lastPhase.toLowerCase().replace(' ', '-'));

  if (currentIdx < 0) return { nextPhase: 'Early Season', weeks: 8, reason: 'Estimated based on available data' };

  const nextIdx   = (currentIdx + 1) % PHASE_SEQUENCE.length;
  const nextPhase = PHASE_SEQUENCE[nextIdx];
  const phaseLabels = {
    'preseason':    { label: 'Pre-Season',    typicalWeeks: 8 },
    'early-season': { label: 'Early Season',  typicalWeeks: 4 },
    'mid-season':   { label: 'Mid Season',    typicalWeeks: 12 },
    'late-season':  { label: 'Late Season',   typicalWeeks: 4 },
    'off-season':   { label: 'Off Season',    typicalWeeks: 6 },
  };

  const info = phaseLabels[nextPhase] ?? { label: 'Next Phase', typicalWeeks: 8 };

  return {
    nextPhase:      info.label,
    typicalWeeks:   info.typicalWeeks,
    completedPhase: lastPhase,
    reason:         `Completed ${lastPhase} phase — natural progression to ${info.label}`,
  };
}

// ── Blocker identification ────────────────────────────────────────────────────

function identifyBlockers(player, analyses = {}) {
  const blockers = [];
  const activeInjuries = (player.injuries ?? []).filter(i => i.status === 'active');

  if (activeInjuries.length > 0) {
    blockers.push({
      blocker:  `Active injury: ${activeInjuries.map(i => i.type).join(', ')}`,
      impact:   'critical',
      clearableBy: 'Medical clearance + graduated return-to-play',
    });
  }

  const attRate = player.attendance?.rate ?? null;
  if (attRate != null && attRate < 0.70) {
    blockers.push({
      blocker:    `Low attendance (${Math.round(attRate * 100)}%)`,
      impact:     'high',
      clearableBy: 'Identify and resolve attendance barriers — target 75%+ in next 4 weeks',
    });
  }

  if (analyses.programmeCompliance?.score != null && analyses.programmeCompliance.score < 50) {
    blockers.push({
      blocker:    'Low programme compliance',
      impact:     'medium',
      clearableBy: 'Simplify programme, set clear expectations, confirm player understands schedule',
    });
  }

  if (analyses.injuryRisk?.score >= 60) {
    blockers.push({
      blocker:    `Elevated injury risk (${analyses.injuryRisk.score}/100)`,
      impact:     'medium',
      clearableBy: 'Introduce prehab routine, reduce training load temporarily, ensure adequate recovery',
    });
  }

  return blockers;
}

// ── Accelerators ──────────────────────────────────────────────────────────────

function identifyAccelerators(player, analyses = {}, programmes = []) {
  const accelerators = [];

  const attRate = player.attendance?.rate ?? null;
  if (attRate != null && attRate >= 0.80) {
    accelerators.push({
      accelerator: 'High attendance rate',
      impact:     'significant',
      reason:     `${Math.round(attRate * 100)}% attendance means training adaptations accumulate consistently`,
    });
  } else if (attRate != null && attRate >= 0.65) {
    accelerators.push({
      accelerator: 'Increase attendance to 80%+',
      impact:     'significant',
      reason:     'Each additional session attended compounds training adaptations — attendance is the most controllable development lever',
    });
  }

  if (programmes.filter(p => p.status === 'active').length === 0) {
    accelerators.push({
      accelerator: 'Start next programme block now',
      impact:     'high',
      reason:     'No active programme — every week without structured training is a missed development opportunity',
    });
  }

  const injuryRiskScore = analyses.injuryRisk?.score ?? 0;
  if (injuryRiskScore >= 30) {
    accelerators.push({
      accelerator: 'Add 10-minute daily prehab routine',
      impact:     'medium',
      reason:     `Reducing injury risk from ${injuryRiskScore}/100 protects training continuity — interruptions are the biggest development blocker`,
    });
  }

  if (!analyses.coachFeedback?.score) {
    accelerators.push({
      accelerator: 'Start recording coach feedback after each programme block',
      impact:     'medium',
      reason:     'Structured feedback enables the development engine to detect patterns and generate better recommendations',
    });
  }

  return accelerators;
}

// ── Main projection ────────────────────────────────────────────────────────────

export function predictNextPhase(player, programmes = [], analyses = {}) {
  const devScore    = analyses.developmentSummary?.score ?? null;
  const weeklyDelta = estimateWeeklyDelta(analyses.developmentSummary);
  const phaseInfo   = predictNextProgrammePhase(programmes, player.core?.seasonPhase);
  const blockers    = identifyBlockers(player, analyses);
  const accelerators = identifyAccelerators(player, analyses, programmes);

  const projections = {};
  for (const weeks of [4, 8, 12]) {
    const projected = projectScore(devScore, weeklyDelta, weeks);
    projections[`weeks${weeks}`] = {
      score:        projected,
      grade:        projected != null ? gradeFromScore(projected) : null,
      assumption:   `If current trend (${analyses.developmentSummary?.trend ?? 'unknown'}) continues`,
    };
  }

  // Estimate time to next grade
  const timeToNextGrade = estimateTimeToNextGrade(devScore, weeklyDelta);

  // Primary trajectory narrative
  let trajectoryNarrative;
  if (devScore == null) {
    trajectoryNarrative = 'Insufficient data to project trajectory — begin tracking attendance and programmes';
  } else if (blockers.some(b => b.impact === 'critical')) {
    trajectoryNarrative = `Trajectory is blocked by critical factors: ${blockers.filter(b => b.impact === 'critical').map(b => b.blocker).join(', ')}. Address these first.`;
  } else if (weeklyDelta > 0.5) {
    trajectoryNarrative = `Positive trajectory — if current progress continues, development score should improve from ${devScore} to approximately ${projections.weeks8.score ?? '?'} in 8 weeks`;
  } else if (weeklyDelta < -0.3) {
    trajectoryNarrative = `Declining trajectory — intervention needed. Without changes, development score could drop to ${projections.weeks8.score ?? '?'} in 8 weeks`;
  } else {
    trajectoryNarrative = `Stable trajectory — consistent performance at ${devScore}/100. Small improvements in ${analyses.developmentSummary?.rawData?.missingDimensions?.slice(0,2)?.join(' and ') ?? 'attendance and compliance'} could drive meaningful progress`;
  }

  return {
    currentScore:  devScore,
    currentGrade:  devScore != null ? gradeFromScore(devScore) : null,
    weeklyDelta:   Math.round(weeklyDelta * 10) / 10,
    projections,
    timeToNextGrade,
    nextProgrammePhase: phaseInfo,
    trajectoryNarrative,
    blockers,
    accelerators,
    confidence:    analyses.developmentSummary?.confidence ?? 'low',
  };
}

function estimateTimeToNextGrade(score, weeklyDelta) {
  if (!score || !weeklyDelta || weeklyDelta <= 0) return null;

  const gradeThresholds = [55, 65, 70, 75, 80, 85, 90];
  const nextThreshold = gradeThresholds.find(t => t > score);
  if (!nextThreshold) return { weeks: null, targetScore: null, message: 'Already at top grade' };

  const weeksNeeded = Math.ceil((nextThreshold - score) / weeklyDelta);
  return {
    weeks:       weeksNeeded,
    targetScore: nextThreshold,
    targetGrade: gradeFromScore(nextThreshold),
    message:     `At current rate of improvement, grade ${gradeFromScore(nextThreshold)} reachable in approximately ${weeksNeeded} weeks`,
  };
}
