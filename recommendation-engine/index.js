/**
 * Coach's Eye Recommendation Engine
 *
 * Accepts coaching context (fixture, squad, injuries, medical alerts, attendance,
 * club score, season phase) and returns ranked recommendation objects.
 *
 * Architecture:
 *   - Detectors are pure functions: (context) → recommendation | null
 *   - Each detector owns one concern and one category
 *   - explainability is generated from the specific data that fired the detector
 *   - Mock data is injected when live inputs are absent (source: 'mock')
 *   - This engine never imports from Coach's Eye Core
 */

import { randomUUID } from 'crypto';

// ── Schema constants ──────────────────────────────────────────────────────────

export const CATEGORY = {
  SELECTION:     'Selection',
  TRAINING:      'Training',
  MEDICAL:       'Medical',
  LOGISTICS:     'Logistics',
  PLAYER_WELFARE:'Player Welfare',
  CLUB:          'Club',
  PERFORMANCE:   'Performance',
};

export const PRIORITY = { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' };

// ── Recommendation builder ────────────────────────────────────────────────────

function rec({ category, priority, confidence, title, description, action, source, explainability, _score }) {
  return {
    id:             randomUUID(),
    category,
    priority,
    confidence:     Math.min(100, Math.max(0, confidence)),
    title,
    description,
    action,
    source,
    explainability,
    _score: _score ?? priorityScore(priority) + (confidence ?? 50) * 0.3,
  };
}

function priorityScore(p) {
  return p === 'HIGH' ? 100 : p === 'MEDIUM' ? 60 : 25;
}

// ── Category: Selection ───────────────────────────────────────────────────────

function detectPositionShortage(ctx) {
  const unavailable = ctx.fixture?.squadStatus?.unavailable ?? [];
  if (unavailable.length < 2) return null;

  // Group by position
  const byPos = {};
  for (const p of unavailable) {
    const pos = p.position ?? p.reason?.match(/front row|lock|flanker|back row|scrum-half|fly-half|centre|wing|fullback/i)?.[0] ?? 'unknown';
    if (pos === 'unknown') continue;
    byPos[pos] = (byPos[pos] ?? []);
    byPos[pos].push(p);
  }

  const crisis = Object.entries(byPos).filter(([, ps]) => ps.length >= 2).sort((a,b) => b[1].length - a[1].length)[0];
  if (!crisis) return null;

  const [pos, players] = crisis;
  const names = players.map(p => p.name).join(', ');
  const daysOut = ctx.fixture?.daysToKickoff;
  const urgent = daysOut != null && daysOut <= 7;

  return rec({
    category:       CATEGORY.SELECTION,
    priority:       urgent ? PRIORITY.HIGH : PRIORITY.MEDIUM,
    confidence:     85,
    title:          `${players.length} ${pos} players unavailable${urgent ? ` — ${daysOut}d to kickoff` : ''}`,
    description:    `${names} are listed as unavailable. A shortage at ${pos} creates a structural gap in the lineup that selectors must address before the next fixture.`,
    action:         `Review squad depth at ${pos}. Consider repositioning or calling up cover from the development squad.`,
    source:         'fixture-engine',
    explainability: `Your fixture's squad status shows ${players.length} players unavailable in the same position (${pos}). When a positional group drops below minimum cover before a fixture, selection decisions are needed immediately.`,
  });
}

function detectThinSquad(ctx) {
  const available  = ctx.fixture?.squadStatus?.available  ?? [];
  const uncertain  = ctx.fixture?.squadStatus?.uncertain  ?? [];
  const total      = available.length + uncertain.length;
  const daysOut    = ctx.fixture?.daysToKickoff;
  if (total === 0 || total >= 20) return null;

  const urgent  = total < 15 && daysOut != null && daysOut <= 5;
  const concern = total < 18;
  if (!concern) return null;

  return rec({
    category:       CATEGORY.SELECTION,
    priority:       urgent ? PRIORITY.HIGH : PRIORITY.MEDIUM,
    confidence:     75,
    title:          `Squad depth low — ${total} confirmed or likely available`,
    description:    `Only ${total} players are confirmed available or likely available for the upcoming fixture. A match-day squad of at least 22 is recommended to cover for late withdrawals.`,
    action:         `Contact uncertain players to confirm availability. Consider bringing in registered cover players.`,
    source:         'fixture-engine',
    explainability: `Your fixture panel shows ${available.length} confirmed and ${uncertain.length} uncertain players. Squads below 20 heading into match week carry high late-withdrawal risk.`,
  });
}

// ── Category: Training ────────────────────────────────────────────────────────

function detectAttendanceDrop(ctx) {
  const trends = ctx.attendanceTrends;
  if (!trends) return null;
  const rate    = trends.averageRate ?? 100;
  const dropPct = trends.dropPercent ?? (trends.trend < 0 ? Math.abs(trends.trend) : null);
  if (rate >= 80 && !dropPct) return null;

  const worst = (trends.decliningTeams ?? []).sort((a,b) => a.rate - b.rate)[0];
  const mention = worst ? ` ${worst.name} is lowest at ${worst.rate}%.` : '';

  return rec({
    category:       CATEGORY.TRAINING,
    priority:       rate < 65 ? PRIORITY.HIGH : PRIORITY.MEDIUM,
    confidence:     trends.confidence ?? 70,
    title:          dropPct
      ? `Training attendance has dropped ${dropPct}% this month`
      : `Club-wide attendance at ${rate}% — below target`,
    description:    `Average attendance across all squads is ${rate}%.${mention} Sustained low turnout reduces training quality and increases injury risk from inadequate warm-ups.`,
    action:         `Run an attendance communication to all teams. Investigate scheduling conflicts with the coaching group.`,
    source:         'attendance-engine',
    explainability: `The attendance engine is tracking a${dropPct ? ` ${dropPct}%` : ' sustained'} decline in average training turnout. This recommendation fires when attendance falls below 80% or shows a consistent downward trend.`,
  });
}

function detectPreMatchLoadReduction(ctx) {
  const prepStage = ctx.fixture?.prepStage;
  const daysOut   = ctx.fixture?.daysToKickoff;
  if (prepStage !== 'MATCH' && daysOut > 3) return null;

  return rec({
    category:       CATEGORY.TRAINING,
    priority:       PRIORITY.MEDIUM,
    confidence:     80,
    title:          'Match week: reduce training load to protect freshness',
    description:    `With the fixture ${daysOut ?? 'imminently'} day(s) away, this is the optimal window to taper training intensity. High-volume sessions at this stage increase soft tissue injury risk.`,
    action:         `Cap session length to 60 min. Focus on shape and set-pieces. No contact above 50%.`,
    source:         'season-intelligence',
    explainability: `Season intelligence detects you are in match-week prep (${daysOut ?? 0}d to kickoff). A load reduction recommendation is generated automatically in the final 3 days before any fixture.`,
  });
}

function detectPreSeasonUnderlot(ctx) {
  const phase = ctx.seasonPhase?.phase;
  if (phase !== 'PRE_SEASON' && phase !== 'pre-season') return null;
  const rate = ctx.attendanceTrends?.averageRate ?? 100;
  if (rate >= 85) return null;

  return rec({
    category:       CATEGORY.TRAINING,
    priority:       PRIORITY.MEDIUM,
    confidence:     65,
    title:          'Pre-season attendance below 85% — base fitness at risk',
    description:    `Pre-season is the only window to build the aerobic base and team structures that carry through the competitive phase. Missing sessions now compounds through the season.`,
    action:         `Communicate the importance of pre-season commitment. Consider incentive or squad selection consequences for persistent absenteeism.`,
    source:         'season-intelligence',
    explainability: `Season intelligence shows the club is in pre-season, and the attendance engine reports turnout below 85%. The combination triggers this recommendation because pre-season gaps are non-recoverable.`,
  });
}

// ── Category: Medical ─────────────────────────────────────────────────────────

function detectHighSeverityMedical(ctx) {
  const alerts = (ctx.medicalAlerts ?? ctx.fixture?.medicalAlerts ?? []).filter(a => a.severity === 'HIGH' || a.severity === 'high' || a.severity === 'critical');
  if (!alerts.length) return null;

  const names = alerts.slice(0, 3).map(a => a.name ?? a.playerName).join(', ');

  return rec({
    category:       CATEGORY.MEDICAL,
    priority:       PRIORITY.HIGH,
    confidence:     90,
    title:          `${alerts.length} high-severity medical alert${alerts.length > 1 ? 's' : ''} — immediate review required`,
    description:    `${names}${alerts.length > 3 ? ` and ${alerts.length - 3} others` : ''} have active high-severity medical alerts. These players must be cleared by a medical officer before any contact training.`,
    action:         `Contact the club's medical officer today. Update each player's status in the injury register before the next training session.`,
    source:         'fixture-engine',
    explainability: `Your fixture's medical alerts include ${alerts.length} player(s) flagged at HIGH severity. Any high-severity flag triggers this recommendation because contact clearance is a safeguarding requirement.`,
  });
}

function detectInjuryVolume(ctx) {
  const injuries = ctx.injuries ?? [];
  const active   = injuries.filter(i => !i.returnDate || new Date(i.returnDate) > new Date());
  if (active.length < 3) return null;

  const positions = [...new Set(active.map(i => i.position).filter(Boolean))];

  return rec({
    category:       CATEGORY.MEDICAL,
    priority:       active.length >= 5 ? PRIORITY.HIGH : PRIORITY.MEDIUM,
    confidence:     75,
    title:          `${active.length} active injuries — ${positions.length > 1 ? 'multiple positions affected' : `${positions[0] ?? 'squad'} impacted`}`,
    description:    `The current injury list has ${active.length} active cases. Clusters of injuries across a short period can indicate training load issues or pitch conditions worth reviewing.`,
    action:         `Review recent training load data. Flag the cluster to the medical officer for pattern analysis.`,
    source:         'digital-twin',
    explainability: `The digital twin is tracking ${active.length} active player injuries. When 3 or more simultaneous injuries appear, a medical review recommendation is raised to check for systemic causes.`,
  });
}

function detectReturnToPlayRisk(ctx) {
  const injuries = ctx.injuries ?? [];
  const daysOut  = ctx.fixture?.daysToKickoff;
  if (daysOut == null) return null;

  const riskReturns = injuries.filter(i => {
    if (!i.returnDate) return false;
    const returnDays = Math.round((new Date(i.returnDate) - new Date()) / 86400000);
    return returnDays >= 0 && returnDays <= daysOut + 3;
  });
  if (!riskReturns.length) return null;

  const names = riskReturns.map(i => i.playerName ?? i.name).join(', ');

  return rec({
    category:       CATEGORY.MEDICAL,
    priority:       PRIORITY.MEDIUM,
    confidence:     70,
    title:          `${riskReturns.length} player${riskReturns.length > 1 ? 's' : ''} returning from injury near match day`,
    description:    `${names} ${riskReturns.length === 1 ? 'is' : 'are'} due to return from injury within the match window. Returning players carry elevated re-injury risk in the first 2 sessions back.`,
    action:         `Apply a graduated return-to-play protocol. Do not rush into full contact until medical clearance.`,
    source:         'digital-twin',
    explainability: `The injury register shows ${riskReturns.length} player${riskReturns.length > 1 ? 's' : ''} with a scheduled return date that coincides with your upcoming fixture window. Re-injury risk is highest in the first week back.`,
  });
}

// ── Category: Logistics ───────────────────────────────────────────────────────

function detectWeatherImpact(ctx) {
  const weather = ctx.weather;
  if (!weather || weather.risk === 'CLEAR' || !weather.risk) return null;

  const kickingNote = weather.risk === 'HEAVY_RAIN' || weather.risk === 'STORM';

  return rec({
    category:       CATEGORY.LOGISTICS,
    priority:       weather.risk === 'STORM' ? PRIORITY.HIGH : PRIORITY.MEDIUM,
    confidence:     weather.confidence ?? 55,
    title:          `${weather.label ?? weather.risk} forecast${kickingNote ? ' — reduce kicking volume' : ''}`,
    description:    `${weather.description ?? `${weather.risk} conditions expected`}. Waterlogged or icy pitches significantly increase soft tissue injury rates. ${kickingNote ? 'Heavy rain also makes kicking practice less effective and can reinforce poor technique.' : ''}`,
    action:         kickingNote
      ? 'Move kicking sessions indoors or postpone. Prioritise contact and defensive shape work under covered conditions.'
      : 'Check pitch condition 48h before session. Have an indoor contingency ready.',
    source:         'weather-service',
    explainability: `A weather risk of ${weather.risk} has been detected for your fixture or training window. Adverse weather recommendations fire when forecast risk is above CLEAR, scaled by severity.`,
  });
}

function detectBackToBackFixtures(ctx) {
  const upcoming = ctx.upcomingFixtures ?? [];
  if (upcoming.length < 2) return null;

  const sorted = [...upcoming].sort((a,b) => new Date(a.kickoff ?? a.date) - new Date(b.kickoff ?? b.date));
  let tightGap = null;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = Math.round((new Date(sorted[i+1].kickoff ?? sorted[i+1].date) - new Date(sorted[i].kickoff ?? sorted[i].date)) / 86400000);
    if (gap <= 7) { tightGap = { a: sorted[i], b: sorted[i+1], gap }; break; }
  }
  if (!tightGap) return null;

  return rec({
    category:       CATEGORY.LOGISTICS,
    priority:       tightGap.gap <= 5 ? PRIORITY.HIGH : PRIORITY.MEDIUM,
    confidence:     85,
    title:          `Back-to-back fixtures ${tightGap.gap}d apart — manage squad load`,
    description:    `Two fixtures are scheduled only ${tightGap.gap} days apart. Players involved in both require active load management to avoid fatigue-related injuries.`,
    action:         `Create an A/B squad rotation plan. Limit full-contact training between fixtures. Prioritise recovery sessions over volume.`,
    source:         'fixture-engine',
    explainability: `The fixture engine has detected two upcoming fixtures within a ${tightGap.gap}-day window. Load management recommendations are triggered automatically for fixture gaps of 7 days or less.`,
  });
}

