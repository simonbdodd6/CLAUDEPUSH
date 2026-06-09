#!/usr/bin/env node
// Coach's Eye Executive Dashboard — Mission Control CLI
// npm run dashboard:mission-control

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('\n════════════════════════════════════════════════════════════');
console.log("  COACH'S EYE — EXECUTIVE DASHBOARD & APPROVAL CENTRE");
console.log('════════════════════════════════════════════════════════════\n');

// ─── Imports ──────────────────────────────────────────────────────────────

const { buildExecutiveBriefing, formatExecutiveBriefing } = await import('./executive/executive-briefing.js');
const { buildTodayAgenda, formatTodayAgenda }             = await import('./today/today-agenda.js');
const { ask: copilotAsk, EXAMPLE_PROMPTS }                = await import('./widgets/global-copilot.js');
const { stats: approvalStats, getPending }                = await import('./approval-centre/approval-queue.js');

// ─── Section helpers ───────────────────────────────────────────────────────

function hr(title = '') {
  const line = '─'.repeat(56);
  if (title) {
    const pad = Math.max(0, Math.floor((56 - title.length - 2) / 2));
    console.log('\n' + '─'.repeat(pad) + ' ' + title + ' ' + '─'.repeat(56 - pad - title.length - 2));
  } else {
    console.log('\n' + line);
  }
}

// ─── 1. Executive Briefing ────────────────────────────────────────────────

hr('1. EXECUTIVE BRIEFING');
console.log('Building full dashboard (seeding demo approvals)...\n');

let eb;
try {
  eb = await buildExecutiveBriefing('coach', {
    seedApprovals: true,
    clubName: "Coach's Eye Club",
    coachName: 'Supervisor',
  });

  console.log(formatExecutiveBriefing(eb));
} catch (err) {
  console.error('Executive Briefing error:', err.message);
  eb = null;
}

// ─── 2. Today's Agenda ────────────────────────────────────────────────────

hr('2. TODAY\'S AGENDA');
try {
  const agenda = await buildTodayAgenda('coach', { clubName: "Coach's Eye Club" });
  console.log(formatTodayAgenda(agenda));
} catch (err) {
  console.error('Agenda error:', err.message);
}

// ─── 3. Approval Queue Summary ────────────────────────────────────────────

hr('3. APPROVAL QUEUE');
try {
  const qStats = approvalStats();
  const pending = getPending();

  console.log(`Total items: ${qStats.total}`);
  console.log(`Pending: ${qStats.pending} | Approved: ${qStats.approved} | Rejected: ${qStats.rejected}`);
  console.log('');

  if (pending.length > 0) {
    console.log('Pending approvals:');
    pending.slice(0, 8).forEach((item, i) => {
      const risk  = item.riskLevel === 'high' ? '🔴' : item.riskLevel === 'medium' ? '🟡' : '🟢';
      console.log(`  ${i + 1}. ${risk} [${item.type ?? 'unknown'}] ${item.title ?? '—'} (${item.generatedBy ?? 'system'})`);
    });
    if (pending.length > 8) console.log(`  ... and ${pending.length - 8} more`);
  } else {
    console.log('No pending approvals.');
  }

  if (qStats.byRisk) {
    console.log(`\nBy risk: High=${qStats.byRisk.high ?? 0} · Medium=${qStats.byRisk.medium ?? 0} · Low=${qStats.byRisk.low ?? 0}`);
  }
} catch (err) {
  console.error('Approval queue error:', err.message);
}

// ─── 4. Global Copilot Demo ───────────────────────────────────────────────

hr('4. GLOBAL COPILOT — Sample Queries');
console.log('Running sample copilot queries...\n');

const demoQueries = [
  "What should I focus on today?",
  "How healthy is the club?",
];

for (const query of demoQueries) {
  console.log(`\nQuery: "${query}"`);
  try {
    const res = await copilotAsk(query, { role: 'coach' });
    console.log(`Response: ${res.summary}`);
    if (res.tools?.length > 0) console.log(`Tools used: ${res.tools.join(', ')}`);
  } catch (err) {
    console.log(`(Copilot error: ${err.message})`);
  }
}

