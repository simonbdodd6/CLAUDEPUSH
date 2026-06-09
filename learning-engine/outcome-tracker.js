/**
 * Outcome Tracker
 *
 * Tracks the full lifecycle of every recommendation:
 *   PENDING → coach decision (ACCEPTED / REJECTED / SNOOZED / AUTO)
 *             → action taken
 *             → outcome observed
 *             → predictionCorrect / interventionSuccessful
 *
 * Outcome classification:
 *   PREDICTION_CORRECT       — predicted X, X happened
 *   PREDICTION_WRONG         — predicted X, X didn't happen (false positive)
 *   INTERVENTION_SUCCESSFUL  — recommended action was taken, predicted outcome prevented
 *   INTERVENTION_INEFFECTIVE — action taken, outcome happened anyway
 *   FALSE_NEGATIVE           — no recommendation, outcome happened (detected in retrospect)
 */

import { randomUUID } from 'crypto';
import { saveOutcome, loadOutcomes, loadOutcomesByType } from './learning-store.js';

export const COACH_DECISION = {
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  SNOOZED:  'SNOOZED',
  AUTO:     'AUTO',      // auto-executed by the platform
};

export const OUTCOME_TYPE = {
  PREDICTION_CORRECT:       'PREDICTION_CORRECT',
  PREDICTION_WRONG:         'PREDICTION_WRONG',
  INTERVENTION_SUCCESSFUL:  'INTERVENTION_SUCCESSFUL',
  INTERVENTION_INEFFECTIVE: 'INTERVENTION_INEFFECTIVE',
  FALSE_NEGATIVE:           'FALSE_NEGATIVE',
};

function learningEvent(outcome) {
  const { recommendationType, coachDecision, outcomeType, confidenceAtTime } = outcome;
  if (outcomeType === OUTCOME_TYPE.PREDICTION_CORRECT)
    return `${recommendationType}: prediction confirmed (conf was ${confidenceAtTime}%) — boost confidence`;
  if (outcomeType === OUTCOME_TYPE.PREDICTION_WRONG)
    return `${recommendationType}: false positive (conf was ${confidenceAtTime}%) — reduce confidence`;
  if (outcomeType === OUTCOME_TYPE.INTERVENTION_SUCCESSFUL)
    return `${recommendationType}: coach ${coachDecision === 'AUTO' ? 'platform' : 'manually'} intervened, outcome prevented — reinforce`;
  if (outcomeType === OUTCOME_TYPE.INTERVENTION_INEFFECTIVE)
    return `${recommendationType}: intervention taken but outcome happened anyway — investigate`;
  if (outcomeType === OUTCOME_TYPE.FALSE_NEGATIVE)
    return `${recommendationType}: outcome occurred without prediction — increase sensitivity`;
  return `${recommendationType}: outcome recorded`;
}