// ── Category: Player Welfare ──────────────────────────────────────────────────

function detectAtRiskPlayers(ctx) {
  const atRisk = ctx.atRiskPlayers ?? [];
  if (!atRisk.length) return null;

  const top = atRisk[0];
  const others = atRisk.length - 1;

  return rec({
    category:       CATEGORY.PLAYER_WELFARE,
    priority:       atRisk.length >= 3 ? PRIORITY.HIGH : PRIORITY.MEDIUM,
    confidence:     70,
    title:          `${atRisk.length} player${atRisk.length > 1 ? 's' : ''} flagged at welfare risk`,
    description:    `${top.name ?? top.playerName}${others > 0 ? ` and ${others} other${others > 1 ? 's' : ''}` : ''} ${atRisk.length === 1 ? 'has' : 'have'} been flagged by the digital twin with a high risk score. This may indicate low attendance, disengagement, or physical welfare concerns.`,
    action:         `Make direct contact with flagged players this week. Log any welfare notes in the player profiles.`,
    source:         'digital-twin',
    explainability: `The digital twin assigns a welfare risk score to every player based on attendance patterns, injury history, and engagement signals. Players crossing the high-risk threshold appear in this recommendation.`,
  });
}

function detectYouthWelfareDuty(ctx) {
  const squad = ctx.squad ?? {};
  const allPlayers = [...(squad.available ?? []), ...(squad.uncertain ?? [])];
  if (!allPlayers.length) return null;

  // Look for youth players (U18/U20 tag or ageGroup)
  const youth = allPlayers.filter(p => {
    const ag = (p.ageGroup ?? '').toLowerCase();
    return ag.includes('u18') || ag.includes('u16') || ag.includes('u20') || ag.includes('youth') || ag.includes('minor');
  });
  if (youth.length === 0) return null;

  // Check if any youth players have high session count (if data available)
  const overloaded = youth.filter(p => (p.sessionCount ?? 0) > 3);
  if (overloaded.length === 0 && youth.length < 5) return null;

  return rec({
    category:       CATEGORY.PLAYER_WELFARE,
    priority:       overloaded.length > 0 ? PRIORITY.HIGH : PRIORITY.LOW,
    confidence:     65,
    title:          overloaded.length > 0
      ? `${overloaded.length} youth player${overloaded.length > 1 ? 's' : ''} above recommended weekly session limit`
      : `${youth.length} youth players in squad — welfare duty reminders active`,
    description:    overloaded.length > 0
      ? `${overloaded.map(p => p.name).join(', ')} have exceeded the recommended 3 sessions per week for youth players. Youth athletes require mandatory rest days to avoid growth-plate stress.`
      : `Your squad includes ${youth.length} youth players. Clubs have a statutory duty of care to monitor youth player load and wellbeing.`,
    action:         overloaded.length > 0
      ? `Remove these players from the next mid-week session. Notify parents of the load monitoring policy.`
      : `Confirm all youth player consents are up to date. Log any welfare concerns in the system.`,
    source:         'digital-twin',
    explainability: `The digital twin tracks age groups for every player. Youth players (U18 and below) are subject to stricter load monitoring. This recommendation appears whenever youth athletes approach session limits or when a squad change brings youth players into a senior fixture window.`,
  });
}

