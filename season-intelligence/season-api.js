/**
 * Season Intelligence API — port 3005
 *
 * GET  /status                  → engine status
 * GET  /phase                   → current phase + metadata
 * GET  /phase/prescription      → coaching targets for current phase
 * GET  /phases                  → full season phase calendar
 * GET  /health/team/:teamId     → team health score
 * GET  /health/club             → aggregate club health score
 * GET  /predictions             → all active predictions
 * GET  /simulation              → current vs expected vs ideal (8-week window)
 * GET  /season                  → full season overview
 * POST /snapshot                → save a manual snapshot
 * GET  /trend                   → health trend from saved snapshots
 */

import express from 'express';
import { detectCurrentPhase, getPhaseMeta, getSeasonLabel, getSeasonWeek,
         getPhaseProgress, getUpcomingPhases, getAllPhases, daysUntilNextPhase } from './season-phases.js';
import { getPrescription }                               from './phase-prescriptions.js';
import { buildClubHealthScore }                          from './club-health-score.js';
import { buildTeamHealthScore }                          from './team-health-score.js';
import { generateAllPredictions }                        from './predictive-models.js';
import { runSimulation, getGapSummary }                  from './season-simulation.js';
import { saveSnapshot, loadLatestSnapshot, getHealthTrend } from './season-store.js';

const app = express();
app.use(express.json());
app.use((_, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ── Mock data (used when Digital Twin unavailable) ─────────────────────────────

const MOCK_TEAMS = [
  { id: 't1', name: 'U16 Red',   playerCount: 22, attendance: { rate: 62, trend: -8 }, injuries: 3, availability: 17, squadContinuity: 68 },
  { id: 't2', name: 'U14 Blue',  playerCount: 20, attendance: { rate: 71, trend: -4 }, injuries: 1, availability: 18, squadContinuity: 74 },
  { id: 't3', name: 'U12 White', playerCount: 18, attendance: { rate: 79, trend:  2 }, injuries: 0, availability: 18, squadContinuity: 82 },
];

const MOCK_OBS = {
  attendance:     { averageRate: 68, decliningTeams: [{ id: 't1', name: 'U16 Red', rate: 62, trend: -8 }], weeklyTrend: 'declining' },
  injuries:       { total: 4, byPosition: { 'Front Row': 3, 'Winger': 1 }, criticalPositions: [{ pos: 'Front Row', count: 3 }], shortTermCount: 2, longTermCount: 1 },
  fixtures:       { upcomingCount: 3, within48h: [], within7d: [{ id: 'f1', teamName: 'U16 Red', opponent: 'Rathcoole RFC', daysToKickoff: 4 }], next: { id: 'f1', opponent: 'Rathcoole RFC', daysToKickoff: 4 } },
  volunteers:     { openRoles: 3, totalVolunteers: 12, criticalGaps: [] },
  memberships:    { total: 145, expiringThisWeek: 5, renewalRate: 0.82 },
  workload:       { overloadedPlayers: [{ id: 'p1', name: 'Ciarán Murphy', sessionCount: 5, riskLevel: 'HIGH' }], averageSessionsPerWeek: 2.8 },
  approvals:      { pending: 4, overdue: 2 },
  communications: { lastNewsletterDays: 18, unreadMessages: 7 },
  finance:        { overdueInvoices: 1, lowBalance: false },
  twinStatus:     { playerCount: 60, healthScore: 72 },
};

function wrap(fn) {
  return async (req, res) => {
    try { res.json({ ok: true, ...(await fn(req, res)) }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  };
}

// ── Routes ─────────────────────────────────────────────────────────────────────

app.get('/status', wrap(async () => ({
  engine:   'Season Intelligence',
  season:   getSeasonLabel(),
  week:     getSeasonWeek(),
  phase:    detectCurrentPhase(),
  ts:       new Date().toISOString(),
})));

app.get('/phase', wrap(async () => {
  const phase    = detectCurrentPhase();
  const meta     = getPhaseMeta(phase);
  const progress = getPhaseProgress();
  const daysLeft = daysUntilNextPhase();
  const upcoming = getUpcomingPhases(new Date(), 3);
  return { phase, ...meta, progress, daysLeft, upcoming };
}));

app.get('/phase/prescription', wrap(async () => {
  const phase = detectCurrentPhase();
  return { phase, prescription: getPrescription(phase) };
}));

app.get('/phases', wrap(async () => ({
  phases: getAllPhases(),
  current: detectCurrentPhase(),
  season: getSeasonLabel(),
})));

app.get('/health/team/:teamId', wrap(async (req) => {
  const team  = MOCK_TEAMS.find(t => t.id === req.params.teamId) ?? MOCK_TEAMS[0];
  const score = buildTeamHealthScore(team, MOCK_OBS);
  return { score };
}));

app.get('/health/club', wrap(async () => {
  const score = buildClubHealthScore(MOCK_TEAMS, MOCK_OBS);
  return { score };
}));

app.get('/predictions', wrap(async () => {
  const clubHealth  = buildClubHealthScore(MOCK_TEAMS, MOCK_OBS);
  const predictions = generateAllPredictions(MOCK_OBS, clubHealth);
  return { predictions, count: predictions.length };
}));

app.get('/simulation', wrap(async () => {
  const clubHealth = buildClubHealthScore(MOCK_TEAMS, MOCK_OBS);
  const sim        = runSimulation(MOCK_OBS, clubHealth?.teamSummary?.teams?.[0]);
  const gaps       = getGapSummary(sim);
  return { simulation: sim, gaps };
}));

app.get('/season', wrap(async () => {
  const phase      = detectCurrentPhase();
  const phaseMeta  = getPhaseMeta(phase);
  const prescription = getPrescription(phase);
  const clubHealth = buildClubHealthScore(MOCK_TEAMS, MOCK_OBS);
  const clubHealthTeam = clubHealth?.teamSummary?.teams?.[0];
  const predictions = generateAllPredictions(MOCK_OBS, clubHealth);
  const simulation = runSimulation(MOCK_OBS, clubHealthTeam);
  return {
    season:  getSeasonLabel(),
    week:    getSeasonWeek(),
    phase,   phaseMeta, prescription,
    health:  clubHealth,
    predictions: predictions.slice(0, 5),
    simulation:  { status: simulation.overallStatus, summary: simulation.summary, gaps: getGapSummary(simulation) },
    upcomingPhases: getUpcomingPhases(new Date(), 2),
  };
}));

app.post('/snapshot', wrap(async (req) => {
  const clubHealth = buildClubHealthScore(MOCK_TEAMS, MOCK_OBS);
  const simulation = runSimulation(MOCK_OBS, clubHealth?.teamSummary?.teams?.[0]);
  const snapshot   = { phase: detectCurrentPhase(), clubHealth, simulation, ...req.body };
  saveSnapshot(snapshot);
  return { saved: true, ts: new Date().toISOString() };
}));

app.get('/trend', wrap(async () => ({
  trend: getHealthTrend(12),
})));

const PORT = process.env.SEASON_PORT ?? 3005;
app.listen(PORT, () => {
  console.log(`Season Intelligence API running on http://localhost:${PORT}`);
});

export default app;
