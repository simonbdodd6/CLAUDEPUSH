/**
 * Club Insights Engine
 * Detects patterns, anomalies, and opportunities across the club profile.
 * Every insight includes: category, priority, title, description, why, entities, actions.
 *
 * Answers:
 *   "Which teams are progressing fastest?"
 *   "Which players are at injury risk?"
 *   "Which coaches need support?"
 *   "Which age groups are growing?"
 *   "Which players are likely to leave?"
 *   "Which volunteers are most active?"
 *   "What are the biggest risks across the club?"
 *   "What are the biggest opportunities?"
 */

// ── Insight factory ───────────────────────────────────────────────────────────

function insight(category, priority, title, description, why, entities = [], actions = []) {
  return { category, priority, title, description, why, entities, actions };
}

const CAT = {
  performance:  'performance',
  risk:         'risk',
  opportunity:  'opportunity',
  operational:  'operational',
  people:       'people',
};

const PRI = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };

// ── Insight generators ────────────────────────────────────────────────────────

function detectTeamProgressionLeaders(teams) {
  if (!teams.length) return [];
  const ins = [];

  const ranked = [...teams]
    .filter(t => t.avgDevelopmentScore != null)
    .sort((a, b) => (b.avgDevelopmentScore ?? 0) - (a.avgDevelopmentScore ?? 0));

  if (ranked.length === 0) return ins;

  const top = ranked[0];
  if (top.avgDevelopmentScore >= 65 || top.trend === 'improving') {
    ins.push(insight(
      CAT.performance, PRI.low,
      `${top.name ?? top.ageGroup} is the fastest-progressing team`,
      `${top.name ?? top.ageGroup} leads with an average development score of ${top.avgDevelopmentScore}/100 and a ${top.trend} trend.`,
      `Average development score of ${top.avgDevelopmentScore}/100 — ${top.improvingCount} player(s) improving, ${top.decliningCount} declining. ` +
      `${top.avgAttendance != null ? `Average attendance ${top.avgAttendance}%.` : ''}`,
      [{ type: 'team', name: top.name ?? top.ageGroup, score: top.avgDevelopmentScore }],
      [
        `Highlight ${top.name ?? top.ageGroup} progress at next club meeting — it builds culture`,
        `Identify what ${top.name ?? top.ageGroup} coaches are doing well and share with other coaches`,
      ],
    ));
  }

  // Slowest team
  const bottom = ranked[ranked.length - 1];
  if (ranked.length > 1 && bottom.avgDevelopmentScore != null && bottom.avgDevelopmentScore < 60) {
    ins.push(insight(
      CAT.performance, PRI.medium,
      `${bottom.name ?? bottom.ageGroup} needs development support`,
      `${bottom.name ?? bottom.ageGroup} has the lowest average development score (${bottom.avgDevelopmentScore}/100).`,
      `${bottom.improvingCount} improving, ${bottom.decliningCount} declining. ` +
      `${bottom.retentionRisk} players at high retention risk. ` +
      `${bottom.highInjuryRisk} at elevated injury risk.`,
      [{ type: 'team', name: bottom.name ?? bottom.ageGroup, score: bottom.avgDevelopmentScore }],
      [
        `Review programme quality for ${bottom.name ?? bottom.ageGroup}`,
        `Consider a coach check-in session with this team`,
        `Set a team development target for next month`,
      ],
    ));
  }

  return ins;
}

function detectInjuryRiskPlayers(players) {
  const highRisk = players.filter(p => (p.injuryRiskScore ?? 0) >= 45);
  const active   = players.filter(p => p.activeInjury);
  const ins      = [];

  if (active.length > 0) {
    ins.push(insight(
      CAT.risk, PRI.critical,
      `${active.length} player(s) have active injuries`,
      `${active.map(p => p.name ?? 'Unknown').join(', ')} ${active.length === 1 ? 'has' : 'have'} active injuries requiring a rehabilitation plan.`,
      `Active injuries detected: ${active.map(p => `${p.name} (${p.injuryTypes.join(', ')})`).join('; ')}.`,
      active.map(p => ({ type: 'player', name: p.name, injury: p.injuryTypes.join(', ') })),
      [
        'Ensure each injured player has a rehabilitation plan assigned',
        'Confirm clearance criteria before return to contact',
        'Flag to first-aider / physio immediately',
      ],
    ));
  }

  if (highRisk.length > 0) {
    ins.push(insight(
      CAT.risk, active.length > 0 ? PRI.high : PRI.medium,
      `${highRisk.length} player(s) at elevated injury risk`,
      `${highRisk.map(p => p.name).join(', ')} ${highRisk.length === 1 ? 'has' : 'have'} injury risk scores ≥45/100.`,
      `Position-specific risk factors and history patterns detected. ` +
      `Proactive prehab reduces injury incidence by ~50% (Gabbett, 2012).`,
      highRisk.map(p => ({ type: 'player', name: p.name, riskScore: p.injuryRiskScore })),
      [
        'Introduce a 10-minute prehab circuit at the start of each session',
        'Review training load for high-risk players',
        'Book a check-in with each player about any undisclosed niggles',
      ],
    ));
  }

  return ins;
}