// ── Category: Club ────────────────────────────────────────────────────────────

function detectClubScoreDrop(ctx) {
  const score = ctx.clubScore;
  if (!score) return null;
  const overall = score.overall ?? score.score;
  if (overall == null || overall >= 65) return null;

  const weakest = Object.entries(score.components ?? {})
    .filter(([, v]) => typeof v === 'number')
    .sort(([, a], [, b]) => a - b)[0];

  return rec({
    category:       CATEGORY.CLUB,
    priority:       overall < 50 ? PRIORITY.HIGH : PRIORITY.MEDIUM,
    confidence:     score.confidence ?? 70,
    title:          `Club health score ${overall}/100 — below healthy threshold`,
    description:    `The Club Intelligence score has fallen to ${overall}/100.${weakest ? ` The weakest dimension is ${weakest[0]} at ${weakest[1]}/100.` : ''} Scores below 65 indicate structural issues requiring coaching or committee attention.`,
    action:         `Review the Club Intelligence dashboard for the full breakdown. Focus improvement efforts on the ${weakest?.[0] ?? 'lowest'} dimension first.`,
    source:         'club-intelligence',
    explainability: `The Club Intelligence engine continuously models club health across engagement, attendance, finance, and governance dimensions. A score below 65/100 triggers this recommendation as an early warning.`,
  });
}

