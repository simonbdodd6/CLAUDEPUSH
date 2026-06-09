/**
 * Club Risk Engine
 *
 * Scans the Club Digital Twin model and produces a prioritised risk register.
 * Every risk has a severity, recommended action, and the affected entities.
 *
 * Risk types:
 *   INJURY_CLUSTER         — multiple injuries in same team/period
 *   ATTENDANCE_DECLINE     — team attendance falling
 *   PLAYER_RETENTION       — high-retention-risk players
 *   VOLUNTEER_GAP          — critical role unfilled
 *   SPONSOR_EXPIRY         — sponsor renewal due <30 days
 *   COACH_OVERLOAD         — too many players per coach
 *   MEMBERSHIP_CHURN       — low retention rate
 *   COMMITTEE_BACKLOG      — high approval queue
 *   DATA_STALENESS         — club model data is incomplete
 *   SQUAD_DEPTH            — not enough available players
 *   COMMS_BACKLOG          — too many pending drafts
 */

export const RISK_TYPES = {
  INJURY_CLUSTER:     'INJURY_CLUSTER',
  ATTENDANCE_DECLINE: 'ATTENDANCE_DECLINE',
  PLAYER_RETENTION:   'PLAYER_RETENTION',
  VOLUNTEER_GAP:      'VOLUNTEER_GAP',
  SPONSOR_EXPIRY:     'SPONSOR_EXPIRY',
  COACH_OVERLOAD:     'COACH_OVERLOAD',
  MEMBERSHIP_CHURN:   'MEMBERSHIP_CHURN',
  COMMITTEE_BACKLOG:  'COMMITTEE_BACKLOG',
  DATA_STALENESS:     'DATA_STALENESS',
  SQUAD_DEPTH:        'SQUAD_DEPTH',
  COMMS_BACKLOG:      'COMMS_BACKLOG',
};

export const SEVERITY = {
  LOW:      'LOW',
  MEDIUM:   'MEDIUM',
  HIGH:     'HIGH',
  CRITICAL: 'CRITICAL',
};

// ── Risk detectors ────────────────────────────────────────────────────────────

function detectInjuryCluster(model) {
  const risks = [];
  const players = model.players ?? {};
  const teams   = model.teams   ?? [];

  // Club-level: injury rate > 15%
  const injuryRate = players.activeCount > 0
    ? players.injuredCount / players.activeCount
    : 0;

  if (injuryRate >= 0.20) {
    risks.push(risk(RISK_TYPES.INJURY_CLUSTER, SEVERITY.CRITICAL,
      'High injury rate across squad',
      `${players.injuredCount} of ${players.activeCount} players are injured (${Math.round(injuryRate*100)}%).`,
      `Review training load and contact physio for all active injuries.`,
      ['squad'],
    ));
  } else if (injuryRate >= 0.10) {
    risks.push(risk(RISK_TYPES.INJURY_CLUSTER, SEVERITY.HIGH,
      'Elevated injury rate',
      `${players.injuredCount} active injuries (${Math.round(injuryRate*100)}% of squad).`,
      `Monitor training intensity and schedule physio assessments.`,
      ['squad'],
    ));
  }

  // Team-level: any team with >3 injuries
  for (const team of teams) {
    if ((team.activeInjuries ?? 0) >= 3) {
      risks.push(risk(RISK_TYPES.INJURY_CLUSTER, SEVERITY.HIGH,
        `${team.name} injury cluster`,
        `${team.activeInjuries} active injuries in ${team.name}.`,
        `Review session plans for ${team.name}. Consider physio review day.`,
        [team.name],
      ));
    }
  }

  return risks;
}

function detectAttendanceDecline(model) {
  const risks = [];
  const teams  = model.teams ?? [];
  for (const team of teams) {
    const rate = parseFloat(team.avgAttendance) || null;
    if (rate !== null && rate < 60) {
      risks.push(risk(RISK_TYPES.ATTENDANCE_DECLINE, SEVERITY.HIGH,
        `${team.name} low attendance`,
        `Average attendance at ${rate}% — below 60% threshold.`,
        `Run attendance poll for ${team.name}. Contact players who have missed 2+ sessions.`,
        [team.name],
      ));
    } else if (rate !== null && rate < 75) {
      risks.push(risk(RISK_TYPES.ATTENDANCE_DECLINE, SEVERITY.MEDIUM,
        `${team.name} attendance below target`,
        `Average attendance at ${rate}% — below 75% target.`,
        `Send training reminder to ${team.name} squad.`,
        [team.name],
      ));
    }
  }
  return risks;
}