function classifyOutcome(coachDecision, predictionCorrect, interventionWorked) {
  if (coachDecision === COACH_DECISION.REJECTED || coachDecision === COACH_DECISION.SNOOZED) {
    return predictionCorrect ? OUTCOME_TYPE.PREDICTION_CORRECT : OUTCOME_TYPE.PREDICTION_WRONG;
  }
  if (coachDecision === COACH_DECISION.ACCEPTED || coachDecision === COACH_DECISION.AUTO) {
    if (interventionWorked === true)  return OUTCOME_TYPE.INTERVENTION_SUCCESSFUL;
    if (interventionWorked === false) return OUTCOME_TYPE.INTERVENTION_INEFFECTIVE;
    return predictionCorrect ? OUTCOME_TYPE.PREDICTION_CORRECT : OUTCOME_TYPE.PREDICTION_WRONG;
  }
  return predictionCorrect ? OUTCOME_TYPE.PREDICTION_CORRECT : OUTCOME_TYPE.PREDICTION_WRONG;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function recordOutcome({
  recommendationId,
  recommendationType,
  recommendation,
  coachDecision,
  actionTaken        = null,
  actionTs           = null,
  predictionCorrect,
  interventionWorked = null,
  outcomeNotes       = '',
  outcomeMetric      = null,  // e.g. { metric: 'attendance', before: 68, after: 62 }
  confidenceAtTime,
  daysToOutcome      = null,
}) {
  const outcomeType = classifyOutcome(coachDecision, predictionCorrect, interventionWorked);
  const outcome = {
    id:                    randomUUID(),
    recommendationId:      recommendationId ?? randomUUID(),
    recommendationType,
    recommendation,
    coachDecision,
    actionTaken,
    actionTs,
    outcomeType,
    predictionCorrect,
    interventionWorked,
    outcomeNotes,
    outcomeMetric,
    confidenceAtTime,
    daysToOutcome,
    outcomeTs:             new Date().toISOString(),
    learningEvent:         learningEvent({ recommendationType, coachDecision, outcomeType, confidenceAtTime }),
  };
  saveOutcome(outcome);
  return outcome;
}

export function getOutcomeSummary() {
  const outcomes = loadOutcomes();
  const total    = outcomes.length;
  if (total === 0) return { total: 0, message: 'No outcomes recorded yet.' };

  const byType   = {};
  let correct    = 0, wrong = 0, successful = 0, ineffective = 0, falseNeg = 0;

  for (const o of outcomes) {
    byType[o.recommendationType] = byType[o.recommendationType] ?? { total: 0, correct: 0, wrong: 0 };
    byType[o.recommendationType].total++;
    if (o.outcomeType === OUTCOME_TYPE.PREDICTION_CORRECT || o.outcomeType === OUTCOME_TYPE.INTERVENTION_SUCCESSFUL) {
      correct++;
      byType[o.recommendationType].correct++;
    } else if (o.outcomeType === OUTCOME_TYPE.PREDICTION_WRONG) {
      wrong++;
      byType[o.recommendationType].wrong++;
    } else if (o.outcomeType === OUTCOME_TYPE.INTERVENTION_INEFFECTIVE) {
      ineffective++;
    } else if (o.outcomeType === OUTCOME_TYPE.FALSE_NEGATIVE) {
      falseNeg++;
    }
  }

  return {
    total,
    correct,
    wrong,
    successful,
    ineffective,
    falseNegatives:  falseNeg,
    overallAccuracy: Math.round((correct / total) * 100),
    byType:          Object.entries(byType).map(([type, d]) => ({
      type,
      total: d.total,
      accuracy: Math.round((d.correct / d.total) * 100),
    })).sort((a, b) => b.accuracy - a.accuracy),
  };
}

export function getRecentOutcomes(limit = 20) {
  return loadOutcomes(limit).slice(-limit).reverse();
}

// ── Seed realistic mock outcomes ──────────────────────────────────────────────

export function seedMockOutcomes() {
  const existing = loadOutcomes(1);
  if (existing.length > 0) return; // already seeded

  const mockOutcomes = [
    // Month 1 — cold start, mixed results
    { type: 'ATTENDANCE_DECLINE',     decision: 'REJECTED',  correct: true,  conf: 55, days: 14, notes: 'Coach dismissed. Attendance fell to 60% as predicted.' },
    { type: 'VOLUNTEER_GAP',          decision: 'ACCEPTED',  worked: true,   conf: 60, days: 2,  notes: 'Volunteers confirmed after alert. Match went ahead.' },
    { type: 'WEATHER_RISK',           decision: 'ACCEPTED',  worked: false,  conf: 50, days: 1,  notes: 'Rain never materialised. Session ran normally.' },
    { type: 'APPROVAL_BACKLOG',       decision: 'AUTO',      worked: true,   conf: 70, days: 1,  notes: 'Auto-reminders sent. 3/4 approvals resolved same day.' },
    { type: 'MEMBERSHIP_EXPIRY',      decision: 'AUTO',      worked: true,   conf: 65, days: 5,  notes: '4/5 expiring members renewed within 3 days of reminder.' },
    { type: 'INJURY_POSITION_CRISIS', decision: 'ACCEPTED',  worked: false,  conf: 45, days: 3,  notes: 'Squad reshuffled but injury still occurred in warmup.' },
    { type: 'COMMUNICATION_GAP',      decision: 'AUTO',      worked: true,   conf: 60, days: 0,  notes: 'Newsletter auto-sent. Open rate 38%, highest in 6 weeks.' },

    // Month 2 — engine beginning to calibrate
    { type: 'ATTENDANCE_DECLINE',     decision: 'ACCEPTED',  worked: true,   conf: 58, days: 7,  notes: 'Parent message sent. Attendance recovered from 65% to 74%.' },
    { type: 'VOLUNTEER_GAP',          decision: 'REJECTED',  correct: true,  conf: 65, days: 3,  notes: 'Coach ignored. First Aider didn\'t show. Match delayed 15min.' },
    { type: 'PLAYER_OVERLOAD',        decision: 'ACCEPTED',  worked: true,   conf: 40, days: 5,  notes: 'Rest day given. Player completed all playoff sessions injury-free.' },
    { type: 'MEMBERSHIP_EXPIRY',      decision: 'AUTO',      worked: true,   conf: 65, days: 4,  notes: '5/6 members renewed. 1 lapsed as predicted.' },
    { type: 'WEATHER_RISK',           decision: 'SNOOZED',   correct: false, conf: 50, days: 1,  notes: 'Snoozed. Weather was fine.' },
    { type: 'APPROVAL_BACKLOG',       decision: 'ACCEPTED',  worked: true,   conf: 70, days: 2,  notes: 'Committee convened. All backlog cleared.' },

    // Month 3 — patterns emerging
    { type: 'ATTENDANCE_DECLINE',     decision: 'ACCEPTED',  worked: true,   conf: 62, days: 10, notes: 'Trend reversed after parent outreach programme.' },
    { type: 'INJURY_POSITION_CRISIS', decision: 'ACCEPTED',  worked: true,   conf: 52, days: 5,  notes: 'Drill modified. No further front row injuries in 3 weeks.' },
    { type: 'VOLUNTEER_GAP',          decision: 'ACCEPTED',  worked: true,   conf: 68, days: 2,  notes: 'Broadcast appeal filled 2/3 gaps within 48 hours.' },
    { type: 'COMMUNICATION_GAP',      decision: 'AUTO',      worked: true,   conf: 65, days: 0,  notes: 'Auto-newsletter. Membership renewal rate upticked 4%.' },
    { type: 'PLAYER_OVERLOAD',        decision: 'REJECTED',  correct: true,  conf: 45, days: 8,  notes: 'Coach overrode. Player pulled quad 8 days later.' },

    // Month 4 — club-specific calibration kicking in
    { type: 'ATTENDANCE_DECLINE',     decision: 'ACCEPTED',  worked: true,   conf: 68, days: 7,  notes: 'Holiday pre-warning sent. Attendance stayed above 70% through half-term.' },
    { type: 'VOLUNTEER_GAP',          decision: 'AUTO',      worked: true,   conf: 72, days: 3,  notes: 'Auto-appeal posted. Confirmed within 36 hours.' },
    { type: 'WEATHER_RISK',           decision: 'SNOOZED',   correct: true,  conf: 55, days: 1,  notes: 'Snoozed but heavy rain did materialise. Pitch unplayable.' },
    { type: 'MEMBERSHIP_EXPIRY',      decision: 'AUTO',      worked: true,   conf: 68, days: 3,  notes: 'Renewal campaign. 8/9 renewed. Best rate yet.' },
    { type: 'APPROVAL_BACKLOG',       decision: 'AUTO',      worked: true,   conf: 73, days: 1,  notes: 'Auto-reminders. 100% clearance within 24 hours.' },
    { type: 'INJURY_POSITION_CRISIS', decision: 'ACCEPTED',  worked: true,   conf: 60, days: 4,  notes: 'Position group given extra rest. Maintained full availability for playoffs.' },

    // Month 5 — strong signal accumulation
    { type: 'ATTENDANCE_DECLINE',     decision: 'ACCEPTED',  worked: true,   conf: 72, days: 7,  notes: 'Consistent improvement. Platform is well-calibrated for this team.' },
    { type: 'VOLUNTEER_GAP',          decision: 'ACCEPTED',  worked: true,   conf: 75, days: 2,  notes: 'Confirmed 48h before. First Aider present for final.' },
    { type: 'PLAYER_OVERLOAD',        decision: 'ACCEPTED',  worked: true,   conf: 55, days: 4,  notes: 'Load reduced. Player finished season injury-free.' },
    { type: 'COMMUNICATION_GAP',      decision: 'AUTO',      worked: true,   conf: 70, days: 0,  notes: 'Newsletter sent. Open rate 44%. Sponsor mentioned positively.' },
    { type: 'WEATHER_RISK',           decision: 'ACCEPTED',  worked: true,   conf: 58, days: 1,  notes: 'Venue swapped to indoor. Session quality high.' },

    // Month 6 — final season
    { type: 'ATTENDANCE_DECLINE',     decision: 'ACCEPTED',  worked: true,   conf: 74, days: 5,  notes: 'Club finished season at 81% attendance. +13% from start.' },
    { type: 'INJURY_POSITION_CRISIS', decision: 'ACCEPTED',  worked: true,   conf: 68, days: 3,  notes: 'Zero position-cluster injuries in final 6 weeks.' },
    { type: 'VOLUNTEER_GAP',          decision: 'ACCEPTED',  worked: true,   conf: 78, days: 1,  notes: 'All finals fixtures fully staffed.' },
    { type: 'APPROVAL_BACKLOG',       decision: 'AUTO',      worked: true,   conf: 75, days: 1,  notes: 'Season-end governance review: no overdue items.' },
    { type: 'MEMBERSHIP_EXPIRY',      decision: 'AUTO',      worked: true,   conf: 72, days: 3,  notes: 'End-of-season retention: 89% renewal rate vs 82% baseline.' },
  ];

  for (const m of mockOutcomes) {
    recordOutcome({
      recommendationId:  randomUUID(),
      recommendationType: m.type,
      coachDecision:      m.decision,
      actionTaken:        m.decision === 'AUTO' ? `AUTO_${m.type}` : m.decision === 'ACCEPTED' ? 'COACH_ACTION' : null,
      predictionCorrect:  m.correct ?? (m.worked === true || m.worked === false ? !m.worked === false : true),
      interventionWorked: m.worked ?? null,
      outcomeNotes:       m.notes,
      confidenceAtTime:   m.conf,
      daysToOutcome:      m.days,
    });
  }
}
