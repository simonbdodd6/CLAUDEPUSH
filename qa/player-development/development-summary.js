/**
 * Development Summary
 * Combines all analysis module scores into a single composite Development Score.
 * This is the headline number for the player dashboard.
 */

import { gradeFromScore, trendDirection, confidenceFromDataPoints } from './attendance-analysis.js';

// ── Dimension weights ─────────────────────────────────────────────────────────

const WEIGHTS = {
  attendance:         0.25,  // consistency of turning up
  programmeCompliance: 0.20, // doing the work
  injuryFree:         0.20,  // staying healthy (100 - injuryRisk)
  strengthProgress:   0.15,  // getting stronger
  speedProgress:      0.10,  // getting faster/fitter
  coachFeedback:      0.10,  // coach sentiment
};

// ── Composite calculation ─────────────────────────────────────────────────────

export function buildDevelopmentSummary(analyses = {}) {
  const {
    attendance,
    programmeCompliance,
    injuryRisk,
    strengthProgress,
    speedProgress,
    coachFeedback,
    readiness,
  } = analyses;

  const dimensions = [];
  const reasons    = [];
  const flags      = [];

  function addDimension(name, analysis, weight) {
    if (!analysis || analysis.score == null) return;
    dimensions.push({ name, score: analysis.score, weight });
    flags.push(...(analysis.flags ?? []));
  }

  addDimension('attendance',          attendance,          WEIGHTS.attendance);
  addDimension('programmeCompliance', programmeCompliance, WEIGHTS.programmeCompliance);
  addDimension('strengthProgress',    strengthProgress,    WEIGHTS.strengthProgress);
  addDimension('speedProgress',       speedProgress,       WEIGHTS.speedProgress);
  addDimension('coachFeedback',       coachFeedback,       WEIGHTS.coachFeedback);

  // Injury contributes inversely — high risk = lower development score
  if (injuryRisk && injuryRisk.score != null) {
    const injuryFreeScore = 100 - injuryRisk.score;
    dimensions.push({ name: 'injuryFree', score: injuryFreeScore, weight: WEIGHTS.injuryFree });
  }

  if (dimensions.length === 0) {
    return {
      score:      null,
      grade:      null,
      trend:      'insufficient-data',
      confidence: 'none',
      reasons:    ['Insufficient data to calculate development score — start tracking attendance and generating programmes'],
      flags:      [{ level: 'info', message: 'Development score requires attendance data and at least one programme' }],
      rawData:    { dimensions: [], dataCompleteness: 0 },
    };
  }

  // Weighted average
  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
  const weightedScore = dimensions.reduce((s, d) => s + d.weight * d.score, 0);
  const rawScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
  const finalScore = Math.round(rawScore);

  // Reasoning
  const topDimension = dimensions.reduce((best, d) => d.score > best.score ? d : best, dimensions[0]);
  const bottomDimension = dimensions.reduce((worst, d) => d.score < worst.score ? d : worst, dimensions[0]);

  reasons.push(`Development score of ${finalScore}/100 — composite of ${dimensions.length} tracked dimensions`);

  if (topDimension.score >= 70) {
    reasons.push(`Strongest dimension: ${topDimension.name} (${topDimension.score}/100) — leverage this for confidence`);
  }
  if (bottomDimension.score < 60) {
    reasons.push(`Area needing focus: ${bottomDimension.name} (${bottomDimension.score}/100) — prioritise improvement here`);
  }

  // Grade-specific insight
  const grade = gradeFromScore(finalScore);
  if (finalScore >= 80) {
    reasons.push('Overall development is strong — player is on a positive trajectory');
  } else if (finalScore >= 65) {
    reasons.push('Development is progressing — targeted attention on weaker dimensions will accelerate growth');
  } else if (finalScore >= 50) {
    reasons.push('Development needs structured support — review attendance, programme compliance, and injury prevention');
  } else {
    reasons.push('Development requires urgent attention — a one-to-one review with the player is recommended');
    flags.push({ level: 'critical', message: 'Development score below 50 — immediate coach intervention recommended' });
  }

  const dataCompleteness = dimensions.length / Object.keys(WEIGHTS).length;

  // Deduplicate flags
  const uniqueFlags = [];
  const flagMessages = new Set();
  for (const flag of flags) {
    if (!flagMessages.has(flag.message)) {
      uniqueFlags.push(flag);
      flagMessages.add(flag.message);
    }
  }

  return {
    score:      finalScore,
    grade,
    trend:      calculateOverallTrend(analyses),
    confidence: confidenceFromDataPoints(dimensions.length),
    reasons,
    flags:      uniqueFlags,
    rawData: {
      dimensions,
      dataCompleteness:     Math.round(dataCompleteness * 100),
      missingDimensions:    getMissingDimensions(analyses),
      weightedComponents:   dimensions.map(d => ({ name: d.name, contribution: Math.round(d.score * d.weight) })),
    },
  };
}

