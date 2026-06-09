#!/usr/bin/env node
/**
 * Club Intelligence Engine — CLI test
 * Generates a full DoR brief for Kildare Valley RFC using live memory data.
 * Produces CLUB_INTELLIGENCE_ENGINE_REPORT.md at project root.
 */

import { writeFileSync }    from 'fs';
import { join, dirname }    from 'path';
import { fileURLToPath }    from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '../..');

const DOC_QUESTIONS = [
  "Which teams are progressing fastest?",
  "Which players are at injury risk?",
  "Which coaches need support?",
  "Which age groups are growing?",
  "Which players are likely to leave?",
  "What should the Director of Rugby focus on this week?",
  "What are the biggest risks across the club?",
  "What are the biggest opportunities?",
];

function hr(char = '─', len = 60) { return char.repeat(len); }

async function main() {
  console.log('\n' + hr('═') + '\n  Coach\'s Eye Club Intelligence Engine — CLI Test\n' + hr('═') + '\n');

  const {
    generateClubReport,
    answerQuestion,
  } = await import('./index.js');

  // ── 1. Full report ─────────────────────────────────────────────────────────
  console.log('[1/4] Building full club report...');
  const report = await generateClubReport();

  const { profile, health, insights, recommendations } = report;

  console.log(`\n  Club:            ${profile.club?.name ?? 'Unknown'}`);
  console.log(`  Players:         ${profile.summary.totalPlayers}`);
  console.log(`  Teams:           ${profile.summary.totalTeams}`);
  console.log(`  Coaches:         ${profile.summary.totalCoaches}`);
  console.log(`  Build time:      ${report.buildTimeMs}ms`);
  console.log(`\n  Health Score:    ${health.overallScore ?? 'n/a'}/100 (${health.overallGrade ?? '?'}) — ${health.trend}`);
  console.log(`  Critical alerts: ${health.criticalFlags?.length ?? 0}`);
  console.log(`  Warnings:        ${health.warnings?.length ?? 0}`);
  console.log(`\n  Insights:        ${insights.totalCount} total`);
  console.log(`    Critical: ${insights.byPriority.critical}  High: ${insights.byPriority.high}  Medium: ${insights.byPriority.medium}  Low: ${insights.byPriority.low}`);
  console.log(`\n  Recommendations: ${recommendations.totalCount}`);
  console.log(`    Critical: ${recommendations.criticalCount}`);
  console.log(`    This-week priorities: ${recommendations.thisWeekPriorities?.length ?? 0}`);

  // ── 2. Health dimensions ───────────────────────────────────────────────────
  console.log('\n[2/4] Health dimension breakdown:');
  console.log(hr('─', 50));
  for (const d of health.dimensions) {
    const bar = d.score != null
      ? '█'.repeat(Math.round(d.score / 10)).padEnd(10, '░')
      : '░'.repeat(10);
    const score = d.score != null ? `${d.score}/100`.padStart(7) : '    n/a';
    console.log(`  ${bar} ${score}  ${d.dimension}`);
    if (d.flags?.length) console.log(`           ⚠ ${d.flags.map(f => f.message.slice(0, 60)).join(' · ')}`);
  }

  // ── 3. DoR Q&A ────────────────────────────────────────────────────────────
  console.log('\n[3/4] Director of Rugby Q&A:');
  console.log(hr('─', 50));
  const qaResults = [];
  for (const q of DOC_QUESTIONS) {
    const result = await answerQuestion(q);
    console.log(`\n  Q: ${q}`);
    console.log(`  A: ${result.answer.slice(0, 120)}`);
    qaResults.push(result);
  }

  // ── 4. Copilot integration check ──────────────────────────────────────────
  console.log('\n[4/4] Checking AI Copilot integration...');
  try {
    const { copilot } = await import('../../ai-copilot/index.js');
    const stats = copilot.registryStats();
    const hasClubEngine = stats.toolNames.includes('club-intelligence');
    console.log(`  Copilot engines: ${stats.totalTools} registered`);
    console.log(`  Club Intelligence registered: ${hasClubEngine ? '✓ YES' : '✗ NO'}`);

    // Fire a DoR-style prompt
    const { response } = await copilot.chat('What are the biggest risks across the club?');
    console.log(`  Test prompt result: ${response.summary?.slice(0, 80)}`);
    console.log(`  Engines used: ${response.metadata?.enginesUsed?.join(', ') ?? '?'}`);
  } catch (err) {
    console.log(`  Copilot check failed: ${err.message}`);
  }

  // ── Write report ──────────────────────────────────────────────────────────
  console.log('\n\nGenerating CLUB_INTELLIGENCE_ENGINE_REPORT.md...');
  const archReport = buildArchReport(report, qaResults);
  const outPath    = join(ROOT, 'CLUB_INTELLIGENCE_ENGINE_REPORT.md');
  writeFileSync(outPath, archReport, 'utf8');
  console.log(`Report: ${outPath}`);

  // Also write the live DoR dashboard
  const dashPath = join(ROOT, 'DOR_DASHBOARD.md');
  writeFileSync(dashPath, report.dashboard, 'utf8');
  console.log(`DoR Dashboard: ${dashPath}`);

  console.log('\n' + hr('═') + '\n  Done\n' + hr('═') + '\n');
}

