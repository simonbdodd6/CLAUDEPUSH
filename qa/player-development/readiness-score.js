/**
 * Readiness Score
 * "Is this player ready for the next training challenge?"
 * Synthesises attendance, injury status, programme compliance, and age-group guidelines.
 */

import { gradeFromScore, confidenceFromDataPoints } from './attendance-analysis.js';

// ── Programme compliance ──────────────────────────────────────────────────────

export function analyseProgrammeCompliance(player, programmes = []) {
  const total     = programmes.length;
  const completed = programmes.filter(p => p.status === 'completed').length;
  const active    = programmes.filter(p => p.status === 'active').length;
  const abandoned = programmes.filter(p => p.status === 'archived').length;

  if (total === 0) {
    return {
      score:      null,
      grade:      null,
      trend:      'insufficient-data',
      confidence: 'none',
      reasons:    ['No programme history — compliance cannot be measured yet'],
      flags:      [],
      rawData:    { total: 0, completed: 0, active: 0, abandoned: 0 },
    };
  }

  const completionRate = total > 0 ? completed / total : 0;
  const score = Math.round(completionRate * 100);
  const reasons = [
    `${completed} of ${total} programmes completed (${score}% completion rate)`,
  ];

  if (active > 0)    reasons.push(`${active} programme(s) currently active`);
  if (abandoned > 0) reasons.push(`${abandoned} programme(s) did not reach completion — review what happened`);

  const flags = [];
  if (abandonmentRate(abandoned, total) > 0.33) {
    flags.push({ level: 'warning', message: `High abandonment rate (${Math.round(abandoned/total*100)}%) — investigate barriers to programme completion` });
  }

  return {
    score,
    grade:      gradeFromScore(score),
    trend:      total >= 2 && completed >= total - 1 ? 'stable' : 'insufficient-data',
    confidence: confidenceFromDataPoints(total),
    reasons,
    flags,
    rawData: { total, completed, active, abandoned, completionRate },
  };
}

function abandonmentRate(abandoned, total) {
  return total > 0 ? abandoned / total : 0;
}

// ── Coach feedback trend ──────────────────────────────────────────────────────

export function analyseCoachFeedback(player, programmes = []) {
  const feedbacks = programmes
    .map(p => p.coachFeedback)
    .filter(Boolean);

  if (feedbacks.length === 0) {
    return {
      score:      null,
      grade:      null,
      trend:      'insufficient-data',
      confidence: 'none',
      reasons:    ['No coach feedback recorded'],
      flags:      [{ level: 'info', message: 'Add coach feedback to programme records to track coach sentiment over time' }],
      rawData:    { feedbackCount: 0 },
    };
  }

  const positive = ['great', 'excellent', 'improved', 'strong', 'good progress', 'well done', 'ahead', 'positive', 'consistent'];
  const negative = ['missed', 'struggle', 'concern', 'worried', 'inconsistent', 'behind', 'not ready', 'poor'];
  const neutral  = ['completed', 'finished', 'done'];

  let posCount = 0, negCount = 0;
  for (const fb of feedbacks) {
    const lower = fb.toLowerCase();
    if (positive.some(t => lower.includes(t))) posCount++;
    else if (negative.some(t => lower.includes(t))) negCount++;
  }

  const netSentiment = posCount - negCount;
  const score = Math.min(100, Math.max(0, 60 + netSentiment * 12));
  const trend = posCount > negCount ? 'improving' : negCount > posCount ? 'declining' : 'stable';

  return {
    score: Math.round(score),
    grade: gradeFromScore(score),
    trend,
    confidence: confidenceFromDataPoints(feedbacks.length),
    reasons: [
      `${feedbacks.length} coach feedback record(s) analysed`,
      posCount > 0 ? `${posCount} positive signal(s) in feedback` : null,
      negCount > 0 ? `${negCount} concern(s) raised in feedback` : null,
      `Latest: "${feedbacks[feedbacks.length - 1].slice(0, 80)}${feedbacks[feedbacks.length - 1].length > 80 ? '...' : ''}"`,
    ].filter(Boolean),
    flags: [],
    rawData: { feedbackCount: feedbacks.length, positive: posCount, negative: negCount },
  };
}

// ── Readiness score ───────────────────────────────────────────────────────────

