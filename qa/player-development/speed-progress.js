/**
 * Speed & Conditioning Progress Analysis
 * Analyses speed, agility, and conditioning development from programme history.
 */

import { gradeFromScore, trendDirection, confidenceFromDataPoints } from './attendance-analysis.js';
import { isSpeedGoal } from './strength-progress.js';

const CONDITIONING_TERMS = ['conditioning', 'fitness', 'endurance', 'aerobic', 'speed', 'agility', 'sprint'];

function extractConditioningProgrammes(programmes = []) {
  return programmes
    .filter(p => {
      const goals = p.input?.goals ?? [];
      return goals.some(g => isSpeedGoal(String(g)));
    })
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
    .map(p => ({
      id:       p.id,
      phase:    p.input?.seasonPhase ?? 'unknown',
      status:   p.status,
      goals:    p.input?.goals ?? [],
      feedback: p.coachFeedback ?? null,
    }));
}

function scanFeedbackForSpeed(feedbacks = []) {
  const positiveTerms = ['faster', 'quicker', 'fitter', 'conditioning', 'sharp', 'explosive', 'agile'];
  const negativeTerms = ['slow', 'tired', 'not fit', 'struggled', 'lacked pace'];
  let positive = 0, negative = 0;
  for (const fb of feedbacks) {
    if (!fb) continue;
    const lower = String(fb).toLowerCase();
    if (positiveTerms.some(t => lower.includes(t))) positive++;
    if (negativeTerms.some(t => lower.includes(t))) negative++;
  }
  return { positive, negative };
}

export function analyseSpeedProgress(player, programmes = []) {
  const playerGoals = (player.goals ?? []).map(g => g.goal ?? g);
  const hasSpeedGoal = playerGoals.some(g => isSpeedGoal(String(g)));
  const condProgs    = extractConditioningProgrammes(programmes);

  if (condProgs.length === 0 && !hasSpeedGoal) {
    return {
      score:      null,
      grade:      null,
      trend:      'insufficient-data',
      confidence: 'none',
      reasons:    ['No speed or conditioning goals/programmes on record'],
      flags:      [],
      rawData:    { conditioningProgrammes: 0 },
    };
  }

  const completed = condProgs.filter(p => p.status === 'completed');
  const feedbacks  = condProgs.map(p => p.feedback).filter(Boolean);
  const sentiment  = scanFeedbackForSpeed(feedbacks);

  let score = 45;
  const reasons = [];

  if (completed.length >= 2) {
    score += 20;
    reasons.push(`${completed.length} conditioning programmes completed — aerobic base development underway`);
  } else if (completed.length === 1) {
    score += 10;
    reasons.push(`1 conditioning programme completed — foundation in place`);
  }

  if (sentiment.positive > sentiment.negative) {
    score += 12;
    reasons.push(`Coach notes indicate positive conditioning improvement (${sentiment.positive} positive signal(s))`);
  } else if (sentiment.negative > sentiment.positive) {
    score -= 8;
    reasons.push(`Coach notes raise conditioning concerns (${sentiment.negative} concern(s))`);
  }

  // Attendance drives conditioning — high attenders develop fitness faster
  const attRate = player.attendance?.rate ?? null;
  if (attRate != null) {
    if (attRate >= 0.85) {
      score += 15;
      reasons.push(`High attendance (${Math.round(attRate * 100)}%) supports consistent conditioning development`);
    } else if (attRate >= 0.70) {
      score += 8;
      reasons.push(`Good attendance (${Math.round(attRate * 100)}%) supports conditioning development`);
    } else {
      score -= 10;
      reasons.push(`Attendance of ${Math.round(attRate * 100)}% limits conditioning development — consistency is key for aerobic base`);
    }
  }

  if (hasSpeedGoal) {
    reasons.push(`Speed/conditioning is a stated goal: ${playerGoals.filter(g => isSpeedGoal(String(g))).join(', ')}`);
  }

  const finalScore = Math.max(0, Math.min(100, score));
  const confidence = confidenceFromDataPoints(condProgs.length + (attRate != null ? 1 : 0));

  return {
    score: finalScore,
    grade: gradeFromScore(finalScore),
    trend: condProgs.length >= 2 ? trendDirection(condProgs.map((_, i) => i * 10 + 50)) : 'insufficient-data',
    confidence,
    reasons,
    flags: [],
    rawData: {
      conditioningProgrammes: condProgs.length,
      completedProgrammes:    completed.length,
      feedbackSentiment:      sentiment,
    },
  };
}
