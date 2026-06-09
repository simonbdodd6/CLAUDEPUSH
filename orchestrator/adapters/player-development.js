/**
 * Player Development Engine Adapter
 * Analyses players' development scores, injuries, and readiness.
 */

import { registerEngine } from '../engine-registry.js';

let _engine = null;
async function engine() {
  if (!_engine) { try { _engine = await import('../../qa/player-development/index.js'); } catch { _engine = null; } }
  return _engine;
}

registerEngine({
  name:           'player-development',
  version:        '1.0.0',
  description:    'Analyses player development scores, injury risk, readiness and progression',
  capabilities:   ['player_analysis', 'injury_check', 'development_review', 'team_analysis'],
  requiredInputs: [],
  optionalInputs: ['players', 'programmes'],
  outputs:        ['playerAnalysis', 'teamAnalysis', 'injuryRiskSummary'],
  priority:       75,
  alwaysRun:      false,

  async execute(ctx, opts) {
    const eng     = await engine();
    const players = ctx.players ?? [];

    if (!eng) return stub(players);
    if (players.length === 0) {
      return {
        success: true,
        data:    { _empty: true },
        contextWrites: { playerAnalysis: {}, teamAnalysis: {}, injuryRiskSummary: [] },
        summary:  'No players in context — development analysis skipped',
        evidence: ['No player data available for analysis'],
        warnings: ['Player Development: no players found on context bus'],
      };
    }

    try {
      const programmes = ctx.programmes ?? [];
      const analysis   = await eng.analyseTeam(players, {});

      // Extract injury risk players
      const injuryRisk = (analysis.players ?? [])
        .filter(p => {
          const ir = p.analysisResults?.injuryRisk;
          return ir?.score != null && ir.score < 70;
        })
        .map(p => ({
          name:       p.core?.name,
          riskScore:  p.analysisResults?.injuryRisk?.score,
          flags:      p.analysisResults?.injuryRisk?.flags ?? [],
        }));

      const avg = analysis.summary?.averageDevelopmentScore;

      return {
        success: true,
        data:    analysis,
        contextWrites: {
          playerAnalysis:    analysis,
          teamAnalysis:      analysis.summary ?? {},
          injuryRiskSummary: injuryRisk,
        },
        summary:  `Analysed ${players.length} players — avg dev score ${avg ?? 'n/a'}/100`,
        evidence: [
          `**Players analysed:** ${players.length}`,
          avg != null ? `**Avg development score:** ${avg}/100` : null,
          `**Injury risk flags:** ${injuryRisk.length}`,
          ...(injuryRisk.slice(0, 3).map(p => `⚠ ${p.name}: injury risk ${p.riskScore}/100`)),
        ].filter(Boolean),
        warnings: injuryRisk.length > 0
          ? [`${injuryRisk.length} player(s) flagged with elevated injury risk`]
          : [],
      };
    } catch (err) {
      return {
        success: false, data: null, contextWrites: {},
        summary: `Player Development error: ${err.message}`,
        evidence: [], warnings: [`Player Development: ${err.message}`],
        error: err.message,
      };
    }
  },
});

function stub(players) {
  return {
    success: true,
    data:    { _stub: true },
    contextWrites: {
      playerAnalysis:    { _stub: true, playerCount: players.length },
      teamAnalysis:      { _stub: true },
      injuryRiskSummary: [],
    },
    summary:  `Player Development Engine (stub) — ${players.length} players in context`,
    evidence: ['Player Development Engine not found — stub analysis returned'],
    warnings: ['Player Development Engine unavailable'],
  };
}