function detectPlayerRetention(model) {
  const risks = [];
  const atRisk = model.players?.atRiskCount ?? 0;
  const total  = model.players?.activeCount  ?? 0;
  if (total === 0) return risks;

  const riskRate = atRisk / total;
  if (riskRate >= 0.20) {
    risks.push(risk(RISK_TYPES.PLAYER_RETENTION, SEVERITY.HIGH,
      'High player retention risk',
      `${atRisk} of ${total} players (${Math.round(riskRate*100)}%) flagged as high retention risk.`,
      `Run player engagement check-in. Review development plans for at-risk players.`,
      ['squad'],
    ));
  } else if (riskRate >= 0.10) {
    risks.push(risk(RISK_TYPES.PLAYER_RETENTION, SEVERITY.MEDIUM,
      'Elevated player churn risk',
      `${atRisk} players have low attendance and/or declining development.`,
      `Prioritise 1-1 check-ins with at-risk players this week.`,
      model.players.atRisk?.slice(0, 3).map(p => p.name) ?? ['players'],
    ));
  }
  return risks;
}

function detectVolunteerGap(model) {
  const risks = [];
  const vols   = model.volunteers ?? {};
  const missing = vols.missingRoles ?? [];
  const coverage = vols.coveragePercent ?? null;

  if (missing.length > 0 || (coverage !== null && coverage < 70)) {
    const severity = coverage !== null && coverage < 50 ? SEVERITY.CRITICAL : SEVERITY.HIGH;
    risks.push(risk(RISK_TYPES.VOLUNTEER_GAP, severity,
      `${missing.length > 0 ? missing.length + ' volunteer roles unfilled' : 'Low volunteer coverage'}`,
      coverage !== null
        ? `Only ${coverage}% of volunteer roles are filled.`
        : `${missing.length} volunteer roles are currently unfilled.`,
      `Post volunteer recruitment call. Reach out to former volunteers.`,
      missing.length > 0 ? missing : ['volunteer team'],
    ));
  }
  return risks;
}

function detectSponsorExpiry(model) {
  const risks = [];
  const upcoming = model.sponsors?.upcomingRenewals ?? [];
  for (const s of upcoming) {
    const days = s.daysUntilRenewal ?? 999;
    if (days <= 14) {
      risks.push(risk(RISK_TYPES.SPONSOR_EXPIRY, SEVERITY.CRITICAL,
        `${s.name} sponsorship expires in ${days} days`,
        `Sponsorship renewal due imminently.`,
        `Contact ${s.name} immediately to begin renewal discussion.`,
        [s.name],
      ));
    } else if (days <= 30) {
      risks.push(risk(RISK_TYPES.SPONSOR_EXPIRY, SEVERITY.HIGH,
        `${s.name} renewal due within 30 days`,
        `Sponsorship renewal needed within a month.`,
        `Schedule renewal meeting with ${s.name} this week.`,
        [s.name],
      ));
    } else if (days <= 90) {
      risks.push(risk(RISK_TYPES.SPONSOR_EXPIRY, SEVERITY.MEDIUM,
        `${s.name} renewal due within 90 days`,
        `${days} days until sponsorship renewal.`,
        `Send sponsor update email to ${s.name} and prepare renewal proposal.`,
        [s.name],
      ));
    }
  }
  return risks;
}

function detectCoachOverload(model) {
  const risks = [];
  const ratio  = model.coaches?.playerRatio;
  if (ratio !== null && ratio > 40) {
    risks.push(risk(RISK_TYPES.COACH_OVERLOAD, SEVERITY.HIGH,
      'Coaching capacity strained',
      `Player-to-coach ratio is 1:${ratio} — above the recommended 1:30 maximum.`,
      `Recruit assistant coaches or restructure training groups.`,
      ['coaching team'],
    ));
  } else if (ratio !== null && ratio > 30) {
    risks.push(risk(RISK_TYPES.COACH_OVERLOAD, SEVERITY.MEDIUM,
      'Coaching capacity approaching limit',
      `Player-to-coach ratio is 1:${ratio}.`,
      `Monitor coach workload. Consider adding volunteer assistant coaches.`,
      ['coaching team'],
    ));
  }
  return risks;
}

function detectMembershipChurn(model) {
  const risks = [];
  const retention = model.membership?.retentionRate;
  const trend     = model.membership?.trend;
  if (retention !== null && retention < 70) {
    risks.push(risk(RISK_TYPES.MEMBERSHIP_CHURN, SEVERITY.HIGH,
      `Low membership retention (${retention}%)`,
      `${100 - retention}% of members are at risk of not renewing.`,
      `Launch membership retention campaign. Review membership value proposition.`,
      ['membership'],
    ));
  } else if (trend === 'shrinking') {
    risks.push(risk(RISK_TYPES.MEMBERSHIP_CHURN, SEVERITY.MEDIUM,
      'Membership trend declining',
      'Membership numbers are trending downward.',
      'Review exit reasons and launch targeted re-engagement campaign.',
      ['membership'],
    ));
  }
  return risks;
}

