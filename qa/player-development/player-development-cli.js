#!/usr/bin/env node
/**
 * Player Development Intelligence Engine — CLI test
 * Uses Ciarán Murphy from memory-engine (or fixture data if memory unavailable).
 * Produces PLAYER_DEVELOPMENT_ENGINE_REPORT.md
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath }  from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '../..');

// ── Fixture player (mirrors memory-engine test entity) ───────────────────────

const FIXTURE_PLAYER = {
  id: 'player_ciar_n_murphy_0shhe5u',
  core: {
    name:       'Ciarán Murphy',
    age:        17,
    ageGroup:   'U18',
    position:   'Prop',
    experience: 'Intermediate',
  },
  club: { name: 'Kildare Valley RFC' },
  goals: [
    { goal: 'Strength' },
    { goal: 'Mass' },
    { goal: 'Scrummaging Power' },
  ],
  injuries: [
    { type: 'shoulder', status: 'cleared', clearedDate: '2025-12-01', description: 'Right shoulder strain, cleared for full contact' },
  ],
  attendance: {
    rate:     2 / 3,
    sessions: [{ attended: true }, { attended: true }, { attended: false }],
  },
};

const FIXTURE_PROGRAMMES = [
  {
    id:          'prog_ciar_preseason_001',
    playerId:    'player_ciar_n_murphy_0shhe5u',
    status:      'completed',
    requestType: 'programme',
    startDate:   '2025-09-01',
    input: {
      seasonPhase: 'preseason',
      goals:       ['Strength', 'Mass'],
      position:    'Prop',
    },
    coachFeedback: 'Good progress on strength work, showing real improvement in lower body power. Needs to improve attendance consistency.',
  },
  {
    id:          'prog_ciar_early_season_001',
    playerId:    'player_ciar_n_murphy_0shhe5u',
    status:      'active',
    requestType: 'programme',
    startDate:   '2025-10-15',
    input: {
      seasonPhase: 'early-season',
      goals:       ['Strength', 'Scrummaging Power'],
      position:    'Prop',
    },
    coachFeedback: null,
  },
];

// ── Load engine ───────────────────────────────────────────────────────────────

async function loadEngine() {
  const { analysePlayer, generateDevelopmentReport, predictNextPhase, comparePlayers } =
    await import('./index.js');
  return { analysePlayer, generateDevelopmentReport, predictNextPhase, comparePlayers };
}

// ── Try to get player from memory engine ─────────────────────────────────────

async function resolvePlayer() {
  try {
    const mem = await import('../../memory-engine/index.js');
    const memPlayer = await mem.getPlayer({ name: 'Ciarán Murphy' });
    if (memPlayer?.core?.name) {
      console.log('  [memory] Found Ciarán Murphy in Memory Engine');
      const progs = await mem.getAllProgrammes?.({ playerId: memPlayer.id }) ?? [];
      return { player: memPlayer, programmes: progs.length ? progs : FIXTURE_PROGRAMMES };
    }
  } catch {
    // ignore — use fixture
  }
  console.log('  [fixture] Memory Engine not available, using fixture data');
  return { player: FIXTURE_PLAYER, programmes: FIXTURE_PROGRAMMES };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Coach\'s Eye — Player Development Intelligence Engine ===\n');

  const engine = await loadEngine();
  const { player, programmes } = await resolvePlayer();

  console.log(`\nAnalysing: ${player.core?.name ?? 'Unknown'} (${player.core?.position}, ${player.core?.ageGroup})`);
  console.log(`Programmes on record: ${programmes.length}`);

  // 1. Full single-player analysis
  console.log('\n[1/4] Running full player analysis...');
  const analysis = await engine.analysePlayer(player, { programmes, memoryOff: true });

  console.log(`  Development Score: ${analysis.developmentSummary?.score ?? 'n/a'}/100 (${analysis.developmentSummary?.grade ?? '?'})`);
  console.log(`  Readiness Score:   ${analysis.analyses?.readiness?.score ?? 'n/a'}/100`);
  console.log(`  Injury Risk:       ${analysis.analyses?.injuryRisk?.score ?? 'n/a'}/100`);
  console.log(`  Recommendations:   ${analysis.recommendations?.length ?? 0} generated`);

  if (analysis.recommendations?.length) {
    console.log('\n  Top recommendations:');
    analysis.recommendations.slice(0, 3).forEach((r, i) => {
      console.log(`    ${i + 1}. [${r.priority.toUpperCase()}] ${r.action}`);
    });
  }

  // 2. Projection
  console.log('\n[2/4] Running trajectory projection...');
  const projection = await engine.predictNextPhase(player, programmes);
  console.log(`  Trajectory: ${projection.trajectoryNarrative?.slice(0, 100)}...`);
  if (projection.projections?.weeks8) {
    console.log(`  In 8 weeks:  ${projection.projections.weeks8.score ?? '?'}/100 (${projection.projections.weeks8.grade ?? '?'})`);
  }
  if (projection.blockers?.length) {
    console.log(`  Blockers:    ${projection.blockers.map(b => b.blocker).join(', ')}`);
  }

  // 3. Comparison (Ciarán vs a hypothetical teammate)
  console.log('\n[3/4] Running player comparison (2 players)...');
  const teammate = {
    id: 'player_fixture_teammate_001',
    core: { name: 'Fixture Teammate', age: 16, ageGroup: 'U18', position: 'Hooker', experience: 'Beginner' },
    club: { name: 'Kildare Valley RFC' },
    goals: [{ goal: 'Strength' }],
    injuries: [],
    attendance: { rate: 0.90 },
  };
  const teammateProgrammes = [
    {
      id: 'prog_teammate_001',
      playerId: 'player_fixture_teammate_001',
      status:   'active',
      input:    { seasonPhase: 'early-season', goals: ['Strength'], position: 'Hooker' },
      coachFeedback: 'Excellent work ethic, making great progress',
    },
  ];
  const comparison = await engine.comparePlayers(
    [player, teammate],
    { [player.id]: programmes, [teammate.id]: teammateProgrammes }
  );
  console.log('  Comparison table:');
  comparison.comparison.forEach(c => {
    console.log(`    ${c.name}: Dev ${c.developmentScore ?? 'n/a'}/100 (${c.developmentGrade ?? '?'}), Att ${c.attendanceRate ?? '?'}%`);
  });

  // 4. Full Markdown report
  console.log('\n[4/4] Generating Markdown development report...');
  const markdownReport = await engine.generateDevelopmentReport(player, programmes, { memoryOff: true });

  // ── Write PLAYER_DEVELOPMENT_ENGINE_REPORT.md ────────────────────────────

  const engineReport = buildEngineReport(analysis, projection, comparison, markdownReport);
  const outPath = join(ROOT, 'PLAYER_DEVELOPMENT_ENGINE_REPORT.md');
  writeFileSync(outPath, engineReport, 'utf8');
  console.log(`\nReport written: ${outPath}`);

  // ── Print JSON summary ────────────────────────────────────────────────────

  const jsonSummary = {
    playerName:        player.core?.name,
    developmentScore:  analysis.developmentSummary?.score,
    developmentGrade:  analysis.developmentSummary?.grade,
    readinessScore:    analysis.analyses?.readiness?.score,
    injuryRiskScore:   analysis.analyses?.injuryRisk?.score,
    attendanceRate:    Math.round((player.attendance?.rate ?? 0) * 100),
    recommendationCount: analysis.recommendations?.length,
    topRecommendation:   analysis.recommendations?.[0]?.action ?? null,
    projectedScore8w:    projection?.projections?.weeks8?.score ?? null,
    trajectory:          projection?.trajectoryNarrative?.slice(0, 120) ?? null,
  };

  console.log('\n=== JSON Summary ===');
  console.log(JSON.stringify(jsonSummary, null, 2));
  console.log('\n=== Complete ===\n');
}

// ── Engine report builder ─────────────────────────────────────────────────────

function buildEngineReport(analysis, projection, comparison, playerMarkdown) {
  const now = new Date().toISOString().split('T')[0];

  return `# Player Development Intelligence Engine — Architecture Report

*Generated: ${now}*

---

## What Is This?

The **Player Development Intelligence Engine** analyses historical Memory Engine data and calculates structured development metrics for every player. It does NOT store data — that is the Memory Engine's job. It detects progress and explains WHY every recommendation was made.

---

## Architecture

\`\`\`
Memory Engine
     │
     ▼
qa/player-development/
├── index.js                  ← Public API (analysePlayer, analyseTeam, comparePlayers, generateDevelopmentReport, predictNextPhase)
├── progress-engine.js        ← Orchestrator — runs all modules in order
│
├── attendance-analysis.js    ← Attendance trends + shared helpers (gradeFromScore, confidenceFromDataPoints, trendDirection)
├── injury-risk.js            ← Position-specific risk calculation (0-100 risk score)
├── strength-progress.js      ← Strength development trends from programme history
├── speed-progress.js         ← Speed / conditioning trends
├── readiness-score.js        ← Training readiness + programme compliance + coach feedback
├── development-summary.js    ← Composite development score + promotion readiness
│
├── recommendation-engine.js  ← Rules-based WHY-explained recommendations
├── projection-engine.js      ← Trajectory prediction (4/8/12 week projections)
└── player-report.js          ← Markdown report generator
\`\`\`

---

## Modules

### 1. attendance-analysis.js
Analyses attendance rate and trend. Contains shared utility functions used by all other modules:
- \`gradeFromScore(score)\` — A+ to F grade
- \`confidenceFromDataPoints(n, agedays)\` — high/medium/low/none
- \`trendDirection(values)\` — improving/stable/declining/insufficient-data

### 2. injury-risk.js
Position-specific injury risk scoring (0-100). Higher score = more risk.
- Props carry highest base risk (18-20 points) due to scrum demands
- Tracks: active injuries, recent clearances, recurrence patterns, youth age factors

### 3. strength-progress.js / speed-progress.js
Analyses programme history for strength/conditioning goals. Scores improvement by:
- Phase progression (preseason → early-season → mid-season is positive)
- Programme completion rate
- Coach feedback sentiment

### 4. readiness-score.js
Composite readiness (is the player ready for the next training challenge?):
- Injury status: 35%
- Attendance: 30%
- Programme compliance: 20%
- Experience level: 15%

Also provides: \`analyseProgrammeCompliance()\`, \`analyseCoachFeedback()\`

### 5. development-summary.js
Composite development score weighted across all dimensions:
- Attendance: 25%
- Programme compliance: 20%
- Injury-free (inverted risk): 20%
- Strength progress: 15%
- Speed progress: 10%
- Coach feedback: 10%

Also provides: \`assessPromotionReadiness()\` — checks age boundaries and promotion criteria.

### 6. recommendation-engine.js
Rules-based engine. Every recommendation includes:
- \`type\` — category (rehab-plan, programme, prehab, attendance-intervention, etc.)
- \`priority\` — critical / high / medium / low
- \`action\` — what to do
- \`why\` — the specific evidence-based reason
- \`suggestedInput\` — pre-filled coaching engine input (where applicable)
- \`tags\` — for filtering

### 7. projection-engine.js
Predicts development trajectory:
- Weekly delta estimated from trend + confidence
- Projections at 4, 8, 12 weeks
- Time to next grade
- Blockers and accelerators identified

### 8. player-report.js
Generates Markdown or JSON reports. Markdown includes:
- Score bars with visual representation
- Dimension table
- Recommendation list with priority icons
- Projection section with blockers/accelerators

---

## Data Flow

\`\`\`
analysePlayer(playerInput)
  → resolvePlayerData()      ← Memory Engine lookup
  → resolvePlayerProgrammes() ← Memory Engine lookup
  → runPlayerAnalysis()
      → analyseAttendance()
      → analyseInjuryRisk()
      → analyseStrengthProgress()
      → analyseSpeedProgress()
      → analyseProgrammeCompliance()
      → analyseCoachFeedback()
      → analyseReadiness()
      → buildDevelopmentSummary()
      → assessPromotionReadiness()
      → generateRecommendations()
      → predictNextPhase()
  → return { analyses, recommendations, projection, promotionReadiness }
\`\`\`

---

## Standard Analysis Result Shape

Every module returns the same shape:

\`\`\`json
{
  "score":      0-100,
  "grade":      "A+|A|B+|B|C+|C|D|F",
  "trend":      "improving|stable|declining|insufficient-data",
  "confidence": "high|medium|low|none",
  "reasons":    ["Why this score was calculated"],
  "flags":      [{ "level": "critical|warning|info", "message": "..." }],
  "rawData":    {}
}
\`\`\`

---

## Live Test Results (Ciarán Murphy, U18 Prop, Kildare Valley RFC)

${buildTestResults(analysis, projection, comparison)}

---

## Future Integrations

### 1. Player Dashboard (Coach's Eye App)
The engine JSON output maps directly to player profile UI components:
- \`developmentSummary.score\` → headline score widget
- \`analyses.injuryRisk\` → injury risk indicator
- \`recommendations\` → coach action list
- \`projection.projections\` → trend chart data points

### 2. Coach Notifications
\`recommendations\` with \`priority: 'critical'\` can trigger push notifications to coaches (via existing notification infrastructure in api/).

### 3. Team Intelligence Dashboard
\`analyseTeam()\` provides per-team averages, top/bottom performers, and critical flags. Ready for a Mission Control panel.

### 4. Automated Weekly Reports
The engine can be called from the nightly cron job (api/cron.js) to generate weekly development summaries for each player and push to coaches.

### 5. Vector Search (Future Memory Enhancement)
The memory engine architecture is designed to support vector embeddings. When implemented, \`getRelevantContext()\` will use semantic search to find similar players and past programmes — enabling the engine to benchmark a player against comparable athletes.

### 6. Provincial / National Benchmarking
Development scores can be normalised against provincial benchmarks (IRFU age-group standards) once integrated with external data sources.

---

## How This Powers Player Dashboards

1. Nightly cron runs \`analysePlayer()\` for every active player
2. Results stored in memory-engine's AI generations store
3. App API exposes \`GET /api/player/:id/development\` returning cached JSON
4. Dashboard components consume: score, grade, trend, topRecommendation
5. Coach action list driven by \`recommendations\` array (sorted by priority)
6. Charts driven by \`projection.projections\` (4/8/12 week data points)

---

*Report generated by Coach's Eye Player Development Intelligence Engine*
`;
}

function buildTestResults(analysis, projection, comparison) {
  const a = analysis?.analyses ?? {};
  const dev = analysis?.developmentSummary;
  const recs = analysis?.recommendations ?? [];

  let out = '';
  out += `### Development Score\n`;
  out += `- **Score:** ${dev?.score ?? 'n/a'}/100 — Grade: **${dev?.grade ?? '?'}**\n`;
  out += `- **Trend:** ${dev?.trend ?? 'n/a'} | **Confidence:** ${dev?.confidence ?? 'n/a'}\n`;
  out += `- **Data completeness:** ${dev?.rawData?.dataCompleteness ?? '?'}%\n\n`;

  out += `### Dimension Breakdown\n`;
  out += `| Dimension | Score | Grade | Confidence |\n`;
  out += `|-----------|-------|-------|------------|\n`;
  const dims = [
    ['Attendance',          a.attendance],
    ['Injury Risk',         a.injuryRisk],
    ['Strength Progress',   a.strengthProgress],
    ['Speed Progress',      a.speedProgress],
    ['Programme Compliance',a.programmeCompliance],
    ['Coach Feedback',      a.coachFeedback],
    ['Readiness',           a.readiness],
  ];
  for (const [label, dim] of dims) {
    if (dim) out += `| ${label} | ${dim.score ?? 'n/a'}/100 | ${dim.grade ?? 'n/a'} | ${dim.confidence ?? 'n/a'} |\n`;
  }
  out += '\n';

  out += `### Top Recommendations\n`;
  recs.slice(0, 5).forEach((r, i) => {
    out += `${i + 1}. **[${r.priority.toUpperCase()}]** ${r.action}\n`;
    out += `   > **Why:** ${r.why.slice(0, 180)}${r.why.length > 180 ? '...' : ''}\n\n`;
  });

  out += `### Trajectory Projection\n`;
  out += `> ${projection?.trajectoryNarrative ?? 'n/a'}\n\n`;
  if (projection?.projections) {
    out += `| Timeframe | Projected Score | Grade |\n`;
    out += `|-----------|----------------|-------|\n`;
    for (const [key, p] of Object.entries(projection.projections)) {
      out += `| +${key.replace('weeks', '')} weeks | ${p.score ?? 'n/a'}/100 | ${p.grade ?? '?'} |\n`;
    }
    out += '\n';
  }

  if (projection?.blockers?.length) {
    out += `### Blockers\n`;
    projection.blockers.forEach(b => out += `- 🔴 ${b.blocker} — ${b.clearableBy}\n`);
    out += '\n';
  }

  if (projection?.accelerators?.length) {
    out += `### Accelerators\n`;
    projection.accelerators.slice(0, 3).forEach(a => out += `- ✓ ${a.accelerator} — ${a.reason.slice(0, 100)}\n`);
    out += '\n';
  }

  if (comparison?.comparison) {
    out += `### Player Comparison\n`;
    out += `| Player | Position | Dev Score | Attendance | Trajectory |\n`;
    out += `|--------|----------|-----------|------------|------------|\n`;
    comparison.comparison.forEach(c => {
      out += `| ${c.name} | ${c.position ?? '?'} | ${c.developmentScore ?? 'n/a'}/100 (${c.developmentGrade ?? '?'}) | ${c.attendanceRate ?? '?'}% | ${(c.trajectory ?? '').slice(0, 60)} |\n`;
    });
  }

  return out;
}

main().catch(err => {
  console.error('CLI error:', err);
  process.exit(1);
});
