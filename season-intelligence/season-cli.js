#!/usr/bin/env node
/**
 * Season Intelligence CLI
 *
 * Usage:
 *   node season-intelligence/season-cli.js
 *   node season-intelligence/season-cli.js --phase
 *   node season-intelligence/season-cli.js --health
 *   node season-intelligence/season-cli.js --predict
 *   node season-intelligence/season-cli.js --simulate
 *   node season-intelligence/season-cli.js --all
 */

import { detectCurrentPhase, getPhaseMeta, getSeasonLabel, getSeasonWeek,
         getPhaseProgress, daysUntilNextPhase, getUpcomingPhases } from './season-phases.js';
import { getPrescription }                                           from './phase-prescriptions.js';
import { buildClubHealthScore }                                      from './club-health-score.js';
import { generateAllPredictions }                                    from './predictive-models.js';
import { runSimulation, getGapSummary }                              from './season-simulation.js';

const args = process.argv.slice(2);
const mode = args[0] ?? '--all';

const R = '\x1b[0m';
const B = '\x1b[1m';
const RED = '\x1b[31m';
const YLW = '\x1b[33m';
const GRN = '\x1b[32m';
const CYN = '\x1b[36m';
const DIM = '\x1b[2m';
const MAG = '\x1b[35m';

function col(v, good = 80, mid = 65) {
  return v >= good ? GRN : v >= mid ? YLW : RED;
}

function bar(val, max = 100, width = 24) {
  const filled = Math.round((val / max) * width);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
}

function gapSevCol(sev) {
  return sev === 'HIGH' ? RED : sev === 'MEDIUM' ? YLW : sev === 'LOW' ? CYN : GRN;
}

const MOCK_TEAMS = [
  { id: 't1', name: 'U16 Red',   playerCount: 22, attendance: { rate: 62, trend: -8 }, injuries: 3, availability: 17, squadContinuity: 68 },
  { id: 't2', name: 'U14 Blue',  playerCount: 20, attendance: { rate: 71, trend: -4 }, injuries: 1, availability: 18, squadContinuity: 74 },
  { id: 't3', name: 'U12 White', playerCount: 18, attendance: { rate: 79, trend:  2 }, injuries: 0, availability: 18, squadContinuity: 82 },
];

const MOCK_OBS = {
  attendance:     { averageRate: 68, decliningTeams: [{ id: 't1', name: 'U16 Red', rate: 62, trend: -8 }], weeklyTrend: 'declining' },
  injuries:       { total: 4, byPosition: { 'Front Row': 3, 'Winger': 1 }, criticalPositions: [{ pos: 'Front Row', count: 3 }], shortTermCount: 2, longTermCount: 1 },
  fixtures:       { upcomingCount: 3, within48h: [], within7d: [{ id: 'f1', teamName: 'U16 Red', opponent: 'Rathcoole RFC', daysToKickoff: 4 }] },
  volunteers:     { openRoles: 3, totalVolunteers: 12 },
  memberships:    { total: 145, expiringThisWeek: 5, renewalRate: 0.82 },
  workload:       { overloadedPlayers: [{ id: 'p1', name: 'Ciarán Murphy', sessionCount: 5, riskLevel: 'HIGH' }], averageSessionsPerWeek: 2.8 },
  approvals:      { pending: 4, overdue: 2 },
  communications: { lastNewsletterDays: 18, unreadMessages: 7 },
  finance:        { overdueInvoices: 1, lowBalance: false },
  twinStatus:     { playerCount: 60, healthScore: 72 },
};