function detectCoachSupportNeeds(coaches) {
  const needsSupport = coaches.filter(c => c.supportNeeded);
  if (!needsSupport.length) return [];

  return [insight(
    CAT.people, PRI.high,
    `${needsSupport.length} coach(es) flagged as needing support`,
    `${needsSupport.map(c => c.name).join(', ')} ${needsSupport.length === 1 ? 'has' : 'have'} player populations showing signs of stress.`,
    needsSupport.map(c =>
      `${c.name}: ${c.supportReasons.join(' · ')}`
    ).join('\n'),
    needsSupport.map(c => ({ type: 'coach', name: c.name, supportScore: c.supportScore, reasons: c.supportReasons })),
    [
      'Schedule a coaching development conversation with flagged coaches',
      'Review if workload is appropriate — consider co-coach allocation',
      'Provide access to AI Copilot for programme generation',
      'Pair flagged coaches with a mentor from higher-performing teams',
    ],
  )];
}

function detectAgeGroupGrowth(ageGroups, players) {
  const ins  = [];
  const groups = Object.entries(ageGroups);
  if (groups.length === 0) return ins;

  // Without historical baseline, we report current counts and flag small groups
  const sorted = groups.sort((a, b) => b[1].count - a[1].count);
  const largest = sorted[0];
  const smallest = sorted[sorted.length - 1];

  if (sorted.length > 1) {
    ins.push(insight(
      CAT.operational, PRI.low,
      `${largest[0]} is the largest age group (${largest[1].count} player${largest[1].count !== 1 ? 's' : ''})`,
      `${largest[0]} has the most registered players. ` +
      `Smallest group: ${smallest[0]} with ${smallest[1].count} player(s).`,
      `Age group player counts: ${sorted.map(([ag, d]) => `${ag}: ${d.count}`).join(', ')}.`,
      sorted.map(([ag, d]) => ({ type: 'ageGroup', name: ag, count: d.count })),
      [
        `Focus recruitment on ${smallest[0]} to balance squad depth`,
        `Confirm ${smallest[0]} has enough players for competitive fixtures`,
      ],
    ));
  }

  // Small groups at risk of not having enough players for fixtures
  const tooSmall = sorted.filter(([, d]) => d.count < 8 && d.count > 0);
  if (tooSmall.length > 0) {
    ins.push(insight(
      CAT.risk, PRI.medium,
      `${tooSmall.length} age group(s) may be too small for fixtures`,
      `${tooSmall.map(([ag]) => ag).join(', ')} ${tooSmall.length === 1 ? 'has' : 'have'} fewer than 8 registered players.`,
      `Rugby requires 15 players (or min 7 for tag/mini formats). Small squads risk forfeiting fixtures.`,
      tooSmall.map(([ag, d]) => ({ type: 'ageGroup', name: ag, count: d.count })),
      [
        'Launch targeted recruitment for under-strength age groups',
        'Contact local schools about rugby taster days',
        'Consider merging adjacent age groups for training sessions',
      ],
    ));
  }

  return ins;
}

function detectRetentionRisk(players) {
  const highRisk = players.filter(p => p.retentionRisk === 'high');
  if (!highRisk.length) return [];

  return [insight(
    CAT.risk, PRI.high,
    `${highRisk.length} player(s) likely to leave without intervention`,
    `${highRisk.map(p => p.name ?? 'Unknown').join(', ')} show combined signals of declining attendance, no active programme, and declining development.`,
    `Retention risk factors: attendance <60% (+3), declining development (+2), no active programme (+2), no AI engagement (+1). ` +
    `Players at high risk typically disengage within 4–6 weeks.`,
    highRisk.map(p => ({ type: 'player', name: p.name, attendanceRate: p.attendanceRate, trend: p.developmentTrend })),
    [
      'Contact each high-risk player personally this week',
      'Understand their barriers to attendance',
      'Generate a personalised development plan to re-engage',
      'Assign a peer mentor from a high-engagement player',
    ],
  )];
}