function detectCommitteeBacklog(model) {
  const risks = [];
  const pending  = model.committee?.pendingApprovals ?? 0;
  const critical = model.committee?.criticalDecisions ?? 0;
  if (critical > 0) {
    risks.push(risk(RISK_TYPES.COMMITTEE_BACKLOG, SEVERITY.HIGH,
      `${critical} critical decision${critical > 1 ? 's' : ''} awaiting committee`,
      `High-priority approvals are blocked.`,
      `Schedule emergency committee meeting or delegate approval authority.`,
      ['committee'],
    ));
  } else if (pending >= 5) {
    risks.push(risk(RISK_TYPES.COMMITTEE_BACKLOG, SEVERITY.MEDIUM,
      `${pending} approvals queued`,
      `Committee approval backlog is growing.`,
      `Allocate 30 minutes this week to clear the approval queue.`,
      ['committee'],
    ));
  }
  return risks;
}

function detectDataStaleness(model) {
  const risks = [];
  const completeness = model.dataCompleteness ?? 100;
  if (completeness < 50) {
    risks.push(risk(RISK_TYPES.DATA_STALENESS, SEVERITY.MEDIUM,
      'Club data is incomplete',
      `Only ${completeness}% of the Digital Twin fields are populated.`,
      `Update player records, coach profiles and club settings to improve data quality.`,
      ['data'],
    ));
  }
  return risks;
}

function detectSquadDepth(model) {
  const risks = [];
  for (const team of (model.teams ?? [])) {
    const available = team.playerCount - (team.activeInjuries ?? 0);
    if (available < 10 && team.playerCount > 0) {
      const severity = available < 7 ? SEVERITY.HIGH : SEVERITY.MEDIUM;
      risks.push(risk(RISK_TYPES.SQUAD_DEPTH, severity,
        `${team.name} squad depth low`,
        `Only ${available} fit players available — minimum 15 needed for a match.`,
        `Check player availability for upcoming fixture. Consider calling up reserves.`,
        [team.name],
      ));
    }
  }
  return risks;
}

function detectCommsBacklog(model) {
  const risks = [];
  const pending = model.communications?.pendingDrafts ?? 0;
  if (pending >= 5) {
    risks.push(risk(RISK_TYPES.COMMS_BACKLOG, SEVERITY.MEDIUM,
      `${pending} communication drafts pending approval`,
      `Communications backlog may delay engagement with members.`,
      `Review and approve pending communications drafts.`,
      ['communications'],
    ));
  }
  return risks;
}

// ── Aggregate risk register ───────────────────────────────────────────────────

export function buildRiskRegister(model) {
  const allRisks = [
    ...detectInjuryCluster(model),
    ...detectAttendanceDecline(model),
    ...detectPlayerRetention(model),
    ...detectVolunteerGap(model),
    ...detectSponsorExpiry(model),
    ...detectCoachOverload(model),
    ...detectMembershipChurn(model),
    ...detectCommitteeBacklog(model),
    ...detectDataStaleness(model),
    ...detectSquadDepth(model),
    ...detectCommsBacklog(model),
  ];

  // Sort by severity
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  allRisks.sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4));

  return {
    total:     allRisks.length,
    critical:  allRisks.filter(r => r.severity === SEVERITY.CRITICAL).length,
    high:      allRisks.filter(r => r.severity === SEVERITY.HIGH).length,
    medium:    allRisks.filter(r => r.severity === SEVERITY.MEDIUM).length,
    low:       allRisks.filter(r => r.severity === SEVERITY.LOW).length,
    risks:     allRisks,
    computedAt: new Date().toISOString(),
  };
}

export function getClubRisks(model) {
  return buildRiskRegister(model);
}

export function getCriticalRisks(model) {
  return buildRiskRegister(model).risks.filter(r => r.severity === SEVERITY.CRITICAL || r.severity === SEVERITY.HIGH);
}

// ── Risk factory ──────────────────────────────────────────────────────────────

let _riskId = 0;
function risk(type, severity, title, description, recommendedAction, affectedEntities = []) {
  return {
    id:               `risk_${++_riskId}`,
    type,
    severity,
    title,
    description,
    recommendedAction,
    affectedEntities,
    detectedAt:       new Date().toISOString(),
  };
}
