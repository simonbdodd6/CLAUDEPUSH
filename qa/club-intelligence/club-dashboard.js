/**
 * Club Dashboard
 * Generates the Director of Rugby dashboard — Markdown and JSON formats.
 * Professional executive-level report. No rugby jargon unexplained.
 */

import { gradeFromScore } from './club-health.js';

// ── Formatting helpers ────────────────────────────────────────────────────────

function pct(n) { return n != null ? `${n}%` : 'n/a'; }
function score(n) { return n != null ? `${n}/100` : 'n/a'; }
function na(n) { return n != null ? String(n) : 'n/a'; }

function ragEmoji(r) {
  return { green: '🟢', amber: '🟡', red: '🔴', grey: '⚫' }[r] ?? '⚫';
}

function priorityBadge(p) {
  return { critical: '🔴 CRITICAL', high: '🟠 HIGH', medium: '🟡 MEDIUM', low: '🔵 LOW' }[p] ?? p;
}

function bar(score, width = 20) {
  if (score == null) return '░'.repeat(width) + ' n/a';
  const filled = Math.round((score / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled) + ` ${score}/100`;
}

function tableRow(...cells) {
  return `| ${cells.join(' | ')} |`;
}

function tableSep(...widths) {
  return `| ${widths.map(w => '-'.repeat(w)).join(' | ')} |`;
}

// ── Section builders ──────────────────────────────────────────────────────────

function buildHeader(profile, health, date) {
  const club = profile.club?.name ?? 'Club';
  const grade = gradeFromScore(health.overallScore);
  let md = '';
  md += `# Director of Rugby Weekly Intelligence Brief\n`;
  md += `## ${club}\n\n`;
  md += `**Date:** ${date}  |  **Club Health:** ${score(health.overallScore)} (${grade ?? '?'}) ${ragEmoji(health.rag)}  |  **Trend:** ${health.trend}\n\n`;

  if (health.criticalFlags?.length) {
    md += `> ⚠️ **${health.criticalFlags.length} CRITICAL ALERT(S):** ${health.criticalFlags.map(f => f.message).join(' · ')}\n\n`;
  }
  md += `---\n\n`;
  return md;
}

function buildHealthSummary(health) {
  let md = `## Club Health Score\n\n`;
  md += `\`${bar(health.overallScore)}\` — ${health.summary}\n\n`;

  md += tableRow('Dimension', 'Score', 'Grade', 'Status', 'Key Finding');
  md += '\n' + tableSep(24, 8, 5, 6, 40) + '\n';

  for (const d of health.dimensions) {
    const finding = d.reasons[0]?.slice(0, 60) ?? '';
    md += tableRow(d.dimension, score(d.score), d.grade ?? 'n/a', ragEmoji(d.rag), finding) + '\n';
  }
  md += '\n';
  return md;
}

function buildTeamPerformance(teams) {
  if (!teams.length) return `## Team Performance\n\n*No teams in system.*\n\n`;

  let md = `## Team Performance\n\n`;
  md += tableRow('Team', 'Players', 'Dev Score', 'Attendance', 'Trend', 'Injuries', 'Churn Risk');
  md += '\n' + tableSep(14, 7, 9, 10, 10, 8, 10) + '\n';

  const sorted = [...teams].sort((a, b) => (b.avgDevelopmentScore ?? 0) - (a.avgDevelopmentScore ?? 0));
  for (const t of sorted) {
    const trendEmoji = t.trend === 'improving' ? '↑' : t.trend === 'declining' ? '↓' : '→';
    md += tableRow(
      t.name ?? t.ageGroup,
      na(t.playerCount),
      score(t.avgDevelopmentScore),
      pct(t.avgAttendance),
      `${trendEmoji} ${t.trend}`,
      na(t.activeInjuries),
      t.retentionRisk > 0 ? `${t.retentionRisk} HIGH` : '✓ Low',
    ) + '\n';
  }
  md += '\n';
  return md;
}

function buildPlayerAlerts(players) {
  const critical = players.filter(p => p.activeInjury || p.retentionRisk === 'high' || (p.injuryRiskScore ?? 0) >= 60);
  if (!critical.length) return `## Player Alerts\n\n✅ No critical player alerts.\n\n`;

  let md = `## Player Alerts\n\n`;
  for (const p of critical) {
    const alerts = [];
    if (p.activeInjury) alerts.push(`🔴 Active injury (${p.injuryTypes.join(', ')})`);
    if (p.retentionRisk === 'high') alerts.push(`🟠 High churn risk`);
    if ((p.injuryRiskScore ?? 0) >= 60 && !p.activeInjury) alerts.push(`🟡 Injury risk ${p.injuryRiskScore}/100`);

    md += `**${p.name ?? 'Unknown'}** (${p.position ?? '?'}, ${p.ageGroup ?? '?'}) — ${alerts.join(' · ')}\n`;
    if (p.attendanceRate != null) md += `  Attendance: ${pct(p.attendanceRate)} · Dev: ${score(p.developmentScore)} (${p.developmentTrend})\n`;
    if (p.topRecommendation) md += `  → ${p.topRecommendation}\n`;
    md += '\n';
  }
  return md;
}

function buildCoachPanel(coaches) {
  if (!coaches.length) return `## Coach Panel\n\n*No coaches in system.*\n\n`;

  let md = `## Coach Panel\n\n`;
  for (const c of coaches) {
    const status = c.supportNeeded ? '🟠 Needs support' : '🟢 Active';
    md += `**${c.name ?? 'Unknown Coach'}** — ${status}`;
    md += `  |  Age groups: ${c.ageGroupsFocus.join(', ')}  |  Players: ${c.playerCount}  |  AI uses: ${c.aiGenerations}\n`;
    if (c.supportNeeded && c.supportReasons.length) {
      for (const r of c.supportReasons.slice(0, 3)) md += `  - ${r}\n`;
    }
    md += '\n';
  }
  return md;
}

function buildThisWeekPriorities(recs) {
  const priorities = recs.thisWeekPriorities ?? [];
  if (!priorities.length) return `## This Week's Priorities\n\n✅ No critical actions required.\n\n`;

  let md = `## This Week's Priorities\n\n`;
  priorities.forEach((r, i) => {
    md += `### ${i + 1}. ${priorityBadge(r.priority)} — ${r.area}\n\n`;
    md += `**Action:** ${r.action}\n\n`;
    md += `**Why:** ${r.why}\n\n`;
    if (r.who.length) md += `**Who:** ${r.who.join(', ')}\n\n`;
    md += `**Timeframe:** ${r.timeframe}  |  **Effort:** ${r.effort}\n\n`;
  });
  return md;
}

function buildInsights(insightResult) {
  const insights = insightResult?.insights ?? [];
  if (!insights.length) return `## Key Insights\n\n*Add more player and team data to generate insights.*\n\n`;

  let md = `## Key Insights\n\n`;

  const critical = insights.filter(i => i.priority === 'critical' || i.priority === 'high');
  const opps     = insights.filter(i => i.category === 'opportunity');

  if (critical.length) {
    md += `### Risks & Issues\n\n`;
    for (const ins of critical.slice(0, 5)) {
      md += `- **${ins.title}** — ${ins.description.slice(0, 100)}\n`;
    }
    md += '\n';
  }

  if (opps.length) {
    md += `### Opportunities\n\n`;
    for (const ins of opps.slice(0, 3)) {
      md += `- **${ins.title}** — ${ins.description.slice(0, 100)}\n`;
    }
    md += '\n';
  }

  return md;
}

function buildRiskRegister(profile, health, insightResult) {
  const risks = (insightResult?.insights ?? []).filter(i => i.category === 'risk');
  const healthFlags = [...(health.criticalFlags ?? []), ...(health.warnings ?? [])];

  if (!risks.length && !healthFlags.length) {
    return `## Risk Register\n\n✅ No significant risks at this time.\n\n`;
  }

  let md = `## Risk Register\n\n`;
  md += tableRow('Risk', 'Priority', 'Category', 'Key Fact');
  md += '\n' + tableSep(40, 10, 12, 50) + '\n';

  for (const r of risks) {
    md += tableRow(r.title.slice(0, 38), r.priority, r.category, r.why.slice(0, 48)) + '\n';
  }
  for (const f of healthFlags.slice(0, 5)) {
    md += tableRow(f.message.slice(0, 38), f.level, 'health', '') + '\n';
  }
  md += '\n';
  return md;
}

function buildDataStatus(profile) {
  const dc = profile.dataCompleteness ?? {};
  const stubs = [
    ['Fixtures & Results', !dc.fixtures, 'Connect Fixture Engine'],
    ['Finance & Membership', !dc.finance, 'Connect Finance Engine'],
    ['Volunteer Activity', !dc.volunteers, 'Connect Volunteer Engine'],
    ['Communication Metrics', !dc.communication, 'Connect Communication Engine'],
  ];

  let md = `## Data Status\n\n`;
  const connected = [
    ['Player Data',  dc.players,  profile.summary?.totalPlayers ?? 0],
    ['Team Data',    dc.teams,    profile.summary?.totalTeams ?? 0],
    ['Coach Data',   dc.coaches,  profile.summary?.totalCoaches ?? 0],
  ];

  for (const [name, ok, count] of connected) {
    md += `- ${ok ? '✅' : '⚫'} **${name}**: ${ok ? `${count} records` : 'not connected'}\n`;
  }
  for (const [name, missing, note] of stubs) {
    md += `- ⚫ **${name}**: *${note}*\n`;
  }
  md += '\n';
  return md;
}

// ── Main dashboard builder ────────────────────────────────────────────────────

export function buildDashboard(profile, health, insightResult, recommendations, options = {}) {
  const date   = options.date ?? new Date().toISOString().split('T')[0];
  const format = options.format ?? 'markdown';

  if (format === 'json') {
    return {
      generatedAt: new Date().toISOString(),
      date,
      club:            profile.club,
      health:          { score: health.overallScore, grade: health.overallGrade, rag: health.rag, trend: health.trend },
      summary:         profile.summary,
      teams:           profile.teams,
      players:         profile.players,
      coaches:         profile.coaches,
      insights:        insightResult,
      recommendations: recommendations,
      ageGroups:       profile.ageGroups,
    };
  }

  // Markdown dashboard
  let md = '';
  md += buildHeader(profile, health, date);
  md += buildHealthSummary(health);
  md += buildThisWeekPriorities(recommendations);
  md += buildTeamPerformance(profile.teams ?? []);
  md += buildPlayerAlerts(profile.players ?? []);
  md += buildCoachPanel(profile.coaches ?? []);
  md += buildInsights(insightResult);
  md += buildRiskRegister(profile, health, insightResult);
  md += buildDataStatus(profile);
  md += `---\n\n*Generated by Coach's Eye Club Intelligence Engine · ${new Date().toISOString()}*\n`;

  return md;
}
