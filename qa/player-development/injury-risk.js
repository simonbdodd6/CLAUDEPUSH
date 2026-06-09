/**
 * Injury Risk Analysis
 * Calculates a risk score (0-100, higher = more risk) from player memory.
 * Considers current injuries, history, position, training load, and attendance patterns.
 */

import { gradeFromScore, confidenceFromDataPoints } from './attendance-analysis.js';

// ── Position risk profiles ────────────────────────────────────────────────────

const POSITION_RISK = {
  'loosehead-prop':   { baseRisk: 18, primaryRisks: ['shoulder', 'neck', 'lower back'] },
  'tighthead-prop':   { baseRisk: 20, primaryRisks: ['shoulder', 'neck', 'lower back', 'knee'] },
  'prop':             { baseRisk: 18, primaryRisks: ['shoulder', 'neck', 'lower back'] },
  'hooker':           { baseRisk: 16, primaryRisks: ['shoulder', 'neck', 'knee'] },
  'lock':             { baseRisk: 14, primaryRisks: ['shoulder', 'knee', 'lower back'] },
  'flanker':          { baseRisk: 15, primaryRisks: ['shoulder', 'knee', 'lower back'] },
  'blindside-flanker':{ baseRisk: 16, primaryRisks: ['shoulder', 'knee'] },
  'openside-flanker': { baseRisk: 14, primaryRisks: ['shoulder', 'knee', 'ankle'] },
  'number-eight':     { baseRisk: 14, primaryRisks: ['shoulder', 'hamstring', 'knee'] },
  'scrum-half':       { baseRisk: 13, primaryRisks: ['shoulder', 'knee', 'hamstring'] },
  'fly-half':         { baseRisk: 12, primaryRisks: ['hamstring', 'shoulder', 'knee'] },
  'inside-centre':    { baseRisk: 15, primaryRisks: ['shoulder', 'knee', 'lower back'] },
  'outside-centre':   { baseRisk: 12, primaryRisks: ['hamstring', 'ankle', 'shoulder'] },
  'wing':             { baseRisk: 10, primaryRisks: ['hamstring', 'ankle', 'groin'] },
  'fullback':         { baseRisk: 11, primaryRisks: ['hamstring', 'shoulder', 'concussion'] },
};

const DEFAULT_POSITION_RISK = { baseRisk: 12, primaryRisks: [] };

// ── Days since a date ─────────────────────────────────────────────────────────

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// ── Injury risk calculation ────────────────────────────────────────────────────

export function analyseInjuryRisk(player) {
  const core     = player.core ?? {};
  const injuries = player.injuries ?? [];
  const attend   = player.attendance ?? {};

  const position    = (core.position ?? 'unknown').toLowerCase().replace(/\s+/g, '-');
  const positionRisk = POSITION_RISK[position] ?? DEFAULT_POSITION_RISK;

  let riskScore = positionRisk.baseRisk;
  const riskFactors = [];
  const flags       = [];

  // Active injuries → significant risk
  const activeInjuries = injuries.filter(i => i.status === 'active');
  if (activeInjuries.length > 0) {
    riskScore += 40;
    for (const inj of activeInjuries) {
      riskFactors.push(`Active injury: ${inj.type} — full activity not recommended until cleared`);
      flags.push({ level: 'critical', message: `Active injury (${inj.type}) — requires medical clearance before contact training` });
    }
  }

  // Recently cleared injuries → elevated risk
  const recentlyCleared = injuries.filter(i => {
    if (i.status !== 'cleared') return false;
    const cleared = daysSince(i.clearanceDate);
    return cleared < 90;
  });
  for (const inj of recentlyCleared) {
    const days = daysSince(inj.clearanceDate);
    if (days < 30) {
      riskScore += 20;
      riskFactors.push(`Recently cleared: ${inj.type} cleared ${days} days ago — recurrence window still open`);
      flags.push({ level: 'warning', message: `${inj.type} cleared only ${days} days ago — monitor carefully` });
    } else {
      riskScore += 10;
      riskFactors.push(`Cleared ${inj.type} within 90 days — residual risk remains`);
    }
  }

  // History of multiple injuries → cumulative risk
  const clearedInjuries = injuries.filter(i => i.status === 'cleared' && daysSince(i.clearanceDate) >= 90);
  if (injuries.length >= 3) {
    riskScore += 15;
    riskFactors.push(`${injuries.length} injuries on record — cumulative injury history elevates future risk`);
  } else if (injuries.length === 2) {
    riskScore += 8;
    riskFactors.push(`2 injuries on record — monitor for patterns`);
  }

  // Recurrence of same injury type
  const injuryTypes = injuries.map(i => i.type?.toLowerCase());
  const typeFreq = {};
  for (const t of injuryTypes) {
    if (t) typeFreq[t] = (typeFreq[t] ?? 0) + 1;
  }
  for (const [type, freq] of Object.entries(typeFreq)) {
    if (freq >= 2) {
      riskScore += 12;
      riskFactors.push(`Recurring ${type} injury (${freq}× on record) — structural vulnerability likely`);
      flags.push({ level: 'warning', message: `Recurring ${type} injury — consider preventative prehab programme` });
    }
  }

  // Position-specific risks
  if (positionRisk.primaryRisks.length) {
    riskFactors.push(`${core.position ?? 'Position'}-specific risk areas: ${positionRisk.primaryRisks.join(', ')}`);
  }

  // Low attendance may mask niggles (players who attend less often may be self-managing)
  if (attend.rate != null && attend.rate < 0.65 && attend.totalSessions > 5) {
    riskScore += 8;
    riskFactors.push(`Low attendance (${Math.round(attend.rate * 100)}%) may indicate unreported niggles or accumulated fatigue`);
    flags.push({ level: 'info', message: 'Low attendance can mask minor injuries that should be disclosed' });
  }

  // Young players — growth plate considerations
  const age = core.age ?? 0;
  if (age <= 14) {
    riskScore += 10;
    riskFactors.push(`Age ${age} — growth plate consideration: avoid maximal loading; monitor closely`);
    flags.push({ level: 'warning', message: `U${age} player — follow World Rugby youth contact guidelines strictly` });
  } else if (age <= 17) {
    riskScore += 5;
    riskFactors.push(`Age ${age} — near-adult physiology with residual growth plate considerations`);
  }

  const finalScore = Math.min(riskScore, 100);

  // Risk grade (inverted — high score = high risk)
  const riskGrade = finalScore >= 70 ? 'High'
    : finalScore >= 45 ? 'Moderate'
    : finalScore >= 25 ? 'Low-Moderate'
    : 'Low';

  // No reasons = add the baseline reason
  if (riskFactors.length === 0) {
    riskFactors.push(`No active injuries or significant risk flags — baseline ${riskGrade} risk for ${core.position ?? 'player'} position`);
  }

  const dataPoints = injuries.length + (attend.totalSessions > 0 ? 1 : 0);
  const confidence = confidenceFromDataPoints(dataPoints);

  return {
    score:      finalScore,
    grade:      riskGrade,
    trend:      activeInjuries.length > 0 ? 'elevated' : 'stable',
    confidence,
    reasons:    riskFactors,
    flags,
    rawData: {
      activeInjuries:    activeInjuries.length,
      recentlyCleared:   recentlyCleared.length,
      totalInjuries:     injuries.length,
      positionBaseRisk:  positionRisk.baseRisk,
      positionRisks:     positionRisk.primaryRisks,
      recurringTypes:    Object.entries(typeFreq).filter(([, v]) => v > 1).map(([k]) => k),
    },
  };
}