console.log(`\nAll ${EXAMPLE_PROMPTS.length} example prompts available in production UI.`);

// ─── 5. Summary Stats ─────────────────────────────────────────────────────

hr('5. DASHBOARD SUMMARY');
if (eb?.summary) {
  const s = eb.summary;
  console.log(`Club Health:        ${s.healthScore ?? '—'}/100 (Grade ${s.healthGrade ?? '—'})`);
  console.log(`Total Tasks:        ${s.totalTasks} (${s.criticalTasks} critical)`);
  console.log(`Pending Approvals:  ${s.pendingApprovals}`);
  console.log(`Top Recommendations:${s.topRecommendations}`);
  console.log(`Recent Activity:    ${s.recentActivity} events`);
  console.log(`Headline:           "${s.headline}"`);
  console.log(`Mock Data:          ${eb.isMock ? 'Yes (connect real engines for live data)' : 'No'}`);
}

// ─── 6. Generate MISSION_CONTROL_REPORT.md ────────────────────────────────

hr('6. GENERATING MISSION_CONTROL_REPORT.md');

const REPORT_PATH = join(__dirname, '..', 'MISSION_CONTROL_REPORT.md');
const report = buildMissionControlReport(eb);
writeFileSync(REPORT_PATH, report, 'utf8');
console.log(`Report written to: MISSION_CONTROL_REPORT.md`);

hr();
console.log("\nCoach's Eye Executive Dashboard — Mission Control loaded successfully.\n");
console.log('Run "npm run dashboard:mission-control" to regenerate.\n');

// ─── Report Generator ─────────────────────────────────────────────────────