function detectProgrammingGaps(players, teams) {
  const noProg = players.filter(p => !p.hasActiveProgramme && !p.activeInjury);
  if (!noProg.length || noProg.length === players.length) return [];

  return [insight(
    CAT.operational, PRI.medium,
    `${noProg.length} player(s) have no active training programme`,
    `${noProg.map(p => p.name).join(', ')} ${noProg.length === 1 ? 'is' : 'are'} not currently following a structured programme.`,
    `Players without a programme show slower development and higher disengagement. ` +
    `The AI Copilot can generate personalised programmes in seconds.`,
    noProg.map(p => ({ type: 'player', name: p.name, position: p.position })),
    [
      'Use the AI Copilot to generate programmes for each player ("Create a programme for [Name]")',
      'Assign programmes before the next training session',
    ],
  )];
}

function detectOpportunities(profile, health) {
  const ins = [];
  const ops = [];

  // High attendance = opportunity for more structured training
  if ((profile.attendance?.clubAverage ?? 0) >= 80) {
    ops.push(insight(
      CAT.opportunity, PRI.low,
      'High attendance — ideal conditions for structured development',
      `Club average attendance of ${profile.attendance.clubAverage}% creates a stable training base.`,
      `Consistent attendance enables periodised training, performance tracking, and AI accuracy.`,
      [],
      [
        'Introduce a structured development calendar for each age group',
        'Begin tracking individual performance metrics to maximise AI insights',
      ],
    ));
  }

  // AI under-utilised
  const totalAiGen = (profile.players ?? []).reduce((s, p) => s + (p.aiGenerations ?? 0), 0);
  if (totalAiGen < (profile.summary?.totalPlayers ?? 0)) {
    ops.push(insight(
      CAT.opportunity, PRI.medium,
      'AI tools under-utilised — significant coaching leverage available',
      `Only ${totalAiGen} AI-generated outputs for ${profile.summary?.totalPlayers} player(s).`,
      `Each player without an AI-generated programme is a missed development opportunity. ` +
      `The Coaching Engine can generate personalised programmes in <30 seconds.`,
      [],
      [
        'Book a 30-minute AI onboarding session with all coaches',
        'Set a target: every player to have an AI programme by end of month',
        'Use "Create a 12-week programme" in the AI Copilot for each player',
      ],
    ));
  }

  // No injuries = window for intensive work
  if ((profile.injuries?.active ?? 0) === 0 && (profile.summary?.totalPlayers ?? 0) > 0) {
    ops.push(insight(
      CAT.opportunity, PRI.low,
      'Injury-free window — maximise training intensity now',
      'No active injuries across the club. This is an optimal window for progressive overload.',
      'Training adaptations compound fastest when all players are available and training consistently.',
      [],
      [
        'Introduce a progressive overload phase across all programmes',
        'Use this window for contact and conditioning work before the competitive season',
      ],
    ));
  }

  return ops;
}

// ── Main generator ────────────────────────────────────────────────────────────