function detectEngagementFall(ctx) {
  const score = ctx.clubScore;
  const engagement = score?.components?.engagement ?? score?.engagement;
  if (!engagement || engagement >= 60) return null;

  return rec({
    category:       CATEGORY.CLUB,
    priority:       PRIORITY.MEDIUM,
    confidence:     score?.confidence ?? 65,
    title:          `Member engagement score ${engagement}/100 — communication review needed`,
    description:    `Engagement measures how actively members interact with the club's communications, events, and digital touchpoints. A score of ${engagement}/100 suggests members are drifting.`,
    action:         `Schedule a newsletter, run a poll or survey, or launch a community event to re-engage the membership base.`,
    source:         'club-intelligence',
    explainability: `The engagement sub-score of the Club Intelligence model has dropped below 60/100. Engagement is the leading indicator for renewal and retention — it typically falls 4–6 weeks before membership lapses accelerate.`,
  });
}

// ── Category: Performance ─────────────────────────────────────────────────────

function detectSeasonPrescription(ctx) {
  const phase = ctx.seasonPhase;
  if (!phase?.prescription) return null;
  const p = phase.prescription;
  const focus = p.focus ?? p.sessionFocus ?? p.objective;
  if (!focus) return null;

  return rec({
    category:       CATEGORY.PERFORMANCE,
    priority:       PRIORITY.MEDIUM,
    confidence:     80,
    title:          `Season phase: ${phase.label ?? phase.phase} — recommended focus: ${Array.isArray(focus) ? focus[0] : focus}`,
    description:    `You are in the ${phase.label ?? phase.phase} phase. The season intelligence model prescribes: ${Array.isArray(focus) ? focus.join(', ') : focus}. ${p.rationale ?? ''}`,
    action:         p.coachAction ?? `Align your next ${p.sessions ?? 2} sessions with the prescribed phase focus.`,
    source:         'season-intelligence',
    explainability: `Season intelligence tracks your club's position in the season cycle and maps it to evidence-based training prescriptions. This recommendation reflects the current phase prescription for ${phase.label ?? phase.phase}.`,
  });
}