function buildMissionControlReport(data) {
  const generated = new Date().toISOString();
  const s = data?.summary ?? {};

  return `# Coach's Eye — Executive Dashboard & Approval Centre
## Mission Control Report

**Generated:** ${generated}

---

## Overview

The Executive Dashboard is the production interface connecting every Coach's Eye engine into a single, unified command centre. It answers the question: **"What do I need to know right now?"**

---

## Architecture

\`\`\`
dashboard/
├── index.js                        ← Public API: buildDashboard(role, options)
├── adapters/                        ← Thin adapters over each engine (no logic)
│   ├── memory-adapter.js            ← Memory Engine: players, teams, injuries, sessions
│   ├── club-intel-adapter.js        ← Club Intelligence: health, recommendations, insights
│   ├── comms-adapter.js             ← Communications Engine: drafts, schedule, approvals
│   ├── workflow-adapter.js          ← Workflow Engine: pending workflows, run history
│   └── data-adapter.js             ← Data Integration: membership, sponsors, volunteers
├── approval-centre/                 ← Human-in-the-loop approval layer
│   ├── approval-queue.js            ← Enqueue / approve / reject / archive / JSONL log
│   ├── approval-card.js             ← ApprovalCard shape + factory functions
│   └── approval-router.js          ← Route engine outputs → ApprovalCards
├── widgets/                         ← Individual dashboard widgets
│   ├── morning-briefing.js          ← "What do I need to know today?"
│   ├── club-health.js               ← Health score, trend, risks, ASCII bar
│   ├── todays-tasks.js              ← All actionable items, prioritised
│   ├── activity-feed.js             ← Live events from all engines
│   ├── recommendations.js           ← AI recommendations with evidence
│   └── global-copilot.js           ← Persistent AI assistant (wraps ai-copilot)
├── executive/
│   └── executive-briefing.js        ← Full dashboard: all widgets combined
└── today/
    └── today-agenda.js              ← Chronological agenda for today + tomorrow
\`\`\`

---

## Widgets

| Widget | Source | Description |
|---|---|---|
| Good Morning Briefing | All adapters | Headline + prioritised items by urgency |
| Club Health | Club Intelligence | Score/grade/trend/risks + ASCII bar |
| Today's Tasks | All engines | Every actionable item, sorted by priority |
| Approval Centre | approval-queue.js | Pending comms/workflows/AI suggestions |
| Live Activity Feed | Comms + Workflow + Approvals | Chronological events from all engines |
| AI Recommendations | Club Intelligence + data | Ranked recs with why/benefit/confidence/evidence |
| Global Copilot | AI Copilot engine | Natural language queries from anywhere in dashboard |
| Today's Agenda | Memory + Workflow + Approvals | Chronological schedule for today + tomorrow |

---

## Approval Centre

Every AI-generated output requires human sign-off before going anywhere.

### ApprovalCard Shape

\`\`\`json
{
  "approvalId":     "uuid",
  "type":           "training_session | weekly_newsletter | sponsor_update | ...",
  "title":          "Human-readable title",
  "generatedBy":    "engine name",
  "confidence":     85,
  "evidence":       ["evidence point 1", "evidence point 2"],
  "preview":        "markdown preview of the content",
  "riskLevel":      "low | medium | high",
  "requiresRole":   "coach | manager | admin",
  "status":         "pending | approved | rejected | archived",
  "editedContent":  null,
  "approvedBy":     null,
  "rejectedBy":     null,
  "rejectionReason": null,
  "createdAt":      "ISO timestamp",
  "reviewedAt":     null
}
\`\`\`

### Risk Levels

| Level | Meaning | Examples |
|---|---|---|
| 🟢 Low | Internal, low-stakes | Training session plans, session reminders |
| 🟡 Medium | Squad-wide, visible | Newsletters, volunteer requests |
| 🔴 High | External/mass/financial | Sponsor updates, press releases, financial comms |

### Routing

Outputs from every engine are automatically routed to the approval queue:

- **Communications Engine** → \`routeCommsDraft()\` / \`routeCommsPack()\`
- **Workflow Engine** → \`routeWorkflowResult()\`
- **AI Copilot** → \`routeCopilotSuggestion()\`
- **Generic / Custom** → \`routeGeneric()\`

---

## Global Copilot — Example Prompts

${EXAMPLE_PROMPTS.map(p => `- "${p}"`).join('\n')}

---

## Dashboard Summary (latest run)

| Metric | Value |
|---|---|
| Club Health Score | ${s.healthScore ?? '—'}/100 (${s.healthGrade ?? '—'}) |
| Total Tasks | ${s.totalTasks ?? '—'} (${s.criticalTasks ?? '—'} critical) |
| Pending Approvals | ${s.pendingApprovals ?? '—'} |
| AI Recommendations | ${s.topRecommendations ?? '—'} |
| Recent Activity Events | ${s.recentActivity ?? '—'} |
| Dashboard Headline | "${s.headline ?? '—'}" |

---

## Integration Points

| Engine | Adapter | Data |
|---|---|---|
| Memory Engine | memory-adapter.js | Players, injuries, sessions, fixtures |
| Club Intelligence | club-intel-adapter.js | Health score, recommendations, insights |
| Communications Engine | comms-adapter.js | Drafts, schedule, approval summary |
| Workflow Engine | workflow-adapter.js | Pending workflows, run history |
| Data Integration | data-adapter.js | Membership, sponsors, volunteers |
| AI Copilot | global-copilot.js | Natural language queries |
| Approval Queue | approval-queue.js | All pending human approvals |

---

## npm Script

\`\`\`bash
npm run dashboard:mission-control
\`\`\`

---

## Design Principles

1. **No duplicated logic** — adapters read from engines; widgets read from adapters. Zero business logic in the dashboard layer.
2. **Human in the loop** — every AI-generated output enters the approval queue before going anywhere.
3. **Parallel data fetch** — all widget data fetched with \`Promise.all\`, sub-second regardless of engine count.
4. **Graceful degradation** — missing engines return \`isMock: true\`, never crash the dashboard.
5. **Role-aware** — all widgets accept a \`role\` parameter and respect engine-level RBAC.

---

*Report generated by Coach's Eye Mission Control v1.0.0*
`;
}