export function generateInsights(profile, health) {
  const { players = [], teams = [], coaches = [], ageGroups = {} } = profile;

  const allInsights = [
    ...detectTeamProgressionLeaders(teams),
    ...detectInjuryRiskPlayers(players),
    ...detectCoachSupportNeeds(coaches),
    ...detectAgeGroupGrowth(ageGroups, players),
    ...detectRetentionRisk(players),
    ...detectProgrammingGaps(players, teams),
    ...detectOpportunities(profile, health),
  ];

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  allInsights.sort((a, b) => (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4));

  return {
    insights: allInsights,
    totalCount: allInsights.length,
    byPriority: {
      critical: allInsights.filter(i => i.priority === 'critical').length,
      high:     allInsights.filter(i => i.priority === 'high').length,
      medium:   allInsights.filter(i => i.priority === 'medium').length,
      low:      allInsights.filter(i => i.priority === 'low').length,
    },
    byCategory: {
      risk:        allInsights.filter(i => i.category === 'risk').length,
      performance: allInsights.filter(i => i.category === 'performance').length,
      opportunity: allInsights.filter(i => i.category === 'opportunity').length,
      operational: allInsights.filter(i => i.category === 'operational').length,
      people:      allInsights.filter(i => i.category === 'people').length,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ── Question answering ────────────────────────────────────────────────────────

export function answerQuestion(question, profile, health, insightResult) {
  const lower = question.toLowerCase();
  const insights = insightResult?.insights ?? [];

  // "Which teams are progressing fastest?"
  if (/team.*progress|progress.*team|fastest.*team|best.*team/i.test(lower)) {
    const sorted = [...(profile.teams ?? [])]
      .filter(t => t.avgDevelopmentScore != null)
      .sort((a, b) => b.avgDevelopmentScore - a.avgDevelopmentScore);
    return {
      question,
      answer: sorted.length
        ? `Fastest progressing: ${sorted[0].name ?? sorted[0].ageGroup} (${sorted[0].avgDevelopmentScore}/100, trend: ${sorted[0].trend})`
        : 'Insufficient team data',
      evidence: sorted.map(t => `${t.name ?? t.ageGroup}: ${t.avgDevelopmentScore}/100 (${t.trend})`),
      relatedInsights: insights.filter(i => i.category === 'performance'),
    };
  }

  // "Which players are at injury risk?"
  if (/injur|risk|hurt|physio/i.test(lower)) {
    const risky = [...(profile.players ?? [])]
      .filter(p => p.activeInjury || (p.injuryRiskScore ?? 0) >= 35)
      .sort((a, b) => (b.injuryRiskScore ?? 0) - (a.injuryRiskScore ?? 0));
    return {
      question,
      answer: risky.length
        ? `${risky.length} player(s) flagged: ${risky.map(p => `${p.name} (risk: ${p.injuryRiskScore ?? '?'}/100${p.activeInjury ? ', ACTIVE INJURY' : ''})`).join(', ')}`
        : 'No players at elevated injury risk',
      evidence: risky.map(p => `${p.name}: ${p.injuryRiskScore ?? '?'}/100 risk${p.activeInjury ? ' — active injury' : ''}`),
      relatedInsights: insights.filter(i => i.category === 'risk' && /injur/i.test(i.title)),
    };
  }

  // "Which coaches need support?"
  if (/coach.*support|support.*coach/i.test(lower)) {
    const needsHelp = (profile.coaches ?? []).filter(c => c.supportNeeded);
    return {
      question,
      answer: needsHelp.length
        ? `${needsHelp.length} coach(es) need support: ${needsHelp.map(c => `${c.name} (score: ${c.supportScore})`).join(', ')}`
        : 'No coaches currently flagged for support',
      evidence: needsHelp.flatMap(c => c.supportReasons),
      relatedInsights: insights.filter(i => i.category === 'people'),
    };
  }

  // "Which players are likely to leave?"
  if (/leave|leav|churn|dropout|drop.out|retention/i.test(lower)) {
    const atRisk = (profile.players ?? []).filter(p => p.retentionRisk === 'high');
    return {
      question,
      answer: atRisk.length
        ? `${atRisk.length} player(s) at high retention risk: ${atRisk.map(p => p.name).join(', ')}`
        : 'No players at high retention risk',
      evidence: atRisk.map(p => `${p.name}: ${p.attendanceRate ?? '?'}% att, ${p.developmentTrend} trend`),
      relatedInsights: insights.filter(i => /retention|leave/i.test(i.title)),
    };
  }

  // "What should the DoR focus on this week?" / "biggest risks"
  if (/focus|dor|director|this week|priority|priorities|biggest risk/i.test(lower)) {
    const topInsights = insights.slice(0, 5);
    return {
      question,
      answer: topInsights.length
        ? `Top priorities: ${topInsights.map(i => i.title).join(' | ')}`
        : 'No critical priorities detected',
      evidence: topInsights.map(i => i.why?.slice(0, 100)),
      relatedInsights: topInsights,
    };
  }

  // "Which age groups are growing / largest?"
  if (/age.*group|which.*group|group.*grow|u\d{1,2}.*grow/i.test(lower)) {
    const groups = Object.entries(profile.ageGroups ?? {})
      .sort((a, b) => b[1].count - a[1].count);
    return {
      question,
      answer: groups.length
        ? `Age groups by size: ${groups.map(([ag, d]) => `${ag}: ${d.count} player${d.count !== 1 ? 's' : ''}`).join(', ')}`
        : 'No age group data available',
      evidence: groups.map(([ag, d]) => `${ag}: ${d.count} players, avg dev ${d.avgDev ?? 'n/a'}/100`),
      relatedInsights: insights.filter(i => /age|group|squad/i.test(i.title)),
    };
  }

  // "What are the biggest opportunities?"
  if (/opportunit|potential|leverage/i.test(lower)) {
    const ops = insights.filter(i => i.category === 'opportunity');
    return {
      question,
      answer: ops.length
        ? `Top opportunities: ${ops.map(i => i.title).join(' | ')}`
        : 'No specific opportunities detected — add more player data for richer analysis',
      evidence: ops.map(i => i.description),
      relatedInsights: ops,
    };
  }

  // Generic fallback
  return {
    question,
    answer: `Club health: ${health.overallScore ?? 'n/a'}/100. ${health.summary}`,
    evidence: health.dimensions.filter(d => d.score != null).map(d => `${d.dimension}: ${d.score}/100`),
    relatedInsights: insights.slice(0, 3),
  };
}
