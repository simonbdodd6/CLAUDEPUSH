/**
 * Memory Engine Adapter
 * Provides context from long-term memory for any intent.
 * Always runs alongside other engines to enrich their context.
 */

import { registerTool } from '../tool-registry.js';

let _mem = null;
async function mem() {
  if (!_mem) {
    try { _mem = await import('../../memory-engine/index.js'); }
    catch { _mem = null; }
  }
  return _mem;
}

registerTool({
  name:        'memory-engine',
  version:     '1.0.0',
  description: 'Retrieves long-term player, team, and coaching history from memory',
  capabilities: ['session_summary', 'player_progress', 'squad_analysis', 'injury_risk', 'player_compare', '*'],
  priority:    100,  // always runs first

  async execute(intent, context, options = {}) {
    const m = await mem();
    if (!m) {
      return {
        success:  false,
        error:    'Memory Engine not available',
        data:     null,
        summary:  'No memory available',
        evidence: [],
      };
    }

    const evidence = [];
    const data     = {};

    if (intent === 'session_summary') {
      try {
        const players = await m.getAllPlayers();
        const teams   = await m.getAllTeams();
        data.players  = players;
        data.teams    = teams;
        data.playerCount = players.length;
        data.teamCount   = teams.length;

        if (players.length) {
          evidence.push(`${players.length} player(s) in memory`);
          const withProgrammes = players.filter(p => p.programmes?.length > 0);
          if (withProgrammes.length) evidence.push(`${withProgrammes.length} player(s) have programme history`);
        }

        return {
          success:  true,
          data,
          summary:  `Memory context: ${players.length} players, ${teams.length} teams`,
          evidence,
        };
      } catch (err) {
        return { success: false, error: err.message, data: null, summary: '', evidence: [] };
      }
    }

    if (intent === 'player_progress') {
      const player = context.player;
      if (!player) {
        return {
          success:  false,
          error:    'No player resolved — specify a player name',
          data:     null,
          summary:  'Could not find player in memory',
          evidence: [],
        };
      }
      evidence.push(`Player: ${player.core?.name} (${player.core?.position ?? '?'})`);
      if (player.attendance?.rate) evidence.push(`Attendance: ${Math.round(player.attendance.rate * 100)}%`);
      const injuries = (player.injuries ?? []).filter(i => i.status === 'active');
      if (injuries.length) evidence.push(`Active injuries: ${injuries.map(i => i.type).join(', ')}`);

      return {
        success:  true,
        data:     { player },
        summary:  `Memory retrieved for ${player.core?.name}`,
        evidence,
      };
    }

    if (intent === 'injury_risk' || intent === 'squad_analysis' || intent === 'player_compare') {
      try {
        const players = context.allPlayers?.length ? context.allPlayers : await m.getAllPlayers();
        data.players  = players;
        evidence.push(`${players.length} player(s) analysed`);

        const withInjuries = players.filter(p => (p.injuries ?? []).some(i => i.status === 'active'));
        if (withInjuries.length) evidence.push(`${withInjuries.length} player(s) have active injuries`);

        return {
          success:  true,
          data,
          summary:  `Squad data loaded: ${players.length} players`,
          evidence,
        };
      } catch (err) {
        return { success: false, error: err.message, data: null, summary: '', evidence: [] };
      }
    }

    // Generic: return memory context
    const memCtx = context.memoryContext;
    if (memCtx?.hasHistory) {
      evidence.push('Prior history available in memory');
      if (memCtx.contextSummary) evidence.push(memCtx.contextSummary.slice(0, 120));
    }

    return {
      success:  true,
      data:     { memoryContext: memCtx },
      summary:  memCtx?.hasHistory ? 'Prior context found in memory' : 'No prior memory for this context',
      evidence,
    };
  },
});