function calculateOverallTrend(analyses = {}) {
  const trends = Object.values(analyses)
    .filter(a => a?.trend && a.trend !== 'insufficient-data')
    .map(a => {
      if (a.trend === 'improving') return 1;
      if (a.trend === 'declining') return -1;
      return 0;
    });

  if (trends.length === 0) return 'insufficient-data';
  const sum = trends.reduce((a, b) => a + b, 0);
  if (sum > 0) return 'improving';
  if (sum < 0) return 'declining';
  return 'stable';
}

function getMissingDimensions(analyses = {}) {
  const missing = [];
  if (!analyses.attendance?.score)         missing.push('attendance');
  if (!analyses.programmeCompliance?.score) missing.push('programme-compliance');
  if (!analyses.injuryRisk?.score)          missing.push('injury-risk');
  if (!analyses.strengthProgress?.score)    missing.push('strength-progress');
  if (!analyses.speedProgress?.score)       missing.push('speed-progress');
  if (!analyses.coachFeedback?.score)       missing.push('coach-feedback');
  return missing;
}

// ── Promotion readiness ───────────────────────────────────────────────────────

const AGE_GROUP_BOUNDARIES = {
  U8:  { maxAge: 7,  nextGroup: 'U10' },
  U10: { maxAge: 9,  nextGroup: 'U12' },
  U12: { maxAge: 11, nextGroup: 'U14' },
  U14: { maxAge: 13, nextGroup: 'U16' },
  U16: { maxAge: 15, nextGroup: 'U18' },
  U18: { maxAge: 17, nextGroup: 'Senior' },
  U20: { maxAge: 19, nextGroup: 'Senior' },
  Senior: { maxAge: null, nextGroup: null },
};

export function assessPromotionReadiness(player, developmentScore, readiness) {
  const core     = player.core ?? {};
  const age      = core.age;
  const ageGroup = core.ageGroup;
  const boundary = AGE_GROUP_BOUNDARIES[ageGroup];

  const reasons  = [];
  const blockers = [];
  const flags    = [];

  if (!boundary?.maxAge || !age) {
    return {
      ready:      false,
      confidence: 'none',
      nextGroup:  boundary?.nextGroup ?? null,
      reasons:    ['Insufficient data to assess promotion readiness'],
      blockers:   [],
      flags:      [],
      rawData:    {},
    };
  }

  const yearsToMax = boundary.maxAge - age + 1;
  const approachingBoundary = yearsToMax <= 1;

  if (approachingBoundary) {
    reasons.push(`Age ${age} in ${ageGroup} — approaching upper age boundary (max age ${boundary.maxAge})`);
    flags.push({ level: 'info', message: `Player will age into ${boundary.nextGroup} within the year — plan development accordingly` });
  }

  // Development criteria for promotion
  const devScore   = developmentScore?.score ?? 0;
  const readScore  = readiness?.score ?? 0;
  const attRate    = (player.attendance?.rate ?? 0);
  const injuries   = (player.injuries ?? []).filter(i => i.status === 'active');

  const criteriaPass = [];
  const criteriaMiss = [];

  if (devScore >= 70) criteriaPass.push(`Development score ${devScore}/100 meets threshold (≥70)`);
  else criteriaMiss.push(`Development score ${devScore}/100 below threshold (need ≥70)`);

  if (readScore >= 70) criteriaPass.push(`Readiness score ${readScore}/100 meets threshold (≥70)`);
  else criteriaMiss.push(`Readiness score ${readScore}/100 below threshold (need ≥70)`);

  if (attRate >= 0.75) criteriaPass.push(`Attendance ${Math.round(attRate * 100)}% meets threshold (≥75%)`);
  else criteriaMiss.push(`Attendance ${Math.round(attRate * 100)}% below threshold (need ≥75%)`);

  if (injuries.length === 0) criteriaPass.push('No active injuries');
  else blockers.push(`Active injury (${injuries.map(i => i.type).join(', ')}) must be cleared before promotion`);

  const passCount = criteriaPass.length;
  const totalCriteria = criteriaPass.length + criteriaMiss.length + blockers.length;
  const ready = criteriaMiss.length === 0 && blockers.length === 0 && approachingBoundary;

  return {
    ready,
    nextGroup:    boundary.nextGroup,
    criteriaPass,
    criteriaMiss,
    blockers,
    confidence:   confidenceFromDataPoints(passCount),
    reasons:      [
      ...reasons,
      ...criteriaPass,
    ],
    flags,
    rawData: {
      age,
      ageGroup,
      yearsToBoundary: yearsToMax,
      passCount,
      totalCriteria,
    },
  };
}
