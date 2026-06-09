/**
 * Club Health Scorer
 * Produces a 0-100 health score for the club across all tracked dimensions.
 * Each dimension explains WHY it scored that way.
 */

// ── Grade + label ─────────────────────────────────────────────────────────────

export function gradeFromScore(score) {
  if (score == null) return null;
  if (score >= 90) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'C+';
  if (score >= 65) return 'C';
  if (score >= 55) return 'D';
  return 'F';
}

function rag(score) {
  if (score == null) return 'grey';
  if (score >= 70) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}

// ── Dimension scorers ─────────────────────────────────────────────────────────

function scoreDevelopment(profile) {
  const avg = profile.development?.avgScore;
  const improving = profile.development?.improving ?? 0;
  const declining  = profile.development?.declining ?? 0;
  const total      = profile.summary?.totalPlayers ?? 0;

  if (avg == null) {
    return {
      dimension: 'Player Development',
      score:     null,
      grade:     null,
      rag:       'grey',
      weight:    0.20,
      reasons:   ['No player development data — run Player Development Engine'],
      flags:     [],
    };
  }

  let score = avg;
  const reasons = [`Club average development score: ${avg}/100`];
  const flags   = [];

  if (improving > 0) { score += 3; reasons.push(`${improving} player(s) on improving trajectory`); }
  if (declining > 0) {
    score -= declining * 3;
    reasons.push(`${declining} player(s) on declining trajectory — intervention needed`);
    if (declining > total * 0.3) flags.push({ level: 'warning', message: `${Math.round(declining/total*100)}% of players declining — systemic issue` });
  }

  return {
    dimension: 'Player Development',
    score:     Math.max(0, Math.min(100, Math.round(score))),
    grade:     gradeFromScore(score),
    rag:       rag(score),
    weight:    0.20,
    reasons,
    flags,
  };
}

function scoreAttendance(profile) {
  const avg = profile.attendance?.clubAverage;

  if (avg == null) {
    return { dimension: 'Attendance', score: null, grade: null, rag: 'grey', weight: 0.18, reasons: ['No attendance data'], flags: [] };
  }

  const reasons = [`Club average attendance: ${avg}%`];
  const flags   = [];
  let score = avg;  // attendance % maps directly to score

  if (avg >= 85) reasons.push('Excellent attendance — strong player commitment');
  else if (avg >= 75) reasons.push('Good attendance — above minimum threshold');
  else if (avg >= 65) {
    reasons.push('Attendance below 75% target — review barriers');
    flags.push({ level: 'warning', message: `Club attendance ${avg}% — below 75% target` });
  } else {
    reasons.push('Low attendance is compromising physical development across the club');
    flags.push({ level: 'critical', message: `Club attendance ${avg}% — critical — immediate intervention` });
  }

  const byAgeGroup = profile.attendance?.byAgeGroup ?? {};
  for (const [ag, rate] of Object.entries(byAgeGroup)) {
    if (rate != null && rate < 60) {
      flags.push({ level: 'warning', message: `${ag}: low attendance (${rate}%)` });
    }
  }

  return { dimension: 'Attendance', score: Math.round(score), grade: gradeFromScore(score), rag: rag(score), weight: 0.18, reasons, flags };
}

function scoreInjuryManagement(profile) {
  const active    = profile.injuries?.active ?? 0;
  const highRisk  = profile.injuries?.highRiskCount ?? 0;
  const total     = profile.summary?.totalPlayers ?? 1;

  const injuryRate = total > 0 ? active / total : 0;
  const riskRate   = total > 0 ? highRisk / total : 0;

  let score = 90;
  const reasons = [];
  const flags   = [];

  if (active === 0 && highRisk === 0) {
    reasons.push('No active injuries — excellent injury management');
  } else {
    score -= active * 8;
    score -= highRisk * 5;

    if (active > 0) {
      reasons.push(`${active} active injury/injuries (${Math.round(injuryRate * 100)}% of squad)`);
      if (injuryRate > 0.15) flags.push({ level: 'critical', message: `${Math.round(injuryRate*100)}% of squad injured — review training load` });
    }
    if (highRisk > 0) {
      reasons.push(`${highRisk} player(s) at elevated injury risk — prehab recommended`);
    }
  }

  return {
    dimension: 'Injury Management',
    score:     Math.max(0, Math.min(100, Math.round(score))),
    grade:     gradeFromScore(score),
    rag:       rag(score),
    weight:    0.18,
    reasons,
    flags,
  };
}

function scoreProgrammeActivity(profile) {
  const active = profile.training?.activeProgrammes ?? 0;
  const total  = profile.summary?.totalPlayers ?? 0;

  if (total === 0) {
    return { dimension: 'Programme Activity', score: null, grade: null, rag: 'grey', weight: 0.15, reasons: ['No players in system'], flags: [] };
  }

  const coverage = total > 0 ? active / total : 0;
  const score    = Math.round(coverage * 100);
  const reasons  = [
    `${active} of ${total} players have active programmes (${Math.round(coverage * 100)}% coverage)`,
  ];
  const flags = [];

  if (coverage < 0.5 && total > 1) {
    flags.push({ level: 'warning', message: `Only ${Math.round(coverage*100)}% of players have active programmes — coaching engine underutilised` });
  }

  return { dimension: 'Programme Activity', score, grade: gradeFromScore(score), rag: rag(score), weight: 0.15, reasons, flags };
}

