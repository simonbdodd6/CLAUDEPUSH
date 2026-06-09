/**
 * Attendance Analysis
 * Derives attendance patterns, trends, and compliance scores from player memory.
 * Works with aggregate data (totalSessions/attended/rate) and history snapshots.
 */

// ── Grade + trend helpers (shared across all modules) ────────────────────────

export function gradeFromScore(score) {
  if (score >= 90) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'C+';
  if (score >= 65) return 'C';
  if (score >= 55) return 'D';
  return 'F';
}

export function confidenceFromDataPoints(n, maxAgedays = Infinity) {
  if (n === 0) return 'none';
  if (n === 1 || maxAgedays > 90) return 'low';
  if (n <= 3 || maxAgedays > 30) return 'medium';
  return 'high';
}

export function trendDirection(values = []) {
  if (values.length < 2) return 'insufficient-data';
  const first = values[0];
  const last  = values[values.length - 1];
  const delta = last - first;
  if (Math.abs(delta) < 2) return 'stable';
  return delta > 0 ? 'improving' : 'declining';
}

// ── Attendance analysis ────────────────────────────────────────────────────────

/**
 * Extract attendance rate snapshots from player history.
 * Each history entry may have an `attendance.rate` value.
 */
function extractAttendanceHistory(player) {
  const points = [];
  const history = player.history ?? [];

  for (const snap of history) {
    if (snap.attendance?.rate != null && snap._snapshotAt) {
      points.push({ rate: snap.attendance.rate, date: snap._snapshotAt });
    }
  }

  // Add current state as the most recent point
  if (player.attendance?.rate != null) {
    points.push({ rate: player.attendance.rate, date: player.lastUpdated });
  }

  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Classify an attendance rate into a descriptive label.
 */
function classifyRate(rate) {
  if (rate == null) return 'unknown';
  if (rate >= 0.90) return 'excellent';
  if (rate >= 0.80) return 'good';
  if (rate >= 0.70) return 'fair';
  if (rate >= 0.60) return 'below-average';
  return 'poor';
}

/**
 * Assess consistency from history snapshots.
 * Low variance in rate = consistent; high variance = sporadic.
 */
function consistencyScore(rateHistory) {
  if (rateHistory.length < 2) return null;
  const rates = rateHistory.map(p => p.rate);
  const mean  = rates.reduce((a, b) => a + b, 0) / rates.length;
  const variance = rates.reduce((a, b) => a + (b - mean) ** 2, 0) / rates.length;
  const stdDev   = Math.sqrt(variance);
  // Low stdDev (< 0.05) → consistent; High (> 0.15) → sporadic
  if (stdDev < 0.05) return { score: 90, label: 'highly consistent' };
  if (stdDev < 0.10) return { score: 70, label: 'consistent' };
  if (stdDev < 0.15) return { score: 50, label: 'variable' };
  return { score: 30, label: 'sporadic' };
}

export function analyseAttendance(player) {
  const att  = player.attendance ?? {};
  const rate = att.rate;

  if (att.totalSessions === 0 || rate == null) {
    return {
      score:          null,
      grade:          null,
      trend:          'insufficient-data',
      confidence:     'none',
      reasons:        ['No attendance data recorded yet'],
      flags:          [{ level: 'info', message: 'Start tracking attendance to enable analysis' }],
      rawData:        { totalSessions: 0, attended: 0, rate: null },
    };
  }

  const rateHistory   = extractAttendanceHistory(player);
  const historyRates  = rateHistory.map(p => p.rate * 100);
  const trend         = trendDirection(historyRates);
  const consistency   = consistencyScore(rateHistory);
  const classification = classifyRate(rate);
  const score         = Math.round(rate * 100);
  const grade         = gradeFromScore(score);
  const confidence    = confidenceFromDataPoints(rateHistory.length);

  const reasons = [
    `${att.attended} of ${att.totalSessions} sessions attended (${score}% — ${classification})`,
  ];

  if (trend === 'improving') {
    reasons.push(`Attendance trend is improving over tracked history`);
  } else if (trend === 'declining') {
    reasons.push(`Attendance trend is declining — warrants a conversation`);
  } else if (trend === 'stable') {
    reasons.push(`Attendance is stable over tracked history`);
  }

  if (consistency) {
    reasons.push(`Consistency: ${consistency.label} (variance analysis across ${rateHistory.length} data points)`);
  }

  const flags = [];
  if (score < 60) {
    flags.push({ level: 'critical', message: `${score}% attendance is below minimum threshold — intervention needed` });
  } else if (score < 75) {
    flags.push({ level: 'warning', message: `${score}% attendance is below the 75% recommended minimum` });
  }
  if (trend === 'declining' && rateHistory.length >= 2) {
    flags.push({ level: 'warning', message: 'Attendance has declined since last recorded period' });
  }

  return {
    score,
    grade,
    trend,
    confidence,
    reasons,
    flags,
    rawData: {
      totalSessions: att.totalSessions,
      attended:      att.attended,
      rate:          rate,
      classification,
      rateHistory:   rateHistory.slice(-5),
      consistency:   consistency?.label ?? null,
    },
  };
}