function detectFormTrend(ctx) {
  const results = ctx.recentResults ?? [];
  if (results.length < 3) return null;

  const recent = results.slice(-3);
  const losses  = recent.filter(r => r.outcome === 'L').length;
  const wins    = recent.filter(r => r.outcome === 'W').length;

  if (losses < 2 && wins < 3) return null;

  if (wins === 3) {
    return rec({
      category:       CATEGORY.PERFORMANCE,
      priority:       PRIORITY.LOW,
      confidence:     60,
      title:          'Three consecutive wins — protect mental freshness',
      description:    'A three-match winning run can create complacency or overconfidence in training. This is a good moment to reset expectations and focus on process rather than outcome.',
      action:         'Run a session focused on areas of improvement rather than celebrating past wins. Set new micro-targets.',
      source:         'fixture-engine',
      explainability: 'Recent fixture results show 3 consecutive wins. A low-priority performance reminder is generated to help coaches avoid the complacency that can follow successful runs.',
    });
  }

  return rec({
    category:       CATEGORY.PERFORMANCE,
    priority:       PRIORITY.HIGH,
    confidence:     65,
    title:          `${losses} losses in last 3 matches — tactical review recommended`,
    description:    'Three recent results indicate a performance dip. Patterns in defeat (conceding late, breakdown losses, lineout malfunctions) are most visible in video review immediately after the matches.',
    action:         'Schedule a coaches\' video review session. Identify one recurring theme and address it directly in the next two training sessions.',
    source:         'fixture-engine',
    explainability: `The last 3 fixture results show ${losses} defeats. This recommendation fires when 2 or more losses appear in a 3-match window, as that pattern suggests a systematic rather than one-off issue.`,
  });
}