function scoreCoachActivity(profile) {
  const coaches  = profile.coaches ?? [];
  const total    = coaches.length;

  if (total === 0) {
    return { dimension: 'Coach Activity', score: null, grade: null, rag: 'grey', weight: 0.12, reasons: ['No coaches in system'], flags: [] };
  }

  const aiActive      = coaches.filter(c => c.aiGenerations > 0).length;
  const needSupport   = coaches.filter(c => c.supportNeeded).length;
  const coverageRate  = aiActive / total;
  let score = Math.round(coverageRate * 100);

  const reasons = [
    `${aiActive} of ${total} coach(es) actively using AI tools (${Math.round(coverageRate*100)}%)`,
  ];
  const flags   = [];

  if (needSupport > 0) {
    score -= needSupport * 10;
    reasons.push(`${needSupport} coach(es) flagged as needing support`);
    if (needSupport >= total) flags.push({ level: 'warning', message: 'All coaches flagged — consider coaching development programme' });
  }

  return { dimension: 'Coach Activity', score: Math.max(0, Math.min(100, score)), grade: gradeFromScore(score), rag: rag(score), weight: 0.12, reasons, flags };
}

function scoreMembership(profile) {
  const total = profile.summary?.totalPlayers ?? 0;
  const retHigh = profile.retention?.highRisk ?? 0;

  // Without historical data, we score based on retention risk distribution
  let score = 70;  // baseline when no membership history
  const reasons = [`${total} player(s) in system`];
  const flags   = [];

  if (retHigh > 0) {
    score -= retHigh * 8;
    reasons.push(`${retHigh} player(s) at high retention risk`);
    if (retHigh > total * 0.2 && total > 1) {
      flags.push({ level: 'warning', message: `${Math.round(retHigh/total*100)}% of players at high retention risk` });
    }
  }

  return { dimension: 'Membership & Retention', score: Math.max(0, Math.min(100, Math.round(score))), grade: gradeFromScore(score), rag: rag(score), weight: 0.10, reasons, flags };
}

function scoreDataCompleteness(profile) {
  const dc    = profile.dataCompleteness ?? {};
  const keys  = Object.keys(dc);
  const ready = keys.filter(k => dc[k]).length;
  const score = Math.round((ready / Math.max(keys.length, 1)) * 100);
  const missing = keys.filter(k => !dc[k]);

  return {
    dimension: 'Data Completeness',
    score,
    grade:     gradeFromScore(score),
    rag:       rag(score),
    weight:    0.07,
    reasons: [
      `${ready} of ${keys.length} data domains populated`,
      missing.length ? `Missing: ${missing.join(', ')}` : 'All domains populated',
    ],
    flags: missing.length > 3 ? [{ level: 'info', message: `${missing.length} data domains not yet connected` }] : [],
  };
}

// ── Main health calculator ────────────────────────────────────────────────────

export function calculateClubHealth(profile) {
  const dimensions = [
    scoreDevelopment(profile),
    scoreAttendance(profile),
    scoreInjuryManagement(profile),
    scoreProgrammeActivity(profile),
    scoreCoachActivity(profile),
    scoreMembership(profile),
    scoreDataCompleteness(profile),
  ];

  // Weighted composite
  const scoreable = dimensions.filter(d => d.score != null);
  let composite = null;
  if (scoreable.length > 0) {
    const totalWeight = scoreable.reduce((s, d) => s + d.weight, 0);
    composite = Math.round(
      scoreable.reduce((s, d) => s + d.weight * d.score, 0) / Math.max(totalWeight, 1)
    );
  }

  // Collect all flags
  const allFlags = dimensions.flatMap(d => d.flags ?? []);
  const criticals = allFlags.filter(f => f.level === 'critical');
  const warnings  = allFlags.filter(f => f.level === 'warning');

  // Downgrade if critical flags
  if (criticals.length > 0 && composite != null) {
    composite = Math.min(composite, 65);
  }

  // Trend: rough heuristic — compare improving vs declining dimensions
  const greenCount = dimensions.filter(d => d.rag === 'green').length;
  const redCount   = dimensions.filter(d => d.rag === 'red').length;
  const trend = greenCount > redCount ? 'improving' : redCount > greenCount ? 'declining' : 'stable';

  return {
    overallScore:  composite,
    overallGrade:  gradeFromScore(composite),
    rag:           rag(composite),
    trend,
    dimensions,
    criticalFlags: criticals,
    warnings,
    alertCount:    criticals.length + warnings.length,
    summary: composite != null
      ? `Club health: ${composite}/100 (${gradeFromScore(composite)}) — ${trend}`
      : 'Insufficient data for health score',
    generatedAt: new Date().toISOString(),
  };
}
