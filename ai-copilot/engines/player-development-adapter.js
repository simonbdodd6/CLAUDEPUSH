/**
 * Player Development Engine Adapter
 * Registers player progress, squad analysis, injury risk, and player comparison.
 */

import { registerTool } from '../tool-registry.js';

let _engine = null;
async function engine() {
  if (!_engine) {
    try { _engine = await import('../../qa/player-development/index.js'); }
    catch { _engine = null; }
  }
  return _engine;
}

registerTool({
  name:        'player-development',
  version:     '1.0.0',
  description: 'Analyses player progress, development scores, injury risk, and team comparisons',
  capabilities: ['player_progress', 'squad_analysis', 'injury_risk', 'player_compare'],
  priority:    85,

  async execute(intent, context, options = {}) {
    const e = await engine();
    if (!e) {
      return {
        success:  false,
        error:    'Player Development Engine not available',
        data:     null,
        summary:  '',
        evidence: [],
      };
    }

    // ── Single player progress ────────────────────────────────────────────────
    if (intent === 'player_progress') {
      const player = context.player;
      if (!player) {
        return {
          success:  false,
          error:    'No player resolved — specify a player name',
          data:     null,
          summary:  'Player not found in memory',
          evidence: [],
        };
      }

      try {
        const analysis = await e.analysePlayer(player, { memoryOff: true });
        const devScore = analysis.developmentSummary?.score;
        const grade    = analysis.developmentSummary?.grade;
        const topRec   = analysis.recommendations?.[0];

        return {
          success:  true,
          data:     analysis,
          summary:  `${player.core?.name}: Development score ${devScore ?? 'n/a'}/100 (${grade ?? '?'}) — ${analysis.developmentSummary?.trend ?? 'stable'} trajectory`,
          evidence: [
            devScore != null ? `Development score: ${devScore}/100 (${grade})` : null,
            analysis.analyses?.attendance?.score != null ? `Attendance: ${analysis.analyses.attendance.score}/100` : null,
            analysis.analyses?.injuryRisk?.score != null ? `Injury risk: ${analysis.analyses.injuryRisk.score}/100` : null,
            topRec ? `Top recommendation: ${topRec.action}` : null,
          ].filter(Boolean),
        };
      } catch (err) {
        return { success: false, error: err.message, data: null, summary: '', evidence: [] };
      }
    }

    // ── Squad analysis ────────────────────────────────────────────────────────
    if (intent === 'squad_analysis') {
      const players = context.allPlayers ?? [];
      if (!players.length) {
        return {
          success:  true,
          data:     { playerCount: 0, averageDevScore: null },
          summary:  'No players in memory — add players to enable squad analysis',
          evidence: ['No player data in Memory Engine'],
        };
      }

      try {
        const teamAnalysis = await e.analyseTeam(players, {});
        const weakestPlayers = [...(teamAnalysis.playerResults ?? [])]
          .sort((a, b) => (a.developmentSummary?.score ?? 100) - (b.developmentSummary?.score ?? 100))
          .slice(0, 3);

        return {
          success:  true,
          data:     teamAnalysis,
          summary:  `Squad: ${players.length} players, average dev score ${teamAnalysis.averageDevScore ?? 'n/a'}/100`,
          evidence: [
            `Players analysed: ${players.length}`,
            teamAnalysis.averageDevScore ? `Average development score: ${teamAnalysis.averageDevScore}/100` : null,
            teamAnalysis.topPlayer ? `Top performer: ${teamAnalysis.topPlayer.name} (${teamAnalysis.topPlayer.score}/100)` : null,
            weakestPlayers.length ? `Needs attention: ${weakestPlayers.map(r => r.player?.core?.name).filter(Boolean).join(', ')}` : null,
            teamAnalysis.criticalFlagCount ? `Critical flags: ${teamAnalysis.criticalFlagCount}` : null,
          ].filter(Boolean),
        };
      } catch (err) {
        return { success: false, error: err.message, data: null, summary: '', evidence: [] };
      }
    }

    // ── Injury risk ───────────────────────────────────────────────────────────
    if (intent === 'injury_risk') {
      const players = context.allPlayers ?? (context.player ? [context.player] : []);
      if (!players.length) {
        return {
          success:  true,
          data:     { highRisk: [], moderate: [] },
          summary:  'No player data available for injury risk assessment',
          evidence: [],
        };
      }

      try {
        const results = await Promise.all(
          players.map(async p => {
            const a = await e.analysePlayer(p, { memoryOff: true });
            return {
              name:         p.core?.name,
              position:     p.core?.position,
              injuryScore:  a.analyses?.injuryRisk?.score,
              injuryGrade:  a.analyses?.injuryRisk?.grade,
              reasons:      a.analyses?.injuryRisk?.reasons?.slice(0, 2),
              activeInjury: (p.injuries ?? []).some(i => i.status === 'active'),
            };
          })
        );
        results.sort((a, b) => (b.injuryScore ?? 0) - (a.injuryScore ?? 0));
        const highRisk = results.filter(r => (r.injuryScore ?? 0) >= 45);
        const withInjury = results.filter(r => r.activeInjury);

        return {
          success:  true,
          data:     { riskProfiles: results, highRisk, withActiveInjury: withInjury },
          summary:  `Injury risk: ${highRisk.length} high-risk players, ${withInjury.length} with active injuries`,
          evidence: [
            `${results.length} players assessed`,
            highRisk.length ? `High risk: ${highRisk.map(r => `${r.name} (${r.injuryScore}/100)`).join(', ')}` : 'No high-risk players',
            withInjury.length ? `Active injuries: ${withInjury.map(r => r.name).join(', ')}` : 'No active injuries',
          ],
        };
      } catch (err) {
        return { success: false, error: err.message, data: null, summary: '', evidence: [] };
      }
    }

    // ── Player comparison ─────────────────────────────────────────────────────
    if (intent === 'player_compare') {
      const players = context.allPlayers?.slice(0, 5) ?? [];
      const position = context.entities?.position;
      const filtered = position ? players.filter(p => p.core?.position?.toLowerCase().includes(position.toLowerCase())) : players;
      const toCompare = filtered.slice(0, 4);

      if (toCompare.length < 2) {
        return {
          success:  true,
          data:     { comparison: toCompare },
          summary:  `Not enough players found for comparison (need ≥2, found ${toCompare.length})`,
          evidence: ['Add more players to Memory Engine to enable comparison'],
        };
      }

      try {
        const comparison = await e.comparePlayers(toCompare, {});
        return {
          success:  true,
          data:     comparison,
          summary:  `Compared ${toCompare.length} players — top: ${comparison.comparison[0]?.name ?? '?'} (${comparison.comparison[0]?.developmentScore ?? '?'}/100)`,
          evidence: comparison.comparison.map(c =>
            `${c.name}: ${c.developmentScore ?? 'n/a'}/100 (${c.developmentGrade ?? '?'}), Att ${c.attendanceRate ?? '?'}%`
          ),
        };
      } catch (err) {
        return { success: false, error: err.message, data: null, summary: '', evidence: [] };
      }
    }

    return { success: false, error: `Intent ${intent} not handled`, data: null, summary: '', evidence: [] };
  },
});