async function main() {
  console.log(`\n${B}═══════════════════════════════════════════════════════${R}`);
  console.log(`${B}  Coach's Eye — Season Intelligence Engine${R}`);
  console.log(`${DIM}  ${new Date().toLocaleString()}${R}`);
  console.log(`${B}═══════════════════════════════════════════════════════${R}\n`);

  const phase    = detectCurrentPhase();
  const meta     = getPhaseMeta(phase);
  const progress = getPhaseProgress();
  const daysLeft = daysUntilNextPhase();
  const week     = getSeasonWeek();

  if (mode === '--phase' || mode === '--all') {
    console.log(`${B}SEASON${R}  ${getSeasonLabel()}  ·  Week ${week}  ·  ${meta.icon} ${meta.label}`);
    console.log(`${DIM}  ${meta.description}${R}`);
    console.log(`  Progress: ${CYN}${bar(progress, 100, 20)} ${progress}%${R}  · ${daysLeft}d until next phase\n`);

    const presc = getPrescription(phase);
    console.log(`${B}PHASE PRESCRIPTION — ${meta.label}${R}`);
    console.log(`  Intensity target: ${presc.intensity.target}%  (max ${presc.intensity.max}%)`);
    console.log(`  Sessions/week:    ${presc.workload.sessionsPerWeek.target} (min ${presc.workload.sessionsPerWeek.min}, max ${presc.workload.sessionsPerWeek.max})`);
    console.log(`  Attendance target:${presc.attendanceExpectation.target}% (min ${presc.attendanceExpectation.minimum}%)`);
    console.log(`  Squad rotation:   ${presc.squadRotation.policy}`);
    console.log(`  Injury tolerance: ${presc.injuryTolerance}`);
    console.log(`\n  ${B}Training emphasis:${R}`);
    presc.trainingEmphasis.forEach(e => console.log(`    • ${e}`));
    console.log(`\n  ${B}Development priorities:${R}`);
    presc.playerDevelopment.slice(0, 3).forEach(e => console.log(`    • ${e}`));
    console.log();

    const upcoming = getUpcomingPhases(new Date(), 2);
    console.log(`${B}UPCOMING PHASES${R}`);
    upcoming.forEach(p => console.log(`  ${p.icon} ${p.label}  ${DIM}${p.priority}${R}`));
    console.log();
  }

  const clubHealth = buildClubHealthScore(MOCK_TEAMS, MOCK_OBS);

  if (mode === '--health' || mode === '--all') {
    const h = clubHealth;
    console.log(`${B}CLUB HEALTH SCORE${R}`);
    console.log(`  Overall: ${col(h.overall)}${B}${h.overall}/100  ${h.grade}${R}  (${h.status})  ${h.trend === 'improving' ? GRN : h.trend === 'declining' ? RED : YLW}${h.trend}${R}`);
    console.log(`  ${col(h.overall)}${bar(h.overall)}${R}\n`);

    console.log(`  ${DIM}Club dimensions:${R}`);
    for (const [key, dim] of Object.entries(h.clubDimensions)) {
      const s = dim.score;
      console.log(`    ${key.padEnd(18)} ${col(s)}${bar(s, 100, 16)} ${String(s).padStart(3)}${R}  ${DIM}${dim.label}${R}`);
    }

    console.log(`\n  ${B}Teams:${R}`);
    for (const t of h.teamSummary.teams ?? []) {
      console.log(`    ${t.teamName.padEnd(14)} ${col(t.overall)}${bar(t.overall, 100, 16)} ${String(t.overall).padStart(3)} ${t.grade}${R}`);
    }

    if (h.notes.length > 0) {
      console.log(`\n  ${B}Notes:${R}`);
      h.notes.slice(0, 4).forEach(n => console.log(`    ${YLW}⚠${R}  ${n}`));
    }
    console.log();
  }

  if (mode === '--predict' || mode === '--all') {
    const predictions = generateAllPredictions(MOCK_OBS, clubHealth);
    console.log(`${B}PREDICTIVE MODELS (${predictions.length})${R}\n`);

    for (const p of predictions) {
      const c = p.confidence >= 75 ? GRN : p.confidence >= 55 ? YLW : DIM;
      console.log(`  ${MAG}[${p.type.replace(/_/g,' ').padEnd(22)}]${R} ${B}${p.title}${R}`);
      console.log(`  ${c}  → ${p.prediction}${R}`);
      console.log(`  ${DIM}  Confidence: ${p.confidence}%  ·  Timeframe: ${p.timeframe}${R}`);
      if (p.interventions?.length > 0) {
        console.log(`  ${DIM}  Interventions: ${p.interventions.slice(0,2).map(i=>i.action).join(' · ')}${R}`);
      }
      console.log();
    }
  }

  if (mode === '--simulate' || mode === '--all') {
    const clubHealthForSim = clubHealth?.teamSummary?.teams?.[0];
    const sim  = runSimulation(MOCK_OBS, clubHealthForSim);
    const gaps = getGapSummary(sim);

    const statusCol = sim.overallStatus === 'ON_TRACK' ? GRN : sim.overallStatus === 'SLIGHTLY_BEHIND' ? YLW : RED;
    console.log(`${B}SEASON SIMULATION — ${sim.phaseLabel}${R}`);
    console.log(`  Status: ${statusCol}${B}${sim.overallStatus.replace(/_/g,' ')}${R}  (gap: ${sim.overallGap} pts)`);
    console.log(`  ${DIM}${sim.summary}${R}\n`);

    console.log(`  ${DIM}${'Metric'.padEnd(18)} ${'Current'.padStart(8)} ${'Expected'.padStart(9)} ${'Ideal'.padStart(6)} ${'Gap'.padStart(5)} Severity${R}`);
    for (const g of gaps) {
      const gc = gapSevCol(g.severity);
      console.log(`  ${g.label.padEnd(18)} ${col(g.current)}${String(g.current).padStart(8)}${R} ${String(g.expected).padStart(9)} ${String(sim.ideal[g.metric] ?? '—').padStart(6)} ${gc}${String(g.gap).padStart(5)} ${g.severity}${R}`);
    }
    console.log();

    if (sim.interventions.length > 0) {
      console.log(`  ${B}Recommended interventions:${R}`);
      sim.interventions.slice(0, 5).forEach(i => {
        const ic = i.priority === 'HIGH' ? RED : i.priority === 'MEDIUM' ? YLW : DIM;
        console.log(`    ${ic}[${i.priority}]${R} ${i.action}  ${DIM}(${i.metricLabel})${R}`);
      });
    }
    console.log();
  }

  console.log(`${DIM}Run with --phase | --health | --predict | --simulate | --all${R}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