/**
 * Synthesises attendance, injury status, programme compliance, and age readiness
 * into a single readiness score (0-100).
 */
export function analyseReadiness(player, programmes = [], injuryRisk = null, attendanceAnalysis = null) {
  const core     = player.core ?? {};
  const injuries = player.injuries ?? [];

  const activeInjuries = injuries.filter(i => i.status === 'active');
  const attend   = player.attendance ?? {};
  const attRate  = attend.rate ?? null;
  const compliance = analyseProgrammeCompliance(player, programmes);

  const components = [];
  const reasons    = [];
  const flags      = [];

  // Component 1: Injury status (35% weight)
  let injuryComponent = 100;
  if (activeInjuries.length > 0) {
    injuryComponent = 10;
    reasons.push(`Active injury (${activeInjuries.map(i => i.type).join(', ')}) severely limits readiness`);
    flags.push({ level: 'critical', message: 'Player has active injury — not ready for full training load' });
  } else if (injuryRisk?.score >= 45) {
    injuryComponent = 60;
    reasons.push(`Elevated injury risk (${injuryRisk.score}/100) — moderate readiness`);
  } else {
    injuryComponent = 90;
    reasons.push('No active injuries — cleared for normal training load');
  }
  components.push({ name: 'injury-status', weight: 0.35, value: injuryComponent });

  // Component 2: Attendance (30% weight)
  let attComponent = 50;
  if (attRate != null) {
    attComponent = Math.round(attRate * 100);
    if (attRate >= 0.80) {
      reasons.push(`Strong attendance (${Math.round(attRate * 100)}%) demonstrates commitment and physical conditioning`);
    } else if (attRate >= 0.65) {
      reasons.push(`Adequate attendance (${Math.round(attRate * 100)}%) — room for improvement`);
    } else {
      reasons.push(`Low attendance (${Math.round(attRate * 100)}%) raises readiness concerns — fitness base may be compromised`);
    }
  } else {
    reasons.push('No attendance data — cannot assess physical conditioning readiness');
    flags.push({ level: 'info', message: 'Attendance tracking needed for accurate readiness assessment' });
  }
  components.push({ name: 'attendance', weight: 0.30, value: attComponent });

  // Component 3: Programme compliance (20% weight)
  let complComponent = 50;
  if (compliance.score != null) {
    complComponent = compliance.score;
    if (compliance.score >= 80) {
      reasons.push(`High programme compliance (${compliance.score}%) — player is doing the work`);
    } else if (compliance.score >= 50) {
      reasons.push(`Moderate programme compliance (${compliance.score}%)`);
    } else {
      reasons.push(`Low programme compliance (${compliance.score}%) — fitness base uncertain`);
    }
  }
  components.push({ name: 'programme-compliance', weight: 0.20, value: complComponent });

  // Component 4: Age-appropriate readiness (15% weight)
  let ageComponent = 75;
  const age = core.age ?? 0;
  const experience = (core.experience ?? '').toLowerCase();
  if (experience === 'elite' || experience === 'advanced') {
    ageComponent = 90;
    reasons.push(`${experience} experience level supports high readiness for challenging work`);
  } else if (experience === 'intermediate') {
    ageComponent = 75;
    reasons.push('Intermediate experience — ready for structured programme progression');
  } else if (experience === 'beginner' || experience === 'novice') {
    ageComponent = 55;
    reasons.push('Beginner/novice experience — focus on technique before intensity');
    flags.push({ level: 'info', message: 'Build technical foundation before introducing high training loads' });
  }
  components.push({ name: 'experience', weight: 0.15, value: ageComponent });

  // Weighted composite
  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const weightedScore = components.reduce((s, c) => s + c.weight * c.value, 0);
  const finalScore = Math.round(weightedScore / totalWeight);

  return {
    score: finalScore,
    grade: gradeFromScore(finalScore),
    trend: attRate != null && attRate > 0.75 && activeInjuries.length === 0 ? 'ready' : activeInjuries.length > 0 ? 'not-ready' : 'conditional',
    confidence: confidenceFromDataPoints((attRate != null ? 1 : 0) + programmes.length + (injuryRisk ? 1 : 0)),
    reasons,
    flags,
    rawData: {
      components,
      activeInjuries: activeInjuries.length,
      attendanceRate: attRate,
      complianceRate: compliance.score,
      experience:     core.experience,
    },
  };
}
