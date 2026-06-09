/**
 * Strength Progress Analysis
 * Derives strength development trend from programme history.
 * Looks at: completed strength programmes, phase progression, feedback mentions.
 */

import { gradeFromScore, trendDirection, confidenceFromDataPoints } from './attendance-analysis.js';

// ── Season phase progression ladder ──────────────────────────────────────────

const STRENGTH_PHASES = ['preseason', 'early-season', 'mid-season', 'late-season', 'off-season'];
const PHASE_RANK = Object.fromEntries(STRENGTH_PHASES.map((p, i) => [p, i]));

// Goals that signal strength work
const STRENGTH_GOALS = ['strength', 'mass', 'power', 'scrummaging power', 'scrummaging', 'hypertrophy', 'size'];
const SPEED_GOALS    = ['speed', 'agility', 'fitness', 'endurance', 'conditioning'];

function isStrengthGoal(goal = '') {
  const lower = goal.toLowerCase();
  return STRENGTH_GOALS.some(sg => lower.includes(sg));
}

function isSpeedGoal(goal = '') {
  const lower = goal.toLowerCase();
  return SPEED_GOALS.some(sg => lower.includes(sg));
}

// ── Programme phase ordering ──────────────────────────────────────────────────

function extractPhaseSequence(programmes = []) {
  return programmes
    .filter(p => {
      const goals = p.input?.goals ?? [];
      return goals.some(g => isStrengthGoal(g));
    })
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
    .map(p => ({
      id:          p.id,
      phase:       p.input?.seasonPhase ?? 'unknown',
      status:      p.status,
      startDate:   p.startDate,
      endDate:     p.endDate,
      goals:       p.input?.goals ?? [],
      feedback:    p.coachFeedback ?? null,
    }));
}

/**
 * Detect if phase sequence shows upward progression.
 * preseason → early-season → mid-season = strong trajectory.
 */
function assessPhaseProgression(phases = []) {
  if (phases.length < 2) return 'insufficient-data';
  const ranks = phases.map(p => PHASE_RANK[p.phase] ?? -1).filter(r => r >= 0);
  if (ranks.length < 2) return 'insufficient-data';
  return trendDirection(ranks);
}

/**
 * Scan coach feedback text for positive/negative strength signals.
 */
function scanFeedbackForStrength(feedbackItems = []) {
  const positiveTerms = ['stronger', 'strength improving', 'good progress', 'excellent', 'squat', 'deadlift', 'weight', 'heavier'];
  const negativeTerms = ['struggled', 'no progress', 'weak', 'missed sessions', 'not improving'];

  let positive = 0, negative = 0;
  for (const fb of feedbackItems) {
    if (!fb) continue;
    const lower = fb.toLowerCase();
    if (positiveTerms.some(t => lower.includes(t))) positive++;
    if (negativeTerms.some(t => lower.includes(t))) negative++;
  }
  return { positive, negative };
}

// ── Public analysis function ──────────────────────────────────────────────────

export function analyseStrengthProgress(player, programmes = []) {
  const playerGoals = (player.goals ?? []).map(g => g.goal ?? g);
  const hasStrengthGoal = playerGoals.some(g => isStrengthGoal(String(g)));
  const strengthProgs = extractPhaseSequence(programmes);

  if (strengthProgs.length === 0 && !hasStrengthGoal) {
    return {
      score:      null,
      grade:      null,
      trend:      'insufficient-data',
      confidence: 'none',
      reasons:    ['No strength-focused goals or programmes on record'],
      flags:      [],
      rawData:    { strengthProgrammes: 0, completedProgrammes: 0, phases: [] },
    };
  }

  const completed = strengthProgs.filter(p => p.status === 'completed');
  const active    = strengthProgs.filter(p => p.status === 'active');
  const feedbacks = strengthProgs.map(p => p.feedback).filter(Boolean);
  const fbSentiment = scanFeedbackForStrength(feedbacks);
  const phaseProgression = assessPhaseProgression(completed);

  // Score components
  let score = 50; // baseline for having data
  const reasons = [];

  // Completed programmes
  if (completed.length >= 3) {
    score += 25;
    reasons.push(`Completed ${completed.length} strength-focused programmes — strong training history`);
  } else if (completed.length === 2) {
    score += 18;
    reasons.push(`Completed ${completed.length} strength-focused programmes — solid foundation`);
  } else if (completed.length === 1) {
    score += 10;
    reasons.push(`1 strength programme completed — baseline established`);
  } else {
    score -= 10;
    reasons.push(`No completed strength programmes yet — active programme in progress`);
  }

  // Phase progression
  if (phaseProgression === 'improving') {
    score += 15;
    reasons.push(`Phase progression detected: ${completed.map(p => p.phase).join(' → ')} — systematic development`);
  } else if (phaseProgression === 'stable') {
    reasons.push(`Phase has been stable (${completed[0]?.phase ?? 'unknown'}) — may need progression`);
    score += 5;
  } else if (phaseProgression === 'declining') {
    score -= 10;
    reasons.push(`Phase regression detected — review programme periodisation`);
  }

  // Coach feedback
  if (fbSentiment.positive > fbSentiment.negative) {
    score += 10;
    reasons.push(`Coach feedback is positive: ${fbSentiment.positive} positive signal(s) in programme notes`);
  } else if (fbSentiment.negative > fbSentiment.positive) {
    score -= 8;
    reasons.push(`Coach feedback suggests challenges (${fbSentiment.negative} concern(s) noted)`);
  }

  // Active programme contributes positively
  if (active.length > 0) {
    score += 5;
    reasons.push(`Active strength programme in progress — development ongoing`);
  }

  // Player has explicit strength goals
  if (hasStrengthGoal) {
    reasons.push(`Strength is a stated goal: ${playerGoals.filter(g => isStrengthGoal(String(g))).join(', ')}`);
  }

  const finalScore = Math.max(0, Math.min(100, score));
  const confidence = confidenceFromDataPoints(strengthProgs.length);

  const flags = [];
  if (active.length > 1) {
    flags.push({ level: 'warning', message: `${active.length} active strength programmes — player may be on overlapping plans` });
  }
  if (completed.length >= 2 && phaseProgression !== 'improving') {
    flags.push({ level: 'info', message: 'Multiple programmes completed but no phase progression — consider advancing the programme design' });
  }

  return {
    score: finalScore,
    grade: gradeFromScore(finalScore),
    trend: phaseProgression === 'insufficient-data' && strengthProgs.length === 1 ? 'stable' : phaseProgression,
    confidence,
    reasons,
    flags,
    rawData: {
      strengthProgrammes:  strengthProgs.length,
      completedProgrammes: completed.length,
      activeProgrammes:    active.length,
      phases:              strengthProgs.map(p => ({ phase: p.phase, status: p.status })),
      phaseProgression,
      feedbackSentiment:   fbSentiment,
    },
  };
}

// Export helper so speed-progress.js can use it
export { isSpeedGoal, PHASE_RANK };