// ── Mock context ──────────────────────────────────────────────────────────────
// Used when the caller doesn't provide live data. Produces realistic-looking
// recommendations that demonstrate the engine to coaches evaluating the product.

function buildMockContext() {
  return {
    fixture: {
      daysToKickoff: 5,
      prepStage:     'BUILD',
      squadStatus: {
        available:   [
          { id: 'p1', name: 'Cian Murphy',      position: 'Prop' },
          { id: 'p2', name: 'Darragh Kelly',    position: 'Hooker' },
          { id: 'p3', name: 'Tom Walsh',        position: 'Lock' },
          { id: 'p4', name: 'James Byrne',      position: 'Flanker' },
          { id: 'p5', name: 'Eoin Maguire',     position: 'Number 8' },
          { id: 'p6', name: 'Oisín O\'Brien',   position: 'Scrum-half' },
          { id: 'p7', name: 'Shane Doyle',      position: 'Fly-half' },
          { id: 'p8', name: 'Ross Dunne',       position: 'Centre' },
          { id: 'p9', name: 'Cormac Quinn',     position: 'Wing' },
          { id: 'p10', name: 'Niall Farrell',   position: 'Fullback' },
        ],
        unavailable: [
          { id: 'p11', name: 'Jack O\'Sullivan', position: 'Prop',    reason: 'Hamstring strain' },
          { id: 'p12', name: 'Conor Lynch',      position: 'Prop',    reason: 'Knee (precautionary)' },
          { id: 'p13', name: 'Fionn Brennan',    position: 'Lock',    reason: 'Work commitment' },
        ],
        uncertain:   [
          { id: 'p14', name: 'Aaron Smyth',     position: 'Centre',  reason: 'Hamstring — monitoring' },
        ],
      },
      medicalAlerts: [
        { playerId: 'p8', name: 'Ross Dunne',   alert: 'Concussion protocol active — not cleared for contact', severity: 'HIGH' },
      ],
    },
    injuries: [
      { playerId: 'p11', playerName: 'Jack O\'Sullivan', position: 'Prop',    severity: 'MEDIUM', returnDate: null },
      { playerId: 'p12', playerName: 'Conor Lynch',      position: 'Prop',    severity: 'LOW',    returnDate: new Date(Date.now() + 4 * 86400000).toISOString() },
      { playerId: 'p15', playerName: 'Liam Carroll',     position: 'Flanker', severity: 'LOW',    returnDate: new Date(Date.now() + 2 * 86400000).toISOString() },
    ],
    medicalAlerts: [
      { playerId: 'p8', name: 'Ross Dunne', alert: 'Concussion protocol active — not cleared for contact', severity: 'HIGH' },
    ],
    attendanceTrends: {
      averageRate:     71,
      dropPercent:     18,
      trend:          -3,
      confidence:      72,
      decliningTeams: [
        { id: 't1', name: 'Senior A',  rate: 63, trend: -4 },
        { id: 't2', name: 'Under 20s', rate: 68, trend: -2 },
      ],
    },
    clubScore: {
      overall:    58,
      confidence: 68,
      components: {
        engagement: 52,
        attendance: 68,
        governance: 71,
        finance:    61,
      },
    },
    seasonPhase: {
      phase: 'COMPETITIVE',
      label: 'Competitive Season',
      prescription: {
        focus:        ['Game shape', 'Set-piece refinement', 'Defensive organisation'],
        objective:    'Maintain competitive fitness, sharpen game patterns',
        sessions:     2,
        coachAction:  'Run one pattern session and one defensive session before matchday.',
        rationale:    'Mid-competitive phase squads perform best when training volume decreases and specificity increases.',
      },
    },
    atRiskPlayers: [
      { id: 'p16', name: 'Séan Hennessy', attendanceRate: 48, retentionRisk: 'high' },
    ],
    weather: {
      risk:        'HEAVY_RAIN',
      label:       'Heavy rain',
      description: 'Heavy rain forecast for Thursday and Friday training windows',
      confidence:  60,
    },
    recentResults: [
      { outcome: 'W', score: '18-12' },
      { outcome: 'L', score: '7-22' },
      { outcome: 'L', score: '14-19' },
    ],
    _isMock: true,
  };
}