// ── Architecture report builder ───────────────────────────────────────────────

function buildArchReport(report, qaResults) {
  const { profile, health, insights, recommendations } = report;
  const now = new Date().toISOString().split('T')[0];

  return `# Club Intelligence Engine — Architecture & Test Report

*Generated: ${now}*

---

## What Is This?

The **Club Intelligence Engine** is the highest-level AI engine in Coach's Eye.
It aggregates data from every other engine into a living club overview, answering
Director of Rugby level questions about players, teams, coaches, attendance,
injuries, retention, and strategic opportunities.

This is the engine the DoR brief will be generated from. Every recommendation
cites specific players, teams, or coaches with evidence.

---

## Architecture

\`\`\`
qa/club-intelligence/
├── index.js                    ← Public API
├── club-profile.js             ← Living club snapshot (aggregates all engines)
├── club-health.js              ← 7-dimension health scoring (0-100)
├── club-insights.js            ← Pattern detection + Q&A engine
├── club-recommendations.js     ← Priority-ordered DoR recommendations
├── club-dashboard.js           ← Director of Rugby dashboard (Markdown + JSON)
└── generate-club-report.js     ← Full pipeline runner

ai-copilot/engines/
└── club-intelligence-adapter.js ← Copilot plugin (auto-registered)
\`\`\`

### Data Flow

\`\`\`
Memory Engine ──────────────────────────┐
Player Development Engine ──────────────┤
                                        ▼
                               club-profile.js
                               (living snapshot)
                                        │
                            ┌───────────┴──────────┐
                            ▼                      ▼
                    club-health.js          club-insights.js
                    (health score)          (pattern detection)
                            │                      │
                            └───────────┬──────────┘
                                        ▼
                              club-recommendations.js
                              (DoR priorities)
                                        │
                                        ▼
                               club-dashboard.js
                               (DoR Markdown brief)
\`\`\`

### Future Engine Hooks (stubs in place)

| Engine | Hook Location | Data Added |
|--------|--------------|------------|
| Fixture Engine | club-profile.js \`loadStubFixtures()\` | Match schedule, results, win rate |
| Finance Engine | club-profile.js \`loadStubFinance()\` | Membership, sponsorship, merch |
| Volunteer Engine | club-profile.js \`loadStubVolunteers()\` | Volunteer activity, hours |
| Communication Engine | club-profile.js \`loadStubCommunication()\` | Push/email engagement |

---

## Health Score Dimensions

| Dimension | Weight | Scoring Logic |
|-----------|--------|---------------|
| Player Development | 20% | Avg dev score + trend adjustment |
| Attendance | 18% | Club avg attendance % → direct score |
| Injury Management | 18% | 90 - (active × 8) - (high-risk × 5) |
| Programme Activity | 15% | Active programme coverage % |
| Coach Activity | 12% | AI tool adoption + support flags |
| Membership & Retention | 10% | Retention risk distribution |
| Data Completeness | 7% | Connected data domains / total domains |

---

## Insight Categories

| Category | Examples |
|----------|---------|
| \`risk\` | Active injuries, retention risk, small age groups |
| \`performance\` | Fastest/slowest progressing teams |
| \`opportunity\` | AI under-utilisation, injury-free training window |
| \`operational\` | Programming gaps, age group imbalances |
| \`people\` | Coach support needs, volunteer gaps |

---

## Q&A Engine

Every question maps to structured evidence with related insights:

${qaResults.map(r => `### "${r.question}"

${r.answer}

${r.evidence?.length ? `**Evidence:** ${r.evidence.slice(0,3).join(' · ')}` : ''}

`).join('')}

---

## AI Copilot Integration

The Club Intelligence Engine registers with the Copilot at priority **95**
(above Player Development at 85, below Memory Engine at 100).

It handles: \`squad_analysis\`, \`weekly_plan\`, \`injury_risk\`, \`player_progress\`, \`session_summary\`

When a coach asks "What are the biggest risks across the club?" or
"What should I focus on this week?" — the Club Intelligence Engine fires first,
returning a full DoR brief with evidence from every engine.

---

## Live Test Results (${now})

### Club Profile
- Club: **${profile.club?.name ?? 'Unknown'}**
- Players: **${profile.summary.totalPlayers}**
- Teams: **${profile.summary.totalTeams}**
- Coaches: **${profile.summary.totalCoaches}**
- Average Development Score: **${profile.summary.avgDevelopmentScore ?? 'n/a'}/100**
- Average Attendance: **${profile.summary.avgAttendance ?? 'n/a'}%**
- Active Injuries: **${profile.summary.activeInjuries}**
- Build Time: **${report.buildTimeMs}ms**

### Health Score
- Overall: **${health.overallScore ?? 'n/a'}/100 (${health.overallGrade ?? '?'})** — ${health.trend}
- Critical flags: ${health.criticalFlags?.length ?? 0}
- Warnings: ${health.warnings?.length ?? 0}

| Dimension | Score | Grade |
|-----------|-------|-------|
${health.dimensions.map(d => `| ${d.dimension} | ${d.score ?? 'n/a'}/100 | ${d.grade ?? 'n/a'} |`).join('\n')}

### Insights Generated
${insights.totalCount} insights: ${insights.byPriority.critical} critical · ${insights.byPriority.high} high · ${insights.byPriority.medium} medium · ${insights.byPriority.low} low

${insights.insights.slice(0, 5).map(i => `**[${i.priority.toUpperCase()}] ${i.title}**
> ${i.description}
> *Why: ${i.why.slice(0, 150)}*

`).join('')}

### This Week's Priorities
${(recommendations.thisWeekPriorities ?? []).map((r, i) => `${i+1}. **[${r.priority.toUpperCase()}] ${r.area}** — ${r.action}`).join('\n')}

---

## Future Integrations

1. **Match Intelligence** — connect Fixture Engine for win/loss trends, player performance ratings from matches
2. **Financial Intelligence** — membership growth curves, sponsorship pipeline, merchandise sales correlation with team performance
3. **Volunteer Intelligence** — most active volunteers, burnout risk, succession planning
4. **Communication Intelligence** — push notification open rates by age group, optimal send times, churn prediction from communication patterns
5. **Predictive DoR Briefing** — auto-generate and send weekly DoR brief every Monday morning via cron job
6. **Club Benchmarking** — compare club health to provincial/national averages (requires external data partnership)

---

*Report generated by Coach's Eye Club Intelligence Engine*
`;
}

main().catch(err => {
  console.error('CLI error:', err);
  process.exit(1);
});