// ── Detector pipeline ─────────────────────────────────────────────────────────

const DETECTORS = [
  detectPositionShortage,
  detectThinSquad,
  detectHighSeverityMedical,
  detectInjuryVolume,
  detectReturnToPlayRisk,
  detectAttendanceDrop,
  detectPreMatchLoadReduction,
  detectPreSeasonUnderlot,
  detectWeatherImpact,
  detectBackToBackFixtures,
  detectAtRiskPlayers,
  detectYouthWelfareDuty,
  detectClubScoreDrop,
  detectEngagementFall,
  detectSeasonPrescription,
  detectFormTrend,
];

function runDetectors(ctx) {
  return DETECTORS.map(d => { try { return d(ctx); } catch { return null; } }).filter(Boolean);
}

function rank(recs) {
  return [...recs].sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Generate ranked coaching recommendations from the provided context.
 *
 * @param {object} ctx - {
 *   fixture, squad, injuries, medicalAlerts,
 *   attendanceTrends, clubScore, seasonPhase,
 *   atRiskPlayers, weather, upcomingFixtures, recentResults
 * }
 * @param {object} opts - { useMockFallback: boolean, maxResults: number }
 * @returns {{ recommendations: object[], meta: object }}
 */
export function generate(ctx = {}, { useMockFallback = true, maxResults = 10 } = {}) {
  const hasContext = (
    ctx.fixture != null ||
    ctx.injuries?.length > 0 ||
    ctx.attendanceTrends != null ||
    ctx.clubScore != null ||
    ctx.seasonPhase != null
  );

  const context  = hasContext ? ctx : (useMockFallback ? buildMockContext() : ctx);
  const isMock   = !hasContext && useMockFallback;

  // Tag source as 'mock' when falling back
  const recs = runDetectors(context).map(r => ({
    ...r,
    source: isMock ? 'mock' : r.source,
  }));

  const ranked = rank(recs).slice(0, maxResults);

  // Strip internal _score from output
  const clean = ranked.map(({ _score, ...r }) => r);

  return {
    recommendations: clean,
    meta: {
      generatedAt:  new Date().toISOString(),
      total:        clean.length,
      isMock,
      highCount:    clean.filter(r => r.priority === 'HIGH').length,
      mediumCount:  clean.filter(r => r.priority === 'MEDIUM').length,
      lowCount:     clean.filter(r => r.priority === 'LOW').length,
      categories:   [...new Set(clean.map(r => r.category))],
    },
  };
}

/**
 * Build a context object from raw engine outputs.
 * Call this to assemble context before passing to generate().
 */
export function buildContext({ fixture, digitalTwin, attendanceData, clubScoreData, seasonData, weatherData, fixtureList, resultHistory } = {}) {
  return {
    fixture:          fixture ?? null,
    squad:            fixture?.squadStatus ?? null,
    injuries:         digitalTwin?.injured?.map(p => ({
                        playerId:   p.id,
                        playerName: p.name,
                        position:   p.position,
                        severity:   p.severity ?? 'MEDIUM',
                        returnDate: p.returnDate ?? null,
                      })) ?? [],
    medicalAlerts:    fixture?.medicalAlerts ?? [],
    attendanceTrends: attendanceData ?? null,
    clubScore:        clubScoreData ?? null,
    seasonPhase:      seasonData ?? null,
    atRiskPlayers:    digitalTwin?.atRisk ?? [],
    weather:          weatherData ?? null,
    upcomingFixtures: fixtureList ?? [],
    recentResults:    resultHistory ?? [],
  };
}
